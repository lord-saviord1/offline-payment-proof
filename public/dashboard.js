const $ = id => document.getElementById(id);
const naira = k => (k / 100).toLocaleString('en-NG', { style: 'currency', currency: 'NGN' });
const at = t => new Date(t * 1000).toLocaleTimeString();
const tag = l => `<span class="tag ${l === 'High' ? 'bad' : l === 'Low' ? 'ok' : 'warn'}">${l}</span>`;
let timer;
async function load() {
  const key = $('key').value || sessionStorage.getItem('opkey') || '';
  try {
    const r = await fetch('/api/dashboard', { headers: { 'x-operator-key': key } });
    if (r.status === 401) { $('msg').textContent = 'Wrong operator key.'; return; }
    const d = await r.json(); sessionStorage.setItem('opkey', key); $('msg').textContent = 'Updated ' + new Date().toLocaleTimeString();
    const fraud = d.forged + d.duplicates + d.unrequested + d.wrongMerchant;
    $('cards').innerHTML = [['Receipts issued', d.issued, naira(d.issuedKobo)], ['Reconciled', d.reconciled, naira(d.reconciledKobo)], ['Awaiting sync', d.awaiting, naira(d.awaitingKobo)],
      ['Fraud signals', fraud, `${d.forged} forged · ${d.duplicates} duplicate · ${d.unrequested} unrequested · ${d.wrongMerchant} wrong shop`]].map(c => `<div class="card"><small>${c[0]}</small><b>${c[1]}</b><small>${c[2]}</small></div>`).join('');
    $('mt').innerHTML = d.merchants.map(m => `<div class="mrow"><b>${m.name}</b> <small>${m.id}</small> ` + (m.t
      ? `${tag(m.risk.level)} (${m.risk.score}/100) · last sync ${at(m.t)}<br>Accepted ${m.counts.GENUINE || 0} · rejected ${(m.counts.INVALID_SIGNATURE || 0) + (m.counts.WRONG_MERCHANT || 0) + (m.counts.UNKNOWN_TALLY || 0) + (m.counts.AMOUNT_MISMATCH || 0)} · duplicates ${m.counts.DUPLICATE || 0} · unpaid requests ${m.unpaid} · recovered ${m.settledLater} · flagged ${m.flagged}${m.chainOk ? '' : ' · <b>log chain broken</b>'}` + (m.risk.reasons.length ? `<br>Why: ${m.risk.reasons.join('; ')}` : '')
      : '<br>Has not synced yet.') + '</div>').join('');
    $('ev').innerHTML = d.events.slice(0, 10).map(e => `<li>${at(e.t)} · ${e.merchantId} · confirmed ${e.confirmed} · flagged ${e.flagged} · recovered ${e.settledLater} · unpaid ${e.unpaid} · ${e.chainOk ? 'risk ' + e.level : 'chain broken'}</li>`).join('') || '<li>No syncs yet.</li>';
    if (!timer) timer = setInterval(load, 5000);
  } catch { $('msg').textContent = 'Could not reach the bank.'; }
}
$('go').onclick = load; if (sessionStorage.getItem('opkey')) load();
