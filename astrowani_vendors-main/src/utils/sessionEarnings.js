// What a session ACTUALLY paid, from the backend's ledger — never computed here.
//
// Session History used to show `wall-clock minutes x per_minute_charge` as "Earned". That
// is the CUSTOMER's rate (the astrologer earns half of it since the 50/50 split) multiplied
// by minutes that may never have been billed at all — billing pauses whenever a participant
// drops out of the session room. On 2026-10-01 eleven chats that paid Rs 0 each displayed as
// "Rs 30", so the history screen claimed Rs 330 the Report screen correctly showed as Rs 0.
//
// vendor_wallet_transactions is the only honest source (one row per billed minute, written
// in the same transaction that debited the customer), and it carries no anon grant, so it
// has to come through the backend.
import AsyncStorage from '@react-native-async-storage/async-storage';
import Instance from '../api/ApiCall';

/**
 * @param {string[]} sessionIds
 * @returns {Promise<Record<string, {earned: number, minutesBilled: number}>>}
 *   Empty object on any failure — the caller shows "—" rather than a made-up number.
 */
export async function resolveSessionEarnings(sessionIds) {
  const unique = [...new Set((sessionIds || []).filter(Boolean))];
  if (!unique.length) return {};
  try {
    const token = await AsyncStorage.getItem('token');
    if (!token) return {};
    const res = await Instance.post(
      '/api/vendor/sessions/earnings',
      { ids: unique.slice(0, 100) },
      { headers: { Authorization: `Bearer ${token}` } },
    );
    return res.data?.data || {};
  } catch (_) {
    return {};
  }
}
