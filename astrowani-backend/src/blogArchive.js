const fs = require('fs');
const path = require('path');
const { SITE_BASE } = require('./blogAgent/seo');
const { mapBlog } = require('./blogPublic');
const e = (s) =>
  String(s ?? '').replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[
        c
      ])
  );
const url = (page, category) =>
  'blog.html' +
  (page > 1 || category
    ? '?' +
      new URLSearchParams({
        ...(page > 1 ? { page } : {}),
        ...(category ? { category } : {}),
      })
    : '');
// Visible strings of the listing, per language. The Hindi listing is served at
// /hi/blog.html; before 2026-11-16 it had no server route and reached crawlers
// with zero article links (SEO audit M1).
const COPY = {
  en: {
    all: 'All articles', read: 'Read article →', prev: '← Previous', next: 'Next →',
    page: (p, n) => `Page ${p} of ${n}`, pageSuffix: (p) => ` — Page ${p}`,
    heading: (cat) => (cat ? `${cat} articles` : 'Astrology articles'),
    none: 'No articles published yet.', cats: 'Article categories', pages: 'Article pages',
    desc: (cat, p, n) => `Browse ${cat || 'astrology'} articles on Astrowani. Page ${p} of ${n}. Explore practical guides and related reading.`,
  },
  hi: {
    all: 'सभी लेख', read: 'लेख पढ़ें →', prev: '← पिछला', next: 'अगला →',
    page: (p, n) => `पृष्ठ ${p} / ${n}`, pageSuffix: (p) => ` — पृष्ठ ${p}`,
    heading: (cat) => (cat ? `${cat} पर लेख` : 'ज्योतिष लेख'),
    none: 'अभी कोई लेख प्रकाशित नहीं हुआ है।', cats: 'लेख श्रेणियाँ', pages: 'लेख पृष्ठ',
    desc: (cat, p, n) => `Astrowani पर ${cat ? cat + ' से जुड़े' : 'ज्योतिष के'} लेख पढ़ें — कुंडली, दोष, उपाय और व्यावहारिक मार्गदर्शन। पृष्ठ ${p} / ${n}।`,
  },
};

async function archive(db, query, { hi = false } = {}) {
  const c = COPY[hi ? 'hi' : 'en'];
  if (
    query.page !== undefined &&
    (typeof query.page !== 'string' || !/^[1-9][0-9]*$/.test(query.page))
  )
    return null;
  const page = query.page === undefined ? 1 : Number(query.page);
  const category = query.category || '';
  if (
    !Number.isSafeInteger(page) ||
    page < 1 ||
    page > 100000 ||
    typeof category !== 'string' ||
    (category &&
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        category
      ))
  )
    return null;
  // An inner relation excludes empty categories; limit only embedded rows, not category hubs.
  const cats = await db
    .from('categories')
    .select('id,name,name_hi,blogs!inner(id)')
    .eq('blogs.is_published', true)
    .limit(1, { referencedTable: 'blogs' })
    .order('name');
  if (cats.error) throw cats.error;
  const categories = cats.data || [];
  const selected = categories.find((c) => c.id === category);
  if (category && !selected) return null;
  // Select card fields only: archived article bodies are not needed in the response.
  let request = db
    .from('blogs')
    .select(
      'id,slug,title,title_en,title_hi,excerpt,excerpt_hi,thumbnail,created_at,category_id,categories(name,name_hi)',
      { count: 'exact' }
    )
    .eq('is_published', true);
  if (category) request = request.eq('category_id', category);
  const result = await request
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .range((page - 1) * 12, page * 12 - 1);
  // A page past the end is a 404, not an outage: PostgREST answers an offset
  // beyond the last row with PGRST103 rather than an empty list, which used to
  // surface as a 503 "temporarily unavailable" for any ?page=999.
  if (result.error && result.error.code === 'PGRST103') return null;
  if (result.error) throw result.error;
  const pages = Math.max(1, Math.ceil(result.count / 12));
  if (page > pages) return null;
  const catName = (cat) => (hi && cat && cat.name_hi) || (cat && cat.name) || '';
  const heading = `${c.heading(catName(selected))}${page > 1 ? c.pageSuffix(page) : ''}`;
  const title = `${heading} | Astrowani Blog`;
  const filters = `<nav aria-label="${c.cats}"><a class="blog-pill${
    !category ? ' active' : ''
  }" href="blog.html">${c.all}</a>${categories
    .map(
      (cat) =>
        `<a class="blog-pill${cat.id === category ? ' active' : ''}" href="${e(
          url(1, cat.id)
        )}">${e(catName(cat))}</a>`
    )
    .join('')}</nav>`;
  const grid = `<div class="blog-grid">${(result.data || [])
    .map((row, i) => {
      const p = mapBlog(row);
      // A Hindi card shows the Hindi title and excerpt where the article has
      // them; its link resolves to /hi/blog/<slug>, which falls back to the
      // English article itself when there is no Hindi version.
      const cardTitle = (hi && p.hindi.title) || p.english.title;
      const cardExcerpt = (hi && p.hindi.excerpt) || p.excerpt;
      const cardCat = (hi && row.categories && row.categories.name_hi) || p.category.name;
      return `<a class="blog-card" href="${
        p.slug
          ? 'blog/' + encodeURIComponent(p.slug)
          : 'blog-post.html?id=' + encodeURIComponent(p._id)
      }">${
        p.thumbnail
          ? // width/height give the browser the shape before the bytes arrive
            // (CSS fixes the rendered height, so the ratio only reserves space).
            // The first card is above the fold, so it is not lazy: a lazy LCP
            // image waits for layout before it even starts downloading.
            `<img class="blog-card-img" src="${e(
              p.thumbnail
            )}" alt="" width="1200" height="675" ${
              i === 0 ? 'fetchpriority="high"' : 'loading="lazy"'
            } decoding="async">`
          : ''
      }<div class="blog-card-body"><span class="blog-badge">${e(
        cardCat
      )}</span><h2 class="blog-card-title">${e(
        cardTitle
      )}</h2><p class="blog-excerpt">${e(
        String(cardExcerpt || '')
          .replace(/<[^>]*>/g, ' ')
          .slice(0, 180)
      )}</p><span class="blog-read-link">${c.read}</span></div></a>`;
    })
    .join('')}</div>${
    result.count === 0 ? `<p>${c.none}</p>` : ''
  }`;
  const pagination = `<nav class="archive-pagination" aria-label="${c.pages}">${
    page > 1
      ? `<a rel="prev" href="${e(url(page - 1, category))}">${c.prev}</a>`
      : ''
  }<span aria-current="page">${c.page(page, pages)}</span>${
    page < pages
      ? `<a rel="next" href="${e(url(page + 1, category))}">${c.next}</a>`
      : ''
  }</nav>`;
  return {
    title,
    heading,
    description: c.desc(catName(selected), page, pages),
    path: url(page, category),
    filters,
    grid,
    pagination,
  };
}
function register(app, db, options = {}) {
  const base = (options.siteBase || SITE_BASE).replace(/\/$/, '');
  const root =
    options.websiteRoot || path.resolve(__dirname, '../../astrowani-website');
  for (const route of ['archive', 'archive-page'])
    app.get('/api/blogs/' + route, async (req, res) => {
      // ?lang=hi serves the Hindi listing (/hi/blog.html through nginx). Any
      // other value is English, so an unknown lang can never 404 the archive.
      const hi = req.query.lang === 'hi';
      const { lang, ...query } = req.query;
      try {
        const data = await archive(db, query, { hi });
        if (!data)
          return route === 'archive'
            ? res.status(404).json({ code: 'ARCHIVE_NOT_FOUND' })
            : res
                .status(404)
                .type('html')
                .send(
                  '<!doctype html><meta name="robots" content="noindex, follow"><title>Archive not found</title><h1>Archive not found</h1><a href="blog.html">All articles</a>'
                );
        if (route === 'archive') return res.json(data);
        let html = fs.readFileSync(path.join(root, hi ? 'hi/blog.html' : 'blog.html'), 'utf8');
        const pageUrl = `${base}/${hi ? 'hi/' : ''}${data.path}`;
        html = html
          .replace(
            /<title>[\s\S]*?<\/title>/,
            `<title>${e(data.title)}</title>`
          )
          .replace(
            /<meta name="description"[^>]*>/g,
            `<meta name="description" content="${e(data.description)}">`
          )
          .replace(
            /<link rel="canonical"[^>]*>/g,
            `<link rel="canonical" href="${e(pageUrl)}">`
          )
          .replace(
            /<meta (property="og:|name="twitter:)(title|description|url)"[^>]*>/g,
            (_, prefix, key) =>
              `<meta ${prefix}${key}" content="${e(
                key === 'title'
                  ? data.title
                  : key === 'description'
                  ? data.description
                  : pageUrl
              )}">`
          )
          .replace(
            /<h1[^>]*>[\s\S]*?<\/h1>/,
            `<h1 class="serif">${e(data.heading)}</h1>`
          )
          .replace(
            '<div id="blog-filter-bar" class="blog-filter-bar"></div>',
            `<div id="blog-filter-bar" class="blog-filter-bar">${data.filters}</div>`
          )
          .replace(
            '<div id="blog-grid"></div>',
            `<div id="blog-grid" data-server-rendered="true">${data.grid}</div>`
          )
          .replace(
            '<div id="blog-load-more-wrap" class="blog-load-more-wrap"></div>',
            `<div id="blog-load-more-wrap" class="blog-load-more-wrap">${data.pagination}</div>`
          );
        res.type('html').send(html);
      } catch (err) {
        console.warn('[blog archive]', err.message);
        res.set('Retry-After', '60').status(503);
        return route === 'archive'
          ? res.json({ message: 'Articles temporarily unavailable' })
          : res
              .type('html')
              .send(
                '<!doctype html><title>Articles temporarily unavailable</title><h1>Articles temporarily unavailable</h1><p>Please try again shortly.</p>'
              );
      }
    });
}
module.exports = { register, archive };
