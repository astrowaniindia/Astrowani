// Shared "insufficient balance" prompt for every chat/call/video entry point.
// Previously this was just a plain OK alert telling the customer to recharge — the only
// path forward. Now it also offers "Refer & Earn ₹50", since a customer stuck at a low
// balance may not have money to add right now but can still get moving via a referral.
// KEEP THE AMOUNT IN SYNC with REFERRAL_REWARD_AMOUNT in the backend's index.js and
// the default in sql/referral_reward_50.sql.
// Themed via the app's own StatusPopup (brown-card style) instead of the default OS
// Alert — see StatusPopup.js's three-button stacked mode.
import { showStatusPopup } from '../components/StatusPopup';
import { canShowTip, tipText, trackTipShown, trackTipAction, TIP_IDS } from './mascotTips';
import { isFreeCallAvailable } from '../api/FreeCallApi';
import { openFreeCallSheet } from './freeCallInvite';
import { captureEvent } from './Analytics';
import { translate } from '../context/LanguageContext';

// Consultation intents. A customer blocked on one of these who can still book the free
// introductory call is offered that first (see showFreeCallInstead below).
const CONSULT_INTENTS = ['chat', 'call', 'video'];

// Wallet preset amounts (screens/Home/Wallet/Wallet.js). The suggested top-up is
// the smallest preset that covers the shortfall, so Recharge opens with a sensible
// round number already filled in rather than an odd amount like ₹37.
const WALLET_PRESETS = [50, 100, 200, 500, 1000, 2000];
const suggestTopUp = (shortfall) =>
  WALLET_PRESETS.find((p) => p >= shortfall) || Math.ceil(shortfall / 100) * 100;

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
export async function showInsufficientBalanceAlert(opts) {
  const { spendsCoins = false, intent } = opts;
  // New customers arrive with ₹0, try to chat, and used to meet only "Recharge" — most
  // left there. If they can still book the free call, offer that first. Rupee
  // consultations only: coins can't buy a consultation and reports aren't one.
  if (!spendsCoins && CONSULT_INTENTS.includes(intent)) {
    let available = false;
    try { available = await isFreeCallAvailable(); } catch (_) { available = false; }
    if (available) {
      showFreeCallInstead(opts);
      return;
    }
  }
  showRechargePrompt(opts);
}

function showFreeCallInstead({ navigation, minRequired, balance, intent }) {
  const shortfall = Math.max(0, (Number(minRequired) || 0) - (Number(balance) || 0));
  const suggestedAmount = suggestTopUp(shortfall || Number(minRequired) || 0);

  showStatusPopup({
    variant: 'insufficient',
    title: translate('freeCall.lowBalanceTitle'),
    message: translate('freeCall.lowBalanceMsg', {
      amount: Number(minRequired) || 0,
      balance: Number(balance) || 0,
    }),
    intent,
    blockedMeta: {
      min_required: Number(minRequired) || 0,
      balance: Number(balance) || 0,
      shortfall,
      free_call_offered: true,
    },
    confirmText: translate('freeCall.lowBalanceBook'),
    onConfirm: () => {
      captureEvent('low_balance_free_call_tapped', { intent: intent || 'unknown' });
      openFreeCallSheet('low_balance');
    },
    extraText: translate('freeCall.lowBalanceRecharge'),
    extraSubtitle: translate('freeCall.lowBalanceRechargeSub'),
    extraIcon: 'account-balance-wallet',
    onExtra: () => {
      captureEvent('low_balance_recharge_tapped', { intent: intent || 'unknown', free_call_offered: true });
      navigation?.navigate?.('Wallet', { suggestedAmount });
    },
    cancelText: translate('common.cancel'),
  });
}

function showRechargePrompt({ navigation, minRequired, balance, t, intent, spendsCoins = false }) {
  const title = spendsCoins
    ? (t ? t('coins.notEnough') : 'Not enough coins')
    : (t ? t('alerts.insufficientBalance') : 'Insufficient Balance');

  // Referral rewards are paid in RUPEES, so offering "Refer & Earn ₹50" to someone short
  // of COINS would point at money that cannot buy the thing they are blocked on.
  const message = spendsCoins
    ? `You need at least ${minRequired} coins for this. You have ${balance}.`
    : `You need at least ₹${minRequired} to connect. Current balance: ₹${balance}. ` +
      `Recharge your wallet, or refer a friend using your referral code to get ₹50 free.`;

  const shortfall = Math.max(0, (Number(minRequired) || 0) - (Number(balance) || 0));

  // Rupee path only: the guide mascot explains the shortfall, and Recharge opens the
  // Wallet with a top-up that covers it already filled in.
  const useMascot = !spendsCoins && canShowTip(TIP_IDS.lowBalance);
  const suggestedAmount = suggestTopUp(shortfall || Number(minRequired) || 0);
  if (useMascot) trackTipShown(TIP_IDS.lowBalance, { intent: intent || 'unknown' });

  showStatusPopup({
    variant: 'insufficient',
    title,
    message,
    mascotText: useMascot
      ? tipText(TIP_IDS.lowBalance, {
          amount: Number(minRequired) || 0,
          balance: Number(balance) || 0,
          shortfall,
        })
      : '',
    intent,
    // How far short they were — tells you whether these are near-misses worth a
    // targeted top-up nudge, or customers nowhere near able to afford a session.
    blockedMeta: {
      min_required: Number(minRequired) || 0,
      balance: Number(balance) || 0,
      shortfall,
    },
    confirmText: spendsCoins ? (t ? t('coins.topUp') : 'Get coins') : 'Recharge',
    onConfirm: () => {
      if (spendsCoins) {
        navigation?.navigate?.('CoinStore');
        return;
      }
      if (useMascot) trackTipAction(TIP_IDS.lowBalance, 'recharge');
      navigation?.navigate?.('Wallet', { suggestedAmount });
    },
    // The referral reward is rupees, so it is only offered on the rupee path.
    ...(spendsCoins
      ? {}
      : {
          extraText: 'Invite a friend',
          extraSubtitle: 'Earn ₹50 for every friend you bring',
          extraIcon: 'card-giftcard',
          onExtra: () => navigation?.navigate?.('ReferFriend'),
        }),
    cancelText: 'Cancel',
  });
}
