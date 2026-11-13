# Hide Me

Share photos and documents without giving them away.

Send a **link** instead of the file. The other person opens it in any browser and can view and print, but there is no download, and the link stops working at the time you choose.

- **Photo prints:** passport, stamp, visa or custom size. Pick the number of copies, paper (A4/Letter/4×6/5×7), position (left / center / right, or drag the photos anywhere), the gaps between photos and the distance from the paper edge. The shop just presses Print.
- **Documents:** PDF, Word (.docx), Excel/CSV, text files, images, or a ZIP of these. Optional watermark on every page, and printing can be turned off (view only). Old .doc, PowerPoint and other formats that a browser can't show are refused with advice to "Save as PDF" first.

**Live:** https://hideme.samimreza.me (site on GitHub Pages) · API: `https://hideme-api.hideme-worker.workers.dev` (Cloudflare Worker)

## How privacy works

- Files are prepared in the owner's browser before anything leaves the device:
  - photos and images are re-drawn, which removes GPS and camera metadata;
  - spreadsheets become plain tables of text (no formulas, macros or hidden sheets);
  - ZIP files are opened on the owner's device and only the files that can be shown are kept, so the other person never receives the ZIP.
- Everything is then locked (AES-256-GCM) in the browser with a new random key.
- Only the locked data is uploaded. The key goes into the part of the link after `#`, which browsers never send to any server, so the server cannot unlock it.
- The server refuses the link after the expiry time (server clock) and storage deletes the data automatically. The owner can also stop a link early.
- The viewer has no download button. PDFs are drawn as images (no text to copy, no links, PDF scripts never run), Word comments and tracked changes are not shown, and the save/copy shortcuts are blocked. Nothing is saved on the other person's computer, and the page clears itself when the link expires.

**Honest limit:** while the link is valid, the person viewing it can still take a screenshot, photograph the screen or choose "Save as PDF" when printing. Hide Me stops the file from being kept by default, not a determined copier.

## Project layout

| Folder | What | Hosting (free) |
|---|---|---|
| `web/` | Vite + React + TypeScript + Tailwind site | GitHub Pages at `hideme.samimreza.me` |
| `worker/` | Small API that stores locked data until it expires | Cloudflare Workers + Workers KV |

There are no accounts and no user database. "My links" is kept only in the owner's browser. Up to 24 MB per link.

Libraries that are loaded only when needed: pdf.js (legacy build, so older browsers in print shops work), docx-preview, SheetJS (owner side only) and fflate (ZIP, owner side only). `npm run dev`/`build` copies pdf.js fonts and decoders into `web/public/pdfjs/`.

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
