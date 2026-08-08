// Verifies the 2026-08-08 fix for zero-auth /api/live/start and /api/live/:id/end
// (see security-audit-2026-08-08.md).
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const jwt = require('jsonwebtoken');
const http = require('http');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://fxpoustnddrgumhwdcma.supabase.co';
const JWT_SECRET = process.env.JWT_SECRET;
const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:4501';

if (!JWT_SECRET || JWT_SECRET.length < 32) {
  console.error('Set JWT_SECRET (matching the running local server) before running this.');
  process.exit(1);
}

const db = createClient(SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

let pass = 0, fail = 0;
function check(label, cond) {
  if (cond) { pass++; console.log(`  OK  ${label}`); }
  else { fail++; console.log(`FAIL  ${label}`); }
}

function request(method, path, { token, body } = {}) {
  return new Promise((resolve, reject) => {
    const data = body !== undefined ? JSON.stringify(body) : null;
    const url = new URL(BASE_URL + path);
    const req = http.request(
      { hostname: url.hostname, port: url.port, path: url.pathname, method,
        headers: { 'Content-Type': 'application/json',
          ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
          ...(token ? { Authorization: `Bearer ${token}` } : {}) } },
      (res) => {
        let raw = '';
        res.on('data', (c) => (raw += c));
        res.on('end', () => {
          try { resolve({ status: res.statusCode, body: JSON.parse(raw || '{}') }); }
          catch (e) { resolve({ status: res.statusCode, body: raw }); }
        });
      },
    );
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function main() {
  const tag = `livefix-${Date.now()}`;
  const randDigits = (n) => Array.from({ length: n }, () => Math.floor(Math.random() * 10)).join('');
  let victimAstro, attackerAstro, sessionId;

  try {
    const { data: v } = await db.from('astrologers').insert([{ first_name: tag, phone_number: `8${randDigits(9)}` }]).select('id').single();
    victimAstro = v;
    const { data: a } = await db.from('astrologers').insert([{ first_name: tag, phone_number: `8${randDigits(9)}` }]).select('id').single();
    attackerAstro = a;

    const attackerToken = jwt.sign({ id: attackerAstro.id, astroId: attackerAstro.id, role: 'astrologer' }, JWT_SECRET, { expiresIn: '1h' });
    const victimToken = jwt.sign({ id: victimAstro.id, astroId: victimAstro.id, role: 'astrologer' }, JWT_SECRET, { expiresIn: '1h' });

    // ── Exploit: unauthenticated start impersonating victim ────────────────────
    const noAuthStart = await request('POST', '/api/live/start', { body: { astrologerId: victimAstro.id, title: 'fake' } });
    check('live/start: no token -> 401', noAuthStart.status === 401);
    const { data: v1 } = await db.from('astrologers').select('is_live').eq('id', victimAstro.id).single();
    check('live/start: victim not marked live by unauth attempt', v1?.is_live !== true);

    // ── Exploit: attacker's own token, but tries to start AS victim via body ───
    const spoofStart = await request('POST', '/api/live/start', { token: attackerToken, body: { astrologerId: victimAstro.id, title: 'fake' } });
    check('live/start: spoofed astrologerId ignored (starts as attacker instead)', spoofStart.body?.success === true);
    const { data: v2 } = await db.from('astrologers').select('is_live').eq('id', victimAstro.id).single();
    check('live/start: victim still not live after spoof attempt', v2?.is_live !== true);
    const { data: a2 } = await db.from('astrologers').select('is_live').eq('id', attackerAstro.id).single();
    check('live/start: attacker\'s OWN row is the one marked live', a2?.is_live === true);
    sessionId = spoofStart.body?.sessionId;

    // ── Exploit: unauthenticated end of a real session ─────────────────────────
    const noAuthEnd = await request('POST', `/api/live/${sessionId}/end`, {});
    check('live/end: no token -> 401', noAuthEnd.status === 401);
    const { data: sess1 } = await db.from('live_sessions').select('is_active').eq('id', sessionId).single();
    check('live/end: session still active after unauth attempt', sess1?.is_active === true);

    // ── Exploit: victim tries to end attacker's session ─────────────────────────
    const crossEnd = await request('POST', `/api/live/${sessionId}/end`, { token: victimToken });
    check('live/end: another vendor cannot end this session (403)', crossEnd.status === 403);
    const { data: sess2 } = await db.from('live_sessions').select('is_active').eq('id', sessionId).single();
    check('live/end: session still active after cross-vendor attempt', sess2?.is_active === true);

    // ── Regression: attacker ends their own real session ────────────────────────
    const ownEnd = await request('POST', `/api/live/${sessionId}/end`, { token: attackerToken });
    check('live/end: owner can end their own session', ownEnd.body?.success === true);
    const { data: sess3 } = await db.from('live_sessions').select('is_active').eq('id', sessionId).single();
    check('live/end: session now inactive', sess3?.is_active === false);
  } finally {
    if (sessionId) await db.from('live_sessions').delete().eq('id', sessionId);
    if (victimAstro) await db.from('astrologers').delete().eq('id', victimAstro.id);
    if (attackerAstro) await db.from('astrologers').delete().eq('id', attackerAstro.id);
  }

  console.log(`\n${pass}/${pass + fail} assertions passed.`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => { console.error('Test run failed:', e); process.exit(1); });
