import { api, ApiError } from './api.js?v=17';
import { getUser, isSignedIn, onAuthChange } from './session.js?v=17';
import { loadScript } from './ui.js?v=17';

/**
 * The wallet. Deliberately thin: it reads and tops up the SAME balance the app
 * uses, because both are the same `customers` row keyed by phone number.
 *
 * Nothing here syncs anything. There is no web wallet to reconcile with an app
 * wallet — there is one balance, and both clients read it live. A ₹50 recharge
 * made here is in the app the moment that account signs in there, and a
 * deduction made during an app consultation shows up here on the next read.
 * Any "sync" layer would be a bug factory solving a problem that does not exist.
 *
 * This module has NO user interface. Balance and history are rendered by
 * wallet.html; the only window it opens is Razorpay's own checkout, which is
 * the payment provider's UI, not ours.
 */

const RAZORPAY_CHECKOUT = 'https://checkout.razorpay.com/v1/checkout.js';

let cached = { balance: null, at: 0 };
const listeners = new Set();

/** Subscribe to balance changes. Returns an unsubscribe function. */
export function onWalletChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit(balance) {
  listeners.forEach((fn) => {
    try { fn(balance); } catch (e) { console.error('[aw/wallet] listener failed:', e); }
  });
}

/** Last known balance without hitting the network. null when never fetched. */
export function cachedBalance() {
  return cached.balance;
}

/**
 * Read the live balance. Returns a number, or null when signed out / unreadable.
 * Never throws: a wallet read that fails must not take a page down with it.
 */
export async function fetchBalance({ force = false } = {}) {
  if (!isSignedIn()) {
    cached = { balance: null, at: 0 };
    emit(null);
    return null;
  }
  if (!force && cached.balance != null && Date.now() - cached.at < 5000) {
    return cached.balance;
  }
  try {
    const res = await api.get('/api/wallet');
    const balance = Number(
      res?.balance ?? res?.walletBalance ?? res?.wallet_balance ?? res?.data?.balance ?? 0,
    );
    cached = { balance: Number.isFinite(balance) ? balance : 0, at: Date.now() };
    emit(cached.balance);
    return cached.balance;
  } catch (err) {
    console.warn('[aw/wallet] balance read failed:', err.message);
    return cached.balance;
  }
}

/**
 * Wallet history — the same ledger the app shows, already folded server-side so
 * a 10-minute call is one "Call with X" row rather than ten per-minute debits.
 * Returns [] when signed out or unreadable.
 */
export async function fetchTransactions() {
  if (!isSignedIn()) return [];
  try {
    const res = await api.get('/api/wallet');
    return Array.isArray(res?.data?.transactions) ? res.data.transactions : [];
  } catch (err) {
    console.warn('[aw/wallet] history read failed:', err.message);
    return [];
  }
}

/**
 * Take a payment and credit the wallet. Resolves { ok, message }.
 *
 * The Razorpay key is NEVER hardcoded here — /api/wallet/create-order returns
 * the `keyId` the backend is configured with, so rotating that key (still
 * outstanding, see CLAUDE.md) needs no website change.
 */
export function startRecharge(amount) {
  return new Promise(async (resolve) => {
    try {
      await loadScript(RAZORPAY_CHECKOUT);
      const order = await api.post('/api/wallet/create-order', { amount });
      if (!order?.orderId || !order?.keyId) throw new ApiError('Could not start the payment.');

      const user = getUser() || {};
      const rzp = new window.Razorpay({
        key: order.keyId,
        order_id: order.orderId,
        amount: Math.round(order.amount * 100),
        currency: order.currency || 'INR',
        name: 'Astrowani',
        description: 'Wallet recharge',
        prefill: { name: user.name || '', contact: user.phoneNumber || '' },
        theme: { color: '#592A19' },
        handler: async (response) => {
          // THE CREDIT HAPPENS SERVER-SIDE, AFTER SIGNATURE VERIFICATION. The
          // browser is never trusted to say a payment succeeded — this only
          // hands the signed receipt back for the backend to check.
          try {
            await api.post('/api/wallet/verify-payment', {
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
            });
            await fetchBalance({ force: true });
            resolve({ ok: true });
          } catch (_) {
            // The money may well have left the customer's account, and the
            // Razorpay webhook settles it either way — never report an outright
            // failure here.
            await fetchBalance({ force: true });
            resolve({ ok: true, message: 'Payment received. Your balance will update shortly.' });
          }
        },
        modal: { ondismiss: () => resolve({ ok: false }) },
      });

      rzp.on('payment.failed', (resp) => {
        resolve({ ok: false, message: resp?.error?.description || 'That payment did not go through.' });
      });

      rzp.open();
    } catch (err) {
      resolve({ ok: false, message: err instanceof ApiError ? err.message : 'Could not start the payment.' });
    }
  });
}

/**
 * Can this consultation start? Checks sign-in and a 5-minute float, mirroring
 * the apps' pre-flight so an astrologer is never rung by someone who cannot pay
 * for a usable consultation.
 *
 * Sends the visitor to the wallet SCREEN when they are short, rather than
 * stacking a payment popup on top of a consultation screen, and remembers where
 * they were so they land back here after paying.
 */
export async function ensureFunds({ rate, minutes = 5, label = 'consultation' }) {
  if (!isSignedIn()) return false;

  const perMinute = Number(rate) || 0;
  if (perMinute <= 0) return true;

  const needed = perMinute * minutes;
  const balance = (await fetchBalance({ force: true })) ?? 0;
  if (balance >= needed) return true;

  try {
    sessionStorage.setItem('aw_wallet_return', location.href);
    sessionStorage.setItem(
      'aw_wallet_reason',
      `You need at least ₹${needed} (${minutes} minutes at ₹${perMinute}/min) to start this ${label}. Your balance is ₹${balance}.`,
    );
  } catch (_) {}
  window.location.href = `wallet.html?need=${needed}`;
  return false;
}

// Keep the cache honest across sign-in/sign-out.
onAuthChange(() => {
  cached = { balance: null, at: 0 };
  fetchBalance();
});
