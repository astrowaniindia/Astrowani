// astrowani-backend/src/acquisitionRoutes.js
//
// Where every customer came from, and what each channel is actually worth.
//
// SEPARATE FROM qrRoutes.js ON PURPOSE. That file answers a different question — one
// printed poster per physical location, with scan counts and a QR generator — and its
// customer query is deliberately scoped to `acquisition_source LIKE 'qr_%'`. This file
// covers EVERY channel (both Google Ads campaigns, organic Play, QR posters, unknown)
// and owns no registry. Neither file imports the other; duplicating the ~40 lines of
// aggregation is the cheaper trade against coupling two pages that will diverge.
//
// WHY THIS PAGE EXISTS. Google Ads reports installs and cost per install. On cost per
// install the original broad campaign (24260607071) wins every time — it buys installs
// at roughly Rs3.50 because Maximize-conversions finds the cheapest inventory there is.
// Measured over its first 15 days: 1,727 installs, 22 recharges, a 1.27% recharge rate.
// So the number Google shows most prominently is the one most likely to point the wrong
// way. The columns below are the counter-measure: activation and revenue per signup.
//
// ATTRIBUTION CHAIN. customers.acquisition_source is written at signup by
// src/acquisition.js from the Play Install Referrer. Google Ads referrers carry
// `gad_campaignid` (not utm_source — see the note at the top of that file), parsed into
// `google_ads_<campaignId>`, so each campaign is its own row here with no extra tagging.
//
// A NULL source means UNKNOWN, never organic: every iOS customer, every sideload, and
// everyone who signed up before the build carrying the native install-referrer module.
// It is reported as its own row and must not be folded into organic.

const { createClient } = require('@supabase/supabase-js');
const { requireAdmin } = require('./adminRoutes');
const { pagedSelect, chunkIds } = require('./pagedSelect');
const { channelOf, campaignIdOf, isQrSource } = require('./acquisition');

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const h = (fn) => (req, res) => fn(req, res).catch((err) => {
  console.error('[acquisition]', err);
  res.status(500).json({ success: false, error: 'Something went wrong' });
});

// The key used for customers with no acquisition_source at all. Not a real source, so
// it is kept distinct from any string a referrer could produce.
const UNKNOWN = '(unknown)';

// A session claiming to run longer than this is a bookkeeping artifact, not talk time.
// Same rule and threshold as /api/admin/analytics/session-volume and the QR page:
// excluded from MINUTES but still counted as a session, so consultation counts stay
// honest either way. (Measured 2026-08-21: two zombie rows held 99.2% of all minutes.)
const MAX_PLAUSIBLE_SESSION_MINUTES = 12 * 60;

// Friendly names for the sources we already know about. Anything not listed renders
// under its raw key, which is what makes a new campaign visible the day it launches
// rather than silently missing.
const LABELS = {
  google_ads_24260607071: 'Google Ads — original broad campaign',
  google_ads_24326942598: 'Google Ads — metro affluent (11 min call)',
  'google-play': 'Organic — Play Store browse',
  google: 'Organic — Google search',
  notset: 'Play referrer not set',
  [UNKNOWN]: 'Unknown — iOS, sideload, or pre-referrer build',
};

function clampDays(v) {
  const n = Number.parseInt(v, 10);
  if (!Number.isFinite(n)) return 30;
  return Math.min(730, Math.max(1, n));
}

const emptyTotals = () => ({
  signups: 0,
  consultedCustomers: 0,
  sessions: 0,
  minutes: 0,
  payingCustomers: 0,
  totalRecharged: 0,
  rechargeCount: 0,
  walletBalance: 0,
  firstSignupAt: null,
  lastSignupAt: null,
});

/** Every customer created in the window, across all channels. */
async function loadCustomers(sinceIso) {
  return pagedSelect(() =>
    db.from('customers')
      .select('id, name, mobile, created_at, wallet_balance, acquisition_source')
      .gte('created_at', sinceIso),
  );
}

/** Paid recharges for a set of customers, keyed by customer id. */
async function loadRecharges(ids) {
  const byCustomer = new Map();
  let truncated = false;
  for (const chunk of chunkIds(ids)) {
    const { rows, truncated: t } = await pagedSelect(() =>
      db.from('wallet_recharges')
        .select('customer_id, amount, paid_at')
        .eq('status', 'paid')
        .in('customer_id', chunk),
    );
    truncated = truncated || t;
    for (const r of rows) {
      const e = byCustomer.get(r.customer_id) || { total: 0, count: 0, firstAt: null };
      e.total += Number(r.amount) || 0;
      e.count += 1;
      if (r.paid_at && (!e.firstAt || r.paid_at < e.firstAt)) e.firstAt = r.paid_at;
      byCustomer.set(r.customer_id, e);
    }
  }
  return { byCustomer, truncated };
}

/**
 * Consultation counts, keyed by customer id.
 *
 * chat_sessions has NO duration_minutes column — duration is ended_at - started_at. A
 * session still in progress has no ended_at and contributes 0 minutes while still
 * counting as a session.
 */
async function loadSessions(ids) {
  const byCustomer = new Map();
  let truncated = false;
  for (const chunk of chunkIds(ids)) {
    const { rows, truncated: t } = await pagedSelect(() =>
      db.from('chat_sessions')
        .select('caller_id, started_at, ended_at')
        .in('caller_id', chunk),
    );
    truncated = truncated || t;
    for (const s of rows) {
      const e = byCustomer.get(s.caller_id) || { count: 0, minutes: 0, lastAt: null };
      e.count += 1;
      if (s.started_at && s.ended_at) {
        const mins = Math.max(0, (new Date(s.ended_at) - new Date(s.started_at)) / 60000);
        if (mins <= MAX_PLAUSIBLE_SESSION_MINUTES) e.minutes += mins;
      }
      if (s.started_at && (!e.lastAt || s.started_at > e.lastAt)) e.lastAt = s.started_at;
      byCustomer.set(s.caller_id, e);
    }
  }
  return { byCustomer, truncated };
}

function decorate(source, totals) {
  const real = source === UNKNOWN ? null : source;
  return {
    source,
    label: LABELS[source] || source,
    channel: channelOf(real),
    campaignId: campaignIdOf(real),
    isQr: isQrSource(real),
    ...totals,
    // Derived here rather than in the page so the script, the API and the UI cannot
    // disagree on what "revenue per signup" means.
    revenuePerSignup: totals.signups ? totals.totalRecharged / totals.signups : 0,
    activationRate: totals.signups ? totals.consultedCustomers / totals.signups : 0,
    payingRate: totals.signups ? totals.payingCustomers / totals.signups : 0,
  };
}

module.exports = function registerAcquisitionRoutes(app) {
  // ── Overview: one row per acquisition source ───────────────────────────────
  app.get('/api/admin/acquisition/sources', requireAdmin, h(async (req, res) => {
    const days = clampDays(req.query.days);
    const sinceIso = new Date(Date.now() - days * 86400000).toISOString();

    const { rows: customers, truncated: ct } = await loadCustomers(sinceIso);
    const ids = customers.map((c) => c.id);
    const [{ byCustomer: recharges, truncated: rt }, { byCustomer: sessions, truncated: st }] =
      ids.length
        ? await Promise.all([loadRecharges(ids), loadSessions(ids)])
        : [{ byCustomer: new Map(), truncated: false }, { byCustomer: new Map(), truncated: false }];

    const bySource = new Map();
    for (const c of customers) {
      const key = c.acquisition_source || UNKNOWN;
      const t = bySource.get(key) || emptyTotals();
      t.signups += 1;
      t.walletBalance += Number(c.wallet_balance) || 0;
      if (c.created_at) {
        if (!t.firstSignupAt || c.created_at < t.firstSignupAt) t.firstSignupAt = c.created_at;
        if (!t.lastSignupAt || c.created_at > t.lastSignupAt) t.lastSignupAt = c.created_at;
      }
      const r = recharges.get(c.id);
      if (r) { t.payingCustomers += 1; t.totalRecharged += r.total; t.rechargeCount += r.count; }
      const s = sessions.get(c.id);
      if (s) { t.consultedCustomers += 1; t.sessions += s.count; t.minutes += s.minutes; }
      bySource.set(key, t);
    }

    const data = [...bySource.entries()]
      .map(([source, totals]) => decorate(source, totals))
      .sort((a, b) => b.signups - a.signups);

    res.json({
      success: true,
      days,
      data,
      // Surfaced so a capped read is never mistaken for a quiet channel.
      truncated: ct || rt || st,
    });
  }));

  // ── Drill-down: the customers behind one source ────────────────────────────
  app.get('/api/admin/acquisition/sources/:source', requireAdmin, h(async (req, res) => {
    const days = clampDays(req.query.days);
    const sinceIso = new Date(Date.now() - days * 86400000).toISOString();
    const wanted = String(req.params.source || '');

    const { rows: all, truncated: ct } = await loadCustomers(sinceIso);
    const customers = all.filter((c) => (c.acquisition_source || UNKNOWN) === wanted);
    const ids = customers.map((c) => c.id);
    const [{ byCustomer: recharges }, { byCustomer: sessions }] =
      ids.length
        ? await Promise.all([loadRecharges(ids), loadSessions(ids)])
        : [{ byCustomer: new Map() }, { byCustomer: new Map() }];

    const data = customers
      .map((c) => {
        const r = recharges.get(c.id) || { total: 0, count: 0 };
        const s = sessions.get(c.id) || { count: 0, minutes: 0 };
        return {
          id: c.id,
          name: c.name || null,
          mobile: c.mobile || null,
          createdAt: c.created_at,
          walletBalance: Number(c.wallet_balance) || 0,
          totalRecharged: r.total,
          rechargeCount: r.count,
          sessions: s.count,
          minutes: Math.round(s.minutes),
        };
      })
      .sort((a, b) => (b.totalRecharged - a.totalRecharged)
        || String(b.createdAt).localeCompare(String(a.createdAt)));

    res.json({ success: true, days, source: wanted, data, truncated: ct });
  }));

  // ── Per-customer activity timeline: what one signup actually did ──────────
  app.get('/api/admin/acquisition/customers/:id/activity', requireAdmin, h(async (req, res) => {
    const customerId = String(req.params.id || '');

    const [customerRes, callsRes, chatsRes, sessionsRes, rechargesRes, ordersRes] = await Promise.all([
      db.from('customers').select('id, name, mobile, created_at, acquisition_source').eq('id', customerId).maybeSingle(),
      db.from('call_requests').select('id, astrologer_id, status, created_at, responded_at, customer_resolved_at').eq('customer_id', customerId),
      db.from('chat_requests').select('id, receiver_id, status, created_at, responded_at, customer_resolved_at').eq('caller_id', customerId),
      db.from('chat_sessions').select('id, vendor_id, started_at, ended_at').eq('caller_id', customerId),
      db.from('wallet_recharges').select('id, amount, status, created_at, paid_at').eq('customer_id', customerId),
      db.from('orders').select('id, item_title, grand_total, status, payment_status, created_at').eq('customer_id', customerId),
    ]);

    if (customerRes.error) throw customerRes.error;
    if (!customerRes.data) return res.status(404).json({ success: false, error: 'Customer not found' });

    const astroIds = new Set();
    for (const r of callsRes.data || []) if (r.astrologer_id) astroIds.add(r.astrologer_id);
    for (const r of sessionsRes.data || []) if (r.vendor_id) astroIds.add(r.vendor_id);
    const astroNames = new Map();
    if (astroIds.size) {
      const { data: astros } = await db.from('astrologers').select('id, first_name, last_name').in('id', [...astroIds]);
      for (const a of astros || []) {
        astroNames.set(a.id, [a.first_name, a.last_name].filter(Boolean).join(' ') || null);
      }
    }
    const astroLabel = (id) => (id ? astroNames.get(id) || `astrologer ${String(id).slice(0, 8)}` : null);

    const events = [];
    events.push({ at: customerRes.data.created_at, type: 'signup', label: 'Signed up' });

    // One plain-English line per request, not a raw status code the admin has to decode.
    // 'cancelled' and 'missed' are BOTH set only by the customer's own app (see
    // CUSTOMER_SETTABLE_REQUEST_STATUSES above / CLAUDE.md "Call Cancellation Sync") — an
    // astrologer never produces either value, so every request that ends this way was the
    // customer backing out, not the astrologer declining. Spell that out here so nobody has
    // to go read the code (or ask) to find out who actually did what — INCLUDING how long it
    // rang before that happened, which is why this also reads `customer_resolved_at`
    // (set only on a customer-initiated cancel/timeout — see sql/request_customer_resolved_at.sql
    // for why that is a separate column from `responded_at`, which astrologerMetrics.js uses
    // for the astrologer's own response-time leaderboard number).
    const ringDuration = (createdAt, resolvedAt) => {
      if (!createdAt || !resolvedAt) return '';
      const secs = Math.round((new Date(resolvedAt).getTime() - new Date(createdAt).getTime()) / 1000);
      if (!Number.isFinite(secs) || secs < 0) return '';
      if (secs < 60) return ` after ${secs}s`;
      return ` after ${Math.floor(secs / 60)}m ${secs % 60}s`;
    };

    const outcomeLabel = (noun, who, status, createdAt, respondedAt, customerResolvedAt) => {
      switch (status) {
        case 'pending': return `${noun} ${who} — still ringing, no answer yet`;
        case 'accepted': return `${noun} ${who} — picked up${ringDuration(createdAt, respondedAt)}, it connected`;
        case 'rejected': return `${noun} ${who} — the astrologer declined${ringDuration(createdAt, respondedAt)}, it never connected`;
        case 'cancelled': return `${noun} ${who} — the CUSTOMER cancelled${ringDuration(createdAt, customerResolvedAt)}, before the astrologer answered; it never connected`;
        case 'missed': return `${noun} ${who} — nobody answered${ringDuration(createdAt, customerResolvedAt)} and it auto-expired; it never connected`;
        default: return `${noun} ${who} — ${status}`;
      }
    };

    for (const r of callsRes.data || []) {
      events.push({
        at: r.responded_at || r.customer_resolved_at || r.created_at,
        type: 'call_requested',
        label: outcomeLabel('Called', astroLabel(r.astrologer_id), r.status, r.created_at, r.responded_at, r.customer_resolved_at),
      });
    }

    for (const r of chatsRes.data || []) {
      events.push({
        at: r.responded_at || r.customer_resolved_at || r.created_at,
        type: 'chat_requested',
        label: outcomeLabel('Messaged', astroLabel(r.receiver_id), r.status, r.created_at, r.responded_at, r.customer_resolved_at),
      });
    }

    for (const s of sessionsRes.data || []) {
      events.push({
        at: s.started_at,
        type: 'session_started',
        label: `Consultation with ${astroLabel(s.vendor_id)} started`,
      });
      if (s.ended_at) {
        const mins = s.started_at
          ? Math.round(Math.max(0, (new Date(s.ended_at) - new Date(s.started_at)) / 60000))
          : null;
        events.push({
          at: s.ended_at,
          type: 'session_ended',
          label: `Consultation with ${astroLabel(s.vendor_id)} ended${mins != null ? ` (${mins} min)` : ''}`,
        });
      }
    }

    for (const r of rechargesRes.data || []) {
      events.push({
        at: r.created_at,
        type: 'recharge_attempted',
        label: `Started a wallet recharge of ₹${r.amount} — status: ${r.status}`,
      });
      if (r.paid_at && r.status === 'paid') {
        events.push({ at: r.paid_at, type: 'recharge_paid', label: `Wallet recharge of ₹${r.amount} succeeded` });
      }
    }

    for (const o of ordersRes.data || []) {
      events.push({
        at: o.created_at,
        type: 'order_placed',
        label: `Placed an order: ${o.item_title || 'item'} — ₹${o.grand_total} (${o.payment_status || o.status})`,
      });
    }

    events.sort((a, b) => String(a.at).localeCompare(String(b.at)));

    res.json({
      success: true,
      customer: {
        id: customerRes.data.id,
        name: customerRes.data.name,
        mobile: customerRes.data.mobile,
        acquisitionSource: customerRes.data.acquisition_source,
      },
      events,
    });
  }));
};
