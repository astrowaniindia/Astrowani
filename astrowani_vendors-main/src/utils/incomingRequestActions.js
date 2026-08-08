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
import AsyncStorage from '@react-native-async-storage/async-storage';
import Instance from '../api/ApiCall';

export async function acceptRequest(req) {
  const token = await AsyncStorage.getItem('token');
  try {
    const res = await Instance.post('/api/session/accept', req, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    return res.data;
  } catch (e) {
    return { ok: false, reason: e?.response?.data?.message || e.message };
  }
}

export async function rejectRequest(req) {
  const token = await AsyncStorage.getItem('token');
  try {
    const res = await Instance.post('/api/session/reject', req, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    return res.data;
  } catch (e) {
    return { ok: false };
  }
}
