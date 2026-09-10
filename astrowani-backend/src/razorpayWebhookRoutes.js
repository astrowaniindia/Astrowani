// POST /api/razorpay/webhook — Razorpay tells us about a captured payment directly.
//
// THE GAP THIS CLOSES: a payment could succeed at Razorpay while the app died before
// calling verify-payment. The customer was charged; the recharge stayed 'created' or
// the order stayed 'pending_payment' — money taken, nothing to show for it, recovery
// by hand. Razorpay calls this endpoint on its own, so the purchase completes anyway.
//
// It reuses the EXACT completion code the app path uses (walletRecharge.completeRecharge,
// orderRoutes.completeOrderPayment), keyed on the same payment id, so the app and the
// webhook can both arrive for one payment and it still completes exactly once.
//
// SETUP (one-time, yours — the code does nothing until both are done):
//   1. Razorpay Dashboard -> Settings -> Webhooks -> Add:
//        URL:    https://backend.astrowani.com/api/razorpay/webhook
//        Events: payment.captured, order.paid
//        Secret: any long random string
//   2. Set RAZORPAY_WEBHOOK_SECRET to that same string in the VPS env, then restart.
//
// FAIL CLOSED: with no secret configured every call is refused 503 — an unsigned
// "payment captured" must never credit anybody. Razorpay retries a failed delivery, so
// configuring the secret late loses nothing that was recent.
const crypto = require('crypto');
const walletRecharge = require('./walletRecharge');
const { completeOrderPayment } = require('./orderRoutes');

/** HMAC-SHA256 of the EXACT bytes Razorpay sent, compared in constant time. */
function signatureValid(rawBody, signature, secret) {
  if (!rawBody || !signature || !secret) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(String(signature), 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

const HANDLED_EVENTS = new Set(['payment.captured', 'order.paid']);

module.exports = function registerRazorpayWebhook(app) {
  app.post('/api/razorpay/webhook', async (req, res) => {
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
    if (!secret) {
      console.error('[razorpay-webhook] RAZORPAY_WEBHOOK_SECRET is not set — refusing. See src/razorpayWebhookRoutes.js.');
      return res.status(503).json({ ok: false, message: 'Webhook not configured' });
    }
    if (!signatureValid(req.rawBody, req.get('x-razorpay-signature'), secret)) {
      console.warn('[razorpay-webhook] rejected a call with a bad or missing signature');
      return res.status(400).json({ ok: false, message: 'Bad signature' });
    }

    const event = req.body && req.body.event;
    // Anything else is acknowledged so Razorpay does not retry it forever.
    if (!HANDLED_EVENTS.has(event)) return res.json({ ok: true, ignored: event || 'unknown' });

    const payment = (req.body.payload && req.body.payload.payment && req.body.payload.payment.entity) || {};
    const orderId = payment.order_id || (req.body.payload && req.body.payload.order && req.body.payload.order.entity && req.body.payload.order.entity.id);
    const paymentId = payment.id;
    const amountPaise = payment.amount;
    if (!orderId || !paymentId) return res.json({ ok: true, ignored: 'no order or payment id' });

    try {
      const recharge = await walletRecharge.completeRecharge({
        razorpayOrderId: orderId, razorpayPaymentId: paymentId, expectedAmountPaise: amountPaise,
      });
      if (recharge.matched) {
        if (recharge.amountMismatch) {
          console.error(`[razorpay-webhook] AMOUNT MISMATCH on wallet recharge ${orderId} (payment ${paymentId}, ${amountPaise} paise) — NOT credited, needs a human`);
        } else {
          console.log(`[razorpay-webhook] wallet recharge ${orderId}: ${recharge.credited ? 'credited' : recharge.alreadyProcessed ? 'already processed' : 'not payable'}`);
        }
        return res.json({ ok: true, kind: 'wallet_recharge' });
      }

      const order = await completeOrderPayment({
        razorpayOrderId: orderId, razorpayPaymentId: paymentId, expectedAmountPaise: amountPaise,
      });
      if (order.matched) {
        if (order.amountMismatch) {
          console.error(`[razorpay-webhook] AMOUNT MISMATCH on remedy order ${orderId} (payment ${paymentId}, ${amountPaise} paise) — NOT placed, needs a human`);
        } else {
          console.log(`[razorpay-webhook] remedy order ${orderId}: ${order.placed ? 'placed' : order.alreadyProcessed ? 'already processed' : 'not payable'}`);
        }
        return res.json({ ok: true, kind: 'remedy_order' });
      }

      // Not something we created (a payment link, the web store, a test from the
      // dashboard). Acknowledge it rather than make Razorpay retry.
      return res.json({ ok: true, ignored: 'not an order we created' });
    } catch (err) {
      // 500 on purpose: Razorpay retries, and both completion paths are idempotent.
      console.error('[razorpay-webhook] failed:', err.message);
      return res.status(500).json({ ok: false });
    }
  });
};

module.exports.signatureValid = signatureValid;
