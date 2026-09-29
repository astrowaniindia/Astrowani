// ── Folding per-minute billing rows into ONE entry per session ───────────────
//
// A consultation is billed a minute at a time (process_session_billing runs once
// per minute, see sql/process_session_billing.sql), so a 10-minute call writes ~10
// separate ledger rows in each of wallet_transactions, vendor_wallet_transactions
// and admin_wallet_transactions.
//
// Showing those raw is wrong for every reader. A customer who had ONE ₹400 call sees
// eight "-₹50" lines; an astrologer sees eight "+₹25" lines; and because both wallet
// histories are capped, a single long call can push everything else out of view. It
// reads as if something charged them repeatedly.
//
// So all three histories fold: one entry per session, carrying the session's real
// start and end time and the summed total. This module is the single implementation —
// the three routes previously would have needed a copy each, and copies drift.
//
// WHAT IS NEVER FOLDED
//   * A row with no session_id (recharges, withdrawals, refunds, admin corrections).
//   * A row whose session_id does not resolve to a real chat_sessions row. Gifts are
//     the reason this matters: a live gift's session_id points at live_sessions, not
//     chat_sessions, so it must stay its own entry rather than being merged into some
//     unrelated consultation. Resolution is by lookup, never by assuming.
//   * Anything one-shot (astro reports, ₹1 free services, remedy orders) — those are
//     already a single row and are passed straight through.
//
// Amounts are summed from the ACTUAL ledger rows, never recomputed as
// duration × rate. Billed minutes and wall-clock minutes legitimately differ: the
// first minute is charged 60s after connect, and sessionManager pauses billing while
// a participant is absent (resumeAfterPause pushes next_billing_at forward). A screen
// that multiplies duration by the rate therefore over-reports what was taken, which is
// the one thing a money screen must never do.

const { chunkIds } = require('./pagedSelect');

const CALL_TYPE_LABEL = {
  chat: 'Chat',
  audio: 'Call',
  voice: 'Call',
  video: 'Video call',
};

function callTypeLabel(callType) {
  return CALL_TYPE_LABEL[String(callType || '').toLowerCase()] || 'Session';
}

/**
 * Look up the chat_sessions rows behind a set of ledger rows, plus the name of the
 * other party in each.
 *
 * @param {object} db            service-role supabase client
 * @param {Array}  rows          ledger rows (need `session_id`)
 * @param {'customer'|'astrologer'} nameSide which party's name to resolve:
 *        'astrologer' for a customer-facing history ("Call with <astrologer>"),
 *        'customer'   for an astrologer-facing one ("Call with <customer>").
 *        'both' resolves both, for the admin ledger.
 * @returns {Promise<Object>} sessionId -> { startedAt, endedAt, callType, isActive,
 *                                           astrologerName, customerName }
 */
async function loadSessionMap(db, rows, nameSide = 'astrologer') {
  const ids = [...new Set((rows || []).map((r) => r.session_id).filter(Boolean))];
  if (!ids.length) return {};

  // chunkIds, not one big .in(): this list grows with every session ever billed, and a
  // single .in() with ~1000 uuids builds a ~37 KB query string that 414s (pagedSelect.js).
  const sessions = [];
  for (const chunk of chunkIds(ids)) {
    const { data } = await db
      .from('chat_sessions')
      .select('id, caller_id, vendor_id, call_type, started_at, ended_at, is_active')
      .in('id', chunk);
    if (data) sessions.push(...data);
  }
  if (!sessions.length) return {};

  const wantAstro = nameSide === 'astrologer' || nameSide === 'both';
  const wantCust = nameSide === 'customer' || nameSide === 'both';

  const astroNames = {};
  if (wantAstro) {
    const astroIds = [...new Set(sessions.map((s) => s.vendor_id).filter(Boolean))];
    for (const chunk of chunkIds(astroIds)) {
      const { data } = await db.from('astrologers').select('id, first_name, last_name').in('id', chunk);
      (data || []).forEach((a) => {
        astroNames[a.id] = `${a.first_name || ''} ${a.last_name || ''}`.trim() || 'Astrologer';
      });
    }
  }

  const custNames = {};
  if (wantCust) {
    const custIds = [...new Set(sessions.map((s) => s.caller_id).filter(Boolean))];
    for (const chunk of chunkIds(custIds)) {
      const { data } = await db.from('customers').select('id, name').in('id', chunk);
      (data || []).forEach((c) => { custNames[c.id] = c.name || 'Customer'; });
    }
  }

  const map = {};
  sessions.forEach((s) => {
    map[s.id] = {
      startedAt: s.started_at || null,
      endedAt: s.ended_at || null,
      callType: s.call_type || null,
      isActive: s.is_active === true,
      astrologerName: astroNames[s.vendor_id] || (wantAstro ? 'Astrologer' : null),
      customerName: custNames[s.caller_id] || (wantCust ? 'Customer' : null),
    };
  });
  return map;
}

/**
 * Collapse every ledger row belonging to the same session into one entry.
 *
 * @param {Array}  rows        ledger rows, any order
 * @param {Object} sessionMap  from loadSessionMap
 * @param {(session:object) => string} describe  builds the entry's title
 * @returns {Array} folded + untouched entries, newest first. A folded entry carries
 *                  `sessionId`, `startedAt`, `endedAt`, `isActive`, `ticks` (how many
 *                  minutes were actually billed) and `folded: true`.
 */
function foldBySession(rows, sessionMap, describe) {
  const groups = new Map();
  const singles = [];

  for (const r of rows || []) {
    const session = r.session_id ? sessionMap[r.session_id] : null;
    if (!session) { singles.push({ ...r, folded: false }); continue; }

    const amount = Number(r.amount) || 0;
    const existing = groups.get(r.session_id);
    if (existing) {
      // A debit inside a session (a correction) nets off rather than inflating the total.
      existing.amount += r.type === 'debit' && existing.type !== 'debit' ? -amount : amount;
      existing.ticks += 1;
      if (r.created_at > existing.created_at) existing.created_at = r.created_at;
      continue;
    }
    groups.set(r.session_id, {
      id: `session:${r.session_id}`,
      sessionId: r.session_id,
      type: r.type,
      amount,
      ticks: 1,
      description: describe(session),
      service_key: r.service_key || null,
      customer_id: r.customer_id || null,
      // Sort by when the session ENDED where we know it, so a folded call sits at the
      // moment it finished rather than at whichever minute happened to bill last.
      created_at: session.endedAt || r.created_at,
      startedAt: session.startedAt,
      endedAt: session.endedAt,
      isActive: session.isActive,
      callType: session.callType,
      astrologerName: session.astrologerName,
      customerName: session.customerName,
      folded: true,
    });
  }

  return [...singles, ...groups.values()]
    .sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0));
}

module.exports = { loadSessionMap, foldBySession, callTypeLabel, CALL_TYPE_LABEL };
