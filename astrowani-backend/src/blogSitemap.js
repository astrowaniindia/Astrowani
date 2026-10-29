// ─────────────────────────────────────────────────────────────────────────────
// GET /api/blogs/sitemap.xml — an XML sitemap of every published article.
//
// WHY THIS IS A BACKEND ROUTE RATHER THAN A FILE IN astrowani-website/.
// The articles live in the `blogs` table and three more arrive every day, while
// the website is a static directory deployed from git by deploy-shop.yml. A
// static sitemap.xml would be stale within hours and could only be refreshed by
// a commit — which the agent, running on the VPS, cannot make. Generated here it
// is correct the moment an article is published.
//
// WHY A SITEMAP IS THE HIGHEST-VALUE SEO ITEM FOR THIS PARTICULAR BLOG.
// blog.html renders its list with JavaScript, from a fetch. Google executes
// JavaScript, but it does so on a second pass, days to weeks behind the first —
// and it only ever finds a URL it already knows about. There is no server-
// rendered <a href> anywhere pointing at an individual article, so without a
// sitemap the ONLY route to a new post is that deferred render of the listing.
// A sitemap hands Google the URL list directly and takes rendering out of the
// discovery path entirely.
//
// NOTE the site is not on astrowani.com yet, so these URLs use the same
// BLOG_SITE_BASE_URL as the agent's internal links. Change it in one place.
// ─────────────────────────────────────────────────────────────────────────────
const fs = require('fs');
const path = require('path');
const { SITE_BASE, postUrl } = require('./blogAgent/seo');

/**
 * Which pages exist in Hindi, READ FROM DISK rather than listed here.
 *
 * aw/make-hindi-pages.js writes a page only once its text is translated past a
 * threshold, so the set grows as translations land. A copy of that list kept in
 * this file would go stale silently, and the sitemap would then invite Google to
 * crawl a /hi/ URL that 404s — worse than omitting it, because a sitemap is a
 * claim that these URLs are good.
 *
 * Fails CLOSED: if the directory cannot be read, no Hindi entries are emitted
 * and the English sitemap is served exactly as before.
 */
const WEBSITE_ROOT = path.resolve(__dirname, '../../astrowani-website');
function hindiPages() {
  try {
    return new Set(fs.readdirSync(path.join(WEBSITE_ROOT, 'hi')).filter((f) => f.endsWith('.html')));
  } catch (_) {
    return new Set();
  }
}

/**
 * Static pages, in rough priority order. Hand-maintained because it is short and
 * a generated guess would be worse: changefreq and priority are hints a crawler
 * is entitled to ignore, and a wrong hint on the home page costs more than the
 * list costs to maintain.
 */
const STATIC_PAGES = [
  ['', '1.0', 'daily'],
  ['blog.html', '0.9', 'daily'],
  ['astrologers.html', '0.9', 'weekly'],
  ['consult.html', '0.8', 'weekly'],
  ['marriage.html', '0.8', 'weekly'],
  ['horoscope.html', '0.8', 'daily'],
  ['panchang.html', '0.7', 'daily'],
  ['calculators.html', '0.7', 'monthly'],
  ['free-services.html', '0.7', 'weekly'],
  // The six service landing pages (astrowani-website/aw/service-pages.js).
  // Each one targets a supplied keyword that previously had no URL to land on,
  // because the mega menu pointed at hash fragments and Google strips those.
  // Priority 0.8: these are commercial intent pages, the same tier as consult.
  ['kundli-reading.html', '0.8', 'monthly'],
  ['tarot-reading.html', '0.8', 'monthly'],
  ['numerology.html', '0.8', 'monthly'],
  ['career-astrology.html', '0.8', 'monthly'],
  ['vastu.html', '0.8', 'monthly'],
  ['lal-kitab.html', '0.8', 'monthly'],
  ['courses.html', '0.6', 'monthly'],
  // chat.html and call.html were here and have been REMOVED. They are not
  // landing pages -- they are the live consultation screens, and their entire
  // text content is "Astrologer / Connecting... / Mute / End chat / Billing is
  // per minute from now". Submitting them meant Google could serve a page
  // reading "Connecting..." for the query "chat with an astrologer". Both now
  // carry <meta name="robots" content="noindex, follow">. The real landing page
  // for that intent is consult.html, already listed above at 0.8.
  ['book-call.html', '0.6', 'monthly'],
  ['about.html', '0.4', 'monthly'],
  ['privacy-policy.html', '0.2', 'yearly'],
  ['terms-and-conditions.html', '0.2', 'yearly'],
  ['refund-cancellation.html', '0.2', 'yearly'],
  ['safety-guidelines.html', '0.2', 'yearly'],
  ['child-safety.html', '0.2', 'yearly'],
  ['delete-account.html', '0.2', 'yearly'],
];

function xmlEscape(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function urlEntry({ loc, lastmod, priority, changefreq, alternates }) {
  return `  <url>\n    <loc>${xmlEscape(loc)}</loc>\n`
    + (alternates ? `${alternates}\n` : '')
    + (lastmod ? `    <lastmod>${xmlEscape(lastmod)}</lastmod>\n` : '')
    + (changefreq ? `    <changefreq>${changefreq}</changefreq>\n` : '')
    + (priority ? `    <priority>${priority}</priority>\n` : '')
    + '  </url>';
}

/**
 * The <xhtml:link> alternates for one page, in both languages.
 *
 * Google asks that each URL in a sitemap carry the alternates for EVERY
 * language INCLUDING ITSELF, and that the relationship be reciprocal — an
 * English entry naming the Hindi page while the Hindi entry does not name the
 * English one is ignored wholesale rather than half-honoured. Both entries are
 * therefore built from one list.
 */
function altLinks(enLoc, hiLoc) {
  return [['en-IN', enLoc], ['hi-IN', hiLoc], ['x-default', enLoc]]
    .map(([lang, href]) => `    <xhtml:link rel="alternate" hreflang="${lang}" href="${xmlEscape(href)}"/>`)
    .join('\n');
}

function buildSitemap(posts, hindi = hindiPages()) {
  const entries = [];
  for (const [page, priority, changefreq] of STATIC_PAGES) {
    const enLoc = `${SITE_BASE}/${page}`;
    // The home page is listed as '' but its Hindi counterpart is a real file.
    const file = page || 'index.html';
    if (!hindi.has(file)) {
      entries.push(urlEntry({ loc: enLoc, priority, changefreq }));
      continue;
    }
    const hiLoc = `${SITE_BASE}/hi/${file}`;
    const alts = altLinks(enLoc, hiLoc);
    entries.push(urlEntry({ loc: enLoc, priority, changefreq, alternates: alts }));
    // Same priority: it is the same page. A lower one would be a claim that the
    // Hindi version matters less, which is not what we mean.
    entries.push(urlEntry({ loc: hiLoc, priority, changefreq, alternates: alts }));
  }

  for (const p of posts) {
    // A post with no slug is skipped DELIBERATELY. Its only URL is
    // blog-post.html?id=<uuid>, and submitting a UUID query URL to a sitemap
    // invites Google to index a page whose address will change the moment the
    // row is given a slug — which is a duplicate and a redirect to maintain
    // later. The five pre-agent posts therefore stay out until they are given
    // slugs; nothing the agent writes is ever affected.
    if (!p.slug) continue;
    const lastmod = new Date(p.updated_at || p.created_at).toISOString();
    const enLoc = postUrl(p.slug);
    // An article is listed in Hindi only when it HAS Hindi. The blog agent
    // writes both languages, but quality.checkHindi() may drop a weak
    // translation and keep the English article — and the five pre-agent posts
    // never had any. A Hindi URL for one of those renders the ENGLISH body
    // under hreflang="hi-IN", which is a duplicate of the English page rather
    // than a translation of it. blogPublic.js makes the same test before it
    // emits an article's own hreflang tags, and the two must agree.
    if (!p.hasHindi) {
      entries.push(urlEntry({ loc: enLoc, lastmod, priority: '0.7', changefreq: 'monthly' }));
      continue;
    }
    const hiLoc = `${SITE_BASE}/hi/blog-post.html?slug=${encodeURIComponent(p.slug)}`;
    const alts = altLinks(enLoc, hiLoc);
    entries.push(urlEntry({ loc: enLoc, lastmod, priority: '0.7', changefreq: 'monthly', alternates: alts }));
    entries.push(urlEntry({ loc: hiLoc, lastmod, priority: '0.7', changefreq: 'monthly', alternates: alts }));
  }

  return `<?xml version="1.0" encoding="UTF-8"?>\n`
    + `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"`
    + ` xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${entries.join('\n')}\n</urlset>\n`;
}

module.exports = function registerBlogSitemap(app, supabase) {
  app.get('/api/blogs/sitemap.xml', async (req, res) => {
    try {
      // Sitemaps may hold 50,000 URLs; at three a day that ceiling is 45 years
      // away, so a single file with a generous cap needs no index file yet.
      const { data, error } = await supabase
        .from('blogs')
        .select('slug, created_at, updated_at')
        .eq('is_published', true)
        .not('slug', 'is', null)
        .order('created_at', { ascending: false })
        .limit(5000);
      if (error) throw error;

      // Which of those have Hindi, as a SECOND query returning slugs only.
      // Selecting content_hi on the first query would be the obvious move and
      // the wrong one: an article body is several KB and this route caps at
      // 5,000 rows, so asking "is this column empty" would pull tens of MB out
      // of the database on every cache miss — and cached storage egress is
      // exactly what put this project over its quota in October (CLAUDE.md EC).
      // A failure here costs the Hindi alternates, not the sitemap.
      let hindi = new Set();
      try {
        const { data: hi, error: hiErr } = await supabase
          .from('blogs')
          .select('slug')
          .eq('is_published', true)
          .not('slug', 'is', null)
          .not('content_hi', 'is', null)
          .neq('content_hi', '')
          .not('title_hi', 'is', null)
          .neq('title_hi', '')
          .limit(5000);
        if (!hiErr) hindi = new Set((hi || []).map((r) => r.slug));
      } catch (hiErr) {
        console.error('[blog-sitemap] hindi slugs:', hiErr.message);
      }
      for (const row of data || []) row.hasHindi = hindi.has(row.slug);

      res.set('Content-Type', 'application/xml; charset=utf-8');
      // An hour of caching. Crawlers fetch this far more often than it changes,
      // and the backend is a single Node process on one core (CLAUDE.md DN).
      res.set('Cache-Control', 'public, max-age=3600');
      return res.status(200).send(buildSitemap(data || []));
    } catch (err) {
      console.error('[blog-sitemap]', err.message);
      // Still answer with a VALID sitemap of the static pages rather than a 500.
      // A crawler that gets an error page may back off for days; one that gets a
      // short sitemap simply comes back. The database being briefly unreachable
      // must not cost the site its crawl rate.
      res.set('Content-Type', 'application/xml; charset=utf-8');
      return res.status(200).send(buildSitemap([]));
    }
  });
};

module.exports.buildSitemap = buildSitemap;
module.exports.STATIC_PAGES = STATIC_PAGES;
module.exports.hindiPages = hindiPages;
