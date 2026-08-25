# astrowani-shop — Wani Shop, the storefront at shop.astrowani.com

A static site with no build step: one HTML shell, one stylesheet, one script, and
content-hashed images in `assets/`. Nginx serves the folder directly.

| | |
|---|---|
| Live at | https://shop.astrowani.com |
| Served from | `/var/www/astrowani/shop` on the VPS (`76.13.243.165`) |
| Nginx config | `vps-deployment/nginx/astrowani-shop.conf` |
| Deploy | `.github/workflows/deploy-shop.yml`, on any push to `main` touching `astrowani-shop/**` |
| Also runs inside | the customer app's Store tab, as a WebView — `astrowani_customer-main/src/screens/Remedies/StoreWebView.js` |

## What it is

A real shop. Certified gemstones and sixty-four pujas, each with its own page, a cart, phone
OTP sign-in, Razorpay payment, and order tracking. Orders land in the same `orders` table
the app writes to, against the same customer, and show up in `astrowani-admin`.

**The catalogue is live.** Products come from `GET /api/remedies` (the `remedy_items` table an
admin edits in the dashboard). The `PRODUCTS` array inside `store.js` is a fallback shown only
while that fetch is in flight or after it fails — every buy control on a fallback product is
disabled, because the checkout can only price a real `remedy_items` uuid.

## The three files

| File | What it is |
|---|---|
| `index.html` | The shell: header, footer, cart bar, toast, and an empty `<main id="view">`. **Served for every path.** |
| `store.js` | Everything else — router, catalogue, cart, session, checkout, and every page. |
| `store.css` | One stylesheet. Three colour tokens (brown, cream, gold) and nothing else. |

`gemstones/index.html` and `pujas/index.html` are byte-identical copies of `index.html`, so
those two real directories keep resolving for old bookmarks. **`stamp.py` writes them — never
edit them by hand.**

## Routing

There is no server-side routing and none is needed. Nginx ends its `location /` block with
`try_files $uri $uri/ /index.html`, so any path that is not a file on disk is served the shell,
and the router in `store.js` decides what it means.

```
/                       home
/gemstones/             listing, 12 per page
/gemstones/page/3/      page 3
/gemstones/ruby-manik/  a product
/pujas/  /pujas/page/2/  /pujas/gauri-ganesh-puja/
/purpose/wealth/        shop by purpose
/calculators/           moolank + gemstone finder
/cart/  /checkout/  /orders/  /account/  /login/
/about/ /contact/ /shipping/ /returns/ /certification/ /privacy/ /terms/ /faq/
```

Product slugs come from the product's own title. Rename a product in the admin and its URL
changes with it; the old URL renders a "not found" page with a route back to the listing, which
is the honest answer — there is nothing to redirect to.

**This needed no nginx change**, which matters: certbot rewrote that file in place on the VPS
and the deploy workflow deliberately never overwrites it.

## Money

Three rules, the same three `astrowani-backend/src/orderRoutes.js` is built on. Do not weaken
them.

1. **The client never computes a price the customer is asked to pay.** The cart shows a
   subtotal estimate, labelled as an estimate. The only figure ever shown next to a Pay button
   comes from `POST /api/orders/quote`, and `POST /api/orders/checkout` re-derives it and
   ignores anything money-shaped in the request body.
2. **Razorpay saying "paid" proves nothing.** Only `POST /api/orders/verify-payment`'s
   signature check confirms an order. Until it returns, the customer is told nothing. If it
   fails, the page says the payment could not be *confirmed* and tells them not to pay
   again — never that it failed.
3. **Ordering is gated per category, server-side.** `GET /api/store/config` tells the page
   which categories are accepting orders so a card can say so up front, but `/checkout` 403s a
   blocked category regardless. The page-side gate fails closed.

## Sign-in

Phone OTP, using the same `/api/users/mobile-otp-request` and `/mobile-otp-verify` the two apps
use. The JWT is the same customer identity, which is the whole point: a web order appears under
My Orders in the app and against the right customer in the admin.

Inside the app there is no sign-in at all — `StoreWebView.js` injects the customer's existing
token before the page's own scripts run. That token is never written to `localStorage` and
cannot be signed out from here; the app owns that session.

## Payment inside the app

The app runs Razorpay's **native** sheet on the page's behalf. The page posts
`{type: 'razorpay', options}` over the WebView bridge, `StoreWebView.js` calls
`RazorpayCheckout.open`, and the signed response is injected back into the page, which verifies
it server-side exactly as it would on the web.

This is not a nicety. Paying by UPI in a WebView hands off to an `intent://` URL that the
WebView cannot follow, and `onShouldStartLoadWithRequest` would push it to the system browser —
taking the customer out of the app mid-payment. The page detects the bridge by the
`window.__ASTROWANI__.nativePay` flag the app sets, so a build without it falls back to the web
widget rather than hanging.

## Editing it

Edit `index.html`, `store.js` or `store.css`, then:

```bash
python stamp.py
```

That syncs the two shell copies and re-stamps the `?v=` cache hashes. **Run it after every
edit** — nginx caches CSS and JS for four hours, so without a new hash your change is invisible
to anyone holding a cached copy.

Then commit and push to `main`.

Image references point at content-hashed filenames (e.g. `assets/8f3a91c2b40e.jpg`). The hash is
of the file's own bytes, which is what lets nginx serve them `immutable` for a year safely. To
replace an image, either keep the existing filename or rename it and update the reference.

## Running it locally

```bash
node --env-file=astrowani-backend/.env vps-deployment/scripts/shop-dev-server.js
```

Serves the site on `http://localhost:4599` with the same `try_files` fallback nginx uses, and
mounts the real order routes so `/api/store/config`, `/quote` and `/checkout` answer for real.

It deliberately does **not** boot `astrowani-backend/index.js` — that starts sessionManager's
billing worker and `checkEarningsResets()` against the live database.

Two things to know:

- It talks to the **live** Supabase. Reads are free; do not complete a checkout against it
  without intending to.
- To test a category that is not yet accepting orders, use the dev-only override rather than
  editing `app_settings` (which is production data the live shop reads):
  `SHOP_DEV_FORCE_ORDERING=puja,specific_puja node --env-file=... shop-dev-server.js`

## What is deliberately not here

- **No local catalogue editor.** There used to be one behind `?admin=1` that wrote to
  `localStorage`. Now that `remedy_items` is the real catalogue, a second editor that changes
  what one browser sees and nothing else is worse than none — the admin dashboard is where the
  catalogue is edited.
- **No cart on the server.** The cart is `localStorage`, keyed by `remedy_items` uuid, exactly
  as the app's `CartContext` is. A stale price is corrected by the quote before any money
  moves, so cross-device sync is not worth a table.
- **No Razorpay webhook.** If a payment succeeds but the browser dies before
  `verify-payment` lands, the order stays `pending_payment`. The recovery path is manual
  (admin Orders → "Include abandoned checkouts" → "Mark paid"). This is inherited from the
  app's checkout and is the first thing to add if the shop sees real volume.

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
