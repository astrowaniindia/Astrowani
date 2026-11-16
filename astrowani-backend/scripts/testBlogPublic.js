// Offline regression suite: no env files, production database, or billing workers.
const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const fs = require('fs');
const path = require('path');
const { register } = require('../src/blogPublic');
const root = path.resolve(__dirname, '../../astrowani-website');
const rows = Array.from({ length: 65 }, (_, i) => ({
  id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`, slug: `article-${i}`,
  is_published: i !== 64, title: `Article ${i} & guidance`, title_en: `Article ${i} & guidance`,
  title_hi: `लेख ${i}`, content_en: '<p>Useful article content with a <a href="consult.html">consultation link</a>.</p><details><summary>A question?</summary><p>An answer.</p></details>',
  content_hi: '<p>यह लेख हिंदी में है।</p>', excerpt: 'An accurate description of this article and the practical guidance it offers to readers.',
  thumbnail: '', created_at: '2026-10-13T11:25:22.538Z', updated_at: '2026-10-29T11:25:22.538Z',
}));
rows[62].content_en += '<script>alert(1)</script><img src="x" onerror="alert(2)"><a href="javascript:alert(3)">bad</a>';
rows[60].content_en += '<p class="aw-photo-credit evil-class"><em>Photo by <a href="https://unsplash.com/@x">X</a> on Unsplash.</em></p><h2 class="aw-faq-title">Frequently asked questions</h2><div class="aw-faq-list"><details class="aw-faq"><summary>Q?</summary><p>A.</p></details></div>';
let fail = false;
const db = { from(table) {
  assert.equal(table, 'blogs');
  const filters = [];
  return { select() { return this; }, eq(k, v) { filters.push([k, v]); return this; },
    async maybeSingle() { return fail ? { error: new Error('test outage') } : { data: rows.find(r => filters.every(([k,v]) => r[k] === v)) || null }; } };
} };
const app = express();
// Match the Nginx article routes (vps-deployment/nginx/blog-locations.conf) in a
// self-contained local test server: the legacy query-string shells, and the clean
// /blog/<slug> and /hi/blog/<slug> addresses, which nginx marks with route=clean.
app.use((req, res, next) => {
  const clean = req.path.match(/^\/(hi\/)?blog\/([a-z0-9-]+)\/?$/);
  if (clean) {
    const q = new URLSearchParams({ slug: clean[2], route: 'clean' });
    if (clean[1]) q.set('lang', 'hi');
    req.url = `/api/blogs/article-page?${q}`;
    // Express parsed the query before this ran; rewriting the URL does not re-parse it.
    Object.assign(req.query, Object.fromEntries(q));
    return next();
  }
  if (['/blog-post.html', '/hi/blog-post.html'].includes(req.path)) {
    const q = new URL(req.url, 'http://localhost').searchParams;
    q.set('lang', req.path.startsWith('/hi/') ? 'hi' : 'en');
    req.query.lang = q.get('lang');
    req.url = `/api/blogs/article-page?${q}`;
  }
  next();
});
register(app, db, { siteBase: 'http://localhost:4611', websiteRoot: root });
if (process.env.BLOG_TEST_SERVE) {
  const { mapBlog } = require('../src/blogPublic');
  app.get('/api/blogs', (req, res) => res.json({ data: rows.slice(0, 4).map(mapBlog), totalPages: 1 }));
  // Do not proxy any fixture-page calls to production.
  app.use('/api', (req, res) => res.status(503).json({ message: 'Offline preview' }));
  app.use('/static', express.static(root));
}
app.use(express.static(root));
let server, base;
test.before(async () => { server = app.listen(process.env.BLOG_TEST_SERVE ? 4611 : 0, '127.0.0.1'); await new Promise(r => server.once('listening', r)); base = `http://127.0.0.1:${server.address().port}`; });
test.after(() => { if (!process.env.BLOG_TEST_SERVE) server.close(); });
test('article beyond page one is retrieved by slug and legacy UUID', async () => {
  for (const query of ['slug=article-60', `id=${rows[60].id}`]) {
    const r = await fetch(`${base}/api/blogs/post?${query}`);
    assert.equal(r.status, 200); assert.equal((await r.json()).data._id, rows[60].id);
  }
});
test('unknown, unpublished and invalid identifiers return 404', async () => {
  for (const q of ['', 'slug=missing', 'slug=article-64', 'id=invalid', 'slug[]=article-60']) {
    const r = await fetch(`${base}/blog-post.html?${q}`);
    assert.equal(r.status, 404); assert.match(await r.text(), /noindex, follow/);
  }
});
test('article source HTML has one description, article social tags and readable content', async () => {
  const r = await fetch(`${base}/blog/article-60`); const html = await r.text();
  assert.equal(r.status, 200);
  assert.equal((html.match(/name="description"/g) || []).length, 1);
  assert.match(html, /name="twitter:title" content="Article 60 &amp; guidance"/);
  assert.match(html, /property="og:title" content="Article 60 &amp; guidance"/);
  assert.match(html, /rel="canonical" href="http:\/\/localhost:4611\/blog\/article-60"/);
  assert.match(html, /<h1[^>]*>Article 60 &amp; guidance<\/h1>/);
  assert.match(html, /Useful article content/);
  assert.match(html, /hi\/blog\/article-60/);
  // The article is the page's primary content landmark (SEO audit 2026-10-29, section 5).
  assert.match(html, /<article id="blog-post-root"[^>]*data-server-rendered="true"/);
  assert.match(html, /"dateModified":"2026-10-29/);
  // The blog agent's own classes survive the sanitiser (photo credit colour, FAQ
  // accordion); any other class does not.
  assert.match(html, /<p class="aw-photo-credit">/);
  assert.match(html, /<h2 class="aw-faq-title">/);
  assert.match(html, /<div class="aw-faq-list"><details class="aw-faq">/);
  assert.doesNotMatch(html, /evil-class/);
});
test('Hindi article content, metadata and route language agree without stored preferences', async () => {
  const r = await fetch(`${base}/hi/blog/article-60`); const html = await r.text();
  assert.equal(r.status, 200); assert.match(html, /lang="hi" data-lang="hi"/);
  assert.match(html, /name="twitter:title" content="लेख 60"/);
  assert.match(html, /यह लेख हिंदी में है/); assert.doesNotMatch(html, /Useful article content/);
  assert.doesNotMatch(html, /localStorage.getItem\('astro-lang'\)/);
});
test('stored scripts and event handlers cannot execute in server-rendered content', async () => {
  const html = await (await fetch(`${base}/blog/article-62`)).text();
  assert.doesNotMatch(html, /alert\(|onerror=|javascript:/);
  assert.match(html, /<details><summary>A question\?<\/summary>/);
  assert.match(html, /href="consult.html"/);
});
test('temporary database failure remains 503, not a permanent not-found/noindex', async () => {
  fail = true;
  try {
    const r = await fetch(`${base}/blog-post.html?slug=article-60`);
    assert.equal(r.status, 503); assert.equal(r.headers.get('retry-after'), '60');
    assert.doesNotMatch(await r.text(), /noindex/);
  } finally { fail = false; }
});
test('Hindi requests without a translation redirect to the existing English article', async () => {
  const old = rows[61].content_hi;
  rows[61].content_hi = '';
  try {
    const r = await fetch(`${base}/hi/blog/article-61`, { redirect: 'manual' });
    assert.equal(r.status, 302);
    assert.equal(r.headers.get('location'), 'http://localhost:4611/blog/article-61');
  } finally { rows[61].content_hi = old; }
});
test('static blog metadata and Hindi navigation stay valid', () => {
  for (const f of ['blog.html','blog-post.html','hi/blog-post.html']) {
    const html = fs.readFileSync(path.join(root, f), 'utf8');
    assert.equal((html.match(/<meta name="description"/g) || []).length, 1, f);
  }
  for (const f of fs.readdirSync(path.join(root,'hi')).filter(f => f.endsWith('.html'))) {
    const html = fs.readFileSync(path.join(root,'hi',f),'utf8');
    for (const m of html.matchAll(/href="((?:\.\.\/)?[\w-]+\.html)(?:[?#][^"]*)?"/g)) {
      assert.ok(fs.existsSync(path.resolve(root,'hi',m[1])), `${f}: ${m[1]}`);
    }
  }
});
