const $ = id => document.getElementById(id); let last = null;
fetch('/api/merchants').then(r => r.json()).then(ms => { $('m').innerHTML = ms.map(m => `<option value="${m.id}">${m.name} (${m.id})</option>`).join(''); });
function show(token, cap) {
  const qr = qrcode(0, 'M'); qr.addData(token); qr.make();
  $('qr').innerHTML = qr.createSvgTag({ cellSize: 4, margin: 4, scalable: true });
  $('tok').value = token; $('cap').textContent = cap; $('out').hidden = false;
}
$('issue').onclick = async () => {
  $('msg').textContent = '';
  const r = await fetch('/api/issue', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ merchantId: $('m').value, amountNaira: $('a').value, payer: $('p').value }) });
  const d = await r.json();
  if (!r.ok) { $('msg').textContent = d.error; return; }
  last = d.token; $('forge').disabled = false; $('msg').textContent = `Issued ${d.receipt.tx}. Valid for 10 minutes, for this merchant only.`;
  show(d.token, 'Genuine receipt');
};
$('forge').onclick = () => { show(NPP.forge(last), 'Forged copy (amount changed, signature unchanged)'); };
