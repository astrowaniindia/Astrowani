// astrowani-backend/src/qrRoutes.js
//
// Admin reporting for the offline QR posters (Haridwar / Rishikesh, 2026-09).
//
// Each printed poster carries a Play Store link whose `referrer` names that poster
// (`utm_source=qr_<place>`). Android returns that string to the app via the Play
// Install Referrer API, and the app sends it with the signup that follows, landing in
// customers.acquisition_source. These routes read it back.
//
// WHAT THIS CAN AND CANNOT TELL YOU, because the difference matters when reading the
// numbers:
//   - SCANS are counted because the poster's QR now encodes our own short link
//     (GET /q/<source>, see qrTrackingRoutes.js), which logs the hit and then redirects
//     to the Play Store. Posters printed BEFORE that change point straight at the Play
//     Store and are not counted. Numbers are page hits, not people: "unique" is by a
//     hashed device fingerprint, approximate.
//   - INSTALLS that OPENED the app are counted (the app reports its first launch with
//     the install referrer). An install that never opens the app leaves no trace with us
//     — Play Console counts those.
//   - SIGNUPS and everything after them (recharges, sessions, revenue) ARE here, and
//     are the numbers Play Console cannot give you, because it has no idea which
//     installs became paying customers.
// So: Play Console for scan→install, this page for install→customer→revenue.
//
// Read-only over customer data. The only thing these routes write is the poster
// registry (labels/locations), which is a JSON blob in app_settings.

const { createClient } = require('@supabase/supabase-js');
const { requireAdmin } = require('./adminRoutes');
const { pagedSelect, chunkIds } = require('./pagedSelect');
const { QR_PREFIX, normalizeSource, isQrSource } = require('./acquisition');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://fxpoustnddrgumhwdcma.supabase.co';
const db = createClient(SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// The poster registry. Keyed by utm_source, so a poster can be created (and its link
// printed) before it has produced a single signup — otherwise a brand-new poster is
// invisible in the admin until someone installs from it, which is exactly when you
// most want to check it was set up right.
const REGISTRY_KEY = 'qr_poster_registry';

const h = (fn) => (req, res) => fn(req, res).catch((err) => {
  console.error(`[qr] ${req.method} ${req.path} error:`, err.message);
  res.status(500).json({ success: false, message: err.message || 'Server error' });
});

/** True when a read failed only because sql/acquisition_source.sql has not been run. */
function isMissingColumn(error) {
  if (!error) return false;
  return error.code === 'PGRST204'
    || error.code === '42703'
    || /could not find the .* column|column .* does not exist/i.test(error.message || '');
}

// ── Registry ─────────────────────────────────────────────────────────────────

async function readRegistry() {
  const { data, error } = await db
    .from('app_settings').select('value').eq('key', REGISTRY_KEY).maybeSingle();
  if (error) throw error;
  if (!data?.value) return {};
  try {
    const parsed = JSON.parse(data.value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch (_) {
    // Hand-edited into invalid JSON, or never written. An unreadable registry costs
    // labels, not data — every source still reports under its raw utm_source.
    console.warn('[qr] poster registry is not valid JSON — ignoring it');
    return {};
  }
}

async function writeRegistry(registry) {
  const { error } = await db.from('app_settings').upsert(
    { key: REGISTRY_KEY, value: JSON.stringify(registry), updated_at: new Date().toISOString() },
    { onConflict: 'key' },
  );
  if (error) throw error;
}

/**
 * Clean one registry entry. Every field is admin free-text, and all of it is rendered
 * back into the admin page, so it is bounded here rather than trusted.
 */
function sanitizeEntry(input = {}) {
  const str = (v, max) => (v == null ? '' : String(v).trim().slice(0, max));
  const entry = {
    label: str(input.label, 120),
    location: str(input.location, 200),
    city: str(input.city, 80),
    note: str(input.note, 500),
    placedAt: '',
    archived: !!input.archived,
    // "Deleted" is a soft state: the poster leaves the active list but keeps its name,
    // location and every number it earned, and can be restored. Nothing is ever erased.
    deleted: !!input.deleted,
    deletedAt: '',
  };
  if (entry.deleted) {
    entry.archived = true;
    const at = str(input.deletedAt, 40);
    entry.deletedAt = at && !Number.isNaN(Date.parse(at)) ? at : new Date().toISOString();
  }
  // Stored as a plain YYYY-MM-DD string — it is a "when did we put the poster up"
  // note an admin types, not a timestamp anything computes with.
  const placed = str(input.placedAt, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(placed)) entry.placedAt = placed;
  return entry;
}

// ── Metrics ──────────────────────────────────────────────────────────────────

/**
 * Every customer carrying a QR source, with the money and activity that followed.
 *
 * Paged and chunked throughout: `customers` will outgrow PostgREST's 1000-row cap, and
 * `.in()` on a large id list 414s long before that. See pagedSelect.js — a truncated
 * result here would under-report revenue while still looking like a real number.
 */
async function loadQrCustomers() {
  const { rows, truncated } = await pagedSelect(() =>
    db.from('customers')
      .select('id, name, mobile, created_at, wallet_balance, acquisition_source, acquisition_raw')
      .like('acquisition_source', `${QR_PREFIX}%`),
  );
  return { rows, truncated };
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

// A session claiming to run longer than this is a bookkeeping artifact, not talk time.
// Measured 2026-08-21: two zombie rows (is_active with next_billing_at NULL, closed ~50
// days later) held 99.2% of all recorded minutes. Same rule and same threshold as
// /api/admin/analytics/session-volume — excluded from MINUTES but still counted as a
// session, so a QR poster's consultation count stays honest either way.
const MAX_PLAUSIBLE_SESSION_MINUTES = 12 * 60;

/**
 * Consultation counts for a set of customers, keyed by customer id.
 *
 * chat_sessions has NO duration_minutes column — duration is derived from
 * ended_at - started_at. A session still in progress has no ended_at and contributes
 * 0 minutes while still counting as a session.
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

const emptyTotals = () => ({
  signups: 0,
  payingCustomers: 0,
  totalRecharged: 0,
  rechargeCount: 0,
  consultedCustomers: 0,
  sessions: 0,
  minutes: 0,
  walletBalance: 0,
  firstSignupAt: null,
  lastSignupAt: null,
});

/**
 * Scans / distinct scanners / installs-that-opened per source, from qr_funnel_counts().
 *
 * Never throws: if sql/qr_funnel_events.sql has not been run the funnel simply reads as
 * unavailable and the page keeps showing signups, which are unaffected.
 */
async function loadFunnel() {
  const { data, error } = await db.rpc('qr_funnel_counts');
  if (error) {
    // PGRST202 = function not found in the schema cache, 42883 = undefined function.
    if (error.code === 'PGRST202' || error.code === '42883' || /qr_funnel_counts/i.test(error.message || '')) {
      return { bySource: new Map(), missing: true };
    }
    console.error('[qr] funnel counts failed:', error.message);
    return { bySource: new Map(), missing: true };
  }
  const bySource = new Map();
  for (const r of data || []) {
    bySource.set(r.source, {
      scans: Number(r.scans) || 0,
      uniqueScans: Number(r.unique_scans) || 0,
      installsOpened: Number(r.installs) || 0,
    });
  }
  return { bySource, missing: false };
}
const emptyFunnel = () => ({ scans: 0, uniqueScans: 0, installsOpened: 0 });

module.exports = function registerQrRoutes(app) {
  // ── Overview: one row per poster ───────────────────────────────────────────
  //
  // The row set is the UNION of the registry and the sources actually seen in the
  // data. A registered poster with no signups yet must appear (it is how you confirm
  // the link was printed correctly), and a source appearing in the data that nobody
  // registered must also appear (otherwise a typo'd poster silently reports nothing
  // and looks like a dead location rather than a bad link).
  app.get('/api/admin/qr/sources', requireAdmin, h(async (req, res) => {
    const registry = await readRegistry();

    let customers = [];
    let truncated = false;
    try {
      const loaded = await loadQrCustomers();
      customers = loaded.rows;
      truncated = loaded.truncated;
    } catch (err) {
      if (!isMissingColumn(err)) throw err;
      // Migration not applied: the registry still renders, so an admin can create
      // posters and print links before the column exists. Everything reads zero, and
      // the flag below is what stops that being mistaken for "no one is scanning".
      return res.json({
        success: true,
        data: Object.entries(registry).map(([source, entry]) => ({
          source, ...entry, ...emptyTotals(), registered: true,
        })),
        migrationMissing: true,
        truncated: false,
      });
    }

    const funnel = await loadFunnel();

    const ids = customers.map((c) => c.id);
    const [{ byCustomer: recharges, truncated: rt }, { byCustomer: sessions, truncated: st }] =
      ids.length
        ? await Promise.all([loadRecharges(ids), loadSessions(ids)])
        : [{ byCustomer: new Map(), truncated: false }, { byCustomer: new Map(), truncated: false }];

    const bySource = new Map();
    for (const source of Object.keys(registry)) bySource.set(source, emptyTotals());
    // A source seen ONLY in scans or installs (nobody has signed up yet) must still
    // appear — it is how a typo'd or unregistered poster gets noticed.
    for (const source of funnel.bySource.keys()) if (!bySource.has(source)) bySource.set(source, emptyTotals());

    for (const c of customers) {
      const totals = bySource.get(c.acquisition_source) || emptyTotals();
      totals.signups += 1;
      totals.walletBalance += Number(c.wallet_balance) || 0;
      if (c.created_at) {
        if (!totals.firstSignupAt || c.created_at < totals.firstSignupAt) totals.firstSignupAt = c.created_at;
        if (!totals.lastSignupAt || c.created_at > totals.lastSignupAt) totals.lastSignupAt = c.created_at;
      }
      const r = recharges.get(c.id);
      if (r) {
        totals.payingCustomers += 1;
        totals.totalRecharged += r.total;
        totals.rechargeCount += r.count;
      }
      const s = sessions.get(c.id);
      if (s) {
        totals.consultedCustomers += 1;
        totals.sessions += s.count;
        totals.minutes += s.minutes;
      }
      bySource.set(c.acquisition_source, totals);
    }

    const data = [...bySource.entries()]
      .map(([source, totals]) => ({
        source,
        ...(registry[source] || { label: '', location: '', city: '', note: '', placedAt: '', archived: false }),
        ...totals,
        ...(funnel.bySource.get(source) || emptyFunnel()),
        // Derived from timestamps, so fractional — rounded once, here, rather than in
        // every consumer.
        minutes: Math.round(totals.minutes),
        registered: Object.prototype.hasOwnProperty.call(registry, source),
      }))
      .sort((a, b) => b.signups - a.signups || (b.scans || 0) - (a.scans || 0) || a.source.localeCompare(b.source));

    return res.json({
      success: true, data, truncated: truncated || rt || st, migrationMissing: false,
      funnelMissing: funnel.missing,
    });
  }));

  // ── One poster's customers ─────────────────────────────────────────────────
  app.get('/api/admin/qr/sources/:source', requireAdmin, h(async (req, res) => {
    const source = normalizeSource(req.params.source);
    if (!source || !isQrSource(source)) {
      return res.status(400).json({ success: false, message: `Not a QR source (must start with "${QR_PREFIX}")` });
    }

    let rows = [];
    try {
      const loaded = await pagedSelect(() =>
        db.from('customers')
          .select('id, name, mobile, created_at, wallet_balance, acquisition_raw')
          .eq('acquisition_source', source),
      );
      rows = loaded.rows;
    } catch (err) {
      if (!isMissingColumn(err)) throw err;
      return res.json({ success: true, source, data: [], migrationMissing: true });
    }

    const ids = rows.map((r) => r.id);
    const [{ byCustomer: recharges }, { byCustomer: sessions }] = ids.length
      ? await Promise.all([loadRecharges(ids), loadSessions(ids)])
      : [{ byCustomer: new Map() }, { byCustomer: new Map() }];

    const registry = await readRegistry();
    const funnel = await loadFunnel();

    const data = rows.map((c) => {
      const deleted = /^deleted:/.test(String(c.mobile || ''));
      const r = recharges.get(c.id);
      const s = sessions.get(c.id);
      return {
        id: c.id,
        name: c.name,
        // Same convention as the other admin customer tables: a soft-deleted account
        // keeps its row for the financial trail but must not hand its number back.
        mobile: deleted ? null : c.mobile,
        isDeleted: deleted,
        createdAt: c.created_at,
        walletBalance: Number(c.wallet_balance) || 0,
        totalRecharged: r?.total || 0,
        rechargeCount: r?.count || 0,
        firstRechargeAt: r?.firstAt || null,
        sessions: s?.count || 0,
        minutes: Math.round(s?.minutes || 0),
        lastSessionAt: s?.lastAt || null,
        referrer: c.acquisition_raw || null,
      };
    }).sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));

    return res.json({
      success: true,
      source,
      poster: registry[source] || null,
      funnel: funnel.bySource.get(source) || emptyFunnel(),
      funnelMissing: funnel.missing,
      data,
      migrationMissing: false,
    });
  }));

  // ── Create / update a poster ───────────────────────────────────────────────
  app.put('/api/admin/qr/sources/:source', requireAdmin, h(async (req, res) => {
    const source = normalizeSource(req.params.source);
    if (!source) return res.status(400).json({ success: false, message: 'Invalid source' });
    if (!isQrSource(source)) {
      // Enforced here, not just in the UI. The `qr_` prefix is the ONLY thing keeping
      // these posters distinguishable from Google Ads and organic Play traffic (see
      // src/acquisition.js); a poster registered without it would quietly never match.
      return res.status(400).json({
        success: false,
        message: `A QR source must start with "${QR_PREFIX}" so it can never be confused with Google Ads or organic installs.`,
      });
    }

    const registry = await readRegistry();
    registry[source] = sanitizeEntry({ ...(registry[source] || {}), ...(req.body || {}) });
    await writeRegistry(registry);
    return res.json({ success: true, source, poster: registry[source] });
  }));

  // ── Delete a poster ────────────────────────────────────────────────────────
  //
  // A SOFT delete: the poster is marked deleted (and archived) and keeps its name, location
  // and everything it brought in, so it can be looked at later or restored. It moves to the
  // "Archived & deleted" section of the page. Nothing is removed — not the registry entry,
  // not the customers' attribution, not the scan/install history — because the money those
  // customers spent is real and a poster's history should outlive the poster.
  //
  // The poster's link keeps working and keeps counting for as long as the printed code is
  // still on a wall; deleting it here does not switch the QR off.
  app.delete('/api/admin/qr/sources/:source', requireAdmin, h(async (req, res) => {
    const source = normalizeSource(req.params.source);
    if (!source) return res.status(400).json({ success: false, message: 'Invalid source' });

    const registry = await readRegistry();
    if (!Object.prototype.hasOwnProperty.call(registry, source)) {
      return res.status(404).json({ success: false, message: 'No such poster' });
    }
    registry[source] = sanitizeEntry({ ...registry[source], deleted: true, archived: true, deletedAt: new Date().toISOString() });
    await writeRegistry(registry);
    return res.json({ success: true, poster: registry[source] });
  }));
};
