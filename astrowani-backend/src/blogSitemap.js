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
const { SITE_BASE, postUrl } = require('./blogAgent/seo');

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

function urlEntry({ loc, lastmod, priority, changefreq }) {
  return `  <url>\n    <loc>${xmlEscape(loc)}</loc>\n`
    + (lastmod ? `    <lastmod>${xmlEscape(lastmod)}</lastmod>\n` : '')
    + (changefreq ? `    <changefreq>${changefreq}</changefreq>\n` : '')
    + (priority ? `    <priority>${priority}</priority>\n` : '')
    + '  </url>';
}

function buildSitemap(posts) {
  const entries = STATIC_PAGES.map(([page, priority, changefreq]) => urlEntry({
    loc: `${SITE_BASE}/${page}`, priority, changefreq,
  }));

  for (const p of posts) {
    // A post with no slug is skipped DELIBERATELY. Its only URL is
    // blog-post.html?id=<uuid>, and submitting a UUID query URL to a sitemap
    // invites Google to index a page whose address will change the moment the
    // row is given a slug — which is a duplicate and a redirect to maintain
    // later. The five pre-agent posts therefore stay out until they are given
    // slugs; nothing the agent writes is ever affected.
    if (!p.slug) continue;
    entries.push(urlEntry({
      loc: postUrl(p.slug),
      lastmod: new Date(p.updated_at || p.created_at).toISOString(),
      priority: '0.7',
      changefreq: 'monthly',
    }));
  }

  return `<?xml version="1.0" encoding="UTF-8"?>\n`
    + `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries.join('\n')}\n</urlset>\n`;
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
