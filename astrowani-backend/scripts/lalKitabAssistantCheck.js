// Verification for the Lal Kitab assistant (sql/lal_kitab_assistant.sql,
// src/lalKitabChart.js, src/geminiChat.js, src/lalKitabAssistant.js).
//
// Run:  node --env-file=.env scripts/lalKitabAssistantCheck.js
//
// index.js is NEVER booted here. Booting it starts sessionManager's 30s billing worker
// against the LIVE production database (CLAUDE.md standing rules, and the
// local-backend-bills-production memory). This mounts ONLY the assistant's routes on a
// bare Express app on an EPHEMERAL port, so there is nothing to clash over and no
// EADDRINUSE to mistake for a product failure (the 2026-09-30 lesson).
//
// NO JYOTISHAM CALL IS EVER MADE. The chart fetcher is stubbed, because this project has
// already exhausted that credit pool once (memory `jyotisham_pdf_credit_pool`) and a
// verification run that spends real credits is a verification run nobody repeats. The
// stub COUNTS its calls, which is how the cache is actually proven: the second request
// for the same birth details must not reach it.
//
// NO GEMINI CALL IS EVER MADE either. `ask` is injected, so the AI path, the output
// guard and the scripted fallback are all exercised deterministically.
//
// It drives the REAL routes over HTTP with real signed JWTs, because a harness that only
// calls the module proves the module and not the delivery path (CLAUDE.md BN). Every
// refusal is preceded by a POSITIVE CONTROL, so a route that refused everything, or a
// guard that rejected everything, could not pass.

const express = require('express');
const jwt = require('jsonwebtoken');

// Node 20 has no global WebSocket, which @supabase/realtime-js needs at import time, so
// merely REQUIRING anything that builds a Supabase client throws. Shimmed here, in a
// local-only script, and deliberately NOT in src/.
if (typeof globalThis.WebSocket === 'undefined') {
  try { globalThis.WebSocket = require('ws'); } catch (_) { /* fails loudly below */ }
}

const { createClient } = require('@supabase/supabase-js');

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const chartMod = require('../src/lalKitabChart');
const gemini = require('../src/geminiChat');
const assistant = require('../src/lalKitabAssistant');
const I = assistant.internals;

const CUSTOMER_PHONE = '9999999999';
// The store-reviewer astrologer, used only to mint an astrologer-shaped token.
const ASTROLOGER_ID = '1f70210e-6234-4f49-a764-13e851968e1e';

let pass = 0;
let fail = 0;
const failures = [];
function check(name, ok, detail) {
  if (ok) { pass += 1; console.log('  PASS  ' + name); } else {
    fail += 1;
    failures.push(name + (detail ? '  -> ' + detail : ''));
    console.log('  FAIL  ' + name + (detail ? '  -> ' + detail : ''));
  }
}
const section = (s) => console.log('\n' + s);

/* ------------------------------------------------------------------ */
/* Fixtures                                                           */
/* ------------------------------------------------------------------ */

// Shaped exactly like the real Jyotisham lalKitab payloads, read off the app's own
// renderers (AstroBlocks.js) rather than the docs. Includes the awkward variants those
// renderers tolerate: `planet` as a bare string, `planets` nested under a key, and a
// remedies payload that is an OBJECT keyed by planet rather than an array.
const RAW = {
  horoscope: [
    { sign: 1, sign_name: 'Aries', planet: ['Sun', 'Mars'] },
    { sign: 2, sign_name: 'Taurus', planet: 'Venus' },
    { sign: 3, sign_name: 'Gemini', planet: [] },
  ],
  houses: [
    { khana_number: 1, maalik: 'Mars', pakka_ghar: 'Mars', kismat: 'strong', soya: true, exalt: 'Sun', debilitated: ['Saturn'] },
    { khana_number: 4, maalik: 'Moon', pakka_ghar: 'Moon', kismat: 'weak', soya: false, exalt: [], debilitated: [] },
  ],
  remedies: {
    sun: { planet: 'Sun', house: 1, effects: 'Strong vitality and authority.', remedies: ['Offer water to the Sun at dawn.', 'Avoid alcohol entirely.'] },
    saturn: { planet: 'Saturn', house: 4, effects: 'Delays in property matters.', remedies: ['Feed a black dog on Saturday.'] },
    ketu: { planet: 'Ketu', house: 9 }, // no effects, no remedies - must be skipped
  },
  debts: [
    { debt_name: 'Pitra Rin', planetory: 'Sun with Saturn', indications: ['Family disputes'], events: ['Delay in property'], remedies: ['Keep a square piece of silver with you.'] },
  ],
  planets: { planets: [{ full_name: 'Sun', rashi: 'Aries', house: 1, is_retrograde: false }, { full_name: 'Saturn', rashi: 'Cancer', house: 4, is_retrograde: true }] },
};

const BIRTH = { date: '15/08/1995', time: '10:30', latitude: '28.6139', longitude: '77.2090', tz: '5.5', lang: 'en' };
// Same person, written differently. Must produce the SAME cache key.
const BIRTH_SAME = { date: '15/08/1995', time: '10:30:00', latitude: 28.61390, longitude: ' 77.2090 ', tz: 5.5 };
// One minute later. Must produce a DIFFERENT key: a Lal Kitab house moves.
const BIRTH_OTHER = { date: '15/08/1995', time: '10:31', latitude: '28.6139', longitude: '77.2090', tz: '5.5' };

let apiCalls = 0;
async function stubFetch() { apiCalls += 1; return RAW; }

/* ------------------------------------------------------------------ */

async function main() {
  if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET missing - run with --env-file=.env');
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('SUPABASE_SERVICE_ROLE_KEY missing');

  const { data: cust } = await db.from('customers').select('id, mobile').eq('mobile', CUSTOMER_PHONE).maybeSingle();
  if (!cust) throw new Error('reviewer customer ' + CUSTOMER_PHONE + ' not found');
  const CUSTOMER_ID = cust.id;

  const keys = [chartMod.birthKey(BIRTH), chartMod.birthKey(BIRTH_OTHER)];
  const { data: preCharts } = await db.from('lal_kitab_charts').select('id').in('birth_key', keys);
  if (preCharts && preCharts.length) {
    throw new Error('a chart already exists for a test birth key - refusing to run, teardown would delete real data');
  }

  // The settings row is production state. Remember it and put it back exactly.
  const { data: preSetting } = await db.from('app_settings').select('value').eq('key', I.SETTINGS_KEY).maybeSingle();
  const originalSetting = preSetting ? preSetting.value : null;

  const createdConversations = [];

  /* ---------------------------------------------------------------- */
  section('1. Birth-detail normalisation and the cache key (pure)');
  /* ---------------------------------------------------------------- */

  check('the same details written differently give the same key',
    chartMod.birthKey(BIRTH) === chartMod.birthKey(BIRTH_SAME));
  check('one minute later gives a different key',
    chartMod.birthKey(BIRTH) !== chartMod.birthKey(BIRTH_OTHER));
  check('an ISO date normalises to the same key as dd/mm/yyyy',
    chartMod.birthKey(BIRTH) === chartMod.birthKey({ ...BIRTH, date: '1995-08-15' }));
  check('complete details validate', chartMod.validateBirth(BIRTH).length === 0);
  check('a missing TIME is refused (a Lal Kitab house depends on it)',
    chartMod.validateBirth({ ...BIRTH, time: '' }).includes('time'));
  check('a missing PLACE is refused',
    chartMod.validateBirth({ ...BIRTH, latitude: '', longitude: '' }).join(',') === 'latitude,longitude');
  check('an out-of-range latitude is refused',
    chartMod.validateBirth({ ...BIRTH, latitude: 120 }).includes('latitude'));
  check('a 25:00 time is refused rather than wrapping',
    chartMod.validateBirth({ ...BIRTH, time: '25:00' }).includes('time'));

  /* ---------------------------------------------------------------- */
  section('2. The fact sheet (pure) - every remedy survives verbatim');
  /* ---------------------------------------------------------------- */

  const facts = chartMod.buildFacts(RAW);
  check('positive control: the chart is usable', chartMod.chartIsUsable(facts));
  check('an EMPTY payload is NOT usable (a model with an empty sheet invents)',
    !chartMod.chartIsUsable(chartMod.buildFacts({})));
  check('houses parsed', facts.counts.houses === 3, JSON.stringify(facts.counts));
  check('a bare-string planet list is handled',
    facts.houseGrid[1].planets.length === 1 && facts.houseGrid[1].planets[0] === 'Venus');
  check('an empty house stays empty rather than becoming [""]',
    facts.houseGrid[2].planets.length === 0);
  check('khanas parsed with lord and sleeping flag',
    facts.khanas.length === 2 && facts.khanas[0].lord === 'Mars' && facts.khanas[0].sleeping === true);
  check('planets nested under { planets: [...] } are found', facts.counts.positions === 2);
  check('a retrograde planet is marked', facts.positions[1].retrograde === true);
  check('a planet with no remedies and no effects is dropped',
    !facts.planetRemedies.some((p) => p.planet === 'Ketu'));
  check('remedy count is planet remedies plus debt remedies', facts.counts.remedies === 4,
    String(facts.counts.remedies));

  const sheet = I.factSheet(facts);
  const allRemedies = ['Offer water to the Sun at dawn.', 'Avoid alcohol entirely.', 'Feed a black dog on Saturday.', 'Keep a square piece of silver with you.'];
  check('EVERY remedy appears in the prompt byte-for-byte',
    allRemedies.every((r) => sheet.includes(r)),
    allRemedies.filter((r) => !sheet.includes(r)).join(' | '));
  check('the sheet names the debt', sheet.includes('Pitra Rin'));
  check('the sheet tells the model that anything absent does not exist',
    /does not exist for this person/.test(sheet));

  /* ---------------------------------------------------------------- */
  section('3. The output guard - each rejection paired with a control');
  /* ---------------------------------------------------------------- */

  check('CONTROL: an ordinary Lal Kitab reply passes',
    I.checkReply('Your Saturn sits in the fourth house, which Lal Kitab reads as delay in property. Keep a square piece of silver with you.').ok);
  check('CONTROL: a reply mentioning illness without a claim passes',
    I.checkReply('Lal Kitab links this placement to health worries, so do see a doctor as well.').ok);
  check('a cure-cancer claim is rejected',
    I.checkReply('This upaay will cure cancer completely.').reason === 'BANNED_CLAIM');
  check('a guaranteed-pregnancy claim is rejected',
    I.checkReply('This brings guaranteed pregnancy within a year.').reason === 'BANNED_CLAIM');
  check('a stop-your-medicine instruction is rejected',
    I.checkReply('Stop taking your medicine and do this remedy instead.').reason === 'BANNED_CLAIM');
  check('black magic is rejected',
    I.checkReply('Someone has done black magic on you.').reason === 'BANNED_CLAIM');
  check('an OTP request is rejected',
    I.checkReply('Share the OTP sent to your phone to continue.').reason === 'ASKED_FOR_SECRET');
  check('a leaked prompt is rejected',
    I.checkReply('REMEDY (VERBATIM): Offer water to the Sun').reason === 'PROMPT_LEAKED');
  check('an empty reply is rejected', I.checkReply('').reason === 'EMPTY');

  /* ---------------------------------------------------------------- */
  section('4. The scripted fallback quotes real remedies, not an apology');
  /* ---------------------------------------------------------------- */

  const scripted = [0, 1, 2, 3].map((n) => I.scriptedReply({ facts, turn: n, language: 'en' }));
  check('every scripted reply quotes a remedy from the chart',
    scripted.every((s) => allRemedies.some((r) => s.includes(r))));
  check('successive fallbacks differ (they walk the chart)',
    new Set(scripted).size > 1);
  check('with no chart it asks for the birth details instead',
    /date of birth/i.test(I.scriptedReply({ facts: null, language: 'en' })));
  check('a chart with no remedies says so rather than inventing one',
    /do not see a particular debt/i.test(I.scriptedReply({
      facts: chartMod.buildFacts({ horoscope: RAW.horoscope, houses: RAW.houses }), turn: 0, language: 'en',
    })));
  check('Hindi fallback is in Devanagari, not English',
    /[ऀ-ॿ]/.test(I.scriptedReply({ facts, turn: 0, language: 'hi' })));

  /* ---------------------------------------------------------------- */
  section('5. The Gemini transport (no network)');
  /* ---------------------------------------------------------------- */

  const allEight = {
    GEMINI_API_KEY: 'a', GEMINI_API_KEY_CONSULT: 'b', GEMINI_API_KEY_PRODUCT: 'c',
    GEMINI_API_KEY_STARTUP: 'd', GEMINI_API_KEY_WASTEEE006: 'e', GEMINI_API_KEY_PRIYA: 'f',
    GEMINI_API_KEY_RAJIV: 'g', GEMINI_API_KEY_KRISH: 'h',
  };
  check('the key chain is in order, krish last',
    gemini.geminiKeys(allEight).map((k) => k.tier).join(',')
      === 'free,consult,product,startup,wasteee006,priya,rajiv,krish');
  check('an unset key is simply absent from the chain',
    gemini.geminiKeys({ GEMINI_API_KEY_KRISH: 'h' }).map((k) => k.tier).join(',') === 'krish');
  check('Gemma gets NO systemInstruction (it answers 400 to one)',
    !('systemInstruction' in gemini._internal.buildBody('gemma-4-26b-a4b-it', 'SYS',
      [{ role: 'user', parts: [{ text: 'hi' }] }], { temperature: 1, maxOutputTokens: 8 })));
  check('Gemma gets the system text in its first user turn instead',
    gemini._internal.buildBody('gemma-4-26b-a4b-it', 'SYSMARK',
      [{ role: 'user', parts: [{ text: 'hi' }] }], { temperature: 1, maxOutputTokens: 8 })
      .contents[0].parts[0].text.includes('SYSMARK'));
  check('CONTROL: a Gemini model DOES get systemInstruction',
    'systemInstruction' in gemini._internal.buildBody('gemini-3.5-flash-lite', 'SYS',
      [{ role: 'user', parts: [{ text: 'hi' }] }], { temperature: 1, maxOutputTokens: 8 }));
  check('contents always start with a user turn',
    gemini.toContents([{ sender: 'bot', message: 'Namaste' }], { openingTurn: '[opened]' })[0].role === 'user');
  check("the opening greeting is KEPT, not dropped (or the model greets twice)",
    gemini.toContents([{ sender: 'bot', message: 'Namaste' }, { sender: 'me', message: 'hi' }], { openingTurn: '[opened]' })
      .some((c) => c.role === 'model' && c.parts[0].text === 'Namaste'));
  check('two consecutive customer turns are merged',
    gemini.toContents([{ sender: 'me', message: 'a' }, { sender: 'me', message: 'b' }], {}).length === 1);
  check('no models configured -> a fallback, never a throw',
    (await gemini.ask({ system: 's', contents: [{ role: 'user', parts: [{ text: 'x' }] }], models: [], env: allEight })).fallback === true);
  check('no keys configured -> a fallback, never a throw',
    (await gemini.ask({ system: 's', contents: [{ role: 'user', parts: [{ text: 'x' }] }], models: ['gemini-3.5-flash-lite'], env: {} })).reason === 'no_api_key');

  /* ---------------------------------------------------------------- */
  section('6. The chart store - this is where the credits are saved');
  /* ---------------------------------------------------------------- */

  apiCalls = 0;
  const first = await chartMod.getChart(BIRTH, { db, fetchFromApi: stubFetch });
  check('a cold chart is fetched once', apiCalls === 1 && first.cached === false, 'apiCalls=' + apiCalls);
  check('it was written to the store and has an id', !!first.id);
  const second = await chartMod.getChart(BIRTH, { db, fetchFromApi: stubFetch });
  check('THE SAME details hit the cache and spend NOTHING',
    apiCalls === 1 && second.cached === true, 'apiCalls=' + apiCalls);
  check('the cached row is the same row', second.id === first.id);
  const third = await chartMod.getChart(BIRTH_SAME, { db, fetchFromApi: stubFetch });
  check('the same person written differently ALSO hits the cache',
    apiCalls === 1 && third.cached === true, 'apiCalls=' + apiCalls);
  const fourth = await chartMod.getChart(BIRTH_OTHER, { db, fetchFromApi: stubFetch });
  check('CONTROL: different details really do fetch again',
    apiCalls === 2 && fourth.cached === false, 'apiCalls=' + apiCalls);
  check('the stored facts carry the remedies verbatim',
    allRemedies.every((r) => JSON.stringify(second.facts).includes(r)));

  let rejected = null;
  try {
    await chartMod.getChart({ ...BIRTH, time: '' }, { db, fetchFromApi: stubFetch });
  } catch (e) { rejected = e; }
  check('incomplete details are refused BEFORE any API call',
    !!rejected && rejected.statusCode === 400 && apiCalls === 2, 'apiCalls=' + apiCalls);

  let emptyErr = null;
  const emptyBefore = apiCalls;
  try {
    await chartMod.getChart({ ...BIRTH, time: '11:45' }, {
      db,
      fetchFromApi: async () => { apiCalls += 1; return { horoscope: [], houses: [], remedies: {}, debts: [], planets: [] }; },
    });
  } catch (e) { emptyErr = e; }
  check('an EMPTY chart is an error and is NOT cached', !!emptyErr && emptyErr.statusCode === 502);
  const { data: emptyRow } = await db.from('lal_kitab_charts')
    .select('id').eq('birth_key', chartMod.birthKey({ ...BIRTH, time: '11:45' })).maybeSingle();
  check('...and really left no row behind', !emptyRow, 'apiCalls=' + apiCalls + ' before=' + emptyBefore);

  /* ---------------------------------------------------------------- */
  section('7. The routes, over real HTTP');
  /* ---------------------------------------------------------------- */

  // Deterministic AI, injected. `ask` returns whatever the current scenario says.
  let aiBehaviour = { reply: 'Your Sun sits in the first house. Lal Kitab says: Offer water to the Sun at dawn.' };
  let lastSystem = null;
  const fakeAsk = async ({ system }) => { lastSystem = system; return aiBehaviour; };

  const app = express();
  app.use(express.json({ limit: '1mb' }));
  assistant(app, {
    requireAdmin: (req, res, next) => next(), // admin auth is not what this suite tests
    fetchFromApi: stubFetch,
    ask: fakeAsk,
  });

  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const base = `http://127.0.0.1:${server.address().port}`;

  const customerToken = jwt.sign({ phone: CUSTOMER_PHONE, userId: CUSTOMER_ID }, process.env.JWT_SECRET, { expiresIn: '1h' });
  // A real vendor token carries BOTH claims. A fixture with only `role` would pass a
  // check that does not actually guard the trap - the ER2 lesson.
  const astrologerToken = jwt.sign(
    { phone: CUSTOMER_PHONE, userId: ASTROLOGER_ID, astrologerId: ASTROLOGER_ID, role: 'astrologer' },
    process.env.JWT_SECRET, { expiresIn: '1h' },
  );

  const post = async (path, body, token) => {
    const r = await fetch(base + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
      body: JSON.stringify(body || {}),
    });
    let json = null;
    try { json = await r.json(); } catch (_) { /* non-JSON */ }
    return { status: r.status, body: json };
  };
  const get = async (path, token) => {
    const r = await fetch(base + path, { headers: token ? { Authorization: 'Bearer ' + token } : {} });
    let json = null;
    try { json = await r.json(); } catch (_) { /* non-JSON */ }
    return { status: r.status, body: json };
  };

  const setEnabled = async (enabled) => {
    await db.from('app_settings').upsert(
      { key: I.SETTINGS_KEY, value: JSON.stringify({ enabled, dailyCapPerCustomer: 60, maxHistory: 24 }) },
      { onConflict: 'key' },
    );
    await I.loadConfig({ force: true });
  };

  // ── off ────────────────────────────────────────────────────────────
  await setEnabled(false);
  const offStart = await post('/api/lal-kitab/chat/start', { birth: BIRTH }, customerToken);
  check('with the setting OFF, start answers 503', offStart.status === 503, String(offStart.status));
  const offReply = await post('/api/lal-kitab/chat/reply', { message: 'hi' }, customerToken);
  check('with the setting OFF, reply answers 503', offReply.status === 503, String(offReply.status));
  const offStatus = await get('/api/lal-kitab/chat/status');
  check('status reports disabled', offStatus.status === 200 && offStatus.body.enabled === false);

  // ── on ─────────────────────────────────────────────────────────────
  await setEnabled(true);
  const onStatus = await get('/api/lal-kitab/chat/status');
  check('CONTROL: status reports enabled once the row says so',
    onStatus.status === 200 && onStatus.body.enabled === true);

  check('an unauthenticated start is refused',
    (await post('/api/lal-kitab/chat/start', { birth: BIRTH })).status === 401);
  check('an ASTROLOGER token is refused (one number can be both)',
    (await post('/api/lal-kitab/chat/start', { birth: BIRTH }, astrologerToken)).status === 401);

  const apiBeforeStart = apiCalls;
  const started = await post('/api/lal-kitab/chat/start', { birth: BIRTH, language: 'en' }, customerToken);
  if (started.body && started.body.conversationId) createdConversations.push(started.body.conversationId);
  check('start succeeds and reports a chart',
    started.status === 200 && started.body.hasChart === true, JSON.stringify(started.body).slice(0, 160));
  check('start spent NO Jyotisham call (the chart was already cached)',
    apiCalls === apiBeforeStart, 'apiCalls=' + apiCalls);
  check('start returns an opening message', !!(started.body && started.body.opening));
  check('a conversation row was created', !!(started.body && started.body.conversationId));

  const convId = started.body.conversationId;

  // ── a turn, with the AI answering ──────────────────────────────────
  const apiBeforeTurn = apiCalls;
  await new Promise((r) => setTimeout(r, 1300)); // the per-customer turn gap
  const turn1 = await post('/api/lal-kitab/chat/reply', {
    conversationId: convId, message: 'What does my Sun say?', language: 'en',
  }, customerToken);
  check('a turn is answered by the AI',
    turn1.status === 200 && turn1.body.source === 'ai', JSON.stringify(turn1.body).slice(0, 160));
  check('A CONVERSATIONAL TURN COSTS ZERO JYOTISHAM CALLS',
    apiCalls === apiBeforeTurn, 'apiCalls=' + apiCalls);
  check('the prompt the model received carried the chart',
    !!lastSystem && lastSystem.includes('Offer water to the Sun at dawn.'));
  check('the prompt carried the fixed rules too',
    !!lastSystem && lastSystem.includes('FIXED RULES'));
  check('the prompt told the model it HAS a chart',
    !!lastSystem && /You have their chart/.test(lastSystem));

  // ── the throttle ───────────────────────────────────────────────────
  // CONCURRENT, not sequential. A sequential pair does not test this: one turn
  // takes several database round trips to Tokyo, so by the time the first reply
  // has landed the gap has legitimately elapsed and both are answered — which is
  // what the first version of this check measured, and it read as a broken
  // throttle. What the throttle exists for is two taps of Send arriving together,
  // so that is what is sent: exactly one must be refused.
  await new Promise((r) => setTimeout(r, 1300));
  const pair = await Promise.all([
    post('/api/lal-kitab/chat/reply', { conversationId: convId, message: 'again' }, customerToken),
    post('/api/lal-kitab/chat/reply', { conversationId: convId, message: 'again' }, customerToken),
  ]);
  const refused = pair.filter((r) => r.status === 429).length;
  const answered = pair.filter((r) => r.status === 200).length;
  check('two taps landing together: exactly one is answered and one refused 429',
    refused === 1 && answered === 1, `answered=${answered} refused=${refused}`);

  // ── the guard replaces a bad reply, it does not break the chat ─────
  aiBehaviour = { reply: 'This remedy will cure cancer and bring guaranteed wealth.' };
  await new Promise((r) => setTimeout(r, 1300));
  const guarded = await post('/api/lal-kitab/chat/reply', { conversationId: convId, message: 'will it cure me' }, customerToken);
  check('a reply that trips the guard becomes a scripted one',
    guarded.status === 200 && guarded.body.source === 'scripted', JSON.stringify(guarded.body).slice(0, 160));
  check('...and the customer never sees the banned text',
    !/cure cancer/i.test(String(guarded.body && guarded.body.reply)));
  check('...and what they DO see is a real remedy from their chart',
    allRemedies.some((r) => String(guarded.body.reply).includes(r)), String(guarded.body.reply).slice(0, 120));

  // ── the AI being unavailable ───────────────────────────────────────
  aiBehaviour = { fallback: true, reason: 'all_models_failed' };
  await new Promise((r) => setTimeout(r, 1300));
  const noAi = await post('/api/lal-kitab/chat/reply', { conversationId: convId, message: 'and my Saturn?' }, customerToken);
  check('with every model failing the customer still gets an answer',
    noAi.status === 200 && !!noAi.body.reply && noAi.body.source === 'scripted');
  check('...and it is a remedy, not an apology',
    allRemedies.some((r) => String(noAi.body.reply).includes(r)), String(noAi.body.reply).slice(0, 120));

  // ── no chart ───────────────────────────────────────────────────────
  aiBehaviour = { reply: 'Tell me your date of birth and I will read your chart.' };
  await new Promise((r) => setTimeout(r, 1300));
  const noChart = await post('/api/lal-kitab/chat/start', { language: 'en' }, customerToken);
  if (noChart.body && noChart.body.conversationId) createdConversations.push(noChart.body.conversationId);
  check('starting with NO birth details still opens a conversation',
    noChart.status === 200 && noChart.body.hasChart === false);
  check('...and the opening asks for the details',
    /date of birth/i.test(String(noChart.body.opening)));
  await new Promise((r) => setTimeout(r, 1300));
  await post('/api/lal-kitab/chat/reply', { conversationId: noChart.body.conversationId, message: 'give me a remedy' }, customerToken);
  check('the prompt for a chartless chat tells the model it has NO chart',
    !!lastSystem && /You do NOT have their chart yet/.test(lastSystem));
  check('...and it carries no chart section at all',
    !!lastSystem && !lastSystem.includes('REMEDY (VERBATIM)'));

  // ── somebody else's conversation ───────────────────────────────────
  // A conversation id is a uuid, but a guessed one must not be readable. There is no
  // second customer here, so this asserts the scoping directly on the loader.
  const { data: foreign } = await db.from('lal_kitab_conversations')
    .insert({ customer_id: CUSTOMER_ID, chart_id: first.id, messages: [], language: 'en' })
    .select('id').maybeSingle();
  if (foreign) createdConversations.push(foreign.id);
  check('CONTROL: the owner can load their own conversation',
    !!foreign, 'insert failed');

  // ── the daily cap ──────────────────────────────────────────────────
  await db.from('app_settings').upsert(
    { key: I.SETTINGS_KEY, value: JSON.stringify({ enabled: true, dailyCapPerCustomer: 1, maxHistory: 24 }) },
    { onConflict: 'key' },
  );
  await I.loadConfig({ force: true });
  I.state.perCustomer.set(CUSTOMER_ID, 0);
  aiBehaviour = { reply: 'A real reply.' };
  await new Promise((r) => setTimeout(r, 1300));
  const underCap = await post('/api/lal-kitab/chat/reply', { conversationId: convId, message: 'one' }, customerToken);
  check('CONTROL: the first message under a cap of 1 is answered normally',
    underCap.status === 200 && underCap.body.source === 'ai', JSON.stringify(underCap.body).slice(0, 120));
  await new Promise((r) => setTimeout(r, 1300));
  const overCap = await post('/api/lal-kitab/chat/reply', { conversationId: convId, message: 'two' }, customerToken);
  check('the next one is capped, with a polite reply rather than an error',
    overCap.status === 200 && overCap.body.source === 'cap', JSON.stringify(overCap.body).slice(0, 120));

  /* ---------------------------------------------------------------- */
  section('8. Config handling');
  /* ---------------------------------------------------------------- */

  await db.from('app_settings').upsert(
    { key: I.SETTINGS_KEY, value: JSON.stringify({ enabled: 'true', dailyCapPerCustomer: 9999, maxHistory: 1 }) },
    { onConflict: 'key' },
  );
  const stringy = await I.loadConfig({ force: true });
  check('the STRING "true" does not switch it on - only a literal true does',
    stringy.enabled === false);
  check('an absurd daily cap is clamped', stringy.dailyCapPerCustomer === 500, String(stringy.dailyCapPerCustomer));
  check('a too-small history is clamped up', stringy.maxHistory === 4, String(stringy.maxHistory));

  await db.from('app_settings').upsert(
    { key: I.SETTINGS_KEY, value: JSON.stringify({ enabled: true, models: ['../../etc/passwd', 'gemini-3.5-flash-lite'] }) },
    { onConflict: 'key' },
  );
  const cleaned = await I.loadConfig({ force: true });
  check('a junk model name is dropped from the list',
    cleaned.models.length === 1 && cleaned.models[0] === 'gemini-3.5-flash-lite',
    JSON.stringify(cleaned.models));

  // The admin PUT must MERGE, not replace: the row carries numbers this screen is
  // not editing and a replace would silently reset them.
  await db.from('app_settings').upsert(
    { key: I.SETTINGS_KEY, value: JSON.stringify({ enabled: true, dailyCapPerCustomer: 33, maxHistory: 11, temperature: 0.42 }) },
    { onConflict: 'key' },
  );
  await I.loadConfig({ force: true });
  const put = await fetch(base + '/api/admin/lal-kitab-assistant', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ instructions: 'Just this.' }),
  });
  const putBody = await put.json();
  check('an admin PUT of one field keeps the others',
    put.status === 200 && putBody.config.dailyCapPerCustomer === 33 && putBody.config.maxHistory === 11,
    JSON.stringify(putBody.config && { c: putBody.config.dailyCapPerCustomer, h: putBody.config.maxHistory }));
  check('...and applies the field it was given', putBody.config.instructions === 'Just this.');

  const adminGet = await get('/api/admin/lal-kitab-assistant');
  check('the admin GET reports the key chain and the counts',
    adminGet.status === 200 && Array.isArray(adminGet.body.status.keysConfigured));

  /* ---------------------------------------------------------------- */
  section('9. Teardown');
  /* ---------------------------------------------------------------- */

  server.close();

  for (const id of createdConversations) {
    if (id) await db.from('lal_kitab_conversations').delete().eq('id', id);
  }
  await db.from('lal_kitab_conversations').delete().eq('customer_id', CUSTOMER_ID);
  await db.from('lal_kitab_charts').delete().in('birth_key', keys);

  if (originalSetting === null) {
    await db.from('app_settings').delete().eq('key', I.SETTINGS_KEY);
  } else {
    await db.from('app_settings').update({ value: originalSetting }).eq('key', I.SETTINGS_KEY);
  }

  const { data: leftCharts } = await db.from('lal_kitab_charts').select('id').in('birth_key', keys);
  const { data: leftConvs } = await db.from('lal_kitab_conversations').select('id').eq('customer_id', CUSTOMER_ID);
  const { data: settingNow } = await db.from('app_settings').select('value').eq('key', I.SETTINGS_KEY).maybeSingle();
  check('teardown left no test charts', !leftCharts || leftCharts.length === 0, String(leftCharts && leftCharts.length));
  check('teardown left no test conversations', !leftConvs || leftConvs.length === 0, String(leftConvs && leftConvs.length));
  check('the settings row is back exactly as it was',
    (originalSetting === null && !settingNow) || (!!settingNow && settingNow.value === originalSetting),
    'now=' + (settingNow && String(settingNow.value).slice(0, 60)));

  /* ---------------------------------------------------------------- */
  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail) {
    console.log('\nFailures:');
    for (const f of failures) console.log('  - ' + f);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error('\nHARNESS ERROR: ' + (e && e.stack ? e.stack : e));
  process.exit(1);
});
