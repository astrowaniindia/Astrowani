// Session reads that used to go straight to Supabase on the public anon key.
//
// WHY. chat_sessions and chat_requests are the last two tables with RLS off and an anon
// SELECT grant, which means the key inside this APK could be used to download who
// consulted which astrologer, when and at what rate. The backend now serves these reads
// (astrowani-backend/src/sessionReadRoutes.js) so that grant can be revoked. Until the
// revoke lands, both paths work -- so shipping this app change early is safe, and so is
// an older build that has not taken the update.
//
// Every read RESOLVES rather than rejects, with a safe default, the same convention
// FreeCallApi documents: a failed fetch must degrade a screen, never break it.

import AsyncStorage from '@react-native-async-storage/async-storage';
import Instance from './ApiCall';

async function authHeader() {
  const token = await AsyncStorage.getItem('token');
  return { headers: { Authorization: `Bearer ${token}` } };
}

/**
 * My own sessions, newest first, with the astrologer already joined -- which is why this
 * replaces TWO reads per screen load rather than one (the screen used to fetch the
 * sessions and then look the astrologers up separately).
 *
 * @param {string[]} types call_type values this tab wants
 * @returns {Promise<Array>} [] on any failure
 */
export async function getMySessions(types) {
  try {
    const q = Array.isArray(types) && types.length ? `?types=${types.join(',')}` : '';
    const res = await Instance.get(`/api/customer/sessions${q}`, await authHeader());
    return (res?.data?.success && Array.isArray(res.data.sessions)) ? res.data.sessions : [];
  } catch (_) {
    return [];
  }
}

/**
 * The chat that is still live on the server but no longer open in the app -- the app was
 * killed or restarted mid-chat.
 *
 * Resolves to null on ANY doubt, deliberately: being bounced into a chat screen we are
 * not sure about is worse than having to tap back in.
 *
 * @returns {Promise<object|null>} { id, requestId, vendorId, callType, startedAt, astrologer }
 */
export async function getActiveChatSession() {
  try {
    const res = await Instance.get('/api/customer/active-session', await authHeader());
    return res?.data?.success ? (res.data.session || null) : null;
  } catch (_) {
    return null;
  }
}

/**
 * Whether this customer's first session is still free. Only gates banners and the
 * pre-call wallet check; the real free window is enforced in sessionManager. Fails
 * CLOSED (false), exactly as the Supabase version it replaces did.
 */
export async function isFirstSessionFree() {
  try {
    const res = await Instance.get('/api/customer/first-session-eligible', await authHeader());
    return res?.data?.eligible === true;
  } catch (_) {
    return false;
  }
}

/**
 * Has this session ended? Used by the long-interval backstop poll in the chat screen;
 * the 'session_ended' socket event is the primary path and fires immediately.
 *
 * Returns null when it could not be determined, which the caller must treat as "carry
 * on" -- a failed poll must never end a live chat.
 *
 * @returns {Promise<{ended: boolean, endedAt: string|null, active: boolean}|null>}
 */
export async function getSessionState(sessionId) {
  if (!sessionId) return null;
  try {
    const res = await Instance.get(`/api/session/${sessionId}/state`, await authHeader());
    if (!res?.data?.success) return null;
    return {
      ended: res.data.ended === true,
      endedAt: res.data.endedAt || null,
      active: res.data.active === true,
      exists: res.data.exists !== false,
    };
  } catch (_) {
    return null;
  }
}
