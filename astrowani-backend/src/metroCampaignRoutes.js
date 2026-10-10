/**
 * The Metro campaign — its own switch and its own numbers.
 *
 * WHY THIS IS A SEPARATE SECTION AND NOT A FILTER ON THE MAIN FREE-CALL ANALYTICS
 * (owner, 2026-10-10). The instant free call has two completely different shapes:
 *
 *   • Everyone else (organic, QR posters, every other ad campaign) picks from a grid
 *     of whichever opted-in astrologers are free right now.
 *   • A Metro-campaign customer is shown ONE astrologer, chosen for them, and the
 *     screen is written to sell that one person.
 *
 * Averaging those together answers nothing: "answer rate" across both is a blend of a
 * pool of eight and a single named astrologer, and the campaign's own question — did
 * hand-picking one person make people call — disappears into it. So the campaign gets
 * its own panel, reading the same tables through a different lens.
 *
 * THE ANCHOR IS `customers.acquisition_source`. Every Metro customer carries the
 * campaign's source string (written once at signup from the Play install referrer, see
 * src/acquisition.js), so "a Metro customer" is a fact on their account rather than
 * something inferred from behaviour. Attempts, bookings and payments all join back to a
 * customer, which is what makes a campaign-scoped funnel possible at all.
 *
 * TEST NUMBERS ARE DELIBERATELY NOT COUNTED. `campaign_astrologer_routing.testMobiles`
 * routes a named phone to the campaign astrologer without a real referrer, which is how
 * the flow is exercised on an emulator. Those accounts have no campaign
 * acquisition_source, so they never enter these numbers — the panel reports the
 * campaign, not the testing of it.
 */
const { createClient } = require('@supabase/supabase-js');
const { requireAdmin } = require('./adminRoutes');
const postHog = require('./postHogRoutes');
const freeCallAttempts = require('./freeCallAttempts');
const freeCall = require('./freeCallRoutes');
const { chunkIds } = require('./pagedSelect');

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const h = (fn) => (req, res) => fn(req, res).catch((err) => {
  console.error(`[metroCampaign] ${req.method} ${req.path}:`, err.message);
  res.status(500).json({ success: false, message: 'Could not load the Metro campaign panel' });
});

/** 1..180 days, default 30. Same clamp as the other analytics routes. */
function rangeFrom(req) {
  const n = parseInt(req.query.days, 10);
  const days = Number.isFinite(n) && n > 0 ? Math.min(n, 180) : 30;
  return { days, sinceIso: new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString() };
}

/**
 * The pre-login reveal's own events.
 *
 * These fire BEFORE there is an account, so they cannot be scoped by
 * acquisition_source the way everything else here is — there is no customer yet to
 * carry it. They do not need to be: in production this screen is only ever reached by
 * an install whose referrer carries the campaign id (see utils/acquisition.js
 * isTargetCampaignFirstOpen), so the events are campaign-exclusive by construction.
 *
 * The one exception is a DEVELOPER's own machine, where App.js forces the reveal on
 * every signed-out cold start so it can be reviewed without a real referrer. PostHog's
 * ENV_FILTER already drops development traffic, so those never reach these counts.
 */
const REVEAL_EVENTS = [
  {
    event: 'campaign_gift_reveal_shown', step: 'reveal',
    label: 'The closed gift box appeared on the very first screen after install',
  },
  {
    event: 'campaign_gift_reveal_opened', step: 'reveal',
    label: 'Tapped the screen to open the gift box and reveal "YOU WIN — 11 minute free call"',
  },
  {
    event: 'campaign_gift_reveal_abandoned', step: 'reveal', drop: true,
    label: 'Closed or left the app WITHOUT ever tapping the gift box open',
  },
  {
    event: 'campaign_gift_reveal_accepted', step: 'reveal',
    label: 'Tapped the gold "Yes! I want my free call" button at the bottom',
  },
  {
    event: 'campaign_gift_reveal_closed', step: 'reveal', drop: true,
    label: 'Left the reveal screen without accepting — the ✕ at the top right',
  },
  {
    event: 'campaign_gift_reveal_collapsed', step: 'reveal', drop: true,
    label: 'Pressed the ✕ and watched the gift fold into the corner bubble (kept for later)',
  },
  {
    event: 'campaign_gift_bubble_tapped', step: 'bubble',
    label: 'Came back and tapped the gift bubble in the corner after pressing ✕ earlier',
  },
  {
    event: 'campaign_gift_bubble_claimed', step: 'bubble',
    label: 'Claimed the free call from that corner bubble',
  },
  {
    event: 'free_call_chosen_shown', step: 'chosen',
    label: 'Saw the chosen astrologer\'s card ("This astrologer has been chosen for you")',
  },
  {
    event: 'free_call_chosen_offline', step: 'chosen', drop: true,
    label: 'Reached the screen but the chosen astrologer was offline — a dead end',
  },
  {
    event: 'free_call_left_without_calling', step: 'chosen', drop: true,
    label: 'Left the chosen-astrologer screen without ringing anyone',
  },
];

/**
 * One HogQL round trip for the reveal funnel. Nulls rather than throwing when PostHog
 * is unconfigured — the database numbers beside these must always render.
 */
async function revealCounts(sinceIso) {
  if (!postHog.isConfigured()) return { available: false, reason: 'PostHog is not configured', events: [] };
  const names = REVEAL_EVENTS.map((e) => `'${e.event}'`).join(', ');
  // ${postHog.ENV_FILTER} is mandatory on every query in this codebase — production
  // only, from the analytics start date, minus excluded customers.
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
      events: REVEAL_EVENTS.map((e) => ({
        ...e,
        total: by.get(e.event)?.total || 0,
        people: by.get(e.event)?.people || 0,
      })),
    };
  } catch (err) {
    console.error('[metroCampaign] PostHog query failed:', err.message);
    return { available: false, reason: 'PostHog query failed', events: [] };
  }
}

/** The configured route, with the astrologer's real name resolved. */
async function describeConfig() {
  const cfg = await freeCall.loadCampaignRoutes();
  const route = cfg.routes[0] || null;
  let astrologer = null;
  if (route) {
    const { data } = await db
      .from('astrologers')
      .select('id, first_name, last_name, is_online, hidden_from_customers')
      .eq('id', route.astrologerId)
      .maybeSingle();
    astrologer = data
      ? {
        id: data.id,
        name: `${data.first_name || ''} ${data.last_name || ''}`.trim() || 'Astrologer',
        isOnline: data.is_online !== false,
        hidden: data.hidden_from_customers === true,
      }
      : { id: route.astrologerId, name: 'Astrologer not found', isOnline: false, hidden: false };
  }
  return {
    enabled: cfg.enabled,
    configured: !!route,
    source: route?.source || null,
    astrologer,
    testMobiles: cfg.testMobiles,
  };
}

const avg = (nums) => (nums.length ? Math.round(nums.reduce((a, b) => a + b, 0) / nums.length) : 0);
const hasDuration = (r) => r && r.duration_seconds !== null && r.duration_seconds !== undefined
  && Number.isFinite(Number(r.duration_seconds));

module.exports = function registerMetroCampaignRoutes(app) {
  /* ── The switch, and what it is pointed at ────────────────────────────────── */
  app.get('/api/admin/metro-campaign', requireAdmin, h(async (req, res) => {
    return res.status(200).json({ success: true, ...(await describeConfig()) });
  }));

  /**
   * Flip the switch. Writes `enabled` INTO the existing blob rather than replacing it,
   * so the routes and test numbers configured alongside it survive — turning the
   * campaign off must never lose which astrologer it was pointed at.
   */
  app.patch('/api/admin/metro-campaign', requireAdmin, h(async (req, res) => {
    if (typeof req.body?.enabled !== 'boolean') {
      return res.status(400).json({ success: false, message: 'enabled must be true or false' });
    }
    const key = freeCall.CAMPAIGN_ROUTING_KEY;
    const { data: row } = await db.from('app_settings').select('value').eq('key', key).maybeSingle();
    let parsed = {};
    try { parsed = row?.value ? JSON.parse(row.value) : {}; } catch (_) { parsed = {}; }
    // Refuse rather than silently writing a flag onto a config with nothing to route.
    // An admin switching this ON and seeing nothing change is worse than being told why.
    if (req.body.enabled && !(Array.isArray(parsed.routes) && parsed.routes.length)) {
      return res.status(409).json({
        success: false, code: 'NOT_CONFIGURED',
        message: 'No campaign astrologer is configured yet, so there is nothing to switch on.',
      });
    }
    const next = { ...parsed, enabled: req.body.enabled };
    const { error } = await db.from('app_settings')
      .upsert({ key, value: JSON.stringify(next) }, { onConflict: 'key' });
    if (error) throw new Error(error.message);
    // The resolver caches for 60s; without this the admin flips the switch and the app
    // keeps doing the old thing for up to a minute, which reads as the switch not working.
    freeCall.invalidateCampaignRoutes();
    console.log(`[metroCampaign] routing ${req.body.enabled ? 'ENABLED' : 'DISABLED'} by admin`);
    return res.status(200).json({ success: true, ...(await describeConfig()) });
  }));

  /* ── The campaign's own funnel ────────────────────────────────────────────── */
  app.get('/api/admin/metro-campaign/analytics', requireAdmin, h(async (req, res) => {
    const { days, sinceIso } = rangeFrom(req);
    const config = await describeConfig();

    if (!config.configured) {
      return res.status(200).json({
        success: true, days, ready: false, config,
        message: 'No campaign astrologer is configured, so there is nothing to report yet.',
      });
    }

    // Everyone who arrived from this campaign, ever — not just in the range. A customer
    // who installed two months ago and took their free call yesterday belongs in
    // yesterday's numbers, so the ATTEMPTS are what the date range filters, not the
    // signups. `signupsInRange` is reported separately for the install side.
    const customers = [];
    {
      const PAGE = 1000;
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await db
          .from('customers')
          .select('id, created_at')
          .eq('acquisition_source', config.source)
          .range(from, from + PAGE - 1);
        if (error) throw new Error(error.message);
        customers.push(...(data || []));
        if (!data || data.length < PAGE) break;
      }
    }
    const customerIds = customers.map((c) => c.id);
    const signupsInRange = customers.filter((c) => c.created_at && c.created_at >= sinceIso).length;

    if (!customerIds.length || !freeCallAttempts.isAvailable()) {
      return res.status(200).json({
        success: true, days, ready: true, config,
        totals: {
          customersTotal: customerIds.length,
          signupsInRange,
          rings: 0, customersWhoRang: 0, answered: 0, connected: 0, completed: 0,
        },
        rates: { claimRate: 0, answerRate: 0, completionRate: 0 },
        talk: { totalSeconds: 0, avgSeconds: 0 },
        money: { payout: 0, shagunCount: 0, shagunAmount: 0, net: 0 },
        outcomes: {},
        reveal: await revealCounts(sinceIso),
      });
    }

    // Attempts in range, by this campaign's customers. Chunked because the id list is
    // unbounded and PostgREST has a URL length limit — the same pattern the rest of the
    // analytics routes use.
    const rows = [];
    for (const chunk of chunkIds(customerIds)) {
      const { data, error } = await db
        .from(freeCallAttempts.TABLE)
        .select('id, booking_id, customer_id, astrologer_id, session_id, outcome, ended_by, '
          + 'rang_at, answered_at, duration_seconds, payout_amount')
        .in('customer_id', chunk)
        .gte('rang_at', sinceIso)
        .limit(5000);
      if (error) throw new Error(error.message);
      rows.push(...(data || []));
    }

    const answered = rows.filter((r) => r.answered_at);
    const talked = rows.filter(hasDuration);
    const completed = rows.filter((r) => r.outcome === 'completed');
    const outcomes = {};
    rows.forEach((r) => { outcomes[r.outcome] = (outcomes[r.outcome] || 0) + 1; });

    // Was the ring actually to the astrologer this campaign reserves? A mismatch means
    // the switch was off (or they fell through to the pool) when that call was made —
    // worth seeing rather than hiding, because it is the before/after of the toggle.
    const toChosen = rows.filter((r) => r.astrologer_id === config.astrologer?.id).length;

    // Shagun paid back against these very sessions.
    const sessionIds = rows.map((r) => r.session_id).filter(Boolean);
    const shagun = { count: 0, amount: 0 };
    for (const chunk of chunkIds(sessionIds)) {
      const { data: pays } = await db.from('dakshina_payments')
        .select('amount, status, session_id')
        .in('session_id', chunk)
        .eq('status', 'paid');
      (pays || []).forEach((p) => { shagun.count += 1; shagun.amount += Number(p.amount) || 0; });
    }

    const payout = rows.reduce((a, r) => a + (Number(r.payout_amount) || 0), 0);
    const customersWhoRang = new Set(rows.map((r) => r.customer_id).filter(Boolean)).size;

    return res.status(200).json({
      success: true,
      ready: true,
      days,
      config,
      totals: {
        customersTotal: customerIds.length,
        signupsInRange,
        rings: rows.length,
        ringsToChosenAstrologer: toChosen,
        customersWhoRang,
        answered: answered.length,
        connected: talked.length,
        completed: completed.length,
      },
      rates: {
        // Of the people this campaign signed up in the range, how many ever rang.
        claimRate: signupsInRange ? Math.round((customersWhoRang / signupsInRange) * 100) : 0,
        answerRate: rows.length ? Math.round((answered.length / rows.length) * 100) : 0,
        completionRate: answered.length ? Math.round((completed.length / answered.length) * 100) : 0,
      },
      talk: {
        totalSeconds: talked.reduce((a, r) => a + (Number(r.duration_seconds) || 0), 0),
        avgSeconds: avg(talked.map((r) => Number(r.duration_seconds) || 0)),
      },
      money: {
        payout,
        shagunCount: shagun.count,
        shagunAmount: shagun.amount,
        net: Number((shagun.amount - payout).toFixed(2)),
      },
      outcomes,
      reveal: await revealCounts(sinceIso),
    });
  }));

  console.log('[metroCampaign] routes registered under /api/admin/metro-campaign');
};
