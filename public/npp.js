// Shared by server (Node) and merchant app (browser). Pure functions, no network.
(function (root) {
  const nacl = root.nacl || require('tweetnacl');
  const enc = new TextEncoder(), dec = new TextDecoder();
  const b64u = {
    to: u => btoa(String.fromCharCode(...u)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''),
    from: s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0)),
  };
  const F = ['kid', 'tx', 'amt', 'cur', 'm', 'p', 'ts', 'exp'];

  // Bank side: sign a completed transfer. Fields must not contain "|".
  function sign(sk, f) {
    F.forEach(k => { if (String(f[k]).includes('|') || f[k] === undefined) throw new Error('bad field ' + k); });
    const msg = 'NPP1|' + F.map(k => f[k]).join('|');
    return 'NPP1.' + b64u.to(enc.encode(msg)) + '.' + b64u.to(nacl.sign.detached(enc.encode(msg), sk));
  }
  function parse(token) {
    try {
      const [v, body, sig] = String(token).trim().split('.');
      if (v !== 'NPP1' || !body || !sig) return null;
      const msg = dec.decode(b64u.from(body)), p = msg.split('|');
      if (p[0] !== 'NPP1' || p.length !== F.length + 1) return null;
      const r = {}; F.forEach((k, i) => r[k] = p[i + 1]);
      return { r, msg, sig: b64u.from(sig) };
    } catch (e) { return null; }
  }
  // Merchant side. keys = {kid: publicKeyB64u}. Works with no network.
  function verify(token, o) {
    const x = parse(token);
    if (!x) return { status: 'MALFORMED' };
    const pub = o.keys[x.r.kid];
    if (!pub) return { status: 'UNKNOWN_KEY', receipt: x.r };
    if (!nacl.sign.detached.verify(enc.encode(x.msg), x.sig, b64u.from(pub))) return { status: 'INVALID_SIGNATURE' };
    const rc = x.r, skew = o.skew ?? 300;
    if (rc.m !== o.merchantId) return { status: 'WRONG_MERCHANT', receipt: rc };
    if (o.now > +rc.exp + skew || o.now < +rc.ts - skew) return { status: 'EXPIRED', receipt: rc };
    if (o.expectedAmt != null && +rc.amt !== o.expectedAmt) return { status: 'AMOUNT_MISMATCH', receipt: rc };
    return { status: 'GENUINE', receipt: rc };
  }
  // Demo helper: change the amount without re-signing, as a forger would.
  function forge(token) {
    const x = parse(token); x.r.amt = String(+x.r.amt * 10);
    return 'NPP1.' + b64u.to(enc.encode('NPP1|' + F.map(k => x.r[k]).join('|'))) + '.' + b64u.to(x.sig);
  }
  // Tamper-evident log: each entry commits to the previous one.
  const G = '0'.repeat(64), hex = u => Array.from(u, b => b.toString(16).padStart(2, '0')).join('');
  const hashOf = e => hex(nacl.hash(enc.encode([e.prev, e.i, e.t, e.tx, e.amt, e.res].join('|'))).slice(0, 32));
  function append(log, t, tx, amt, res) {
    const e = { i: log.length, t, tx, amt, res, prev: log.length ? log[log.length - 1].h : G };
    e.h = hashOf(e); return e;
  }
  function verifyChain(log) {
    let prev = G;
    for (let i = 0; i < log.length; i++) if (log[i].i !== i || log[i].prev !== prev || hashOf(log[i]) !== log[i].h) return { ok: false, brokenAt: i };
    else prev = log[i].h;
    return { ok: true };
  }
  root.NPP = { b64u, sign, parse, verify, forge, append, verifyChain };
  if (typeof module !== 'undefined') module.exports = root.NPP;
})(typeof window !== 'undefined' ? window : globalThis);
