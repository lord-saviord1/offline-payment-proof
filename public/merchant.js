const $ = id => document.getElementById(id);
const store = { get: (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } }, set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} } };
let keys = store.get('npp_keys', {}), merchants = store.get('npp_merchants', []), log = store.get('npp_log', []), synced = store.get('npp_synced', 0), stream, raf;
const LIMIT = 5000000; // offline allowance in kobo (₦50,000). Demo value: in production the bank sets and signs this per device.
const naira = k => (k / 100).toLocaleString('en-NG', { style: 'currency', currency: 'NGN' });
const now = () => Math.floor(Date.now() / 1000);
const T = { GENUINE: ['ok', 'Genuine payment'], DUPLICATE: ['warn', 'Already accepted'], INVALID_SIGNATURE: ['bad', 'Fake or altered receipt'], WRONG_MERCHANT: ['bad', 'Paid to another merchant'], EXPIRED: ['warn', 'Receipt expired'], AMOUNT_MISMATCH: ['bad', 'Amount does not match'], UNKNOWN_KEY: ['warn', 'Bank key not stored'], MALFORMED: ['bad', 'Not a receipt code'], UNKNOWN_TALLY: ['bad', 'Not a payment you requested'], REQUEST_EXPIRED: ['warn', 'Payment request expired'] };
const HELP = { DUPLICATE: 'This receipt was already accepted on this device. Do not release goods twice.', INVALID_SIGNATURE: 'The bank did not sign this exact receipt.', WRONG_MERCHANT: 'This receipt names a different merchant.', EXPIRED: 'Receipts last 10 minutes. Ask for a new one, and check this phone\'s clock.', AMOUNT_MISMATCH: 'The signed amount is not the amount you asked for.', UNKNOWN_KEY: 'Connect once and press "Update bank keys".', MALFORMED: 'Scan again or paste the full code.', UNKNOWN_TALLY: 'This may be a real bank receipt, but not for a request made on this device. Ask the customer to pay your QR code.', REQUEST_EXPIRED: 'Requests last 15 minutes. Create a new one. If the customer already paid, it will settle when you send the log to the bank.' };
// Checks run in this order; the failing one is marked.
const STEPS = ['Zenith signature valid', 'Paid to this shop', 'Receipt still valid', 'Matches your payment request', 'Amount as requested', 'Not accepted before'];
const FAIL = { INVALID_SIGNATURE: 0, MALFORMED: 0, UNKNOWN_KEY: 0, WRONG_MERCHANT: 1, EXPIRED: 2, UNKNOWN_TALLY: 3, REQUEST_EXPIRED: 3, AMOUNT_MISMATCH: 4, DUPLICATE: 5 };

const unsynced = () => log.filter(e => e.res === 'GENUINE' && e.i >= synced);
const exposure = () => unsynced().reduce((s, e) => s + +e.amt, 0) + NPP.openRequests(log, now()).reduce((s, e) => s + +e.amt, 0);
function counters() {
  const matched = log.filter(e => e.res === 'GENUINE' || e.res === 'SETTLED').length;
  $('ct').innerHTML = `<b>${matched}</b> matched · <b>${NPP.openRequests(log, now()).length}</b> awaiting payment · <b>${unsynced().length}</b> waiting to sync · offline allowance left <b>${naira(Math.max(0, LIMIT - exposure()))}</b>`;
}
function renderMerchants() {
  $('m').innerHTML = merchants.map(m => `<option value="${m.id}">${m.name}</option>`).join('');
  const s = store.get('npp_merchant', null); if (s) $('m').value = s;
}
function status() { $('st').textContent = `${Object.keys(keys).length} bank key stored · ${navigator.onLine ? 'online' : 'offline'}`; }
async function refresh() {
  try {
    const [k, m] = await Promise.all([fetch('/api/pubkeys').then(r => r.json()), fetch('/api/merchants').then(r => r.json())]);
    keys = k.keys; merchants = m; store.set('npp_keys', keys); store.set('npp_merchants', m);
  } catch { $('st').textContent = 'Could not reach the bank. Using stored keys.'; }
  renderMerchants(); if (!$('st').textContent.startsWith('Could')) status();
}
function render(st, rc, ms) {
  const [cls, head] = T[st], r = $('result'), f = FAIL[st] ?? STEPS.length; r.hidden = false; r.className = cls;
  r.innerHTML = `<div class="big">${head}</div>` + (rc && st !== 'UNKNOWN_KEY' ? `<div class="amt">${naira(+rc.amt)}</div><div class="status">${rc.tx} · from account ${rc.p}</div>` : '')
    + `<ul class="chk">${STEPS.map((s, i) => `<li>${i < f ? '✓' : i === f ? '✗' : '–'} ${s}</li>`).join('')}</ul>`
    + (st === 'GENUINE' ? `<p><b>Release the goods.</b> Checked offline in ${Math.max(1, Math.round(ms))} ms.</p>` : `<p><b>Do not release goods.</b> ${HELP[st]}</p>`);
}
function check(token) {
  const t0 = performance.now(), r = NPP.decide(token, log, { keys, merchantId: $('m').value, now: now() }), st = r.status, rc = r.receipt, ms = performance.now() - t0;
  log.push(NPP.append(log, now(), rc && st !== 'INVALID_SIGNATURE' ? rc.tx : '-', rc && st !== 'INVALID_SIGNATURE' ? rc.amt : '-', st));
  store.set('npp_log', log); render(st, st === 'INVALID_SIGNATURE' ? null : rc, ms); renderLog(); counters();
}
function renderLog() {
  $('log').innerHTML = log.slice(-15).reverse().map(e => `<li>#${e.i} ${new Date(e.t * 1000).toLocaleTimeString()} · ${e.tx} · ${e.amt === '-' ? '-' : naira(+e.amt)} · ${e.res} · ${e.h.slice(0, 8)}</li>`).join('') || '<li>Nothing yet.</li>';
}
// Step 1: the merchant makes its half of the tally. It is stored in the chained log, then shown as a QR for the customer.
$('req').onclick = () => {
  const k = Math.round(+$('ra').value * 100), m = $('m').value;
  if (!m) { $('rm').textContent = 'Choose the shop first.'; return; }
  if (!(k > 0 && k <= LIMIT)) { $('rm').textContent = `Enter an amount up to ${naira(LIMIT)}.`; return; }
  if (exposure() + k > LIMIT) { $('rm').textContent = `Offline allowance reached (${naira(LIMIT)} not yet confirmed by the bank). Connect and press "Send log to bank".`; return; }
  const tx = 'TX' + Array.from(crypto.getRandomValues(new Uint8Array(5)), b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
  log.push(NPP.append(log, now(), tx, String(k), 'REQUEST')); store.set('npp_log', log);
  const url = `${location.origin}/bank.html?tx=${tx}&m=${encodeURIComponent(m)}&a=${k}`;
  try { const qr = qrcode(0, 'M'); qr.addData(url); qr.make(); $('rqr').innerHTML = qr.createSvgTag({ cellSize: 4, margin: 4, scalable: true }); } catch { $('rqr').textContent = 'QR library not loaded. Use the link below.'; }
  $('rcap').textContent = `Ask the customer to scan this and pay ${naira(k)}. Request ${tx}, open for 15 minutes.`;
  $('rlink').value = url; $('rbox').hidden = false; $('rm').textContent = ''; renderLog(); counters();
};
async function scan() {
  if (!navigator.mediaDevices?.getUserMedia) { $('cm').textContent = 'The camera needs https or localhost. Paste the code instead.'; return; }
  try { stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } }); } catch { $('cm').textContent = 'Camera permission was denied. Paste the code instead.'; return; }
  const v = $('cam'); v.srcObject = stream; v.hidden = false; await v.play(); $('cm').textContent = '';
  const c = document.createElement('canvas'), x = c.getContext('2d', { willReadFrequently: true });
  const tick = () => {
    if (v.readyState >= 2) { c.width = v.videoWidth; c.height = v.videoHeight; x.drawImage(v, 0, 0); const d = x.getImageData(0, 0, c.width, c.height), q = jsQR(d.data, d.width, d.height); if (q && q.data) { stop(); check(q.data); return; } }
    raf = requestAnimationFrame(tick);
  };
  tick();
}
function stop() { cancelAnimationFrame(raf); if (stream) stream.getTracks().forEach(t => t.stop()); $('cam').hidden = true; }

$('scan').onclick = scan; $('stop').onclick = stop; $('upd').onclick = refresh;
$('chk').onclick = () => { if (!$('tok').value.trim()) { $('cm').textContent = 'Paste a receipt code first.'; return; } $('cm').textContent = ''; check($('tok').value); };
$('m').onchange = () => store.set('npp_merchant', $('m').value);
$('vc').onclick = () => { const r = NPP.verifyChain(log); $('lm').textContent = r.ok ? `Log is intact (${log.length} entries).` : `Log was changed: entry #${r.brokenAt} does not match.`; };
$('tam').onclick = () => { if (log.length < 2) { $('lm').textContent = 'Make a request and check a receipt first.'; return; } log[1].amt = '99999900'; store.set('npp_log', log); renderLog(); $('lm').textContent = 'Entry #1 was edited. Press "Verify log".'; };
$('rst').onclick = () => { log = []; synced = 0; store.set('npp_log', log); store.set('npp_synced', 0); renderLog(); counters(); $('lm').textContent = 'Log cleared.'; };
$('sync').onclick = async () => {
  try {
    const r = await fetch('/api/sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ merchantId: $('m').value, log }) }), d = await r.json();
    if (!r.ok) { $('lm').textContent = d.error || 'The bank refused the log.'; return; }
    if (!d.chainOk) { $('lm').textContent = `The bank rejected the log: entry #${d.brokenAt} was changed.`; return; }
    d.settledLater.forEach(s => log.push(NPP.append(log, now(), s.tx, String(s.amt), 'SETTLED'))); // payments the customer made but the merchant never scanned
    synced = log.length; store.set('npp_synced', synced); store.set('npp_log', log); renderLog(); counters();
    const p = [`Bank confirmed ${d.confirmed} receipt(s)`];
    if (d.settledLater.length) p.push(`recovered ${d.settledLater.length} payment(s) the customer paid but you never scanned`);
    if (d.unpaid) p.push(`${d.unpaid} request(s) still unpaid`);
    if (d.flagged.length) p.push(`flagged ${d.flagged.length}: ${d.flagged.map(f => f.tx + ' (' + f.why + ')').join('; ')}`);
    $('lm').textContent = p.join(', ') + `. Fraud risk: ${d.risk.level} (${d.risk.score}/100)` + (d.risk.reasons.length ? ' - ' + d.risk.reasons.join('; ') : '');
  } catch { $('lm').textContent = 'No connection. The log is kept on this device; send it later.'; }
};
addEventListener('online', status); addEventListener('offline', status);
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
renderMerchants(); status(); renderLog(); counters(); refresh(); setInterval(counters, 30000);
