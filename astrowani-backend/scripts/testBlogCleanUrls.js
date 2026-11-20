#!/usr/bin/env node
/**
 * Clean article addresses (/blog/<slug>, /hi/blog/<slug>) — end to end, READ-ONLY.
 *
 *   node --env-file=.env scripts/testBlogCleanUrls.js
 *
 * Mounts ONLY the blog routes on a bare Express app on an ephemeral port
 * (index.js is never booted — it would start the billing worker against the
 * live database) and reads real published articles. Writes nothing.
 *
 * It asserts on what a browser and a crawler actually receive:
 *   - the clean address renders the article (200), with a <base> tag, a clean
 *     canonical, and the Article schema pointing at the same clean URL;
 *   - every OLDER form (blog-post.html?slug=, ?id=) answers 301 to the clean one;
 *   - Hindi works, and an article with no Hindi sends the Hindi address to the
 *     English one rather than serving English under hreflang="hi-IN";
 *   - an unknown slug is a 404 with noindex;
 *   - every relative stylesheet/script/link in the rendered page, resolved
 *     against its <base>, is a real file in astrowani-website — the failure this
 *     whole change could most easily cause is an unstyled page;
 *   - the archive, the sitemap and the agent's postUrl all hand out clean URLs;
 *   - the nginx regexes match the paths they are meant to and nothing else.
 * Every refusal is preceded by a positive control.
 */
const fs = require('fs');
const path = require('path');
const { fileForPath } = require('../../astrowani-website/aw/legal-paths.js'); // legal pages are served at their old WordPress addresses
const http = require('http');
if (typeof globalThis.WebSocket === 'undefined') globalThis.WebSocket = require('ws');
const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const blogPublic = require('../src/blogPublic');
const blogArchive = require('../src/blogArchive');
const registerSitemap = require('../src/blogSitemap');
const seo = require('../src/blogAgent/seo');

const SITE = path.resolve(__dirname, '../../astrowani-website');
const BASE = seo.SITE_BASE;
let fail = 0, pass = 0;
const ok = (c, m, extra) => { if (c) pass++; else { fail++; console.log(`FAIL  ${m}${extra ? `  (${extra})` : ''}`); } };

function get(port, p) {
  return new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port, path: p }, (res) => {
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => resolve({ status: res.statusCode, location: res.headers.location, body }));
    }).on('error', reject);
  });
}

/** Every relative href/src in the page, resolved against its <base>, must be a real file. */
function relativeRefsResolve(html, label) {
  const base = (html.match(/<base href="([^"]+)"/) || [])[1];
  ok(!!base, `${label}: has a <base> tag`);
  if (!base) return;
  ok(html.indexOf('<base ') < html.search(/<link[^>]+stylesheet|<script[^>]+src=/), `${label}: <base> comes before the first asset`);
  const refs = [...html.matchAll(/\s(?:href|src)="([^"#][^"]*)"/g)].map((m) => m[1])
    .filter((u) => !/^(https?:|mailto:|tel:|data:|\/\/)/.test(u) && !u.startsWith('/'));
  let checked = 0, bad = [];
  for (const r of refs) {
    const abs = new URL(r, base);
    if (!abs.href.startsWith(`${BASE}/`)) { bad.push(`${r} -> ${abs.href}`); continue; }
    const rel = decodeURIComponent(abs.pathname.slice((new URL(BASE).pathname === '/' ? 0 : new URL(BASE).pathname.length) + 1)) || 'index.html';
    // The two dynamic page families are served by the backend, not by a file.
    if (/^(hi\/)?blog\/[a-z0-9-]+$/.test(rel)) { checked++; continue; }
    if (!fs.existsSync(path.join(SITE, fileForPath(rel) || rel))) bad.push(`${r} -> ${rel}`);
    checked++;
  }
  ok(checked > 10, `${label}: page has relative assets to check (${checked})`);
  ok(bad.length === 0, `${label}: every relative asset/link resolves to a real file`, bad.slice(0, 4).join(' | '));
}

(async () => {
  const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const app = express();
  blogPublic.register(app, db, { siteBase: BASE, websiteRoot: SITE });
  blogArchive.register(app, db, { siteBase: BASE, websiteRoot: SITE });
  registerSitemap(app, db);
  const server = app.listen(0);
  const port = server.address().port;

  try {
    const { data: rows, error } = await db.from('blogs').select('id, slug, title_hi, content_hi').eq('is_published', true);
    if (error) throw error;
    ok(rows.length > 0, 'there are published articles to test with');
    ok(rows.every((r) => r.slug && /^[a-z0-9-]+$/.test(r.slug)), 'every published article has a clean-route-compatible slug',
      rows.filter((r) => !r.slug || !/^[a-z0-9-]+$/.test(r.slug)).map((r) => r.id).join(','));
    const withHi = rows.find((r) => r.title_hi && r.content_hi);
    const noHi = rows.find((r) => !(r.title_hi && r.content_hi));
    const a = rows[0];

    // ── the clean address renders ──
    const clean = await get(port, `/api/blogs/article-page?slug=${a.slug}&route=clean`);
    ok(clean.status === 200, 'clean address renders the article (200)', clean.status);
    const want = `${BASE}/blog/${a.slug}`;
    ok(clean.body.includes(`<link rel="canonical" href="${want}">`), 'canonical is the clean URL');
    ok(clean.body.includes(`"mainEntityOfPage":"${want}"`), 'Article schema points at the clean URL');
    ok((clean.body.match(/<h1[\s>]/g) || []).length === 1, 'exactly one h1');
    ok(!/blog-post\.html\?slug=/.test(clean.body), 'page carries no old ?slug= links');
    relativeRefsResolve(clean.body, 'EN article');

    // ── every older form 301s to it ──
    const oldSlug = await get(port, `/api/blogs/article-page?slug=${a.slug}`);
    ok(oldSlug.status === 301 && oldSlug.location === want, 'old ?slug= form 301s to the clean URL', `${oldSlug.status} ${oldSlug.location}`);
    const oldId = await get(port, `/api/blogs/article-page?id=${a.id}`);
    ok(oldId.status === 301 && oldId.location === want, 'old ?id= form 301s to the clean URL', `${oldId.status} ${oldId.location}`);

    // ── Hindi ──
    if (withHi) {
      const h = await get(port, `/api/blogs/article-page?lang=hi&slug=${withHi.slug}&route=clean`);
      ok(h.status === 200 && /<html lang="hi"/.test(h.body), 'Hindi clean address renders in Hindi', h.status);
      ok(h.body.includes(`<link rel="canonical" href="${BASE}/hi/blog/${withHi.slug}">`), 'Hindi canonical is /hi/blog/<slug>');
      ok(h.body.includes(`hreflang="en-IN" href="${BASE}/blog/${withHi.slug}"`), 'hreflang pairs the two clean URLs');
      relativeRefsResolve(h.body, 'HI article');
      const hOld = await get(port, `/api/blogs/article-page?lang=hi&slug=${withHi.slug}`);
      ok(hOld.status === 301 && hOld.location === `${BASE}/hi/blog/${withHi.slug}`, 'old Hindi form 301s to /hi/blog/<slug>', `${hOld.status} ${hOld.location}`);
    } else ok(false, 'no article with Hindi to test');
    if (noHi) {
      const h = await get(port, `/api/blogs/article-page?lang=hi&slug=${noHi.slug}&route=clean`);
      ok(h.status === 302 && h.location === `${BASE}/blog/${noHi.slug}`, 'Hindi address of an English-only article goes to the English one', `${h.status} ${h.location}`);
    }

    // ── unknown slug ──
    const miss = await get(port, '/api/blogs/article-page?slug=no-such-article-xyz&route=clean');
    ok(miss.status === 404 && miss.body.includes('noindex'), 'unknown slug is a 404 with noindex', miss.status);

    // ── the archive, the sitemap and the agent all hand out clean URLs ──
    const arch = await get(port, '/api/blogs/archive-page');
    ok(arch.status === 200, 'archive renders', arch.status);
    const cards = [...arch.body.matchAll(/class="blog-card" href="([^"]+)"/g)].map((m) => m[1]);
    ok(cards.length > 0 && cards.every((h) => /^blog\/[a-z0-9-]+$/.test(h)), 'archive cards link to blog/<slug>', cards.slice(0, 2).join(','));
    const sm = await get(port, '/api/blogs/sitemap.xml');
    ok(sm.status === 200 && sm.body.includes(`<loc>${want}</loc>`), 'sitemap lists the clean URL');
    ok(!/blog-post\.html/.test(sm.body), 'sitemap carries no blog-post.html URLs');
    ok(seo.postUrl('x-y') === `${BASE}/blog/x-y`, 'the agent postUrl is clean');

    // ── the nginx patterns ──
    const conf = fs.readFileSync(path.resolve(__dirname, '../../vps-deployment/nginx/blog-locations.conf'), 'utf8');
    // Only the blog routes — the file also carries the astrologer profile route.
    const res = [...conf.matchAll(/location ~ (\^\S+\$) \{/g)].map((m) => m[1]).filter((p) => p.includes('blog')).map((p) => new RegExp(p));
    ok(res.length === 2, 'two clean-route regex locations in blog-locations.conf');
    const hits = (p) => res.some((r) => r.test(p));
    ok(hits(`/test-site/blog/${a.slug}`) && hits(`/test-site/hi/blog/${a.slug}`) && hits(`/test-site/blog/${a.slug}/`), 'nginx patterns match the clean paths');
    ok(!hits('/test-site/blog.html') && !hits('/test-site/blog-post.html') && !hits('/test-site/blog/') && !hits('/test-site/blog/Bad_Slug'), 'nginx patterns match nothing else');
  } catch (e) {
    fail++; console.log('FAIL  threw:', e.message);
  } finally {
    server.close();
  }
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
