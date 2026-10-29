// ─────────────────────────────────────────────────────────────────────────────
// The SEO layer: everything about an article that a crawler reads rather than a
// person. Pure functions, no I/O, so all of it is unit-testable — which matters
// because these rules run unattended three times a day and a regression here is
// invisible until rankings move weeks later.
// ─────────────────────────────────────────────────────────────────────────────

const kw = require('./keywords');

/**
 * Where the new Astrowani website lives.
 *
 * Internal links are written as ABSOLUTE urls, not relative ones, because the
 * same `content_en` HTML is rendered in three places: the website's
 * blog-post.html, the customer app (BlogScreen.js, via react-native-render-html)
 * and the admin preview. A relative href resolves correctly only in the first.
 *
 * DEFAULT IS THE PREVIEW ORIGIN, deliberately. That is where the new site
 * actually answers 200 today (shop.astrowani.com/test-site/*, all 13 link targets
 * verified 2026-10-13); astrowani.com is still the old WordPress site and those
 * paths would 404 there. When the new site takes over the domain, set
 * BLOG_SITE_BASE_URL=https://astrowani.com and every future article follows. Past
 * articles keep the old absolute links, so plan to run a one-off UPDATE over
 * `blogs.content_en`/`content_hi` at the same time.
 */
const SITE_BASE = (process.env.BLOG_SITE_BASE_URL || 'https://shop.astrowani.com/test-site').replace(/\/+$/, '');

const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=com.astrowanicustomer&hl=en_IN';

/**
 * The internal link targets, keyed by the kind of article that should point at
 * them. Only pages confirmed to exist are listed; a link to a 404 is worse than
 * no link at all, because it spends crawl budget and signals a neglected site.
 */
const LINK_TARGETS = {
  astrologers: { url: `${SITE_BASE}/astrologers.html`, anchor: 'verified astrologers on Astrowani' },
  consult: { url: `${SITE_BASE}/consult.html`, anchor: 'talk to an astrologer on Astrowani' },
  // chat.html and call.html ARE NOT LANDING PAGES, and these no longer point at
  // them. They are the live consultation screens -- whole content "Connecting... /
  // Mute / End chat" -- and as of 2026-10-29 both carry noindex and are
  // disallowed in robots.txt. Pointing a thousand articles at a noindex page
  // wastes every one of those links. consult.html actually serves this intent,
  // so both keys resolve there while keeping their own anchor vocabulary, which
  // is the part that carries the meaning.
  chat: { url: `${SITE_BASE}/consult.html?mode=chat`, anchor: 'chat with an astrologer' },
  call: { url: `${SITE_BASE}/consult.html?mode=call`, anchor: 'call an astrologer' },
  marriage: { url: `${SITE_BASE}/marriage.html`, anchor: 'free kundali matching' },
  horoscope: { url: `${SITE_BASE}/horoscope.html`, anchor: 'daily horoscope' },
  panchang: { url: `${SITE_BASE}/panchang.html`, anchor: "today's panchang" },
  calculators: { url: `${SITE_BASE}/calculators.html`, anchor: 'free astrology calculators' },
  courses: { url: `${SITE_BASE}/courses.html`, anchor: 'astrology courses' },
  freeServices: { url: `${SITE_BASE}/free-services.html`, anchor: 'free astrology services' },
  bookCall: { url: `${SITE_BASE}/book-call.html`, anchor: 'book a call with an astrologer' },
  shop: { url: `${SITE_BASE}/index.html#wanishop`, anchor: 'Wani Shop' },
  blog: { url: `${SITE_BASE}/blog.html`, anchor: 'Astrowani blog' },

  // The six service landing pages, added 2026-10-29. Each exists because one of
  // the owner's target keywords had no URL to land on -- the site menu pointed
  // at hash fragments, and Google strips a fragment entirely.
  //
  // THESE ARE THE PAGES THE BLOG EXISTS TO FEED. An article does not try to rank
  // for "vastu consultation" itself; it passes authority to the page that
  // should. That distinction is what stops a thousand posts competing with the
  // handful of pages that convert.
  kundliReading: { url: `${SITE_BASE}/kundli-reading.html`, anchor: 'online kundli reading' },
  tarotReading: { url: `${SITE_BASE}/tarot-reading.html`, anchor: 'online tarot card reading' },
  numerology: { url: `${SITE_BASE}/numerology.html`, anchor: 'numerology consultation' },
  careerAstrology: { url: `${SITE_BASE}/career-astrology.html`, anchor: 'career astrology consultation' },
  vastu: { url: `${SITE_BASE}/vastu.html`, anchor: 'vastu consultation' },
  lalKitab: { url: `${SITE_BASE}/lal-kitab.html`, anchor: 'lal kitab consultation' },
};

/**
 * Which of those a given category should prefer, so a Vastu article does not
 * link to kundali matching while the Vastu-relevant pages go unlinked. Google
 * reads anchor text and surrounding topic as a relevance signal; a topically
 * sensible internal link is worth several arbitrary ones.
 */
const CATEGORY_LINKS = {
  Marriage: ['marriage', 'astrologers', 'consult', 'bookCall'],
  'Vedic Astrology': ['astrologers', 'panchang', 'calculators', 'consult'],
  Numerology: ['calculators', 'astrologers', 'freeServices', 'consult'],
  Palmistry: ['astrologers', 'consult', 'freeServices', 'chat'],
  Vastu: ['astrologers', 'consult', 'shop', 'bookCall'],
  Career: ['astrologers', 'consult', 'calculators', 'chat'],
  Business: ['astrologers', 'consult', 'shop', 'bookCall'],
  'Love Relationship': ['marriage', 'astrologers', 'chat', 'horoscope'],
  Health: ['astrologers', 'consult', 'shop', 'freeServices'],
  'Tarot Reading': ['astrologers', 'consult', 'chat', 'freeServices'],
};

const DEFAULT_LINKS = ['astrologers', 'consult', 'horoscope', 'blog'];

/**
 * THE COMMERCIAL ROTATION — the owner's target keywords, as link destinations.
 *
 * The brief: three keywords per article, nine a day across three articles,
 * continuing indefinitely. This is that, with one deliberate reading of it.
 *
 * The keywords are used as LINK TARGETS, not as article topics. An article that
 * tried to rank for "vastu consultation" would compete with vastu.html, and at
 * three posts a day there would be a thousand such competitors within a year —
 * every one of them fighting the page that actually converts. Used as anchors
 * instead, those same thousand articles all push authority TOWARD it. Same
 * keywords, same frequency, opposite effect.
 *
 * ORDERED, AND THE ORDER MATTERS. Article N takes entries N*3, N*3+1, N*3+2
 * modulo the list length, so three consecutive articles never overlap and the
 * whole list cycles continuously. With 11 entries and 9 used a day the cycle
 * closes roughly every 1.2 days, so every money page keeps earning links
 * forever rather than a burst and then nothing.
 *
 * Each entry maps to one of the ten supplied keywords:
 *   astrologers     Online Verified Astrologer / Ask an Astrologer
 *   consult         Astrology consultation online
 *   bookCall        Talk to astrologer by phone
 *   chat            Chat with astrologer
 *   kundliReading   Online Muhurat Kundli reading
 *   marriage        Online Kundli matching for marriage
 *   tarotReading    Tarot card reading / Online tarot reader
 *   numerology      Numerology consultation
 *   careerAstrology Online business career astrology consultation
 *   vastu           Vastu consultation
 *   lalKitab        Lal Kitab consultation
 */
const COMMERCIAL = [
  'astrologers', 'kundliReading', 'marriage',
  'consult', 'tarotReading', 'numerology',
  'bookCall', 'careerAstrology', 'vastu',
  'chat', 'lalKitab',
];

/**
 * The three commercial targets for article number `sequence`.
 *
 * `sequence` is the agent's own run count (history.usedTopicKeys.size), which
 * only ever increases — so the rotation survives restarts and does not depend on
 * the clock. Without one it falls back to a hash of the seed, which still spreads
 * but cannot guarantee nine distinct targets in a day.
 */
function commercialLinksFor(sequence, seed = '', count = 3) {
  const n = COMMERCIAL.length;
  let base;
  if (Number.isInteger(sequence) && sequence >= 0) {
    base = (sequence * count) % n;
  } else {
    let h = 0;
    for (const ch of String(seed)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    base = h % n;
  }
  const out = [];
  for (let i = 0; i < count && i < n; i++) {
    const k = COMMERCIAL[(base + i) % n];
    if (!LINK_TARGETS[k] || out.some((l) => l.key === k)) continue;
    const anchor = seed ? (kw.anchorFor(k, seed) || LINK_TARGETS[k].anchor) : LINK_TARGETS[k].anchor;
    out.push({ key: k, url: LINK_TARGETS[k].url, anchor });
  }
  return out;
}

/**
 * Every link an article should carry: its three commercial targets first, then
 * topically relevant ones to fill out `count`.
 *
 * Commercial first on purpose — generate.js links the FIRST occurrence of each
 * anchor phrase, and an article that runs short should still have spent its
 * links on the pages that matter.
 */
function linksForArticle(category, { sequence = null, seed = '', count = 5 } = {}) {
  const out = commercialLinksFor(sequence, seed, 3);
  for (const l of linksForCategory(category, count, seed)) {
    if (out.length >= count) break;
    if (out.some((x) => x.key === l.key)) continue;
    out.push(l);
  }
  return out;
}

// ── Slugs ───────────────────────────────────────────────────────────────────

/**
 * A URL slug from a title.
 *
 * Deliberately ASCII-only and lowercase. A slug carrying Devanagari is
 * percent-encoded by every browser into an unreadable string — astrowani.com's
 * own WordPress sitemap has exactly one such URL
 * (`/%e0%a4%95%e0%a5%8d...`) and it is the least clickable link on the site.
 * The Hindi title still appears as the <h1> for Hindi readers; only the path is
 * transliteration-free.
 */
function slugify(title, { maxLength = 72 } = {}) {
  let s = String(title || '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')      // strip combining accents
    .replace(/[^\x20-\x7E]/g, ' ')        // drop anything non-ASCII (incl. Devanagari)
    .toLowerCase()
    .replace(/['’`]/g, '')                // don't turn "your's" into "your-s"
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  if (!s) s = 'astrowani-article';

  if (s.length > maxLength) {
    s = s.slice(0, maxLength).replace(/-[^-]*$/, '').replace(/-+$/, '') || s.slice(0, maxLength);
  }
  return s;
}

/**
 * Make a slug unique against slugs already taken, by appending -2, -3, …
 *
 * The suffix is NOT a timestamp or a random hex string on purpose: both produce
 * a URL that looks machine-generated, and the whole point of the slug column is
 * a URL a person would click. A collision is also genuinely rare — the topic
 * catalogue dedups upstream — so the counter will realistically never pass -2.
 */
function uniqueSlug(base, taken) {
  const has = taken instanceof Set ? (s) => taken.has(s) : (s) => (taken || []).includes(s);
  if (!has(base)) return base;
  for (let n = 2; n < 200; n += 1) {
    const candidate = `${base}-${n}`;
    if (!has(candidate)) return candidate;
  }
  return `${base}-${Date.now().toString(36)}`;
}

// ── Text measurement ────────────────────────────────────────────────────────

function stripHtml(html) {
  return String(html || '')
    // Drop whole elements whose text is not prose, so a JSON-LD block cannot
    // inflate the word count or satisfy a keyword check.
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function wordCount(html) {
  const t = stripHtml(html);
  return t ? t.split(/\s+/).length : 0;
}

function escAttr(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** Count case-insensitive occurrences of a phrase in the article's prose. */
function phraseCount(html, phrase) {
  const needle = String(phrase || '').trim();
  if (!needle) return 0;
  const text = stripHtml(html).toLowerCase();
  const esc = needle.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return (text.match(new RegExp(esc, 'g')) || []).length;
}

/**
 * Keyword density as a percentage of total words.
 *
 * Used as an UPPER bound, not a target. There is no density figure that helps
 * ranking, but there is one that hurts: repeat a phrase often enough and the
 * page reads as spam to both a classifier and a human. quality.js caps it.
 */
function keywordDensity(html, keyword) {
  const words = wordCount(html);
  if (!words) return 0;
  const kwWords = String(keyword).trim().split(/\s+/).length || 1;
  return (phraseCount(html, keyword) * kwWords * 100) / words;
}

// ── Internal links ──────────────────────────────────────────────────────────

/**
 * The link targets an article in `category` should use, in order.
 *
 * `seed` is the article's slug. It selects the ANCHOR TEXT for each target from
 * keywords.js, which is the fix for the defect that prompted all of this: with a
 * single fixed anchor per target, every article on the site linked with the exact
 * same words, teaching a search engine one phrase instead of the whole vocabulary
 * people search. Without a seed the first (default) phrasing is used, so older
 * callers behave as before.
 */
function linksForCategory(category, count = 4, seed = '') {
  const keys = CATEGORY_LINKS[category] || DEFAULT_LINKS;
  const out = [];
  for (const k of keys.concat(DEFAULT_LINKS)) {
    if (out.length >= count) break;
    if (!LINK_TARGETS[k] || out.some((l) => l.key === k)) continue;
    const anchor = seed ? (kw.anchorFor(k, seed) || LINK_TARGETS[k].anchor) : LINK_TARGETS[k].anchor;
    out.push({ key: k, url: LINK_TARGETS[k].url, anchor });
  }
  return out;
}

/** The canonical public URL of a post, by slug. */
function postUrl(slug) {
  return `${SITE_BASE}/blog-post.html?slug=${encodeURIComponent(slug)}`;
}

/**
 * The "read next" block: links from this article to recent ones.
 *
 * This is the part of the SEO work that compounds. An article with no inbound
 * internal links is orphaned — a crawler reaches it only from the paginated
 * listing, and the listing only shows the newest page. Linking each new article
 * to three recent ones means every post keeps acquiring inbound links as the
 * blog grows, and the whole section stays reachable in a couple of hops.
 */
function relatedLinksHtml(related, { heading = null, hindi = false, seed = '' } = {}) {
  const items = (related || []).filter((r) => r && r.slug && r.title);
  if (!items.length) return '';
  heading = heading || kw.relatedHeadingFor(seed, { hindi });
  const lis = items.map((r) => `<li><a href="${escAttr(postUrl(r.slug))}">${escAttr(r.title)}</a></li>`).join('');
  return `<h2>${escAttr(heading)}</h2><ul>${lis}</ul>`;
}

/**
 * The closing call to action.
 *
 * ROTATED, not fixed. At three posts a day an identical closing paragraph becomes
 * the most repeated text on the domain within a month, and near-duplicate blocks
 * across many pages are what thin-content classifiers look for. keywords.js holds
 * several genuinely different paragraphs; the article picks one by its own slug,
 * so the choice is stable per article but spread across the blog.
 */
function ctaHtml(category, { hindi = false, seed = '' } = {}) {
  const links = linksForCategory(category, 2, seed);
  const a = links[0];
  const b = links[1] || links[0];
  const variant = kw.ctaFor(seed || category, { hindi });
  const link = (t) => `<a href="${escAttr(t.url)}">${escAttr(t.anchor)}</a>`;
  const body = String(variant.body)
    .replace('{a}', link(a))
    .replace('{b}', link(b))
    .replace('{app}', `<a href="${escAttr(PLAY_STORE_URL)}">Astrowani app</a>`);
  return `<h2>${escAttr(variant.heading)}</h2><p>${body}</p>`;
}

// ── Structured data ─────────────────────────────────────────────────────────

/**
 * JSON-LD for the article: Article + FAQPage + BreadcrumbList in one @graph.
 *
 * WHY IT IS WORTH EMITTING EVEN THOUGH THE PAGE IS CLIENT-RENDERED: an FAQPage
 * block is what produces the expandable question rows under a result, and those
 * change click-through rate far more than a one-position ranking move. It is
 * injected with the article body, so it is present as soon as Google renders the
 * page — and the customer app ignores it for free, because BlogScreen.js passes
 * ignoredDomTags: ['style', 'script'] to react-native-render-html.
 *
 * Returned as a <script> tag to append to the content. Everything inside is
 * JSON-escaped by JSON.stringify, and `</script` is neutralised, which is the
 * one sequence that could otherwise break out of the block.
 */
function jsonLd({ title, description, slug, imageUrl, faqs, category, publishedAt, keyword }) {
  const url = postUrl(slug);
  const graph = [
    {
      '@type': 'Article',
      '@id': `${url}#article`,
      headline: String(title || '').slice(0, 110),
      description: description || '',
      ...(keyword ? { keywords: keyword } : {}),
      ...(imageUrl ? { image: [imageUrl] } : {}),
      datePublished: publishedAt || new Date().toISOString(),
      dateModified: publishedAt || new Date().toISOString(),
      inLanguage: 'en-IN',
      mainEntityOfPage: { '@type': 'WebPage', '@id': url },
      author: { '@type': 'Organization', name: 'Astrowani', url: `${SITE_BASE}/` },
      publisher: {
        '@type': 'Organization',
        name: 'Astrowani',
        url: `${SITE_BASE}/`,
        logo: { '@type': 'ImageObject', url: `${SITE_BASE}/assets/logo.png` },
      },
      ...(category ? { articleSection: category } : {}),
    },
    {
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: `${SITE_BASE}/` },
        { '@type': 'ListItem', position: 2, name: 'Blog', item: `${SITE_BASE}/blog.html` },
        { '@type': 'ListItem', position: 3, name: title, item: url },
      ],
    },
  ];

  const qs = (faqs || []).filter((f) => f && f.question && f.answer);
  if (qs.length) {
    graph.push({
      '@type': 'FAQPage',
      mainEntity: qs.map((f) => ({
        '@type': 'Question',
        name: String(f.question).trim(),
        acceptedAnswer: { '@type': 'Answer', text: stripHtml(f.answer) },
      })),
    });
  }

  const payload = JSON.stringify({ '@context': 'https://schema.org', '@graph': graph })
    .replace(/<\/script/gi, '<\\/script');
  return `<script type="application/ld+json">${payload}</script>`;
}

/**
 * The visible FAQ section, as a click-to-expand accordion.
 *
 * NATIVE <details>/<summary>, not a JavaScript widget, and that choice carries its
 * weight three times over:
 *  - It works with no script at all, so it cannot break on a page that is already
 *    entirely client-rendered.
 *  - A crawler reads the answer text whether or not the panel is open — collapsed
 *    <details> content is in the DOM and is indexed, unlike content hidden behind
 *    a click handler that never runs for a bot.
 *  - The customer app renders this HTML through react-native-render-html, which
 *    does not implement <details>; there it degrades to showing question and
 *    answer stacked, which is exactly what it showed before. No app release needed.
 *
 * The question is a <summary>, so it is a real disclosure control with keyboard
 * support, rather than a <div> pretending to be one.
 */
function faqHtml(faqs, { heading = null, hindi = false, seed = '' } = {}) {
  const qs = (faqs || []).filter((f) => f && f.question && f.answer);
  if (!qs.length) return '';
  heading = heading || kw.faqHeadingFor(seed, { hindi });
  const body = qs.map((f) => `<details class="aw-faq">`
    + `<summary>${escAttr(String(f.question).trim())}</summary>`
    + `<p>${escAttr(stripHtml(f.answer))}</p>`
    + `</details>`).join('');
  return `<h2 class="aw-faq-title">${escAttr(heading)}</h2><div class="aw-faq-list">${body}</div>`;
}

module.exports = {
  SITE_BASE,
  PLAY_STORE_URL,
  LINK_TARGETS,
  CATEGORY_LINKS,
  slugify,
  uniqueSlug,
  stripHtml,
  wordCount,
  phraseCount,
  keywordDensity,
  escAttr,
  linksForCategory,
  linksForArticle,
  commercialLinksFor,
  COMMERCIAL,
  postUrl,
  relatedLinksHtml,
  ctaHtml,
  jsonLd,
  faqHtml,
};
