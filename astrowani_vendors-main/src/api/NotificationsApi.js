// Reads of `notifications` for the astrologer app (2026-11-13). These used to go
// straight to Supabase on the publishable key, which meant anon needed SELECT on the
// whole table — every customer's support replies and order updates included. Now the
// backend serves only this astrologer's own rows, decided from the JWT.
//
// Both helpers resolve and never throw, like the direct reads they replace. They
// return null on failure so a caller can keep what it already shows rather than
// blanking the list or the badge on one dropped request.

import AsyncStorage from '@react-native-async-storage/async-storage';
import Instance from './ApiCall';

async function authHeader() {
  const token = await AsyncStorage.getItem('token');
  return token ? { headers: { Authorization: `Bearer ${token}` } } : null;
}

/** @returns {Promise<object[]|null>} */
export async function fetchNotificationList(limit = 100) {
  try {
    const auth = await authHeader();
    if (!auth) return null;
    const res = await Instance.get(`/api/vendor/notifications/list?limit=${limit}`, auth);
    return Array.isArray(res?.data?.data) ? res.data.data : null;
  } catch (e) {
    console.log('[notifications] list failed —', e?.message);
    return null;
  }
}

/** @returns {Promise<number|null>} */
export async function fetchUnreadNotificationCount() {
  try {
    const auth = await authHeader();
    if (!auth) return null;
    const res = await Instance.get('/api/vendor/notifications/unread-count', auth);
    return typeof res?.data?.unread === 'number' ? res.data.unread : null;
  } catch (e) {
    console.log('[notifications] unread count failed —', e?.message);
    return null;
  }
}
