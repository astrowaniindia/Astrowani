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

const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID;
const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET;

function isConfigured() {
  return Boolean(RAZORPAY_KEY_ID && RAZORPAY_KEY_SECRET);
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

// A Payment Link is a URL anyone can pay from — which is what a WhatsApp sale needs,
// because there is no app screen to open Checkout in. Distinct from createOrder above:
// that backs the in-app sheet, this one is a shareable link.
//
// `referenceId` is our order id. Razorpay enforces that it is unique per account, which
// makes a retried send return the SAME link instead of minting a second one a customer
// could also pay.
async function createPaymentLink({ amountRupees, referenceId, description, customer, callbackUrl }) {
  if (!isConfigured()) {
    const err = new Error('RAZORPAY_KEY_SECRET is not configured on this server');
    err.code = 'RAZORPAY_NOT_CONFIGURED';
    throw err;
  }
  const body = {
    amount: Math.round(amountRupees * 100),
    currency: 'INR',
    accept_partial: false,
    reference_id: referenceId,
    description: String(description || 'Astrowani order').slice(0, 2048),
    // Razorpay sends its own reminders; the customer is already in a chat with us.
    reminder_enable: true,
    notify: { sms: false, email: false },
  };
  if (customer && (customer.contact || customer.name)) {
    body.customer = {};
    if (customer.name) body.customer.name = String(customer.name).slice(0, 128);
    // Razorpay wants +91XXXXXXXXXX; WhatsApp gives us 91XXXXXXXXXX.
    if (customer.contact) {
      const digits = String(customer.contact).replace(/[^\d]/g, '');
      body.customer.contact = digits.startsWith('+') ? digits : `+${digits}`;
    }
  }
  if (callbackUrl) {
    body.callback_url = callbackUrl;
    body.callback_method = 'get';
  }

  try {
    const response = await axios.post('https://api.razorpay.com/v1/payment_links', body, {
      auth: { username: RAZORPAY_KEY_ID, password: RAZORPAY_KEY_SECRET },
      timeout: 15000,
    });
    return response.data; // { id: 'plink_...', short_url, status, ... }
  } catch (e) {
    // A duplicate reference_id means we already made this order's link. Fetch and
    // reuse it rather than failing the customer or creating a second payable link.
    const desc = e.response?.data?.error?.description || '';
    if (/reference_id/i.test(desc) && /exist|unique|already/i.test(desc)) {
      const found = await axios.get('https://api.razorpay.com/v1/payment_links', {
        auth: { username: RAZORPAY_KEY_ID, password: RAZORPAY_KEY_SECRET },
        params: { reference_id: referenceId },
        timeout: 15000,
      });
      const hit = (found.data?.payment_links || []).find((l) => l.reference_id === referenceId);
      if (hit) return hit;
    }
    throw e;
  }
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

module.exports = { RAZORPAY_KEY_ID, isConfigured, createOrder, createPaymentLink, verifySignature };
