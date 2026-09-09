// Which currency pays for the three digital-content purchases, and how much of it
// the customer has.
//
// This module is the ONE place that decides rupees-vs-coins. Everything else —
// astroApi.js, useGiftSender.js, useFreeServicePurchase.js — asks here rather than
// checking Platform.OS itself, so the rule stays in a single readable place and
// cannot drift between the three paths.
//
// ── Why coins exist ─────────────────────────────────────────────────────────────
// Apple requires In-App Purchase for digital content consumed in the app (App Store
// Review Guideline 3.1.1). Three purchases are in scope:
//     * astro reports    (generated digital content)
//     * gifts            (one-to-many in a live stream)
//     * free services    (unlocks a screen's content)
//
// Two purchases are NOT, and must keep using the Razorpay-funded rupee wallet:
//     * per-minute consultations  (1:1 real-time person-to-person — exempt)
//     * the remedy shop           (physical goods — exempt, Apple takes nothing)
//
// Putting IAP on wallet top-ups instead of on these three would have handed Apple a
// cut of the consultation revenue, which is the largest exempt line in the business.
// That is why coins are a separate currency and not a way of funding the wallet.
//
// ⚠ NEVER make a consultation or a remedy order read from here. If either ever
// spends coins, Apple's commission silently starts applying to exempt revenue.
import {Platform} from 'react-native';
import {getWalletBalance} from './wallet';
import {getCoinBalance} from '../api/CoinsApi';

/**
 * True when the three digital purchases are paid in coins rather than rupees.
 *
 * Keyed on the platform, not on a remote setting: it must be knowable
 * synchronously at render time, and it can never legitimately differ between two
 * customers on the same OS. A remote flag here would also mean a failed fetch could
 * put an iOS build into rupee mode, which is precisely the App Store violation.
 */
export const PAYS_WITH_COINS = Platform.OS === 'ios';

/**
 * The value sent as `payWith` on the three purchase requests.
 *
 * The backend defaults to 'wallet' when this is absent, so an older build — and
 * every Android build — behaves exactly as it did before coins existed.
 */
export const PAY_WITH = PAYS_WITH_COINS ? 'coins' : 'wallet';

/**
 * The balance those three purchases draw on: coins on iOS, rupees on Android.
 *
 * Throws on failure, like getWalletBalance does — a swallowed error returning 0
 * would tell the customer to top up when the real problem was the network.
 *
 * @returns {Promise<number>}
 */
export function getSpendableBalance() {
  return PAYS_WITH_COINS ? getCoinBalance() : getWalletBalance();
}

/**
 * How to describe the price of a digital purchase.
 *
 * Catalogue prices are the same NUMBER in both currencies — 1 coin == ₹1 of
 * catalogue price — so only the unit changes. This keeps gift pricing on the
 * auspicious numbers the feature depends on (21 / 51 / 108 / 111 / 251 / 501),
 * which Apple's India price tiers could never express directly.
 *
 * @param {number} amount
 * @returns {string} e.g. "₹108" or "108 coins"
 */
export function formatSpendable(amount) {
  const n = Number(amount) || 0;
  return PAYS_WITH_COINS ? `${n} ${n === 1 ? 'coin' : 'coins'}` : `₹${n}`;
}

/**
 * Where to send someone who cannot afford a digital purchase.
 *
 * On iOS that is the coin store (an Apple purchase); on Android the existing
 * wallet recharge. Returned as a route name so callers do not hardcode either.
 */
export const TOP_UP_ROUTE = PAYS_WITH_COINS ? 'CoinStore' : 'Wallet';
