// astrowani-backend/src/consultationRoutes.js
//
// The admin's record of what actually happened in a consultation: who talked to whom,
// for how long, what the customer paid, what the ASTROLOGER earned from it, what the
// platform kept — and, for chat, the transcript itself.
//
// WHERE THE MONEY NUMBERS COME FROM, and why they are not read off `chat_sessions`:
// that table has no `total_charged` and no `duration_minutes` column (measured against
// production 2026-10-02 — the old admin Sessions page rendered `r.total_charged ?? 0`
// and therefore showed a hardcoded-looking 0 on every row). Every rupee is summed from
// the three ledgers `process_session_billing` writes, all of which carry `session_id`:
//
//   customer paid   -> wallet_transactions        (type 'debit')
//   astrologer got  -> vendor_wallet_transactions (type 'credit')   50% since 2026-09-30
//   platform kept   -> admin_wallet_transactions                    the other 50%
//
// Summing the ledger rather than multiplying rate x duration is deliberate: the ledger
// is what was really moved, so a paused minute, a failed billing tick or a changed
// split shows up here as the truth instead of as a plausible-looking estimate.

const { createClient } = require('@supabase/supabase-js');
const { isUuid } = require('./pgrstFilter');

const db = createClient(
  process.env.SUPABASE_URL || 'https://fxpoustnddrgumhwdcma.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const isMissingTable = (e) => ['PGRST205', '42P01'].includes(String(e?.code || ''));

// The Apple/Play Store reviewer logs into BOTH apps with this one fixed phone number
// (PLAY_STORE_REVIEWER_PHONE in index.js, memory: store-reviewer-accounts) -- "Test User"
// on the customer side, "Play Store Reviewer" on the astrologer side. Their test sessions
// are real rows in chat_sessions and the ledgers, so they show up here exactly like a real
// consultation unless explicitly filtered out. Default behaviour is to hide them; the admin
// page has a toggle (?includeTest=1) for the rare case of checking the reviewer account
// itself isn't misbehaving.
const REVIEWER_PHONE = '9999999999';
const isTestParticipant = (astro, cust) =>
  String(astro?.phone_number || '') === REVIEWER_PHONE || String(cust?.mobile || '') === REVIEWER_PHONE;

// A session whose `ended_at` is more than this after `started_at` never really ran that
// long — it is a zombie row the abandon sweep did not close. Same 12-hour cutoff the
// analytics session-volume route uses, so the two pages cannot disagree.
const MAX_PLAUSIBLE_SESSION_MS = 12 * 60 * 60 * 1000;

const DEFAULT_RETENTION_DAYS = 7;

const astroName = (a) =>
  `${a?.first_name || ''} ${a?.last_name || ''}`.trim() || 'Astrologer';

function durationMinutes(startedAt, endedAt) {
  if (!startedAt || !endedAt) return null;
  const ms = new Date(endedAt) - new Date(startedAt);
  if (!(ms > 0) || ms > MAX_PLAUSIBLE_SESSION_MS) return null;
  return Math.round((ms / 60000) * 10) / 10;
}

function chunk(ids, size = 100) {
  const out = [];
  for (let i = 0; i < ids.length; i += size) out.push(ids.slice(i, i + size));
  return out;
}

/** Sum `amount` per session_id across a ledger table, for the given session ids. */
async function sumBySession(table, sessionIds, { type } = {}) {
  const totals = new Map();
  if (!sessionIds.length) return totals;
  for (const ids of chunk(sessionIds)) {
    let q = db.from(table).select('session_id, amount, type').in('session_id', ids);
    if (type) q = q.eq('type', type);
    const { data, error } = await q;
    if (error) {
      if (isMissingTable(error)) return totals;
      throw error;
    }
    for (const r of data || []) {
      totals.set(r.session_id, (totals.get(r.session_id) || 0) + (Number(r.amount) || 0));
    }
  }
  return totals;
}

/** How many chat messages each session holds, and when the last one was. */
async function messageStats(sessionIds) {
  const stats = new Map();
  if (!sessionIds.length) return stats;
  for (const ids of chunk(sessionIds)) {
    const { data, error } = await db
      .from('chat_messages')
      .select('session_id, created_at')
      .in('session_id', ids);
    if (error) {
      if (isMissingTable(error)) return stats;
      throw error;
    }
    for (const m of data || []) {
      const s = stats.get(m.session_id) || { count: 0, lastAt: null };
      s.count += 1;
      if (!s.lastAt || m.created_at > s.lastAt) s.lastAt = m.created_at;
      stats.set(m.session_id, s);
    }
  }
  return stats;
}

/** Session ids that carry at least one off-platform-contact flag. */
async function flaggedSessionIds(sessionIds) {
  const flagged = new Set();
  if (!sessionIds.length) return flagged;
  for (const ids of chunk(sessionIds)) {
    const { data, error } = await db.from('session_flags').select('session_id').in('session_id', ids);
    if (error) {
      if (isMissingTable(error)) return flagged; // flags table not deployed -- nothing is exempt
      throw error;
    }
    for (const f of data || []) if (f.session_id) flagged.add(f.session_id);
  }
  return flagged;
}

// ── Chat retention ─────────────────────────────────────────────────────────────
// Off by default, and it stays off until an admin turns it on in the dashboard. This
// deletes customer conversations permanently and there are no database backups
// (Supabase Free), so a deploy must never start erasing history on its own.

async function retentionConfig() {
  let enabled = false;
  let days = DEFAULT_RETENTION_DAYS;
  let keepFlagged = true;
  try {
    const { data } = await db
      .from('app_settings')
      .select('key, value')
      .in('key', ['chat_retention_enabled', 'chat_retention_days', 'chat_retention_keep_flagged']);
    for (const r of data || []) {
      const v = String(r.value ?? '').replace(/"/g, '');
      if (r.key === 'chat_retention_enabled') enabled = v === 'true';
      if (r.key === 'chat_retention_days') {
        const n = Number(v);
        // A 0 or junk value must not be read as "delete everything, right now".
        if (Number.isFinite(n) && n >= 1) days = Math.min(Math.round(n), 3650);
      }
      if (r.key === 'chat_retention_keep_flagged') keepFlagged = v !== 'false';
    }
  } catch (_) { /* unreadable settings -> stay off */ }
  return { enabled, days, keepFlagged };
}

const cutoffFor = (days) => new Date(Date.now() - days * 86400000).toISOString();

/**
 * Delete chat messages older than the retention window.
 *
 * `keepFlagged` exempts any session that an off-platform-contact flag points at. The
 * flag itself keeps its own copy of the offending sentence (`session_flags.excerpt`),
 * but the admin's "view proof" panel shows the SURROUNDING conversation, and that lives
 * only in `chat_messages` — purging it would leave every flag older than the window
 * without the context that makes it actionable.
 *
 * Returns { deleted, scanned, cutoff, skippedFlagged }. Never throws.
 */
async function purgeOldChatMessages({ force = false, limit = 5000 } = {}) {
  const cfg = await retentionConfig();
  if (!cfg.enabled && !force) return { deleted: 0, scanned: 0, skipped: 'disabled' };

  const cutoff = cutoffFor(cfg.days);
  let deleted = 0;
  let scanned = 0;
  let skippedFlagged = 0;

  try {
    // Page through oldest-first in batches so one run cannot build a delete list of
    // tens of thousands of ids, and so an interrupted run simply resumes next hour.
    for (let batch = 0; batch < Math.ceil(limit / 500); batch += 1) {
      const { data, error } = await db
        .from('chat_messages')
        .select('id, session_id')
        .lt('created_at', cutoff)
        .order('created_at', { ascending: true })
        .limit(500);
      if (error) {
        if (isMissingTable(error)) break;
        throw error;
      }
      if (!data || !data.length) break;
      scanned += data.length;

      let doomed = data;
      if (cfg.keepFlagged) {
        const flagged = await flaggedSessionIds([...new Set(data.map((m) => m.session_id).filter(Boolean))]);
        doomed = data.filter((m) => !(m.session_id && flagged.has(m.session_id)));
        skippedFlagged += data.length - doomed.length;
      }

      // Everything in this page was exempt. Another identical page would come back
      // forever, so stop rather than spin.
      if (!doomed.length) break;

      const { error: delErr } = await db.from('chat_messages').delete().in('id', doomed.map((m) => m.id));
      if (delErr) throw delErr;
      deleted += doomed.length;

      if (data.length < 500) break;
    }
  } catch (e) {
    console.error('[chat-retention] purge failed:', e.message);
  }

  if (deleted) {
    console.log(`[chat-retention] deleted ${deleted} message(s) older than ${cfg.days}d (kept ${skippedFlagged} flagged)`);
  }
  return { deleted, scanned, skippedFlagged, cutoff, days: cfg.days };
}

module.exports = function registerConsultationRoutes(app) {
  const { requireAdmin } = require('./adminRoutes');
  const h = (fn) => (req, res) =>
    Promise.resolve(fn(req, res)).catch((e) => {
      console.error('[consultations]', e.message);
      res.status(500).json({ success: false, message: 'Request failed' });
    });

  const timer = setInterval(() => { purgeOldChatMessages(); }, 60 * 60 * 1000);
  if (timer.unref) timer.unref();

  // ── The session record ───────────────────────────────────────────────────────
  // One PAGE at a time. Filtering, search, sort and the totals all run in the
  // database over the whole period (sql/admin_consultations_rpc.sql). This used to
  // load the newest 500 rows and do the rest in the browser, so every period read
  // "500 sessions" and every total was the total of those 500 only.
  const TYPES = new Set(['all', 'chat', 'audio', 'video']);
  const STATUSES = new Set(['all', 'live', 'ended', 'paid', 'zero', 'flagged', 'connectivity']);
  const SORTS = new Set(['startedAt', 'astrologer', 'customer', 'durationMinutes', 'customerPaid', 'astrologerEarned', 'platformKept', 'messageCount']);

  app.get('/api/admin/consultations', requireAdmin, h(async (req, res) => {
    const days = req.query.days === 'all' ? null : Math.min(Number(req.query.days) || 30, 3650);
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
    const page = Math.max(Math.floor(Number(req.query.page)) || 1, 1);
    const type = TYPES.has(req.query.type) ? req.query.type : 'all';
    const status = STATUSES.has(req.query.status) ? req.query.status : 'all';
    const sort = SORTS.has(req.query.sort) ? req.query.sort : 'startedAt';
    const dir = req.query.dir === 'asc' ? 'asc' : 'desc';
    const search = String(req.query.search || '').trim().slice(0, 80) || null;
    const includeTest = req.query.includeTest === '1';
    const astrologerId = req.query.astrologerId ? String(req.query.astrologerId) : null;
    if (astrologerId && !isUuid(astrologerId)) {
      return res.status(400).json({ success: false, message: 'Bad astrologer id' });
    }

    const { data: out, error } = await db.rpc('admin_consultations', {
      p_since: days ? new Date(Date.now() - days * 86400000).toISOString() : null,
      p_type: type,
      p_status: status,
      p_search: search,
      p_include_test: includeTest,
      p_sort: sort,
      p_dir: dir,
      p_limit: limit,
      p_offset: (page - 1) * limit,
      p_astrologer: astrologerId,
    });
    if (error) throw error;

    const total = Number(out?.total || 0);
    return res.json({
      success: true,
      data: out?.rows || [],
      total,
      page,
      limit,
      pages: Math.max(1, Math.ceil(total / limit)),
      summary: out?.summary || { sessions: 0, minutes: 0, paid: 0, earned: 0, kept: 0 },
      testCount: Number(out?.testCount || 0),
      windowDays: days,
      includeTest,
    });
  }));

  // ── One astrologer's full history (Astrologers Directory -> Details) ─────────
  app.get('/api/admin/astrologers/:id/history-summary', requireAdmin, h(async (req, res) => {
    const id = req.params.id;
    if (!isUuid(id)) return res.status(400).json({ success: false, message: 'Bad astrologer id' });
    const [{ data: sum, error }, { data: astro, error: aErr }] = await Promise.all([
      db.rpc('admin_astrologer_ledger_summary', { p_vendor: id }),
      db.from('astrologers').select('wallet_balance, today_earnings, total_earnings').eq('id', id).maybeSingle(),
    ]);
    if (error) throw error;
    if (aErr) throw aErr;
    if (!astro) return res.status(404).json({ success: false, message: 'Astrologer not found' });
    return res.json({
      success: true,
      data: {
        ...(sum || {}),
        walletBalance: Number(astro.wallet_balance || 0),
        todayEarnings: Number(astro.today_earnings || 0),
        totalEarnings: Number(astro.total_earnings || 0),
      },
    });
  }));

  // Every wallet movement, newest first, one page at a time.
  app.get('/api/admin/astrologers/:id/transactions', requireAdmin, h(async (req, res) => {
    const id = req.params.id;
    if (!isUuid(id)) return res.status(400).json({ success: false, message: 'Bad astrologer id' });
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
    const page = Math.max(Math.floor(Number(req.query.page)) || 1, 1);
    const from = (page - 1) * limit;
    let q = db
      .from('vendor_wallet_transactions')
      .select('id, type, amount, description, session_id, request_id, customer_id, created_at', { count: 'exact' })
      .eq('vendor_id', id)
      .order('created_at', { ascending: false })
      .range(from, from + limit - 1);
    if (req.query.type === 'credit' || req.query.type === 'debit') q = q.eq('type', req.query.type);
    const { data: txns, error, count } = await q;
    if (error) throw error;
    const rows = txns || [];

    // Name the customer and the kind of session, so a row reads
    // "Chat · Akshara" rather than a bare billing description.
    const sessionIds = [...new Set(rows.map((t) => t.session_id).filter(Boolean))];
    const sessions = new Map();
    for (const c of chunk(sessionIds)) {
      const { data, error: sErr } = await db.from('chat_sessions').select('id, call_type, caller_id, is_free').in('id', c);
      if (sErr) throw sErr;
      for (const s of data || []) sessions.set(s.id, s);
    }
    const custIds = [...new Set([
      ...rows.map((t) => t.customer_id),
      ...[...sessions.values()].map((s) => s.caller_id),
    ].filter(Boolean))];
    const custs = new Map();
    for (const c of chunk(custIds)) {
      const { data, error: cErr } = await db.from('customers').select('id, name').in('id', c);
      if (cErr) throw cErr;
      for (const u of data || []) custs.set(u.id, u);
    }

    const data = rows.map((t) => {
      const s = t.session_id ? sessions.get(t.session_id) : null;
      const custId = t.customer_id || s?.caller_id || null;
      return {
        id: t.id,
        type: t.type,
        amount: Number(t.amount) || 0,
        description: t.description || '',
        at: t.created_at,
        sessionId: t.session_id,
        sessionType: s ? (s.call_type === 'voice' ? 'audio' : (s.call_type || 'chat')) : null,
        isFree: !!s?.is_free,
        withdrawalId: t.request_id || null,
        customer: custId ? (custs.get(custId)?.name || 'Customer') : null,
      };
    });
    const total = count || 0;
    return res.json({ success: true, data, total, page, limit, pages: Math.max(1, Math.ceil(total / limit)) });
  }));

  // Withdrawal requests. Bank details are left out on purpose: they belong on the
  // Payout Requests page, where a withdrawal is actually processed.
  app.get('/api/admin/astrologers/:id/withdrawals', requireAdmin, h(async (req, res) => {
    const id = req.params.id;
    if (!isUuid(id)) return res.status(400).json({ success: false, message: 'Bad astrologer id' });
    const { data, error } = await db
      .from('withdrawal_requests')
      .select('id, amount, status, admin_note, requested_at, processed_at, tds_amount, net_amount')
      .eq('astrologer_id', id)
      .order('requested_at', { ascending: false })
      .limit(500);
    if (error) throw error;
    return res.json({ success: true, data: data || [] });
  }));

  // ── Per-astrologer earnings + current balance ────────────────────────────────
  // The balance columns are the astrologer's live wallet (what they can withdraw);
  // the window columns are summed from the ledger, so the two answer different
  // questions and are labelled as such on the page.
  app.get('/api/admin/consultations/astrologer-earnings', requireAdmin, h(async (req, res) => {
    const days = req.query.days === 'all' ? null : Math.min(Number(req.query.days) || 30, 365);
    const since = days ? new Date(Date.now() - days * 86400000).toISOString() : null;
    const includeTest = req.query.includeTest === '1';

    const { data: astrologers, error } = await db
      .from('astrologers')
      .select('id, first_name, last_name, phone_number, wallet_balance, today_earnings, total_earnings, approval_status, is_suspended')
      .order('wallet_balance', { ascending: false });
    if (error) throw error;

    // Paged: PostgREST returns at most 1,000 rows per request whatever .limit() says,
    // and this ledger holds several thousand, so a single read silently dropped most
    // of the period's earnings.
    const txns = [];
    for (let from = 0; ; from += 1000) {
      let ledger = db.from('vendor_wallet_transactions')
        .select('vendor_id, amount, type, session_id, created_at')
        .order('created_at', { ascending: false })
        .order('id', { ascending: true })
        .range(from, from + 999);
      if (since) ledger = ledger.gte('created_at', since);
      const { data: pageRows, error: tErr } = await ledger;
      if (tErr) throw tErr;
      txns.push(...(pageRows || []));
      if (!pageRows || pageRows.length < 1000 || from > 200000) break;
    }

    // Split consultation earnings from everything else in the ledger. A vendor's credits
    // also include GIFTS (and the ledger carries withdrawal debits), none of which carry a
    // session_id -- so a single "earned" number can never be reconciled against the session
    // list, and an admin checking one against the other would find a gap with no explanation.
    const agg = new Map();
    for (const t of txns || []) {
      const e = agg.get(t.vendor_id) || { earned: 0, fromSessions: 0, sessions: new Set(), lastAt: null };
      if (t.type === 'credit') {
        const amt = Number(t.amount) || 0;
        e.earned += amt;
        if (t.session_id) e.fromSessions += amt;
      }
      if (t.session_id) e.sessions.add(t.session_id);
      if (!e.lastAt || t.created_at > e.lastAt) e.lastAt = t.created_at;
      agg.set(t.vendor_id, e);
    }
    const round2 = (n) => Math.round(n * 100) / 100;

    const visibleAstrologers = includeTest
      ? (astrologers || [])
      : (astrologers || []).filter((a) => String(a.phone_number || '') !== REVIEWER_PHONE);
    const testCount = (astrologers || []).length - visibleAstrologers.length;

    const data = visibleAstrologers.map((a) => {
      const e = agg.get(a.id);
      return {
        id: a.id,
        name: astroName(a),
        phone: a.phone_number,
        approvalStatus: a.approval_status,
        isSuspended: !!a.is_suspended,
        // Live balances straight off the astrologer row.
        walletBalance: Number(a.wallet_balance || 0),
        todayEarnings: Number(a.today_earnings || 0),
        totalEarnings: Number(a.total_earnings || 0),
        // Summed from the ledger over the selected window.
        earnedInWindow: e ? round2(e.earned) : 0,
        earnedFromSessions: e ? round2(e.fromSessions) : 0,
        earnedFromGifts: e ? round2(e.earned - e.fromSessions) : 0,
        sessionsInWindow: e ? e.sessions.size : 0,
        lastEarnedAt: e ? e.lastAt : null,
      };
    });

    return res.json({ success: true, data, windowDays: days, testCount, includeTest });
  }));

  // ── One session: transcript + its money ──────────────────────────────────────
  app.get('/api/admin/consultations/:id/chat', requireAdmin, h(async (req, res) => {
    const id = req.params.id;
    const { data: session, error } = await db
      .from('chat_sessions')
      .select('id, call_type, vendor_id, caller_id, per_minute_charge, started_at, ended_at, is_active, is_free')
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    if (!session) return res.status(404).json({ success: false, message: 'Session not found' });

    const [{ data: a }, { data: u }] = await Promise.all([
      db.from('astrologers').select('id, first_name, last_name, phone_number').eq('id', session.vendor_id).maybeSingle(),
      db.from('customers').select('id, name, mobile').eq('id', session.caller_id).maybeSingle(),
    ]);
    const aName = astroName(a);
    const uName = u?.name || 'Customer';

    const { data: msgs, error: mErr } = await db
      .from('chat_messages')
      .select('id, sender_id, message, created_at')
      .eq('session_id', id)
      .order('created_at', { ascending: true })
      .limit(1000);
    if (mErr && !isMissingTable(mErr)) throw mErr;

    // Contact details are starred out before a message is saved (subsystem CW), so the
    // stored copy is the masked one. Where a flag recorded what was really typed, show
    // that too — it is the whole point of keeping the flag's excerpt.
    const { data: flags } = await db
      .from('session_flags')
      .select('id, message_id, excerpt, severity, kinds, sender_role')
      .eq('session_id', id);
    const flagByMessage = new Map((flags || []).filter((f) => f.message_id).map((f) => [String(f.message_id), f]));

    const messages = (msgs || []).map((m) => {
      const fromAstro = String(m.sender_id) === String(session.vendor_id);
      const flag = flagByMessage.get(String(m.id));
      return {
        id: m.id,
        from: fromAstro ? 'astrologer' : 'customer',
        name: fromAstro ? aName : uName,
        at: m.created_at,
        message: m.message,
        flagged: !!flag,
        originalText: flag?.excerpt || null,
        flagKinds: flag?.kinds || null,
      };
    });

    const [paid, earned, kept] = await Promise.all([
      sumBySession('wallet_transactions', [id], { type: 'debit' }),
      sumBySession('vendor_wallet_transactions', [id], { type: 'credit' }),
      sumBySession('admin_wallet_transactions', [id]),
    ]);

    const cfg = await retentionConfig();

    return res.json({
      success: true,
      session: {
        id: session.id,
        type: session.call_type || 'chat',
        isActive: !!session.is_active,
        isFree: !!session.is_free,
        startedAt: session.started_at,
        endedAt: session.ended_at,
        durationMinutes: durationMinutes(session.started_at, session.ended_at),
        perMinuteCharge: Number(session.per_minute_charge || 0),
        customerPaid: paid.get(id) || 0,
        astrologerEarned: earned.get(id) || 0,
        platformKept: kept.get(id) || 0,
        astrologer: { id: session.vendor_id, name: aName, phone: a?.phone_number || null },
        customer: { id: session.caller_id, name: uName, mobile: /^deleted:/.test(String(u?.mobile || '')) ? null : u?.mobile || null },
        flagCount: (flags || []).length,
      },
      messages,
      // So the viewer knows whether this transcript is about to age out.
      retention: cfg,
    });
  }));

  // ── Delete one session's chat now ────────────────────────────────────────────
  app.delete('/api/admin/consultations/:id/chat', requireAdmin, h(async (req, res) => {
    const id = req.params.id;
    const { data, error } = await db.from('chat_messages').delete().eq('session_id', id).select('id');
    if (error) throw error;
    return res.json({ success: true, deleted: (data || []).length });
  }));

  // ── Retention settings + what they would delete ──────────────────────────────
  app.get('/api/admin/chat-retention', requireAdmin, h(async (req, res) => {
    const cfg = await retentionConfig();
    const cutoff = cutoffFor(cfg.days);

    const count = async (build) => {
      const { count: n, error } = await build(db.from('chat_messages').select('*', { count: 'exact', head: true }));
      if (error) {
        if (isMissingTable(error)) return 0;
        throw error;
      }
      return n || 0;
    };

    const total = await count((q) => q);
    const dueNow = await count((q) => q.lt('created_at', cutoff));

    const { data: oldest } = await db
      .from('chat_messages').select('created_at').order('created_at', { ascending: true }).limit(1);

    // How many of the due messages the flag exemption would spare. Sampled over the
    // first 500 due rows, which is also what one purge batch looks at.
    let flaggedProtected = 0;
    if (dueNow && cfg.keepFlagged) {
      const { data: sample } = await db
        .from('chat_messages').select('id, session_id').lt('created_at', cutoff)
        .order('created_at', { ascending: true }).limit(500);
      const flagged = await flaggedSessionIds([...new Set((sample || []).map((m) => m.session_id).filter(Boolean))]);
      flaggedProtected = (sample || []).filter((m) => m.session_id && flagged.has(m.session_id)).length;
    }

    return res.json({
      success: true,
      ...cfg,
      cutoff,
      totalMessages: total,
      dueNow,
      flaggedProtectedInNextBatch: flaggedProtected,
      oldestMessageAt: oldest?.[0]?.created_at || null,
    });
  }));

  // Run the purge immediately. `force` lets an admin run it once without leaving the
  // hourly job switched on.
  app.post('/api/admin/chat-retention/run', requireAdmin, h(async (req, res) => {
    const result = await purgeOldChatMessages({ force: true });
    return res.json({ success: true, ...result });
  }));
};

module.exports.purgeOldChatMessages = purgeOldChatMessages;
module.exports.retentionConfig = retentionConfig;
