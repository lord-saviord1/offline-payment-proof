const $ = id => document.getElementById(id); let last = null;
// Opened from a merchant's payment link (?tx=..&m=..&a=kobo) this page pays that exact request.
const q = new URLSearchParams(location.search), TX = q.get('tx'), MID = q.get('m'), KOBO = +q.get('a'), REQ = !!(TX && MID && KOBO > 0);
const naira = k => (k / 100).toLocaleString('en-NG', { style: 'currency', currency: 'NGN' });
fetch('/api/merchants').then(r => r.json()).then(ms => {
  $('m').innerHTML = ms.map(m => `<option value="${m.id}">${m.name} (${m.id})</option>`).join('');
  if (!REQ) return;
  const m = ms.find(x => x.id === MID);
  $('m').value = MID; $('a').value = KOBO / 100; $('m').disabled = $('a').disabled = true;
  $('h').textContent = 'Pay ' + (m ? m.name : MID);
  $('d').textContent = 'Review the request, then pay. The bank signs a receipt for exactly this request.';
  $('rq').textContent = `Payment request ${TX} · ${naira(KOBO)}`; $('rq').hidden = false;
  $('issue').textContent = 'Pay ' + naira(KOBO);
});
function show(token, cap) {
  const qr = qrcode(0, 'M'); qr.addData(token); qr.make();
  $('qr').innerHTML = qr.createSvgTag({ cellSize: 4, margin: 4, scalable: true });
  $('tok').value = token; $('cap').textContent = cap; $('out').hidden = false;
}
$('issue').onclick = async () => {
  $('msg').textContent = '';
  try {
    const body = { merchantId: REQ ? MID : $('m').value, amountNaira: REQ ? KOBO / 100 : $('a').value, payer: $('p').value, tx: REQ ? TX : undefined };
    const r = await fetch('/api/issue', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }), d = await r.json();
    if (!r.ok) { $('msg').textContent = d.error; return; }
    last = d.token; $('forge').disabled = false;
    $('msg').textContent = REQ ? `Payment complete (${d.receipt.tx}). Show this code to the merchant. It is valid for 10 minutes.` : `Issued ${d.receipt.tx}. Valid for 10 minutes, for this merchant only.`;
    show(d.token, 'Genuine receipt');
  } catch { $('msg').textContent = 'Could not reach the bank. Try again when you have a connection.'; }
};
$('forge').onclick = () => { show(NPP.forge(last), 'Forged copy (amount changed, signature unchanged)'); };
