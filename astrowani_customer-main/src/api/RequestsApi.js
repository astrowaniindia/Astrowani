// Writes that used to go straight to Supabase through the public key (2026-09-11):
// abandoning a pending call/chat request, and marking notifications read.
//
// Moved behind the backend because a direct write needed the public key to be able to
// change these columns on EVERY row — anyone holding the key from the APK could cancel
// other customers' requests. The backend takes the customer from our JWT and only lets
// them move their OWN pending request to 'cancelled' or 'missed'.
//
// Both helpers RESOLVE (never throw), matching the fire-and-forget calls they replace:
// the socket cancel_call emit is still the fast path that dismisses the astrologer's
// popup, and the backend's 75s stale-request sweep marks anything left 'pending' as
// missed, so a failed write here must never break the screen that made it.

import AsyncStorage from '@react-native-async-storage/async-storage';
import Instance from './ApiCall';

async function authHeader() {
  const token = await AsyncStorage.getItem('token');
  return token ? { headers: { Authorization: `Bearer ${token}` } } : null;
}

/**
 * Mark the customer's own pending request as abandoned.
 * @param {'call'|'chat'} kind
 * @param {string} requestId
 * @param {'cancelled'|'missed'} status
 * @returns {Promise<boolean>} whether the row actually changed
 */
export async function markRequestStatus(kind, requestId, status) {
  try {
    if (!requestId || (status !== 'cancelled' && status !== 'missed')) return false;
    const auth = await authHeader();
    if (!auth) return false;
    const res = await Instance.post(`/api/requests/${kind}/${requestId}/status`, { status }, auth);
    return !!res?.data?.changed;
  } catch (e) {
    console.log('[requests] status update failed —', e?.message);
    return false;
  }
}

/**
 * Mark notifications read. Ids that are not this customer's own simply match nothing.
 * @param {string[]} ids
 */
export async function markNotificationsRead(ids) {
  try {
    const list = (ids || []).filter(Boolean);
    if (!list.length) return 0;
    const auth = await authHeader();
    if (!auth) return 0;
    const res = await Instance.post('/api/notifications/read', { ids: list.slice(0, 500) }, auth);
    return res?.data?.updated || 0;
  } catch (e) {
    console.log('[notifications] mark-read failed —', e?.message);
    return 0;
  }
}
