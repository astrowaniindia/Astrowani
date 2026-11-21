/**
 * BIRD EYE — FREE CALL. The free intro call on one screen, the same way
 * src/birdEyeRoutes.js puts the whole platform on one.
 *
 * WHAT IT ANSWERS: "is the free call working RIGHT NOW, and is today going better or
 * worse than yesterday". The deep, date-ranged page for this offer already exists
 * (src/freeCallAnalyticsRoutes.js → the Free Instant Call Offer page) and is where you go
 * to understand WHY. This screen is the one left open to notice THAT something changed.
 *
 * Same rules as the platform Bird Eye, deliberately, so the two screens read alike:
 *   - THREE ENDPOINTS polled at different rates (pulse 10s, today 30s, trends 2min).
 *     Never merge them: a slow aggregate must not stall the live band.
 *   - EVERY DAY IS AN INDIAN DAY (istMidnight/istHour from birdEyeRoutes.js).
 *   - PACE, NOT TOTALS: today is compared against the SAME ELAPSED SLICE of yesterday.
 *   - Excluded customers (src/analyticsExclusions.js) are dropped everywhere.
 *
 * SOURCES. Everything here is the DATABASE — no PostHog. Instant calls come from
 * free_call_attempts (one row per ring, see src/freeCallAttempts.js); scheduled calls
 * come from free_call_bookings (kind = 'scheduled'), which have no per-ring log.
 *
 * NOT filtered by app_settings.free_call_instant_since. That launch floor exists to hide
 * pre-launch test rings from a date-ranged report; this screen only ever looks at today
 * and yesterday, which are long after launch.
 */

const { requireAdmin } = require('./adminRoutes');
const { createClient } = require('@supabase/supabase-js');
const { pagedSelect, chunkIds } = require('./pagedSelect');
const { withoutExcluded } = require('./analyticsExclusions');
const { istMidnight, istHour, istDay, currentIstHour } = require('./birdEyeRoutes');
const freeCallAttempts = require('./freeCallAttempts');
const { isUuid } = require('./pgrstFilter');

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const hourLabel = (h) => `${String(h).padStart(2, '0')}:00`;

const h = (fn) => (req, res) => fn(req, res).catch((err) => {
  console.error('[birdEyeFreeCall]', err?.response?.data || err.message);
  return res.status(502).json({ success: false, message: 'Free call Bird Eye query failed.' });
});

/**
 * The live offer config, never fatal. loadOffer() lives in freeCallRoutes.js, which is
 * already loaded by index.js before this module, so the require is a cache hit. If it
 * throws (bad JSON in app_settings, DB blip) the screen still renders — offer reads as
 * unknown rather than taking the band down.
 */
async function safeOffer() {
  try {
    // Required lazily: freeCallRoutes pulls in half the backend, and a require-time cycle
    // here would be far harder to diagnose than a deferred lookup.
    // eslint-disable-next-line global-require
    const { loadOffer } = require('./freeCallRoutes');
    return await loadOffer();
  } catch (err) {
    console.warn('[birdEyeFreeCall] loadOffer failed:', err?.message || err);
    return null;
  }
}

/** First paid milestone, in seconds — where "worth paying for" starts. Defaults to 4 min. */
const payoutSecondsOf = (offer) => {
  const m = Array.isArray(offer?.payoutMilestones) ? offer.payoutMilestones[0] : null;
  const mins = Number(m?.minutes);
  return (Number.isFinite(mins) && mins > 0 ? mins : 4) * 60;
};

/**
 * Talk-time buckets, built from the LIVE offer rather than hardcoded. The free call has
 * changed length twice (12 → 11 → 7 min) and the payout mark once; a fixed histogram
 * would quietly start lying the next time either moves.
 */
function talkBuckets(offer) {
  const payoutAt = payoutSecondsOf(offer);
  const fullAt = Math.max(payoutAt + 60, (Number(offer?.durationMinutes) || 7) * 60 - 30);
  const m = (s) => `${Math.round(s / 6) / 10}`.replace(/\.0$/, '');
  return [
    { key: 'lt90', label: '< 90s', min: 0, max: 89 },
    { key: 'pre', label: `1.5–${m(payoutAt)}m`, min: 90, max: payoutAt - 1 },
    { key: 'paid', label: `${m(payoutAt)}m+`, min: payoutAt, max: fullAt - 1 },
    { key: 'full', label: 'Full call', min: fullAt, max: Infinity },
  ];
}

const hasDuration = (r) => r && r.duration_seconds !== null && r.duration_seconds !== undefined
  && Number.isFinite(Number(r.duration_seconds));

const OUTCOMES = ['completed', 'too_short', 'abandoned_by_astrologer', 'interrupted', 'missed', 'rejected', 'cancelled'];

module.exports = function registerBirdEyeFreeCallRoutes(app) {
  // ───────────────────────────────────────────────────────────────────────────
  // 1. RIGHT NOW — every 10s. The offer switch, the pool, what is ringing and live.
  // ───────────────────────────────────────────────────────────────────────────
  app.get('/api/admin/bird-eye/free-call/pulse', requireAdmin, h(async (req, res) => {
    const offer = await safeOffer();
    const ringTtl = ((Number(offer?.ringTimeoutSeconds) || 45) + 30) * 1000;
    const ringingSince = new Date(Date.now() - ringTtl).toISOString();
    // isUuid: these ids land in an .in() filter (see src/pgrstFilter.js for why that matters).
    const pool = (Array.isArray(offer?.effectiveInstantPool) ? offer.effectiveInstantPool : []).filter(isUuid);
    const nowIso = new Date().toISOString();
    const inAnHour = new Date(Date.now() + 60 * 60 * 1000).toISOString();

    const [poolRes, liveRes, ringRes, upcomingRes] = await Promise.all([
      pool.length
        ? db.from('astrologers')
          .select('id, is_online, approval_status, is_suspended, is_call_enabled')
          .in('id', pool.slice(0, 500))
        : Promise.resolve({ data: [], error: null }),
      db.from('chat_sessions').select('id, vendor_id, caller_id, is_free, call_type').eq('is_active', true).limit(500),
      freeCallAttempts.isAvailable()
        ? db.from(freeCallAttempts.TABLE).select('id, customer_id, astrologer_id')
          .eq('outcome', 'ringing').gte('rang_at', ringingSince).limit(200)
        : Promise.resolve({ data: [], error: null }),
      db.from('free_call_bookings').select('id, customer_id, slot_start')
        .eq('status', 'booked').eq('kind', 'scheduled')
        .gte('slot_start', nowIso).lte('slot_start', inAnHour).limit(200),
    ]);
    for (const r of [poolRes, liveRes, ringRes]) if (r.error) throw r.error;

    const sessions = liveRes.data || [];
    const busy = new Set(sessions.map((s) => s.vendor_id).filter(Boolean));
    const reachable = (poolRes.data || []).filter((a) => (
      a.is_online && a.approval_status === 'approved' && a.is_suspended !== true && a.is_call_enabled
    ));
    const freeNow = reachable.filter((a) => !busy.has(a.id)).length;
    const freeSessions = withoutExcluded(sessions.filter((s) => s.is_free), 'caller_id');

    return res.json({
      success: true,
      at: nowIso,
      offer: offer ? {
        enabled: offer.enabled === true,
        mode: offer.mode || 'off',
        durationMinutes: Number(offer.durationMinutes) || null,
      } : null,
      pool: {
        size: pool.length,
        online: reachable.length,
        free: freeNow,
        busy: Math.max(0, reachable.length - freeNow),
      },
      ringing: withoutExcluded(ringRes.data || [], 'customer_id').length,
      inCall: freeSessions.length,
      // A scheduled booking failing to load is not worth a dead band — it reads as '?'.
      upcomingScheduled: upcomingRes.error ? null : withoutExcluded(upcomingRes.data || [], 'customer_id').length,
    });
  }));

  // ───────────────────────────────────────────────────────────────────────────
  // 2. TODAY vs the same hours of yesterday — every 30s.
  // ───────────────────────────────────────────────────────────────────────────
  app.get('/api/admin/bird-eye/free-call/today', requireAdmin, h(async (req, res) => {
    const todayStart = istMidnight(0);
    const yesterdayStart = istMidnight(1);
    const tomorrowStart = new Date(new Date(todayStart).getTime() + 86400000).toISOString();
    const yesterdayCutoff = new Date(Date.now() - 86400000).toISOString();
    const inWindow = (iso, a, b) => !!iso && iso >= a && (!b || iso < b);

    const offer = await safeOffer();
    const buckets = talkBuckets(offer);
    const payoutAt = payoutSecondsOf(offer);

    const [attemptRows, scheduledRows, shagunRows, signupRows] = await Promise.all([
      freeCallAttempts.isAvailable()
        ? pagedSelect(() => db.from(freeCallAttempts.TABLE)
          .select('customer_id, astrologer_id, booking_id, outcome, ended_by, rang_at, answered_at, duration_seconds, payout_amount')
          .gte('rang_at', yesterdayStart).order('rang_at'))
        : Promise.resolve({ rows: [], truncated: false }),
      // Keyed on slot_start: a scheduled call "belongs" to the day it was due, not the day
      // it was booked. Today's whole day is fetched, so "still to come" can be shown.
      pagedSelect(() => db.from('free_call_bookings')
        .select('customer_id, status, slot_start, call_started_at, call_duration_seconds')
        .eq('kind', 'scheduled').gte('slot_start', yesterdayStart).lt('slot_start', tomorrowStart)
        .order('slot_start')),
      pagedSelect(() => db.from('dakshina_payments')
        .select('customer_id, amount, paid_at').eq('status', 'paid')
        .gte('paid_at', yesterdayStart).order('paid_at')),
      pagedSelect(() => db.from('customers').select('id, created_at').gte('created_at', yesterdayStart).order('created_at')),
    ]);

    const attempts = withoutExcluded(attemptRows.rows, 'customer_id');
    const scheduled = withoutExcluded(scheduledRows.rows, 'customer_id');
    const shagun = withoutExcluded(shagunRows.rows, 'customer_id');
    const signups = withoutExcluded(signupRows.rows, 'id');

    // Did a free caller go on to PAY for a consultation the same day? That is the reason
    // the offer exists, so it gets a tile. One extra query, scoped to today's callers.
    const todaysCallers = [...new Set(attempts
      .filter((r) => inWindow(r.rang_at, todayStart, null) && r.answered_at)
      .map((r) => r.customer_id).filter(Boolean))];
    const yesterdaysCallers = [...new Set(attempts
      .filter((r) => inWindow(r.rang_at, yesterdayStart, yesterdayCutoff) && r.answered_at)
      .map((r) => r.customer_id).filter(Boolean))];
    const paidAfter = { today: new Set(), yesterday: new Set() };
    const callerIds = [...new Set([...todaysCallers, ...yesterdaysCallers])];
    for (const chunk of chunkIds(callerIds)) {
      const { data, error } = await db.from('chat_sessions')
        .select('caller_id, started_at').eq('is_free', false)
        .in('caller_id', chunk).gte('started_at', yesterdayStart);
      if (error) break; // a missing tile beats a dead screen
      for (const s of data || []) {
        if (inWindow(s.started_at, todayStart, null) && todaysCallers.includes(s.caller_id)) paidAfter.today.add(s.caller_id);
        if (inWindow(s.started_at, yesterdayStart, yesterdayCutoff) && yesterdaysCallers.includes(s.caller_id)) paidAfter.yesterday.add(s.caller_id);
      }
    }

    const slice = (a, b) => {
      const rows = attempts.filter((r) => inWindow(r.rang_at, a, b));
      const answered = rows.filter((r) => r.answered_at);
      const talked = rows.filter(hasDuration);
      const talkSecs = talked.reduce((s, r) => s + (Number(r.duration_seconds) || 0), 0);
      const outcomes = Object.fromEntries(OUTCOMES.map((o) => [o, rows.filter((r) => r.outcome === o).length]));
      const sched = scheduled.filter((r) => inWindow(r.slot_start, a, b));
      const cohort = signups.filter((c) => inWindow(c.created_at, a, b));
      const rangIds = new Set(rows.map((r) => r.customer_id));
      return {
        rings: rows.length,
        customersWhoRang: new Set(rows.map((r) => r.customer_id).filter(Boolean)).size,
        answered: answered.length,
        completed: outcomes.completed,
        paidLength: talked.filter((r) => Number(r.duration_seconds) >= payoutAt).length,
        talkMinutes: Math.round(talkSecs / 60),
        avgTalkSeconds: talked.length ? Math.round(talkSecs / talked.length) : 0,
        payout: Math.round(rows.reduce((s, r) => s + (Number(r.payout_amount) || 0), 0)),
        shagunCount: shagun.filter((p) => inWindow(p.paid_at, a, b)).length,
        shagunAmount: Math.round(shagun.filter((p) => inWindow(p.paid_at, a, b))
          .reduce((s, p) => s + (Number(p.amount) || 0), 0)),
        signups: cohort.length,
        signupsWhoRang: cohort.filter((c) => rangIds.has(c.id)).length,
        scheduledDue: sched.length,
        scheduledDone: sched.filter((r) => r.status === 'completed' || r.call_started_at).length,
        scheduledMissed: sched.filter((r) => r.status === 'missed').length,
        outcomes,
        endedBy: {
          customer: talked.filter((r) => r.ended_by === 'customer').length,
          astrologer: talked.filter((r) => r.ended_by === 'astrologer').length,
          system: talked.filter((r) => r.ended_by === 'system').length,
        },
        talk: buckets.map((bk) => ({
          key: bk.key,
          label: bk.label,
          count: talked.filter((r) => {
            const s = Number(r.duration_seconds);
            return s >= bk.min && s <= bk.max;
          }).length,
        })),
      };
    };

    const today = slice(todayStart, null);
    const yesterday = slice(yesterdayStart, yesterdayCutoff);
    today.wentPaid = paidAfter.today.size;
    yesterday.wentPaid = paidAfter.yesterday.size;
    today.callers = todaysCallers.length;
    yesterday.callers = yesterdaysCallers.length;

    // Scheduled calls still due later today — "yesterday" has no equivalent.
    const nowIso = new Date().toISOString();
    today.scheduledUpcoming = scheduled
      .filter((r) => inWindow(r.slot_start, nowIso, tomorrowStart) && r.status === 'booked').length;

    // Per astrologer, today. Who is carrying the offer, and who is letting it ring out.
    const byAstro = new Map();
    for (const r of attempts.filter((x) => inWindow(x.rang_at, todayStart, null))) {
      if (!r.astrologer_id) continue;
      const cur = byAstro.get(r.astrologer_id) || { id: r.astrologer_id, rings: 0, answered: 0, completed: 0, talkSeconds: 0 };
      cur.rings += 1;
      if (r.answered_at) cur.answered += 1;
      if (r.outcome === 'completed') cur.completed += 1;
      cur.talkSeconds += Number(r.duration_seconds) || 0;
      byAstro.set(r.astrologer_id, cur);
    }
    const astroIds = [...byAstro.keys()];
    const names = new Map();
    for (const chunk of chunkIds(astroIds)) {
      const { data } = await db.from('astrologers').select('id, first_name, last_name').in('id', chunk);
      (data || []).forEach((a) => names.set(a.id, `${a.first_name || ''} ${a.last_name || ''}`.trim() || 'Astrologer'));
    }
    const astrologers = [...byAstro.values()]
      .map((a) => ({
        ...a,
        name: names.get(a.id) || 'Deleted astrologer',
        answerRate: a.rings ? Math.round((a.answered / a.rings) * 100) : 0,
        talkMinutes: Math.round(a.talkSeconds / 60),
      }))
      .sort((x, y) => y.rings - x.rings || y.answered - x.answered);

    return res.json({
      success: true,
      at: nowIso,
      day: istDay(todayStart),
      offer: offer ? { durationMinutes: Number(offer.durationMinutes) || null, payoutAtSeconds: payoutAt } : null,
      attemptsLogged: freeCallAttempts.isAvailable(),
      today,
      yesterday,
      astrologers,
      truncated: [attemptRows, scheduledRows, shagunRows, signupRows].some((r) => r.truncated),
    });
  }));

  // ───────────────────────────────────────────────────────────────────────────
  // 3. BY HOUR — today, with yesterday's full day alongside for the comparison line.
  //    Today stops at the current hour (see seedTodayHours in birdEyeRoutes.js for why);
  //    yesterday is a finished day, so all 24 of its hours are real.
  // ───────────────────────────────────────────────────────────────────────────
  app.get('/api/admin/bird-eye/free-call/trends', requireAdmin, h(async (req, res) => {
    const todayStart = istMidnight(0);
    const yesterdayStart = istMidnight(1);
    const nowHour = currentIstHour();

    const { rows } = freeCallAttempts.isAvailable()
      ? await pagedSelect(() => db.from(freeCallAttempts.TABLE)
        .select('customer_id, outcome, rang_at, answered_at, duration_seconds')
        .gte('rang_at', yesterdayStart).order('rang_at'))
      : { rows: [] };
    const attempts = withoutExcluded(rows, 'customer_id');

    const points = [];
    for (let hr = 0; hr < 24; hr += 1) {
      points.push({
        hour: hr,
        label: hourLabel(hr),
        // null (not 0) for hours still to come: recharts leaves a gap instead of a cliff.
        rings: hr <= nowHour ? 0 : null,
        answered: hr <= nowHour ? 0 : null,
        completed: hr <= nowHour ? 0 : null,
        talkMinutes: hr <= nowHour ? 0 : null,
        yRings: 0,
        yAnswered: 0,
      });
    }
    for (const r of attempts) {
      const hr = istHour(r.rang_at);
      const p = points[hr];
      if (!p) continue;
      if (r.rang_at >= todayStart) {
        if (p.rings === null) continue;
        p.rings += 1;
        if (r.answered_at) p.answered += 1;
        if (r.outcome === 'completed') p.completed += 1;
        p.talkMinutes += (Number(r.duration_seconds) || 0) / 60;
      } else {
        p.yRings += 1;
        if (r.answered_at) p.yAnswered += 1;
      }
    }
    for (const p of points) if (p.talkMinutes !== null) p.talkMinutes = Math.round(p.talkMinutes);

    return res.json({ success: true, day: istDay(todayStart), throughHour: nowHour, points });
  }));

  console.log('[birdEyeFreeCall] Registered GET /api/admin/bird-eye/free-call/{pulse,today,trends}');
};
