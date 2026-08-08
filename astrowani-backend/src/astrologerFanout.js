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

  const flush = () => {
    pending = null;
    const count = changesSeen;
    changesSeen = 0;
    // Broadcast to every connected socket. Clients debounce again on their side.
    io.emit('astrologers_changed', { at: Date.now(), changes: count });
  };

  const schedule = () => {
    changesSeen++;
    if (onChange) {
      // Drop the server's own cached copy immediately — it must never serve a
      // list it already knows is stale, even inside the TTL window.
      try { onChange(); } catch (err) { console.error('[astrologerFanout] onChange error:', err.message); }
    }
    if (!pending) pending = setTimeout(flush, COALESCE_MS);
  };

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
      try { rt.removeChannel(channel); } catch (_) {}
    },
  };
}

module.exports = { startAstrologerFanout, COALESCE_MS };
