# PROJECTANANTA.COM Transfer Plan

Current status as of 2026-06-03:

- GitHub Pages is configured for `projectananta.com`.
- Fallback URL is `https://chenyan159.github.io/projectananta-research/`.
- `PROJECTANANTA.COM` is registered at Cloudflare Registrar.
- RDAP registration time: `2026-06-03T07:33:25Z`.
- RDAP status includes `client transfer prohibited`.
- Current nameservers are `brad.ns.cloudflare.com` and `grannbo.ns.cloudflare.com`.
- The GitHub Pages publish bundle includes `docs/CNAME` with `projectananta.com`.
- Current operating model is Cloudflare DNS only plus GitHub Pages. Cloudflare Tunnel, Access, Workers, and R2 are not required.

## Earliest Transfer Window

Cloudflare Registrar domains cannot use non-Cloudflare nameservers while they remain at Cloudflare Registrar. Until transfer is possible, Cloudflare DNS is required. To avoid Cloudflare entirely later, transfer the domain to another registrar that allows normal DNS management.

Because the domain was registered on `2026-06-03T07:33:25Z`, the 60-day ICANN transfer lock should clear no earlier than:

- `2026-08-02T07:33:25Z`
- `2026-08-02 00:33:25 America/Los_Angeles`

Use `2026-08-03` as the practical target date to avoid edge timing issues.

## After Transfer

At the new registrar or DNS host, configure GitHub Pages DNS:

```text
@    A      185.199.108.153
@    A      185.199.109.153
@    A      185.199.110.153
@    A      185.199.111.153
@    AAAA   2606:50c0:8000::153
@    AAAA   2606:50c0:8001::153
@    AAAA   2606:50c0:8002::153
@    AAAA   2606:50c0:8003::153
www  CNAME  chenyan159.github.io
```

Use DNS-only records. Do not proxy GitHub Pages through Cloudflare unless the deployment model is deliberately changed and re-tested.

Then restore the custom domain in this repo:

```powershell
Set-Content -Path D:\drive\Investment\tools\site\public\CNAME -Value "projectananta.com" -NoNewline
cd D:\drive\Investment\tools\site
npm run pages:prepare
git add .
git commit -m "Use projectananta.com for GitHub Pages"
git push
```

Finally, in GitHub repository settings:

- Pages source: `main` / `/docs`
- Custom domain: `projectananta.com`
- Enable `Enforce HTTPS` after GitHub's DNS check passes.

If GitHub Pages shows a certificate or DNS check in progress, wait and retry. Do not reintroduce Cloudflare Tunnel as a workaround for this static site.
