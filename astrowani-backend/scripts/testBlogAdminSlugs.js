#!/usr/bin/env node
/**
 * Admin blog slugs (src/blogSlugs.js via POST/PUT /api/admin/blogs) — over real HTTP.
 *
 *   node --env-file=.env scripts/testBlogAdminSlugs.js
 *
 * Mounts ONLY the admin routes on a bare Express app on an ephemeral port
 * (index.js is never booted) with a locally signed token for an existing admin.
 * Writes DRAFT rows only (is_published false, so nothing ever reaches the site),
 * every one titled "Zz Slug Test …", with all Hindi fields filled so the
 * auto-translate hook has nothing to do. Teardown deletes them and asserts it.
 *
 * The "published slug is locked" rule is checked against the module directly
 * with a published row IN MEMORY, so the test never has to publish anything.
 */
if (typeof globalThis.WebSocket === 'undefined') globalThis.WebSocket = require('ws');
const express = require('express');
const http = require('http');
const jwt = require('jsonwebtoken');
const { createClient } = require('@supabase/supabase-js');
const { prepareBlogSlug } = require('../src/blogSlugs');

let pass = 0, fail = 0;
const ok = (c, m, extra) => { if (c) pass++; else { fail++; console.log(`FAIL  ${m}${extra !== undefined ? `  (${JSON.stringify(extra)})` : ''}`); } };
const PREFIX = 'Zz Slug Test';

function call(port, method, path, token, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = http.request({ host: '127.0.0.1', port, path, method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}) } }, (res) => {
      let s = ''; res.on('data', (c) => { s += c; });
      res.on('end', () => { let j = null; try { j = JSON.parse(s); } catch (_) {} resolve({ status: res.statusCode, body: j }); });
    });
    req.on('error', reject); if (data) req.write(data); req.end();
  });
}
const draft = (title, extra = {}) => ({
  title, title_en: title, content_en: '<p>Test draft, deleted by the test.</p>', is_published: false,
  title_hi: 'परीक्षण', content_hi: '<p>परीक्षण</p>', excerpt: 'x', excerpt_hi: 'x', meta_description: 'x', meta_description_hi: 'x',
  ...extra,
});

(async () => {
  const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const cleanup = async () => { await db.from('blogs').delete().like('title_en', `${PREFIX}%`); };
  await cleanup();
  const { data: admin } = await db.from('admins').select('id').limit(1).maybeSingle();
  if (!admin) { console.log('FAIL  no admin row to sign a token for'); process.exit(1); }
  const token = jwt.sign({ id: admin.id, role: 'admin' }, process.env.JWT_SECRET, { expiresIn: '10m' });

  const app = express(); app.use(express.json());
  require('../src/adminRoutes')(app);
  const server = app.listen(0); const port = server.address().port;
  try {
    // Positive control: the route works at all.
    const list = await call(port, 'GET', '/api/admin/blogs', token);
    ok(list.status === 200 && Array.isArray(list.body.data), 'admin blog list answers 200');

    const a = await call(port, 'POST', '/api/admin/blogs', token, draft(`${PREFIX} Alpha`));
    ok(a.status === 200 && a.body.data.slug === 'zz-slug-test-alpha', 'no slug typed -> made from the English title', a.body?.data?.slug);
    const b = await call(port, 'POST', '/api/admin/blogs', token, draft(`${PREFIX} Alpha`));
    ok(b.status === 200 && b.body.data.slug === 'zz-slug-test-alpha-2', 'same title again -> auto slug gets -2', b.body?.data?.slug);
    const c = await call(port, 'POST', '/api/admin/blogs', token, draft(`${PREFIX} Gamma`, { slug: 'zz-slug-test-alpha' }));
    ok(c.status === 409 && c.body.code === 'SLUG_TAKEN', 'a TYPED slug already in use is refused, not renamed', c.body);
    const d = await call(port, 'POST', '/api/admin/blogs', token, draft(`${PREFIX} Delta`, { slug: '  ZZ Slug Test!! Custom ' }));
    ok(d.status === 200 && d.body.data.slug === 'zz-slug-test-custom', 'a typed slug is cleaned to letters/numbers/hyphens', d.body?.data?.slug);
    const e = await call(port, 'POST', '/api/admin/blogs', token, draft(`${PREFIX} Epsilon`, { slug: '!!!' }));
    ok(e.status === 400 && e.body.code === 'SLUG_INVALID', 'a typed slug with no letters or numbers is refused', e.body);

    // Updates to a draft.
    const id = a.body.data.id;
    const u1 = await call(port, 'PUT', `/api/admin/blogs/${id}`, token, { slug: 'zz-slug-test-renamed' });
    ok(u1.status === 200 && u1.body.data.slug === 'zz-slug-test-renamed', 'a draft can change its slug', u1.body?.data?.slug);
    const u2 = await call(port, 'PUT', `/api/admin/blogs/${id}`, token, { slug: '', content_en: '<p>edited</p>' });
    ok(u2.status === 200 && u2.body.data.slug === 'zz-slug-test-renamed', 'clearing the field keeps the slug', u2.body?.data?.slug);
    const u3 = await call(port, 'PUT', `/api/admin/blogs/${id}`, token, { slug: 'zz-slug-test-alpha-2' });
    ok(u3.status === 409 && u3.body.code === 'SLUG_TAKEN', "a draft cannot take another post's slug", u3.body);

    // A post saved before slugs existed picks one up on its next save.
    const { data: legacy } = await db.from('blogs').insert([draft(`${PREFIX} Legacy Post`)]).select().single();
    ok(legacy && legacy.slug === null, 'positive control: a row inserted directly has no slug');
    const u4 = await call(port, 'PUT', `/api/admin/blogs/${legacy.id}`, token, { content_en: '<p>resaved</p>' });
    ok(u4.status === 200 && u4.body.data.slug === 'zz-slug-test-legacy-post', 'an old slug-less post gets one on its next save', u4.body?.data?.slug);
    const missing = await call(port, 'PUT', '/api/admin/blogs/00000000-0000-0000-0000-000000000000', token, { content_en: 'x' });
    ok(missing.status === 404, 'updating a post that does not exist is a 404', missing.status);

    // The published lock, checked without publishing anything.
    const locked = await prepareBlogSlug(db, { slug: 'something-else' }, { id: 'x', slug: 'live-article', is_published: true });
    ok(locked.error && locked.error.code === 'SLUG_LOCKED', 'a PUBLISHED post cannot change its slug', locked);
    const same = await prepareBlogSlug(db, { slug: 'live-article', title_en: 'edited' }, { id: 'x', slug: 'live-article', is_published: true });
    ok(!same.error && !('slug' in same.body), 'saving a published post with its own slug is fine and leaves it alone', same);
    const publishedNoSlug = await prepareBlogSlug(db, {}, { id: '00000000-0000-0000-0000-000000000001', slug: null, is_published: true, title_en: `${PREFIX} Never Saved` });
    ok(publishedNoSlug.body && publishedNoSlug.body.slug === 'zz-slug-test-never-saved', 'a published post with NO slug still gets one');

    // Other admin resources are untouched by the new hook.
    const thoughts = await call(port, 'GET', '/api/admin/thoughts', token);
    ok(thoughts.status === 200, 'other admin CRUD routes still answer', thoughts.status);
  } catch (err) {
    fail++; console.log('FAIL  threw:', err.message);
  } finally {
    server.close();
    await cleanup();
    const { data: left } = await db.from('blogs').select('id').like('title_en', `${PREFIX}%`);
    ok((left || []).length === 0, 'teardown: no test rows left', (left || []).length);
  }
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
