// Fraud-risk scoring for merchant logs: an Isolation Forest (unsupervised anomaly detection, no labels needed)
// trained on SIMULATED normal merchant activity, plus hard rules. Retrain on real pilot data before relying on it.
const FEATS = ['volume', 'rejectRate', 'forgedRate', 'dupRate', 'meanLogAmt', 'burst', 'nightShare'];
const WHY = { volume: 'Unusual number of checks', rejectRate: 'Many receipts rejected', forgedRate: 'Many forged receipts presented', dupRate: 'Same receipts presented repeatedly', meanLogAmt: 'Unusual payment sizes', burst: 'Many checks within minutes', nightShare: 'Heavy activity at night' };

function rng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const U = (r, a, b) => a + (b - a) * r();

function features(log) {                        // log entries: {t, tx, amt, res}; amt in kobo
  const n = log.length || 1, c = k => log.filter(e => e.res === k).length;
  const amts = log.filter(e => e.res === 'GENUINE').map(e => Math.log(Math.max(1, +e.amt / 100)));
  const ts = log.map(e => e.t).sort((a, b) => a - b); let burst = 0;
  for (let i = 0, j = 0; i < ts.length; i++) { while (ts[i] - ts[j] > 300) j++; burst = Math.max(burst, i - j + 1); }
  const night = log.filter(e => ((Math.floor(e.t / 3600) + 1) % 24) < 5).length;   // Lagos = UTC+1
  return [log.length, 1 - c('GENUINE') / n, c('INVALID_SIGNATURE') / n, c('DUPLICATE') / n, amts.length ? amts.reduce((a, b) => a + b) / amts.length : 0, burst, night / n];
}
const normal = r => [U(r, 8, 80), U(r, 0, .08) * r(), U(r, 0, .02) * r(), U(r, 0, .03) * r(), U(r, 6.2, 9.8), U(r, 2, 9), U(r, 0, .1) * r()];
const attack = r => { const a = normal(r), k = Math.floor(r() * 3);
  if (k === 0) { a[2] = U(r, .15, .6); a[1] = a[2] + U(r, 0, .1); }                                  // probing with forged receipts
  else if (k === 1) { a[3] = U(r, .2, .5); a[1] = a[3]; }                                             // replaying one receipt
  else { a[5] = U(r, 25, 60); a[6] = U(r, .4, .9); a[0] = U(r, 80, 200); a[4] = U(r, 10.5, 12.5); }   // night burst of large payments
  return a; };

const cn = n => n <= 1 ? 0 : 2 * (Math.log(n - 1) + 0.5772156649) - 2 * (n - 1) / n;
function tree(X, h, max, r) {
  if (h >= max || X.length <= 1) return { size: X.length };
  const f = Math.floor(r() * FEATS.length), v = X.map(x => x[f]), lo = Math.min(...v), hi = Math.max(...v);
  if (lo === hi) return { size: X.length };
  const s = U(r, lo, hi); return { f, s, l: tree(X.filter(x => x[f] < s), h + 1, max, r), r: tree(X.filter(x => x[f] >= s), h + 1, max, r) };
}
const depth = (t, x, h = 0) => t.size !== undefined ? h + cn(t.size) : depth(x[t.f] < t.s ? t.l : t.r, x, h + 1);

function train(seed = 7, N = 4000, T = 100, psi = 256) {
  const r = rng(seed), X = Array.from({ length: N }, () => normal(r));
  const trees = Array.from({ length: T }, () => tree(Array.from({ length: psi }, () => X[Math.floor(r() * N)]), 0, Math.ceil(Math.log2(psi)), r));
  const score = x => 2 ** (-(trees.reduce((a, t) => a + depth(t, x), 0) / T) / cn(psi));
  const sc = X.map(score).sort((a, b) => a - b), q = p => sc[Math.floor(p * (sc.length - 1))];
  const med = FEATS.map((_, i) => { const v = X.map(x => x[i]).sort((a, b) => a - b); return v[N >> 1]; });
  const mad = FEATS.map((_, i) => { const v = X.map(x => Math.abs(x[i] - med[i])).sort((a, b) => a - b); return Math.max(v[N >> 1], 1e-3); });
  return { score, q50: q(.5), review: q(.99), high: q(.999), med, mad };
}
const M = train();

function assess(log) {
  const x = features(log), s = M.score(x), reasons = [];
  const z = x.map((v, i) => Math.abs(v - M.med[i]) / M.mad[i]);
  FEATS.map((f, i) => [f, z[i]]).filter(a => a[1] > 4).sort((a, b) => b[1] - a[1]).slice(0, 2).forEach(a => reasons.push(WHY[a[0]]));
  let level = s >= M.high ? 'High' : s >= M.review ? 'Review' : 'Low';
  const forged = log.filter(e => e.res === 'INVALID_SIGNATURE').length;
  if (forged >= 3) { level = 'High'; reasons.unshift(forged + ' forged receipts presented'); }          // hard rule
  if (log.length < 5 && level !== 'High') return { level: 'Low', score: 0, reasons: ['Not enough activity to score yet'] };
  const score = Math.round(100 * Math.min(1, Math.max(0, (s - M.q50) / (M.high - M.q50))));
  return { level, score: level === 'High' ? Math.max(score, 70) : score, reasons };
}
module.exports = { assess, features, normal, attack, rng, M };
