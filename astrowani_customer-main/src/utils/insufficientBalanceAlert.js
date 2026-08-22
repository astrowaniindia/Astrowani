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
 * @param {'chat'|'call'|'video'} [opts.intent] - what the customer was trying to start.
 *   Forwarded to the consult_blocked analytics event so "video is priced out of reach"
 *   is distinguishable from "chat is" — they need different fixes.
 */
export function showInsufficientBalanceAlert({ navigation, minRequired, balance, t, intent }) {
  const title = t ? t('alerts.insufficientBalance') : 'Insufficient Balance';
  const message = `You need at least ₹${minRequired} to connect. Current balance: ₹${balance}. ` +
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
    confirmText: 'Recharge',
    onConfirm: () => navigation?.navigate?.('Wallet'),
    extraText: 'Refer & Earn ₹50',
    onExtra: () => navigation?.navigate?.('ReferFriend'),
    cancelText: 'Cancel',
  });
}
