# Offline receipt check

A bank-signed QR receipt that a merchant can verify with no internet, plus a tamper-evident log of every check.

Run: `npm install`, `npm test`, `npm start` (http://localhost:9100)

1. Open `/merchant.html` once while online. It stores the bank's public key and caches the app.
2. Open `/bank.html`, issue a receipt for the same merchant.
3. Turn off Wi-Fi (or stop the server). On `/merchant.html`, paste the code or scan the QR: "Genuine payment".
4. Try "Make forged copy": "Fake or altered receipt". Check the same receipt twice: "Already accepted".
5. "Demo: alter an entry", then "Verify log": the change is caught. Reconnect and "Send log to bank" to reconcile.

6. Present a forged copy three or more times, then "Send log to bank": the bank's fraud-risk model returns "High" with reasons.

Fraud-risk layer (`risk.js`): an Isolation Forest (unsupervised anomaly detection) plus hard rules, scoring each merchant log on volume, reject/forged/duplicate rates, payment sizes, bursts and night activity. It is trained on SIMULATED normal activity, so retrain on real pilot data before relying on it.

Notes: the private key is a file here; in production it belongs to the bank (HSM). Camera scanning and the service worker need https or localhost; the paste option works anywhere. The device clock is used for the 10-minute expiry (5-minute tolerance).
