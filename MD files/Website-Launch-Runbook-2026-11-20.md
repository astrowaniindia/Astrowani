# Website launch on astrowani.com — runbook (2026-11-20)

Everything for the move is on the git branch **`website-launch`**, which is **not pushed**.
Nothing on the live site or the server has changed yet. Follow the steps in order.
**Owner** steps need your Cloudflare, Hostinger or Google login. **Claude** steps can be
done from this repo.

## What changes, in one paragraph

Today `astrowani.com` is WordPress on Hostinger (86.38.243.199, grey cloud), and the new
site lives at `shop.astrowani.com/test-site/`. After the move, `astrowani.com` points
at the VPS (76.13.243.165, orange cloud), nginx serves the new site from
`/var/www/astrowani/site`, every old WordPress address 301s to its new page, and
`shop.astrowani.com/test-site/*` 301s to `astrowani.com/*`. **Email is not touched**:
the MX and TXT records stay on Hostinger.

## The legal pages keep their old addresses (owner's decision)

These are served **in place**, not redirected, so the apps, App Store Connect, Play
Console and the Meta app never need changing:

| Address (unchanged) | Hindi |
|---|---|
| `/privacy-policy/` | `/hi/privacy-policy/` |
| `/term_conditions/` | `/hi/term_conditions/` |
| `/refund_cancellation/` | `/hi/refund_cancellation/` |
| `/delete-account/` | `/hi/delete-account/` |
| `/child-safety/` | `/hi/child-safety/` |
| `/safety-guidelines/` | `/hi/safety-guidelines/` |
| `/report-vulnerability/` | `/hi/report-vulnerability/` |

The site's own footer links, canonicals, hreflang and sitemap all use these addresses.
Any other spelling (`/privacy-policy.html`, no trailing slash) 301s to them. The single
list lives in `astrowani-website/aw/legal-paths.js`; nginx and the checker are tested
against it. `/about-us/` and `/faq/` still redirect (to `/about.html` and `/`).

---

## Part A — before the switch (visitors see no change)

- [x] **A1 (Owner) — back up WordPress.** Hostinger → Websites → astrowani.com → Backups:
      download files **and** database. Orders, customer accounts and form entries exist
      only there.
- [x] **A2 (Owner) — Search Console, Domain property.** search.google.com/search-console →
      Add property → **Domain** → `astrowani.com` → it gives a TXT record → add it in
      Cloudflare DNS → Verify. Do it now so the old site's search data is kept as a
      baseline. Same in Bing Webmaster Tools (it can import from Search Console).
- [x] **A3 (Owner) — Cloudflare SSL mode.** Cloudflare → astrowani.com → SSL/TLS →
      Overview. It must be **Full (strict)**. If it says Flexible, tell Claude first:
      every other Astrowani host (shop, backend, manu) already has its own valid
      certificate, but that should be confirmed before switching.
- [x] **A4 (Owner) — create the origin certificate.** Cloudflare → SSL/TLS → **Origin
      Server** → **Create Certificate** → keep "Generate private key and CSR with
      Cloudflare", RSA, hostnames `astrowani.com` and `*.astrowani.com`, 15 years →
      Create. Copy the **Origin Certificate** into `D:\secrets\astrowani-origin.pem` and
      the **Private Key** into `D:\secrets\astrowani-origin.key` (the key is shown only
      once). Not into the repo — it is public.
- [x] **A5 (Claude) — put the certificate into GitHub secrets** from those files:
      `gh secret set ASTROWANI_ORIGIN_CERT < D:\secrets\astrowani-origin.pem` and the same
      for `ASTROWANI_ORIGIN_KEY`.
- [x] **A6 (Claude, with your OK) — push the install workflow to main on its own.**
      GitHub only lets you run a manual workflow that exists on `main`. That one file
      (`.github/workflows/apply-astrowani-site.yml`) triggers no deploy and changes
      nothing by itself.
- [x] **A7 (Claude) — run "Apply astrowani.com site", action `install`, on the branch
      `website-launch`.** It copies the site to `/var/www/astrowani/site`, installs the
      certificate, the nginx site and the redirect map, runs `nginx -t`, and **puts the old
      config back by itself if the test fails**. Still invisible to visitors: nothing
      points astrowani.com at the VPS yet. The log must end with "nginx reloaded" and
      "astrowani.com installed".

## Part B — the switch (about 10 minutes)

- [x] **B1 (Owner) — Cloudflare DNS.** astrowani.com → DNS → Records:
      - `A  astrowani.com` → **76.13.243.165**, proxy **ON (orange)**.
      - `www` → also orange: either `A www → 76.13.243.165` or `CNAME www → astrowani.com`.
      - **Do NOT touch** the `MX` records, the `TXT` (SPF) record, or anything named
        `mail`, `autodiscover`, `autoconfig`, `_dmarc`, `hostingermail` — that is email.
      Proxied records take effect in a minute or two.
- [x] **B2 (Claude) — confirm it is the new site.** `https://astrowani.com/` answers from
      Cloudflare with the new homepage; `/privacy-policy/` is **200**;
      `/api/blogs` returns JSON (not an HTML page).
- [x] **B3 (Claude, with your OK) — merge `website-launch` into `main` and push.** That
      deploys the website to the new folder, the backend with `https://astrowani.com` as
      its site address (sitemap, blog pages, profile pages, stories), and sends the
      changed pages to IndexNow (Bing).
- [x] **B4 (Claude) — fix the 8 articles' internal links:** run
      `astrowani-backend/sql/website_launch_blog_links.sql`. It checks itself and refuses
      to commit if any old address is left.
- [x] **B5 (Claude) — retire the preview:** run "Apply astrowani.com site", action
      `retire-test-site`. `shop.astrowani.com/test-site/*` then 301s to `astrowani.com/*`.
- [x] **B6 (Claude) — the redirect check:**
      `node vps-deployment/scripts/check-wordpress-redirects.js --live` must end in
      **all good**. It checks all 83 old addresses, the 14 legal addresses (200) and
      every other spelling of them (301).

**If anything looks wrong at B2, roll back in one step:** in Cloudflare set `astrowani.com`
and `www` back to **86.38.243.199** with the proxy **OFF (grey)**. WordPress is back
within minutes. Nothing on Hostinger has been changed.

## Part C — right after

- [ ] **C1 (Claude + Owner) — smoke test on a phone and a laptop:** login by OTP, the
      astrologer list, start a chat, wallet page, a blog article, an astrologer profile,
      a story, a missing page (real 404 page), the Hindi homepage, and every footer
      legal link. A real recharge is yours to do, if you want to test payment.
- [x] **C2 (Owner) — submit the sitemap** in Search Console and Bing (DONE 2026-11-21, both; Google: Success, 369 pages):
      `https://astrowani.com/sitemap.xml` (nginx proxies it to the backend route; the backend
      address was submitted first and then removed). `robots.txt` names it.
- [ ] **C3 (Owner) — Cloudflare, now for astrowani.com:** HSTS (start with about one month),
      a short cache rule for HTML pages, and turn off "Block AI bots" / managed
      robots.txt if AI crawlers should read the site.
- [ ] **C4 (Owner) — keep the Hostinger plan for now.** The **email** for
      support@astrowani.com may be part of it. Check in hPanel before cancelling anything.
- [ ] **C5 (decide) — old images under `/wp-content/uploads/`** now 404 (Google Images, old
      emails). If they matter, Claude can copy them over from the WordPress backup.
- [x] **C6 (Claude) — update CLAUDE.md / WEBSITE.md** with the launch record.

## What is on the branch

| File | What |
|---|---|
| `astrowani-website/aw/legal-paths.js` | The one list of legal pages and their old addresses |
| `astrowani-website/aw/apply-legal-links.js` | Points every site link at those addresses (1,864 links, 264 pages) |
| `astrowani-website/aw/apply-seo.js` | `SITE_BASE = https://astrowani.com`; legal canonicals; `<base>` on legal + 404 pages |
| `astrowani-website/*.html`, `hi/*.html` | Regenerated: new canonicals/OG/hreflang, footer links |
| `astrowani-website/dev-server.js` | Serves the old addresses locally too |
| `astrowani-backend/src/blogAgent/seo.js` | Backend site address defaults to astrowani.com |
| `astrowani-backend/src/blogSitemap.js` | Sitemap lists the legal pages at their old addresses |
| `astrowani-backend/sql/website_launch_blog_links.sql` | B4 |
| `vps-deployment/nginx/astrowani-site.conf` | The astrowani.com nginx site |
| `vps-deployment/nginx/wordpress-redirects.conf` | Legal pages served in place; other spellings 301 |
| `vps-deployment/scripts/apply-astrowani-site.sh` | install / retire-test-site, with `nginx -t` and restore |
| `vps-deployment/scripts/check-wordpress-redirects.js` | Also checks the legal addresses against nginx and the list |
| `vps-deployment/scripts/indexnow-submit.js` | Announces the legal pages at their old addresses |
| `.github/workflows/apply-astrowani-site.yml` | A7 and B5 |
| `.github/workflows/deploy-shop.yml`, `daily-horoscope.yml` | Deploy and bake into `/var/www/astrowani/site` |

## Checked before handing over

- Redirect checker offline: 83 old addresses, 41 rules, **all good**. Confirmed to fail on
  a missing legal entry and on a location serving the wrong file.
- In a real browser on the dev server: `/privacy-policy/`, `/delete-account/` and
  `/hi/term_conditions/` render with their styles; every footer link points at the old
  addresses and answers 200 in English and Hindi; a deep missing path is 404.
- Backend suites: blog agent 350/350, IndexNow 13/13, clean article URLs 30/30, astrologer
  profiles 18/18. Every page generator re-run reports 0 changes.
- The `/test-site` retirement line was dry-run against a copy of the live shop config: it
  lands in the shop's main server block, one line.
- **Not run: `nginx -t` on the new site config** (no nginx on this machine). The install
  step (A7) runs it on the server and restores the previous config if it fails.
