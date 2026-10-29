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
async function archive(db, query) {
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
    .select('id,name,blogs!inner(id)')
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
      'id,slug,title,title_en,excerpt,thumbnail,created_at,category_id,categories(name)',
      { count: 'exact' }
    )
    .eq('is_published', true);
  if (category) request = request.eq('category_id', category);
  const result = await request
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .range((page - 1) * 12, page * 12 - 1);
  if (result.error) throw result.error;
  const pages = Math.max(1, Math.ceil(result.count / 12));
  if (page > pages) return null;
  const title = `${
    selected ? selected.name + ' articles' : 'Astrology articles'
  }${page > 1 ? ' — Page ' + page : ''} | Astrowani Blog`;
  const filters = `<nav aria-label="Article categories"><a class="blog-pill${
    !category ? ' active' : ''
  }" href="blog.html">All articles</a>${categories
    .map(
      (c) =>
        `<a class="blog-pill${c.id === category ? ' active' : ''}" href="${e(
          url(1, c.id)
        )}">${e(c.name)}</a>`
    )
    .join('')}</nav>`;
  const grid = `<div class="blog-grid">${(result.data || [])
    .map((row) => {
      const p = mapBlog(row);
      return `<a class="blog-card" href="blog-post.html?${
        p.slug
          ? 'slug=' + encodeURIComponent(p.slug)
          : 'id=' + encodeURIComponent(p._id)
      }">${
        p.thumbnail
          ? `<img class="blog-card-img" src="${e(
              p.thumbnail
            )}" alt="" loading="lazy" decoding="async">`
          : ''
      }<div class="blog-card-body"><span class="blog-badge">${e(
        p.category.name
      )}</span><h2 class="blog-card-title">${e(
        p.english.title
      )}</h2><p class="blog-excerpt">${e(
        String(p.excerpt || '')
          .replace(/<[^>]*>/g, ' ')
          .slice(0, 180)
      )}</p><span class="blog-read-link">Read article →</span></div></a>`;
    })
    .join('')}</div>${
    result.count === 0 ? '<p>No articles published yet.</p>' : ''
  }`;
  const pagination = `<nav class="archive-pagination" aria-label="Article pages">${
    page > 1
      ? `<a rel="prev" href="${e(url(page - 1, category))}">← Previous</a>`
      : ''
  }<span aria-current="page">Page ${page} of ${pages}</span>${
    page < pages
      ? `<a rel="next" href="${e(url(page + 1, category))}">Next →</a>`
      : ''
  }</nav>`;
  return {
    title,
    description: `Browse ${
      selected ? selected.name : 'astrology'
    } articles on Astrowani. Page ${page} of ${pages}. Explore practical guides and related reading.`,
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
      try {
        const data = await archive(db, req.query);
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
        let html = fs.readFileSync(path.join(root, 'blog.html'), 'utf8');
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
            `<link rel="canonical" href="${e(base + '/' + data.path)}">`
          )
          .replace(
            /<meta (property="og:|name="twitter:)(title|description|url)"[^>]*>/g,
            (_, prefix, key) =>
              `<meta ${prefix}${key}" content="${e(
                key === 'title'
                  ? data.title
                  : key === 'description'
                  ? data.description
                  : base + '/' + data.path
              )}">`
          )
          .replace(
            /<h1[^>]*>[\s\S]*?<\/h1>/,
            `<h1>${e(data.title.replace(' | Astrowani Blog', ''))}</h1>`
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
