#!/usr/bin/env node
/**
 * Website analytics (src/websiteAnalyticsRoutes.js) — over real HTTP, read-only,
 * against the LIVE PostHog project and database. index.js is never booted: only
 * this module is mounted on a bare Express app on an ephemeral port, with a
 * locally signed token for an existing admin.
 *
 *   node --env-file=.env scripts/testWebsiteAnalytics.js
 */
if (typeof WebSocket === 'undefined') { try { global.WebSocket = require('ws'); } catch (_) {} }
const http = require('http');
const express = require('express');
const jwt = require('jsonwebtoken');
const { createClient } = require('@supabase/supabase-js');
const { classifySource } = require('../src/websiteAnalyticsRoutes');

let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log(`FAIL  ${m}${x !== undefined ? `  (${JSON.stringify(x).slice(0, 300)})` : ''}`); } };

function get(port, path, token) {
  return new Promise((resolve, reject) => {
    const r = http.request({ port, path, method: 'GET', headers: token ? { Authorization: `Bearer ${token}` } : {} }, (res) => {
      let s = ''; res.on('data', (d) => { s += d; }); res.on('end', () => { let b = null; try { b = JSON.parse(s); } catch (_) {} resolve({ status: res.statusCode, body: b }); });
    });
    r.on('error', reject); r.setTimeout(90000, () => r.destroy(new Error('timeout'))); r.end();
  });
}

(async () => {
  // Source classification, offline, each with a control.
  ok(classifySource({ domain: 'www.google.co.in' }).group === 'Search', 'google.co.in is Search');
  ok(classifySource({ domain: 'bing.com' }).label === 'Bing', 'bing.com is Bing');
  ok(classifySource({ domain: '$direct' }).group === 'Direct', '$direct is Direct');
  ok(classifySource({ domain: 'astrowani.com' }).group === 'Direct', 'our own host is not a referral');
  ok(classifySource({ domain: 'l.instagram.com' }).group === 'Social', 'instagram is Social');
  ok(classifySource({ domain: 'chatgpt.com' }).group === 'AI assistants', 'chatgpt is an AI assistant');
  ok(classifySource({ domain: 'google.com', adClick: 'google' }).group === 'Paid ads', 'a gclid visit is paid even from google.com');
  ok(classifySource({ utm: 'newsletter', domain: 'google.com' }).group === 'Campaign links', 'a utm tag wins over the domain');
  ok(classifySource({ domain: 'example.org' }).group === 'Other websites', 'an unknown site is Other websites');
  ok(classifySource({ domain: 'notgoogle.example' }).group === 'Other websites', 'a host merely containing "google" is not Search');

  const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { data: admin } = await db.from('admins').select('id').limit(1).maybeSingle();
  if (!admin) { console.log('FAIL  no admin row'); process.exit(1); }
  const token = jwt.sign({ id: admin.id, role: 'admin' }, process.env.JWT_SECRET, { expiresIn: '10m' });
  const customerToken = jwt.sign({ userId: '00000000-0000-0000-0000-000000000000', phone: '9123450001' }, process.env.JWT_SECRET, { expiresIn: '10m' });

  const app = express();
  require('../src/websiteAnalyticsRoutes')(app);
  const server = app.listen(0);
  const port = server.address().port;
  try {
    ok((await get(port, '/api/admin/website-analytics')).status === 401, 'no token -> 401');
    const asCustomer = await get(port, '/api/admin/website-analytics', customerToken);
    ok(asCustomer.status === 401 || asCustomer.status === 403, 'a customer token is refused', asCustomer.status);

    const r = await get(port, '/api/admin/website-analytics?days=30', token);
    ok(r.status === 200 && r.body && r.body.success, 'admin -> 200', { status: r.status, body: r.body });
    const b = r.body || {};
    ok(b.errors && Object.keys(b.errors).length === 0, 'every section answered (no failed query)', b.errors);
    // Positive control: the site has been live and sending pageviews since launch.
    ok(b.overview && b.overview.pageviews > 0 && b.overview.visitors > 0, 'pageviews and visitors are non-zero', b.overview);
    ok(Array.isArray(b.daily) && b.daily.length > 0, 'a daily series came back', b.daily && b.daily.length);
    ok(Array.isArray(b.pages) && b.pages.length > 0 && b.pages.every((p) => typeof p.views === 'number'), 'top pages came back', b.pages && b.pages.slice(0, 3));
    ok(b.sources && b.sources.groups.length > 0, 'traffic sources came back', b.sources);
    ok(b.tech && Array.isArray(b.tech.device) && b.tech.device.length > 0, 'device split came back', b.tech && b.tech.device);
    ok(Array.isArray(b.conversions) && b.conversions.length === 13, 'all 13 funnel steps are listed', b.conversions && b.conversions.length);
    ok(b.installs && typeof b.installs.total === 'number', 'website app installs counted from the database', b.installs);
    ok(b.range && b.range.days === 30, 'the range is echoed back', b.range);

    const dated = await get(port, '/api/admin/website-analytics?from=2026-11-20&to=2026-11-21', token);
    ok(dated.status === 200 && dated.body.range.from === '2026-11-20', 'a from/to range works', dated.body && dated.body.range);
    const bad = await get(port, "/api/admin/website-analytics?from=2026-11-20'%20OR%201=1&to=x&days=abc", token);
    ok(bad.status === 200 && bad.body.range.days === 7, 'junk dates fall back to the 7-day default, never reach HogQL', bad.body && bad.body.range);

    const hm = await get(port, '/api/admin/website-analytics/heatmap?page=home&days=30', token);
    ok(hm.status === 200 && hm.body.devices && hm.body.devices.desktop && hm.body.devices.mobile, 'click map answers with desktop + mobile', hm.body);
    ok(hm.body.totals && hm.body.totals.visits > 0, 'click map counts homepage visits (legacy "index" pageviews included)', hm.body && hm.body.totals);
    ok(hm.body.path === '/' || typeof hm.body.path === 'string', 'click map names the page address to show', hm.body && hm.body.path);
    const hmBad = await get(port, "/api/admin/website-analytics/heatmap?page=home'%20OR%201=1", token);
    ok(hmBad.status === 400, 'a page key outside [a-z0-9_] is refused before reaching HogQL', hmBad.status);
    ok((await get(port, '/api/admin/website-analytics/heatmap?page=home')).status === 401, 'click map needs an admin token');

    const live = await get(port, '/api/admin/website-analytics/live', token);
    ok(live.status === 200 && typeof live.body.activeVisitors === 'number', 'live visitors answers', live.body);

    console.log('\nsample:', JSON.stringify({ overview: b.overview, groups: b.sources && b.sources.groups, topPages: (b.pages || []).slice(0, 5) }));
  } finally {
    server.close();
  }
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
