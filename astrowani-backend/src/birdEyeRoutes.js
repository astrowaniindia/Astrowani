/**
 * BIRD EYE — the one screen an operator keeps open all day.
 *
 * WHAT THIS IS, AND WHAT IT DELIBERATELY IS NOT. It is NOT another analytics page, and
 * it is not named one: Analytics answers "why did last fortnight look like that" with
 * twenty cards and a date-range control, and nobody watches it all day. This answers
 * one question — "is the platform healthy RIGHT NOW, and is today going better or worse
 * than yesterday" — with no date picker at all. Today is the range. The whole point is
 * that a glance is enough, so every number here had to earn its place by changing an
 * operator's next action; anything that is merely interesting belongs on Analytics.
 *
 * FOUR ENDPOINTS, NOT ONE, and that is the important structural decision. The page
 * polls them at different rates — the live band every 10s, today every 30s, the trend
 * lines every 2 minutes — because a live tile is worthless at a 2-minute refresh and
 * re-running a 14-day aggregate every 10s is pure load for no information. Keeping them
 * apart also isolates failure the way the Analytics page already does: PostHog being
 * unconfigured or rate-limited takes out the signup graph and nothing else, and a slow
 * trend query cannot stall the live band. Never merge these into one route.
 *
 * EVERY DAY HERE IS AN INDIAN DAY. `created_at` is timestamptz and the VPS runs UTC, so
 * a plain `toISOString().slice(0,10)` files everyone active between 00:00 and 05:30 IST
 * under yesterday — measured at 47 signups against 54 for the same day on the Analytics
 * page (2026-09-20). IST is a fixed +05:30 with no DST, so the shift below is exact.
 *
 * PACE, NOT TOTALS, is what makes the "Today" band readable. A bare "₹4,200 so far"
 * means nothing at 11am. Every today figure is therefore paired with the SAME ELAPSED
 * SLICE of yesterday (00:00 IST → this time of day, 24h back), never with yesterday's
 * full total, which would read as a collapse every morning.
 *
 * Excluded customers (src/analyticsExclusions.js — the team's own phones, testers, the
 * store-reviewer login) are dropped here as well. An operator comparing this screen
 * against Analytics must not find the two disagreeing about how many people signed up.
 */

const { requireAdmin } = require('./adminRoutes');
const { createClient } = require('@supabase/supabase-js');
const { pagedSelect } = require('./pagedSelect');
const { withoutExcluded } = require('./analyticsExclusions');
const { runHogQL, isConfigured, ENV_FILTER } = require('./postHogRoutes');

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/** The IST calendar day an instant falls on, as 'YYYY-MM-DD'. */
function istDay(value) {
  const t = new Date(value).getTime();
  if (!Number.isFinite(t)) return null;
  return new Date(t + IST_OFFSET_MS).toISOString().slice(0, 10);
}

/** Midnight IST, `daysAgo` days back, as a UTC ISO instant. */
function istMidnight(daysAgo = 0) {
  const shifted = Date.now() + IST_OFFSET_MS;
  const dayStart = Math.floor(shifted / 86400000) * 86400000 - daysAgo * 86400000;
  return new Date(dayStart - IST_OFFSET_MS).toISOString();
}

/** The IST hour-of-day (0–23) an instant falls in. */
function istHour(value) {
  const t = new Date(value).getTime();
  if (!Number.isFinite(t)) return null;
  return new Date(t + IST_OFFSET_MS).getUTCHours();
}

/** The IST hour it is right now — the last bucket that has any data in it. */
const currentIstHour = () => new Date(Date.now() + IST_OFFSET_MS).getUTCHours();

const hourLabel = (h) => `${String(h).padStart(2, '0')}:00`;

/**
 * Today's elapsed hours, seeded at zero: 00:00 IST through the hour it is now.
 *
 * ⚠️ IT STOPS AT THE CURRENT HOUR, and that is the whole trick. Seeding all 24 would draw
 * every hour still to come as a hard zero, so at 10am the chart would show two hours of
 * activity followed by a fourteen-hour cliff to the floor — which reads as the platform
 * dying, not as the day not having happened yet. Hours already past DO get a zero,
 * because a quiet hour at 4am is real information.
 */
function seedTodayHours(fields) {
  const byHour = new Map();
  for (let h = 0; h <= currentIstHour(); h += 1) {
    byHour.set(h, { hour: h, label: hourLabel(h), ...fields });
  }
  return byHour;
}

/**
 * How long an unanswered request keeps ringing. Must stay in step with
 * PENDING_REQUEST_TTL_MS in src/busyStatus.js, which is not exported — a `pending` row
 * is never resolved by anything server-side (the 45s auto-cancel lives in the client),
 * so without this cutoff "ringing now" slowly accumulates every abandoned request ever
 * made and the tile becomes a counter of dead rows.
 */
const RINGING_TTL_MS = 90 * 1000;

/**
 * A call is "connected" once the server has given it a billing clock. It is set on free
 * sessions too (verified against production: 301 of 401 free calls in a week), so this
 * is the one test that works across free and paid alike — unlike a duration floor,
 * which cannot tell a 20-second conversation from a call that never carried audio.
 */
const CONNECTED_COLUMN = 'next_billing_at';

/** Outlier guard, same threshold and same reason as /api/admin/analytics/session-volume. */
const MAX_PLAUSIBLE_SESSION_MINUTES = 12 * 60;

const h = (fn) => (req, res) => fn(req, res).catch((err) => {
  console.error('[birdEye]', err?.response?.data || err.message);
  return res.status(502).json({ success: false, message: 'Bird Eye query failed.' });
});

/**
 * A head-only COUNT that degrades instead of taking the whole band down with it.
 *
 * The queues counted here include some of the newest tables in the schema, and a
 * backend deployed ahead of its migration must show one unreadable queue rather than a
 * dead screen. `ok` is carried through so the page can tell "nothing to do" apart from
 * "could not look" — the whole point, since a queue silently rendering 0 is how work
 * sits unnoticed.
 *
 * ⚠️ A MISSING TABLE DOES NOT PRODUCE AN ERROR HERE, and checking `error` alone is not
 * enough. Measured against production (2026-10-22): supabase-js with `head: true` sends
 * a HEAD request, and for an unknown table PostgREST answers **204 with error null and
 * count null** — the PGRST205 body only appears when a body is requested at all. So the
 * obvious `if (error) throw` guard never fires and every missing table reads as an empty
 * queue. The real signal is a count that is not a number; that is what is tested.
 */
async function safeCount(label, build) {
  try {
    const { count, error } = await build();
    if (error) throw error;
    if (!Number.isFinite(count)) {
      console.warn(`[birdEye] count '${label}' returned no count — treating as unreadable`);
      return { count: 0, ok: false };
    }
    return { count, ok: true };
  } catch (err) {
    console.warn(`[birdEye] count '${label}' unavailable:`, err?.message || err);
    return { count: 0, ok: false };
  }
}

/** Distinct, non-null values of `field`. */
const idSet = (rows, field) => new Set((rows || []).map((r) => r?.[field]).filter(Boolean));

module.exports = function registerBirdEyeRoutes(app) {
  // ───────────────────────────────────────────────────────────────────────────
  // 1. RIGHT NOW — polled every 10s. Cheap by design: nothing here scans a date
  //    range, every query is a small indexed slice of live state.
  // ───────────────────────────────────────────────────────────────────────────
  app.get('/api/admin/bird-eye/pulse', requireAdmin, h(async (req, res) => {
    const ringingSince = new Date(Date.now() - RINGING_TTL_MS).toISOString();

    const [rosterRes, activeRes, liveRes, callReqRes, chatReqRes] = await Promise.all([
      // The roster, not a count: "online" alone overstates supply badly. 41 rows had
      // is_online = true against 29 a customer could actually reach (measured
      // 2026-10-22) — the rest are unapproved, suspended, hidden test accounts, or have
      // every service toggle off. Both numbers are reported, because the GAP is the
      // actionable part: it is astrologers who believe they are working and are not.
      db.from('astrologers')
        .select('id, approval_status, is_suspended, hidden_from_customers, is_chat_enabled, is_call_enabled, is_video_call_enabled')
        .eq('is_online', true)
        .limit(2000),
      db.from('chat_sessions').select('id, vendor_id, call_type, is_free, started_at').eq('is_active', true).limit(500),
      db.from('live_sessions').select('id, astrologer_id, viewer_count').eq('is_active', true).limit(200),
      db.from('call_requests').select('id, astrologer_id').eq('status', 'pending').gte('created_at', ringingSince).limit(500),
      db.from('chat_requests').select('id, receiver_id').eq('status', 'pending').gte('created_at', ringingSince).limit(500),
    ]);

    for (const r of [rosterRes, activeRes, liveRes, callReqRes, chatReqRes]) {
      if (r.error) throw r.error;
    }

    const roster = rosterRes.data || [];
    const takingWork = roster.filter((a) => (
      a.approval_status === 'approved'
      && a.is_suspended !== true
      && a.hidden_from_customers !== true
      && (a.is_chat_enabled || a.is_call_enabled || a.is_video_call_enabled)
    ));

    const sessions = activeRes.data || [];
    const live = liveRes.data || [];
    const ringingCalls = callReqRes.data || [];
    const ringingChats = chatReqRes.data || [];

    // Busy is the UNION of the three states src/busyStatus.js treats as busy, counted
    // over DISTINCT astrologers — somebody live who is also mid-session is one person,
    // and summing the three would report more busy astrologers than exist.
    const busy = new Set([
      ...idSet(sessions, 'vendor_id'),
      ...idSet(live, 'astrologer_id'),
      ...idSet(ringingCalls, 'astrologer_id'),
      ...idSet(ringingChats, 'receiver_id'),
    ]);
    const onWorkIds = new Set(takingWork.map((a) => a.id));
    const busyOnRoster = [...busy].filter((id) => onWorkIds.has(id)).length;

    const byType = { chat: 0, audio: 0, video: 0 };
    let freeSessions = 0;
    let longestMinutes = 0;
    for (const s of sessions) {
      const bucket = s.call_type === 'chat' ? 'chat' : s.call_type === 'video' ? 'video' : 'audio';
      byType[bucket] += 1;
      if (s.is_free) freeSessions += 1;
      if (s.started_at) {
        const mins = (Date.now() - new Date(s.started_at).getTime()) / 60000;
        // A session running longer than anyone talks is a stuck row, not a long
        // consultation (the zombie sessions from the data-layer audit). Reporting it as
        // the longest live call would make the tile read as a 50-day conversation.
        if (mins > longestMinutes && mins <= MAX_PLAUSIBLE_SESSION_MINUTES) longestMinutes = mins;
      }
    }

    return res.json({
      success: true,
      at: new Date().toISOString(),
      astrologers: {
        online: roster.length,
        takingWork: takingWork.length,
        busy: busyOnRoster,
        free: Math.max(0, takingWork.length - busyOnRoster),
        // Online but unreachable by a customer. Worth a chase, never a headline.
        onlineButUnreachable: Math.max(0, roster.length - takingWork.length),
      },
      sessions: {
        active: sessions.length,
        free: freeSessions,
        paid: Math.max(0, sessions.length - freeSessions),
        byType,
        longestMinutes: Math.round(longestMinutes),
      },
      ringing: {
        total: ringingCalls.length + ringingChats.length,
        calls: ringingCalls.length,
        chats: ringingChats.length,
      },
      live: {
        streams: live.length,
        viewers: live.reduce((sum, s) => sum + (Number(s.viewer_count) || 0), 0),
      },
    });
  }));

  // ───────────────────────────────────────────────────────────────────────────
  // 2. TODAY — polled every 30s. Each figure paired with the same elapsed slice of
  //    yesterday, plus the operational queues and today's connection health.
  // ───────────────────────────────────────────────────────────────────────────
  app.get('/api/admin/bird-eye/today', requireAdmin, h(async (req, res) => {
    const todayStart = istMidnight(0);
    const yesterdayStart = istMidnight(1);
    // Yesterday, cut off at this same time of day. Comparing against yesterday's FULL
    // total would show every morning as a crash and tell an operator nothing.
    const yesterdayCutoff = new Date(Date.now() - 86400000).toISOString();

    const inWindow = (iso, startIso, endIso) => {
      if (!iso) return false;
      return iso >= startIso && (!endIso || iso < endIso);
    };

    const [
      signupRows, rechargeRows, sessionRows, debitRows, platformRows, freeCallRows,
      pendingAstro, pendingPayout, pendingFlags, pendingReports, pendingLiveReports,
      openTickets, openOrders,
    ] = await Promise.all([
      pagedSelect(() => db.from('customers').select('id, created_at').gte('created_at', yesterdayStart).order('created_at')),
      pagedSelect(() => db.from('wallet_recharges').select('amount, status, created_at, paid_at, customer_id').gte('created_at', yesterdayStart).order('created_at')),
      pagedSelect(() => db.from('chat_sessions').select('caller_id, call_type, is_free, started_at, ended_at, next_billing_at').gte('started_at', yesterdayStart).order('started_at')),
      pagedSelect(() => db.from('wallet_transactions').select('amount, user_id, created_at').eq('type', 'debit').gte('created_at', yesterdayStart).order('created_at')),
      pagedSelect(() => db.from('admin_wallet_transactions').select('amount, type, customer_id, created_at').gte('created_at', yesterdayStart).order('created_at')),
      // Keyed on call_started_at, NOT created_at. A scheduled booking can be made days
      // before the call happens, so filtering on when the row was created would drop
      // exactly the scheduled half of this offer from today's count. `.gte` also drops
      // the NULLs, which is right: a booking with no call_started_at never happened.
      pagedSelect(() => db.from('free_call_bookings').select('customer_id, status, call_started_at').gte('call_started_at', yesterdayStart).order('call_started_at')),

      safeCount('astrologers pending', () => db.from('astrologers').select('id', { count: 'exact', head: true }).eq('approval_status', 'pending')),
      safeCount('withdrawals pending', () => db.from('withdrawal_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending')),
      safeCount('contact flags', () => db.from('session_flags').select('id', { count: 'exact', head: true }).eq('status', 'pending')),
      safeCount('customer reports', () => db.from('customer_reports').select('id', { count: 'exact', head: true }).eq('status', 'pending')),
      safeCount('live comment reports', () => db.from('live_comment_reports').select('id', { count: 'exact', head: true }).eq('status', 'pending')),
      safeCount('support tickets', () => db.from('support_tickets').select('id', { count: 'exact', head: true }).neq('status', 'resolved')),
      // Paid and not yet out of the door. Delivered and cancelled are finished, and an
      // unpaid order is the customer's to finish, not ours.
      safeCount('orders to fulfil', () => db.from('orders')
        .select('id', { count: 'exact', head: true })
        .eq('payment_status', 'paid')
        .not('status', 'in', '("delivered","cancelled")')),
    ]);

    const signups = withoutExcluded(signupRows.rows, 'id');
    const recharges = withoutExcluded(rechargeRows.rows, 'customer_id');
    const sessions = withoutExcluded(sessionRows.rows, 'caller_id');
    const debits = withoutExcluded(debitRows.rows, 'user_id');
    const platform = withoutExcluded(platformRows.rows, 'customer_id');
    const freeCalls = withoutExcluded(freeCallRows.rows, 'customer_id');

    // Both windows are sliced out of ONE fetch rather than issued as two sets of
    // queries, so the comparison can never be computed off a different snapshot than
    // the figure it is being compared with.
    const slice = (startIso, endIso) => {
      const moneyIn = recharges
        .filter((r) => r.status === 'paid' && inWindow(r.paid_at, startIso, endIso))
        .reduce((sum, r) => sum + (Number(r.amount) || 0), 0);

      const attempted = recharges.filter((r) => inWindow(r.created_at, startIso, endIso));
      const paidAttempts = attempted.filter((r) => r.status === 'paid').length;

      const platformShare = platform
        .filter((t) => t.type === 'credit' && inWindow(t.created_at, startIso, endIso))
        .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);

      const windowSessions = sessions.filter((s) => inWindow(s.started_at, startIso, endIso));
      let minutes = 0;
      for (const s of windowSessions) {
        if (!s.ended_at) continue;
        const mins = Math.max(0, (new Date(s.ended_at) - new Date(s.started_at)) / 60000);
        if (mins <= MAX_PLAUSIBLE_SESSION_MINUTES) minutes += mins;
      }

      const windowDebits = debits.filter((t) => inWindow(t.created_at, startIso, endIso));

      return {
        moneyIn: Math.round(moneyIn),
        platformShare: Math.round(platformShare),
        signups: signups.filter((c) => inWindow(c.created_at, startIso, endIso)).length,
        sessions: windowSessions.length,
        paidSessions: windowSessions.filter((s) => !s.is_free).length,
        minutes: Math.round(minutes),
        payingCustomers: idSet(windowDebits, 'user_id').size,
        rechargeAttempts: attempted.length,
        rechargesPaid: paidAttempts,
        // The free intro call that actually HAPPENED, keyed on call_started_at rather
        // than on the booking being made — a booking is an intention, and counting them
        // would report a day of no-shows as a day of consultations.
        freeCallsAnswered: freeCalls.filter((b) => inWindow(b.call_started_at, startIso, endIso)).length,
      };
    };

    const today = slice(todayStart, null);
    const yesterday = slice(yesterdayStart, yesterdayCutoff);

    // CONNECTION HEALTH — the metric the 2026-10-21 fault was invisible without. 14% of
    // calls were being killed by a watchdog while the microphone dialog was still open,
    // and nothing on any admin screen would have shown it: the sessions existed, the
    // astrologers were online, and no error was logged anywhere. Chat is excluded
    // because it opens no media and cannot fail this way.
    const todayCalls = sessions.filter((s) => s.call_type !== 'chat' && inWindow(s.started_at, todayStart, null));
    const connected = todayCalls.filter((s) => s[CONNECTED_COLUMN]).length;
    const diedEarly = todayCalls.filter((s) => (
      s.ended_at && (new Date(s.ended_at) - new Date(s.started_at)) < 60000
    )).length;

    const queues = [
      { key: 'astrologers', label: 'Astrologers to approve', to: '/new-entries', ...pendingAstro },
      { key: 'withdrawals', label: 'Payouts to release', to: '/withdrawals', ...pendingPayout },
      { key: 'flags', label: 'Off-platform contact flags', to: '/session-flags', ...pendingFlags },
      {
        key: 'moderation',
        label: 'Reports to review',
        to: '/moderation',
        count: pendingReports.count + pendingLiveReports.count,
        ok: pendingReports.ok && pendingLiveReports.ok,
      },
      { key: 'support', label: 'Open support tickets', to: '/support', ...openTickets },
      { key: 'orders', label: 'Orders to fulfil', to: '/orders', ...openOrders },
    ];

    return res.json({
      success: true,
      at: new Date().toISOString(),
      dayStart: todayStart,
      today,
      yesterday,
      health: {
        calls: todayCalls.length,
        connected,
        neverConnected: Math.max(0, todayCalls.length - connected),
        diedUnderAMinute: diedEarly,
      },
      queues,
      // pagedSelect's backstop. Shown rather than swallowed: a quietly capped total is
      // the exact failure that module exists to eliminate.
      truncated: [signupRows, rechargeRows, sessionRows, debitRows, platformRows, freeCallRows]
        .some((r) => r.truncated),
    });
  }));

  // ───────────────────────────────────────────────────────────────────────────
  // 3. TODAY BY HOUR — money and demand, straight from the database.
  //
  //    ONE DAY, NOT A RANGE. This screen has no date control and today is the only
  //    range it has; a fortnight of daily points answers "how has the month gone",
  //    which is Analytics' job and is unreadable next to tiles that all say "today".
  //    Hour by hour also answers something a daily series never can — whether the
  //    thing that just broke broke an hour ago.
  // ───────────────────────────────────────────────────────────────────────────
  app.get('/api/admin/bird-eye/trends', requireAdmin, h(async (req, res) => {
    const dayStart = istMidnight(0);

    const [signupRows, rechargeRows, sessionRows] = await Promise.all([
      pagedSelect(() => db.from('customers').select('id, created_at').gte('created_at', dayStart).order('created_at')),
      pagedSelect(() => db.from('wallet_recharges').select('amount, customer_id, paid_at').eq('status', 'paid').gte('paid_at', dayStart).order('paid_at')),
      pagedSelect(() => db.from('chat_sessions').select('caller_id, is_free, started_at').gte('started_at', dayStart).order('started_at')),
    ]);

    const byHour = seedTodayHours({ revenue: 0, signups: 0, consultations: 0, paidConsultations: 0 });
    const bump = (iso, fn) => {
      const entry = byHour.get(istHour(iso));
      if (entry) fn(entry);
    };

    for (const c of withoutExcluded(signupRows.rows, 'id')) bump(c.created_at, (e) => { e.signups += 1; });
    for (const r of withoutExcluded(rechargeRows.rows, 'customer_id')) {
      bump(r.paid_at, (e) => { e.revenue += Number(r.amount) || 0; });
    }
    for (const s of withoutExcluded(sessionRows.rows, 'caller_id')) {
      bump(s.started_at, (e) => {
        e.consultations += 1;
        if (!s.is_free) e.paidConsultations += 1;
      });
    }

    const points = [...byHour.values()].map((p) => ({ ...p, revenue: Math.round(p.revenue) }));
    return res.json({
      success: true,
      day: istDay(dayStart),
      throughHour: currentIstHour(),
      points,
      truncated: [signupRows, rechargeRows, sessionRows].some((r) => r.truncated),
    });
  }));

  // ───────────────────────────────────────────────────────────────────────────
  // 4. SIGNUP FLOW BY HOUR — the gift-reveal flow of 2026-10-17, today only.
  //
  //    LINES, NOT THE FUNNEL the New Signup Flow page draws, and the difference is not
  //    cosmetic. A funnel answers "where do people fall out", which you ask once while
  //    tuning a flow; it collapses a range into bars that look identical whether the
  //    morning was a record or a disaster. Hour by hour answers the question a live
  //    screen is for — is the flow working RIGHT NOW, and if it stopped, when. The
  //    funnel page stays exactly as it is; this is the same events asked differently.
  // ───────────────────────────────────────────────────────────────────────────
  app.get('/api/admin/bird-eye/signup-trend', requireAdmin, h(async (req, res) => {
    if (!isConfigured()) {
      return res.status(503).json({ success: false, message: 'PostHog is not configured on this server.' });
    }
    const day = istDay(istMidnight(0));

    // Distinct PEOPLE per hour, not events: somebody who retypes a wrong OTP three times
    // fires the submit event three times, and on an event basis that line would sit
    // ABOVE the one before it. A funnel that widens as it descends is unreadable, and
    // the same arithmetic ruins a line chart just as thoroughly.
    //
    // `day` is built by istDay() from a timestamp, never from the request, so there is
    // nothing of the caller's in this query string.
    const rows = await runHogQL(`
      SELECT
        toHour(toTimeZone(timestamp, 'Asia/Kolkata')) AS hour,
        count(DISTINCT if(event = 'campaign_gift_reveal_shown', person_id, NULL)) AS shown,
        count(DISTINCT if(event = 'campaign_gift_reveal_opened', person_id, NULL)) AS opened,
        count(DISTINCT if(event = 'signup_gate_shown', person_id, NULL)) AS card,
        count(DISTINCT if(event = 'signup_gate_completed', person_id, NULL)) AS signed_in,
        count(DISTINCT if(event = 'free_call_instant_ring', person_id, NULL)) AS rang,
        count(DISTINCT if(event = 'free_call_instant_answered', person_id, NULL)) AS answered
      FROM events
      WHERE properties.app = 'customer' AND ${ENV_FILTER}
        AND toDate(toTimeZone(timestamp, 'Asia/Kolkata')) = toDate('${day}')
      GROUP BY hour ORDER BY hour
    `);

    const byHour = seedTodayHours({ shown: 0, opened: 0, card: 0, signedIn: 0, rang: 0, answered: 0 });
    for (const row of rows || []) {
      const entry = byHour.get(Number(row[0]));
      if (!entry) continue;
      entry.shown = Number(row[1]) || 0;
      entry.opened = Number(row[2]) || 0;
      entry.card = Number(row[3]) || 0;
      entry.signedIn = Number(row[4]) || 0;
      entry.rang = Number(row[5]) || 0;
      entry.answered = Number(row[6]) || 0;
    }

    return res.json({
      success: true,
      basis: 'persons',
      day,
      throughHour: currentIstHour(),
      points: [...byHour.values()],
    });
  }));

  console.log('[birdEye] Registered GET /api/admin/bird-eye/{pulse,today,trends,signup-trend}');
};

module.exports.istDay = istDay;
module.exports.istHour = istHour;
module.exports.currentIstHour = currentIstHour;
module.exports.istMidnight = istMidnight;
// Exported for scripts/birdEyeCheck.js only. Its unreadable-queue branch cannot be
// reached through an endpoint without breaking a table, and that branch is precisely
// the one that decides whether an unread queue shows as "?" or as a confident zero.
module.exports.safeCount = safeCount;
