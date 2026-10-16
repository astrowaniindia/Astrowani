/**
 * Turn a react-native-razorpay rejection into something a customer can read.
 *
 * TWO THINGS THIS EXISTS TO FIX, both seen on a real device:
 *
 * 1. Backing out of the checkout sheet was reported as a FAILURE. The old check
 *    treated `code === 0` as "cancelled", but 0 is Razorpay's NETWORK_ERROR —
 *    PAYMENT_CANCELLED is 2. So an ordinary back-press fell through to the error
 *    branch and got a red "Payment Failed" popup.
 *
 * 2. That popup printed raw JSON. `error.description` is not a sentence — it is
 *    Razorpay's serialised error envelope, so the customer saw
 *    `{"error":{"code":"BAD_REQUEST_ERROR","description":"undefined",…}}`.
 *    Nothing should ever put a JSON blob in front of a customer.
 *
 * Razorpay's documented codes:
 *   0 NETWORK_ERROR · 1 INVALID_OPTIONS · 2 PAYMENT_CANCELLED
 *   3 TLS_ERROR · 4 INCOMPATIBLE_PLUGIN · 5 UNKNOWN_ERROR
 */

const CANCEL_CODES = new Set([2, '2']);
const NETWORK_CODES = new Set([0, '0', 3, '3']);

/**
 * Razorpay's error envelope, whichever field happens to carry it.
 *
 * `description` is usually the serialised `{"error":{…}}` object, but the SDK is not
 * consistent about which key it lands in, and some paths hand over an already-parsed
 * object. Everything here is best-effort: a null simply means we classify from the
 * text instead, which is what the code did before this existed.
 */
function envelope(error) {
  for (const raw of [error?.description, error?.message]) {
    if (typeof raw !== 'string' || !raw.trim().startsWith('{')) continue;
    try {
      const parsed = JSON.parse(raw);
      if (parsed?.error && typeof parsed.error === 'object') return parsed.error;
    } catch (_) { /* not JSON after all — fall through */ }
  }
  if (error?.error && typeof error.error === 'object') return error.error;
  return null;
}

/** Pull a human sentence out of Razorpay's envelope, or null if there isn't one. */
function readableReason(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const text = raw.trim();
  // Not JSON — already a sentence.
  if (!text.startsWith('{')) return text || null;
  try {
    const parsed = JSON.parse(text);
    const d = parsed?.error?.description;
    // Razorpay genuinely sends the STRING "undefined" here when it has no reason.
    if (d && d !== 'undefined') return d;
    const reason = parsed?.error?.reason;
    if (reason && reason !== 'payment_error') return String(reason).replace(/_/g, ' ');
    return null;
  } catch (_) {
    return null;
  }
}

/**
 * @returns {{cancelled: boolean, timedOut: boolean, network: boolean, declined: boolean,
 *            message: string|null, code: string}}
 *  `message` is null when there is nothing worth showing — the caller should stay
 *  silent rather than invent an error.
 */
export function describeRazorpayError(error) {
  const code = error?.code;
  // The words can hide inside Razorpay's JSON envelope — e.g. a UPI app backed out of
  // arrives as reason "payment_cancelled" or "declined by the user", not as code 2.
  const blob = [error?.description, error?.reason, error?.message, error?.error?.reason]
    .filter(Boolean).map(String).join(' ');
  const cancelled =
    CANCEL_CODES.has(code) ||
    /cancel|declined by (the )?user|user (closed|dismissed|aborted)/i.test(blob);
  const network = NETWORK_CODES.has(code);
  // A UPI request expires after a few minutes if the PIN is never entered. It is NOT
  // a cancellation (nobody pressed anything) and NOT a failure of their bank or card —
  // it is the commonest outcome of all, 56% of failures measured 9-16 Oct 2026, and
  // the customer simply did not finish. Worth separating so it can be said calmly and
  // offered a retry, instead of a red "Payment Failed" that reads as a bank problem.
  const timedOut = !cancelled && /timed? ?out|not completed (on|in) time|expired/i.test(blob);

  // DECLINED: the bank, card issuer or wallet was asked to move the money and refused.
  //
  // Measured on the live dashboard 16 Oct 2026: every PhonePe Wallet failure in 90 days
  // (9 of them) carried `source: 'issuer'`, `step: 'payment_authorization'` — and the
  // same customers succeeded minutes later, one of them at ₹10 sixty seconds after ₹100
  // was refused. That is a balance, not a fault.
  //
  // IT MATTERS THAT THIS IS SEPARATED. Razorpay buckets it as "Gateway – Technical
  // Error" and its customer-facing sentence is "declined by the bank" — for a WALLET
  // there is no bank involved, so the customer is told something untrue about a problem
  // they could fix in ten seconds. One of them tried five times in seven minutes.
  //
  // NOT narrowed to wallets, deliberately: the checkout rejection does not say which
  // method was used (the envelope carries only payment_id and order_id), so a
  // wallet-only branch could not be written honestly. "Check the balance, then retry or
  // use another method" is correct for a wallet, a card and UPI alike.
  const env = envelope(error);
  const source = String(env?.source ?? error?.source ?? '').toLowerCase();
  const step = String(env?.step ?? error?.step ?? '').toLowerCase();
  const declined = !cancelled && !timedOut && !network && (
    ((source === 'issuer' || source === 'bank') && step === 'payment_authorization') ||
    /declined by (the )?bank|insufficient (funds|balance)/i.test(blob)
  );

  return {
    cancelled,
    timedOut,
    network,
    declined,
    code: String(code ?? 'unknown'),
    // A cancellation has no message by design: the customer chose to leave and does
    // not need telling what they just did.
    message: cancelled ? null : readableReason(error?.description) || readableReason(error?.message),
  };
}
