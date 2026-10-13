# Getting this into GitHub and onto a link

## 1. Put the files in your repo

1. Unzip `zenith-offline-proof.zip` **over your repo folder** (the folder with `server.js` and `package.json`). Say yes to replace.
2. The zip only contains files I changed or added. It does **not** contain `risk.js`, `package.json`, `.gitignore` or `public/lib/`, so those stay as they are.

| Replaced (same name) | New |
| --- | --- |
| `server.js`, `test.js`, `README.md` | `public/index.html` (landing page) |
| `public/npp.js`, `merchant.js/html`, `bank.js/html`, `sw.js`, `style.css` | `public/dashboard.html`, `public/dashboard.js` |
| | `docs/DEMO_SCRIPT.md`, `docs/DEPLOY.md` |

Nothing is deleted. The signed receipt format is unchanged, so overlap with what's on GitHub is just updated versions of the same files.

## 2. Check it works

```bash
npm install
npm test        # should end with "tally tests passed" and "risk tests passed"
npm start       # http://localhost:9100
```

## 3. Push to GitHub

```bash
git status                 # review what changed
git diff --stat
git add -A
git commit -m "Zenith Offline Proof: merchant-initiated tally, dashboard, offline allowance, branding"
git push origin main
```

This pushes to your fork (`lord-saviord1/offline-payment-proof`). If the submission needs the original repo, push there too, or open a pull request from your fork.

`data/` is gitignored, so keys and receipts never get committed.

## 4. Get a link

The camera and service worker need **HTTPS**, and the customer's phone needs a link it can open. `localhost` won't work for that, so you need a public address.

### Fastest: Cloudflare Tunnel (recommended for the demo)

Keeps the app on your laptop and gives it a public HTTPS URL. No account needed for a quick tunnel.

1. Install `cloudflared` (`brew install cloudflared`, or `winget install --id Cloudflare.cloudflared`, or the downloads page on Cloudflare's site).
2. In one terminal: `npm start`
3. In another: `cloudflared tunnel --url http://localhost:9100`
4. It prints a `https://….trycloudflare.com` address. Open **that** address on both phones and the laptop.

The URL changes each time you restart the tunnel, and the laptop must stay on and connected. Open the merchant app through the tunnel URL on the merchant phone while online, so the QR links point to the public address.

### Stable: host it (Render, Railway or similar)

1. Create a new web service from your GitHub repo.
2. Build command `npm install`, start command `npm start`.
3. Set `OPERATOR_KEY` to something other than the default.
4. If the host offers a persistent disk, mount it and set `DATA_DIR` to its path.

**Watch out:** on hosts without a persistent disk, a restart or redeploy creates a **new bank signing key** and clears receipts and dashboard data. Merchants then see "Bank key not stored" until they press **Update bank keys** while online. Free plans may also sleep and take a while to wake. Don't redeploy on demo day, and check the host's current free-tier terms.

### Why not a Cloudflare Worker?

A Worker isn't a Node server: it has no local disk and doesn't run this Express app as is. `server.js` stores its key and data in files, so it would need rewriting (routes and storage moved to something like KV, D1 or Durable Objects). That's a real rewrite, not worth it before a deadline. Cloudflare **Tunnel** (above) is a different product and works with the code unchanged.

## 5. Before the demo

- Load `/merchant.html` over the public link while online, press **Update bank keys**, then **Clear log**.
- Turn airplane mode on only after that. Reloading offline works because the service worker cached the app.
- Test the camera on the real phone over HTTPS, and keep the paste-the-code fallback in mind.
- Change `OPERATOR_KEY` if the link is shared publicly.
