# astrowani-pages — one-off campaign / landing pages

Served at `info.astrowani.com` as a plain static site (same pattern as `astrowani-shop/`:
committed HTML, no build step, nginx serves it directly, auto-deployed by
`.github/workflows/deploy-pages.yml` on every push to this folder).

## Adding a new page

Make a new folder with its own `index.html`:

```
astrowani-pages/
  index.html              -> info.astrowani.com/
  join-astrologer/
    index.html            -> info.astrowani.com/join-astrologer/
  <next-campaign>/
    index.html            -> info.astrowani.com/<next-campaign>/
```

Copy `join-astrologer/index.html` as a starting template — it's a single self-contained
HTML file (inline CSS, no build tooling, no external requests except the WhatsApp link),
so a new page is just: copy the folder, change the copy, change the WhatsApp number/message
constants near the bottom of the `<script>` tag if needed, commit, push.

Do NOT reference any `/api/` path from a page here — this subdomain has no backend proxy set
up (unlike `shop.astrowani.com`). If a future page needs to call the backend API, add a
`location /api/` proxy block to `vps-deployment/nginx/astrowani-pages.conf` first (copy the
one in `astrowani-shop.conf`), then update the live nginx config on the VPS by hand (see the
note in that file about certbot rewriting it in place).

## First-time server setup (one-time, owner)

1. **DNS**: in Cloudflare, add an A record `info` -> the VPS IP (same as `shop`, `backend`,
   `manu`), proxied (orange cloud), matching the existing subdomains.
2. **Deploy**: push this folder to `main` — `deploy-pages.yml` installs the nginx site on
   its first run (same "install if absent" pattern as the shop's deploy).
3. **TLS**: SSH into the VPS and run
   `certbot --nginx -d info.astrowani.com`
   the same way it was done for `shop.astrowani.com` (see `MD files/vps-git-deploy-guide.md`).
   Certbot rewrites the nginx config in place to add the 443 block — do this AFTER the first
   deploy has created `/etc/nginx/sites-available/astrowani-pages`, not before.

After that, every future page is just a folder + a git push. No further server changes.
