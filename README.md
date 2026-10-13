# Zenith Offline Proof

**Merchants can verify a Zenith-signed payment in under a second with no internet. Zenith limits the risk and reconciles everything when the network returns.**

> Hackathon prototype. Not a live Zenith Bank channel. The bank signing key is a file here; in production it belongs in the bank's HSM.

## The problem

A customer says they have paid. The merchant's POS has no network, so it cannot ask the bank. The merchant either releases goods and risks a fake or reused receipt, or turns away a genuine customer.

## What the merchant actually gets

An immediate **cryptographic decision** that a payment proof was issued by Zenith, for this merchant, for the amount they asked for, and has not been used before. Final settlement is confirmed when connectivity returns. We do not claim live settlement while offline; we bound the risk and reconcile automatically.

## How it works: the Zenith Tally

Medieval tally sticks were split lengthwise. Each side kept one half, and only matching halves were genuine. Offline Proof works the same way.

1. **Ask.** The merchant enters an amount. The app generates a random request ID (`tx`), stores a `REQUEST` entry in its tamper-evident log, and shows a QR/link. Works fully offline.
2. **Pay.** The customer opens the link, reviews the request and pays through a Zenith channel (simulated by `bank.html`). Zenith signs a receipt for exactly that `tx`, merchant and amount.
3. **Verify offline.** The merchant scans the receipt. The app checks the Ed25519 signature, the merchant, expiry, that the `tx` is a request this device made, that the amount matches, and that it was not used before. It shows a checklist and the time taken.
4. **Reconcile.** When online, the merchant sends its log. The bank verifies the hash chain, matches both halves of every tally, recovers payments the merchant never scanned, flags anything inconsistent, and scores the risk.

```
 Merchant PWA (offline)                       Zenith (online)
 ----------------------                       ---------------
 1. REQUEST tx, amount  --QR/link-->  Customer pays (app/USSD/data)
                                         |
 3. verify signed receipt  <--QR/code--  2. sign receipt for that tx
    (no network needed)
        |
        |  network returns
        v
 4. POST /api/sync  ------------------->  chain check, match tallies,
    (chained log)                          recover, flag, score risk
                                          -> dashboard.html
```

The signed receipt format is unchanged from the original prototype; only who chooses `tx` moved to the merchant.

### Why this blocks the usual attacks

| Attack | Result on the merchant's screen |
| --- | --- |
| Amount altered after signing | Fake or altered receipt |
| Receipt for another merchant | Paid to another merchant |
| Same receipt scanned twice | Already accepted |
| Genuine receipt for a payment this device never requested | Not a payment you requested |
| Paid a different amount than requested | Amount does not match |
| Old receipt | Receipt expired |
| Request left unpaid too long | Payment request expired (settles at sync if paid) |

Because a receipt only matches the request held on the device that created it, a second offline device cannot accept the same receipt. Fully disconnected devices can never share state, so exposure is also capped by the **offline allowance** (₦50,000 per device in the demo; in production the bank sets and signs it per device).

## Receipt format

Signed fields: `kid, tx, amt, cur, m, p, ts, exp` (amount in kobo, payer shown as `***1234`). Token: `NPP1.<base64url message>.<base64url Ed25519 signature>`. Receipts last 10 minutes with 5 minutes of clock tolerance. Requests stay open for 15 minutes.

## Tamper-evident log

Every event (requests, checks, settlements) is appended to a hash-chained log in the merchant's browser. Each entry commits to the one before it, so editing or deleting an entry is detected locally ("Verify log") and by the bank at sync.

## Reconciliation and the bank dashboard

`/api/sync` verifies the chain, then for each entry:

- **Accepted receipt** matched to the bank's record and to a request on that device: confirmed.
- **Accepted receipt** the bank never issued for this merchant, with no matching request, or accepted twice: flagged.
- **Open request the customer paid but the merchant never scanned** (phone died, receipt lost): recovered and settled.
- **Open request nobody paid:** reported as unpaid.

`dashboard.html` (operator key required) shows receipts issued, reconciled, awaiting sync, fraud signals, per-merchant risk with reasons, and recent syncs.

## Fraud-risk layer

`risk.js` is an Isolation Forest (unsupervised anomaly detection) plus hard rules, scoring each merchant log on volume, reject/forged/duplicate rates, payment sizes, bursts and night activity. It is trained on **simulated** normal activity. Retrain on real pilot data before relying on it. Request and settlement entries are excluded from scoring.

## Run it

```bash
npm install
npm test
npm start          # http://localhost:9100
```

1. Open `/merchant.html` once while online so it stores the bank key and caches the app.
2. Enter an amount and press **Create payment request**.
3. Open the link on a second device (or tab) and press **Pay**. A signed receipt QR appears.
4. Go offline. On the merchant app, scan the receipt (or paste the code): green checklist.
5. Try **Make forged copy**, scan the same receipt twice, or pay without a request. All are rejected.
6. Back online, **Send log to bank**, then open `/dashboard.html` (operator key `zenith-demo`).

Camera scanning and the service worker need HTTPS or localhost; pasting the code works anywhere. See `docs/DEPLOY.md` for getting a public HTTPS link.

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `9100` | HTTP port |
| `OPERATOR_KEY` | `zenith-demo` | Key for `/api/dashboard` (change it when hosting) |
| `DATA_DIR` | `./data` | Where the signing key, receipts and dashboard data are stored |

## API

| Endpoint | Purpose |
| --- | --- |
| `GET /api/merchants` | Merchant list |
| `GET /api/pubkeys` | Bank public key(s) for offline verification |
| `POST /api/issue` | Customer channel: sign a receipt. Accepts a merchant-chosen `tx`; re-paying the same request returns the same receipt |
| `POST /api/sync` | Reconcile a merchant log |
| `GET /api/dashboard` | Bank view (header `x-operator-key`) |

Issue and sync are rate limited per IP.

## Project layout

```
server.js            Bank simulator: signing, issue, sync/reconcile, dashboard API
risk.js              Isolation Forest-style fraud scoring and hard rules
test.js              Crypto, tally, log-chain and risk tests
public/
  index.html         Landing page
  merchant.html/js   Offline merchant app: request, verify, log, sync
  bank.html/js       Customer pay page (simulated Zenith channel)
  dashboard.html/js  Bank reconciliation dashboard
  npp.js             Shared signing, verification, tally and log-chain logic
  sw.js              Service worker for offline use
  style.css          Zenith-style theme
docs/                Demo script and deployment notes
```

## Honest limits and production path

- `/api/issue` simulates the customer's authenticated Zenith channel. In production the bank signs only after a real, authorised debit.
- The customer must reach Zenith to pay (data, USSD or the bank app); the merchant's side is what works offline.
- The signing key is a file. Production: HSM/KMS, key rotation and revocation, signed key manifests.
- Merchant and device identity are demo values. Production: device enrollment, per-device keys, signed merchant configuration and bank-set offline limits.
- Storage is JSON files and browser localStorage. Production: a database on the server, IndexedDB on the device.
- Expiry uses the device clock. Request IDs are single-use regardless, and the bank reconciles every entry.
- The fraud model is trained on synthetic data.


QADRI X CIPHER
