// Coins — the iOS-only currency that satisfies Apple's In-App Purchase requirement
// (App Store Guideline 3.1.1) for the three digital-content paths: astro reports,
// gifts and the free-services charge.
//
// Coins NEVER pay for a consultation or a remedy order. Those are exempt from IAP
// (1:1 real-time person-to-person, and physical goods) and keep using the rupee
// wallet funded by Razorpay — see astrowani-backend/sql/coin_schema.sql.
//
// Every function here is iOS-relevant only. On Android nothing calls them, and the
// backend would answer anyway, so there is no platform guard inside them — the
// guard lives in utils/payments.js where the decision belongs.
import AsyncStorage from '@react-native-async-storage/async-storage';
import Instance from './ApiCall';

async function authHeaders() {
  const token = await AsyncStorage.getItem('token');
  return {Authorization: `Bearer ${token}`};
}

/**
 * The customer's coin balance.
 *
 * Throws rather than returning 0 on failure, deliberately: a false 0 renders as
 * "Not enough coins" and sends someone off to buy coins they already own. Callers
 * show their own error, exactly as utils/wallet.js's getWalletBalance does.
 *
 * @returns {Promise<number>}
 */
export async function getCoinBalance() {
  const headers = await authHeaders();
  const res = await Instance.get('/api/coins/balance', {headers, timeout: 10000});
  if (!res?.data?.success) {
    throw new Error(res?.data?.message || 'Failed to fetch coin balance');
  }
  return Number(res.data.coins) || 0;
}

/**
 * The purchasable coin packs, in display order.
 *
 * Carries NO prices — Apple owns those. The caller pairs each productId with the
 * localised, tax-inclusive price StoreKit reports on the device. Showing a price
 * from our own backend would show a number the customer will not be charged.
 *
 * @returns {Promise<Array<{productId: string, coins: number, badge: ?string}>>}
 */
export async function getCoinPacks() {
  const res = await Instance.get('/api/coins/packs', {timeout: 10000});
  if (!res?.data?.success) {
    throw new Error(res?.data?.message || 'Failed to load coin packs');
  }
  return res.data.packs || [];
}

/**
 * Hand a completed StoreKit purchase to the backend, which verifies it against
 * Apple and credits the coins.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ THE CALLER MUST ONLY finishTransaction() WHEN THIS RESOLVES.              │
 * │                                                                          │
 * │ A rejection here means the coins were NOT credited. Finishing the         │
 * │ transaction anyway tells StoreKit the purchase is dealt with and it is    │
 * │ never redelivered — so the customer has paid Apple and lost the coins,    │
 * │ permanently, with no way to recover it from the app.                      │
 * │                                                                          │
 * │ Leaving it unfinished is safe and is the designed behaviour: StoreKit     │
 * │ redelivers it on the next launch and it is credited then. A duplicate is  │
 * │ harmless — the backend dedupes on Apple's transactionId and answers 200.  │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * @param {string} signedTransaction the JWS from StoreKit
 * @returns {Promise<{coins: number, credited: number}>} the NEW balance
 */
export async function verifyCoinPurchase(signedTransaction) {
  const headers = await authHeaders();
  // Generous timeout: this is the one request where giving up early risks the app
  // deciding a paid purchase failed. The backend verifies locally against Apple's
  // root certs (no round-trip to Apple), so it is normally fast.
  const res = await Instance.post(
    '/api/coins/verify-purchase',
    {signedTransaction},
    {headers, timeout: 30000},
  );
  if (!res?.data?.success) {
    throw new Error(res?.data?.message || 'Could not verify the purchase');
  }
  return {coins: Number(res.data.coins) || 0, credited: Number(res.data.credited) || 0};
}
