# Astrowani SEO audit: deployed test site and local work

**Audit date:** 29 October 2026, India time  
**Test site:** https://shop.astrowani.com/test-site/  
**Planned production site:** https://astrowani.com/  
**Scope:** Read-only review of the deployed website, rendered pages, local website/backend source, and unpushed Git commits. No website, server, database, deployment, or application code was changed. This report is the only file created for the audit.

## 1. Verdict

**The website is partially SEO optimized. It has a credible foundation, but it is not yet ready to be called fully optimized for organic growth.**

Titles, descriptions, canonicals, service landing pages, structured data, an XML sitemap, and several image improvements are already implemented. The most important remaining work concerns reliable blog delivery, the incomplete Hindi rollout, search-intent coverage, content credibility, and production launch verification.

**Indicative assessment: approximately 6/10 for the SEO implementation reviewed.** This is an editorial assessment, not a Google score, Lighthouse score, ranking prediction, or a literal percentage of tasks completed. Local improvements are credited; unfinished work is not treated as complete merely because its generator or configuration exists. The temporary domain itself is not a deduction.

| Area | Assessment | Reason |
|---|---|---|
| Basic on-page metadata | Good foundation | Main pages have relevant titles, descriptions and canonicals; blog templates still duplicate descriptions. |
| Crawlability and HTTP behavior | Mostly sound in checked cases | HTTPS works and a tested missing URL returns 404. Root robots output and sitemap discovery need cleanup. |
| Blog SEO reliability | Needs substantial work | Initial HTML is a generic article shell; direct article loading searches only the first 50 posts. |
| Service-page coverage | Good start | Six dedicated service pages exist; other important pages need stronger content and clearer intent. |
| Hindi SEO | Partial local implementation | Three local Hindi pages and reciprocal language tags exist, but navigation and article-language behavior remain incomplete. |
| Structured data | Present, needs refinement | Organization, breadcrumbs and FAQ markup exist. The rendered sample article also has Article markup. |
| Mobile and performance | Partially assessed | Responsive hero works; narrow-view overflow observed. No measured Core Web Vitals score obtained. |
| Trust and editorial quality | Needs improvement | More visible expertise, evidence for claims, reviewer attribution and editorial review are needed. |
| Rankings, backlinks and conversions | Not scored | Search Console, analytics and backlink account data were not available. |

### How to interpret the statuses

- **PASS — deployed:** directly observed working on the test site.
- **LOCAL FIX:** implementation exists in local unpushed work; deployment remains pending.
- **OPEN:** remains an issue in the inspected source and/or deployed behavior.
- **PARTIAL:** meaningful work exists but does not yet solve the whole issue.
- **LAUNCH:** expected work for the planned move to astrowani.com, not a present defect simply because staging uses another domain.
- **UNVERIFIED:** evidence was insufficient to make a firm claim.

## 2. What was inspected and what was not

### Inspected

- All 35 local HTML files under `astrowani-website`, including the three Hindi files and an auxiliary self-test page.
- Website metadata, headings, navigation, internal file targets, JSON-LD syntax, images, language handling and rendering code.
- A broad set of public test-page HTTP responses and metadata. Some requests timed out; this was not a completely successful live crawl of every URL.
- Rendered homepage and a real article, including metadata after JavaScript ran.
- A narrow mobile viewport of the homepage. The browser reported a 375-pixel document viewport and 403-pixel scroll width during that check.
- A nonexistent test URL, HTTP-to-HTTPS behavior, stylesheet caching, root robots.txt and the backend XML sitemap.
- Blog rendering, sitemap generation and URL configuration in the backend.
- Current local Git status, the two commits ahead of main, and the remote main commit using a read-only remote query.

### Not established by this audit

- Actual Google indexing, Google's selected canonicals, impressions, rankings, clicks, or manual actions.
- Organic conversions, retention, revenue or an analytics implementation outside the inspected files.
- A complete backlink profile, keyword search volumes, keyword difficulty or full competitor research.
- Measured Lighthouse performance or real-user LCP, INP and CLS. Google's PageSpeed API returned HTTP 429, quota exceeded.
- Google Rich Results Test eligibility across every page. Parsing valid JSON is not the same as passing all rich-result requirements.
- Exhaustive browser/device coverage, all authenticated flows or every generated article.
- Verification of every testimonial, business claim, credential or scientific/traditional content statement.

A timeout in this audit is not proof that a page is broken for customers or Google. No deployment or production-access assumptions are made from local comments alone.

## 3. Claude's local work: found, verified and credited

At the time checked, local `main` was at `5a76745e`; remote main was at `1d7f2af7`. Two commits were therefore genuinely local and unpushed. Their commit messages credit Claude as co-author.

| Commit | What it does | Audit treatment |
|---|---|---|
| `f7633c7f` | Corrects website free-call copy to seven minutes and adds the five social profiles to Organization `sameAs`. | **LOCAL FIX.** Do not ask for these text/schema changes again. Deployment and artwork consistency still need attention. |
| `5a76745e` | Introduces Hindi-page generation, three Hindi pages, localized metadata and reciprocal hreflang. | **PARTIAL / LOCAL FIX.** Credit the machinery and existing pages; retain the specific remaining defects below. |

There were no tracked unstaged or staged changes when checked. The two pre-existing untracked files were unrelated notes: `ad-broll-plan-2026-10-15.md` and `astrologer-app-review-notes.txt`. They were not modified.

### Already solved or present — do not duplicate this work

| Item | Verified state |
|---|---|
| Titles and meta descriptions on main pages | Already present on checked deployed pages. The site does not need a blanket task to “add all metadata.” |
| Canonical tags | Present. The homepage canonical points to the test-site directory. |
| Dedicated service pages | Kundli reading, tarot, numerology, career/business, Vastu and Lal Kitab already exist. |
| Organization / WebSite / Breadcrumb structured data | Present on relevant static pages. |
| FAQ structured data | Present on homepage/service pages and the rendered sample article. |
| Article structured data | Present after the sample article renders. Do not report it as universally missing. |
| Social profile links | Present in the rendered footer. Their absence from static HTML is not evidence that the website has no social accounts. |
| Social profiles in Organization schema | Fixed locally in `f7633c7f`. |
| Static image alt attributes and dimensions | The homepage's 18 initial HTML images all had alt attributes and width/height. Decorative images correctly use empty alt text. |
| Missing-page status | `/test-site/seo-audit-nonexistent-291026` returned a branded **404**, not 200. |
| Checked stylesheet caching | `style.css?v=50` returned `public, max-age=31536000, immutable`. |
| HTML caching | Checked HTML returned no-cache/revalidation behavior. |
| HTTPS | An HTTP request ultimately reached the HTTPS test URL. |
| Live consultation pages | Chat and call screens have `noindex, follow`; wallet also has noindex. These screens do not need SEO landing-page content. |
| XML sitemap | A working backend sitemap was retrieved. “No sitemap exists” would be incorrect. |

**Important:** the older local Nginx SEO notes describe missing pages returning 200 and short asset caching. Current live checks contradict those historical findings. Those two items are passing now. The source configuration and documentation should eventually be reconciled with the deployed server to prevent regressions.

## 4. Priority overview

P0 means resolve before production promotion; P1 means high-value next work; P2 means useful refinement or growth work. These priorities reflect business/search risk, not a claim that Google has applied a penalty.

| ID | Priority | Status | Finding | Recommended action |
|---|---|---|---|---|
| B1 | P0 | OPEN | Article lookup searches only first 50 posts | Fetch an article directly by slug/ID, independent of list pagination. |
| H1 | P0 before Hindi release | OPEN in local work | Hindi navigation targets many nonexistent Hindi pages | Use translated destination only when it exists; otherwise explicitly link to the English destination. |
| H2 | P0 before Hindi article release | OPEN in local work | Hindi article shell does not establish complete Hindi article behavior | Make route language control body, title, description, schema and article-specific hreflang. |
| L1 | P0 at launch | LAUNCH | Production URL migration touches more than one file | Execute the full domain/URL/data migration checklist in section 12. |
| B2 | P1 | OPEN | Article source HTML has generic metadata and canonical | Deliver article-specific HTML and metadata before JavaScript runs. |
| B3 | P1 | OPEN | Missing article state keeps successful template HTTP response | Return 404/410 appropriately and stop advertising invalid article URLs. |
| B4 | P1 | OPEN | Blog discovery depends on JavaScript and “load more” | Add crawlable pagination/archive links; preserve sitemap coverage. |
| R1 | P1 | OPEN | Root robots output includes storefront HTML and lacks site sitemap declaration | Serve a clean robots file at host root; configure production discovery correctly. |
| M1 | P1 | OPEN | Duplicate blog descriptions and stale Twitter article tags | Produce one description and article-specific social tags. |
| C1 | P1 | OPEN | Core landing pages have little explanatory content | Improve consultation, matching, courses and About content with real details. |
| C2 | P1 | OPEN | Article editing and visible expertise need improvement | Add editorial review, natural copy and named expert/reviewer details where truthful. |
| U1 | P1 | OBSERVED | Narrow homepage layout has overflow | Investigate document overflow; verify mobile sections and menus. |
| O1 | P1 before release | PARTIAL | Seven-minute copy fixed locally; promotional artwork still needs reconciliation | Finish artwork and confirm all offer wording by offer type. |
| G1 | P2 | OPPORTUNITY | Few indexable expert profiles and tool-specific pages | Develop useful profile/tool pages based on demand and genuine content. |
| A1 | P1 measurement | UNVERIFIED | Search/traffic/conversion data unavailable | Verify Search Console and analytics ownership/configuration, then establish baselines. |

## 5. Blog SEO: the largest technical opportunity

### B1. Older articles can become unreachable after the first 50 posts

**Evidence:** `astrowani-website/aw/blog.js` sets `PAGE_SIZE = 50`. `initBlogPost()` calls `fetchPage(1)` and finds the requested slug or ID only inside that response. This code was also confirmed in the deployed `aw/blog.js?v=50`.

**Impact:** once an article falls outside the first page, a direct visitor can see “This article could not be found” even though the article still exists. A sitemap can continue submitting that URL. This is a confirmed implementation limit, not a claim that more than 50 posts currently exist or that current older articles were all tested broken.

**Recommendation:** a public read-only article endpoint keyed by slug/ID, or generated/server-rendered article pages. The single-article path must not depend on a listing's page size or ordering.

**Acceptance:** directly open a published article beyond the first 50 list entries; it returns the correct article. An unknown slug returns a genuine not-found response. Confirm legacy ID links still work or redirect to the preferred slug.

### B2. Article-specific content and canonical arrive too late

**Evidence:** `blog-post.html` initially contains the generic title “Blog — Astrowani” and canonical `/test-site/blog-post.html`, with no article H1 in the initial response. JavaScript later writes the article title, description, canonical and body.

The real Kaal Sarp article rendered successfully in the browser and its canonical became article-specific. Therefore the conclusion is **rendering dependence and conflicting initial signals**, not “Google cannot read this blog.”

**Recommendation:** return article-specific content, title, canonical, description, language and social tags in the initial HTML. Server rendering, static generation on publication or another reliable prerendering design can all satisfy this; a complete framework rewrite is not necessary.

Google recommends consistent canonical signals and documents the extra rendering considerations for JavaScript sites. See [JavaScript SEO basics](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics) and [canonical URL guidance](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls).

### B3. Missing article and bare template behavior

`blog-post.html` without an identifier returned 200, while its renderer displays “No article was specified.” The source also handles an unfound article by replacing page content without changing HTTP status or adding a missing-article noindex rule.

**Recommendation:** unknown/unpublished articles should return an appropriate 404 or 410. The bare template should not be offered as an indexable content page. Keep legitimate server/API outages distinct from permanent deletion; do not permanently remove an existing article because one API request failed.

### B4. Discovery and pagination

The blog list is generated by JavaScript. Further pages use a “Load more articles” button. A working sitemap helps, but older articles should also be reachable through ordinary links and archive pagination. Search crawlers do not reliably reproduce every user click.

**Recommendation:** crawlable archive/page URLs, relevant category hubs when enough content exists, and contextual links from service pages to supporting articles and back. Avoid creating empty category pages just for keywords.

### B5. Metadata, sharing and structured data

Confirmed remaining issues:

- `blog.html` and `blog-post.html` each contain **two** meta descriptions. The local Hindi article template inherits this problem.
- In the rendered sample article, `twitter:title`, `twitter:description` and `twitter:image` still describe the generic blog/default image.
- Many social preview crawlers do not execute article JavaScript, so fixing only runtime Open Graph tags is insufficient.
- Article schema exists in the rendered sample. Its `description` is empty, no `image` property was present, and the author is the Astrowani organization.

**Recommendation:** one consistent metadata source per article; article-specific social cards; appropriate Article image and description fields; truthful author/reviewer information. Organization authorship is not inherently invalid, but named expertise can make the content more credible when it genuinely exists.

FAQ markup is not a high-return rich-result tactic for this business. Google limits regular FAQ rich-result visibility to well-known authoritative government/health sites. Keep useful visible FAQs, but do not promise enhanced search listings. [Google FAQ guidance](https://developers.google.com/search/blog/2023/08/howto-faq-changes).

### B6. Editorial quality and publishing automation

The inspected Kaal Sarp article contains useful structure, relevant internal links and a non-alarmist tone. It also contains awkward exact-match wording such as “through an astrologer online india” and a fragmented call-to-action sentence. Broad statements attributed to classical literature are not visibly sourced in that sample.

**Recommendation:** an expert/editor reviews articles before publication; remove forced keyword phrases; cite relevant sources for historical/traditional claims; distinguish traditions where practitioners disagree; publish accurate author/reviewer and updated dates. Add original explanations, examples or expert observations instead of merely increasing output.

Automated drafting itself is not the issue. Publishing many low-value pages primarily for search manipulation is the risk. This audit does not establish a Google spam violation. [Google's scaled-content policy](https://developers.google.com/search/docs/essentials/spam-policies).

## 6. Hindi SEO: preserve the work, complete the implementation

### What is already implemented locally

- `hi/consult.html`, `hi/astrologers.html`, `hi/blog-post.html`.
- Hindi `lang` attributes and localized titles/descriptions on the static consultation/directory pages.
- Reciprocal `en-IN`, `hi-IN`, and `x-default` tags on corresponding English/Hindi templates.
- Correctly adjusted relative stylesheet/script/image paths in generated Hindi files.

The tested deployed `hi/consult.html` returned 404, consistent with the commits not yet being pushed. This is **pending deployment**, not a request to recreate the page.

### H1. Links to translations that do not exist

The local Hindi pages keep relative links such as `about.html`, `blog.html`, `index.html`, `marriage.html`, `privacy-policy.html` and the service pages. From `/hi/consult.html`, these resolve inside `/hi/`, where those files do not exist.

The static link audit found **20 distinct unavailable relative destinations on each of the three Hindi pages**, including fragment variants. JavaScript menus also need route-aware destinations.

**Fix design:** keep a translation-availability map. Link to a Hindi counterpart when present, otherwise to the real English URL with a clear language expectation. Do not translate URLs by directory concatenation alone.

### H2. The Hindi article shell is not a complete Hindi article solution

Source-confirmed gaps:

- The shared article renderer always sets `document.title` from `post.titleEn` and uses English description logic.
- The Hindi template has `lang="hi"`, but displayed article language follows `data-lang`/stored preference. A fresh direct Hindi URL does not itself reliably establish that state.
- Its initial meta description is only “Astrowani,” plus the extra duplicate description.
- Hreflang points to bare article templates, without the individual article slug.
- Embedded article content/schema needs language-specific IDs and language values; changing the shell alone does not rewrite those.

**Acceptance:** opening a Hindi article URL in a fresh browser shows Hindi content, Hindi metadata and matching Hindi schema without clicking a language toggle. Reciprocal hreflang connects that exact article in both languages, preserving the slug. All navigation destinations exist.

### H3. Discoverability and completeness

The existing language control changes text/local preference; it does not navigate to the new language URLs. The local sitemap generator does not list the new Hindi pages. Important service and homepage translations remain future work, and runtime menus/category labels still need localization.

**Recommendation:** make language switching link to the matching URL, add valid Hindi URLs to the production sitemap, and translate useful high-priority pages thoroughly. Do not release mass near-English copies labelled Hindi. Hreflang describes equivalent language pages; it does not compensate for an untranslated body. [Google multilingual guidance](https://developers.google.com/search/docs/specialty/international/managing-multi-regional-sites).

## 7. Crawl controls, sitemap and canonical handling

### R1. Root robots.txt needs cleanup

The retrieved `https://shop.astrowani.com/robots.txt` returned Cloudflare-managed crawler directives followed by the Wani Shop HTML document. It did not contain the test website's sitemap declaration. Google may parse recognized rules despite the extra content; this is not proof of a complete crawl block. It is nevertheless not a clean, deliberately served robots resource.

`astrowani-website/robots.txt` is intended for the eventual root domain. A file at `/test-site/robots.txt` does not control the host's crawlers.

**Recommendation:** serve the appropriate clean file at the host root. Preserve intentional crawler policies; blocking training crawlers is not the same as blocking Google Search. At production launch, verify actual response content rather than assuming that copying a file took effect.

### R2. The sitemap exists; connect and complete it correctly

`https://backend.astrowani.com/api/blogs/sitemap.xml` returned valid-looking XML containing **24 static entries and three slug-based articles** in the retrieved response. Its URLs point to the current test site.

Cross-host sitemaps are supported with the appropriate verification/submission or robots declaration. The backend location is not automatically a fault. [Google sitemap submission guidance](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap).

Recommended checks:

- At launch, list only production canonical URLs that should be indexed and actually work.
- Include valid Hindi pages and article variants when they are ready.
- Decide how legacy articles without slugs should be represented. Current source deliberately excludes them; omission from a sitemap does not itself prevent indexing, but discovery must still work.
- Keep private/session/error pages out, as already intended.
- Ensure `lastmod` reflects meaningful updates; do not refresh dates just to appear new.
- Do not spend optimization effort tuning `priority` or `changefreq` numbers as though they improve rankings.
- The source query uses a 5,000-row cap. This is a long-term scaling consideration, not an immediate failure; add pagination/sitemap indexes before reaching the cap.

### R3. Noindex and robots rules must work together

The current local root robots file disallows wallet/chat/call paths, while those pages also contain noindex. If a crawler is blocked, it cannot fetch the page to read noindex.

**Recommendation:** use authentication for private information. For public URLs that must disappear from search, allow the crawler to read noindex where appropriate rather than assuming a disallow rule guarantees removal. Preserve the existing noindex treatment of active session screens. [Google indexing requirements](https://developers.google.com/search/docs/essentials/technical).

### R4. Duplicate URL normalization

Both `/test-site/` and `/test-site/index.html` returned 200, with the directory canonical. That canonical is already a useful signal, so this is a refinement rather than a severe defect.

At production launch choose one homepage URL and use a permanent redirect for the alternate. Keep internal homepage links consistent. Define policies for HTTP/HTTPS, www/non-www, trailing slashes and tracking parameters. Preserve parameters that genuinely identify different content; do not blanket-strip article slugs.

## 8. Content, keyword targeting and page-by-page improvements

No keyword volume or competition numbers were obtained. The following is a suggested intent map based on the pages and business, not completed market research.

| Page / area | Current positive | Recommended improvement |
|---|---|---|
| Homepage | Clear title/H1, services, FAQs and contextual links | Substantiate usage/experience claims; explain verification; maintain a clear route to consultation; resolve promotional inconsistencies. |
| Consultation | Dedicated URL, modes and live directory | Explain how chat/call/video work, pricing basis, free-offer conditions, privacy, timing and what to prepare. The local static main content is only about 35 words before runtime cards. |
| Astrologers directory | Search intent and live expert listings | Add useful introduction, selection guidance and indexable individual expert profiles with genuine biographies, skills, languages, pricing and reviews. |
| Kundli reading | Dedicated page, clear sections and FAQ | Add a sample deliverable, birth-time limitations, what is included and a named reviewer. |
| Marriage / matching | Dedicated page and consultation route | Explain Guna Milan, interpretation beyond the score, data required and whether an actual free matching tool is offered. Avoid promising a tool if the destination only offers consultation. |
| Tarot | Dedicated page and limitations | Explain session format, sample questions and relevant reader expertise; retain realistic claims. |
| Numerology | Dedicated content and FAQ | Distinguish consultation from calculator intent, explain methods and link naturally to working tools. |
| Career / business | Dedicated commercial landing page | Add specific situations covered, session deliverables and real expertise. Avoid guarantees about jobs or income. |
| Vastu | Useful introduction and preparation guidance | Explain remote assessment inputs, process, limits and who performs the review. Use genuine examples if available. |
| Lal Kitab | Dedicated explanation and FAQ | Add reviewer qualifications and sources/context for its distinct tradition. |
| Horoscope | Working date/period UI | If these queries are a strategic target, create genuinely useful sign/period pages with clear dates and editorial provenance; current variants canonicalize to the general page. |
| Panchang | City/date-dependent calculations | Explain location/timezone, calculation method, limitations and date. Consider crawlable useful city/date views selectively; avoid an unlimited low-value URL space. |
| Calculators | A hub with several working tools and limitations | Build separate URLs for useful high-demand calculators only when they deserve substantive standalone content. Include inputs, method, examples and interpretation. |
| Free services | Existing hub | Clearly distinguish fully working free tools, previews and app-only functions; align title/description with what users actually receive. |
| Courses | Basic course categories | Add real instructor, syllabus, level, duration, language, availability and enrollment details. If courses are not actually available, present that honestly. |
| About | Some positioning and consultation offer | Add business identity, team, verification process, editorial standards and support details. Current content is mostly marketing. |
| Blog and articles | Content, internal links and runtime schema exist | Resolve section 5 before scaling publication. |
| Legal/support pages | Policies are linked and present | Keep details accurate and accessible; these support trust but are not the primary keyword growth opportunity. |

The six newer service pages contain approximately **370–430 words of local main-section text each**. That is not automatically too short. There is no useful universal word-count target: the goal is to answer the visitor's question better, with specific trustworthy information, not pad copy.

### Useful keyword/content clusters

| Primary destination | Suggested intent | Supporting content |
|---|---|---|
| Consultation | Online astrology consultation; chat/call with astrologer | How sessions work, charges, choosing an astrologer, preparing questions. |
| Kundli reading | Online Kundli reading | Birth time, houses, dashas and how a reading is interpreted. |
| Marriage | Kundli matching / Kundali Milan | Guna Milan explained, limits of scores, birth-data issues. |
| Tarot | Online tarot reading | Question selection, spreads, what to expect. |
| Career | Career astrology consultation | Job changes, career decisions, business partnerships. |
| Numerology | Numerology consultation | Life path, name numbers and transparent calculator methods. |
| Vastu | Online Vastu consultation | Floor-plan preparation, room orientation and rental-home considerations. |

Assign one primary page to each main intent. Related articles should support that page, not repeat the same sales copy under many titles. Do not create dozens of “best astrologer in [city]” pages without real local relevance and distinct value.

### Navigation and fragments

Many calculators are linked using fragments, which are useful navigation but not separate indexable landing pages. Several menu fragment names have no matching static ID, including some advanced calculators and Panchang `#numerology` versus the actual `numerology-panchang` ID. Some date fragments are intentionally handled by JavaScript, so an absent ID alone does not prove every such link is broken.

**Recommendation:** individually verify each advertised menu item reaches the intended functioning section or a clearly explained unavailable tool. Decide which tools merit a dedicated page based on demand and usefulness.

### Horoscope quality

`astro-engine.js` constructs horoscope text from small seeded phrase lists. This is a source-confirmed template system, not a live editorial feed. The visible homepage also advertises updates every morning.

**Recommendation:** be clear about how these readings are produced. If horoscope traffic is important, invest in useful original, reviewed content rather than scaling many near-identical sign/date pages. The finding concerns usefulness and expectations; it is not a claim of a current search penalty.

## 9. Trust, offers and business credibility

### Free-offer consistency

Claude already changed the main free-call text to **seven minutes** locally. That should be credited, not repeated as unfinished text work. However:

- The referenced `promo-free-11min-woman.webp` artwork is still the asset identified in the local commit as containing the old number.
- A separate five-minute chat promotion also exists. This may be a different offer; do not assume it is wrong without checking the actual chat promotion rules.
- The About copy still says “no countdown timer” while describing a timed seven-minute allowance. Clarify the promise so customers understand billing.

**Acceptance:** images, visible text, alt text, app copy and actual offer rules agree for each offer type. Make eligibility and post-offer pricing clear.

### Credibility improvements

- Explain what “verified astrologer” means and who performs verification.
- Show real expert biographies and reviewers rather than relying only on a badge.
- Maintain evidence for “50,000+ Kundlis,” “159+ verified astrologers,” “20+ years” and “97+ countries” if retained. This audit did not validate those figures.
- Verify permission, provenance and authenticity of testimonials. Do not invent review markup or star counts.
- Add an accessible business/contact page with accurate support details and legal identity.
- Keep social identity consistent. Social links are already present; schema enhancement is locally fixed.
- Retain the existing distinction between spiritual interpretation and guaranteed outcomes. Make uncertainty understandable in content and product copy.
- Do not add LocalBusiness/address markup merely because a generic SEO checklist says so; use it only where accurate and appropriate for the real business.

## 10. Mobile, images, accessibility and performance

### Observed positives

- The mobile homepage hero was readable, with a visible navigation menu and consultation button.
- Static homepage images have dimensions and alt attributes; many below-fold images are lazy-loaded.
- Fixed-size avatar wrappers exist in CSS. Missing HTML dimensions on runtime portraits therefore do **not** by themselves prove layout shift.
- Checked stylesheet caching and HTML revalidation are already sensible.
- Fonts use `display=swap` and font hosts have preconnect hints.
- Some reduced-motion handling is already present.

### Observed or source-based improvement areas

1. **Mobile overflow:** the document reported 403px scroll width against 375px client width in the narrow-view check. The hero looked usable, but overflowing decorative/carousel elements need investigation. Do not infer that every offscreen carousel card is a defect; verify the document itself cannot scroll horizontally unintentionally.
2. **3D component cost:** the homepage includes a model-viewer library in the head; its local model is approximately 2.44 MB. Consider delaying library/model loading until relevant, or use a poster first. That file size is not a measurement of initial transferred bytes.
3. **Image delivery:** serve appropriately sized WebP/AVIF where useful, add responsive `srcset`/`sizes` for large content images, and preserve useful alt text. Avoid compressing images merely because a file exists; prioritize those actually downloaded on important routes.
4. **LCP treatment:** identify the actual largest-content element with measurement before adding preloads or `fetchpriority`. Do not lazy-load a confirmed primary LCP image.
5. **Script workload:** profile navigation generation, moving carousels, counters, socket/API work and third-party modules on a low-end mobile device. Defer work that is not needed for the current page.
6. **Accessibility:** the homepage had no main landmark in the rendered check. Add semantic main/navigation landmarks, useful focus states, keyboard-operable menus and reduced-motion behavior as needed. The animated counters exposed long repeated digit sequences in the accessibility tree; provide a stable readable label and hide decorative digit strips from assistive technology.
7. **Contrast/tap targets:** measure these rather than assigning a pass from appearance alone. Test 320/360/390px layouts, landscape, zoom and actual devices.

Accessibility improvements support usability and conversion; not every accessibility issue is a direct Google ranking factor.

### Performance targets — not measured results

At the 75th percentile of real visits, aim for LCP at most 2.5 seconds, INP at most 200ms and CLS at most 0.1. No pass/fail against these thresholds was obtained in this audit. [Web Vitals reference](https://web.dev/articles/vitals).

Run mobile/desktop lab tests after the next approved deployment and use real-user/Search Console data once sufficient traffic exists. Test at least the homepage, a service page, directory, blog listing and article. Avoid spending time chasing a perfect generic audit score while article URLs remain unreliable.

## 11. Analytics, authority and measurement

No Google Analytics/GTM/Plausible/Clarity integration was found in the sampled homepage, main script and boot files. This does not prove that no measurement exists through a proxy, separate system or other deployment mechanism.

Recommended setup/verification:

- Verify the astrowani.com domain property in Search Console; inspect current property data before replacing the existing site.
- Record indexed pages, search queries, clicks, impressions, CTR and top landing pages.
- Verify sitemap processing and Google's selected canonical for representative pages.
- Track consultation starts, successful bookings, signups, app-store outbound clicks and meaningful purchase events where applicable.
- Keep staging traffic out of production reporting.
- Do not send birth details, private consultations or other personal content into analytics events or indexable URLs.
- Segment performance by device, language, landing-page type and branded/non-branded queries.

Backlink work should begin with a real inventory: existing links, relevant mentions, broken destination URLs and legitimate partnerships. Prioritize useful research/expert content and consistent real business profiles. Do not buy bulk links or promise that a certain number of backlinks will produce rankings. A backlink score was not measured here.

## 12. Planned move to astrowani.com

**The temporary test domain is expected. Current test-domain canonicals are not classified as an SEO bug solely because the domain will change later.** The important task is making the production transition complete and consistent.

### A. While the site is still staging

- Decide whether staging should be publicly indexable. The checked homepage has neither meta noindex nor an X-Robots-Tag noindex header, and the host's general rules allow search crawling.
- If this is only a preview, use authentication/access restriction or a correctly applied staging noindex policy. Robots disallow alone is not a reliable deindexing method.
- Do not actively submit staging URLs for indexing just to test SEO tags. Test rendering and metadata directly.
- Keep a release checklist that removes staging noindex on production. A production-wide noindex left behind would be far more serious than the current temporary URL.

### B. Before switching the domain

- Inventory the existing astrowani.com URLs, including WordPress pages, registration, policies, articles and pages with traffic/backlinks.
- The existing `/astrologer-ragistration/` URL returned 200 during this audit and is linked by the new website. Preserve that function or redirect it to a real replacement; do not break it during a site replacement because its spelling looks unusual.
- Create an old-to-new URL mapping for meaningful existing URLs. Do not redirect every old page to the new homepage.
- Choose final paths. `.html` and query-string article URLs are not inherently disqualified from ranking; cleaner URLs are an architectural option, not a reason to introduce unnecessary migration risk.
- Confirm domain ownership, HTTPS, preferred host, API connectivity and operational readiness.

### C. Update all URL sources, not just the static SEO script

| Source | Required production consideration |
|---|---|
| `aw/apply-seo.js` | Change `SITE_BASE` to the final production base and regenerate canonical, social and schema URLs. |
| Hindi-page generation | Generate valid translated pages, correct links and reciprocal article/page language annotations. |
| Backend `BLOG_SITE_BASE_URL` | Set production URL for sitemap and future generated article links/schema. |
| Existing article records | Inspect/migrate embedded old absolute links, JSON-LD IDs, publisher URLs and images where needed. Changing an environment variable does not rewrite existing stored content. |
| Root `robots.txt` | Serve at astrowani.com root with the correct production sitemap and intentional crawl policy. |
| Sitemap | Include only intended production URLs, not stale test URLs or session screens. |
| Server/CDN | Implement permanent redirects, correct 404s, cache rules and staging access policy. |
| Frontend API configuration | `aw/config.js` recognizes shop.astrowani.com as a same-origin API host, but not astrowani.com. Verify the planned production proxy/CORS arrangement so directory and blog rendering do not fail after the move. |
| Social sharing | Confirm cards resolve on production and metadata is available without JavaScript. |
| Navigation/content | Remove accidental staging links and preserve existing production functions such as registration. |

### D. Launch acceptance checklist

- [ ] Production homepage and important landing pages return 200 and display the correct content.
- [ ] Intended indexable pages have no staging noindex or accidental robots block.
- [ ] Private/session pages remain correctly excluded or protected.
- [ ] Canonicals, hreflang, schema IDs and sitemap URLs use production consistently.
- [ ] Old important URLs redirect directly to relevant replacements with permanent redirects.
- [ ] Unknown URLs return 404/410 appropriately.
- [ ] `/` versus `/index.html`, www/non-www and HTTP/HTTPS normalization is intentional.
- [ ] Individual articles work outside the first listing page.
- [ ] Hindi URLs render the intended language without relying on remembered settings.
- [ ] Blog/directory APIs work from the new hostname.
- [ ] Root robots and sitemap are fetched and inspected on the actual production domain.
- [ ] Mobile layout and critical journeys are smoke-tested.
- [ ] Production sitemap is submitted/verified in Search Console.
- [ ] Representative production URLs are inspected for rendering and canonical selection.
- [ ] Monitor indexing, 404s, redirects and organic landing-page changes after launch.

If staging URLs have acquired links or become indexed, plan corresponding redirects to production where appropriate. Do not assume they have been indexed: Search Console is needed to establish that. For the existing astrowani.com site, retain and redirect valuable old URLs even though the hostname stays the same. [Google site-move guidance](https://developers.google.com/search/docs/crawling-indexing/site-move-with-url-changes).

## 13. Recommended implementation order

### First: before production promotion

1. Resolve direct article lookup and missing-article behavior.
2. Complete or withhold the incomplete Hindi release; repair its destinations and language-specific article output.
3. Finish the offer artwork/copy reconciliation while retaining Claude's completed seven-minute text fix.
4. Decide staging indexability and prepare the production URL map/configuration checklist.
5. Verify that the current good 404/caching behavior is preserved in the server's maintained configuration.

### Next: improve the foundation

1. Deliver article-specific initial HTML and metadata.
2. Remove duplicate descriptions and fix article social cards.
3. Add crawlable article archives/pagination and a complete production sitemap.
4. Strengthen consultation, matching, About and course content with real information.
5. Repair mobile overflow and measure actual performance.
6. Establish Search Console and conversion measurement.

### Then: grow useful search coverage

1. Develop genuine expert profile pages and selected standalone tools.
2. Expand fully translated Hindi content by business priority.
3. Build reviewed articles around service-page intent clusters.
4. Improve author/reviewer transparency and original expertise.
5. Use query/conversion data to refine titles, snippets, content and internal links.
6. Earn relevant mentions and links through useful content and legitimate relationships.

No ranking deadline or score improvement is guaranteed. The aim is a technically reliable, useful site whose search performance can be measured.

## 14. Evidence index

### Public URLs inspected

- [Test homepage](https://shop.astrowani.com/test-site/)
- [Homepage alternate](https://shop.astrowani.com/test-site/index.html)
- [Blog listing](https://shop.astrowani.com/test-site/blog.html)
- [Bare article template](https://shop.astrowani.com/test-site/blog-post.html)
- [Rendered sample article](https://shop.astrowani.com/test-site/blog-post.html?slug=understanding-kaal-sarp-dosh-meaning-and-practical-guidance)
- [Root robots response](https://shop.astrowani.com/robots.txt)
- [Working backend sitemap](https://backend.astrowani.com/api/blogs/sitemap.xml)
- [Checked versioned stylesheet](https://shop.astrowani.com/test-site/style.css?v=50)
- [Missing-page probe](https://shop.astrowani.com/test-site/seo-audit-nonexistent-291026)
- [Hindi deployment probe](https://shop.astrowani.com/test-site/hi/consult.html)
- [Existing production registration page](https://astrowani.com/astrologer-ragistration/)

### Principal local evidence

- `astrowani-website/aw/blog.js`: article lookup, pagination, metadata and language behavior.
- `astrowani-website/blog.html` and `blog-post.html`: duplicate descriptions and initial article shell.
- `astrowani-website/aw/make-hindi-pages.js`, `hindi-strings.json` and `hi/`: translation generation and missing destinations.
- `astrowani-website/aw/apply-seo.js`: site base, static metadata, schema and hreflang.
- `astrowani-website/script.js`: runtime menus, social profiles and language toggle.
- `astrowani-website/astro-engine.js`: horoscope phrase generator and calculator methods.
- `astrowani-website/aw/config.js`: production API hostname considerations.
- `astrowani-backend/src/blogSitemap.js`: sitemap contents and limits.
- `astrowani-backend/src/blogAgent/seo.js`: article URLs and stored-content migration considerations.
- `astrowani-website/robots.txt`: intended production crawl rules.
- `vps-deployment/website-nginx-seo.conf`: historical server findings, superseded where current live tests differ.
- Git commits `f7633c7f` and `5a76745e`: local Claude work explicitly credited in this report.

**Audit boundary:** this is a verified snapshot, not a claim that every live URL and every possible SEO factor has been exhaustively tested. It identifies what was checked, what already works, what remains, and what needs production/account-level verification. No fixes or deployments were performed.

## Implementation update — 29 October 2026, second batch

Blog archive discovery, mobile layout/loading improvements, and consultation/marriage/courses/About content have now been implemented locally. Courses use the owner-confirmed enquiry-first approach. See [the implementation and validation report](SEO-Discovery-Mobile-Content-Implementation-2026-10-29.md) for details, measured mobile widths, 13 passing regressions and deployment requirements. These findings are addressed in local code; deployed verification is still outstanding. No push or deployment occurred.
