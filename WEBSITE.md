# Astrowani website — everything we have done, from the start

This is the running record of the new Astrowani website (`astrowani-website/`), from the
first preview on 2026-10-08 to today. Add to it whenever the website changes. The deep
technical notes for each piece live in `CLAUDE.md` (the section letters, e.g. **EN**, are
given below); this file is the readable overview.

_Last updated: 2026-11-16 (evening)._

---

## 1. What the website is

| | |
|---|---|
| **Where it runs today** | `https://shop.astrowani.com/test-site/` (a preview address, served by the shop's nginx on the VPS) |
| **Where it will run** | `astrowani.com`, which is still the old WordPress site. The switch is the **last** step before launch (see §7). |
| **What it is built with** | Plain HTML pages + `style.css`, `aw/aw.css`, `script.js` and small modules in `aw/`. No framework. The pages are generated and maintained by scripts in `aw/` (see §5). |
| **Backend** | The same Node backend as the apps (`astrowani-backend/`) serves the API, the server-rendered blog/astrologer/story pages, and the sitemap. |
| **Languages** | English at `/`, Hindi at `/hi/` — real Hindi pages with their own addresses and `hreflang`, not a translate button. |
| **Size today** | 136 English pages + 132 Hindi pages (static), plus every blog article, astrologer profile and Web Story rendered by the backend. |

### What a visitor can do on it
- Browse and filter astrologers, open each astrologer's profile page.
- Log in / sign up with OTP, recharge the wallet (Razorpay), and **chat or call** an astrologer —
  the same accounts, wallet and consultations as the app.
- Read the blog, the daily horoscope for each sign, zodiac compatibility for every pair,
  free calculators, Panchang, and the service guides.
- Read the legal pages (privacy, terms, refund, child safety, safety guidelines, account deletion).

---

## 2. Timeline — what was built, in order

### Phase 1 — the site comes alive (2026-10-08 → 10-14)
- **10-08** First preview of the new site, deployed under `shop.astrowani.com/test-site`.
  Fixed the nav dropdowns closing before the mouse reached them.
- **10-09/10** Compressed the 41 MB 3D hero model; added the scroll-in nav; cache-busting
  `?v=` on `style.css` / `script.js`.
- **10-12** **Live consultations on the website**: chat and call with astrologers, the shared
  wallet, the mobile menu. API calls go through the shop's same-origin proxy. FAQ accordion.
  Chat uses the app's colours, sends the birth details automatically, shows the intro banner.
  **Photos in a consultation chat** — crop, draw and write on them (shared with the apps, CLAUDE.md DX).
- **10-13** "Browse by concern" fixed; hero phones that cycle through the centre; 3D model hint.
  **Real legal pages** (copied verbatim from astrowani.com) and the social icon row.
  **The real blog** — listing and article pages from the live `blogs` table.
  Play Store links on the hero phones/mascot and a footer badge. Footer layout tuning.
  **The blog agent** (CLAUDE.md DZ/EA): writes SEO articles automatically, with slugs and a sitemap.
- **10-14** Rotating zodiac wheel on the hero, centred logo mark.

### Phase 2 — the SEO foundation (2026-10-29 → 10-30) — CLAUDE.md EN, EO, EP, EQ
An audit found the site was well built but invisible to search. Fixed:
- **Every page** now has a meta description, a canonical address, Open Graph/Twitter cards,
  structured data (JSON-LD), icons and a web manifest — all from one script, `aw/apply-seo.js`,
  with the domain in **one line** (`SITE_BASE`) so the domain move is a one-line change.
- A real **404** page (missing addresses used to answer "200 OK" — fixed in nginx).
- Keyword-led page titles; the homepage H1 carries the main keyword; the homepage links into
  the service pages.
- **Six (later seven) service landing pages**: Kundli reading, Tarot, Numerology, Career
  astrology, Vastu, Lal Kitab, Palmistry — each with an FAQ and FAQ structured data.
- **Dark maroon only** — the light/dark toggle was removed.
- The free call is **7 minutes** in all site text.
- **Hindi URLs** for every page (`/hi/...`), with `hreflang`, built by `aw/make-hindi-pages.js`
  from a dictionary (`aw/hindi-strings.json`, now 2,800 strings).
- Mobile overflow and reduced-motion fixes.
- **PostHog analytics** on the website, using the apps' own event names (CLAUDE.md EP).
- **Responsive images** (`srcset`) and image weight cut (homepage images 757 KB → 247 KB).
- **Layout shift fixed**: the astrologer roster and the article hero image now reserve their
  height (CLS 0.967 → 0.02 on slow phones — invisible on wifi, which is why nobody had seen it).
- **Server-rendered blog pages** via nginx (articles now have their own title, H1 and
  structured data in the HTML Google first receives).
- `robots.txt` that actually works on the shop domain; a Lighthouse workflow on GitHub.

### Phase 3 — security (2026-11-14)
- Blocked stored XSS from astrologer profile text; authorised socket relays; patched dependencies.

### Phase 4 — growing the number of pages Google can index (2026-11-16) — CLAUDE.md ET
The 2026-10-30 gap analysis found the whole site was only 56 URLs. Today:
- **One page per calculator** (12, EN + HI): love, FLAMES, friendship, name compatibility,
  numerology, Lo Shu grid, lucky vehicle number, moon phase, nakshatra, rashi, rising sign,
  sun sign. **Bug fixed**: the rising-sign calculator had been wrong since it was written
  (cast 5.5 h early, and calculating the Descendant).
- **A daily horoscope page per sign** (12, EN + HI, "rashifal"), with today's reading baked
  into the HTML every night on the server.
- **Clean article addresses**: `/blog/<slug>` and `/hi/blog/<slug>`; every old form 301s there.
  The admin blog editor got an "Article address" field (locked once published).
- **A profile page for every astrologer**: `/astrologers/<slug>` (58 today), private data
  never shown, reviews anonymous.
- **The nav** no longer clips "Sign up" between 900 and 1160 px wide.
- **AI crawler policy**: all allowed (owner's decision). _Cloudflare still blocks some — see §7._
- **IndexNow**: Bing/Copilot/Yandex are told about new and changed pages automatically.
- **Non-blocking Google Fonts** on every page.
- **SEO audit leftovers**: `<nav>`/`<article>` landmarks, title lengths, the API host for move day.
- **Redirect map for the domain move**: every old WordPress address (83 of them) → its new page.
- **Zodiac compatibility**: 78 sign-pair pages + a hub (EN + HI), each built from four real
  factors (element, temperament, ruling-planet friendship = Guna Milan Graha Maitri points,
  zodiac distance = Bhakoot points), not filler.
- **Web Stories for Google Discover** (CLAUDE.md EU):
  - 24 daily horoscope stories (12 signs × EN/HI) at fixed addresses, rewritten every night;
  - one story per blog article at `/stories/<slug>`, made automatically from the article's
    own sections (3 of the 8 current articles qualify; the 5 older ones are one block of text).
  - All pass Google's official AMP validator; covers generated for each sign.
- **"What India asks an astrologer"** — an anonymised data report (EN + HI) from 2,330 real
  consultations. **Not published yet**: it is noindex and unlinked until the owner approves (§6).
- **Image cache fix**: every image address now carries a content hash (`?h=`), so a changed
  image is never served stale by Cloudflare again. This also un-sticks the four images that
  were stuck at their old size.
- **Homepage speed**: the CSS the first screen needs (19 KB) is inside the HTML; the full
  111 KB of CSS no longer blocks the first paint.
- **The promo image** now says "Talk for **7**-min for Free" (redrawn in the artwork's own font).
- **Lal Kitab category** created in the database (English + Hindi, with an image), so
  astrologers can add it to their specialties in the astrologer app.
- **Deployed the same day** in the safe order (nginx routes first, from a branch, then
  `main`). Blogs never went down; old article links 301 to `/blog/<slug>`.
- **Photo credit back to `#f4d8bc`.** The server-side HTML cleaner had been stripping the
  credit's class (and the FAQ accordion's) since 2026-10-30; those four classes now survive.
- **The 3D guide loads by itself** as you scroll to it — no picture, no button (a retry
  button appears only if loading fails).
- **Homepage speed, round 2** (measured with Lighthouse 13.6.0, which replaced a pinned
  12.2.1 that could no longer read Chrome's traces):
  - size-matched fallback fonts (`Manrope Fallback`, `Marcellus Fallback`) so text does not
    re-wrap when the web fonts arrive;
  - the hero's zodiac wheel is a 17 KB WebP (10 KB on phones) instead of a 53 KB PNG;
  - the shop-card photos load only when the cards near the screen;
  - homepage sections after the hero use `content-visibility: auto` (off-screen sections,
    including the two scrolling astrologer strips, are not rendered until needed);
  - the live-roster socket connects 4 s after load.
  - **Live result:** score 55–67 → **77–87**, phone busy time 0.3–1.5 s → **0.1–0.4 s**,
    weight ~1 MB → ~0.8 MB. LCP is now mostly the server's response time (1.2–2.1 s).
  - The Lighthouse workflow gained an **A/B mode** (`ab_baseline`) that compares the
    homepage against any earlier commit on the same machine.

---

## 3. Page inventory (2026-11-16)

| Group | English | Hindi | Address |
|---|---|---|---|
| Home, About, Astrologers, Consult, Marriage, Horoscope hub, Panchang, Calculators hub, Courses, Free services, Book a call | 11 | ✓ | `/x.html` |
| Service pages (Kundli, Tarot, Numerology, Career, Vastu, Lal Kitab, Palmistry) | 7 | ✓ | `/kundli-reading.html` … |
| Calculator pages | 12 | ✓ | `/love-calculator.html` … |
| Sign horoscope pages | 12 | ✓ | `/aries-horoscope.html` … |
| Compatibility pages + hub | 78 + 1 | ✓ | `/aries-and-leo-compatibility.html` … |
| Legal pages | 7 | ✓ | `/privacy-policy.html` … |
| Data report (unpublished) | 1 | ✓ | `/what-india-asks-an-astrologer.html` |
| Blog listing + article template | 2 | ✓ | `/blog.html`, `/blog/<slug>` |
| Not for search (noindex) | 404, chat, call, wallet, concept-hero | | |
| Rendered by the backend | every article, every astrologer profile, every blog story | | `/blog/<slug>`, `/astrologers/<slug>`, `/stories/<slug>` |
| Written nightly on the server | 24 horoscope Web Stories | | `/stories/<sign>-horoscope.html` |

---

## 4. Infrastructure

| Piece | What it does | Where |
|---|---|---|
| **Website deploy** | Copies `astrowani-website/` to the VPS on push, then bakes today's horoscope + stories, then pings IndexNow | `.github/workflows/deploy-shop.yml` |
| **Nightly horoscope** | 00:01 IST: bakes the 24 sign pages + 24 Web Stories, pings IndexNow | `.github/workflows/daily-horoscope.yml` |
| **nginx routes** | Blog, clean article, astrologer profile and story routes to the backend | `vps-deployment/nginx/blog-locations.conf`, applied by `.github/workflows/apply-nginx-blog-routes.yml` |
| **Lighthouse** | Measures Core Web Vitals from a GitHub runner (this PC's connection can't) | `.github/workflows/lighthouse.yml` |
| **Sitemap** | Generated live from the pages, articles, profiles and stories | backend `GET /api/blogs/sitemap.xml` (`src/blogSitemap.js`) |
| **Domain move redirects** | 301 map, old WordPress → new pages | `vps-deployment/nginx/wordpress-redirects.conf`, `MD files/Domain-Move-Redirects.md` |
| **Analytics** | PostHog, same project and event names as the apps | `aw/analytics.js` |

**Deploy order matters** whenever new backend routes are involved:
**nginx routes first → then the backend → then the website.** Otherwise links point at
addresses nginx doesn't route yet and visitors get a 404.

---

## 5. How the pages are built (the generator chain)

Most pages are generated. After changing content, run the scripts **in this order** from
`astrowani-website/` — each consumes what the previous one wrote:

```
node aw/calculator-pages.js          # content generators, any that apply
node aw/horoscope-pages.js
node aw/service-pages.js
node aw/compatibility-pages.js
node aw/report-page.js
node aw/apply-roster-reserve.js      # reserve the roster's height
node aw/apply-srcset.js              # responsive images
node aw/apply-critical-css.js        # homepage first-screen CSS
node aw/version-images.js            # ?h= content hashes on images
node aw/bump-version.js <N>          # ?v= on CSS/JS (when CSS/JS changed)
node aw/make-hindi-pages.js          # rebuilds every /hi/ page from the English one
node aw/apply-seo.js                 # titles, descriptions, canonical, hreflang, JSON-LD
node aw/version-images.js            # once more, for the rebuilt Hindi pages
```

Rules: **every script must report 0 changes on a second run** — if one doesn't, that is the
bug. Hindi pages are always rebuilt from English, so never hand-edit a file in `hi/`.

---

## 6. The "What India asks an astrologer" report

**Status: built, NOT published.** The page exists but is `noindex`, unlinked, and has no
structured data until the owner approves. Figures (15 Jun – 16 Nov 2026, 2,330
consultations, 1,410 people):
- Topics in chats: love/relationships 35%, marriage 22%, career 14%, money 5%, abroad 5%,
  family 4% (studies and health under 20 chats → not shown).
- Language typed: Hinglish 90%, English 8%, Hindi script 2%.
- Who: 69% women; 64% aged 18–27; 75% unmarried. (Under-18 never reported.)
- Where (top): Uttar Pradesh, Maharashtra, Bihar, West Bengal, Rajasthan.
- When: busiest hour noon–1 pm; busiest day Sunday, quietest Tuesday; 9% between 11 pm and 3 am.

**Privacy rules (enforced by the generator):** only totals left the database; no names,
numbers, ids or message text; any group under 20 is dropped; nobody under 18 is reported.

**To publish:** set `APPROVED = true` in `aw/report-page.js`, run the chain (§5), and add the
page to `STATIC_PAGES` in `astrowani-backend/src/blogSitemap.js`.

**How the numbers were pulled (read-only SQL, counts only), for the next edition.**
Population used in every query: `chat_sessions` that ended, lasted 1 minute to 12 hours,
excluding the store-reviewer number (…9999999999) and the analytics-excluded customer.
- Consultation type / median length: group by `call_type` + `is_free`, `percentile_cont(0.5)` of duration.
- Hour / day: `extract(hour from started_at at time zone 'Asia/Kolkata')`, `to_char(…,'ID Dy')`.
- Gender, age band (`width_bucket(age,18,68,5)`), marital status, state: from `customers`, counted per distinct customer.
- Topics: for each chat session, the customer's own messages (`chat_messages.sender_id = caller_id`)
  joined into one lower-cased string inside the database and matched with keyword regexes
  (English, Hinglish, Devanagari) per topic; only the per-topic COUNT is returned.
- Language: same text, excluding the automatic birth-details message — Devanagari present →
  Hindi; common Hindi words in Latin letters → Hinglish; otherwise English.
- The numbers live in `aw/report-data.js`.

---

## 7. What is still open

**Owner (dashboards and accounts):**
1. **Deploy** the 15 local commits from 2026-11-16 (order in §4).
2. **Cloudflare**: switch off "Block AI bots" and the managed robots.txt if AI training
   crawlers should read the site; optionally add a short cache rule for HTML pages
   (server response time is most of the remaining homepage slowness).
3. **Search Console + Bing Webmaster Tools**: verify the site, submit the sitemap; watch the
   Web Stories and Enhancements reports.
4. **Approve (or not) the data report** (§6).
5. **The domain move** to astrowani.com — last, before launch (`MD files/Domain-Move-Redirects.md`).
6. **The free call length**: the live database still says **11 minutes** while the site, the
   promo image and the app code say **7** (CLAUDE.md EI). Flip the database row and send the
   app update together.
7. **Lal Kitab**: astrologers who offer it should add it to their specialties in the astrologer
   app. Replace the category image from admin if a different one is preferred.
8. A **Hindi speaker** should read some horoscope, compatibility and report pages.
9. **EU consent banner** — not needed for India; an open question for EU visitors.
10. Google Business Profile, Wikidata, Reddit/Quora presence.

**Homepage — what is left:** the server's response time (1.2–2.1 s; a Cloudflare cache rule
for HTML, owner's dashboard), and a 0.078 layout shift that exists only on the English
homepage (Hindi is 0), cause not yet identified. **It is NOT the fonts**: self-hosting
Manrope and Marcellus with preloads was built and A/B-tested on 2026-11-16 — CLS stayed at
0.078 and LCP got worse (the preloads compete with the hero image), so it was not deployed.
That work is kept on the `self-host-fonts` branch (GitHub: `perf-fonts`).

**After deploy, to check live:** Lighthouse (homepage speed with the inlined CSS), nginx
`-t`, the nightly bake and its 24 stories, IndexNow, `/stories/<slug>` and `/blog/<slug>`,
the four previously stuck images now fresh.

---

## 8. Commit history (website)

Full list: `git log --reverse -- astrowani-website`. Key commits:

| Date | Commit | What |
|---|---|---|
| 2026-10-08 | `61a62812` | First preview at shop.astrowani.com/test-site |
| 2026-10-12 | `aeb03575` | Live consultations, shared wallet, mobile nav |
| 2026-10-12 | `51422c46` | Photos in a consultation chat |
| 2026-10-13 | `bce63d70` | Real legal pages |
| 2026-10-13 | `ec9a663b` | Real blog section |
| 2026-10-13 | `11af6602` | Automated blog agent, slugs, sitemap |
| 2026-10-29 | `e83cb7c7` | The SEO head pass |
| 2026-10-29 | `92998ff4` | Structured data, real 404, landmarks |
| 2026-10-29 | `889fd50e` | Six service landing pages |
| 2026-10-29 | `c5defaf0` | Dark maroon only |
| 2026-10-29 | `5a76745e` → `22753a90` | Hindi URLs for every page |
| 2026-10-30 | `d5c4dee2` | PostHog analytics |
| 2026-10-30 | `dbea5ffa` | Responsive images, palmistry page |
| 2026-10-30 | `b6a6463a` | Layout shift fix |
| 2026-10-30 | `c4b04a13` | Server-rendered blog pages |
| 2026-11-14 | `8a9ffbf1` | Security: stored XSS, socket auth |
| 2026-11-16 | `e0b6f476` | Calculator pages; rising-sign fix |
| 2026-11-16 | `7b4a836d` | Sign horoscope pages |
| 2026-11-16 | `317611ac` | Clean article addresses |
| 2026-11-16 | `39566a02` | Astrologer profile pages |
| 2026-11-16 | `7f947953` | WordPress redirect map |
| 2026-11-16 | `db78426e` | Nav clipping fix; AI crawler policy |
| 2026-11-16 | `ea6af738` | IndexNow, baked horoscopes, non-blocking fonts |
| 2026-11-16 | `bbeaa550` | SEO audit leftovers |
| 2026-11-16 | `e8275f91` | Zodiac compatibility pages |
| 2026-11-16 | `41c58ddf` | Web Stories |
| 2026-11-16 | `cf4cf2bb` | Data report (unpublished) |
| 2026-11-16 | `519c2250` | Content-hashed image URLs |
| 2026-11-16 | `e9381f9e` | Homepage critical CSS |
| 2026-11-16 | `1df59c01` | Promo image says 7 minutes |
