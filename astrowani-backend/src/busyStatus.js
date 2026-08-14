// astrowani-backend/src/busyStatus.js
//
// Single source of truth for "is this astrologer currently busy" — an active
// chat_sessions row (already connected to someone) OR an unanswered pending
// call_requests/chat_requests row (still ringing for someone). Shared by index.js
// (to gate new requests) and sessionManager.js (to know when to notify the
// "notify me" waitlist) so the two can never disagree about what "busy" means.

// Single-astrologer check — used right before creating a new call/chat request.
//
// LIVE STREAMING (2026-08-08): an astrologer broadcasting live used to remain fully
// reachable for chat/call/video — they could accept an incoming call mid-broadcast without
// the live session ever ending, which is exactly the "busy" scenario this module exists to
// prevent for ordinary sessions. Checked first since it's the most user-visible state.
async function checkAstrologerBusy(supabase, astrologerId) {
  try {
    const [{ data: liveSession }, { data: activeSession }, { data: pendingCall }, { data: pendingChat }] = await Promise.all([
      supabase.from('live_sessions').select('id, started_at').eq('astrologer_id', astrologerId).eq('is_active', true).limit(1),
      supabase.from('chat_sessions').select('started_at').eq('vendor_id', astrologerId).eq('is_active', true).limit(1),
      supabase.from('call_requests').select('created_at').eq('astrologer_id', astrologerId).eq('status', 'pending').limit(1),
      supabase.from('chat_requests').select('created_at').eq('receiver_id', astrologerId).eq('status', 'pending').limit(1),
    ]);
    if (liveSession && liveSession.length) {
      return { busy: true, busySince: liveSession[0].started_at, reason: 'live', liveSessionId: liveSession[0].id };
    }
    if (activeSession && activeSession.length) return { busy: true, busySince: activeSession[0].started_at, reason: 'session' };
    if (pendingCall && pendingCall.length) return { busy: true, busySince: pendingCall[0].created_at, reason: 'session' };
    if (pendingChat && pendingChat.length) return { busy: true, busySince: pendingChat[0].created_at, reason: 'session' };
    return { busy: false, busySince: null, reason: null };
  } catch (e) {
    console.error('[busyStatus] checkAstrologerBusy error:', e.message);
    // Fail open — a transient DB error must never block a legitimate request.
    return { busy: false, busySince: null, reason: null };
  }
}

// Batched version for list endpoints (GET /api/astrologers etc) — 4 queries total
// instead of 4 per astrologer.
async function buildBusyMap(supabase) {
  const busyMap = {};
  try {
    const [{ data: liveSessions }, { data: activeSessions }, { data: pendingCalls }, { data: pendingChats }] = await Promise.all([
      supabase.from('live_sessions').select('id, astrologer_id, started_at').eq('is_active', true),
      supabase.from('chat_sessions').select('vendor_id, started_at').eq('is_active', true),
      supabase.from('call_requests').select('astrologer_id, created_at').eq('status', 'pending'),
      supabase.from('chat_requests').select('receiver_id, created_at').eq('status', 'pending'),
    ]);
    (liveSessions || []).forEach((s) => {
      if (s.astrologer_id) busyMap[s.astrologer_id] = { isBusy: true, busySince: s.started_at, reason: 'live', liveSessionId: s.id };
    });
    (activeSessions || []).forEach((s) => {
      if (s.vendor_id && !busyMap[s.vendor_id]) busyMap[s.vendor_id] = { isBusy: true, busySince: s.started_at, reason: 'session' };
    });
    (pendingCalls || []).forEach((r) => {
      if (r.astrologer_id && !busyMap[r.astrologer_id]) busyMap[r.astrologer_id] = { isBusy: true, busySince: r.created_at, reason: 'session' };
    });
    (pendingChats || []).forEach((r) => {
      if (r.receiver_id && !busyMap[r.receiver_id]) busyMap[r.receiver_id] = { isBusy: true, busySince: r.created_at, reason: 'session' };
    });
  } catch (e) {
    console.error('[busyStatus] buildBusyMap error:', e.message);
  }
  return busyMap;
}

// FAIRNESS FIX (added 2026-08-14 — money/billing audit): checkAstrologerBusy only ever
// gated the ASTROLOGER side. Nothing stopped one customer from opening concurrent sessions
// with two different astrologers against a single wallet — not a fund leak (each session's
// billing tick locks the customer row, so whichever bills second just fails cleanly once
// funds run out — see process_session_billing.sql), but a real astrologer could be mid-paid
// session when the customer's balance silently gets drained by a second, unrelated session,
// with no warning. Mirrors checkAstrologerBusy's shape/columns but keyed on the customer.
async function checkCustomerBusy(supabase, customerId) {
  try {
    const [{ data: activeSession }, { data: pendingCall }, { data: pendingChat }] = await Promise.all([
      supabase.from('chat_sessions').select('started_at').eq('caller_id', customerId).eq('is_active', true).limit(1),
      supabase.from('call_requests').select('created_at').eq('customer_id', customerId).eq('status', 'pending').limit(1),
      supabase.from('chat_requests').select('created_at').eq('caller_id', customerId).eq('status', 'pending').limit(1),
    ]);
    if (activeSession && activeSession.length) return { busy: true, busySince: activeSession[0].started_at, reason: 'session' };
    if (pendingCall && pendingCall.length) return { busy: true, busySince: pendingCall[0].created_at, reason: 'session' };
    if (pendingChat && pendingChat.length) return { busy: true, busySince: pendingChat[0].created_at, reason: 'session' };
    return { busy: false, busySince: null, reason: null };
  } catch (e) {
    console.error('[busyStatus] checkCustomerBusy error:', e.message);
    // Fail open — a transient DB error must never block a legitimate request.
    return { busy: false, busySince: null, reason: null };
  }
}

module.exports = { checkAstrologerBusy, buildBusyMap, checkCustomerBusy };
