# Hide Me

Print your photo without giving it away.

Make a print-ready sheet (passport, stamp, visa or custom size, any number of copies on A4/Letter/4×6), then send the print shop a **link** instead of the file. They open it and press Print. The link stops working at the time you choose, and the shop never gets the photo file.

## How privacy works

- The photo is cropped and re-saved in your browser, which removes GPS and camera metadata.
- It is then locked (AES-256-GCM) in your browser with a new random key.
- Only the locked data is uploaded. The key goes into the part of the link after `#`, which browsers never send to any server, so the server cannot unlock it.
- The server refuses the link after the expiry time (server clock) and storage deletes the data automatically. The owner can also stop a link early.
- The shop's page keeps the photo only in memory and clears it when the time is up. Nothing is saved to the shop's computer.

**Honest limit:** while the link is valid, the person viewing it can still take a screenshot, photograph the screen or choose "Save as PDF" when printing. Hide Me stops the file from being kept by default, not a determined copier.

## Project layout

| Folder | What | Hosting (free) |
|---|---|---|
| `web/` | Vite + React + TypeScript + Tailwind site | GitHub Pages at `hideme.samimreza.me` |
| `worker/` | Small API that stores locked data until it expires | Cloudflare Workers + Workers KV |

There are no accounts and no user database. "My links" is kept only in the owner's browser.

## Run locally

```bash
cd worker && npm install && npm run dev      # API on http://localhost:8787
cd web && npm install && npm run dev         # site on http://localhost:5173
```

Tests: `npm test` in both folders.

## Deploy (one-time setup)

### 1. API on Cloudflare (free plan)

```bash
cd worker
npx wrangler login
npx wrangler kv namespace create SHARES
```

Copy the `id` it prints into `worker/wrangler.toml` (replace `REPLACE_WITH_KV_NAMESPACE_ID`), then:

```bash
npx wrangler deploy
```

It prints the API address, e.g. `https://hideme-api.<your-subdomain>.workers.dev`.

### 2. Site on GitHub Pages

1. Repository **Settings → Pages → Source: GitHub Actions**.
2. **Settings → Secrets and variables → Actions → Variables → New variable**: `VITE_API_URL` = the Worker address from step 1.
3. Push to `main`. The workflow tests and publishes the site.

### 3. Domain `hideme.samimreza.me`

1. Where the DNS for `samimreza.me` is managed, add a record: **CNAME** `hideme` → `samim-reza.github.io`.
2. **Settings → Pages → Custom domain**: `hideme.samimreza.me`, then tick **Enforce HTTPS** once the certificate is ready.

`web/public/CNAME` already contains the domain.

## Free-plan limits

Cloudflare Workers KV free plan allows 1,000 writes per day. Each link uses 2 writes to create and 1 per open, so roughly 300 links a day. Stopping a link takes effect within about a minute everywhere, because KV is cached at Cloudflare's edge locations.
