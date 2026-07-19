// Shared Supabase-mutation core for accepting/rejecting an incoming call/video-call/chat
// request. Used by both the in-app popup (HomeScreen.js, which also has a live socket +
// navigation to layer on top) and the notification Accept/Reject buttons (which may fire
// with the app backgrounded or fully killed, so there's no live socket/navigation to use —
// the request row's own status change already reaches the customer via Supabase Realtime,
// the app's established dual-path pattern, so that alone is enough here).
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../api/SupabaseClient';

// chat_requests has no room_id column (unlike call_requests), so a notification-triggered
// action — which only carries callerId/callerName, not the request's own id — has to resolve
// the pending row by (receiver, caller) instead of by room.
async function resolvePendingChatRequestId(astroId, callerId) {
  if (!astroId || !callerId) return null;
  const { data } = await supabase
    .from('chat_requests')
    .select('id')
    .eq('receiver_id', astroId)
    .eq('caller_id', callerId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();
  return data?.id || null;
}

async function resolveRequestId(req, astroId, targetTable) {
  if (req.requestId) return req.requestId;
  if (targetTable === 'call_requests' && req.roomId) {
    const { data } = await supabase
      .from('call_requests')
      .select('id')
      .eq('room_id', req.roomId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    return data?.id || null;
  }
  if (targetTable === 'chat_requests') {
    return resolvePendingChatRequestId(astroId, req.callerId);
  }
  return null;
}

// resolveRequestId's own lookups filter to status='pending', so a null result is ambiguous:
// it means EITHER "the customer's row doesn't exist yet" (backend's push/socket beats the
// customer's insert — safe to proceed) OR "the row exists but the customer already gave up"
// (timed out to 'missed', or cancelled/rejected — must NOT proceed, or the vendor ends up
// live-connecting into a call/chat the customer already abandoned). This re-checks the
// latest matching row with NO status filter to tell those two apart.
async function findLatestRequestStatus(req, astroId, targetTable) {
  if (targetTable === 'call_requests' && req.roomId) {
    const { data } = await supabase
      .from('call_requests')
      .select('status')
      .eq('room_id', req.roomId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    return data?.status || null;
  }
  if (targetTable === 'chat_requests' && req.callerId) {
    const { data } = await supabase
      .from('chat_requests')
      .select('status')
      .eq('receiver_id', astroId)
      .eq('caller_id', req.callerId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    return data?.status || null;
  }
  return null;
}

export async function acceptRequest(req) {
  const targetTable = req.table || 'chat_requests';
  const astroId = await AsyncStorage.getItem('astroId');
  const resolvedRequestId = await resolveRequestId(req, astroId, targetTable);

  if (resolvedRequestId) {
    // req.requestId was handed to us directly (e.g. the in-app popup, resolved from a live
    // Realtime INSERT) rather than found via the status='pending' filtered lookup above —
    // its status may have gone stale between being handed to us and being acted on now, so
    // re-check it directly by id (this id is trusted to exist, so a plain status check is enough).
    if (req.requestId) {
      const { data: statusRow } = await supabase
        .from(targetTable)
        .select('status')
        .eq('id', resolvedRequestId)
        .single();
      if (!statusRow || statusRow.status !== 'pending') {
        return { ok: false, reason: 'cancelled' };
      }
    }
    // else: resolvedRequestId came from the status='pending'-filtered lookup — already pending.
  } else {
    // No pending row found — disambiguate "not inserted yet" (proceed) from "already handled
    // elsewhere: missed/cancelled/rejected/accepted" (bail) before blindly creating a session.
    const latestStatus = await findLatestRequestStatus(req, astroId, targetTable);
    if (latestStatus && latestStatus !== 'pending') {
      return { ok: false, reason: 'cancelled' };
    }
  }

  const { data: astroData } = await supabase
    .from('astrologers')
    .select('chat_charge_per_minute, call_charge_per_minute, video_charge_per_minute')
    .eq('id', astroId)
    .single();

  const perMinuteCharge =
    req.callType === 'chat'
      ? astroData?.chat_charge_per_minute ?? 0
      : req.callType === 'video'
      ? astroData?.video_charge_per_minute ?? 0
      : astroData?.call_charge_per_minute ?? 0;

  // First-ever session for this customer (any astrologer, any type) — free for the
  // opening few minutes, enforced by sessionManager.js's billing loop reading this flag.
  let isFreeSession = false;
  if (req.callerId) {
    const { count } = await supabase
      .from('chat_sessions')
      .select('id', { count: 'exact', head: true })
      .eq('caller_id', req.callerId);
    isFreeSession = (count || 0) === 0;
  }

  // Create session using the pre-generated UUID from backend (req.sessionId) when present.
  // Using the same UUID the customer already has ensures billing RPC and socket events
  // reference the same row on both sides.
  const sessionInsertPayload = {
    request_id: targetTable === 'chat_requests' ? resolvedRequestId : null,
    per_minute_charge: perMinuteCharge,
    vendor_id: astroId,
    caller_id: req.callerId,
    started_at: new Date().toISOString(),
    call_type: req.callType || 'chat',
    room_id: req.roomId || null,
    call_request_id: targetTable === 'call_requests' ? resolvedRequestId : null,
    is_active: false,
    next_billing_at: null,
    is_free_session: isFreeSession,
  };
  if (req.sessionId) {
    sessionInsertPayload.id = req.sessionId;
  }
  const { data: sessionData, error: sessionErr } = await supabase
    .from('chat_sessions')
    .insert([sessionInsertPayload])
    .select('id')
    .single();

  if (sessionErr) throw sessionErr;
  const sessionId = sessionData?.id;

  // Update status + session_id so the customer's Supabase Realtime gets the real session UUID.
  // Falls back to status-only if session_id column update fails (pre-migration).
  if (resolvedRequestId) {
    const fullPayload = { status: 'accepted', responded_at: new Date().toISOString() };
    if (targetTable === 'call_requests' && sessionId) {
      fullPayload.session_id = sessionId;
    }
    const { error: updateErr } = await supabase
      .from(targetTable)
      .update(fullPayload)
      .eq('id', resolvedRequestId);

    if (updateErr) {
      await supabase
        .from(targetTable)
        .update({ status: 'accepted' })
        .eq('id', resolvedRequestId);
    }
  }

  return {
    ok: true,
    resolvedRequestId,
    sessionId,
    perMinuteCharge,
    isFreeSession,
    navigationParams: {
      requestId: resolvedRequestId,
      sessionId,
      callerName: req.callerName,
      callerId: req.callerId,
      perMinuteCharge,
      token: req.token,
      callType: req.callType,
      isFreeSession,
    },
  };
}

export async function rejectRequest(req) {
  const targetTable = req.table || 'chat_requests';
  const astroId = await AsyncStorage.getItem('astroId');
  const resolvedRequestId = await resolveRequestId(req, astroId, targetTable);
  if (!resolvedRequestId) return { ok: false };

  await supabase
    .from(targetTable)
    .update({ status: 'rejected', responded_at: new Date().toISOString() })
    .eq('id', resolvedRequestId);

  return { ok: true, resolvedRequestId };
}
