// Bank simulator. In production the private key lives in the bank's HSM; here it is a file.
const express = require('express'), helmet = require('helmet'), nacl = require('tweetnacl'), crypto = require('crypto');
const R = require('./risk.js'), fs = require('fs'), path = require('path'), N = require('./public/npp.js');
const KEYF = path.join(__dirname, 'data/signing.json'), TXF = path.join(__dirname, 'data/txs.json');
const load = (f, d) => { try { return JSON.parse(fs.readFileSync(f)); } catch { return d; } };
let key = load(KEYF, null);
if (!key) { const kp = nacl.sign.keyPair(); key = { kid: 'ZB-' + Date.now().toString(36), pub: N.b64u.to(kp.publicKey), sec: N.b64u.to(kp.secretKey) }; fs.writeFileSync(KEYF, JSON.stringify(key)); }
const txs = load(TXF, {}), save = () => fs.writeFileSync(TXF, JSON.stringify(txs));
const MERCHANTS = [{ id: 'M-LAGOS-001', name: 'Mama Put Kitchen' }, { id: 'M-LAGOS-002', name: 'Sangotedo Mart' }];

const app = express();
app.use(helmet({ contentSecurityPolicy: { directives: { upgradeInsecureRequests: null } } })); // keep plain-http LAN use working
app.use(express.json({ limit: '1mb' }));
app.get('/', (q, r) => r.redirect('/merchant.html'));
app.get('/api/merchants', (q, r) => r.json(MERCHANTS));
app.get('/api/pubkeys', (q, r) => r.json({ keys: { [key.kid]: key.pub } }));

app.post('/api/issue', (req, res) => {
  const { merchantId, amountNaira, payer } = req.body || {}, kobo = Math.round(Number(amountNaira) * 100);
  if (!MERCHANTS.some(m => m.id === merchantId) || !(kobo > 0 && kobo <= 1e9)) return res.status(400).json({ error: 'Invalid merchant or amount' });
  const ts = Math.floor(Date.now() / 1000);
  const rc = { kid: key.kid, tx: 'TX' + crypto.randomBytes(5).toString('hex').toUpperCase(), amt: kobo, cur: 'NGN', m: merchantId, p: '***' + String(payer || '').replace(/\D/g, '').slice(-4).padStart(4, '0'), ts, exp: ts + 600 };
  txs[rc.tx] = { ...rc, syncedBy: [] }; save();
  res.json({ token: N.sign(N.b64u.from(key.sec), rc), receipt: rc });
});

// Reconciliation when a merchant device reconnects: check the log chain, then every accepted receipt.
app.post('/api/sync', (req, res) => {
  const { merchantId, log } = req.body || {};
  if (!Array.isArray(log) || log.length > 5000) return res.status(400).json({ error: 'Bad log' });
  const chain = N.verifyChain(log), flagged = []; let confirmed = 0;
  if (chain.ok) for (const e of log) {
    if (e.res !== 'GENUINE') continue;
    const t = txs[e.tx];
    if (!t || t.m !== merchantId || String(t.amt) !== String(e.amt)) { flagged.push({ tx: e.tx, why: 'Not a transfer the bank issued for this merchant' }); continue; }
    if (t.syncedBy.includes(merchantId)) continue; // re-sending the same log is fine
    t.syncedBy.push(merchantId); confirmed++;
  }
  save(); res.json({ chainOk: chain.ok, brokenAt: chain.brokenAt ?? null, confirmed, flagged, risk: chain.ok ? R.assess(log) : { level: 'High', score: 100, reasons: ['Log chain was broken'] } });
});

app.use(express.static(path.join(__dirname, 'public')));
const PORT = process.env.PORT || 9100;
app.listen(PORT, () => console.log(`Bank simulator on http://localhost:${PORT}  (bank.html issues receipts, merchant.html verifies)`));
