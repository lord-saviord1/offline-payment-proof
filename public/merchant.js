const $ = id => document.getElementById(id);
const store = { get: (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } }, set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} } };
let keys = store.get('npp_keys', {}), merchants = store.get('npp_merchants', []), log = store.get('npp_log', []), stream, raf;
const naira = k => (k / 100).toLocaleString('en-NG', { style: 'currency', currency: 'NGN' });
const now = () => Math.floor(Date.now() / 1000);
const T = { GENUINE: ['ok', 'Genuine payment'], DUPLICATE: ['warn', 'Already accepted'], INVALID_SIGNATURE: ['bad', 'Fake or altered receipt'], WRONG_MERCHANT: ['bad', 'Paid to another merchant'], EXPIRED: ['warn', 'Receipt expired'], AMOUNT_MISMATCH: ['bad', 'Amount does not match'], UNKNOWN_KEY: ['warn', 'Bank key not stored'], MALFORMED: ['bad', 'Not a receipt code'] };
const HELP = { DUPLICATE: 'This receipt was already accepted on this device. Do not release goods twice.', INVALID_SIGNATURE: 'The bank did not sign this exact receipt. Do not release goods.', WRONG_MERCHANT: 'This receipt names a different merchant.', EXPIRED: 'Receipts last 10 minutes. Ask for a new one, and check this phone\'s clock.', AMOUNT_MISMATCH: 'The signed amount is not what you expected.', UNKNOWN_KEY: 'Connect once and press "Update bank keys".', MALFORMED: 'Scan again or paste the full code.' };

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
function render(st, rc) {
  const [cls, head] = T[st], r = $('result'); r.hidden = false; r.className = cls;
  r.innerHTML = `<div class="big">${head}</div>` + (rc && st !== 'UNKNOWN_KEY' ? `<div class="amt">${naira(+rc.amt)}</div><div class="status">${rc.tx} · from account ${rc.p}</div>` : '') + (HELP[st] ? `<p>${HELP[st]}</p>` : '');
}
function check(token) {
  const e = $('exp').value, r = NPP.verify(token, { keys, merchantId: $('m').value, now: now(), expectedAmt: e ? Math.round(e * 100) : null });
  let st = r.status; const rc = r.receipt;
  if (st === 'GENUINE' && log.some(x => x.tx === rc.tx && x.res === 'GENUINE')) st = 'DUPLICATE';
  log.push(NPP.append(log, now(), rc && st !== 'INVALID_SIGNATURE' ? rc.tx : '-', rc && st !== 'INVALID_SIGNATURE' ? rc.amt : '-', st));
  store.set('npp_log', log); render(st, st === 'INVALID_SIGNATURE' ? null : rc); renderLog();
}
function renderLog() {
  $('log').innerHTML = log.slice(-15).reverse().map(e => `<li>#${e.i} ${new Date(e.t * 1000).toLocaleTimeString()} · ${e.tx} · ${e.amt === '-' ? '-' : naira(+e.amt)} · ${e.res} · ${e.h.slice(0, 8)}</li>`).join('') || '<li>No receipts checked yet.</li>';
}
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
$('tam').onclick = () => { if (log.length < 2) { $('lm').textContent = 'Check at least two receipts first.'; return; } log[1].amt = '99999900'; store.set('npp_log', log); renderLog(); $('lm').textContent = 'Entry #1 was edited. Press "Verify log".'; };
$('rst').onclick = () => { log = []; store.set('npp_log', log); renderLog(); $('lm').textContent = 'Log cleared.'; };
$('sync').onclick = async () => {
  try {
    const r = await fetch('/api/sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ merchantId: $('m').value, log }) }), d = await r.json();
    $('lm').textContent = !d.chainOk ? `The bank rejected the log: entry #${d.brokenAt} was changed.` : `Bank confirmed ${d.confirmed} receipt(s)` + (d.flagged.length ? `, flagged ${d.flagged.length}: ${d.flagged.map(f => f.tx + ' (' + f.why + ')').join('; ')}` : '.') + ` Fraud risk: ${d.risk.level} (${d.risk.score}/100)` + (d.risk.reasons.length ? ' - ' + d.risk.reasons.join('; ') : '');
  } catch { $('lm').textContent = 'No connection. The log is kept on this device; send it later.'; }
};
addEventListener('online', status); addEventListener('offline', status);
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
renderMerchants(); status(); renderLog(); refresh();
