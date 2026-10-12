// ─────────────────────────────────────────────────────────────────────────────
// The SEO layer: everything about an article that a crawler reads rather than a
// person. Pure functions, no I/O, so all of it is unit-testable — which matters
// because these rules run unattended three times a day and a regression here is
// invisible until rankings move weeks later.
// ─────────────────────────────────────────────────────────────────────────────

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
  chat: { url: `${SITE_BASE}/chat.html`, anchor: 'chat with an astrologer' },
  call: { url: `${SITE_BASE}/call.html`, anchor: 'call an astrologer' },
  marriage: { url: `${SITE_BASE}/marriage.html`, anchor: 'free kundali matching' },
  horoscope: { url: `${SITE_BASE}/horoscope.html`, anchor: 'daily horoscope' },
  panchang: { url: `${SITE_BASE}/panchang.html`, anchor: "today's panchang" },
  calculators: { url: `${SITE_BASE}/calculators.html`, anchor: 'free astrology calculators' },
  courses: { url: `${SITE_BASE}/courses.html`, anchor: 'astrology courses' },
  freeServices: { url: `${SITE_BASE}/free-services.html`, anchor: 'free astrology services' },
  bookCall: { url: `${SITE_BASE}/book-call.html`, anchor: 'book a call with an astrologer' },
  shop: { url: `${SITE_BASE}/index.html#wanishop`, anchor: 'Wani Shop' },
  blog: { url: `${SITE_BASE}/blog.html`, anchor: 'Astrowani blog' },
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

/** The link targets an article in `category` should use, in order. */
function linksForCategory(category, count = 4) {
  const keys = CATEGORY_LINKS[category] || DEFAULT_LINKS;
  const out = [];
  for (const k of keys.concat(DEFAULT_LINKS)) {
    if (out.length >= count) break;
    if (!LINK_TARGETS[k] || out.some((l) => l.key === k)) continue;
    out.push({ key: k, ...LINK_TARGETS[k] });
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
function relatedLinksHtml(related, { heading = 'Read next on Astrowani' } = {}) {
  const items = (related || []).filter((r) => r && r.slug && r.title);
  if (!items.length) return '';
  const lis = items.map((r) => `<li><a href="${escAttr(postUrl(r.slug))}">${escAttr(r.title)}</a></li>`).join('');
  return `<h2>${escAttr(heading)}</h2><ul>${lis}</ul>`;
}

/** The closing call to action. Carries the brand plus the strongest internal links. */
function ctaHtml(category, { hindi = false } = {}) {
  const links = linksForCategory(category, 2);
  if (hindi) {
    return `<h2>Astrowani se baat kijiye</h2><p>`
      + `Is lekh mein di gayi baatein aam siddhant hain. Aapki kundali aapki hai — uske grah, `
      + `dasha aur yog sirf aapke hain. <a href="${escAttr(links[0].url)}">Astrowani</a> par `
      + `verified jyotishi chat, call aur video par turant uplabdh hain, aur aap apni exact `
      + `kundali dikha kar seedha jawab le sakte hain. `
      + `<a href="${escAttr(links[1] ? links[1].url : links[0].url)}">Astrowani</a> par pehli baat-cheet `
      + `shuru karein, ya <a href="${escAttr(PLAY_STORE_URL)}">Astrowani app</a> download karein.</p>`;
  }
  return `<h2>Talk it through with an astrologer on Astrowani</h2><p>`
    + `Everything above is the general principle. Your own chart is not general — its planets, `
    + `dashas and combinations belong to you alone, and two people with the same placement can `
    + `need opposite advice. On <a href="${escAttr(links[0].url)}">Astrowani</a> you can reach a `
    + `verified astrologer by chat, call or video within minutes and get an answer against your `
    + `actual birth details rather than a general rule. `
    + `<a href="${escAttr(links[1] ? links[1].url : links[0].url)}">Start a consultation on Astrowani</a>, `
    + `or get the <a href="${escAttr(PLAY_STORE_URL)}">Astrowani app</a> to keep your chart with you.</p>`;
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

/** The visible FAQ section. Mirrors the FAQPage data so the page and the markup agree. */
function faqHtml(faqs, { heading = 'Frequently asked questions' } = {}) {
  const qs = (faqs || []).filter((f) => f && f.question && f.answer);
  if (!qs.length) return '';
  const body = qs.map((f) => `<h3>${escAttr(String(f.question).trim())}</h3><p>${escAttr(stripHtml(f.answer))}</p>`).join('');
  return `<h2>${escAttr(heading)}</h2>${body}`;
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
  postUrl,
  relatedLinksHtml,
  ctaHtml,
  jsonLd,
  faqHtml,
};
