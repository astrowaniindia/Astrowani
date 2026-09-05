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
 * @returns {{cancelled: boolean, network: boolean, message: string|null, code: string}}
 *  `message` is null when there is nothing worth showing — the caller should stay
 *  silent rather than invent an error.
 */
export function describeRazorpayError(error) {
  const code = error?.code;
  const cancelled =
    CANCEL_CODES.has(code) ||
    /cancel/i.test(String(error?.description || error?.reason || error?.message || ''));
  const network = NETWORK_CODES.has(code);

  return {
    cancelled,
    network,
    code: String(code ?? 'unknown'),
    // A cancellation has no message by design: the customer chose to leave and does
    // not need telling what they just did.
    message: cancelled ? null : readableReason(error?.description) || readableReason(error?.message),
  };
}
