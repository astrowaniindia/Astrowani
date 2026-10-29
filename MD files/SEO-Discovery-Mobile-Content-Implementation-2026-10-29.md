# SEO improvements: blog discovery, mobile performance and landing content

Date: 29 October 2026

Status: implemented and tested locally. Nothing committed, pushed or deployed. This is an implementation addendum to `SEO-Audit-Verified-Live-and-Local-2026-10-29.md`; it does not claim the test domain or production has changed. Earlier article reliability, metadata, social-tag and link fixes remain in place.

## 1. Blog discovery

- Added server-rendered blog archives with 12 articles per page, ordinary Previous/Next links and linked category hubs.
- Categories are selected from categories with published articles. Filtering happens in the database before pagination, rather than filtering only the already-loaded first page.
- Article links preserve both newer slugs and legacy UUIDs. Unpublished articles remain excluded.
- Each page/category receives its own canonical URL, title, description and sharing metadata in the initial HTML response. Page one canonicalizes to the clean archive URL.
- Invalid categories/pages and pages beyond the archive return HTTP 404 with noindex. Temporary database errors return 503 with Retry-After, not a permanent missing-page signal.
- Archive queries select card fields rather than downloading full article bodies. Ordering includes an ID tie-breaker for articles published at the same time.
- Static previews use the new archive API as a fallback. The server-rendered version retains its content without requiring JavaScript.

Main implementation: `astrowani-backend/src/blogArchive.js`, backend route registration, `astrowani-website/aw/blog.js`, and the blog route in `vps-deployment/nginx/astrowani-shop.conf`.

The existing article API and mobile application's blog-list API are preserved. The sitemap was not expanded with every paginated URL: the archive now provides a linked discovery path to articles. Category URLs use stable category IDs; editorial category introductions and descriptive category slugs could be a later enhancement.

## 2. Mobile and loading improvements

- Fixed horizontal overflow from off-screen card entrance animations on small screens. Mobile entrances now move vertically instead of beyond the right edge.
- Constrained the mobile astrologer marquee to its container and reduced app-panel padding.
- Stacked inline three-column service/course grids on phones while retaining three columns on desktop.
- Replaced automatic loading of the optional 3D renderer with an explicit “Explore the 3D preview” button and a lightweight existing mascot image.
- The 2,439,972-byte model has no active source URL before the button is clicked. The renderer library is also imported only on request. Successful loading reveals the interactive model; failures provide a retry message.
- Added clear accessible labels to animated statistics so screen readers do not announce all the decorative rolling digits.
- Disabled marquee and zodiac rotation for visitors requesting reduced motion.
- Updated changed stylesheet/script references to version 53 to avoid stale browser assets. Legacy generated files retain their unusual existing line endings except on edited lines.

This is a concrete loading/layout improvement, not a claimed Lighthouse score or a Core Web Vitals pass. Real-user LCP, INP and CLS still need measurement after deployment. Existing hero images, fonts, third-party libraries and live roster behavior may warrant further profiling.

## 3. Landing-page content

### Consultation

Added preparation guidance, how to compare languages/specialities/availability, checking displayed per-minute rates and wallet balance, birth-detail uncertainty, expectations, support and policy links. Corrected the intro so it no longer says every listed astrologer is available or that the visitor must continue in the app. The runtime mode-specific intro is also updated.

### Marriage / kundli matching

Added information to prepare for both charts, an explanation of the traditional score's role, birth-time uncertainty, questions to ask about Mangal/Nadi concerns, and links to individual readings and consultation options. The copy does not promise relationship outcomes.

### Courses

Implemented the enquiry-first approach explicitly confirmed by the owner. The page states that enrollment, schedules, instructors and fees need confirmation. It includes what to ask before enrolling and a support-email enquiry link. No schedules, prices, instructors, certificates or Course offers were invented.

### About

Replaced the thin introduction with an explanation of services, comparing profiles, pricing/offer checks, resources, support and policies. Removed the unsupported About-page numerical statistics and the misleading “no countdown timer” offer wording. The homepage's existing business statistics were not independently verified by this change and remain an audit follow-up.

Metadata was updated where needed, and the existing generator rebuilt FAQ structured data from the visible questions and answers. No search-result enhancement is guaranteed by that markup. Added links on the four pages resolve to existing local files.

## Validation performed

- Five new isolated archive regression tests passed, including following links through six pages to discover all 64 published fixture articles, legacy-ID coverage, category filtering, canonical/social metadata, invalid-page 404s and outage 503s.
- All eight existing article/metadata/link regression tests passed again: 13 tests total.
- Browser navigation verified Next and category links, page-specific title/canonical, and successful loading of the optional 3D model after clicking.
- At a 390px browser viewport, the document content width was 375px. Homepage scroll width fell from 403px to 375px. Blog, consultation, marriage, courses and About also measured 375px with no document overflow.
- At a 320px browser viewport, homepage content and scroll widths both measured 305px. The difference is the browser scrollbar.
- At a 1440px desktop viewport, the courses page retained three columns and content/scroll widths both measured 1425px.
- Structured-data JSON on the four landing pages parses; local link targets exist.
- SEO generation check reports zero pending changes. JavaScript syntax checks and Git whitespace checks passed.

Tests used fixture data and isolated Express servers. The full backend entry point and billing workers were never started. The new Supabase category relationship query has not been exercised against the production database, so deployment smoke testing must verify it with real published content.

## Deployment and future domain move

1. Deploy backend and website assets together. The backend needs access to the sibling `astrowani-website` templates, just as the earlier article renderer does.
2. Apply the new exact `/test-site/blog.html` proxy location alongside the two earlier article locations to the installed Nginx configuration. The normal deployment script deliberately preserves the installed certificate-managed configuration; changing the repository file alone does not activate it. Validate Nginx before reload.
3. Check `/test-site/blog.html`, `?page=2` when sufficient posts exist, a category hub, a legacy-ID article, a missing archive and a temporarily unavailable backend. Inspect response source, status and canonical, not only the rendered browser.
4. Confirm category relationships work with the deployed database and that only published posts/categories are exposed.
5. When moving to `https://astrowani.com`, update `SITE_BASE` in `aw/apply-seo.js`, regenerate static metadata, and set backend `BLOG_SITE_BASE_URL=https://astrowani.com`. Configure equivalent root-level archive/article routes, API routing and redirects preserving query parameters. Review sitemap, robots, hreflang and old test-domain redirects together.
6. Keep the present test-domain configuration until that coordinated launch. No domain was changed in this implementation.

## Remaining improvements

Full Hindi parity, author/editor credentials, independently verified business claims, original course details, production performance measurement, and domain-launch/Search Console work remain separate. The original audit remains the broader checklist; the changes above are local implementations awaiting deployment verification.
