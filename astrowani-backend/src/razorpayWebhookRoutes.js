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
const paymentFailureAlerts = require('./paymentFailureAlerts');
const { completeOrderPayment } = require('./orderRoutes');

/** HMAC-SHA256 of the EXACT bytes Razorpay sent, compared in constant time. */
function signatureValid(rawBody, signature, secret) {
  if (!rawBody || !signature || !secret) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(String(signature), 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

const HANDLED_EVENTS = new Set(['payment.captured', 'order.paid', 'payment.failed']);

// TWO PATHS, ONE HANDLER.
//
// `/api/razorpay/webhook` is the money one: payment.captured / order.paid, the
// webhook that credits a wallet when the customer's app died mid-payment.
// `/api/razorpay/webhook/alerts` exists only so that subscribing to payment.failed
// did not require EDITING the money webhook. Razorpay's edit form re-presents the
// secret field empty, and a save that blanks it would break crediting for everyone
// while looking like a successful edit — a far worse outcome than an extra route.
// Razorpay also refuses two webhooks on one URL, so a second path is required.
//
// Both accept every event; the split is purely about which Razorpay webhook sends
// what, so a misdirected event still does the right thing rather than being dropped.
const ALERTS_PATH = '/api/razorpay/webhook/alerts';

// The alerts webhook may carry its own secret — Razorpay's create form invites a new
// one and it is natural to generate a fresh string. Falls back to the money
// webhook's, so reusing the same secret also just works.
const secretFor = (path) => (path === ALERTS_PATH
  ? (process.env.RAZORPAY_WEBHOOK_SECRET_ALERTS || process.env.RAZORPAY_WEBHOOK_SECRET)
  : process.env.RAZORPAY_WEBHOOK_SECRET);

module.exports = function registerRazorpayWebhook(app) {
  const handler = async (req, res) => {
    const secret = secretFor(req.route && req.route.path);
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

    // A FAILED payment moves no money, so it never touches a wallet or an order —
    // it is only worth telling a human about. Handled before the completion paths
    // and returned early so a failure can never be mistaken for something to credit.
    //
    // Awaited, but it cannot throw (handlePaymentFailed catches everything) and it
    // cannot block: a thrown or slow alert must not turn into a 500, because Razorpay
    // would then retry the event and email twice.
    if (event === 'payment.failed') {
      const outcome = await paymentFailureAlerts.handlePaymentFailed(payment);
      console.log(`[razorpay-webhook] payment failed ${payment.id || '?'} (${paymentFailureAlerts.describeFailure(payment)}): ${outcome.kind}${outcome.emailed ? ', emailed' : ''}`);
      return res.json({ ok: true, kind: 'payment_failed', alert: outcome.kind });
    }

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
  };

  app.post('/api/razorpay/webhook', handler);
  app.post(ALERTS_PATH, handler);
};

module.exports.signatureValid = signatureValid;
module.exports.ALERTS_PATH = ALERTS_PATH;
