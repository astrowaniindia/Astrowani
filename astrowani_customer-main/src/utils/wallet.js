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

  // The backend correctly returns success:true with balance:0 for a genuine ₹0-balance
  // customer, so a thrown error here is never "you have no money" — it's a real request
  // failure (dropped connection, slow network, brief backend hiccup). ApiCall.js sets no
  // timeout at all, so a bad connection used to hang instead of failing fast; a 10s bound
  // plus one silent retry recovers from the transient blips this was actually seeing
  // instead of surfacing a scary error over a one-off network stall.
  const attempt = () =>
    Instance.get('/api/wallet', {
      headers: { Authorization: `Bearer ${token}` },
      timeout: 10000,
    });

  let res;
  try {
    res = await attempt();
  } catch (firstErr) {
    try {
      res = await attempt();
    } catch (secondErr) {
      throw secondErr;
    }
  }

  if (!res?.data?.success) throw new Error(res?.data?.message || 'Failed to fetch wallet');
  return Number(res.data.data?.balance) || 0;
}
