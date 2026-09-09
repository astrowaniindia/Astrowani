// StoreKit plumbing for buying coins. iOS only — every export is a safe no-op
// elsewhere, so callers never need their own Platform check.
//
// Coins satisfy Apple's In-App Purchase requirement (App Store Guideline 3.1.1)
// for astro reports, gifts and free services. See utils/payments.js for which
// purchases are in scope and which are deliberately not.
//
// ── The one rule this file exists to enforce ───────────────────────────────────
// A transaction is finished ONLY after our backend has credited the coins.
//
// finishTransaction() tells StoreKit the purchase has been delivered, after which
// it is never redelivered. Finishing before the credit lands means a customer who
// paid Apple loses the coins permanently, with no way for the app to recover it.
// Leaving it unfinished is completely safe: StoreKit redelivers on the next launch
// and the backend dedupes on Apple's transactionId, so a repeat is a no-op 200.
//
// That is also why crediting runs from a LISTENER rather than from the return value
// of requestPurchase(). The listener sees every transaction StoreKit has — including
// ones from a previous launch, an interrupted purchase, or an "Ask to Buy" approval
// that arrives days later — whereas the promise only ever sees this one tap.
import {Platform} from 'react-native';
import * as RNIap from 'react-native-iap';
import {verifyCoinPurchase} from '../api/CoinsApi';

const IS_IOS = Platform.OS === 'ios';

let initialised = false;
let purchaseUpdateSub = null;
let purchaseErrorSub = null;

// Notified whenever a purchase is successfully credited, so open screens can
// refresh their balance without polling. Set by initIap's caller.
let onCoinsCredited = null;

/**
 * Prepare StoreKit and start listening for transactions. Safe to call more than
 * once; only the first call does anything.
 *
 * Call it once at app start, NOT when the coin store screen opens — a transaction
 * interrupted on a previous launch is delivered as soon as the listener attaches,
 * and it should be credited whether or not the customer happens to visit the store.
 *
 * @param {{onCredited?: (newBalance:number)=>void}} opts
 */
export async function initIap({onCredited} = {}) {
  if (!IS_IOS || initialised) return;
  onCoinsCredited = onCredited || null;

  try {
    // ⚠ MUST run before initConnection, and MUST be STOREKIT2_MODE.
    // react-native-iap defaults to STOREKIT1_MODE, under which purchases carry a
    // base64 app receipt and `jwsRepresentationIos` is undefined — so the backend,
    // which verifies a StoreKit 2 JWS signature, would receive nothing usable and
    // every purchase would fail verification.
    RNIap.setup({storekitMode: 'STOREKIT2_MODE'});
    await RNIap.initConnection();

    purchaseUpdateSub = RNIap.purchaseUpdatedListener(handlePurchase);
    purchaseErrorSub = RNIap.purchaseErrorListener((err) => {
      // A cancellation is not a failure and must not be reported as one — the
      // customer pressed Cancel and knows they did. Same reasoning as
      // utils/razorpayError.js's treatment of PAYMENT_CANCELLED.
      if (err?.code === 'E_USER_CANCELLED') return;
      console.log('[iap] purchase error:', err?.code, err?.message);
    });

    initialised = true;
  } catch (err) {
    // Never throw out of init. StoreKit being unavailable must not stop the app
    // launching; it only means coins cannot be bought this session.
    console.log('[iap] init failed:', err?.message || err);
  }
}

/**
 * Credit one transaction, then finish it. Used for both fresh purchases and any
 * StoreKit redelivers.
 */
async function handlePurchase(purchase) {
  // StoreKit 2's signed transaction. Absent means we are somehow in StoreKit 1
  // mode (see the setup() note above) — sending the app receipt instead would
  // fail verification, so refuse loudly and leave the transaction UNFINISHED so
  // it can be recovered after a fix ships.
  const jws = purchase?.jwsRepresentationIos;
  if (!jws) {
    console.log(
      '[iap] transaction has no jwsRepresentationIos — StoreKit 2 mode is not active. ' +
      'NOT finishing it, so it can be credited once this is fixed.',
    );
    return;
  }

  try {
    const {coins} = await verifyCoinPurchase(jws);

    // Only now is it safe. isConsumable is required for coin packs — without it
    // StoreKit treats the product as non-consumable and the customer can never
    // buy the same pack twice.
    await RNIap.finishTransaction({purchase, isConsumable: true});

    if (onCoinsCredited) onCoinsCredited(coins);
  } catch (err) {
    // Deliberately NOT finished. StoreKit redelivers on the next launch and the
    // backend dedupes on Apple's transactionId, so nothing is double-credited and
    // nothing is lost.
    console.log('[iap] credit failed, leaving the transaction open for retry:', err?.message || err);
  }
}

/**
 * StoreKit's own product records for the given identifiers.
 *
 * The `localizedPrice` on each is the ONLY price that may be shown. It is what the
 * customer will actually be charged, in their storefront's currency, inclusive of
 * their tax — none of which our backend knows. It deliberately sends no prices.
 *
 * @param {string[]} productIds
 * @returns {Promise<Array>} StoreKit products; [] if unavailable
 */
export async function getCoinProducts(productIds) {
  if (!IS_IOS || !productIds?.length) return [];
  try {
    return await RNIap.getProducts({skus: productIds});
  } catch (err) {
    console.log('[iap] getProducts failed:', err?.message || err);
    return [];
  }
}

/**
 * Start a purchase. Resolves as soon as StoreKit accepts the request — NOT when
 * the coins arrive. Crediting happens in the listener, because a purchase can
 * complete long after this call (Ask to Buy, an interrupted payment sheet, a
 * network drop mid-flow).
 *
 * Callers should show "processing" and let the balance update arrive via
 * onCredited rather than awaiting a balance here.
 *
 * @param {string} productId
 * @returns {Promise<boolean>} false if the request could not be started
 */
export async function buyCoins(productId) {
  if (!IS_IOS) return false;
  if (!initialised) await initIap();
  try {
    await RNIap.requestPurchase({sku: productId});
    return true;
  } catch (err) {
    if (err?.code === 'E_USER_CANCELLED') return false;
    console.log('[iap] requestPurchase failed:', err?.code, err?.message);
    return false;
  }
}

/**
 * Re-present any transaction StoreKit still considers undelivered, so a purchase
 * that failed to credit earlier is retried.
 *
 * Worth calling when the coin store opens: it is the recovery path for someone who
 * paid, lost connectivity before the credit landed, and has come back wondering
 * where their coins are.
 */
export async function flushPendingPurchases() {
  if (!IS_IOS) return;
  if (!initialised) await initIap();
  try {
    const pending = await RNIap.getAvailablePurchases({onlyIncludeActiveItems: false});
    for (const purchase of pending || []) {
      await handlePurchase(purchase);
    }
  } catch (err) {
    console.log('[iap] flushPendingPurchases failed:', err?.message || err);
  }
}

/** Tear down listeners. Only for a full logout/teardown; not per screen. */
export function endIap() {
  if (!IS_IOS || !initialised) return;
  try {
    purchaseUpdateSub?.remove();
    purchaseErrorSub?.remove();
    RNIap.endConnection();
  } catch (_) {
    // Teardown failures are not worth surfacing.
  }
  purchaseUpdateSub = null;
  purchaseErrorSub = null;
  initialised = false;
}
