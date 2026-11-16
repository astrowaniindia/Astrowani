# SEO Audit: Astrowani website, 16 Nov 2026

**Audited:** `https://shop.astrowani.com/test-site/`. This is the staging address; the site
moves to `https://astrowani.com` at launch.
**Method:** I ran the claude-seo v2.6.2 checks on all **359 URLs in the live sitemap**
(357 answered, 2 timed out). I also checked robots.txt, the response headers, the AI crawlers'
access, readiness for AI agents, and content quality on one sample page of each type. I
checked these against the repo and the live API.
**Not available:** Search Console, CrUX field data and backlink data, because no Google
or Moz credentials are configured. The performance figures below are lab numbers.

## SEO Health Score: **78 / 100**

| Category | Weight | Score | Notes |
|---|---|---|---|
| Technical SEO | 22% | 80 | Canonicals, hreflang and status codes are clean. Response time is slow, and 2 pages timed out. |
| Content quality | 23% | 70 | Service, compatibility and horoscope pages are solid. 5 old blog posts and most astrologer profiles are thin. |
| On-page SEO | 20% | 85 | Titles and descriptions on all pages, none duplicated, exactly one H1 everywhere. |
| Structured data | 10% | 90 | JSON-LD on every indexable page except 2, with **0 invalid blocks**. |
| Performance (CWV) | 10% | 70 | Lab score 77–87, CLS fixed. TTFB is 0.63–1.04 s. |
| AI search readiness | 10% | 65 | Cloudflare blocks GPTBot, ClaudeBot and CCBot. There is no llms.txt. |
| Images | 5% | 90 | All images have alt text. A few server-rendered blog images have no dimensions. |

**Business type:** an online marketplace for astrology consultations (chat, call and video), plus content and free tools. It has no local, physical presence, so the local and maps checks were skipped.

### How to read this

Every finding is tagged with one of these:

- **[FIX NOW]**: a real problem today, and still a problem after the domain move.
- **[MOVE]**: caused by the staging address. It goes away or changes at the move.
- **[MOVE-RISK]**: will break at the move unless someone acts.

---

## 1. Critical

### C1. The "Play Store Reviewer" test astrologer is public [FIX NOW]

`https://shop.astrowani.com/test-site/astrologers/play-store-reviewer-1f7021` returns **200**
and is in the sitemap. `GET /api/astrologers` also lists "Play Store Reviewer" among the 57
astrologers customers see.

- **Why it matters:** Google is being invited to index a test account, which looks
  unprofessional. Worse, real customers can see that astrologer in the apps and call it.
- **The app review notes depend on it too.** They say the demo account is kept out of
  public listings (CLAUDE.md EL / EM6). That sentence is untrue while this row is visible.
- **Cause:** the website profile pages use the app's own visibility rule, so the sitemap and
  the page follow `astrologers.hidden_from_customers`. That flag is `false` again.
- **Fix:** set `hidden_from_customers = true` on astrologer `1f70210e-…`. That one change
  removes the page and the sitemap entry, and hides the astrologer from customers.

---

## 2. High

### H1. Cloudflare blocks AI crawlers that your robots.txt allows [FIX NOW, and recheck at the move]

| User agent | Status |
|---|---|
| GPTBot, ClaudeBot, CCBot | **403** |
| OAI-SearchBot, PerplexityBot, Googlebot, Bingbot | 200 |

You decided on 2026-11-16 to allow all AI bots, for both search and training. Two things on
`shop.astrowani.com` override that decision:

1. Cloudflare's "Block AI bots" setting blocks GPTBot, ClaudeBot and CCBot at the edge.
2. The managed robots.txt at the host root sends `Content-Signal: ai-train=no` and
   `Disallow: /` for 9 training crawlers.

**Fix:** turn off "Block AI bots" and "Managed robots.txt" in the Cloudflare dashboard.
astrowani.com isn't behind Cloudflare today. If the new site goes behind Cloudflare at the
move, check both settings again then.

### H2. The server responds slowly, and 2 of 359 pages timed out [FIX NOW]

- **Sampled time-to-first-byte:** `vastu.html` took 0.63–1.04 s; a blog article took
  0.94–0.96 s.
- **What it causes:**
  - Two pages timed out after 30 s during the crawl.
  - The agent-readiness check also timed out once on the homepage.
- **Why:** HTML is served as `cf-cache-status: DYNAMIC`, so every page view travels from
  Cloudflare back to the Malaysia origin. This matches the 2026-09-25 investigation.
- **Effect on rankings:** this is the largest remaining LCP factor.
- **Fix:** add a Cloudflare Cache Rule for the static `.html` pages, with a short edge TTL of
  5–30 minutes, purged on deploy. Leave the dynamic routes (blog, profiles, stories) as they
  are, or give them a short TTL too. Argo or a Cloudflare Tunnel is the larger fix.

### H3. The 5 older blog posts are thin [FIX NOW]

| Article | Words (EN) |
|---|---|
| vivaah-a-celebration-of-love-and-tradition | 77 |
| special-remedy-for-sani | 100 |
| planetary-influence-on-hands-for-palmistry | 112 |
| the-light-of-numbers-a-spiritual-science | 114 |
| is-astrology-really-true | 167 |

The 3 articles from the blog agent run 1,115–1,341 words. Five indexed posts of about 100
words each pull down the quality signal for the whole `/blog/` section.

**Fix:** either expand each post to 800+ real words, or noindex or delete them. Any post
you delete needs a 301 redirect to the most relevant article.

### H4. Most astrologer profiles are thin [FIX NOW, as planned in ET5]

- **The numbers:** 57 profiles, median **119 words** (range 84–354). 88 pages were flagged
  thin overall, and most of them are profiles or Web Stories.
- **Stories are expected to be short:** an AMP story is short by design, so ignore those.
- **Profiles are the concern:** fifty-plus near-identical short pages is the pattern that
  Google's scaled-content systems target.
- **Fix:** get astrologers to write proper bios. That could be an in-app nudge, or the admin
  writing them from an interview.
- **What to watch:** keep an eye on Search Console's "Crawled – currently not indexed"
  report once the site is live. If profiles pile up there, noindex those under about 150
  words, as ET5 already planned.

---

## 3. Medium

### M1. The Hindi blog listing has no article links in its HTML [FIX NOW]

- **The problem:** `hi/blog.html` serves 17 words and **zero article cards** to a crawler.
  The page fills in by JavaScript.
- **English is fine:** the English `blog.html` is server-rendered through the backend's
  archive route.
- **Why it was left out:** the nginx config does this on purpose (`blogArchive.js` has no
  Hindi mode).
- **The cost:** Hindi articles are reachable only through the sitemap and hreflang, with no
  crawlable internal links pointing at them.
- **Fix:** add `lang=hi` to `src/blogArchive.js`, then route `/test-site/hi/blog.html` to it,
  the same way the English listing works.

### M2. Titles and meta descriptions slightly too long [FIX NOW]

- 41 titles are over 60 characters. They are mostly stories (`… | Astrowani Story`), blog
  articles (`… — Astrowani Blog`) and a few profiles.
- 19 descriptions are 161–166 characters, mainly the 12 horoscope pages.
- **Fix:** drop the " Story" and " Blog" suffixes and trim the horoscope description
  template by about 10 characters.
- **Priority:** low effort, small gain. Google rewrites long titles anyway.

### M3. Some short titles and other small issues [FIX NOW]

- **Short titles:** 6 legal and account pages have titles under 30 characters (e.g.
  `Privacy Policy — Astrowani`). These don't need to rank, so leave them as they are.
- **Images without dimensions:** 11 pages have server-rendered blog images (Supabase
  render URLs) with no `width` or `height`. That covers `blog.html` and the article hero
  images. Set dimensions in `blogArchive.js` and `blogPublic.js` (thumbnail 1200×675).
- **Lazy-loaded first image:** on `blog.html` the first image is `loading="lazy"`. Make the
  first card eager.
- **Heading level skip:** `vivaah-a-celebration-of-love-and-tradition` (EN and HI) skips a
  heading level. It's an old post; fix it as part of H3.

### M4. Soft 404s at the host root [MOVE]

`shop.astrowani.com/llms.txt` and `/.well-known/*` return the **shop SPA with a 200 status**.
`/test-site/*` correctly returns 404. At the move, the website becomes the site root, so the
new nginx server block must 404 unknown root paths too. Right now that rule only exists for
`location /test-site/`. → see the domain-move list.

### M5. No llms.txt [FIX AT MOVE]

This is optional, and Google ignores it. A file at the root of astrowani.com would list the
service pages, the calculators and the blog. Create it at the move, not now: under
`/test-site/` it would sit at the wrong level and nothing would read it.

---

## 4. Low

- **Long URLs:** 7 URLs are over 100 characters, all long article slugs under `/test-site/`.
  At astrowani.com they all fall under 100 characters. **[MOVE]**
- **Hindi homepage address:** the Hindi homepage canonical is `/hi/index.html` while English
  uses `/`. Both are consistent with hreflang and the sitemap, but `/hi/` would be cleaner.
  Change it only at the move, so the canonical changes once. **[MOVE]**
- **Legal pages:** `privacy-policy` and `terms` each have a `<div>` with 76–102 direct
  children. Harmless.
- **Missing from the sitemap:** `report-vulnerability.html` (EN and HI) is indexable but not
  in the sitemap. Either add it or noindex it.
- **Missing security headers:** there's no `Strict-Transport-Security` header (add HSTS at
  Cloudflare) and no Content-Security-Policy. X-Content-Type-Options, X-Frame-Options and
  Referrer-Policy are present.

---

## 5. False alarms from the tool (checked; no action needed)

- **"Title not reflected in content", 91 Hindi pages.** The checker only reads Latin script,
  so the only title word it found was "Astrowani". The Hindi title words are in the Hindi body.
- **"Repetitive" in the content-quality scores.** The scorer counts the shared nav and
  footer. The real overlap between pages was measured in ET9 (average 30%).
- **Duplicate meta descriptions, 6 pairs.** Each pair is a blog article and its own Web
  Story. They describe the same content, which is expected.
- **Profiles have no hreflang.** That's by design: they're English-only (ET5).

---

## 6. What's already strong

- **Canonicals:** 357 of 357 are self-referencing. There are no duplicate titles and no
  duplicate meta descriptions apart from the story pairs above.
- **JSON-LD:** on every indexable page except 2, with zero validation errors. That includes
  FAQPage, BreadcrumbList, Article, ProfilePage and Person.
- **Hreflang:** EN and HI pairs carry hreflang, with `x-default`.
- **Server-rendered HTML:** the homepage is not a SPA, and the blog articles and profiles are
  rendered on the server.
- **404s and robots:** real 404s under `/test-site/`, and the website's own robots.txt
  matches the shop's.
- **Accessibility basics:** the homepage passes all 47 page checks, with 0 images missing alt
  text and 0 links without text.
- **Content:** the service, compatibility (370–748 words), horoscope (540–620) and calculator
  pages carry real content. Content-quality scores are 84–92, with no filler or AI-pattern
  flags.

---

## 7. The domain move: what changes and what can break

**Do in this order.** Each line is marked **[MOVE-RISK]** if skipping it breaks something.

1. **[MOVE-RISK] WordPress redirects.**
   - `vps-deployment/nginx/wordpress-redirects.conf` is a 301 map covering all 83 old
     WordPress URLs plus `/about-us/`.
   - `nginx -t` has **never been run on it** (ET2).
   - Without it, the links in both apps and in App Store Connect, Play Console and the Meta
     app (`/privacy-policy/`, `/term_conditions/`, `/delete-account/`) return 404.
   - After the move, run `check-wordpress-redirects.js --live`.
2. **[MOVE-RISK] `SITE_BASE`** in `astrowani-website/aw/apply-seo.js`.
   - Change it to `https://astrowani.com`, then re-run the generator chain (EQ1).
   - 268 files currently carry the test address.
3. **[MOVE-RISK] Backend `BLOG_SITE_BASE_URL`.** Set it on the VPS. It drives the sitemap,
   the article and profile pages, the stories and the blog agent's links.
4. **[MOVE-RISK] Existing blog content.**
   - Stored article bodies contain **50 absolute links to `shop.astrowani.com/test-site`**.
   - Run a one-off UPDATE over `blogs.content_en` and `blogs.content_hi`.
5. **[MOVE-RISK] Hardcoded test addresses in the backend.** `src/blogAgent/seo.js` (2) and
   `src/indexNow.js` (1). Check whether these are fallbacks or live values.
6. **[MOVE-RISK] nginx at the new root.**
   - **404s:** unknown paths must return a real 404, not the SPA, or every typo becomes
     indexable (M4).
   - **Blog routes:** carry over the blog, profile and story routes from
     `blog-locations.conf`, rewriting `/test-site/` to `/`.
   - **Cache headers:** carry over the cache headers.
7. **[MOVE] robots.txt.** It starts being read once it's at the host root. Check that the
   live version is yours and not Cloudflare's managed one (H1).
8. **[MOVE] Search Console.**
   - Verify `astrowani.com` as a Domain property **before** the move, to get a baseline of the
     WordPress site's queries.
   - Submit the sitemap on launch day.
   - Set up the same in Bing Webmaster Tools, since IndexNow is already wired up.
9. **[MOVE] The old test address.**
   - 301 all of `shop.astrowani.com/test-site/*` to the matching astrowani.com URL.
   - Don't just delete it: Google may already know these URLs through IndexNow and the
     sitemap.
10. **[MOVE] Add `llms.txt`** at the root (M5).
11. **[MOVE] Re-run this audit** against `https://astrowani.com` the day after launch.
