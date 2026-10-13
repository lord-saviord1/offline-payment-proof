const assert = require('assert'), nacl = require('tweetnacl'), N = require('./public/npp.js');
const kp = nacl.sign.keyPair(), keys = { k1: N.b64u.to(kp.publicKey) }, now = 1_800_000_000;
const f = { kid: 'k1', tx: 'TX1', amt: 250000, cur: 'NGN', m: 'M1', p: '***4821', ts: now, exp: now + 600 };
const t = N.sign(kp.secretKey, f), v = (tok, o = {}) => N.verify(tok, { keys, merchantId: 'M1', now, ...o }).status;
assert.equal(v(t), 'GENUINE');
assert.equal(v(N.forge(t)), 'INVALID_SIGNATURE');
assert.equal(v(t, { merchantId: 'M2' }), 'WRONG_MERCHANT');
assert.equal(v(t, { now: now + 5000 }), 'EXPIRED');
assert.equal(v(t, { expectedAmt: 100 }), 'AMOUNT_MISMATCH');
assert.equal(v(t, { expectedAmt: 250000 }), 'GENUINE');
assert.equal(v(t, { keys: {} }), 'UNKNOWN_KEY');
assert.equal(v('garbage'), 'MALFORMED');
const other = nacl.sign.keyPair(); assert.equal(v(N.sign(other.secretKey, f)), 'INVALID_SIGNATURE');
let log = []; for (let i = 0; i < 4; i++) log.push(N.append(log, now + i, 'TX' + i, 1000 * i, 'GENUINE'));
assert.ok(N.verifyChain(log).ok);
log[1].amt = 999999; assert.deepEqual(N.verifyChain(log), { ok: false, brokenAt: 1 });
console.log('all tests passed');
// Zenith Tally: the merchant's REQUEST entry is its half of the tally; the bank's receipt must fit it.
const add = (l, t, tx, amt, res) => (l.push(N.append(l, t, tx, amt, res)), l);
const dec = (tok, l, o = {}) => N.decide(tok, l, { keys, merchantId: 'M1', now, ...o }).status;
let tl = add([], now, 'TX1', '250000', 'REQUEST');
assert.equal(dec(t, tl), 'GENUINE');
assert.equal(dec(t, []), 'UNKNOWN_TALLY');                                                    // real receipt, never requested here
assert.equal(dec(t, add([], now, 'TX1', '100000', 'REQUEST')), 'AMOUNT_MISMATCH');           // paid a different amount than asked
assert.equal(dec(N.forge(t), tl), 'INVALID_SIGNATURE');
assert.equal(dec(t, tl, { merchantId: 'M2' }), 'WRONG_MERCHANT');
assert.equal(dec(t, tl, { now: now + 5000 }), 'EXPIRED');
assert.equal(dec(t, add([], now - 1000, 'TX1', '250000', 'REQUEST')), 'REQUEST_EXPIRED');
assert.equal(N.openRequests(tl, now).length, 1);
add(tl, now + 1, 'TX1', '250000', 'GENUINE');
assert.equal(dec(t, tl), 'DUPLICATE');                                                       // same receipt scanned twice
assert.equal(N.openRequests(tl, now + 2).length, 0);
const sl = add([], now, 'TX1', '250000', 'REQUEST'); add(sl, now + 1, 'TX1', '250000', 'SETTLED');
assert.equal(dec(t, sl), 'DUPLICATE');                                                       // already settled by the bank at sync
assert.equal(N.verifyChain(tl).ok, true);
console.log('tally tests passed');
// Risk model on held-out simulated data (not the training set). Synthetic: shows the mechanism works, not real-world accuracy.
const R = require('./risk.js'), r = R.rng(999), N2 = 1000;
const flag = x => R.M.score(x) >= R.M.review;
const fp = Array.from({ length: N2 }, () => flag(R.normal(r))).filter(Boolean).length / N2;
const tp = Array.from({ length: N2 }, () => flag(R.attack(r))).filter(Boolean).length / N2;
console.log(`risk model (simulated): false alarms ${(fp * 100).toFixed(1)}%, attacks caught ${(tp * 100).toFixed(1)}%`);
assert.ok(fp < 0.05 && tp > 0.8);
const mk = (res, n, t0 = 1_800_000_000 + 36000) => Array.from({ length: n }, (_, i) => ({ i, t: t0 + i * 600, tx: 'T' + i, amt: 500000, res }));
assert.equal(R.assess(mk('GENUINE', 30)).level, 'Low');
const bad = mk('GENUINE', 20).concat(mk('INVALID_SIGNATURE', 6, 1_800_050_000)); assert.equal(R.assess(bad).level, 'High');
assert.equal(R.assess(mk('GENUINE', 2)).level, 'Low');
console.log('risk tests passed');
