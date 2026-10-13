// Bank simulator. In production the private key lives in the bank's HSM; here it is a file.
const express = require('express'), helmet = require('helmet'), nacl = require('tweetnacl'), crypto = require('crypto');
const R = require('./risk.js'), fs = require('fs'), path = require('path'), N = require('./public/npp.js');
const DATA = process.env.DATA_DIR || path.join(__dirname, 'data'); // point DATA_DIR at a persistent disk when hosting
fs.mkdirSync(DATA, { recursive: true });
const KEYF = path.join(DATA, 'signing.json'), TXF = path.join(DATA, 'txs.json'), BOARDF = path.join(DATA, 'board.json');
const load = (f, d) => { try { return JSON.parse(fs.readFileSync(f)); } catch { return d; } };
let key = load(KEYF, null);
if (!key) { const kp = nacl.sign.keyPair(); key = { kid: 'ZB-' + Date.now().toString(36), pub: N.b64u.to(kp.publicKey), sec: N.b64u.to(kp.secretKey) }; fs.writeFileSync(KEYF, JSON.stringify(key)); }
const txs = load(TXF, {}), save = () => fs.writeFileSync(TXF, JSON.stringify(txs));
const board = load(BOARDF, { merchants: {}, events: [] }), saveBoard = () => fs.writeFileSync(BOARDF, JSON.stringify(board));
const MERCHANTS = [{ id: 'M-LAGOS-001', name: 'Mama Put Kitchen' }, { id: 'M-LAGOS-002', name: 'Sangotedo Mart' }];
const nowS = () => Math.floor(Date.now() / 1000);

// Bank operator access for the dashboard (demo key; set OPERATOR_KEY in production) and a simple per-IP rate limit.
const OPKEY = process.env.OPERATOR_KEY || 'zenith-demo';
const op = (q, r, next) => q.get('x-operator-key') === OPKEY ? next() : r.status(401).json({ error: 'Operator key required' });
const hits = new Map();
const limit = max => (q, r, next) => {
  const k = q.ip + q.path, t = Date.now(), a = (hits.get(k) || []).filter(x => t - x < 60000);
  if (a.length >= max) return r.status(429).json({ error: 'Too many requests, slow down' });
  a.push(t); hits.set(k, a); next();
};

const app = express();
app.set('trust proxy', 1); // behind a host or tunnel, so rate limits see the real client address
app.use(helmet({ contentSecurityPolicy: { directives: { upgradeInsecureRequests: null } } })); // keep plain-http LAN use working
app.use(express.json({ limit: '1mb' }));
app.get('/api/merchants', (q, r) => r.json(MERCHANTS));
app.get('/api/pubkeys', (q, r) => r.json({ keys: { [key.kid]: key.pub } }));

// Customer channel (stands in for the Zenith app/USSD after the customer authorises the transfer).
// With a merchant-chosen `tx` this is the bank's half of the tally.
app.post('/api/issue', limit(60), (req, res) => {
  const { merchantId, amountNaira, payer, tx } = req.body || {}, kobo = Math.round(Number(amountNaira) * 100);
  if (!MERCHANTS.some(m => m.id === merchantId) || !(kobo > 0 && kobo <= 1e9)) return res.status(400).json({ error: 'Invalid merchant or amount' });
  if (tx !== undefined && !/^TX[0-9A-F]{10}$/.test(String(tx))) return res.status(400).json({ error: 'Invalid payment request ID' });
  const old = tx && txs[tx];
  if (old) { // customer pressed Pay twice or lost the receipt: same merchant and amount gets the same receipt back, anything else is refused
    if (old.m !== merchantId || old.amt !== kobo) return res.status(409).json({ error: 'This payment request was already used' });
    const rc = { kid: old.kid, tx: old.tx, amt: old.amt, cur: old.cur, m: old.m, p: old.p, ts: old.ts, exp: old.exp };
    return res.json({ token: N.sign(N.b64u.from(key.sec), rc), receipt: rc });
  }
  const ts = nowS();
  const rc = { kid: key.kid, tx: tx || 'TX' + crypto.randomBytes(5).toString('hex').toUpperCase(), amt: kobo, cur: 'NGN', m: merchantId, p: '***' + String(payer || '').replace(/\D/g, '').slice(-4).padStart(4, '0'), ts, exp: ts + 600 };
  txs[rc.tx] = { ...rc, syncedBy: [], requested: !!tx }; save();
  res.json({ token: N.sign(N.b64u.from(key.sec), rc), receipt: rc });
});

// Reconciliation when a merchant device reconnects: check the log chain, then match each half of the tally.
app.post('/api/sync', limit(60), (req, res) => {
  const { merchantId, log } = req.body || {};
  if (!MERCHANTS.some(m => m.id === merchantId) || !Array.isArray(log) || log.length > 5000 || !log.every(e => e && typeof e === 'object')) return res.status(400).json({ error: 'Bad log' });
  const chain = N.verifyChain(log), flagged = [], settledLater = [], counts = {}; let confirmed = 0, unpaid = 0;
  log.forEach(e => { counts[e.res] = (counts[e.res] || 0) + 1; });
  if (chain.ok) {
    const asked = new Set(log.filter(e => e.res === 'REQUEST').map(e => e.tx)), closed = new Set(log.filter(e => e.res === 'GENUINE' || e.res === 'SETTLED').map(e => e.tx)), seen = new Set();
    for (const e of log) {
      const t = txs[e.tx];
      if (e.res === 'GENUINE') {
        if (!t || t.m !== merchantId || String(t.amt) !== String(e.amt)) { flagged.push({ tx: e.tx, why: 'Not a transfer the bank issued for this merchant' }); continue; }
        if (!asked.has(e.tx)) { flagged.push({ tx: e.tx, why: 'Accepted with no matching payment request' }); continue; }
        if (seen.has(e.tx)) { flagged.push({ tx: e.tx, why: 'Same receipt accepted twice' }); continue; }
        seen.add(e.tx);
        if (!t.syncedBy.includes(merchantId)) { t.syncedBy.push(merchantId); confirmed++; } // re-sending the same log is fine
      } else if (e.res === 'REQUEST' && !closed.has(e.tx)) {
        if (t && t.m === merchantId && String(t.amt) === String(e.amt)) { // the customer paid but the merchant never scanned the receipt: the bank's half still matches
          if (!t.syncedBy.includes(merchantId)) t.syncedBy.push(merchantId);
          settledLater.push({ tx: e.tx, amt: t.amt });
        } else unpaid++;
      }
    }
  }
  const real = log.filter(e => e.res !== 'REQUEST' && e.res !== 'SETTLED');
  const risk = !chain.ok ? { level: 'High', score: 100, reasons: ['Log chain was broken'] } : real.length ? R.assess(real) : { level: 'Low', score: 0, reasons: [] };
  save();
  board.merchants[merchantId] = { t: nowS(), counts, chainOk: chain.ok, flagged: flagged.length, unpaid, settledLater: settledLater.length, risk };
  board.events.unshift({ t: nowS(), merchantId, chainOk: chain.ok, confirmed, flagged: flagged.length, settledLater: settledLater.length, unpaid, level: risk.level });
  board.events.length = Math.min(board.events.length, 50); saveBoard();
  res.json({ chainOk: chain.ok, brokenAt: chain.brokenAt ?? null, confirmed, flagged, settledLater, unpaid, risk });
});

// What the bank sees. Needs the operator key.
app.get('/api/dashboard', op, (q, r) => {
  const all = Object.values(txs), sum = a => a.reduce((s, t) => s + t.amt, 0), rec = all.filter(t => t.syncedBy.length), wait = all.filter(t => !t.syncedBy.length);
  const ms = MERCHANTS.map(m => ({ id: m.id, name: m.name, ...(board.merchants[m.id] || {}) }));
  const tot = k => ms.reduce((s, m) => s + ((m.counts && m.counts[k]) || 0), 0);
  r.json({ issued: all.length, issuedKobo: sum(all), reconciled: rec.length, reconciledKobo: sum(rec), awaiting: wait.length, awaitingKobo: sum(wait),
    forged: tot('INVALID_SIGNATURE'), duplicates: tot('DUPLICATE'), unrequested: tot('UNKNOWN_TALLY'), wrongMerchant: tot('WRONG_MERCHANT'), merchants: ms, events: board.events });
});

app.use(express.static(path.join(__dirname, 'public')));
const PORT = process.env.PORT || 9100;
app.listen(PORT, () => console.log(`Bank simulator on http://localhost:${PORT}  (bank.html pays a request, merchant.html verifies, dashboard.html is the bank view)`));
