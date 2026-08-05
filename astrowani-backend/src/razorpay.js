// astrowani-backend/src/razorpay.js
//
// Server-side Razorpay Orders API client + payment-signature verification.
// The customer app's Wallet.js used to call RazorpayCheckout.open() with no backend
// involvement at all — a payment could succeed on Razorpay's side with wallet_balance
// never changing, or a client could fabricate a "success" callback with no real payment
// behind it. The fix is the standard Razorpay-recommended flow: this module creates the
// Order server-side (so the amount is server-trusted, not client-supplied at credit time)
// and verifies the HMAC-SHA256 signature Razorpay returns before anything is credited.

const axios = require('axios');
const crypto = require('crypto');

const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID || 'rzp_live_3PXDqZGmI6Zz4o';
const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET;

function isConfigured() {
  return Boolean(RAZORPAY_KEY_SECRET);
}

// amountRupees: integer/decimal rupee amount (converted to paise for the Razorpay API).
// receipt: short string, used as our own reference on the Razorpay dashboard.
async function createOrder(amountRupees, receipt) {
  if (!isConfigured()) {
    const err = new Error('RAZORPAY_KEY_SECRET is not configured on this server');
    err.code = 'RAZORPAY_NOT_CONFIGURED';
    throw err;
  }
  const response = await axios.post(
    'https://api.razorpay.com/v1/orders',
    {
      amount: Math.round(amountRupees * 100),
      currency: 'INR',
      receipt,
    },
    {
      auth: { username: RAZORPAY_KEY_ID, password: RAZORPAY_KEY_SECRET },
      timeout: 15000,
    },
  );
  return response.data; // { id, amount, currency, receipt, status, ... }
}

// Verifies the HMAC-SHA256(order_id + "|" + payment_id, key_secret) signature Razorpay's
// checkout returns on success. This is the ONLY thing that proves the payment is real —
// never credit a wallet based on a client-reported "success" without this check passing.
function verifySignature({ orderId, paymentId, signature }) {
  if (!isConfigured()) return false;
  const expected = crypto
    .createHmac('sha256', RAZORPAY_KEY_SECRET)
    .update(`${orderId}|${paymentId}`)
    .digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch (_) {
    return false; // length mismatch etc. — definitely not a valid signature
  }
}

module.exports = { RAZORPAY_KEY_ID, isConfigured, createOrder, verifySignature };
