const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const path = require('path');
const { register } = require('../src/blogArchive');
const cats = [
  { id: '11111111-1111-4111-8111-111111111111', name: 'Kundli' },
  { id: '22222222-2222-4222-8222-222222222222', name: 'Tarot & guidance' },
];
const rows = Array.from({ length: 65 }, (_, i) => ({
  id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
  slug: i === 60 ? null : `article-${i}`,
  title: `Article ${i}`,
  excerpt: 'Practical astrology guidance.',
  is_published: i !== 64,
  category_id: cats[i % 2].id,
  categories: { name: cats[i % 2].name },
  created_at: '2026-10-29',
}));
let fail = false;
const db = {
  from(table) {
    let filters = [],
      start = 0,
      end = 1000;
    return {
      select() {
        return this;
      },
      eq(k, v) {
        filters.push([k, v]);
        return this;
      },
      limit() {
        return this;
      },
      order() {
        return this;
      },
      range(a, b) {
        start = a;
        end = b;
        return this;
      },
      then(resolve, reject) {
        if (fail)
          return Promise.resolve({ error: new Error('fixture outage') }).then(
            resolve,
            reject
          );
        const all =
          table === 'categories'
            ? cats
            : rows
                .filter((r) => filters.every(([k, v]) => r[k] === v))
                .slice()
                .reverse();
        return Promise.resolve({
          data: all.slice(start, end + 1),
          count: all.length,
        }).then(resolve, reject);
      },
    };
  },
};
const app = express();
app.use((req, res, next) => {
  if (req.path === '/blog.html')
    req.url =
      '/api/blogs/archive-page' +
      (req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '');
  next();
});
register(app, db, { siteBase: 'http://localhost:4612' });
app.use('/api', (req, res) =>
  res.status(503).json({ message: 'Offline fixture' })
);
app.use(express.static(path.resolve(__dirname, '../../astrowani-website')));
let server, base;
test.before(async () => {
  server = app.listen(process.env.ARCHIVE_TEST_SERVE ? 4612 : 0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => {
  if (!process.env.ARCHIVE_TEST_SERVE) server.close();
});
test('all 64 published articles can be discovered by following HTML pagination', async () => {
  const found = new Set();
  let link = 'blog.html';
  let pages = 0;
  while (link) {
    const response = await fetch(base + '/' + link.replace(/&amp;/g, '&'));
    assert.equal(response.status, 200);
    const html = await response.text();
    for (const m of html.matchAll(/href="blog-post.html\?([^"]+)"/g))
      found.add(m[1]);
    link = html.match(/rel="next" href="([^"]+)"/)?.[1];
    pages++;
    assert.ok(pages < 10);
  }
  assert.equal(pages, 6);
  assert.equal(found.size, 64);
  assert.ok(found.has('id=' + rows[60].id));
  assert.ok(!found.has('slug=article-64'));
});
test('category applies before pagination and retains filter on next page', async () => {
  const html = await (
    await fetch(base + '/blog.html?category=' + cats[1].id)
  ).text();
  assert.match(html, /Page 1 of 3/);
  assert.match(html, /Tarot &amp; guidance articles/);
  assert.match(html, new RegExp('page=2&amp;category=' + cats[1].id));
  const ids = [
    ...html.matchAll(/href="blog-post.html\?slug=article-(\d+)"/g),
  ].map((m) => +m[1]);
  assert.equal(ids.length, 12);
  assert.ok(ids.every((i) => i % 2 === 1));
});
test('invalid or out-of-range archive URLs return 404 and noindex', async () => {
  for (const q of [
    'page=0',
    'page=7',
    'page=x',
    'category=bad',
    'category=33333333-3333-4333-8333-333333333333',
  ]) {
    const r = await fetch(base + '/blog.html?' + q);
    assert.equal(r.status, 404);
    assert.match(await r.text(), /noindex/);
  }
});
test('page-specific canonical and metadata appear in initial HTML', async () => {
  const html = await (await fetch(base + '/blog.html?page=2')).text();
  assert.match(
    html,
    /rel="canonical" href="http:\/\/localhost:4612\/blog.html\?page=2"/
  );
  assert.match(
    html,
    /property="og:title" content="Astrology articles — Page 2/
  );
  assert.equal((html.match(/name="description"/g) || []).length, 1);
  assert.match(html, /data-server-rendered="true"/);
});
test('database outages return retryable 503 without noindex', async () => {
  fail = true;
  try {
    const r = await fetch(base + '/blog.html');
    assert.equal(r.status, 503);
    assert.equal(r.headers.get('retry-after'), '60');
    assert.doesNotMatch(await r.text(), /noindex/);
  } finally {
    fail = false;
  }
});
