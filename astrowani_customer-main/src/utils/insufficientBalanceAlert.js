// Shared "insufficient balance" prompt for every chat/call/video entry point.
// Previously this was just a plain OK alert telling the customer to recharge — the only
// path forward. Now it also offers "Refer & Earn ₹25", since a customer stuck at a low
// balance may not have money to add right now but can still get moving via a referral.
// Themed via the app's own StatusPopup (brown-card style) instead of the default OS
// Alert — see StatusPopup.js's three-button stacked mode.
import { showStatusPopup } from '../components/StatusPopup';

/**
 * @param {object} opts
 * @param {object} opts.navigation - the screen's navigation object
 * @param {number} opts.minRequired - minimum balance needed for this action
 * @param {number} opts.balance - the customer's current balance
 * @param {(key: string) => string} [opts.t] - optional translate function; falls back to English
 */
export function showInsufficientBalanceAlert({ navigation, minRequired, balance, t }) {
  const title = t ? t('alerts.insufficientBalance') : 'Insufficient Balance';
  const message = `You need at least ₹${minRequired} to connect. Current balance: ₹${balance}. ` +
    `Recharge your wallet, or refer a friend using your referral code to get ₹25 free.`;

  showStatusPopup({
    variant: 'insufficient',
    title,
    message,
    confirmText: 'Recharge',
    onConfirm: () => navigation?.navigate?.('Wallet'),
    extraText: 'Refer & Earn ₹25',
    onExtra: () => navigation?.navigate?.('ReferFriend'),
    cancelText: 'Cancel',
  });
}
