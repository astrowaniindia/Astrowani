# astrowani-shop — the storefront at shop.astrowani.com

A static site. No build step, no framework, no server: `index.html` plus content-hashed
images in `assets/`. Nginx serves the folder directly.

| | |
|---|---|
| Live at | https://shop.astrowani.com |
| Served from | `/var/www/astrowani/shop` on the VPS (`76.13.243.165`) |
| Nginx config | `vps-deployment/nginx/astrowani-shop.conf` |
| Deploy | `.github/workflows/deploy-shop.yml`, on any push to `main` touching `astrowani-shop/**` |

## What it is

The gemstone storefront: 33 certified stones, shop-by-purpose tiles, a Moolank/Bhagyank
calculator, a Gemstone Finder, cart and checkout.

**Everything is client-side.** The cart lives in `localStorage` and checkout is a UI flow
that takes no payment and sends nothing anywhere. It does not talk to `astrowani-backend`,
Supabase, or the `store_products` table in the admin dashboard. Wiring it to real data is a
separate job; nothing here is load-bearing for the apps.

## Editing it

Edit `index.html` directly, commit, push to `main`. That's the whole loop.

The one thing to know: **image references point at content-hashed filenames** in `assets/`
(e.g. `assets/8f3a91c2b40e.jpg`). The hash is of the file's own bytes, which is what lets
Nginx serve them with a one-year immutable cache safely — a changed image gets a new name,
so no visitor is ever stuck on a stale copy. If you replace an image, either keep the
existing filename (simplest) or rename it and update the reference.

## Catalog editor

There is a browser-local catalog editor built into the page: add, edit, delete products,
and toggle which categories are browsable. It is **hidden by default**, because a shopper
who stumbles onto a "delete product" button on a storefront is a bad experience.

Open it with:

```
https://shop.astrowani.com/?admin=1
```

It stays unlocked for the rest of that browser session. Everything it changes is saved to
that one browser's `localStorage` only — it does not reach a server and no other visitor
sees it. It's for arranging the catalog visually, not for running the shop.

## First-time VPS setup

Only needed once; after that the workflow handles every deploy.

```bash
# 1. directory
mkdir -p /var/www/astrowani/shop
chown -R www-data:www-data /var/www/astrowani/shop

# 2. nginx site
cp /var/www/astrowani-monorepo/vps-deployment/nginx/astrowani-shop.conf \
   /etc/nginx/sites-available/astrowani-shop
ln -sf /etc/nginx/sites-available/astrowani-shop /etc/nginx/sites-enabled/astrowani-shop
nginx -t && systemctl reload nginx

# 3. certificate (rewrites the conf in place to add 443 + the redirect)
certbot --nginx -d shop.astrowani.com

# 4. first copy — afterwards the workflow does this
cd /var/www/astrowani-monorepo && git fetch origin main && git reset --hard origin/main
cp -r astrowani-shop/. /var/www/astrowani/shop/
chown -R www-data:www-data /var/www/astrowani/shop
```

DNS must already point `shop.astrowani.com` at the VPS before step 3, or certbot's HTTP
challenge fails.
