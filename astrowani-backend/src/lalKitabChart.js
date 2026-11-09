/**
 * lalKitabChart.js — the chart half of the Lal Kitab assistant.
 *
 * Fetches a Lal Kitab chart from JyotishamAstroAPI ONCE per distinct set of birth
 * details, caches it in public.lal_kitab_charts, and flattens it into the fact
 * sheet the model is grounded on.
 *
 * WHY THE CACHE IS NOT OPTIONAL. src/astroRoutes.js's 'lal-kitab' report already
 * calls the same five endpoints and stores nothing, which is right for a report
 * bought once. A conversation is different: without a store, every single turn
 * would spend five more Jyotisham calls, against a credit pool that has already
 * been exhausted once (memory `jyotisham_pdf_credit_pool`). Five calls per chart,
 * once; zero per turn.
 *
 * NO I/O IN THE FLATTENER, deliberately. buildFacts() is pure, so the shape
 * handling — which is where every bug in this file will be — is unit-testable
 * without the API, without the database and without spending a credit.
 *
 * THE RESPONSE SHAPES, read off the app's own renderers
 * (astrowani_customer-main/src/components/astro/AstroBlocks.js) rather than from
 * the API docs, because those renderers are what has actually been working:
 *
 *   horoscope [{ sign, sign_name, planet, planet_small }]        — LalKitabHoroscope
 *   houses    [{ khana_number, maalik, pakka_ghar, kismat,
 *                soya, exalt, debilitated }]                     — LalKitabHouses
 *   remedies  { <planet>: { planet, house, effects, remedies } }  — LalKitabRemedies
 *   debts     [{ debt_name, planetory, indications,
 *                events, remedies }]                             — LalKitabDebts
 *   planets   [{ full_name|name|planet, rashi|zodiac|sign, ... }] — PlanetTable
 *
 * `planet` and every list field may arrive as a bare string instead of an array
 * (hence asList), and `planets` may arrive as an array, as { planets: [...] }, or
 * as an object keyed '0','1','2' (hence extractPlanets, copied from the app).
 */

const crypto = require('crypto');
const { callJyotisham } = require('./jyotishamClient');

const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const isBlank = (v) => v === null || v === undefined || String(v).trim() === '';
const asList = (v) => (Array.isArray(v) ? v.filter((x) => !isBlank(x)) : isBlank(v) ? [] : [v]);
const text = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();

/** Same three shapes the app tolerates for the planets payload. */
function extractPlanets(data) {
  if (Array.isArray(data)) return data.filter(isObj);
  if (!isObj(data)) return [];
  if (Array.isArray(data.planets)) return data.planets.filter(isObj);
  return Object.keys(data)
    .filter((k) => /^\d+$/.test(k) && isObj(data[k]))
    .sort((a, b) => Number(a) - Number(b))
    .map((k) => data[k]);
}

/**
 * The cache key: a sha256 of the birth details, normalised first.
 *
 * NORMALISATION IS THE WHOLE POINT. '28.6139' and '28.61390' are the same place
 * and must be the same key, or the cache misses and five credits are spent on a
 * chart already sitting in the table. Latitude/longitude are rounded to four
 * decimals (~11 m, far finer than any birth record) and time to the minute, which
 * is also the resolution Jyotisham itself works at.
 *
 * It is a HASH rather than the details themselves so the table holds no personal
 * data and therefore carries no account-deletion obligation — see
 * sql/lal_kitab_assistant.sql.
 */
function birthKey(input) {
  const n = normaliseBirth(input);
  const parts = [n.date, n.time, n.latitude, n.longitude, n.tz, n.lang].join('|');
  return crypto.createHash('sha256').update(parts).digest('hex');
}

function round4(v) {
  // BLANK IS NOT ZERO, and this guard is the whole reason the function is not a
  // one-liner. Number('') and Number(null) are both 0, which is a finite,
  // perfectly valid latitude — so without this, a customer who never picked a
  // birthplace is silently given 0°N 0°E, a point in the Atlantic, and gets a
  // chart that is confidently wrong rather than an honest refusal. Caught by
  // scripts/lalKitabAssistantCheck.js ("a missing PLACE is refused").
  if (v === null || v === undefined || String(v).trim() === '') return '';
  const num = Number(v);
  if (!Number.isFinite(num)) return '';
  // toFixed then strip trailing zeros: '28.6139' and '28.61390' must agree, and
  // so must 28.6139 and '28.6139 '.
  return String(Number(num.toFixed(4)));
}

/** HH:MM, minute resolution. Accepts 'HH:MM', 'HH:MM:SS' and 'H:M'. */
function normaliseTime(v) {
  const m = String(v ?? '').trim().match(/^(\d{1,2}):(\d{1,2})/);
  if (!m) return '';
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!(h >= 0 && h <= 23) || !(min >= 0 && min <= 59)) return '';
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

/** dd/mm/yyyy, which is what this API takes (see jyotishamClient's header). */
function normaliseDate(v) {
  const s = String(v ?? '').trim();
  let d;
  let mo;
  let y;
  let m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (m) { [, d, mo, y] = m; } else {
    m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/); // ISO, in case a caller sends it
    if (!m) return '';
    [, y, mo, d] = m;
  }
  d = Number(d); mo = Number(mo); y = Number(y);
  if (!(d >= 1 && d <= 31) || !(mo >= 1 && mo <= 12) || !(y >= 1900 && y <= 2100)) return '';
  return `${String(d).padStart(2, '0')}/${String(mo).padStart(2, '0')}/${y}`;
}

function normaliseBirth(input) {
  const b = input || {};
  return {
    date: normaliseDate(b.date),
    time: normaliseTime(b.time),
    latitude: round4(b.latitude),
    longitude: round4(b.longitude),
    tz: round4(b.tz ?? '5.5') || '5.5',
    lang: b.lang === 'hi' ? 'hi' : 'en',
  };
}

/**
 * Are these details usable? Returns a list of what is wrong, empty when fine.
 *
 * A Lal Kitab remedy is chosen by which HOUSE a planet sits in, and the house
 * cusps move about a degree every four minutes — so the time and the birthplace
 * are not optional extras here the way they are for a sun-sign reading. Missing
 * either produces a chart that is confidently wrong rather than obviously wrong,
 * which is why this refuses instead of defaulting to noon.
 */
function validateBirth(input) {
  const n = normaliseBirth(input);
  const bad = [];
  if (!n.date) bad.push('date');
  if (!n.time) bad.push('time');
  if (n.latitude === '' || Math.abs(Number(n.latitude)) > 90) bad.push('latitude');
  if (n.longitude === '' || Math.abs(Number(n.longitude)) > 180) bad.push('longitude');
  return bad;
}

/* ------------------------------------------------------------------ */
/* The fact sheet                                                     */
/* ------------------------------------------------------------------ */

/**
 * Flatten the five blobs into the digest the model is given.
 *
 * Every remedy string is carried through VERBATIM and never rewritten,
 * summarised or re-ordered. That is the owner's requirement for this feature and
 * it is also the only thing that makes the output trustworthy: the model's job is
 * to decide WHICH of these to raise and to explain it warmly, never to compose a
 * remedy. The prompt in lalKitabAssistant.js forbids inventing one, and this
 * function is what gives it something real to quote.
 *
 * Pure. No network, no database, no clock.
 */
function buildFacts(raw) {
  const r = raw || {};

  // ── Planets by house, from the chart grid. ──────────────────────────────────
  // LalKitabHoroscope's cells are SIGNS carrying planets, and `sign` is the house
  // number in this payload (the renderer falls back to the index + 1 for it).
  const houseGrid = [];
  for (const [i, h] of (Array.isArray(r.horoscope) ? r.horoscope : []).entries()) {
    if (!isObj(h)) continue;
    const planets = asList(h.planet).map(text).filter(Boolean);
    houseGrid.push({
      house: Number(h.sign ?? i + 1) || i + 1,
      sign: text(h.sign_name),
      planets,
    });
  }

  // ── The khanas: lord, pakka ghar, exalted and debilitated. ──────────────────
  const khanas = [];
  for (const [i, h] of (Array.isArray(r.houses) ? r.houses : []).entries()) {
    if (!isObj(h)) continue;
    khanas.push({
      house: Number(h.khana_number ?? i + 1) || i + 1,
      lord: text(h.maalik),
      pakkaGhar: text(h.pakka_ghar),
      kismat: text(h.kismat),
      sleeping: h.soya === true,
      exalted: asList(h.exalt).map(text).filter(Boolean),
      debilitated: asList(h.debilitated).map(text).filter(Boolean),
    });
  }

  // ── Per-planet effects and remedies. THE PAYLOAD IS AN OBJECT, not an array. ─
  const planetRemedies = [];
  if (isObj(r.remedies)) {
    for (const [key, v] of Object.entries(r.remedies)) {
      if (!isObj(v)) continue;
      const remedies = asList(v.remedies).map(text).filter(Boolean);
      const effects = text(v.effects);
      if (!remedies.length && !effects) continue;
      planetRemedies.push({
        planet: text(v.planet) || text(key),
        house: Number(v.house) || null,
        effects,
        remedies, // verbatim
      });
    }
  }

  // ── Karmic debts. ──────────────────────────────────────────────────────────
  const debts = [];
  for (const d of (Array.isArray(r.debts) ? r.debts : [])) {
    if (!isObj(d)) continue;
    debts.push({
      name: text(d.debt_name),
      summary: text(d.planetory),
      indications: asList(d.indications).map(text).filter(Boolean),
      events: asList(d.events).map(text).filter(Boolean),
      remedies: asList(d.remedies).map(text).filter(Boolean), // verbatim
    });
  }

  // ── Planet positions, for "where is my Saturn" style questions. ────────────
  const positions = [];
  for (const p of extractPlanets(r.planets)) {
    const name = text(p.full_name || p.name || p.planet);
    if (!name) continue;
    positions.push({
      planet: name,
      sign: text(p.rashi || p.zodiac || p.sign),
      house: Number(p.house) || null,
      retrograde: p.is_retrograde === true || p.retro === true,
      combust: p.is_combust === true,
    });
  }

  const remedyCount =
    planetRemedies.reduce((n, p) => n + p.remedies.length, 0) +
    debts.reduce((n, d) => n + d.remedies.length, 0);

  return {
    houseGrid,
    khanas,
    planetRemedies,
    debts,
    positions,
    counts: {
      houses: houseGrid.length,
      khanas: khanas.length,
      planetsWithRemedies: planetRemedies.length,
      debts: debts.length,
      remedies: remedyCount,
      positions: positions.length,
    },
  };
}

/**
 * Is this chart worth talking about?
 *
 * A chart that fetched "successfully" but carries no remedies and no placements
 * cannot ground a single sentence, and a model handed an empty fact sheet will
 * cheerfully invent one. So an empty chart is a hard failure, not a thin one.
 */
function chartIsUsable(facts) {
  const c = (facts && facts.counts) || {};
  return (c.remedies || 0) > 0 || ((c.houses || 0) > 0 && (c.planetsWithRemedies || 0) > 0);
}

/* ------------------------------------------------------------------ */
/* Fetch + cache                                                      */
/* ------------------------------------------------------------------ */

/** The five calls, exactly as src/astroRoutes.js's 'lal-kitab' report makes them. */
async function fetchFromApi(birth) {
  const q = {
    date: birth.date,
    time: birth.time,
    latitude: birth.latitude,
    longitude: birth.longitude,
    tz: birth.tz,
    lang: birth.lang,
  };
  const [horoscope, debts, remedies, houses, planets] = await Promise.all([
    callJyotisham('/api/lalKitab/horoscope', q),
    callJyotisham('/api/lalKitab/debts', q),
    callJyotisham('/api/lalKitab/remedies', q),
    callJyotisham('/api/lalKitab/houses', q),
    callJyotisham('/api/lalKitab/planets', q),
  ]);
  return {
    horoscope: horoscope.data,
    debts: debts.data,
    remedies: remedies.data,
    houses: houses.data,
    planets: planets.data,
  };
}

/**
 * The chart for these birth details: from the cache, or fetched and cached.
 *
 * `deps` is injected rather than required at the top so the verification harness
 * can run the whole path with a stub API and spend nothing. Production passes the
 * real service-role client and the real fetcher.
 */
async function getChart(birthInput, deps = {}) {
  const db = deps.db;
  const fetcher = deps.fetchFromApi || fetchFromApi;
  const log = deps.log || (() => {});

  const bad = validateBirth(birthInput);
  if (bad.length) {
    throw Object.assign(new Error(`Birth details are incomplete: ${bad.join(', ')}`), {
      statusCode: 400,
      missing: bad,
    });
  }
  const birth = normaliseBirth(birthInput);
  const key = birthKey(birth);

  // ── Cache read. A failure here must never fail the request: the worst case is
  // a fetch we could have avoided, which is a credit, not an outage.
  if (db) {
    try {
      const { data, error } = await db
        .from('lal_kitab_charts')
        .select('id, facts, horoscope, debts, remedies, houses, planets, use_count')
        .eq('birth_key', key)
        .maybeSingle();
      if (!error && data && chartIsUsable(data.facts)) {
        // Best-effort touch, not awaited for correctness — it only feeds pruning.
        db.from('lal_kitab_charts')
          .update({ last_used_at: new Date().toISOString(), use_count: (data.use_count || 0) + 1 })
          .eq('id', data.id)
          .then(() => {}, () => {});
        log('[lalKitabChart] cache hit');
        return { id: data.id, facts: data.facts, cached: true, birthKey: key, lang: birth.lang };
      }
    } catch (e) {
      log('[lalKitabChart] cache read failed: ' + (e && e.message));
    }
  }

  const startedAt = Date.now();
  const raw = await fetcher(birth);
  const fetchMs = Date.now() - startedAt;
  const facts = buildFacts(raw);

  if (!chartIsUsable(facts)) {
    // NOT cached. Caching an unusable chart would make the emptiness permanent
    // for that birth date — and an empty fact sheet is exactly what makes a
    // model start inventing remedies.
    throw Object.assign(new Error('Lal Kitab returned nothing usable for these details'), {
      statusCode: 502,
      counts: facts.counts,
    });
  }

  let id = null;
  if (db) {
    try {
      // upsert on birth_key, so two customers asking at the same moment cannot
      // violate the UNIQUE — whichever lands second simply updates.
      const { data, error } = await db
        .from('lal_kitab_charts')
        .upsert(
          {
            birth_key: key,
            lang: birth.lang,
            horoscope: raw.horoscope ?? null,
            debts: raw.debts ?? null,
            remedies: raw.remedies ?? null,
            houses: raw.houses ?? null,
            planets: raw.planets ?? null,
            facts,
            fetch_ms: fetchMs,
            last_used_at: new Date().toISOString(),
          },
          { onConflict: 'birth_key' },
        )
        .select('id')
        .maybeSingle();
      if (error) log('[lalKitabChart] cache write failed: ' + error.message);
      else if (data) id = data.id;
    } catch (e) {
      log('[lalKitabChart] cache write threw: ' + (e && e.message));
    }
  }

  log(`[lalKitabChart] fetched in ${fetchMs}ms — ${facts.counts.remedies} remedies, ${facts.counts.debts} debts`);
  return { id, facts, cached: false, birthKey: key, lang: birth.lang, fetchMs };
}

module.exports = {
  getChart,
  buildFacts,
  birthKey,
  normaliseBirth,
  validateBirth,
  chartIsUsable,
  fetchFromApi,
  // exported for the harness
  _internal: { extractPlanets, asList, normaliseDate, normaliseTime, round4 },
};
