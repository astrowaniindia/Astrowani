// Web Stories (CLAUDE.md EU): the 24 daily horoscope stories and the blog stories.
//
//   AMP_VALIDATOR_DIR=<folder with node_modules/amphtml-validator> node scripts/testWebStories.js
//
// Offline except for the AMP validator itself, which downloads Google's current
// validator on first use. No database, no env file, no billing worker: the blog
// route is mounted on a bare Express app over a stubbed `db`.
//
// THE POINT OF THIS FILE IS THE VALIDATOR. A story that is not valid AMP is
// silently never shown in Discover — no error anywhere — so every kind of page
// src/webStory.js produces is put through the official validator, and a
// deliberately broken page is put through first to prove the check can fail.
const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');

const SITE = path.resolve(__dirname, '../../astrowani-website');
const bs = require('../src/blogStories');
const { renderStory } = require('../src/webStory');
const { renderArticle, mapBlog } = require('../src/blogPublic');
const { buildSitemap } = require('../src/blogSitemap');
const horoscopeStories = require(path.join(SITE, 'aw/horoscope-stories.js'));

function loadValidator() {
  const dirs = [process.env.AMP_VALIDATOR_DIR, process.cwd()].filter(Boolean);
  for (const d of dirs) {
    try { return require(require.resolve('amphtml-validator', { paths: [d] })); } catch (_) { /* next */ }
  }
  throw new Error('amphtml-validator not found. Install it OUTSIDE the repo (npm i amphtml-validator in a scratch folder) and set AMP_VALIDATOR_DIR to that folder.');
}
let validator;
async function amp(html) {
  validator = validator || await loadValidator().getInstance();
  return validator.validateString(html);
}
const assertValid = async (html, label) => {
  const r = await amp(html);
  assert.equal(r.status, 'PASS', `${label}: ${r.errors.map((e) => `${e.line}:${e.col} ${e.message}`).join(' | ')}`);
};

const BASE = 'https://shop.astrowani.com/test-site';

// ── fixtures ──────────────────────────────────────────────────────────────
const para = (n) => `<p>${'This is a full paragraph of genuine article text, long enough to count as one. '.repeat(n)}</p>`;
const AGENT_EN = [
  '<p>Intro paragraph before any heading, which is not a section.</p>',
  `<h2>What Sade Sati really is</h2>${para(2)}${para(2)}`,
  `<h2>The three phases</h2>${para(2)}${para(1)}<ul><li>one</li></ul>`,
  `<h2>Practical remedies</h2>${para(3)}${para(2)}`,
  `<h2>A section with one paragraph only</h2>${para(2)}`,
  '<h2>Read next on Astrowani</h2><ul><li><a href="x">Other</a></li></ul>',
  '<h2>Talk it through with an astrologer on Astrowani</h2><p>Everything above is general — <a href="x">ask an astrologer</a> about your own chart, it really helps a lot.</p>',
  `<h2 class="aw-faq-title">Frequently asked questions</h2><div class="aw-faq-list"><details><summary>Q?</summary>${para(2)}${para(2)}</details></div>`,
].join('');
const AGENT_HI = AGENT_EN
  .replace('What Sade Sati really is', 'साढ़ेसाती क्या है').replace('The three phases', 'तीन चरण')
  .replace('Practical remedies', 'व्यावहारिक उपाय');
const rows = [
  { id: '00000000-0000-4000-8000-000000000001', slug: 'sade-sati-guide', is_published: true, title: 'Sade Sati & you', title_en: 'Sade Sati & you',
    title_hi: 'साढ़ेसाती और आप', content_en: AGENT_EN, content_hi: AGENT_HI, excerpt: 'A practical guide to the seven and a half years of Saturn, without the fear.',
    meta_description: 'A calm, practical guide to Sade Sati, its three phases and the remedies that help.', thumbnail: 'https://x.supabase.co/storage/v1/object/public/app-images/blogs/a.jpg',
    created_at: '2026-10-29T10:00:00.000Z', updated_at: '2026-10-30T10:00:00.000Z' },
  { id: '00000000-0000-4000-8000-000000000002', slug: 'legacy-post', is_published: true, title: 'Legacy', title_en: 'Legacy', title_hi: 'पुराना',
    content_en: '<div>One long undivided block of text.<br>More text.</div>', content_hi: '<div>हिंदी</div>', excerpt: 'x',
    thumbnail: 'data:image/jpeg;base64,AAAA', created_at: '2026-08-01T10:00:00.000Z', updated_at: null },
  { id: '00000000-0000-4000-8000-000000000003', slug: 'english-only', is_published: true, title: 'English only', title_en: 'English only', title_hi: '',
    content_en: AGENT_EN, content_hi: '', excerpt: 'An article with no Hindi version at all, used to test the redirect.', thumbnail: '',
    created_at: '2026-10-29T10:00:00.000Z', updated_at: null },
];
let fail = false;
const db = { from(table) {
  assert.equal(table, 'blogs');
  const f = [];
  return { select() { return this; }, eq(k, v) { f.push((r) => r[k] === v); return this; },
    async maybeSingle() { return fail ? { error: new Error('test outage') } : { data: rows.find((r) => f.every((p) => p(r))) || null }; } };
} };

// ── the check can fail ────────────────────────────────────────────────────
test('control: the validator rejects a broken story', async () => {
  const good = renderStory({ lang: 'en', siteBase: BASE, title: 'T', description: 'D', canonical: `${BASE}/stories/t`, poster: `${BASE}/p.jpg`,
    logo: `${BASE}/l.jpg`, datePublished: '2026-11-17', dateModified: '2026-11-17',
    pages: [{ kind: 'cover', id: 'c', image: `${BASE}/p.jpg`, title: 'T' }, { id: 'a', text: 'x' }] });
  await assertValid(good, 'minimal story');
  const bad = good.replace('</amp-story>', '<script>alert(1)</script></amp-story>');
  assert.notEqual((await amp(bad)).status, 'PASS');
});

// ── horoscope stories ─────────────────────────────────────────────────────
test('all 24 horoscope stories are valid AMP, carry the day\'s reading, and rewrite idempotently', async () => {
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(`${fs.readFileSync(path.join(SITE, 'astro-engine.js'), 'utf8')}\nthis.reading = astroHoroscopeReading;`, ctx);
  const date = new Date(2026, 10, 17, 12);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-stories-'));
  const read = (sign, lang) => ctx.reading(sign, date, 'daily', lang);
  const first = horoscopeStories.writeStories(root, '2026-11-17', date, read);
  assert.equal(first.files.length, 24);
  assert.equal(first.changed, 24);
  assert.equal(horoscopeStories.writeStories(root, '2026-11-17', date, read).changed, 0, 'second write must be a no-op');
  for (const rel of first.files) {
    const html = fs.readFileSync(path.join(root, rel), 'utf8');
    await assertValid(html, rel);
    const sign = rel.match(/([a-z]+)-horoscope/)[1];
    const hi = rel.startsWith('hi/');
    const name = sign[0].toUpperCase() + sign.slice(1);
    const r = read(name, hi ? 'hi' : 'en');
    for (const k of ['general', 'love', 'career', 'money', 'health']) assert.ok(html.includes(r.parts[k].slice(1, 25)), `${rel}: ${k} missing`);
    assert.ok(html.includes(`rel="canonical" href="${BASE}/${rel}"`), `${rel}: canonical`);
    assert.ok(html.includes(`hreflang="hi-IN" href="${BASE}/hi/stories/${sign}-horoscope.html"`), `${rel}: hreflang`);
    assert.ok(html.includes(`<html amp lang="${hi ? 'hi' : 'en'}">`), `${rel}: lang`);
    assert.ok(html.includes('"dateModified":"2026-11-17T00:01:00+05:30"'), `${rel}: dateModified`);
    assert.ok(fs.existsSync(path.join(SITE, 'assets/stories', `${sign}.jpg`)), `${sign} poster missing`);
    // Both swipe-up links go to real pages.
    for (const m of html.matchAll(/<a href="https:\/\/shop\.astrowani\.com\/test-site\/([^"?]+)/g)) {
      assert.ok(fs.existsSync(path.join(SITE, m[1])), `${rel}: outlink to missing ${m[1]}`);
    }
    if (hi) assert.ok(!/Horoscope Today|In love/.test(html.replace(/<head>[\s\S]*?<\/head>/, '')), `${rel}: English in Hindi story`);
  }
  // A new day changes all 24.
  const next = new Date(2026, 10, 18, 12);
  assert.equal(horoscopeStories.writeStories(root, '2026-11-18', next, (s, l) => ctx.reading(s, next, 'daily', l)).changed, 24);
  fs.rmSync(root, { recursive: true, force: true });
});

test('the bake script writes the stories alongside the sign pages', () => {
  const src = fs.readFileSync(path.join(SITE, 'aw/bake-horoscopes.js'), 'utf8');
  assert.match(src, /require\('\.\/horoscope-stories\.js'\)/);
  assert.match(src, /writeStories\(ROOT, dateStr, date/);
});

// ── blog stories: slides ──────────────────────────────────────────────────
test('slides are the article\'s own sections — not the FAQ, read-next, CTA or a one-paragraph section', () => {
  const s = bs.storySections(AGENT_EN);
  assert.deepEqual(s.map((x) => x.heading), ['What Sade Sati really is', 'The three phases', 'Practical remedies']);
  for (const x of s) assert.ok(x.text.length > 40 && x.text.length <= 271, x.text);
  assert.equal(bs.hasStory(AGENT_EN), true);
  assert.equal(bs.hasStory(rows[1].content_en), false, 'legacy undivided post must get no story');
  // Positive control for the >= 2 paragraph rule: the same section WITH a second paragraph counts.
  assert.equal(bs.storySections(AGENT_EN.replace(`<h2>A section with one paragraph only</h2>${para(2)}`, `<h2>A section with one paragraph only</h2>${para(2)}${para(2)}`)).length, 4);
});

// ── blog stories: the route ───────────────────────────────────────────────
const app = express();
bs.register(app, db, { siteBase: BASE });
let server, base;
test.before(async () => { server = app.listen(0, '127.0.0.1'); await new Promise((r) => server.once('listening', r)); base = `http://127.0.0.1:${server.address().port}`; });
test.after(() => server && server.close());

test('a sectioned article has a valid English and Hindi story', async () => {
  for (const [q, lang] of [['slug=sade-sati-guide', 'en'], ['slug=sade-sati-guide&lang=hi', 'hi']]) {
    const r = await fetch(`${base}/api/blogs/story-page?${q}`);
    assert.equal(r.status, 200);
    const html = await r.text();
    await assertValid(html, `blog story ${lang}`);
    const hi = lang === 'hi';
    assert.ok(html.includes(`rel="canonical" href="${BASE}/${hi ? 'hi/' : ''}stories/sade-sati-guide"`));
    assert.ok(html.includes(`<a href="${BASE}/${hi ? 'hi/' : ''}blog/sade-sati-guide">`), 'links to its article');
    assert.ok(html.includes('render/image/public/app-images/blogs/a.jpg?width=960&amp;height=1280&amp;resize=cover'), 'poster is the article photo, cropped 3:4');
    assert.ok(html.includes(hi ? 'साढ़ेसाती क्या है' : 'What Sade Sati really is'));
    assert.ok(!html.includes('Frequently asked questions'), 'FAQ is not a slide');
    assert.ok(html.includes('Sade Sati &amp; you') || hi, 'title escaped');
  }
});

test('no story for an undivided post, an unknown slug or a bad slug — 404 noindex', async () => {
  for (const q of ['slug=legacy-post', 'slug=legacy-post&lang=hi', 'slug=missing', 'slug=Bad%20Slug', '']) {
    const r = await fetch(`${base}/api/blogs/story-page?${q}`, { redirect: 'manual' });
    assert.equal(r.status, 404, q);
    assert.match(await r.text(), /noindex/);
  }
});

test('a Hindi story with no Hindi article redirects to the English story', async () => {
  const r = await fetch(`${base}/api/blogs/story-page?slug=english-only&lang=hi`, { redirect: 'manual' });
  assert.equal(r.status, 302);
  assert.equal(r.headers.get('location'), `${BASE}/stories/english-only`);
  const en = await (await fetch(`${base}/api/blogs/story-page?slug=english-only`)).text();
  assert.ok(!en.includes('hreflang'), 'no hreflang for an untranslated story');
  assert.ok(en.includes(`${BASE}/assets/stories/blog.jpg`), 'fallback poster when the article has no stored photo');
  await assertValid(en, 'english-only story');
});

test('a database failure is 503, not a not-found', async () => {
  fail = true;
  try {
    const r = await fetch(`${base}/api/blogs/story-page?slug=sade-sati-guide`);
    assert.equal(r.status, 503);
    assert.equal(r.headers.get('retry-after'), '60');
  } finally { fail = false; }
});

// ── links to stories ──────────────────────────────────────────────────────
test('an article links its story only when it has one', () => {
  const shell = fs.readFileSync(path.join(SITE, 'blog-post.html'), 'utf8');
  const withStory = renderArticle(shell, mapBlog(rows[0]), { base: BASE });
  assert.ok(withStory.includes(`href="${BASE}/stories/sade-sati-guide"`));
  const hi = renderArticle(fs.readFileSync(path.join(SITE, 'hi/blog-post.html'), 'utf8'), mapBlog(rows[0]), { base: BASE, hi: true });
  assert.ok(hi.includes(`href="${BASE}/hi/stories/sade-sati-guide"`));
  const without = renderArticle(shell, mapBlog(rows[1]), { base: BASE });
  assert.ok(!without.includes('/stories/'), 'legacy post must not link a story that 404s');
});

test('each sign page links its story', () => {
  for (const f of ['aries-horoscope.html', 'hi/aries-horoscope.html', 'pisces-horoscope.html']) {
    const sign = f.match(/([a-z]+)-horoscope/)[1];
    assert.ok(fs.readFileSync(path.join(SITE, f), 'utf8').includes(`href="stories/${sign}-horoscope.html"`), f);
  }
});

// ── sitemap ───────────────────────────────────────────────────────────────
test('the sitemap lists the 24 horoscope stories and the blog stories, with alternates', () => {
  const xml = buildSitemap([], new Set(), [], [
    { slug: 'sade-sati-guide', hasHindi: true, lastmod: '2026-10-30T10:00:00.000Z' },
    { slug: 'english-only', hasHindi: false, lastmod: '2026-10-29T10:00:00.000Z' },
  ]);
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  const horoscope = locs.filter((l) => /\/stories\/[a-z]+-horoscope\.html$/.test(l));
  assert.equal(horoscope.length, 24);
  assert.ok(locs.includes(`${BASE}/stories/sade-sati-guide`) && locs.includes(`${BASE}/hi/stories/sade-sati-guide`));
  assert.ok(locs.includes(`${BASE}/stories/english-only`) && !locs.includes(`${BASE}/hi/stories/english-only`));
  assert.match(xml, /hreflang="hi-IN" href="https:\/\/shop\.astrowani\.com\/test-site\/hi\/stories\/aries-horoscope\.html"/);
});

test('listStories reads an article body once, and again only when the article changes', async () => {
  const table = [
    { slug: 'sade-sati-guide', title_hi: rows[0].title_hi, content_en: AGENT_EN, content_hi: AGENT_HI, created_at: '2026-10-29T10:00:00Z', updated_at: '2026-10-30T10:00:00Z' },
    { slug: 'one-section', title_hi: '', content_en: `<h2>Only</h2>${para(2)}${para(2)}`, content_hi: '', created_at: '2026-10-28T10:00:00Z', updated_at: null },
  ];
  let bodyReads = 0;
  const sdb = { from() {
    let cols = '';
    const q = { select(c) { cols = c; return q; }, eq() { return q; }, not() { return q; }, ilike() { return q; }, order() { return q; },
      limit() { return Promise.resolve({ data: table.map((r) => ({ slug: r.slug, created_at: r.created_at, updated_at: r.updated_at })) }); },
      in(_, slugs) { bodyReads += slugs.length; assert.match(cols, /content_en/); return Promise.resolve({ data: table.filter((r) => slugs.includes(r.slug)) }); } };
    return q;
  } };
  const a = await bs.listStories(sdb);
  assert.deepEqual(a.map((x) => [x.slug, x.hasHindi]), [['sade-sati-guide', true]], 'one-section article has no story');
  assert.equal(bodyReads, 2);
  await bs.listStories(sdb);
  assert.equal(bodyReads, 2, 'unchanged articles must not be re-read');
  table[0].updated_at = '2026-11-01T10:00:00Z';
  await bs.listStories(sdb);
  assert.equal(bodyReads, 3, 'an edited article is re-read');
});
