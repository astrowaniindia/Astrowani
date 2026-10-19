#!/usr/bin/env node
// The welcome promise, against the LIVE database and over real HTTP.
//
//   node --env-file=.env scripts/welcomePromiseCheck.js
//
// ⚠ index.js IS NEVER BOOTED HERE. Booting it starts sessionManager's 30s billing
// worker against production (CLAUDE.md, local-backend-bills-production). This mounts
// only freeCallRoutes on a bare Express app, on an ephemeral port, so there is no
// EADDRINUSE to mistake for a product failure either.
//
// WHAT IT IS ACTUALLY PROVING, and why the last section is the one that matters:
// grantOnSignup() writing a row proves the module. It does NOT prove that the row
// unlocks anything — the delivery path is /api/free-call/offer reporting `invited`,
// and a harness that stops at its own module is the mistake this project has
// recorded four times (CLAUDE.md BN). So section 6 signs a real customer JWT and
// reads the real endpoint.
//
// Every refusal case is paired with a POSITIVE CONTROL first: a gate that refuses
// everything passes a suite of nothing but negative checks.
//
// It writes to production and restores exactly what it found, asserting its own
// teardown at the end. The customer it uses is the PARKED reviewer row, which has no
// invites and no bookings.
global.WebSocket = require('ws');

const express = require('express');
const http = require('http');
const jwt = require('jsonwebtoken');
const { createClient } = require('@supabase/supabase-js');

const welcomePromise = require('../src/welcomePromise');
const audienceRules = require('../src/audience');
const offerGuard = require('../src/offerGuard');

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// Parked reviewer row: name 'Test User', mobile 'parked-reviewer-9999999999'.
const CUSTOMER_ID = '550e8400-e29b-41d4-a716-446655440000';
// A number no customer holds, used only to fabricate an offer_guard claim.
const SYNTHETIC_MOBILE = '9876500011';

let pass = 0;
let fail = 0;
const ok = (c, m) => { if (c) { pass++; } else { fail++; console.log('  FAIL:', m); } };

const invitesFor = async (id) => {
  const { data } = await db.from('free_call_invites')
    .select('customer_id, invited_at, expires_at, invited_by').eq('customer_id', id);
  return data || [];
};
const totalInvites = async () => {
  const { count } = await db.from('free_call_invites').select('customer_id', { count: 'exact', head: true });
  return count || 0;
};
const clearInvite = async () => {
  await db.from('free_call_invites').delete().eq('customer_id', CUSTOMER_ID);
};
const putSetting = async (key, value) => {
  await db.from('app_settings').upsert({ key, value: JSON.stringify(value) }, { onConflict: 'key' });
};
const readSetting = async (key) => {
  const { data } = await db.from('app_settings').select('value').eq('key', key).limit(1);
  return data && data.length ? data[0].value : undefined;
};
const dropSetting = async (key) => { await db.from('app_settings').delete().eq('key', key); };
const freshCaches = () => {
  welcomePromise.invalidateWelcomePromiseCache();
  audienceRules.invalidateAudienceCache();
};

(async () => {
  // ── 0. snapshot everything this script may touch ──────────────────────────
  const baselineTotal = await totalInvites();
  const audienceBefore = await readSetting(audienceRules.SETTINGS_KEY);
  const promiseBefore = await readSetting(welcomePromise.SETTINGS_KEY);
  console.log(`baseline: ${baselineTotal} invite row(s) in total; ` +
    `${welcomePromise.SETTINGS_KEY} ${promiseBefore === undefined ? 'absent' : 'present'}`);
  ok((await invitesFor(CUSTOMER_ID)).length === 0,
    'the test customer starts with no invite — if this fails, STOP and look before trusting anything below');

  // ── 1. config normalisation (no I/O) ──────────────────────────────────────
  console.log('\nconfig');
  ok(welcomePromise.normalise(null).enabled === true,
    'a missing config row means ON — the screen has already made the promise');
  ok(welcomePromise.normalise({}).enabled === true, 'an empty object means ON');
  ok(welcomePromise.normalise({ enabled: 'false' }).enabled === true,
    'the STRING "false" does not switch it off — only a literal false may');
  ok(welcomePromise.normalise({ enabled: 0 }).enabled === true, '0 does not switch it off either');
  ok(welcomePromise.normalise({ enabled: false }).enabled === false, 'a literal false switches it off');
  ok(welcomePromise.normalise({}).validDays === 30, '30 days by default');
  ok(welcomePromise.normalise({ validDays: 7 }).validDays === 7, 'validDays is honoured');
  ok(welcomePromise.normalise({ validDays: 0 }).validDays === 30, '0 days is nonsense and falls back');
  ok(welcomePromise.normalise({ validDays: 9999 }).validDays === 30, 'an absurd validDays falls back');
  ok(welcomePromise.normalise({ validDays: '14' }).validDays === 14, 'a numeric string is accepted');

  // ── 2. POSITIVE CONTROL: it grants ────────────────────────────────────────
  console.log('\ngranting');
  freshCaches();
  let res = await welcomePromise.grantOnSignup(CUSTOMER_ID, { mobile: null });
  ok(res.granted === true, `grants with no rule set, got ${JSON.stringify(res)}`);
  let rows = await invitesFor(CUSTOMER_ID);
  ok(rows.length === 1, `exactly one invite row, got ${rows.length}`);
  ok(rows[0] && rows[0].invited_by === 'welcome_promise',
    `invited_by marks where it came from, got ${rows[0] && rows[0].invited_by}`);
  const days = rows[0] ? (new Date(rows[0].expires_at) - Date.now()) / 86400000 : 0;
  ok(days > 29.5 && days < 30.5, `expires ~30 days out, got ${days.toFixed(2)}`);

  // The row must be findable BY THE QUERY findActiveInvite ACTUALLY RUNS — not just
  // present. An expires_at in the past, or a different column name, would leave a row
  // sitting in the table that unlocks nothing.
  const { data: asFound } = await db.from('free_call_invites')
    .select('id, expires_at').eq('customer_id', CUSTOMER_ID)
    .gt('expires_at', new Date().toISOString()).limit(1);
  ok(asFound && asFound.length === 1, 'findActiveInvite\'s own query finds it');

  // ── 3. idempotent, because an OTP verify can be retried ───────────────────
  const firstInvitedAt = rows[0] && rows[0].invited_at;
  await new Promise((r) => setTimeout(r, 1100));
  res = await welcomePromise.grantOnSignup(CUSTOMER_ID, { mobile: null });
  rows = await invitesFor(CUSTOMER_ID);
  ok(res.granted === true && rows.length === 1,
    `a second grant upserts rather than duplicating, got ${rows.length} row(s)`);
  ok(rows[0] && new Date(rows[0].invited_at).getTime() > new Date(firstInvitedAt).getTime(),
    'the retry refreshed invited_at (compared by getTime, never string equality)');

  // ── 4. the switch ─────────────────────────────────────────────────────────
  console.log('\nrefusals (each after the positive control above)');
  await clearInvite();
  await putSetting(welcomePromise.SETTINGS_KEY, { enabled: false });
  freshCaches();
  res = await welcomePromise.grantOnSignup(CUSTOMER_ID, { mobile: null });
  ok(res.granted === false && res.reason === 'disabled',
    `enabled:false refuses, got ${JSON.stringify(res)}`);
  ok((await invitesFor(CUSTOMER_ID)).length === 0, 'and writes nothing');
  if (promiseBefore === undefined) await dropSetting(welcomePromise.SETTINGS_KEY);
  else await putSetting(welcomePromise.SETTINGS_KEY, JSON.parse(promiseBefore));
  freshCaches();

  // ── 5. audience narrowing — the whole point of the hook ───────────────────
  // An 'only' rule naming a segment this customer is not in. Their
  // acquisition_source is null, so they are 'unknown'; restricting to a qr_ segment
  // must exclude them. This is the shape of the rule the owner will write later.
  //
  // THE SEGMENT ID MUST BE ONE THAT EXISTS. The first version of this check wrote
  // `only: ['qr_posters']` — the segment's LABEL is "QR posters" but its id is `qr`
  // — and the grant went through, which read exactly like a broken gate. It was
  // not: normalizeRules drops an 'only' naming no known segment and degrades to
  // everyone, deliberately (CLAUDE.md DI), because the alternative is blocking
  // everybody over a typo. Asserted below, since it cost real time once.
  const rulesNow = audienceBefore ? JSON.parse(audienceBefore) : { segments: [], features: {} };
  const segIds = (rulesNow.segments || []).map((s) => s.id);
  const QR_SEG = segIds.includes('qr') ? 'qr' : null;
  if (!QR_SEG) {
    console.log('  (no qr segment configured — skipping the narrowing check)');
  } else {
    const narrowed = JSON.parse(JSON.stringify(rulesNow));
    narrowed.features = { ...(narrowed.features || {}), welcome_promise: { mode: 'only', segments: [QR_SEG] } };
    await putSetting(audienceRules.SETTINGS_KEY, narrowed);
    freshCaches();
    res = await welcomePromise.grantOnSignup(CUSTOMER_ID, { mobile: null, acquisitionSource: null });
    ok(res.granted === false && res.reason === 'audience',
      `an 'only' rule excludes an unknown-source customer, got ${JSON.stringify(res)}`);
    ok((await invitesFor(CUSTOMER_ID)).length === 0, 'and writes nothing');

    // Same rule, a customer who IS in the segment: proves the rule is being READ,
    // not just that something refused everything.
    res = await welcomePromise.grantOnSignup(CUSTOMER_ID, { mobile: null, acquisitionSource: 'qr_haridwar' });
    ok(res.granted === true, `the same rule GRANTS a qr_ customer, got ${JSON.stringify(res)}`);
    await clearInvite();

    // And the trap: an 'only' naming a segment that does not exist grants to
    // everyone rather than blocking everyone.
    const typo = JSON.parse(JSON.stringify(rulesNow));
    typo.features = { ...(typo.features || {}), welcome_promise: { mode: 'only', segments: ['no_such_segment'] } };
    await putSetting(audienceRules.SETTINGS_KEY, typo);
    freshCaches();
    res = await welcomePromise.grantOnSignup(CUSTOMER_ID, { mobile: null, acquisitionSource: null });
    ok(res.granted === true,
      `an 'only' rule naming an unknown segment degrades to everyone, got ${JSON.stringify(res)}`);
    await clearInvite();
  }

  // restore the audience rules byte-exactly
  if (audienceBefore === undefined) await dropSetting(audienceRules.SETTINGS_KEY);
  else await db.from('app_settings').upsert({ key: audienceRules.SETTINGS_KEY, value: audienceBefore }, { onConflict: 'key' });
  freshCaches();
  ok((await readSetting(audienceRules.SETTINGS_KEY)) === audienceBefore, 'audience_rules restored exactly');

  // ── 6. the offer guard refusal the owner asked to keep ────────────────────
  const hash = offerGuard.hashPhone(SYNTHETIC_MOBILE);
  let claimInserted = false;
  if (hash) {
    const { error } = await db.from('offer_claims').insert({
      phone_hash: hash, offer_key: offerGuard.OFFERS.FREE_CALL,
      last4: SYNTHETIC_MOBILE.slice(-4), source: 'welcomePromiseCheck',
      claimed_by_customer_id: null,
    });
    claimInserted = !error;
    if (error) console.log('  (could not fabricate an offer_claims row:', error.message, ')');
  }
  if (claimInserted) {
    res = await welcomePromise.grantOnSignup(CUSTOMER_ID, { mobile: SYNTHETIC_MOBILE });
    ok(res.granted === false && res.reason === 'claimed_by_earlier_account',
      `a number that already used its free call is refused, got ${JSON.stringify(res)}`);
    ok((await invitesFor(CUSTOMER_ID)).length === 0, 'and writes nothing');
    // positive control on the same path: a DIFFERENT number is not refused
    res = await welcomePromise.grantOnSignup(CUSTOMER_ID, { mobile: '9876500022' });
    ok(res.granted === true, `another number is unaffected, got ${JSON.stringify(res)}`);
    await clearInvite();
    await db.from('offer_claims').delete().eq('phone_hash', hash).eq('source', 'welcomePromiseCheck');
    const { data: leftover } = await db.from('offer_claims').select('id').eq('source', 'welcomePromiseCheck');
    ok(!leftover || leftover.length === 0, 'the fabricated claim was removed');
  }

  // ── 7. THE DELIVERY PATH — does the row actually unlock the offer? ─────────
  console.log('\nGET /api/free-call/offer (real route, real JWT)');
  const app = express();
  app.use(express.json());
  require('../src/freeCallRoutes')(app);
  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, r));
  const port = server.address().port;
  const token = jwt.sign({ userId: CUSTOMER_ID }, process.env.JWT_SECRET, { expiresIn: '1h' });
  const getOffer = async () => {
    const r = await fetch(`http://127.0.0.1:${port}/api/free-call/offer`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return { status: r.status, json: await r.json().catch(() => ({})) };
  };

  // Negative control FIRST: with no invite, the endpoint must not claim one.
  await clearInvite();
  let r = await getOffer();
  ok(r.status === 200, `the endpoint answers 200, got ${r.status}`);
  ok(r.json.invited === false || r.json.invited === undefined,
    `no invite -> not reported as invited, got ${JSON.stringify(r.json.invited)}`);

  // Now grant exactly as a signup would, and read it again.
  freshCaches();
  res = await welcomePromise.grantOnSignup(CUSTOMER_ID, { mobile: null });
  ok(res.granted === true, 'granted for the delivery check');
  r = await getOffer();
  ok(r.json.invited === true,
    `the granted row IS seen by the real endpoint, got ${JSON.stringify(r.json.invited)}`);

  await new Promise((r2) => server.close(r2));

  // ── 8. teardown, asserted ─────────────────────────────────────────────────
  console.log('\nteardown');
  await clearInvite();
  ok((await invitesFor(CUSTOMER_ID)).length === 0, 'the test customer has no invite left');
  ok((await totalInvites()) === baselineTotal,
    `the table is back to ${baselineTotal} row(s), got ${await totalInvites()}`);
  ok((await readSetting(audienceRules.SETTINGS_KEY)) === audienceBefore, 'audience_rules still exactly as found');
  ok((await readSetting(welcomePromise.SETTINGS_KEY)) === promiseBefore,
    'the welcome-promise key is exactly as found');

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error('\nHARNESS THREW — production may be left dirty, CHECK free_call_invites, ' +
    'app_settings.audience_rules and offer_claims by hand:', e);
  process.exit(1);
});
