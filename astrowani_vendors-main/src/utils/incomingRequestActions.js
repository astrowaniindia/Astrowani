// Shared accept/reject core for an incoming call/video-call/chat request. Used by both
// the in-app popup (HomeScreen.js, which also has a live socket + navigation to layer on
// top) and the notification Accept/Reject buttons (which may fire with the app
// backgrounded or fully killed, so there's no live socket/navigation to use — the request
// row's own status change already reaches the customer via Supabase Realtime, the app's
// established dual-path pattern, so that alone is enough here).
//
// The actual mutation now happens server-side via POST /api/session/accept and
// /api/session/reject (see DATABASE_HARDENING_HANDOFF.md STEP 3) — this file previously
// wrote directly to chat_sessions/call_requests/chat_requests with the anon key. The
// exported function signatures and return shapes are unchanged so callers (HomeScreen.js,
// notification action handlers) need no changes.
// Analytics note: the vendor app had only four events (chat/call started + ended), so
// the entire supply side of the marketplace was unmeasured — accepting and rejecting
// requests, the single most consequential thing an astrologer does, left no trace.
// Instrumented here rather than in HomeScreen.js because this is the shared core: the
// notification action buttons reach it with the app backgrounded or killed, where
// HomeScreen isn't mounted at all.
//
// `secondsToDecide` is how long the astrologer let the request ring before acting —
// the number that separates "slow to answer" from "declines outright", which read
// identically in the customer-side connect rate.
import AsyncStorage from '@react-native-async-storage/async-storage';
import Instance from '../api/ApiCall';
import { captureEvent } from './Analytics';

function decisionProps(req, extra = {}) {
  const receivedAt = Number(req?.receivedAt) || 0;
  return {
    call_type: req?.callType || 'chat',
    astrologer_id: req?.astrologerId || null,
    secondsToDecide: receivedAt ? Math.round((Date.now() - receivedAt) / 100) / 10 : null,
    source: req?.source || 'popup',
    ...extra,
  };
}

export async function acceptRequest(req) {
  const token = await AsyncStorage.getItem('token');
  try {
    const res = await Instance.post('/api/session/accept', req, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    // Only a genuine accept counts — `ok: false` here means the customer had already
    // cancelled, which is not the astrologer declining and must not look like one.
    captureEvent('request_accepted', decisionProps(req, { ok: res.data?.ok !== false }));
    return res.data;
  } catch (e) {
    captureEvent('request_accept_failed', decisionProps(req));
    return { ok: false, reason: e?.response?.data?.message || e.message };
  }
}

export async function rejectRequest(req) {
  const token = await AsyncStorage.getItem('token');
  captureEvent('request_rejected', decisionProps(req));
  try {
    const res = await Instance.post('/api/session/reject', req, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    return res.data;
  } catch (e) {
    return { ok: false };
  }
}
