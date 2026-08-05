// astrowani-backend/src/busyStatus.js
//
// Single source of truth for "is this astrologer currently busy" — an active
// chat_sessions row (already connected to someone) OR an unanswered pending
// call_requests/chat_requests row (still ringing for someone). Shared by index.js
// (to gate new requests) and sessionManager.js (to know when to notify the
// "notify me" waitlist) so the two can never disagree about what "busy" means.

// Single-astrologer check — used right before creating a new call/chat request.
async function checkAstrologerBusy(supabase, astrologerId) {
  try {
    const [{ data: activeSession }, { data: pendingCall }, { data: pendingChat }] = await Promise.all([
      supabase.from('chat_sessions').select('started_at').eq('vendor_id', astrologerId).eq('is_active', true).limit(1),
      supabase.from('call_requests').select('created_at').eq('astrologer_id', astrologerId).eq('status', 'pending').limit(1),
      supabase.from('chat_requests').select('created_at').eq('receiver_id', astrologerId).eq('status', 'pending').limit(1),
    ]);
    if (activeSession && activeSession.length) return { busy: true, busySince: activeSession[0].started_at };
    if (pendingCall && pendingCall.length) return { busy: true, busySince: pendingCall[0].created_at };
    if (pendingChat && pendingChat.length) return { busy: true, busySince: pendingChat[0].created_at };
    return { busy: false, busySince: null };
  } catch (e) {
    console.error('[busyStatus] checkAstrologerBusy error:', e.message);
    // Fail open — a transient DB error must never block a legitimate request.
    return { busy: false, busySince: null };
  }
}

// Batched version for list endpoints (GET /api/astrologers etc) — 3 queries total
// instead of 3 per astrologer.
async function buildBusyMap(supabase) {
  const busyMap = {};
  try {
    const [{ data: activeSessions }, { data: pendingCalls }, { data: pendingChats }] = await Promise.all([
      supabase.from('chat_sessions').select('vendor_id, started_at').eq('is_active', true),
      supabase.from('call_requests').select('astrologer_id, created_at').eq('status', 'pending'),
      supabase.from('chat_requests').select('receiver_id, created_at').eq('status', 'pending'),
    ]);
    (activeSessions || []).forEach((s) => {
      if (s.vendor_id) busyMap[s.vendor_id] = { isBusy: true, busySince: s.started_at };
    });
    (pendingCalls || []).forEach((r) => {
      if (r.astrologer_id && !busyMap[r.astrologer_id]) busyMap[r.astrologer_id] = { isBusy: true, busySince: r.created_at };
    });
    (pendingChats || []).forEach((r) => {
      if (r.receiver_id && !busyMap[r.receiver_id]) busyMap[r.receiver_id] = { isBusy: true, busySince: r.created_at };
    });
  } catch (e) {
    console.error('[busyStatus] buildBusyMap error:', e.message);
  }
  return busyMap;
}

module.exports = { checkAstrologerBusy, buildBusyMap };
