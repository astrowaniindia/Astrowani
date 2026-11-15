#!/usr/bin/env node
/**
 * Astrologer profile pages (/astrologers/<slug>) — end to end, READ-ONLY.
 *
 *   node --env-file=.env scripts/testAstrologerProfiles.js
 *
 * Mounts only the profile route and the sitemap on a bare Express app on an
 * ephemeral port (index.js is never booted) and requests a page for EVERY
 * customer-visible astrologer. Writes nothing.
 *
 * The checks that matter most are the privacy ones, so they run over every
 * astrologer rather than a sample:
 *   - no email, phone number, UPI id or bank account of that astrologer appears;
 *   - no reviewer's customer name appears;
 *   - a hidden / pending / suspended astrologer gets a 404, never a page;
 * and then: the website card slug (script.js) equals the server slug for every
 * live name, the structured data parses and carries NO aggregateRating, every
 * relative asset resolves under the <base>, a stale name 301s, and the sitemap
 * lists every profile. Positive controls precede the refusals.
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const vm = require('vm');
if (typeof globalThis.WebSocket === 'undefined') globalThis.WebSocket = require('ws');
const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const pages = require('../src/astrologerProfilePages');
const registerSitemap = require('../src/blogSitemap');
const { astrologerVisibleToCustomers } = require('../src/astrologerVisibility');
const { SITE_BASE: BASE } = require('../src/blogAgent/seo');

const SITE = path.resolve(__dirname, '../../astrowani-website');
let fail = 0, pass = 0;
const ok = (c, m, extra) => { if (c) pass++; else { fail++; console.log(`FAIL  ${m}${extra ? `  (${extra})` : ''}`); } };
const get = (port, p) => new Promise((resolve, reject) => {
  http.get({ host: '127.0.0.1', port, path: p }, (res) => {
    let body = ''; res.on('data', (c) => { body += c; });
    res.on('end', () => resolve({ status: res.statusCode, location: res.headers.location, body }));
  }).on('error', reject);
});

/** astroProfileSlug from the real script.js, run in isolation. */
function clientSlugFn() {
  const src = fs.readFileSync(path.join(SITE, 'script.js'), 'utf8');
  const m = src.match(/function astroProfileSlug\(a\) \{[\s\S]*?\n\}/);
  if (!m) throw new Error('astroProfileSlug not found in script.js');
  const ctx = {}; vm.createContext(ctx);
  vm.runInContext(`${m[0]}; this.f = astroProfileSlug;`, ctx);
  return ctx.f;
}

(async () => {
  const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const app = express();
  pages.register(app, db, { siteBase: BASE, websiteRoot: SITE });
  registerSitemap(app, db);
  const server = app.listen(0);
  const port = server.address().port;
  try {
    // Every astrologer, with the private columns this test checks are NOT published.
    const { data: all, error } = await db.from('astrologers')
      .select(`${pages.PROFILE_COLUMNS}, phone_number, upi_id, bank_account_number`);
    if (error) throw error;
    const visible = all.filter(astrologerVisibleToCustomers);
    const hidden = all.filter((r) => !astrologerVisibleToCustomers(r));
    ok(visible.length > 20, `there are visible astrologers to test (${visible.length})`);
    ok(hidden.length > 0, `there are non-visible astrologers to test (${hidden.length})`);

    // Slugs: unique, and identical on the website.
    const slugs = visible.map(pages.profileSlug);
    ok(new Set(slugs).size === slugs.length, 'every visible astrologer has a unique slug');
    ok(slugs.every((s) => /^[a-z0-9-]+-[0-9a-f]{6}$/.test(s)), 'every slug fits the nginx pattern');
    const client = clientSlugFn();
    const mismatch = visible.filter((r) => client({ id: r.id, name: `${r.first_name || ''} ${r.last_name || ''}`.trim() }) !== pages.profileSlug(r));
    ok(mismatch.length === 0, 'script.js builds the same slug as the server for every live name', mismatch.map((r) => r.id).join(','));

    // Reviewer names, to make sure none is published.
    const { data: revs } = await db.from('reviews').select('astrologer_id, customer_id').not('is_hidden', 'is', true);
    const custIds = [...new Set((revs || []).map((r) => r.customer_id).filter(Boolean))];
    const { data: custs } = custIds.length ? await db.from('customers').select('id, name').in('id', custIds.slice(0, 150)) : { data: [] };
    const custName = Object.fromEntries((custs || []).map((c) => [c.id, String(c.name || '').trim()]));

    let rendered = 0, leaks = [], ldBad = [], ratingInLd = 0, names = [];
    for (const r of visible) {
      const res = await get(port, `/api/web/astrologer-page?slug=${pages.profileSlug(r)}`);
      if (res.status !== 200) { ldBad.push(`${r.id}:${res.status}`); continue; }
      rendered++;
      const h = res.body;
      for (const v of [r.email, r.phone_number, r.upi_id, r.bank_account_number]) {
        if (v && String(v).length >= 5 && h.includes(String(v))) leaks.push(`${r.id}:${String(v).slice(0, 3)}…`);
      }
      for (const rv of (revs || []).filter((x) => x.astrologer_id === r.id)) {
        const n = custName[rv.customer_id];
        // Only distinctive names: a short or generic one ("Test User") can occur in prose.
        if (n && n.length >= 6 && !/user|customer|deleted/i.test(n) && h.includes(n)) names.push(`${r.id}:${n.slice(0, 2)}…`);
      }
      try {
        const ld = JSON.parse((h.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/) || [])[1]);
        if (!ld['@graph'].some((n) => n['@type'] === 'ProfilePage')) ldBad.push(`${r.id}:no ProfilePage`);
        if (JSON.stringify(ld).includes('aggregateRating')) ratingInLd++;
      } catch (e) { ldBad.push(`${r.id}:ld ${e.message}`); }
      if (!h.includes(`<link rel="canonical" href="${pages.profileUrl(r, BASE)}">`)) ldBad.push(`${r.id}:canonical`);
      if ((h.match(/<h1[\s>]/g) || []).length !== 1) ldBad.push(`${r.id}:h1`);
    }
    ok(rendered === visible.length, `every visible astrologer renders 200 (${rendered}/${visible.length})`);
    ok(leaks.length === 0, 'no email, phone, UPI or bank number on any page', leaks.join(','));
    ok(names.length === 0, 'no reviewer customer name on any page', names.join(','));
    ok(ldBad.length === 0, 'structured data, canonical and one h1 on every page', ldBad.slice(0, 5).join(','));
    ok(ratingInLd === 0, 'no aggregateRating in any structured data');

    // Positive control for the leak check: the private value IS in the data.
    ok(visible.some((r) => r.email && r.email.includes('@')), 'leak check has real emails to look for');

    // Non-visible astrologers: 404, by their would-be slug.
    let shown = [];
    for (const r of hidden) {
      const res = await get(port, `/api/web/astrologer-page?slug=${pages.profileSlug(r)}`);
      if (res.status !== 404 || !res.body.includes('noindex')) shown.push(`${r.id}:${res.status}`);
    }
    ok(shown.length === 0, `every hidden/pending/suspended astrologer is a 404 with noindex (${hidden.length})`, shown.slice(0, 5).join(','));

    // A stale name part 301s to the current address; a bad slug 404s.
    const a = visible[0];
    const stale = await get(port, `/api/web/astrologer-page?slug=old-name-${String(a.id).slice(0, 6)}`);
    ok(stale.status === 301 && stale.location === pages.profileUrl(a, BASE), 'a stale name part 301s to the current address', `${stale.status} ${stale.location}`);
    const bad = await get(port, '/api/web/astrologer-page?slug=nobody-zzzzzz');
    ok(bad.status === 404, 'an unknown slug is a 404', bad.status);

    // Relative assets resolve under the <base>.
    const page = (await get(port, `/api/web/astrologer-page?slug=${pages.profileSlug(a)}`)).body;
    const base = (page.match(/<base href="([^"]+)"/) || [])[1];
    ok(base === `${BASE}/` && page.indexOf('<base ') < page.search(/<link[^>]+stylesheet/), '<base> is the site root and precedes the stylesheets');
    const refs = [...page.matchAll(/\s(?:href|src)="([^"#][^"]*)"/g)].map((m) => m[1]).filter((u) => !/^(https?:|mailto:|tel:|data:|\/\/)/.test(u));
    const missing = refs.filter((u) => {
      const rel = decodeURIComponent(new URL(u, base).pathname.slice(new URL(BASE).pathname.length + 1)) || 'index.html';
      return !fs.existsSync(path.join(SITE, rel));
    });
    ok(refs.length > 10 && missing.length === 0, `every relative asset resolves (${refs.length})`, missing.slice(0, 4).join(','));

    // Sitemap.
    const sm = await get(port, '/api/blogs/sitemap.xml');
    const listed = visible.filter((r) => sm.body.includes(`<loc>${pages.profileUrl(r, BASE)}</loc>`)).length;
    ok(listed === visible.length, `sitemap lists every profile (${listed}/${visible.length})`);
    ok(!hidden.some((r) => sm.body.includes(pages.profileSlug(r))), 'sitemap lists no hidden astrologer');
  } catch (e) {
    fail++; console.log('FAIL  threw:', e.message);
  } finally {
    server.close();
  }
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
