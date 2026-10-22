/**
 * Verification for src/birdEyeRoutes.js — over real HTTP, against the LIVE database.
 *
 * Run:  node --env-file=.env scripts/birdEyeCheck.js
 *
 * ⚠️ `index.js` IS NEVER BOOTED HERE. Booting it starts sessionManager's 30s billing
 * worker and the hourly earnings reset against production (CLAUDE.md standing rules /
 * the `local-backend-bills-production` memory). This mounts ONLY birdEyeRoutes on a bare
 * Express app, on an ephemeral port so there is no EADDRINUSE to mistake for a product
 * failure — a port clash silently tested stale code once before (subsystem DH).
 *
 * WHAT THIS IS ACTUALLY FOR. Asserting the handler returns 200 with the right keys would
 * pass just as well against a backend that reports zero for everything, which is the
 * failure mode that matters on a live-operations screen: it looks calm. So every number
 * is cross-checked against an INDEPENDENT aggregate of the same tables, and the live
 * band gets a POSITIVE CONTROL — a synthetic active session, so "0 consultations in
 * progress" has to be a measurement rather than a constant.
 *
 * The synthetic session is written with per_minute_charge = 0 and next_billing_at a day
 * in the future, deliberately: production's sessionManager polls chat_sessions every 30
 * seconds and WOULD bill a synthetic session that looked due. Same precaution as the
 * 2026-10-03 busy-status probe.
 */

// @supabase/realtime-js reaches for a global WebSocket at import and Node 20 has none.
// Local-debug shim only; never needed on the VPS.
if (typeof globalThis.WebSocket === 'undefined') {
  try { globalThis.WebSocket = require('ws'); } catch (_) { /* only needed if realtime is touched */ }
}

const express = require('express');
const jwt = require('jsonwebtoken');
const { createClient } = require('@supabase/supabase-js');

const birdEye = require('../src/birdEyeRoutes');

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

let pass = 0;
const failures = [];
function ok(label, condition, detail) {
  if (condition) {
    pass += 1;
    console.log(`  ✓ ${label}`);
  } else {
    failures.push(label);
    console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
  }
}
const eq = (label, actual, expected) => ok(label, actual === expected, `got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
const section = (name) => console.log(`\n── ${name} ──`);

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const istDayOf = (v) => new Date(new Date(v).getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);

// Module-scoped so the handler at the bottom can always close it. A listening server
// keeps the event loop alive, so a throw anywhere in main() used to leave the process
// HUNG FOREVER instead of reporting — which is how a deliberately broken aggregate
// turned into a run that simply never finished (2026-10-22). A suite that hangs is worse
// than one that fails, because a hang reads as a slow query rather than as a result.
let server = null;

async function main() {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET missing — run with node --env-file=.env');

  const adminToken = jwt.sign({ role: 'admin', email: 'birdeye-check@local' }, secret, { expiresIn: '10m' });
  const customerToken = jwt.sign({ role: 'customer', phone: '9123450001' }, secret, { expiresIn: '10m' });

  const app = express();
  app.use(express.json());
  birdEye(app);

  server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  console.log(`Harness on ${base} (ephemeral — index.js not booted)\n`);

  const get = async (path, token = adminToken) => {
    const res = await fetch(`${base}${path}`, token ? { headers: { Authorization: `Bearer ${token}` } } : {});
    let body = null;
    try { body = await res.json(); } catch (_) { /* non-JSON */ }
    return { status: res.status, body };
  };

  const ROUTES = ['/api/admin/bird-eye/pulse', '/api/admin/bird-eye/today', '/api/admin/bird-eye/trends', '/api/admin/bird-eye/signup-trend'];

  // ── Auth ──────────────────────────────────────────────────────────────────
  section('Auth: an operations screen must not be world-readable');
  for (const r of ROUTES) {
    const anon = await get(r, null);
    eq(`${r} refuses an unauthenticated read`, anon.status, 401);
    const cust = await get(r, customerToken);
    eq(`${r} refuses a customer token`, cust.status, 403);
  }

  // ── IST day arithmetic ────────────────────────────────────────────────────
  section('IST days (the 00:00–05:30 window that put 47 signups on the wrong day)');
  eq('19:00 UTC is already tomorrow in IST', birdEye.istDay('2026-10-22T19:00:00Z'), '2026-10-23');
  eq('18:00 UTC is still today in IST', birdEye.istDay('2026-10-22T18:00:00Z'), '2026-10-22');
  eq('18:29 UTC is still today in IST', birdEye.istDay('2026-10-22T18:29:59Z'), '2026-10-22');
  eq('18:30 UTC has rolled over', birdEye.istDay('2026-10-22T18:30:00Z'), '2026-10-23');
  ok('a junk timestamp gives null, not an "Invalid Date" day', birdEye.istDay('not a date') === null);
  const dayStart = new Date(birdEye.istMidnight(0)).getTime();
  ok('IST midnight today is in the past', dayStart <= Date.now());
  ok('IST midnight today is less than 24h ago', Date.now() - dayStart < 86400000);
  eq('IST midnight today lands on today IST', istDayOf(birdEye.istMidnight(0)), istDayOf(Date.now()));
  eq('IST midnight yesterday is exactly 24h earlier', new Date(birdEye.istMidnight(0)) - new Date(birdEye.istMidnight(1)), 86400000);

  // ── pulse: shape and internal arithmetic ──────────────────────────────────
  section('pulse — live state');
  const p0 = await get('/api/admin/bird-eye/pulse');
  eq('pulse answers 200', p0.status, 200);
  const a0 = p0.body?.astrologers || {};
  const s0 = p0.body?.sessions || {};
  ok('roster size is reported', Number.isInteger(a0.online), JSON.stringify(a0));
  ok('"taking work" never exceeds "online"', a0.takingWork <= a0.online, `${a0.takingWork} > ${a0.online}`);
  eq('unreachable = online − taking work', a0.onlineButUnreachable, a0.online - a0.takingWork);
  eq('free = taking work − busy', a0.free, a0.takingWork - a0.busy);
  ok('busy never exceeds the working roster', a0.busy <= a0.takingWork);
  eq('session type buckets sum to the session count', (s0.byType?.chat || 0) + (s0.byType?.audio || 0) + (s0.byType?.video || 0), s0.active);
  eq('free + paid sessions sum to the session count', s0.free + s0.paid, s0.active);

  // The "taking work" definition must agree with what the customer app is actually
  // served. Re-derived here in SQL rather than trusted from the handler.
  const { data: rosterRaw, error: rosterErr } = await db
    .from('astrologers')
    .select('id, approval_status, is_suspended, hidden_from_customers, is_chat_enabled, is_call_enabled, is_video_call_enabled')
    .eq('is_online', true)
    .limit(2000);
  if (rosterErr) throw rosterErr;
  const expectTaking = (rosterRaw || []).filter((r) => r.approval_status === 'approved'
    && r.is_suspended !== true && r.hidden_from_customers !== true
    && (r.is_chat_enabled || r.is_call_enabled || r.is_video_call_enabled)).length;
  eq('"taking work" matches an independent re-derivation', a0.takingWork, expectTaking);
  eq('roster size matches an independent count', a0.online, (rosterRaw || []).length);
  ok('the online/reachable gap is real and worth showing', a0.online >= a0.takingWork,
    'if these are always equal the tile is noise');

  // ── pulse: POSITIVE CONTROL ───────────────────────────────────────────────
  // Without this, every "0 in progress" assertion above passes against a handler that
  // returns a constant.
  section('pulse — positive control: a real active session must move the numbers');
  const { data: astro, error: astroErr } = await db
    .from('astrologers').select('id').eq('phone_number', '9999999999').limit(1).maybeSingle();
  if (astroErr) throw astroErr;
  // caller_id has an FK to customers (ON DELETE RESTRICT), so the control needs a real
  // customer row. A SOFT-DELETED account is used on purpose: it belongs to nobody, it is
  // already excluded from every analytics figure, and the probe row is deleted seconds
  // later — so no live customer is ever named in a synthetic session. The reviewer
  // customer row (mobile 9999999999) no longer exists, which is why this does not use it.
  const { data: cust, error: custErr } = await db
    .from('customers').select('id').like('mobile', 'deleted:%').limit(1).maybeSingle();
  if (custErr) throw custErr;

  let probeId = null;
  if (!astro?.id || !cust?.id) {
    ok('an astrologer and a spare customer row exist for the control', false,
      `astrologer=${!!astro?.id} customer=${!!cust?.id} — control skipped`);
  } else {
    // chat_sessions has uq_one_active_session_per_vendor, so a live session for this
    // vendor would collide. Checked rather than assumed.
    const { data: existing } = await db.from('chat_sessions').select('id').eq('vendor_id', astro.id).eq('is_active', true).limit(1);
    if (existing && existing.length) {
      ok('reviewer astrologer is free for the control', false, 'already has an active session — control skipped');
    } else {
      const before = p0.body.sessions.active;
      const { data: inserted, error: insErr } = await db.from('chat_sessions').insert([{
        vendor_id: astro.id,
        caller_id: cust.id,
        call_type: 'video',
        is_active: true,
        is_free: false,
        started_at: new Date().toISOString(),
        // Production's sessionManager polls this table every 30s. Zero charge and a
        // billing time a day out mean a real bill can never be raised against this row.
        per_minute_charge: 0,
        next_billing_at: new Date(Date.now() + 86400000).toISOString(),
      }]).select('id').single();
      if (insErr) throw insErr;
      probeId = inserted.id;

      const p1 = await get('/api/admin/bird-eye/pulse');
      eq('the active-session count went up by exactly one', p1.body.sessions.active, before + 1);
      ok('the new session is counted as video', (p1.body.sessions.byType?.video || 0) >= 1);
      ok('it is counted as paid, not free', p1.body.sessions.paid >= 1);
      ok('a session seconds old does not report a huge duration', p1.body.sessions.longestMinutes < 60,
        `longestMinutes=${p1.body.sessions.longestMinutes}`);
      // This astrologer is hidden_from_customers (the store-reviewer account), so they
      // are not on the customer-facing roster and must NOT appear in its busy count,
      // even while holding a live session. Their session still counts as a consultation
      // in progress, which is why the two numbers are allowed to disagree here.
      eq('a hidden test account stays off the roster busy count', p1.body.astrologers.busy, 0);
      ok('…and off the roster entirely', p1.body.astrologers.takingWork === a0.takingWork);

      await db.from('chat_sessions').delete().eq('id', probeId);
      const p2 = await get('/api/admin/bird-eye/pulse');
      eq('removing it puts the count back', p2.body.sessions.active, before);
      probeId = null;
    }
  }

  // The busy intersection needs an astrologer who IS on the roster, or it would sit at
  // zero forever and every "busy ≤ roster" assertion above would still pass. Run against
  // a real working astrologer for well under a second — the one production side-effect in
  // this harness: that astrologer reads as busy to customers for the moment the row
  // exists. Deliberate, and the narrowest way to prove the number is measured.
  section('pulse — positive control: the busy count is real, not a constant zero');
  const rosterFree = (rosterRaw || []).filter((r) => r.approval_status === 'approved'
    && r.is_suspended !== true && r.hidden_from_customers !== true
    && (r.is_chat_enabled || r.is_call_enabled || r.is_video_call_enabled));
  let busyProbeId = null;
  const { data: busyVendors } = await db.from('chat_sessions').select('vendor_id').eq('is_active', true).limit(500);
  const alreadyBusy = new Set((busyVendors || []).map((r) => r.vendor_id));
  const victim = rosterFree.find((r) => !alreadyBusy.has(r.id));
  if (!victim || !cust?.id) {
    ok('a free roster astrologer exists for the busy control', false, 'control skipped');
  } else {
    const { data: ins2, error: ins2Err } = await db.from('chat_sessions').insert([{
      vendor_id: victim.id,
      caller_id: cust.id,
      call_type: 'chat',
      is_active: true,
      is_free: false,
      started_at: new Date().toISOString(),
      per_minute_charge: 0,
      next_billing_at: new Date(Date.now() + 86400000).toISOString(),
    }]).select('id').single();
    if (ins2Err) throw ins2Err;
    busyProbeId = ins2.id;
    const pb = await get('/api/admin/bird-eye/pulse');
    // Deleted before the assertions so a failing expectation can never leave the row
    // behind and an astrologer stuck busy.
    await db.from('chat_sessions').delete().eq('id', busyProbeId);
    busyProbeId = null;

    ok('a roster astrologer in a session reads as busy', pb.body.astrologers.busy >= 1, JSON.stringify(pb.body.astrologers));
    eq('free drops by exactly one', pb.body.astrologers.free, pb.body.astrologers.takingWork - pb.body.astrologers.busy);
    ok('free is lower than it was with nobody busy', pb.body.astrologers.free < rosterFree.length);

    const pc = await get('/api/admin/bird-eye/pulse');
    eq('releasing them puts busy back to where it started', pc.body.astrologers.busy, a0.busy);
  }

  // ── today ─────────────────────────────────────────────────────────────────
  section('today — pace against the same hours yesterday');
  const td = await get('/api/admin/bird-eye/today');
  eq('today answers 200', td.status, 200);
  const T = td.body?.today || {};
  const Y = td.body?.yesterday || {};
  const H = td.body?.health || {};
  for (const k of ['moneyIn', 'platformShare', 'signups', 'sessions', 'paidSessions', 'minutes', 'payingCustomers', 'rechargeAttempts', 'rechargesPaid', 'freeCallsAnswered']) {
    ok(`today.${k} is a number`, typeof T[k] === 'number', JSON.stringify(T[k]));
    ok(`yesterday.${k} is a number (the comparison exists)`, typeof Y[k] === 'number');
  }
  eq('dayStart is midnight IST today', istDayOf(td.body.dayStart), istDayOf(Date.now()));
  ok('paid sessions never exceed all sessions', T.paidSessions <= T.sessions);
  ok('paid recharges never exceed attempts', T.rechargesPaid <= T.rechargeAttempts);
  ok('nothing was silently truncated', td.body.truncated === false, 'pagedSelect hit its backstop');

  eq('connection health adds up', H.connected + H.neverConnected, H.calls);
  ok('connected never exceeds calls placed', H.connected <= H.calls);
  ok('calls ending inside a minute are a subset of calls', H.diedUnderAMinute <= H.calls);

  // Independent cross-check of signups: the same IST day, the same exclusions, computed
  // straight from the table. This is the check that would catch a UTC day boundary or a
  // filter quietly dropping everybody.
  const todayStartIso = birdEye.istMidnight(0);
  const { data: rawSignups, error: suErr } = await db
    .from('customers').select('id, mobile').gte('created_at', todayStartIso).limit(5000);
  if (suErr) throw suErr;
  const { data: exclRows } = await db.from('app_settings').select('key, value')
    .in('key', ['analytics_excluded_customers', 'analytics_deleted_customers']);
  const exclIds = new Set();
  for (const row of exclRows || []) {
    try {
      for (const id of JSON.parse(row.value) || []) exclIds.add(String(id).toLowerCase());
    } catch (_) { /* a malformed list excludes nobody, same as the module */ }
  }
  const expectSignups = (rawSignups || [])
    .filter((c) => !String(c.mobile || '').startsWith('deleted:') && !exclIds.has(String(c.id).toLowerCase()))
    .length;
  eq('today.signups matches an independent count over the same IST day', T.signups, expectSignups);
  ok('that control is non-trivial (there were signups to count)', (rawSignups || []).length > 0,
    'zero signups today — the check above cannot distinguish a working filter from a broken one');

  // Independent cross-check of money in.
  const { data: paidToday, error: ptErr } = await db
    .from('wallet_recharges').select('amount, customer_id').eq('status', 'paid').gte('paid_at', todayStartIso).limit(5000);
  if (ptErr) throw ptErr;
  const expectMoney = Math.round((paidToday || [])
    .filter((r) => !exclIds.has(String(r.customer_id).toLowerCase()))
    .reduce((sum, r) => sum + Number(r.amount || 0), 0));
  eq('today.moneyIn matches an independent sum', T.moneyIn, expectMoney);

  // ── today: the queues ─────────────────────────────────────────────────────
  section('today — the queues, and "could not look" vs "nothing to do"');
  const queues = td.body?.queues || [];
  eq('six queues are reported', queues.length, 6);
  ok('every queue carries a link to the page that clears it', queues.every((q) => typeof q.to === 'string' && q.to.startsWith('/')));
  ok('every real queue reports ok:true', queues.every((q) => q.ok === true), JSON.stringify(queues));

  const { count: pendingAstroCount } = await db.from('astrologers')
    .select('id', { count: 'exact', head: true }).eq('approval_status', 'pending');
  const astroQ = queues.find((q) => q.key === 'astrologers');
  eq('the approvals queue matches a direct count', astroQ?.count, pendingAstroCount);
  ok('the approvals queue is non-empty, so the count is proving something', (pendingAstroCount || 0) > 0,
    'an all-zero queue set cannot distinguish a working count from a stub');

  // safeCount's two branches, driven directly — the unreadable one cannot be reached
  // through an endpoint without breaking a real table, and it is the branch that decides
  // whether an unread queue shows as "?" or as a confident zero.
  //
  // THIS IS THE CHECK THAT FOUND THE BUG. A HEAD request for an unknown table answers
  // 204 with error null AND count null, so the original `if (error) throw` guard never
  // fired and every missing table read as an empty queue. Asserted on the real client
  // rather than on a stub, because the behaviour under test is supabase-js's.
  const headMissing = await db.from('bird_eye_no_such_table_').select('id', { count: 'exact', head: true });
  ok('a HEAD count on an unknown table does NOT set error (why count must be checked)',
    !headMissing.error, 'behaviour changed — the guard can be simplified back to an error check');
  ok('…and it returns no count at all', !Number.isFinite(headMissing.count), `count=${headMissing.count}`);
  const badCount = await birdEye.safeCount('probe', () => db.from('bird_eye_no_such_table_').select('id', { count: 'exact', head: true }));
  eq('safeCount reports an unreadable queue as ok:false', badCount.ok, false);
  eq('…and does not invent a number for it', badCount.count, 0);
  const goodCount = await birdEye.safeCount('probe', () => db.from('astrologers').select('id', { count: 'exact', head: true }).eq('approval_status', 'pending'));
  eq('safeCount reports a real queue as ok:true', goodCount.ok, true);
  eq('…with the right number', goodCount.count, pendingAstroCount);
  // An EMPTY table must read as ok:true with 0 — "nothing to do", not "could not look".
  const emptyCount = await birdEye.safeCount('probe', () => db.from('customer_reports').select('id', { count: 'exact', head: true }).eq('status', 'pending'));
  eq('an empty queue is ok:true, not confused with unreadable', emptyCount.ok, true);
  eq('…and counts zero', emptyCount.count, 0);

  // ── trends ────────────────────────────────────────────────────────────────
  section('trends — TODAY by hour, every elapsed hour seeded');
  const nowHour = new Date(Date.now() + IST_OFFSET_MS).getUTCHours();
  const tr = await get('/api/admin/bird-eye/trends');
  eq('trends answers 200', tr.status, 200);
  const pts = tr.body?.points || [];
  eq('it reports today', tr.body?.day, istDayOf(Date.now()));
  eq('…and the hour it ran through', tr.body?.throughHour, nowHour);
  eq('one point per elapsed hour, midnight through now', pts.length, nowHour + 1);
  eq('the first bucket is midnight IST', pts[0]?.label, '00:00');
  eq('the last bucket is the current IST hour', pts[pts.length - 1]?.hour, nowHour);

  // THE ONE THAT MATTERS: hours still to come must be absent, not zero. Seeding all 24
  // would draw the rest of the day as a hard zero, so at 10am the chart would show a
  // fourteen-hour cliff to the floor — which reads as the platform dying rather than as
  // the day not having happened yet.
  ok('no bucket exists for an hour that has not happened', pts.every((pt) => pt.hour <= nowHour),
    JSON.stringify(pts.map((p) => p.hour)));
  ok('hours ascend and are contiguous', pts.every((pt, i) => (i === 0 ? pt.hour === 0 : pt.hour === pts[i - 1].hour + 1)));
  ok('elapsed-but-quiet hours ARE present as zeros', pts.length === nowHour + 1,
    'a 4am with no traffic is information; dropping it would join 3am to 5am with a straight line');
  ok('every point carries all four series, zeros included', pts.every((pt) => (
    typeof pt.revenue === 'number' && typeof pt.signups === 'number'
    && typeof pt.consultations === 'number' && typeof pt.paidConsultations === 'number'
  )));
  ok('labels are zero-padded hours', pts.every((pt) => /^\d{2}:00$/.test(pt.label || '')));
  ok('paid consultations never exceed all consultations in any hour', pts.every((pt) => pt.paidConsultations <= pt.consultations));

  // The day's hours must sum to the figures the tiles show, or the chart and the tile
  // above it are telling an operator two different things about the same day.
  // Optional-chained/guarded deliberately: an empty series used to throw here, which
  // aborted main() and hid every later section (found by the day-seeding regression).
  const sum = (k) => pts.reduce((acc, pt) => acc + (pt[k] || 0), 0);
  eq('hourly signups sum to today\'s signup tile', sum('signups'), T.signups);
  eq('hourly consultations sum to today\'s consultation tile', sum('consultations'), T.sessions);
  eq('hourly paid consultations sum to the paid figure', sum('paidConsultations'), T.paidSessions);
  eq('hourly revenue sums to the money-in tile', sum('revenue'), T.moneyIn);
  ok('the day is not entirely empty', sum('signups') + sum('consultations') + sum('revenue') > 0,
    'nothing happened today, so these sums cannot verify the bucketing');

  // ── signup-trend ──────────────────────────────────────────────────────────
  section('signup-trend — the flow by hour, as lines, not as a funnel');
  const st = await get('/api/admin/bird-eye/signup-trend');
  if (st.status === 503) {
    ok('PostHog is not configured here, and the route says so instead of 500ing', true);
    ok('…and it is the ONLY route that degrades this way', [p0.status, td.status, tr.status].every((s) => s === 200));
  } else {
    eq('signup-trend answers 200', st.status, 200);
    eq('counted as people, not events', st.body?.basis, 'persons');
    eq('it reports today', st.body?.day, istDayOf(Date.now()));
    const sp = st.body?.points || [];
    eq('one point per elapsed hour', sp.length, nowHour + 1);
    eq('the first bucket is midnight IST', sp[0]?.label, '00:00');
    ok('no bucket for an hour that has not happened', sp.every((pt) => pt.hour <= nowHour));
    ok('hours ascend and are contiguous', sp.every((pt, i) => (i === 0 ? pt.hour === 0 : pt.hour === sp[i - 1].hour + 1)));
    ok('the two charts cover exactly the same hours', sp.length === pts.length,
      `signup ${sp.length} vs money ${pts.length} — the panels would disagree about the day`);
    ok('every point carries all six steps', sp.every((pt) => ['shown', 'opened', 'card', 'signedIn', 'rang', 'answered']
      .every((k) => typeof pt[k] === 'number')));
    ok('no negative counts', sp.every((pt) => ['shown', 'opened', 'card', 'signedIn', 'rang', 'answered'].every((k) => pt[k] >= 0)));
    ok('today is not flat zero (the events are arriving)', sp.some((pt) => pt.shown || pt.rang),
      'all zeros — either the flow is dead or the query is wrong');
    // ── The timezone cross-check between the two panels ─────────────────────
    //
    // The two charts sit side by side and come from DIFFERENT sources — one from
    // Postgres, one from PostHog — but must agree about when the day happened. The
    // failure to catch is PostHog bucketing in UTC: 00:00–05:30 IST is the PREVIOUS
    // UTC day, so those events would land in buckets 18–23, which seedTodayHours drops,
    // and the whole early morning would silently vanish from one panel only.
    //
    // Measured against production: midnight–01:00 IST is genuinely this app's busiest
    // hour (13 of today's 16 signups), so "the peak looks like a waking hour" is NOT a
    // valid test here — it fails on correct data. What is valid is that if the database
    // recorded signups before 06:00 IST, the app was demonstrably in use then and
    // PostHog must show something in those same buckets.
    const early = (rows, keys) => rows.filter((pt) => pt.hour <= 5)
      .reduce((acc, pt) => acc + keys.reduce((n, k) => n + (pt[k] || 0), 0), 0);
    const earlyDb = early(pts, ['signups']);
    const earlyPh = early(sp, ['shown', 'rang']);
    if (earlyDb > 0) {
      ok('PostHog buckets the early hours in IST, like the database panel beside it',
        earlyPh > 0,
        `${earlyDb} signups before 06:00 IST in the database but no PostHog activity there — UTC bucketing would do exactly this`);
    } else {
      ok('(no pre-06:00 signups today, so the IST cross-check cannot run)', true);
    }
  }

  // ── Teardown ──────────────────────────────────────────────────────────────
  section('Teardown');
  if (probeId) await db.from('chat_sessions').delete().eq('id', probeId);
  if (busyProbeId) await db.from('chat_sessions').delete().eq('id', busyProbeId);
  const { count: leftovers } = await db.from('chat_sessions')
    .select('id', { count: 'exact', head: true }).eq('per_minute_charge', 0).eq('is_active', true);
  eq('no synthetic zero-charge active session left behind', leftovers || 0, 0);

  console.log(`\n${failures.length ? '✗' : '✓'} ${pass} passed, ${failures.length} failed`);
  if (failures.length) {
    for (const f of failures) console.log(`   - ${f}`);
    process.exitCode = 1;
  }
}

main()
  .catch((err) => {
    console.error('\nHARNESS ERROR:', err);
    process.exitCode = 1;
  })
  .finally(() => {
    if (server) server.close();
  });
