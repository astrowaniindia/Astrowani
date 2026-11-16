# SEO Action Plan, 16 Nov 2026

Full evidence is in [FULL-AUDIT-REPORT.md](FULL-AUDIT-REPORT.md). The IDs (C1, H1…) match
that report.

## Now (this week)

| # | Item | Where | Effort |
|---|---|---|---|
| C1 | Hide the "Play Store Reviewer" astrologer (`hidden_from_customers = true`). That also removes its public page and sitemap entry. | DB, 1 row | 1 min |
| H1 | Turn off Cloudflare "Block AI bots" and "Managed robots.txt" (it blocks GPTBot, ClaudeBot and CCBot, against your allow-all policy) | Cloudflare dashboard | 5 min |
| H2 | Add a Cloudflare Cache Rule for the static `/test-site/*.html` pages (short TTL, purged on deploy). This cuts the 0.6–1.0 s response time. | Cloudflare dashboard | 30 min |
| M2 | Trim the " Blog" and " Story" title suffixes, and the horoscope description template | `blogPublic.js`, `webStory.js`, horoscope-pages content | 30 min |
| M3 | Add width/height and an eager first image in the server-rendered blog listing and article hero | `blogArchive.js`, `blogPublic.js` | 30 min |

## Next 2–3 weeks

| # | Item | Effort |
|---|---|---|
| H3 | Expand the 5 old blog posts to 800+ words, or noindex or 301 them | content |
| M1 | Hindi mode for `blogArchive.js`, plus an nginx route for `hi/blog.html` | 2–3 h |
| H4 | Get the astrologers writing real bios, through an app nudge or the admin | ongoing |
| L | Add `report-vulnerability.html` to the sitemap, or noindex it. Add HSTS at Cloudflare. | 10 min |

## At the domain move (in this order)

1. Test `wordpress-redirects.conf` with `nginx -t` and apply it.
2. Change `SITE_BASE` and re-run the generator chain.
3. Change `BLOG_SITE_BASE_URL` on the VPS.
4. Run the UPDATE that rewrites the 50 test-site links in `blogs.content_en/_hi`.
5. Check the 3 hardcoded test URLs in `blogAgent/seo.js` and `indexNow.js`.
6. Set up nginx at the root: real 404s, the blog, profile and story routes, and the cache
   headers.
7. Make sure robots.txt is yours, not Cloudflare's managed one.
8. Verify Search Console **before** the move, then submit the sitemap. Add Bing Webmaster
   Tools.
9. 301 `shop.astrowani.com/test-site/*` to astrowani.com.
10. Add `llms.txt`. Switch the Hindi homepage canonical to `/hi/`.
11. Re-run this audit against astrowani.com.

## Ongoing

- Watch Search Console's "Crawled – currently not indexed" report. If profiles or
  compatibility pages pile up there, noindex the weakest.
- Once Search Console has data, connect it to the SEO tools (`google_auth.py --setup`) so
  later audits use real field data instead of lab numbers.
