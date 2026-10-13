# Demo script (3 minutes)

**Kit:** two phones (merchant, customer) and a laptop showing the bank dashboard. Open everything from the same public HTTPS link (see `DEPLOY.md`), not `localhost`, so the QR link works on the customer's phone.

## Setup (do this 10 minutes before)

1. Merchant phone: open `/merchant.html` **while online**, pick Mama Put Kitchen, press **Update bank keys**, then **Clear log**. Reload once so the offline cache installs.
2. Customer phone: have the camera app ready (it will open the pay link).
3. Laptop: open `/dashboard.html`, enter the operator key (`zenith-demo`), leave it open.
4. Do one full dry run, then **Clear log** again on the merchant phone.
5. Record a backup video of the whole flow in case Wi-Fi or the camera fails live.

## Scene 1: The problem (0:00 to 0:30)

*Say:* "It's the lunch rush at Mama Put Kitchen. The network drops. A customer says they've already paid. The merchant can't reach the bank. Release the food and risk a fake receipt, or turn away a real customer. This happens every day across Nigeria."

*Do:* Put the merchant phone in airplane mode. Show it: **offline**.

## Scene 2: Ask, pay, verify offline (0:30 to 1:20)

1. Merchant phone: enter **₦2,500**, press **Create payment request**. A QR appears. *Say:* "This request is made offline and stored in a tamper-evident log."
2. Customer phone: scan the QR, review "Pay Mama Put Kitchen ₦2,500", press **Pay**. A signed receipt QR appears. *Say:* "Zenith signs a receipt for exactly this request."
3. Merchant phone: **Scan QR code** on the customer's screen.
4. Result: green checklist, **Release the goods**, "Checked offline in … ms". *Say:* "Signature valid, matches my request, amount right, not used before. Decided in milliseconds with no internet."

## Scene 3: Attacks (1:20 to 2:05)

*Say:* "Now the fraud attempts."

1. Customer phone: press **Make forged copy (amount ×10)**. Merchant scans it: **Fake or altered receipt**. Repeat it three times. (Three or more is what raises the risk score later.)
2. Merchant scans the **genuine** receipt again: **Already accepted**.
3. Customer phone: open the pay page **without** a request link, issue a ₦700 receipt. Merchant scans it: **Not a payment you requested**. *Say:* "A real Zenith receipt, but not for a request this shop made. Rejected."

## Scene 3b: The phone dies (2:05 to 2:25)

1. Merchant creates a **₦1,000** request. Customer pays it. **Merchant does not scan.** *Say:* "The customer's battery died before they showed the receipt."

## Scene 4: Reconnect and reconcile (2:25 to 2:50)

1. Merchant phone: airplane mode off. Press **Send log to bank**.
2. Read the result line: confirmed 1, **recovered 1 payment the customer paid but you never scanned**, fraud risk **High** with reasons.
3. Switch to the laptop dashboard: reconciled amount, forged and duplicate counts, merchant risk, the sync entry.

## Scene 5: Close (2:50 to 3:00)

*Say:* "Zenith doesn't have to choose between keeping merchants serving customers and keeping control. They get an immediate cryptographic decision offline, a capped risk per device, and every transaction reconciled when the network returns."

## Say this, not that

- **Say:** "The merchant gets an immediate cryptographic decision that Zenith issued this proof for this request. Settlement is confirmed when connectivity returns."
- **Don't say:** "The merchant confirms the payment in real time without internet." A judge will ask how the bank knows, and the first answer is the honest one.

## Likely judge questions

- **How does the customer pay if the merchant is offline?** The merchant side works offline. The customer pays through a Zenith channel: mobile data, USSD or the bank app. The receipt only exists after the bank has authorised the debit.
- **Can two offline devices accept the same receipt?** No: a receipt only matches the request held on the device that made it. And while fully disconnected, no system can share state, so we also cap each device with an offline allowance and reconcile everything at sync.
- **What if the merchant edits their log?** Entries are hash-chained, so edits and deletions are detected locally and by the bank. The bank also checks each entry against its own records.
- **Where is the private key?** A file in this demo. In production it lives in an HSM, with rotation and revocation.
- **Can a merchant change the phone's clock?** That only affects expiry. Request IDs are single-use and the bank reconciles every entry, so it does not create free money. Production would add signed time or server checks at sync.
- **Is the fraud model real?** It's an explainable prototype trained on simulated data. It's designed to be retrained on Zenith pilot data.
- **What does production look like?** Database, device enrollment with per-device keys, bank-signed merchant limits, HSM key management, USSD and app integration, monitoring.
- **Why is this better than what exists?** Card chips support offline authorisation for cards. This brings a bounded, verifiable offline decision to ordinary QR and transfer payments on any phone, and it reconciles automatically.

## If something breaks

- **Camera won't scan:** paste the code into the box and press **Check receipt**.
- **Link won't open on the customer phone:** you are on `localhost`. Use the public HTTPS link.
- **"Bank key not stored":** go online and press **Update bank keys**. This also happens if the hosted server restarted and made a new key.
- **Anything else:** play the backup video.
