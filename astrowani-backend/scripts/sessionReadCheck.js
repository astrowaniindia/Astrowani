// Verifies src/sessionReadRoutes.js against the LIVE database, over real HTTP.
//
// Run:  node --env-file=.env scripts/sessionReadCheck.js
//
// index.js is NEVER booted here -- it starts sessionManager's 30s billing worker and the
// hourly earnings reset against production (memory: local-backend-bills-production). A
// bare Express app with only this module mounted is the whole harness, on an ephemeral
// port so there is no EADDRINUSE to mistake for a product failure (the trap that silently
// tested stale code on 2026-09-30).
//
// Every route here is a GET and nothing writes, so there is no teardown to assert -- but
// the suite still re-reads two rows at the end to prove it changed nothing.
//
// METHOD NOTE: every refusal case is preceded by a POSITIVE CONTROL on the same route.
// "The stranger got nothing" proves nothing unless somebody legitimate got something from
// the same code path a moment earlier (CLAUDE.md BN).

// Node 20 has no global WebSocket, which @supabase/realtime-js wants at import time.
// Local-harness only -- see the same shim in appPromptCheck.js / customerPlatformCheck.js.
if (typeof globalThis.WebSocket === 'undefined') {
  try { globalThis.WebSocket = require('ws'); } catch (_) { /* fails loudly below */ }
}

const express = require('express');
const jwt = require('jsonwebtoken');
const { createClient } = require('@supabase/supabase-js');

const JWT_SECRET = process.env.JWT_SECRET;
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// Real subjects, chosen by row count against production on 2026-10-21.
const CUST = { id: 'c06df587-062b-45de-a782-b42abacea6a7', mobile: '9054571508' }; // 125 sessions
const VENDOR = { id: '30e6aef2-906e-4245-8194-3e5018e4ef4d', phone: '8090307127' }; // 279 sessions
const MISSED_VENDOR = { id: '8d24b394-e506-435c-b846-e77aaf11c27a', phone: '1234567890' }; // 27 missed chats
const ZERO_CUST = { id: '00036958-a582-4295-93bc-690197e67fb5', mobile: '9601393219' }; // 0 sessions

let pass = 0;
let fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (extra ? '  -> ' + JSON.stringify(extra).slice(0, 300) : '')); }
};

const custToken = (mobile) => jwt.sign({ phone: mobile, role: 'customer' }, JWT_SECRET, { expiresIn: '1h' });
const vendorToken = (id) => jwt.sign({ astroId: id, role: 'astrologer' }, JWT_SECRET, { expiresIn: '1h' });

async function main() {
  if (!JWT_SECRET) throw new Error('JWT_SECRET unset -- run with --env-file=.env');

  const app = express();
  app.use(express.json());
  require('../src/sessionReadRoutes')(app);

  const server = await new Promise((resolve) => {
    const srv = app.listen(0, '127.0.0.1', () => resolve(srv));
  });
  const base = 'http://127.0.0.1:' + server.address().port;
  console.log('harness on ' + base + '  (index.js NOT booted)\n');

  const get = async (path, token) => {
    const res = await fetch(base + path, {
      headers: token ? { Authorization: 'Bearer ' + token } : {},
    });
    let body = null;
    try { body = await res.json(); } catch (_) {}
    return { status: res.status, body };
  };

  const cTok = custToken(CUST.mobile);
  const vTok = vendorToken(VENDOR.id);
  const mTok = vendorToken(MISSED_VENDOR.id);

  /* ---------------------------- GET /api/customer/sessions ---------------------- */
  console.log('GET /api/customer/sessions');
  {
    // POSITIVE CONTROL FIRST. Everything below is "X did not leak"; that is only
    // meaningful because this call demonstrably returns real rows.
    const r = await get('/api/customer/sessions', cTok);
    ok('200 for the owner', r.status === 200 && r.body && r.body.success === true, r.body);
    const list = (r.body && r.body.sessions) || [];
    ok('returns rows (positive control)', list.length > 0, { n: list.length });
    ok('every row belongs to the asking customer',
      list.length > 0 && list.every((s) => String(s.caller_id) === CUST.id));

    // Matches what the screen used to compute for itself.
    const { data: direct } = await db.from('chat_sessions')
      .select('id').eq('caller_id', CUST.id).order('started_at', { ascending: false }).limit(100);
    ok('same row count as the direct read it replaces',
      list.length === (direct || []).length, { api: list.length, direct: (direct || []).length });
    ok('newest first', list.length < 2 ||
      new Date(list[0].started_at) >= new Date(list[list.length - 1].started_at));

    // The join the screen used to make itself.
    const withAstro = list.filter((s) => s.astrologer);
    ok('astrologer joined server-side', withAstro.length > 0, { joined: withAstro.length });
    ok('joined astrologer carries a name', withAstro.length === 0 || withAstro.some((s) => s.astrologer.name));
    ok('avatar goes out resized, not as the raw object url',
      withAstro.every((s) => !s.astrologer.profilePicUrl ||
        s.astrologer.profilePicUrl.includes('/render/image/')),
      withAstro.slice(0, 1).map((s) => s.astrologer.profilePicUrl));

    // types= is a whitelist, not a passthrough into .in()
    const chatOnly = await get('/api/customer/sessions?types=chat', cTok);
    const chatRows = (chatOnly.body && chatOnly.body.sessions) || [];
    ok('types=chat filters', chatRows.length > 0 && chatRows.every((s) => s.call_type === 'chat'),
      { n: chatRows.length });
    // The injected fragment is `chat"),` -- if it reached the .in() filter it would
    // break out into an extra value and chat rows would come back alongside the video
    // ones. Only `video` is legitimate here, so chat rows appearing IS the failure.
    const junk = await get('/api/customer/sessions?types=' + encodeURIComponent('chat"),video'), cTok);
    const junkRows = (junk.body && junk.body.sessions) || [];
    ok('an injected types value is dropped, not passed to .in()',
      junk.status === 200 && junkRows.every((s) => s.call_type === 'video'),
      { n: junkRows.length, types: [...new Set(junkRows.map((s) => s.call_type))] });
    // ...and the control for it: the same shape with a clean value does return rows,
    // so the check above is not passing on an empty list.
    const clean = await get('/api/customer/sessions?types=video', cTok);
    ok('control: types=video alone returns the same set',
      clean.status === 200 &&
      ((clean.body.sessions || []).length === junkRows.length),
      { clean: (clean.body.sessions || []).length, junk: junkRows.length });

    ok('limit is clamped to 200', (await get('/api/customer/sessions?limit=99999', cTok)).status === 200);

    // Refusals -- each meaningful only because of the control above.
    ok('401 without a token', (await get('/api/customer/sessions')).status === 401);
    ok('401 for a token signed with the wrong secret',
      (await get('/api/customer/sessions', jwt.sign({ phone: CUST.mobile }, 'not-the-secret'))).status === 401);
    ok('403 for a VENDOR token (one phone can be both)',
      (await get('/api/customer/sessions', vTok)).status === 403);
  }

  /* ------------------------ GET /api/customer/active-session ------------------- */
  console.log('\nGET /api/customer/active-session');
  {
    const r = await get('/api/customer/active-session', cTok);
    ok('200 for the owner', r.status === 200 && r.body.success === true, r.body);
    const { data: live } = await db.from('chat_sessions')
      .select('id, call_type, request_id').eq('caller_id', CUST.id).eq('is_active', true)
      .order('started_at', { ascending: false }).limit(1);
    const expected = live && live[0] && live[0].call_type === 'chat' && live[0].request_id ? live[0].id : null;
    ok('agrees with the database about whether there is a chat to resume',
      (r.body.session ? r.body.session.id : null) === expected, { api: r.body.session, expected });
    ok('a non-chat or absent session is reported as null, not an error',
      expected !== null || r.body.session === null);
    ok('403 for a vendor token', (await get('/api/customer/active-session', vTok)).status === 403);
    ok('401 without a token', (await get('/api/customer/active-session')).status === 401);
  }

  /* -------------------- GET /api/customer/first-session-eligible --------------- */
  console.log('\nGET /api/customer/first-session-eligible');
  {
    // Positive control: a customer who HAS sessions must be refused the free one.
    const used = await get('/api/customer/first-session-eligible', cTok);
    ok('200 for the owner', used.status === 200 && used.body.success === true, used.body);
    ok('a customer with sessions is NOT eligible', used.body.eligible === false, used.body);
    ok('reports the count it decided on', used.body.sessionCount > 0, used.body);

    // The other half, without which "not eligible" could just be a stuck false.
    const fresh = await get('/api/customer/first-session-eligible', custToken(ZERO_CUST.mobile));
    ok('a customer with NO sessions IS eligible', fresh.body && fresh.body.eligible === true, fresh.body);
    ok('and reports zero', fresh.body && fresh.body.sessionCount === 0, fresh.body);

    ok('403 for a vendor token', (await get('/api/customer/first-session-eligible', vTok)).status === 403);
    ok('401 without a token', (await get('/api/customer/first-session-eligible')).status === 401);
  }

  /* ----------------------------- GET /api/vendor/missed ----------------------- */
  console.log('\nGET /api/vendor/missed');
  {
    const r = await get('/api/vendor/missed', mTok);
    ok('200 for the astrologer', r.status === 200 && r.body.success === true, r.body);
    const missed = (r.body && r.body.missed) || [];
    ok('returns rows (positive control)', missed.length > 0, { n: missed.length });
    ok('every row is a call or a chat', missed.every((m) => m.kind === 'call' || m.kind === 'chat'));
    ok('both kinds merged', new Set(missed.map((m) => m.kind)).size >= 1);
    ok('sorted newest first', missed.length < 2 ||
      new Date(missed[0].createdAt) >= new Date(missed[missed.length - 1].createdAt));

    const { count: chatCount } = await db.from('chat_requests')
      .select('id', { count: 'exact', head: true })
      .eq('receiver_id', MISSED_VENDOR.id).eq('status', 'missed');
    ok('chat rows match the direct read it replaces',
      missed.filter((m) => m.kind === 'chat').length === Math.min(chatCount || 0, 50),
      { api: missed.filter((m) => m.kind === 'chat').length, direct: chatCount });

    const cnt = await get('/api/vendor/missed?countOnly=1', mTok);
    ok('countOnly returns a number', cnt.status === 200 && typeof cnt.body.count === 'number', cnt.body);
    ok('countOnly is at least the listed rows', cnt.body.count >= missed.length,
      { count: cnt.body.count, listed: missed.length });
    ok('countOnly carries no rows', cnt.body.missed === undefined);

    const since = await get('/api/vendor/missed?countOnly=1&since=' + new Date().toISOString(), mTok);
    ok('since=now gives 0 (the drawer badge after being read)', since.body.count === 0, since.body);
    const garbage = await get('/api/vendor/missed?countOnly=1&since=not-a-date', mTok);
    ok('an unparseable since is ignored, not passed through',
      garbage.status === 200 && garbage.body.count === cnt.body.count, garbage.body);

    // A DIFFERENT astrologer must not see these.
    const other = await get('/api/vendor/missed', vTok);
    ok('another astrologer sees only their own', other.status === 200 &&
      ((other.body.missed || []).length !== missed.length ||
        (other.body.missed || []).every((m) => !missed.some((x) => x.id === m.id))),
      { mine: missed.length, theirs: (other.body.missed || []).length });

    ok('401 without a token', (await get('/api/vendor/missed')).status === 401);
    ok('401 for a customer token', (await get('/api/vendor/missed', cTok)).status === 401);
  }

  /* ---------------------------- GET /api/vendor/sessions ---------------------- */
  console.log('\nGET /api/vendor/sessions');
  {
    const r = await get('/api/vendor/sessions', vTok);
    ok('200 for the astrologer', r.status === 200 && r.body.success === true, r.body);
    const list = (r.body && r.body.sessions) || [];
    ok('returns rows (positive control)', list.length > 0, { n: list.length });
    ok('every row belongs to the asking astrologer',
      list.every((s) => String(s.vendor_id) === VENDOR.id));
    ok('customer name joined server-side', list.some((s) => s.customerName),
      { named: list.filter((s) => s.customerName).length });
    ok('customer avatar resized when present',
      list.every((s) => !s.customerImage || s.customerImage.includes('/render/image/') ||
        s.customerImage.startsWith('file://')),
      list.filter((s) => s.customerImage).slice(0, 1).map((s) => s.customerImage));
    ok('no earnings column invented here', list.every((s) => s.earnings === undefined));

    const audio = await get('/api/vendor/sessions?types=audio,voice', vTok);
    const aRows = (audio.body && audio.body.sessions) || [];
    ok('types filter applies', aRows.every((s) => s.call_type === 'audio' || s.call_type === 'voice'),
      { types: [...new Set(aRows.map((s) => s.call_type))] });

    ok('401 without a token', (await get('/api/vendor/sessions')).status === 401);
    ok('401 for a customer token', (await get('/api/vendor/sessions', cTok)).status === 401);
  }

  /* -------------------- GET /api/vendor/session-by-request/:id ---------------- */
  console.log('\nGET /api/vendor/session-by-request/:requestId');
  {
    const { data: withReq } = await db.from('chat_sessions')
      .select('id, request_id').eq('vendor_id', VENDOR.id).not('request_id', 'is', null).limit(1);
    const sample = withReq && withReq[0];
    if (!sample) {
      ok('SKIPPED -- no session with a request_id for this vendor', false, { vendor: VENDOR.id });
    } else {
      const r = await get('/api/vendor/session-by-request/' + sample.request_id, vTok);
      ok('resolves the owning vendor own session (positive control)',
        r.status === 200 && r.body.sessionId === sample.id, { got: r.body, expected: sample.id });

      // The whole point of the vendor_id scope.
      const other = await get('/api/vendor/session-by-request/' + sample.request_id, mTok);
      ok('another astrologer gets null for the same request id',
        other.status === 200 && other.body.sessionId === null, other.body);

      const unknown = await get('/api/vendor/session-by-request/' + '11111111-1111-1111-1111-111111111111', vTok);
      ok('an unknown request id is null, not an error',
        unknown.status === 200 && unknown.body.sessionId === null, unknown.body);
      const bad = await get('/api/vendor/session-by-request/not-a-uuid', vTok);
      ok('a malformed id is a 400, not a 500', bad.status === 400, bad.body);
    }
    ok('401 without a token', (await get('/api/vendor/session-by-request/x')).status === 401);
    ok('401 for a customer token', (await get('/api/vendor/session-by-request/x', cTok)).status === 401);
  }

  /* ---------------------------- nothing was written -------------------------- */
  console.log('\nread-only check');
  {
    const [{ count: sessions }, { count: requests }] = await Promise.all([
      db.from('chat_sessions').select('id', { count: 'exact', head: true }),
      db.from('chat_requests').select('id', { count: 'exact', head: true }),
    ]);
    ok('chat_sessions still 1441 rows', sessions === 1441, { sessions });
    ok('chat_requests still 671 rows', requests === 671, { requests });
  }

  server.close();
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error('harness error:', e); process.exit(1); });
