/**
 * Free instant call — its own analytics, served to its own admin page.
 *
 * Deliberately separate from /api/admin/analytics/*: those cards answer "how is the app
 * doing", this answers "how is THIS offer doing", and the owner reads them in different
 * places for different reasons.
 *
 * TWO SOURCES, AND THE SPLIT IS THE POINT:
 *
 *   The DATABASE (free_call_attempts, free_call_bookings, dakshina_payments) is the
 *   authority for anything that actually happened — who rang whom, who picked up, how
 *   long they talked, who hung up first, what the platform paid, what came back. These
 *   numbers are exact and survive a phone losing analytics consent or a dropped event.
 *
 *   POSTHOG is the authority for the part of the funnel that happens BEFORE any row
 *   exists — the offer being shown, the Claim tap, the screen opening. There is no
 *   server-side record of a customer looking at a card and closing it, and there should
 *   not be one; that is what product analytics is for.
 *
 * Mixing the two in one number would be wrong, so the response keeps them in separate
 * branches of the tree and the UI labels which is which. PostHog being unconfigured or
 * slow degrades that branch to nulls and leaves every database number intact.
 */
const { createClient } = require('@supabase/supabase-js');
const { requireAdmin } = require('./adminRoutes');
const postHog = require('./postHogRoutes');
const freeCallAttempts = require('./freeCallAttempts');
const { chunkIds } = require('./pagedSelect');

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const h = (fn) => (req, res) => fn(req, res).catch((err) => {
  console.error(`[freeCallAnalytics] ${req.method} ${req.path}:`, err.message);
  res.status(500).json({ success: false, message: 'Could not load free call analytics' });
});

/** 1..180 days, defaulting to 30. Same clamping discipline as the PostHog routes. */
function rangeFrom(req) {
  const n = parseInt(req.query.days, 10);
  const days = Number.isFinite(n) && n > 0 ? Math.min(n, 180) : 30;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  return { days, sinceIso: since.toISOString() };
}

/* ── Every clickable thing in the offer, in the order a customer meets them. ──────
 * Each entry is one PostHog event. `step` groups them into the tree; `label` is what
 * the admin reads. Kept as DATA rather than a hand-written query per card so adding a
 * new event to the app means adding one line here, not a new endpoint.
 */
const CLICK_EVENTS = [
  { event: 'free_call_offer_shown', label: 'Offer shown', step: 'see' },
  { event: 'free_call_claim_tapped', label: 'Tapped "Claim my free call"', step: 'claim' },
  { event: 'free_call_offer_dismissed', label: 'Closed the offer card', step: 'claim', drop: true },
  { event: 'free_call_gift_bubble_tapped', label: 'Tapped the gift box on Home', step: 'claim' },
  { event: 'free_call_instant_opened', label: 'Opened the astrologer list', step: 'open' },
  { event: 'free_call_instant_opened_from_card', label: 'Opened list from the offer card', step: 'open' },
  { event: 'free_call_birth_details_auto_opened', label: 'Asked for birth details', step: 'open' },
  { event: 'free_call_instant_ring', label: 'Rang an astrologer', step: 'ring' },
  { event: 'free_call_instant_no_answer', label: 'Nobody answered', step: 'ring', drop: true },
  { event: 'free_call_instant_rejected', label: 'Astrologer declined', step: 'ring', drop: true },
  { event: 'free_call_instant_notify_me', label: 'Joined the waitlist instead', step: 'ring', drop: true },
  { event: 'free_call_answered', label: 'Call answered', step: 'talk' },
  { event: 'free_call_continue_shown', label: '"More minutes" sheet shown', step: 'after' },
  { event: 'free_call_continue_paid', label: 'Bought more minutes', step: 'after' },
  { event: 'free_call_continue_dismissed', label: 'Closed "more minutes"', step: 'after', drop: true },
  { event: 'shagun_dakshina_shown', label: 'Shagun Arpan shown', step: 'after' },
  { event: 'shagun_dakshina_paid', label: 'Shagun Arpan paid', step: 'after' },
  { event: 'shagun_dakshina_skipped', label: 'Shagun Arpan skipped', step: 'after', drop: true },
  { event: 'rate_app_prompt_shown', label: 'Rating asked', step: 'after' },
  { event: 'rate_app_prompt_accepted', label: 'Rated the app', step: 'after' },
];

/**
 * One HogQL round trip for every event above.
 *
 * Returns nulls rather than throwing when PostHog is unconfigured or unhappy: this whole
 * branch is a nice-to-have sitting next to database numbers that must always render. An
 * analytics page that goes blank because a third party is slow is worse than one that
 * says "not available".
 */
async function clickCounts(sinceIso) {
  if (!postHog.isConfigured()) return { available: false, reason: 'PostHog is not configured', events: [] };
  const names = CLICK_EVENTS.map((e) => `'${e.event}'`).join(', ');
  // ${postHog.ENV_FILTER} is mandatory — production only, from the admin's analytics
  // start date, minus excluded customers. See the note where it is exported.
  const sql = `
    SELECT event, count() AS total, count(DISTINCT person_id) AS people
    FROM events
    WHERE event IN (${names})
      AND ${postHog.ENV_FILTER}
      AND timestamp >= toDateTime('${sinceIso.slice(0, 19).replace('T', ' ')}')
    GROUP BY event
  `;
  try {
    const rows = await postHog.runHogQL(sql);
    const by = new Map((rows || []).map((r) => [r[0], { total: Number(r[1]) || 0, people: Number(r[2]) || 0 }]));
    return {
      available: true,
      events: CLICK_EVENTS.map((e) => ({
        ...e,
        total: by.get(e.event)?.total || 0,
        people: by.get(e.event)?.people || 0,
      })),
    };
  } catch (err) {
    console.error('[freeCallAnalytics] PostHog query failed:', err.message);
    return { available: false, reason: 'PostHog query failed', events: [] };
  }
}

/** Talk-time histogram. Boundaries chosen to match the lines the product cares about. */
const TALK_BUCKETS = [
  { label: 'Under 30s (did not count)', min: 0, max: 29 },
  { label: '30s – 2 min', min: 30, max: 119 },
  { label: '2 – 4 min (before payout)', min: 120, max: 239 },
  { label: '4 – 8 min (payout earned)', min: 240, max: 479 },
  { label: '8 – 11 min', min: 480, max: 659 },
  { label: 'Full 11 min', min: 660, max: Infinity },
];

function bucketTalk(seconds) {
  if (seconds === null || seconds === undefined) return null;
  const s = Number(seconds);
  if (!Number.isFinite(s)) return null;
  return TALK_BUCKETS.find((b) => s >= b.min && s <= b.max) || null;
}

const avg = (nums) => (nums.length ? Math.round(nums.reduce((a, b) => a + b, 0) / nums.length) : 0);

/**
 * Did this attempt produce a measured conversation at all?
 *
 * NOT `Number.isFinite(Number(r.duration_seconds))`: duration_seconds is NULL for every
 * ring that was never answered, `Number(null)` is 0, and 0 is finite — so that test
 * counts a ring nobody picked up as a zero-second call. It made "talked properly" come
 * out at 175% of "picked up" on the very first render, which is how it was caught.
 * NULL means "no call happened"; 0 means "answered, but no talk time", and they must
 * never collapse into each other.
 */
const hasDuration = (r) => r && r.duration_seconds !== null && r.duration_seconds !== undefined
  && Number.isFinite(Number(r.duration_seconds));

/** Look up names for a set of ids, in chunks, tolerating a missing row. */
async function namesFor(table, ids, cols) {
  const out = new Map();
  const list = [...new Set(ids.filter(Boolean))];
  if (!list.length) return out;
  for (const chunk of chunkIds(list)) {
    const { data } = await db.from(table).select(cols).in('id', chunk);
    (data || []).forEach((r) => out.set(r.id, r));
  }
  return out;
}

module.exports = function registerFreeCallAnalyticsRoutes(app) {
  /* ── The whole picture for the offer, in one call ─────────────────────────── */
  app.get('/api/admin/free-call/analytics', requireAdmin, h(async (req, res) => {
    const { days, sinceIso } = rangeFrom(req);

    if (!freeCallAttempts.isAvailable()) {
      return res.status(200).json({
        success: true, days, ready: false,
        message: 'Run sql/free_call_attempts.sql to start recording free call attempts.',
      });
    }

    const [{ data: attempts }, { data: bookings }, clicks] = await Promise.all([
      db.from(freeCallAttempts.TABLE)
        .select('id, booking_id, customer_id, astrologer_id, session_id, attempt_no, outcome, '
          + 'ended_by, rang_at, answered_at, ended_at, duration_seconds, payout_amount')
        .gte('rang_at', sinceIso)
        .order('rang_at', { ascending: false })
        .limit(5000),
      db.from('free_call_bookings')
        .select('id, customer_id, status, call_attempts, created_at, kind')
        .eq('kind', 'instant')
        .gte('created_at', sinceIso)
        .limit(5000),
      clickCounts(sinceIso),
    ]);

    const rows = attempts || [];
    const books = bookings || [];

    // ── Outcomes ──
    const outcomes = {};
    rows.forEach((r) => { outcomes[r.outcome] = (outcomes[r.outcome] || 0) + 1; });

    const answered = rows.filter((r) => r.answered_at);
    const talked = rows.filter(hasDuration);
    const completed = rows.filter((r) => r.outcome === 'completed');

    // ── Who hangs up, and how far in ──
    const endedBy = {};
    ['customer', 'astrologer', 'system'].forEach((who) => {
      const mine = talked.filter((r) => r.ended_by === who);
      endedBy[who] = {
        count: mine.length,
        avgSeconds: avg(mine.map((r) => Number(r.duration_seconds))),
      };
    });
    const endedByUnknown = talked.filter((r) => !r.ended_by).length;

    // ── How long people actually talk ──
    const talkBuckets = TALK_BUCKETS.map((b) => ({
      label: b.label,
      count: talked.filter((r) => bucketTalk(r.duration_seconds)?.label === b.label).length,
    }));

    // ── How many astrologers a customer rings before giving up or connecting ──
    const perBooking = new Map();
    rows.forEach((r) => {
      if (!r.booking_id) return;
      const cur = perBooking.get(r.booking_id) || { rings: 0, connected: false };
      cur.rings += 1;
      if (r.answered_at) cur.connected = true;
      perBooking.set(r.booking_id, cur);
    });
    const attemptDistribution = [1, 2, 3, 4, 5].map((n) => ({
      rings: n === 5 ? '5+' : String(n),
      customers: [...perBooking.values()].filter((v) => (n === 5 ? v.rings >= 5 : v.rings === n)).length,
    }));

    // ── Per astrologer ──
    const byAstro = new Map();
    rows.forEach((r) => {
      if (!r.astrologer_id) return;
      const cur = byAstro.get(r.astrologer_id)
        || { id: r.astrologer_id, rings: 0, answered: 0, completed: 0, talkSeconds: 0, payout: 0 };
      cur.rings += 1;
      if (r.answered_at) cur.answered += 1;
      if (r.outcome === 'completed') cur.completed += 1;
      cur.talkSeconds += Number(r.duration_seconds) || 0;
      cur.payout += Number(r.payout_amount) || 0;
      byAstro.set(r.astrologer_id, cur);
    });
    const astroNames = await namesFor('astrologers', [...byAstro.keys()], 'id, first_name, last_name');
    const astrologers = [...byAstro.values()]
      .map((a) => {
        const n = astroNames.get(a.id);
        return {
          ...a,
          name: n ? `${n.first_name || ''} ${n.last_name || ''}`.trim() || 'Astrologer' : 'Deleted astrologer',
          // Answer rate is the number worth acting on: a pool member who never picks up
          // is costing the offer its best moment.
          answerRate: a.rings ? Math.round((a.answered / a.rings) * 100) : 0,
          avgTalkSeconds: a.answered ? Math.round(a.talkSeconds / a.answered) : 0,
        };
      })
      .sort((x, y) => y.rings - x.rings);

    // ── What came back: Shagun Arpan paid against these very sessions ──
    const sessionIds = rows.map((r) => r.session_id).filter(Boolean);
    let shagun = { count: 0, amount: 0 };
    for (const chunk of chunkIds(sessionIds)) {
      const { data: pays } = await db.from('dakshina_payments')
        .select('amount, status, session_id')
        .in('session_id', chunk)
        .eq('status', 'paid');
      (pays || []).forEach((p) => { shagun.count += 1; shagun.amount += Number(p.amount) || 0; });
    }

    const totalTalk = talked.reduce((a, r) => a + (Number(r.duration_seconds) || 0), 0);
    const payout = rows.reduce((a, r) => a + (Number(r.payout_amount) || 0), 0);

    return res.status(200).json({
      success: true,
      ready: true,
      days,
      // The DATABASE branch of the tree — everything here really happened.
      tree: {
        bookingsStarted: books.length,
        rings: rows.length,
        customersWhoRang: new Set(rows.map((r) => r.customer_id).filter(Boolean)).size,
        answered: answered.length,
        connected: talked.length,
        completed: completed.length,
        // A ring that produced no answer at all, by reason.
        cancelled: outcomes.cancelled || 0,
        missed: outcomes.missed || 0,
        rejected: outcomes.rejected || 0,
        tooShort: outcomes.too_short || 0,
        abandonedByAstrologer: outcomes.abandoned_by_astrologer || 0,
        stillRinging: outcomes.ringing || 0,
      },
      rates: {
        answerRate: rows.length ? Math.round((answered.length / rows.length) * 100) : 0,
        completionRate: answered.length ? Math.round((completed.length / answered.length) * 100) : 0,
        // Of the customers who started an attempt, how many ever got a real call.
        connectRate: perBooking.size
          ? Math.round(([...perBooking.values()].filter((v) => v.connected).length / perBooking.size) * 100)
          : 0,
      },
      talk: {
        totalSeconds: totalTalk,
        avgSeconds: avg(talked.map((r) => Number(r.duration_seconds) || 0)),
        buckets: talkBuckets,
      },
      endedBy: { ...endedBy, unknown: endedByUnknown },
      attemptDistribution,
      astrologers,
      money: {
        payout,
        shagunCount: shagun.count,
        shagunAmount: shagun.amount,
        // Not profit — the platform's share of Shagun is a fraction of this. Shown as
        // "came back" against "paid out" so the two are comparable at a glance.
        net: Number((shagun.amount - payout).toFixed(2)),
      },
      // The POSTHOG branch — clicks, including the ones that never reach the database.
      clicks,
    });
  }));

  /* ── One row per customer, with their own attempt timeline ────────────────── */
  app.get('/api/admin/free-call/analytics/customers', requireAdmin, h(async (req, res) => {
    const { days, sinceIso } = rangeFrom(req);
    if (!freeCallAttempts.isAvailable()) {
      return res.status(200).json({ success: true, days, ready: false, customers: [] });
    }
    const limit = Math.min(parseInt(req.query.limit, 10) || 100, 500);

    const { data: attempts } = await db.from(freeCallAttempts.TABLE)
      .select('id, customer_id, astrologer_id, session_id, attempt_no, outcome, ended_by, '
        + 'rang_at, answered_at, ended_at, duration_seconds, payout_amount')
      .gte('rang_at', sinceIso)
      .order('rang_at', { ascending: false })
      .limit(3000);

    const rows = attempts || [];
    const byCustomer = new Map();
    rows.forEach((r) => {
      if (!r.customer_id) return;
      const cur = byCustomer.get(r.customer_id) || { id: r.customer_id, attempts: [] };
      cur.attempts.push(r);
      byCustomer.set(r.customer_id, cur);
    });

    const [custNames, astroNames] = await Promise.all([
      namesFor('customers', [...byCustomer.keys()], 'id, name, mobile, acquisition_source, created_at'),
      namesFor('astrologers', rows.map((r) => r.astrologer_id), 'id, first_name, last_name'),
    ]);

    const customers = [...byCustomer.values()].map((c) => {
      const c0 = custNames.get(c.id);
      const talked = c.attempts.filter(hasDuration);
      return {
        customerId: c.id,
        // Deleted customers keep their attempts (the link goes NULL), so a name is not
        // guaranteed and the page must say so rather than rendering a blank row.
        name: c0?.name || 'Deleted customer',
        mobile: c0?.mobile || null,
        source: c0?.acquisition_source || null,
        signedUpAt: c0?.created_at || null,
        rings: c.attempts.length,
        answered: c.attempts.filter((a) => a.answered_at).length,
        talkSeconds: talked.reduce((a, r) => a + (Number(r.duration_seconds) || 0), 0),
        gotACall: talked.some((a) => a.outcome === 'completed'),
        lastAt: c.attempts[0]?.rang_at || null,
        timeline: c.attempts
          .slice()
          .sort((a, b) => new Date(a.rang_at) - new Date(b.rang_at))
          .map((a) => {
            const n = astroNames.get(a.astrologer_id);
            return {
              attemptNo: a.attempt_no,
              astrologer: n ? `${n.first_name || ''} ${n.last_name || ''}`.trim() || 'Astrologer' : 'Deleted astrologer',
              outcome: a.outcome,
              endedBy: a.ended_by,
              rangAt: a.rang_at,
              answeredAt: a.answered_at,
              endedAt: a.ended_at,
              durationSeconds: a.duration_seconds,
              payout: Number(a.payout_amount) || 0,
              // Seconds the astrologer's phone rang before it was answered or given up on.
              ringSeconds: a.rang_at && (a.answered_at || a.ended_at)
                ? Math.max(0, Math.round(
                  (new Date(a.answered_at || a.ended_at) - new Date(a.rang_at)) / 1000,
                ))
                : null,
            };
          }),
      };
    }).sort((a, b) => new Date(b.lastAt || 0) - new Date(a.lastAt || 0)).slice(0, limit);

    return res.status(200).json({ success: true, ready: true, days, customers });
  }));

  console.log('[freeCallAnalytics] routes registered under /api/admin/free-call/analytics');
};
