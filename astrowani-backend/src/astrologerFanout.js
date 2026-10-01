// astrowani-backend/src/astrologerFanout.js
//
// ONE server-side Supabase Realtime subscription on the astrologers table,
// rebroadcast to all connected apps over the Socket.io connection they already
// hold.
//
// WHY THIS EXISTS
// Before: Home.js, Chat.js, Video.js and Call.js each opened their own
// Supabase Realtime subscription to {event:'*', table:'astrologers'} with no
// filter, and refetched the entire astrologer list on any change. That means:
//
//   Supabase Realtime connections = users x up-to-4 screens
//   Realtime messages delivered   = (astrologer row changes) x (that number)
//
// Supabase's free tier allows 200 concurrent Realtime connections and 100
// messages/second. At 1,000 concurrent users that first number is exceeded
// roughly fivefold before a single astrologer touches a toggle — and when they
// do, the message fan-out is what actually falls over. This is not a cost that
// grows gracefully; it is a wall.
//
// After: exactly ONE Supabase Realtime subscription exists, held here by the
// backend. Changes are coalesced over a short window and pushed to clients as a
// single `astrologers_changed` socket event on the connection every app already
// maintains for calls and chat. Supabase Realtime usage becomes constant with
// respect to user count.
//
// The event carries no row data on purpose. Clients treat it as "your list is
// stale, refetch when convenient" and go to /api/astrologers, which is cached
// and single-flighted (src/ttlCache.js). Sending the changed row instead would
// mean every client processing every astrologer's every keystroke in
// EditProfile.

const { createClient } = require('@supabase/supabase-js');

// Coalescing window. A vendor toggling three services in quick succession, or a
// batch earnings reset touching every row, produces one client-visible event
// rather than dozens.
const COALESCE_MS = 3000;

// Columns whose value NO customer-facing list or profile ever renders.
//
// WHY THIS LIST EXISTS (2026-10-01). process_session_billing does
//   UPDATE astrologers SET wallet_balance=…, today_earnings=…, total_earnings=…
// once per billed minute PER ACTIVE SESSION. This fanout watches '*' on the
// table, so in production — where some session is essentially always billing —
// every one of those writes used to:
//
//   1. call onChange(), dropping the server's astrologer-list cache IMMEDIATELY
//      (per change, not coalesced), leaving that cache permanently cold, and
//   2. feed a broadcast to EVERY connected socket every <=3s, after which every
//      client with a list screen focused refetched /api/astrologers.
//
// So a few hundred idle users generated a continuous refetch storm triggered by
// nothing any user did. Measured 2026-10-01: the list is 64KB raw / 9.4KB
// gzipped, so ~1,000 connected users is ~200+ req/s and ~16Mbps of pure noise,
// against a single-core Node process and a free-tier database.
//
// Earnings resets are the same shape but worse in bursts: checkEarningsResets()
// zeroes today_earnings across EVERY astrologer row at once.
//
// This is deliberately an IGNORE list, not an allow list. A column added later
// is treated as customer-visible until someone decides otherwise — the failure
// direction is "broadcast something harmless", never "silently stop telling
// customers an astrologer came online".
const NON_DISPLAY_COLUMNS = new Set([
  // Money. The entire reason this filter exists.
  'wallet_balance', 'today_earnings', 'total_earnings',
  // Push plumbing — rewritten on every login, token refresh and logout.
  'fcm_token', 'voip_token', 'voip_platform',
  // Payout details. Customers must never see these and nothing renders them.
  'bank_account_holder', 'bank_account_number', 'bank_ifsc', 'bank_name', 'upi_id',
  // Internal bookkeeping.
  'admin_notes', 'charges_locked_at', 'logged_out_at',
  'terms_accepted_at', 'terms_version', 'terms_accepted_source',
]);

/**
 * True when this change cannot possibly alter what a customer sees, so it is
 * safe to drop entirely.
 *
 * FAILS SAFE in every direction: anything that is not provably a
 * non-display-only UPDATE returns false and is treated as a real change.
 * That covers INSERT/DELETE, a payload without `old` (REPLICA IDENTITY not
 * FULL, so the diff is impossible), and any error while diffing.
 *
 * `astrologers` is REPLICA IDENTITY FULL (verified against production
 * 2026-10-01, set by sql/enable_realtime_astrologers.sql), which is what makes
 * `old` carry every column rather than just the primary key.
 */
function isNonDisplayChange(payload) {
  try {
    if (!payload || payload.eventType !== 'UPDATE') return false;
    const before = payload.old;
    const after = payload.new;
    if (!before || !after) return false;
    const beforeKeys = Object.keys(before);
    // REPLICA IDENTITY DEFAULT gives us only the key columns — not enough to
    // tell what actually changed, so never skip on that basis.
    if (beforeKeys.length <= 1) return false;

    let changed = 0;
    for (const key of Object.keys(after)) {
      // Compare stringified: numerics arrive as strings or numbers depending on
      // the column type, and a false "changed" only costs a harmless broadcast.
      if (String(before[key]) !== String(after[key])) {
        if (!NON_DISPLAY_COLUMNS.has(key)) return false;
        changed++;
      }
    }
    // changed === 0 is a no-op write (same values) — equally safe to drop.
    return true;
  } catch (_) {
    return false;
  }
}

function startAstrologerFanout({ io, supabaseUrl, supabaseKey, onChange }) {
  if (!io) throw new Error('startAstrologerFanout requires io');

  // A dedicated client: supabase-js multiplexes Realtime over one websocket per
  // client instance, and we do not want this sharing a socket with anything
  // that might be torn down elsewhere.
  const rt = createClient(supabaseUrl, supabaseKey, {
    realtime: { params: { eventsPerSecond: 10 } },
  });

  let pending = null;
  let changesSeen = 0;
  // Observability: without these, "the fanout went quiet" and "the filter is
  // eating real changes" look identical from the outside.
  let skipped = 0;
  let relayed = 0;

  const flush = () => {
    pending = null;
    const count = changesSeen;
    changesSeen = 0;
    // Broadcast to every connected socket. Clients debounce again on their side.
    io.emit('astrologers_changed', { at: Date.now(), changes: count });
  };

  const schedule = (payload) => {
    // Billing and push-token writes cannot change what a customer sees, and in
    // production they are the overwhelming majority of writes to this table.
    // Dropping them here is what keeps the server-side list cache warm.
    if (isNonDisplayChange(payload)) {
      skipped++;
      return;
    }
    relayed++;
    changesSeen++;
    if (onChange) {
      // Drop the server's own cached copy immediately — it must never serve a
      // list it already knows is stale, even inside the TTL window.
      try { onChange(); } catch (err) { console.error('[astrologerFanout] onChange error:', err.message); }
    }
    if (!pending) pending = setTimeout(flush, COALESCE_MS);
  };

  // Periodic one-liner rather than per-event logging, which at billing volume
  // would itself be a load problem.
  const statsTimer = setInterval(() => {
    if (skipped || relayed) {
      console.log(`[astrologerFanout] 5m: relayed ${relayed}, skipped ${skipped} non-display write(s)`);
      skipped = 0;
      relayed = 0;
    }
  }, 5 * 60 * 1000);
  if (statsTimer.unref) statsTimer.unref();

  const channel = rt
    .channel(`backend-astrologers-fanout-${Date.now()}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'astrologers' }, schedule)
    .subscribe((status, err) => {
      if (status === 'SUBSCRIBED') {
        console.log('[astrologerFanout] subscribed — clients will be notified via socket');
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        // Not fatal: the apps still refresh on screen focus, so the list stays
        // correct, just less immediate. Logged so it is visible if it persists.
        console.error(`[astrologerFanout] realtime ${status}:`, err?.message || '(no detail)');
      }
    });

  return {
    stop() {
      if (pending) clearTimeout(pending);
      clearInterval(statsTimer);
      try { rt.removeChannel(channel); } catch (_) {}
    },
  };
}

module.exports = {
  startAstrologerFanout,
  COALESCE_MS,
  // Exported for tests — see scripts/testFanoutFilter.js.
  isNonDisplayChange,
  NON_DISPLAY_COLUMNS,
};
