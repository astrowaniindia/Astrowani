# VPS security hardening (applied 2026-09-12)

What is live on the Hostinger VPS, and how to reapply it on a rebuilt server. Every
file referenced here is in this folder. None of it contains secrets.

The VPS is shared with other, unrelated projects. Everything below touches either
Astrowani's own nginx sites or server-wide SSH only. Do not widen the nginx changes to
other sites' server blocks.

## 1. Only Cloudflare can reach the Astrowani sites

- `nginx/astrowani-cloudflare.conf` goes to `/etc/nginx/conf.d/`.
- `nginx/snippets/astrowani-cloudflare-only.conf` goes to `/etc/nginx/snippets/`.
- Add `include snippets/astrowani-cloudflare-only.conf;` after every `server_name` line
  in the three Astrowani sites. Edit the file that `sites-enabled/<site>` really points
  to: `sites-enabled/backend.astrowani.com` is a regular file, not a symlink.
- `nginx -t && systemctl reload nginx`. Never leave a config on disk that fails
  `nginx -t` (see the 2026-09-11 outage in `MD files/`).

Check:
- `https://backend.astrowani.com/health` returns 200.
- `curl --resolve backend.astrowani.com:443:<vps-ip> https://backend.astrowani.com/health`
  gets no response (000).

On port 80 a direct hit still gets Certbot's 301 to HTTPS, which serves no content.

## 2. Real visitor IPs

This comes from the same snippet (`real_ip_header CF-Connecting-IP`). `TRUST_PROXY_HOPS`
stays at its default of 1: nginx's X-Forwarded-For hop is now the real visitor, which is
the hop Express trusts, so the backend's per-IP rate limits count users rather than
Cloudflare edges.

## 3. SSH: keys only, and fail2ban

- `ssh/00-hardening.conf` goes to `/etc/ssh/sshd_config.d/`, then
  `sshd -t && systemctl restart ssh`. Restarting does not drop open sessions.
- `apt-get install -y fail2ban`, copy `fail2ban/sshd.local` to `/etc/fail2ban/jail.d/`,
  then `systemctl enable --now fail2ban`.

Check: `ssh -o PubkeyAuthentication=no root@<vps>` gives `Permission denied (publickey)`.

## 4. Cloudflare zone settings for astrowani.com (applied 2026-09-12)

Four hostnames are proxied: the apex, `backend`, `shop` and `manu`. Every other record,
including `admin.astrowani.com` (a different project), is DNS-only, so zone settings do
not reach it.

- **Minimum TLS version: 1.2.** It was 1.0. The apps need Android 7+ (minSdk 24) or
  iOS 15.1+, and both support TLS 1.2. Check: `curl --tlsv1.1 --tls-max 1.1 ...` is
  refused.
- **SSL/TLS encryption mode: Full (strict).** It was Automatic, which had picked Full, so
  origin certificates were not validated. All four origins have valid certificates. The
  three app hostnames use Certbot on the VPS, which renews them automatically.
  **If a Certbot renewal ever fails, these sites return Cloudflare error 526.** Fix the
  certificate; do not downgrade the mode.
- Already on and left as they were: the Cloudflare managed ruleset (always active on
  Free), Browser Integrity Check, Always Use HTTPS, Automatic HTTPS Rewrites.
- **Deliberately left off:**
  - *Bot Fight Mode.* On the Free plan it cannot be bypassed for API paths, and it can
    challenge the mobile apps' non-browser requests.
  - *HSTS.* Once browsers cache it, it is hard to undo, and `includeSubDomains` would
    also bind the other project's subdomain.

## Not covered here (decisions for the owner)

- **Database backups.** The Supabase project is on the Free plan, which has no backups
  and no point-in-time recovery. Pro includes daily backups.
- **VPS backups.** Hostinger's are weekly. Daily backups are a paid upgrade.
- **Cloudflare dashboard settings.** Check SSL mode, WAF managed rules and security
  level. Test Bot Fight Mode against the mobile apps before leaving it on: it can
  challenge non-browser API clients.
