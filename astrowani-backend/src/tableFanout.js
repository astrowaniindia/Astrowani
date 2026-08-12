// astrowani-backend/src/tableFanout.js
//
// Generic version of src/astrologerFanout.js's pattern — ONE server-side
// Supabase Realtime subscription per table, rebroadcast to all connected
// apps over the Socket.io connection they already hold, instead of every
// screen opening its own unfiltered `{event:'*'}` subscription.
//
// 2026-08-13 perf audit finding G2: the exact anti-pattern astrologerFanout.js
// was built to eliminate for the `astrologers` table was still live on three
// more tables — `blogs` (BlogList.js AND a second, independent subscription
// in Home.js), `live_sessions` (Live.js), and `remedy_items` (RemedyShop.js,
// once per remedy type — so a customer browsing all three types accumulated
// three identical subscriptions to the same table). This file lets each of
// those be fixed with the same shape astrologerFanout.js already proved,
// without duplicating its logic three more times.
//
// See astrologerFanout.js for the full rationale (Supabase's free tier caps
// concurrent Realtime connections at 200 and messages at 100/s — this is
// what keeps Realtime usage constant regardless of user count).

const { createClient } = require('@supabase/supabase-js');

function startTableFanout({
  io, supabaseUrl, supabaseKey, table, eventName, onChange, coalesceMs = 3000,
}) {
  if (!io) throw new Error('startTableFanout requires io');
  if (!table) throw new Error('startTableFanout requires table');
  if (!eventName) throw new Error('startTableFanout requires eventName');

  const rt = createClient(supabaseUrl, supabaseKey, {
    realtime: { params: { eventsPerSecond: 10 } },
  });

  let pending = null;
  let changesSeen = 0;

  const flush = () => {
    pending = null;
    const count = changesSeen;
    changesSeen = 0;
    io.emit(eventName, { at: Date.now(), changes: count });
  };

  const schedule = () => {
    changesSeen++;
    if (onChange) {
      try { onChange(); } catch (err) { console.error(`[tableFanout:${table}] onChange error:`, err.message); }
    }
    if (!pending) pending = setTimeout(flush, coalesceMs);
  };

  const channel = rt
    .channel(`backend-${table}-fanout-${Date.now()}`)
    .on('postgres_changes', { event: '*', schema: 'public', table }, schedule)
    .subscribe((status, err) => {
      if (status === 'SUBSCRIBED') {
        console.log(`[tableFanout:${table}] subscribed — clients will be notified via socket ('${eventName}')`);
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        // Not fatal: consumers still refresh on screen focus, so the list stays
        // correct, just less immediate. Logged so it is visible if it persists.
        console.error(`[tableFanout:${table}] realtime ${status}:`, err?.message || '(no detail)');
      }
    });

  return {
    stop() {
      if (pending) clearTimeout(pending);
      try { rt.removeChannel(channel); } catch (_) {}
    },
  };
}

module.exports = { startTableFanout };
