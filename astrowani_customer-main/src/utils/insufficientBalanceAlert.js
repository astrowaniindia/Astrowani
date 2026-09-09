// Shared "insufficient balance" prompt for every chat/call/video entry point.
// Previously this was just a plain OK alert telling the customer to recharge — the only
// path forward. Now it also offers "Refer & Earn ₹50", since a customer stuck at a low
// balance may not have money to add right now but can still get moving via a referral.
// KEEP THE AMOUNT IN SYNC with REFERRAL_REWARD_AMOUNT in the backend's index.js and
// the default in sql/referral_reward_50.sql.
// Themed via the app's own StatusPopup (brown-card style) instead of the default OS
// Alert — see StatusPopup.js's three-button stacked mode.
import { showStatusPopup } from '../components/StatusPopup';

/**
 * @param {object} opts
 * @param {object} opts.navigation - the screen's navigation object
 * @param {number} opts.minRequired - minimum balance needed for this action
 * @param {number} opts.balance - the customer's current balance
 * @param {(key: string) => string} [opts.t] - optional translate function; falls back to English
 * @param {'chat'|'call'|'video'|'report'} [opts.intent] - what the customer was trying to start.
 *   Forwarded to the consult_blocked analytics event so "video is priced out of reach"
 *   is distinguishable from "chat is" — they need different fixes.
 * @param {boolean} [opts.spendsCoins=false] - true when the blocked purchase is paid in
 *   COINS rather than rupees (iOS reports / gifts / free services — see utils/payments.js).
 *
 *   This is passed explicitly rather than derived from Platform.OS, because on iOS the two
 *   currencies coexist: consultations stay in RUPEES there (1:1 real-time person-to-person
 *   is exempt from Apple's In-App Purchase requirement), while reports move to coins.
 *   Switching on the platform alone would send someone blocked on a ₹ consultation to the
 *   coin store, where nothing they buy would help.
 */
export function showInsufficientBalanceAlert({ navigation, minRequired, balance, t, intent, spendsCoins = false }) {
  const title = spendsCoins
    ? (t ? t('coins.notEnough') : 'Not enough coins')
    : (t ? t('alerts.insufficientBalance') : 'Insufficient Balance');

  // Referral rewards are paid in RUPEES, so offering "Refer & Earn ₹50" to someone short
  // of COINS would point at money that cannot buy the thing they are blocked on.
  const message = spendsCoins
    ? `You need at least ${minRequired} coins for this. You have ${balance}.`
    : `You need at least ₹${minRequired} to connect. Current balance: ₹${balance}. ` +
      `Recharge your wallet, or refer a friend using your referral code to get ₹50 free.`;

  showStatusPopup({
    variant: 'insufficient',
    title,
    message,
    intent,
    // How far short they were — tells you whether these are near-misses worth a
    // targeted top-up nudge, or customers nowhere near able to afford a session.
    blockedMeta: {
      min_required: Number(minRequired) || 0,
      balance: Number(balance) || 0,
      shortfall: Math.max(0, (Number(minRequired) || 0) - (Number(balance) || 0)),
    },
    confirmText: spendsCoins ? (t ? t('coins.topUp') : 'Get coins') : 'Recharge',
    onConfirm: () => navigation?.navigate?.(spendsCoins ? 'CoinStore' : 'Wallet'),
    // The referral reward is rupees, so it is only offered on the rupee path.
    ...(spendsCoins
      ? {}
      : {
          extraText: 'Refer & Earn ₹50',
          onExtra: () => navigation?.navigate?.('ReferFriend'),
        }),
    cancelText: 'Cancel',
  });
}
