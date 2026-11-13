#!/usr/bin/env node
/**
 * Does the app actually RECEIVE resized image URLs?
 *
 *   PORT=4599 node --env-file=.env scripts/imageEgressDeliveryCheck.js
 *
 * WHY THIS EXISTS, AND WHY IT DRIVES REAL ROUTES
 * `src/imageUrl.js` has been correct since 2026-10-19. The 2026-11-13 egress
 * measurement found 94 MB/day of astrologer profile photos still arriving at the
 * Android app as full-resolution originals anyway, because five returns in
 * `src/freeCallRoutes.js` and three in `index.js` never called it. A suite that
 * exercised `avatarUrl()` would have been green throughout.
 *
 * So this asserts on the BYTES A CLIENT GETS BACK from the real HTTP routes, with
 * real production rows behind them — and it fetches the resulting URL to confirm
 * the resize is real rather than merely spelled correctly.
 *
 * It boots `scripts/devServer.js`, never `index.js`: that would start
 * sessionManager's billing worker against the live database. It also refuses to
 * continue if the boot log shows EADDRINUSE — a port clash once silently tested
 * stale code and reported the failures as if they were new (CLAUDE.md, DH).
 *
 * READ-ONLY. It writes nothing, anywhere.
 */

const { spawn } = require('child_process');
const path = require('path');
const jwt = require('jsonwebtoken');

const PORT = process.env.PORT || '4599';
const BASE = `http://127.0.0.1:${PORT}`;

// Production rows, chosen 2026-11-13 because they exercise the paths under test:
// this customer has 398 messages with an astrologer whose profile_pic_url is a
// Supabase public-object URL. Read-only; nothing about them is modified.
const CUSTOMER = { id: '90f34c60-fbbd-4031-b328-ffff25529c50', phone: '8985361268' };
const ASTROLOGER_ID = 'a5f81290-d233-43fb-a986-83121d6e4568';

const RENDER = '/storage/v1/render/image/public/';
const OBJECT = '/storage/v1/object/public/';

let pass = 0;
const failures = [];
function ok(name, cond, detail) {
  if (cond) { pass += 1; console.log(`  ok   ${name}`); }
  else { failures.push(name + (detail ? ` — ${detail}` : '')); console.log(`  FAIL ${name}${detail ? ' — ' + detail : ''}`); }
}

const isRender = (u) => typeof u === 'string' && u.includes(RENDER);
const widthOf = (u) => {
  const m = typeof u === 'string' && u.match(/[?&]width=(\d+)/);
  return m ? Number(m[1]) : null;
};

async function main() {
  if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET missing — run with --env-file=.env');
  if (process.env.ENABLE_SESSION_MANAGER === 'true') throw new Error('ENABLE_SESSION_MANAGER=true — refusing');

  const alive = async () => {
    try { return (await fetch(`${BASE}/api/gifts`)).status < 500; } catch (_) { return false; }
  };

  // Reuse a server already listening here (REUSE_SERVER=1), so a flaky link to
  // Supabase can be retried without paying the ~25 s boot each time. Without the
  // flag an occupied port is an ERROR, never a silent test of whatever is there:
  // a clash once tested stale code and reported the failures as if they were new.
  let server = null;
  let log = '';
  if (await alive()) {
    if (process.env.REUSE_SERVER !== '1') {
      throw new Error(`something is already listening on ${PORT}. Pick another PORT, `
        + 'or set REUSE_SERVER=1 if it is a devServer you started yourself.');
    }
    console.log(`(reusing the server already on ${PORT})`);
  } else {
    server = spawn(process.execPath, ['--env-file=.env', path.join(__dirname, 'devServer.js')], {
      cwd: path.join(__dirname, '..'),
      env: { ...process.env, PORT, ENABLE_SESSION_MANAGER: '' },
    });
    server.stdout.on('data', (d) => { log += d; });
    server.stderr.on('data', (d) => { log += d; });
    // This machine's route to Supabase drops SYNs (CLAUDE.md 2026-09-25), so the
    // boot regularly takes 20-30 s. Wait on the listen log, not on a guess.
    let up = false;
    for (let i = 0; i < 160; i += 1) {
      if (/EADDRINUSE/.test(log)) throw new Error(`port ${PORT} already in use — pick another PORT`);
      if (await alive()) { up = true; break; }
      await new Promise((r) => setTimeout(r, 500));
    }
    if (!up) throw new Error(`server did not come up on ${PORT} in 80 s\n${log.slice(-1500)}`);
  }

  const stop = () => { if (server) { try { server.kill(); } catch (_) {} } };
  process.on('exit', stop);

  const token = jwt.sign({ userId: CUSTOMER.id, phone: CUSTOMER.phone, role: 'customer' },
    process.env.JWT_SECRET, { expiresIn: '10m' });
  // Retried, because this machine's link to Supabase intermittently times out and
  // a dropped SYN must not read as "the route serves raw URLs". GETs only — every
  // route here is read-only, so a retry cannot duplicate anything (CLAUDE.md DH:
  // never blind-retry a POST).
  const get = async (p, tok) => {
    let last = { status: 0, body: null };
    for (let i = 0; i < 4; i += 1) {
      try {
        const r = await fetch(BASE + p, { headers: tok ? { Authorization: `Bearer ${tok}` } : {} });
        let body = null;
        try { body = await r.json(); } catch (_) {}
        last = { status: r.status, body };
        if (r.status === 200) return last;
      } catch (e) { last = { status: 0, body: { error: e.message } }; }
      await new Promise((r) => setTimeout(r, 1500));
    }
    return last;
  };

  try {
    // ── 1. The helper itself, as a baseline. If these fail nothing else means
    //       anything; if ONLY these pass, the call sites are still broken.
    console.log('\n1. src/imageUrl.js (baseline)');
    const { avatarUrl, cardUrl, WIDTH } = require('../src/imageUrl');
    const sample = `https://x.supabase.co${OBJECT}app-images/astrologer-profiles/1-a.jpg`;
    ok('avatarUrl rewrites a storage URL', isRender(avatarUrl(sample)));
    ok('avatarUrl uses AVATAR width', widthOf(avatarUrl(sample)) === WIDTH.AVATAR);
    ok('cardUrl uses CARD width', widthOf(cardUrl(sample)) === WIDTH.CARD);
    ok('a data: URL is left alone', avatarUrl('data:image/png;base64,AAA') === 'data:image/png;base64,AAA');
    ok('null is left alone', avatarUrl(null) === null);
    ok('an already-transformed URL is not double-wrapped', avatarUrl(avatarUrl(sample)) === avatarUrl(sample));

    // ── 2. GET /api/customer/chat-threads — the list that was serving 64 KB faces.
    console.log('\n2. GET /api/customer/chat-threads');
    const threads = await get('/api/customer/chat-threads', token);
    ok('route answers 200', threads.status === 200, `got ${threads.status}`);
    const list = (threads.body && threads.body.data) || [];
    // POSITIVE CONTROL. Without it every "is a render URL" assertion below passes
    // on an empty list, which is exactly how a broken route looks.
    ok('returned at least one thread (control)', list.length > 0, `${list.length} threads`);
    const astroThreads = list.filter((t) => t.kind === 'astrologer' && typeof t.profileImage === 'string'
      && t.profileImage.includes('supabase.co'));
    ok('at least one astrologer thread has a storage photo (control)', astroThreads.length > 0,
      `${astroThreads.length} of ${list.length}`);
    const rawThreads = astroThreads.filter((t) => t.profileImage.includes(OBJECT));
    ok('NO astrologer thread photo is a raw object URL', rawThreads.length === 0,
      rawThreads.length ? rawThreads[0].profileImage : '');
    ok('every astrologer thread photo is at AVATAR width',
      astroThreads.every((t) => widthOf(t.profileImage) === 300),
      astroThreads.map((t) => widthOf(t.profileImage)).join(','));

    // ── 3. GET /api/customer/chat-threads/:astrologerId — the thread header.
    console.log('\n3. GET /api/customer/chat-threads/:astrologerId');
    const one = await get(`/api/customer/chat-threads/${ASTROLOGER_ID}`, token);
    ok('route answers 200', one.status === 200, `got ${one.status}`);
    const hdr = one.body && one.body.astrologer;
    ok('header carries a photo (control)', !!(hdr && hdr.profileImage), JSON.stringify(hdr || {}));
    ok('header photo is a render URL', isRender(hdr && hdr.profileImage), hdr && hdr.profileImage);
    ok('header photo is at AVATAR width', widthOf(hdr && hdr.profileImage) === 300);

    // ── 4. The resize is REAL, not just spelled right. Fetch both and compare
    //       bytes — a URL that 400s or returns the original is still 64 KB.
    console.log('\n4. the rewritten URL really is smaller');
    const renderedUrl = hdr.profileImage;
    const rawUrl = renderedUrl.replace(RENDER, OBJECT).replace(/\?.*$/, '');
    // Retried, and a total failure is reported as a SKIP rather than a FAIL: this
    // is the only step that leaves the machine for Supabase's CDN directly, and
    // this machine's route there drops SYNs (CLAUDE.md 2026-09-25). A dead link
    // here is not evidence about the code — but it must not read as a pass either,
    // so it is counted as neither.
    const size = async (u) => {
      for (let i = 0; i < 3; i += 1) {
        try {
          const r = await fetch(u);
          if (r.ok) return (await r.arrayBuffer()).byteLength;
        } catch (_) { /* retry */ }
        await new Promise((r) => setTimeout(r, 2000));
      }
      return null;
    };
    const bRaw = await size(rawUrl);
    const bRen = await size(renderedUrl);
    if (bRaw === null || bRen === null) {
      console.log('  SKIP could not reach Supabase storage from this machine '
        + `(raw=${bRaw}, rendered=${bRen}) — re-run, or check from the VPS`);
    } else {
      ok('raw original fetches (control)', bRaw > 0);
      ok('rewritten URL fetches 200', bRen > 0);
      ok('rewritten is smaller than the original', bRen < bRaw, `${bRen} vs ${bRaw} bytes`);
      console.log(`       ${(bRaw / 1024).toFixed(1)} KB raw -> ${(bRen / 1024).toFixed(1)} KB rendered`
        + `  (${(100 - 100 * bRen / bRaw).toFixed(0)}% saved on every fetch)`);
    }

    // ── 5. GET /api/remedies — the Wani Shop product grid.
    console.log('\n5. GET /api/remedies');
    const items = await get('/api/remedies');
    ok('route answers 200', items.status === 200, `got ${items.status}`);
    const withImg = ((items.body && items.body.data) || [])
      .filter((r) => typeof r.image === 'string' && r.image.includes('supabase.co'));
    ok('products with a storage image (control)', withImg.length > 0, `${withImg.length}`);
    // `length > 0 &&` on purpose: `[].every()` is true, so without it an empty
    // list would report both of these as passing — a dead route looking green.
    ok('NO product image is a raw object URL',
      withImg.length > 0 && withImg.every((r) => !r.image.includes(OBJECT)),
      (withImg.find((r) => r.image.includes(OBJECT)) || {}).image || '');
    ok('every product image is at CARD width',
      withImg.length > 0 && withImg.every((r) => widthOf(r.image) === 520));

    // ── 6. The DELIBERATE exception. This is the check that stops someone
    //       "finishing the job" on a write-back path.
    console.log('\n6. own-profile stays raw on purpose');
    const me = await get('/api/users/profile', token);
    if (me.status !== 200) {
      console.log(`  skip profile route answered ${me.status} — asserting on source instead`);
      const src = require('fs').readFileSync(path.join(__dirname, '..', 'index.js'), 'utf8');
      ok('profilePic is NOT wrapped in index.js', /profilePic: row\?\.profile_image \|\| '',/.test(src)
        && !/profilePic: imageUrl\./.test(src));
    } else {
      const pic = me.body && (me.body.data || me.body).profilePic;
      ok('profilePic is not a render URL', !isRender(pic), String(pic).slice(0, 80));
    }
    const orderSrc = require('fs').readFileSync(path.join(__dirname, '..', 'src', 'orderRoutes.js'), 'utf8');
    ok('order quote lines stay raw (persisted into order_items)',
      /image: row\.image \|\| null,/.test(orderSrc) && !/image: \w+Url\(row\.image/.test(orderSrc));

    // ── 7. Nothing on a display path got missed.
    console.log('\n7. no raw display path left in the backend');
    const fs = require('fs');
    const files = ['index.js', 'src/freeCallRoutes.js', 'src/astroRoutes.js', 'src/sessionReadRoutes.js'];
    const offenders = [];
    for (const f of files) {
      const src = fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
      src.split(/\r?\n/).forEach((line, i) => {
        if (/profile_pic_url\s*\|\|\s*(''|null)/.test(line) && !/avatarUrl|thumbnailUrl/.test(line)) {
          offenders.push(`${f}:${i + 1}`);
        }
      });
    }
    ok('no unwrapped `profile_pic_url || ...` return remains', offenders.length === 0, offenders.join(', '));
    const fcSrc = fs.readFileSync(path.join(__dirname, '..', 'src/freeCallRoutes.js'), 'utf8');
    ok('freeCallRoutes imports the helper', /require\('\.\/imageUrl'\)/.test(fcSrc));
    ok('freeCallRoutes wraps all 5 astrologer photo returns',
      (fcSrc.match(/avatarUrl\(/g) || []).length >= 5,
      String((fcSrc.match(/avatarUrl\(/g) || []).length));
  } finally {
    stop();
  }

  console.log(`\n${pass} passed, ${failures.length} failed`);
  if (failures.length) {
    failures.forEach((f) => console.log(`  - ${f}`));
    process.exitCode = 1;
  }
}

main().catch((e) => { console.error('\nHARNESS ERROR:', e.message); process.exitCode = 1; });
