// Session and request reads that used to go straight to Supabase on the public anon key.
//
// WHY. chat_sessions and chat_requests are the last two tables with RLS off and an anon
// SELECT grant, so the key inside this APK could be used to download who consulted which
// astrologer, when and at what rate. The backend serves these reads now
// (astrowani-backend/src/sessionReadRoutes.js) so that grant can be revoked. Both paths
// work until it is, so shipping this early is safe and so is an older build.
//
// Every read RESOLVES with a safe default rather than throwing, the same convention
// FreeIntroCallApi documents: these run while a dashboard is painting, and a network
// blip must degrade a screen, never break it.

import AsyncStorage from '@react-native-async-storage/async-storage';
import Instance from './ApiCall';

async function authHeaders() {
  const token = await AsyncStorage.getItem('token');
  return { headers: { Authorization: `Bearer ${token}` } };
}

/**
 * Missed calls AND missed chats for this astrologer, merged and newest first.
 *
 * One request where the screens used to make two, and the merge is done server-side so
 * the two lists cannot drift out of order.
 *
 * @param {{from?: string, to?: string, since?: string, limit?: number}} opts ISO instants
 * @returns {Promise<Array>} [{ id, kind: 'call'|'chat', name, callType, createdAt }], [] on failure
 */
export async function getMissedSessions(opts = {}) {
  try {
    const q = new URLSearchParams();
    if (opts.from) q.set('from', opts.from);
    if (opts.to) q.set('to', opts.to);
    if (opts.since) q.set('since', opts.since);
    if (opts.limit) q.set('limit', String(opts.limit));
    const qs = q.toString();
    const res = await Instance.get(`/api/vendor/missed${qs ? '?' + qs : ''}`, await authHeaders());
    return (res?.data?.success && Array.isArray(res.data.missed)) ? res.data.missed : [];
  } catch (_) {
    return [];
  }
}

/**
 * Just the number, for the drawer badge. `since` is the astrologer's missed_seen_at, so
 * the badge counts only what has arrived since they last looked.
 *
 * @returns {Promise<number>} 0 on failure — a wrong badge is better than a broken drawer.
 */
export async function getMissedCount(since) {
  try {
    const q = new URLSearchParams({ countOnly: '1' });
    if (since) q.set('since', since);
    const res = await Instance.get(`/api/vendor/missed?${q.toString()}`, await authHeaders());
    return typeof res?.data?.count === 'number' ? res.data.count : 0;
  } catch (_) {
    return 0;
  }
}

/**
 * This astrologer's own sessions, newest first, with the customer's name and avatar
 * already joined — which is why this replaces two reads per load.
 *
 * Earnings are NOT here on purpose: they come from POST /api/vendor/sessions/earnings,
 * which is already the authority on the ledger. chat_sessions carries no earnings column.
 *
 * @param {string[]} types call_type values this tab wants
 * @returns {Promise<Array>} [] on failure
 */
export async function getMySessions(types) {
  try {
    const q = Array.isArray(types) && types.length ? `?types=${types.join(',')}` : '';
    const res = await Instance.get(`/api/vendor/sessions${q}`, await authHeaders());
    return (res?.data?.success && Array.isArray(res.data.sessions)) ? res.data.sessions : [];
  } catch (_) {
    return [];
  }
}

/**
 * My newest pending call and chat request, already shaped the way enqueuePopup wants
 * them — so the screen does no mapping and cannot drift from the socket payload's field
 * names.
 *
 * This is the cold-start catch-up: the socket listeners only see requests that arrive
 * after they connect, so an app launched BY the incoming-request notification would
 * otherwise never show the request that woke it.
 *
 * @returns {Promise<{call: object|null, chat: object|null}>} both null on failure — a
 *   failed catch-up must not stop the dashboard painting, and the socket plus the push
 *   fallback still deliver anything arriving from now on.
 */
export async function getPendingRequests() {
  try {
    const res = await Instance.get('/api/vendor/pending-requests', await authHeaders());
    if (!res?.data?.success) return { call: null, chat: null };
    return { call: res.data.call || null, chat: res.data.chat || null };
  } catch (_) {
    return { call: null, chat: null };
  }
}

/**
 * The session id behind one of MY requests. Scoped server-side to this astrologer's own
 * sessions, so a request id that is not theirs resolves to null rather than to somebody
 * else's session.
 *
 * @returns {Promise<string|null>}
 */
export async function getSessionIdForRequest(requestId) {
  if (!requestId) return null;
  try {
    const res = await Instance.get(
      `/api/vendor/session-by-request/${requestId}`, await authHeaders());
    return res?.data?.sessionId || null;
  } catch (_) {
    return null;
  }
}

/**
 * Has this session ended? Backstop for the chat screen's poll; the 'session_ended'
 * socket event remains the primary path.
 *
 * Returns null when it could not be determined, which the caller must treat as "carry
 * on" — a failed poll must never end a live consultation.
 *
 * @returns {Promise<{ended: boolean, endedAt: string|null, active: boolean}|null>}
 */
export async function getSessionState(sessionId) {
  if (!sessionId) return null;
  try {
    const res = await Instance.get(`/api/session/${sessionId}/state`, await authHeaders());
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
