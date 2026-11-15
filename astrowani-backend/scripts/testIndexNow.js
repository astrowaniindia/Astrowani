#!/usr/bin/env node
/**
 * IndexNow (src/indexNow.js) — offline. No request ever leaves the machine: the
 * HTTP call is a stub, and the "not production" case is asserted to send nothing.
 *
 *   node scripts/testIndexNow.js
 */
const fs = require('fs');
const path = require('path');
const indexNow = require('../src/indexNow');
const { SITE_BASE } = require('../src/blogAgent/seo');

let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log(`FAIL  ${m}${x !== undefined ? `  (${JSON.stringify(x)})` : ''}`); } };

(async () => {
  // The key file the site serves must exist and hold exactly the key.
  const keyFile = path.resolve(__dirname, '../../astrowani-website', `${indexNow.KEY}.txt`);
  ok(fs.existsSync(keyFile), 'the key file exists in astrowani-website/', keyFile);
  ok(fs.existsSync(keyFile) && fs.readFileSync(keyFile, 'utf8') === indexNow.KEY, 'the key file holds exactly the key (no newline)');
  ok(/^[a-f0-9]{32}$/.test(indexNow.KEY), 'the key is 32 hex characters');

  // Only this site's URLs, deduplicated, with the key file under SITE_BASE.
  const p = indexNow.payload([`${SITE_BASE}/a.html`, `${SITE_BASE}/a.html`, 'https://evil.example/x', `${new URL(SITE_BASE).origin}/outside-the-folder.html`, 'not a url']);
  ok(p && p.urlList.length === 1 && p.urlList[0] === `${SITE_BASE}/a.html`, 'payload keeps only this site\'s URLs under SITE_BASE, once', p && p.urlList);
  ok(p && p.host === new URL(SITE_BASE).host && p.keyLocation === `${SITE_BASE}/${indexNow.KEY}.txt`, 'host and keyLocation match the site');
  ok(indexNow.payload(['https://evil.example/x']) === null, 'nothing for this site -> no request at all');

  // Not production -> nothing is sent (the stub must never be called).
  const saved = { ...process.env };
  delete process.env.ENABLE_SESSION_MANAGER; delete process.env.INDEXNOW_FORCE; delete process.env.INDEXNOW_DISABLED;
  let called = 0;
  const stub = async () => { called++; return { status: 202 }; };
  const r1 = await indexNow.submit([`${SITE_BASE}/a.html`], { fetchImpl: stub });
  ok(r1.skipped && called === 0, 'outside production nothing is sent', r1);

  // Production -> sent, 200/202 both accepted; body is what the protocol expects.
  process.env.ENABLE_SESSION_MANAGER = 'true';
  let sentBody = null, sentUrl = null;
  const r2 = await indexNow.submit([`${SITE_BASE}/a.html`], { fetchImpl: async (url, init) => { called++; sentUrl = url; sentBody = JSON.parse(init.body); return { status: 202 }; } });
  ok(r2.ok && called === 1 && sentUrl === indexNow.ENDPOINT, 'production: one POST to the IndexNow endpoint', r2);
  ok(sentBody && sentBody.key === indexNow.KEY && sentBody.urlList.length === 1, 'the body carries the key and the URL list');
  const r3 = await indexNow.submit([`${SITE_BASE}/a.html`], { fetchImpl: async () => ({ status: 403 }) });
  ok(r3.ok === false && r3.status === 403, 'a refusal is reported, not thrown', r3);
  const r4 = await indexNow.submit([`${SITE_BASE}/a.html`], { fetchImpl: async () => { throw new Error('network down'); } });
  ok(r4.ok === false && r4.error === 'network down', 'a network failure is reported, never thrown', r4);

  // The kill switch beats production.
  process.env.INDEXNOW_DISABLED = '1';
  const before = called;
  const r5 = await indexNow.submit([`${SITE_BASE}/a.html`], { fetchImpl: stub });
  ok(r5.skipped && called === before, 'INDEXNOW_DISABLED=1 sends nothing even in production', r5);

  process.env = saved;
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
