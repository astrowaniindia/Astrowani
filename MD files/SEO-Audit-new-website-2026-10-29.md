# SEO audit — the new Astrowani website

**Audited 2026-10-29.** Target: `astrowani-website/` as served at
`https://shop.astrowani.com/test-site/` — 24 HTML pages, 24 JS/CSS files, 85 assets (9.6 MB).

**Method.** Every finding below was measured, not assumed: all 24 pages were parsed for head
tags, headings, images and links; the live pages were loaded in a real browser and timed;
HTTP headers were read directly; the sitemap and both robots.txt files were fetched; and the
blog article page was inspected *after* its JavaScript had run. Where a number appears, it
came from a measurement. Where something could not be established from here, it says so.

**One caveat on timings.** Load times measured from this machine run slow — its connection
to Cloudflare is known to be erratic (recorded 2026-09-25). Byte counts, request counts and
file sizes are facts; wall-clock seconds are indicative only. Real Core Web Vitals should
come from PageSpeed Insights once the site is on its final domain.

---

## The verdict

The site is **well built and almost entirely un-indexable in its current state.** The
content pages are real server-rendered HTML with sensible copy and clean headings — that is
the expensive part and it is already done. What is missing is everything that tells a search
engine the pages exist, what they are, and which URL is canonical. There is no canonical tag
anywhere, no Open Graph anywhere, no structured data on any static page, and 22 of 24 pages
have no meta description. More fundamentally, the whole site lives on a **test path** whose
robots.txt a crawler never reads.

None of this is hard to fix. Most of it is one template pass plus a domain move. But until
the domain move happens, nothing else is worth doing, because every URL and every absolute
link would have to be rewritten afterwards.

---

## 1. Blockers — nothing can rank until these are fixed

### 1.1 The site is on a test path, and so is every URL in the sitemap

All 23 sitemap URLs point at `https://shop.astrowani.com/test-site/…`. `astrowani.com` is
still the old WordPress site. So anything Google indexes today indexes the test copy, at a
URL you intend to abandon — and a later move means redirects from a path you never wanted
indexed in the first place.

This is the root dependency. **Everything below should be done after the move, or as part of
it**, except the items marked otherwise.

### 1.2 Your robots.txt is never read

`robots.txt` is only honoured at a **host root**. Crawlers read
`https://shop.astrowani.com/robots.txt` — which is a Cloudflare content-signals file,
nothing to do with this site. The carefully written
`https://shop.astrowani.com/test-site/robots.txt` is just a text file in a folder.

Two consequences, both silent:

- the `Disallow: /wallet.html` rule has no effect, and
- the `Sitemap:` directive is never seen, so the sitemap is only discoverable if submitted
  manually in Search Console.

### 1.3 Any URL that does not exist returns HTTP 200

```
GET /test-site/no-such-page-xyz   →  200 OK
```

A missing page should return **404**. Returning 200 means every typo, every stale link and
every crawler guess produces a page Google is entitled to index. This creates unlimited
indexable URLs and is one of the more damaging technical faults a site can have. There is
also no `404.html`.

### 1.4 Zero canonical tags, and the homepage exists at two URLs

No `<link rel="canonical">` on any of the 24 pages. And:

```
/              →  200
/index.html    →  200   (no redirect)
```

Two URLs, identical content, nothing telling Google which one counts. Every page needs a
self-referencing canonical, and one of those two should 301 to the other.

---

## 2. High impact

### 2.1 22 of 24 pages have no meta description

Only `blog.html` (136 chars) and `blog-post.html` (43, a placeholder replaced by JS) have
one. Google will synthesise a snippet from page text, which it does badly on pages that open
with navigation. Each page needs a hand-written 140–160 character description.

### 2.2 No Open Graph or Twitter tags on any static page

Every static page shares as a bare URL with no title, description or image — in WhatsApp,
which matters more than anything else for an Indian consumer app. The blog article page
*does* set these correctly at runtime, so the pattern exists; it simply was never applied to
the other 23 pages.

### 2.3 No structured data on any static page

Zero `application/ld+json` across all 24. Missing, in rough order of value:

| Schema | Where | Why |
|---|---|---|
| `Organization` / `LocalBusiness` | every page | knowledge panel, brand entity |
| `WebSite` + `SearchAction` | homepage | sitelinks search box |
| `FAQPage` | horoscope, marriage, free-services, calculators | FAQ rich results |
| `BreadcrumbList` | every inner page | breadcrumb trail in SERPs |
| `Service` / `Offer` | consult, book-call | service rich results |
| `Person` | astrologer profiles | entity association |

The blog's `Article` schema is present and valid (an `@graph`), but its `description` field
is an **empty string** while the meta description is populated — a small, real bug in the
generator.

### 2.4 Eleven of 24 pages are orphaned from the homepage

The homepage links to 13 pages. It does **not** link to:

`calculators.html` · `horoscope.html` · `panchang.html` · `free-services.html` ·
`courses.html` · `consult.html` · `chat.html` · `call.html` · `blog-post.html` ·
`concept-hero.html` · `wallet.html`

The first six are your actual commercial and content pages — `calculators.html` alone has
13,900 characters of text. They are in the sitemap, so Google can find them, but they
receive no internal link equity from the strongest page on the site, and a crawler following
links would never reach them. `consult.html` is the real "chat with an astrologer" landing
page and nothing links to it.

### 2.5 `chat.html` and `call.html` are app screens, and the sitemap submits them as landing pages

This one is worth reading carefully, because `robots.txt` documents the opposite:

> *"chat.html and call.html look like app screens but are in fact the 'Chat with an
> Astrologer' / 'Call an Astrologer' landing pages, which carry the highest-intent keywords
> on the site. They are indexed deliberately."*

**That comment is wrong.** Their entire text content is:

```
call.html:  "Astrologer · Connecting… · Mute · Camera off · End"
chat.html:  "Astrologer · Connecting… · End chat ·
             You are connected. Billing is per minute from now. · Send"
```

They are the live consultation UI. Both have **no H1**, ~1,100 characters of text, and
zero or one internal link. Submitting them means Google can serve a page reading
"Connecting…" for the query *chat with an astrologer*.

The real landing page is `consult.html` — H1 "Chat with an astrologer", 4,200 characters —
and it is in neither the navigation nor anything else's link graph.

**Fix:** remove `chat.html` and `call.html` from the sitemap, `Disallow` them alongside
`wallet.html`, correct the comment in `robots.txt`, and promote `consult.html` into the
navigation.

### 2.6 Hindi is invisible to search

Hindi is a client-side dictionary swap: `ASTROWANI_I18N_DICT` in `script.js` replaces
`textContent` on tagged elements when `data-lang="hi"`. There are **no Hindi URLs and no
`hreflang` tags anywhere**.

So every Hindi query — an enormous share of Indian astrology search — can only ever reach an
English page. For a market where Hindi intent is most of the volume, this is probably the
single largest missed opportunity on the site, and the only fix is real Hindi URLs
(`/hi/…`) with reciprocal `hreflang` annotations.

### 2.7 Three pages have no H1, and blog articles have two

`blog-post.html` (before JS), `call.html` and `chat.html` have no `<h1>`. Blog articles
render **two** — the English headline and the Hindi headline — which is a duplicate-H1
signal even if CSS hides one.

---

## 3. Performance

Measured live on the homepage: **43 requests, 5.0 MB transferred**, 4.4 MB of it local
assets.

| File | Size | Note |
|---|---|---|
| `assets/models/astrologer-phone-screen.glb` | **2,383 KB** | a 3D model on the homepage |
| `@google/model-viewer` (jsDelivr) | 201 KB | the library that renders it |
| `assets/logo.png` | **522 KB** | used as the logo **and the favicon**, so every page loads it |
| `shop-vastu.jpg` | 282 KB | |
| `svc-horoscope.png` | 166 KB | a service icon, as PNG |
| `zodiac-wheel.png` | 156 KB | |

**The 3D model and its viewer are 2.6 MB — over half the page.** On a mid-range Indian
Android phone on 4G that is the difference between a usable LCP and a bounced visit. Either
lazy-load it well below the fold, replace it with a video or an image sequence, or drop it.

**The 522 KB favicon is the easiest win on the site.** A proper favicon is 1–5 KB.

Other measured issues:

- **All 80 images across all pages lack `width`/`height`.** Guaranteed layout shift (CLS),
  which is a ranking signal.
- **Only 20 of 80 images are lazy-loaded.**
- **106 KB of render-blocking CSS** in two files (`style.css` 71 KB + `aw/aw.css` 35 KB),
  both in `<head>` with no critical-CSS split.
- **Google Fonts render-blocking** — two families, Manrope at five weights.
- **`Cache-Control: max-age=14400`** (4 hours) on versioned assets. They already carry
  `?v=N` cache-busting, so they can safely be `max-age=31536000, immutable`. As it stands a
  returning visitor re-downloads everything daily.

Compression is correctly configured — brotli on HTML, gzip on CSS/JS. That part is fine.

---

## 4. Per-page detail

| Page | Title len | Meta desc | Canonical | OG | JSON-LD | H1 | Imgs | No alt | No w/h | In nav |
|---|---|---|---|---|---|---|---|---|---|---|
| `about.html` | 20 | **none** | **none** | **none** | **0** | 1 | 3 | 0 | 3 | yes |
| `astrologers.html` | 27 | **none** | **none** | **none** | **0** | 1 | 3 | 0 | 3 | yes |
| `blog-post.html` | 16 | 43 | **none** | **none** | **0** | **0** | 3 | 0 | 3 | **no** |
| `blog.html` | 16 | 136 | **none** | **none** | **0** | 1 | 3 | 0 | 3 | yes |
| `book-call.html` | 23 | **none** | **none** | **none** | **0** | 1 | 3 | 0 | 3 | yes |
| `calculators.html` | 38 | **none** | **none** | **none** | **0** | 1 | 3 | 0 | 3 | **no** |
| `call.html` | 30 | **none** | **none** | **none** | **0** | **0** | 1 | 0 | 1 | **no** |
| `chat.html` | 35 | **none** | **none** | **none** | **0** | **0** | 1 | 0 | 1 | **no** |
| `child-safety.html` | 24 | **none** | **none** | **none** | **0** | 1 | 3 | 0 | 3 | yes |
| `concept-hero.html` | 24 | **none** | **none** | **none** | **0** | 1 | 2 | 0 | 2 | **no** |
| `consult.html` | 51 | **none** | **none** | **none** | **0** | 1 | 3 | 0 | 3 | **no** |
| `courses.html` | 19 | **none** | **none** | **none** | **0** | 1 | 3 | 0 | 3 | **no** |
| `delete-account.html` | 31 | **none** | **none** | **none** | **0** | 1 | 3 | 0 | 3 | yes |
| `free-services.html` | 35 | **none** | **none** | **none** | **0** | 1 | 3 | 0 | 3 | **no** |
| `horoscope.html` | 49 | **none** | **none** | **none** | **0** | 1 | 3 | 0 | 3 | **no** |
| `index.html` | 40 | **none** | **none** | **none** | **0** | 1 | 18 | 0 | 18 | — |
| `marriage.html` | 42 | **none** | **none** | **none** | **0** | 1 | 3 | 0 | 3 | yes |
| `panchang.html` | 28 | **none** | **none** | **none** | **0** | 1 | 3 | 0 | 3 | **no** |
| `privacy-policy.html` | 26 | **none** | **none** | **none** | **0** | 1 | 3 | 0 | 3 | yes |
| `refund-cancellation.html` | 33 | **none** | **none** | **none** | **0** | 1 | 3 | 0 | 3 | yes |
| `report-vulnerability.html` | 32 | **none** | **none** | **none** | **0** | 1 | 3 | 0 | 3 | yes |
| `safety-guidelines.html` | 29 | **none** | **none** | **none** | **0** | 1 | 3 | 0 | 3 | yes |
| `terms-and-conditions.html` | 32 | **none** | **none** | **none** | **0** | 1 | 3 | 0 | 3 | yes |
| `wallet.html` | 21 | **none** | **none** | **none** | **0** | 1 | 1 | 0 | 1 | **no** |

**Titles.** Every title follows `<Page> — Astrowani`, which is tidy but wastes the single
strongest on-page signal. Eleven are under 30 characters against a usable ~60. `Blog —
Astrowani` (16) could be *Astrology Blog — Kundli, Doshas & Remedies | Astrowani* (54).
`Courses — Astrowani` (19) says nothing about astrology at all. No title except the
homepage's contains a keyword a person would actually type.

Blog article titles run the other way — the Kaal Sarp Dosh post's title is **77 characters**
and will truncate in results.

**Alt text is complete on every static page** — 0 of 80 images missing it. That is genuinely
well done and unusual. The exception is the blog: **4 of 7 images on an article page have no
alt**, because they are injected by JS from the database.

---

## 5. Smaller points

- **No `<main>`, `<article>` or `<nav>` element anywhere.** Navigation is `<div
  class="nav-inner">`; the blog article has no `<article>` container at all. These are cheap
  semantic wins and they help Google identify the primary content block.
- **No breadcrumbs** on any page, visible or structured.
- **Twenty links to a misspelled URL.** Every page links to
  `https://astrowani.com/astrologer-ragistration/` — "ragistration". It returns 200 because
  the typo is baked into the live WordPress site; the correct spelling 404s. It is public,
  it appears 20 times, and it looks careless to anyone who reads a status bar.
- **`concept-hero.html`** looks like a leftover design experiment — orphaned, not in the
  sitemap, but publicly reachable. Either delete it or block it.
- **`report-vulnerability.html` is missing from the sitemap** while every other real page is
  in it. Minor, but inconsistent.
- **Stylesheet version drift:** `style.css?v=43` but `aw/aw.css?v=42`. Harmless today, but
  worth knowing the bump script does not move them together.
- **`promo-free-11min-woman.webp`** advertises the 11-minute free call. The code is staged
  at 7 minutes (CLAUDE.md **EI**) while the database still says 11. Whenever that flips, this
  image and any copy around it have to flip with it.
- **No `theme-color`, no web app manifest, no Apple touch icon.**
- **No `og:locale`, no `og:site_name`** even on the blog, which does set the rest.

---

## 6. What is already right

Worth stating plainly, because an audit that only lists faults misrepresents the work:

- **The static pages are server-rendered HTML.** The homepage carries 30,500 characters of
  real text in the source. This is the thing most JS-heavy sites get wrong and it is already
  correct here.
- **Alt text is 100% complete** across all 80 static images.
- **Heading hierarchy is clean** — one H1 per page, no skipped levels except `wallet.html`.
- **The sitemap is well-designed**: served from a backend route so it cannot go stale,
  excludes the template page, the per-user page and the dev leftover, and correctly omits
  articles with no slug.
- **Compression is properly configured** (brotli/gzip).
- **`lang="en"` and a correct viewport** on all 24 pages.
- **The blog article page sets canonical, OG, Twitter and valid `Article` JSON-LD at
  runtime** — the pattern to copy onto the other 23 pages already exists in `aw/blog.js`.
- **Articles carry real internal links** — the Kaal Sarp Dosh post links to `astrologers`,
  `panchang` and two sibling articles, exactly as the generator intends.
- **Article length is good** — 1,152 words, specific and well-structured.

---

## 7. What I would do, in order

**Before anything else**

1. **Move the site to `astrowani.com`.** Every item below depends on it, and doing them
   first means doing them twice.
2. **Then** set `BLOG_SITE_BASE_URL` to the real domain and run a one-off UPDATE over
   `blogs.content_en` / `content_hi` — the three published articles carry absolute links to
   the test path.
3. **Fix the 404 handling** so missing URLs return 404, and add a `404.html`.
4. **Put `robots.txt` at the domain root** and submit the sitemap in Search Console.

**Then, one template pass (a day's work, most of the value)**

5. Self-referencing `<link rel="canonical">` on all 24 pages; 301 `/index.html` → `/`.
6. A hand-written meta description on all 22 pages that lack one.
7. Open Graph + Twitter tags on all 24 — copy the pattern from `aw/blog.js`.
8. `Organization` + `WebSite` JSON-LD sitewide; `BreadcrumbList` on inner pages; `FAQPage`
   where FAQs already exist.
9. Rewrite the 11 short titles to lead with the keyword rather than the section name.
10. Add `width`/`height` to all 80 images; lazy-load the 60 that are not.

**Then, structural**

11. Put `consult.html`, `horoscope.html`, `panchang.html`, `calculators.html`,
    `free-services.html` and `courses.html` into the main navigation.
12. Remove `chat.html` and `call.html` from the sitemap, disallow them, and fix the
    `robots.txt` comment that describes them wrongly.
13. Replace the 522 KB favicon; lazy-load or remove the 2.4 MB 3D model.
14. `Cache-Control: max-age=31536000, immutable` on versioned assets.
15. `<main>` and `<article>` landmarks.

**Then, the biggest remaining opportunity**

16. **Real Hindi URLs with `hreflang`.** This is the largest single lever on the list and
    also the most work, which is why it is last — but for an Indian astrology site it is
    probably worth more than everything above it combined.

**Finally**

17. Only once the domain has moved and the template pass is done, turn the blog agent on.
    Three articles a day against a correct template compounds; against this one, it
    multiplies the cleanup.
