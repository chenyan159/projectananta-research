# Investment Research Site

Static read-only research dashboard for company rankings, company reports, industry reports, valuation snapshots, and factor scores.

## Local Build

Run from `D:\drive\Investment\tools\site`:

```powershell
npm install
npm run pages:prepare
```

`npm run pages:prepare` rebuilds the ETL data, builds the Vite app, and syncs the publishable static site into `docs/`.

## GitHub Pages

GitHub Pages should publish from:

- Branch: `main`
- Folder: `/docs`

Current public URL:

- `https://projectananta.com/`

Fallback GitHub Pages URL:

- `https://chenyan159.github.io/projectananta-research/`

`projectananta.com` is configured by `public/CNAME` and `docs/CNAME`. The domain is currently registered at Cloudflare Registrar, so Cloudflare DNS is required until the domain can be transferred out after the 60-day registrar lock.

## Update Workflow

When source Markdown, ranking tables, or financial data change:

```powershell
npm run pages:prepare
git add .
git commit -m "Update research dashboard"
git push
```

GitHub Pages will serve the updated `docs/` files after the push is processed.

## Cost Note

This setup is intended to use GitHub Pages free hosting from a public repository. It does not require GitHub Actions for publishing. While `PROJECTANANTA.COM` remains registered at Cloudflare Registrar, it uses Cloudflare DNS only; Tunnel, Access, Workers, R2, and other paid Cloudflare products are not required.
