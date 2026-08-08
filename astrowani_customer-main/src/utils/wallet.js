// Wallet balance — via the backend, not a direct Supabase read of `customers`.
// The customers table carries every user's PII (DOB, birth details, mobile) plus
// every wallet balance, and Postgres GRANT is not row-scoped — there is no column
// list that lets anon read "just your own" wallet_balance without also letting
// anyone read everyone else's. See DATABASE_HARDENING_HANDOFF.md §3.1/§3.2.
import AsyncStorage from '@react-native-async-storage/async-storage';
import Instance from '../api/ApiCall';

/**
 * @returns {Promise<number>} the customer's current wallet balance.
 * @throws if there is no token or the request fails — callers already show
 *         their own "Failed to verify wallet balance" alert on catch.
 */
export async function getWalletBalance() {
  const token = await AsyncStorage.getItem('token');
  if (!token) throw new Error('Not logged in');
  const res = await Instance.get('/api/wallet', {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res?.data?.success) throw new Error(res?.data?.message || 'Failed to fetch wallet');
  return Number(res.data.data?.balance) || 0;
}
