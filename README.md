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

- `https://chenyan159.github.io/projectananta-research/`

`projectananta.com` is not configured in the publish bundle while the domain is still registered at Cloudflare Registrar. Re-add `public/CNAME` only after the domain has been transferred to a non-Cloudflare registrar and its DNS records point to GitHub Pages.

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

This setup is intended to use GitHub Pages free hosting from a public repository. It does not require GitHub Actions for publishing and does not use Cloudflare paid features.
