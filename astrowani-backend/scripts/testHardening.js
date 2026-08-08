// Verifies src/httpHardening.js: security headers, gzip, the CORS allowlist,
// and that the OTP rate limit actually fires. The OTP calls send a deliberately
// empty body so no real SMS is ever dispatched.
// Run: node --env-file=.env scripts/testHardening.js
const { spawn } = require('child_process');
const crypto = require('crypto');
const PORT = 4595;
const BASE = `http://127.0.0.1:${PORT}`;

const child = spawn(process.execPath, ['--env-file=.env', 'index.js'], {
  cwd: require('path').join(__dirname, '..'),
  env: {
    ...process.env, PORT: String(PORT), DISABLE_SESSION_MANAGER: '1',
    JWT_SECRET: crypto.randomBytes(48).toString('base64url'),
    CORS_ORIGINS: 'https://admin.astrowani.com,https://backend.astrowani.com',
  },
});
let log = ''; child.stdout.on('data', d => log += d); child.stderr.on('data', d => log += d);
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const check = (n, c, extra = '') => { c ? (pass++, console.log(`  PASS  ${n}`)) : (fail++, console.log(`  FAIL  ${n} ${extra}`)); };

(async () => {
  try {
    for (let i = 0; i < 60; i++) {
      try { if ((await fetch(`${BASE}/api/astrologers`)).ok) break; } catch (_) {}
      await sleep(500);
    }

    // ── security headers ────────────────────────────────────────────────
    const r = await fetch(`${BASE}/api/astrologers`);
    check('X-Content-Type-Options: nosniff', r.headers.get('x-content-type-options') === 'nosniff',
      `got ${r.headers.get('x-content-type-options')}`);
    check('X-Frame-Options set', !!r.headers.get('x-frame-options'), '(clickjacking)');
    check('X-Powered-By removed', !r.headers.get('x-powered-by'),
      `still advertises ${r.headers.get('x-powered-by')}`);

    // ── compression ─────────────────────────────────────────────────────
    const rc = await fetch(`${BASE}/api/astrologers`, { headers: { 'Accept-Encoding': 'gzip' } });
    check('gzip applied when requested', (rc.headers.get('content-encoding') || '').includes('gzip'),
      `content-encoding=${rc.headers.get('content-encoding')}`);

    // ── CORS allowlist ──────────────────────────────────────────────────
    const good = await fetch(`${BASE}/api/astrologers`, { headers: { Origin: 'https://admin.astrowani.com' } });
    const bad = await fetch(`${BASE}/api/astrologers`, { headers: { Origin: 'https://evil.example.com' } });
    check('allowed origin gets CORS header',
      good.headers.get('access-control-allow-origin') === 'https://admin.astrowani.com',
      `got ${good.headers.get('access-control-allow-origin')}`);
    check('disallowed origin gets no CORS header',
      !bad.headers.get('access-control-allow-origin'),
      `got ${bad.headers.get('access-control-allow-origin')}`);
    check('native app (no Origin) unaffected', r.status === 200);

    // ── OTP rate limit: the SMS-bill protection ─────────────────────────
    const codes = [];
    for (let i = 0; i < 9; i++) {
      const res = await fetch(`${BASE}/api/users/mobile-otp-request`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        // deliberately malformed so no real SMS is ever sent
        body: JSON.stringify({}),
      });
      codes.push(res.status);
    }
    const limited = codes.filter(c => c === 429).length;
    check('OTP endpoint starts returning 429', limited > 0, `statuses: ${codes.join(',')}`);
    check('OTP limit is 6/window', codes.slice(0, 6).every(c => c !== 429) && codes[6] === 429,
      `statuses: ${codes.join(',')}`);

    const body = await (await fetch(`${BASE}/api/users/mobile-otp-request`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
    })).json();
    check('429 returns a usable JSON message', /wait 15 minutes/i.test(body.message || ''),
      JSON.stringify(body));

    // ── general traffic is not throttled at normal volume ───────────────
    const many = await Promise.all(Array.from({ length: 60 }, () => fetch(`${BASE}/api/astrologers`).then(x => x.status)));
    check('60 normal reads all succeed', many.every(c => c === 200), `${many.filter(c => c !== 200).length} throttled`);

    check('CORS allowlist logged at startup', log.includes('CORS allowlist'), log.slice(-300));
  } catch (e) { fail++; console.log('  ERROR', e.message); console.log(log.slice(-800)); }
  finally { child.kill(); }
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
