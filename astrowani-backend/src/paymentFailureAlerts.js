// Failed-payment alerting, from Razorpay's `payment.failed` webhook event.
//
// WHY IT IS SPLIT IN TWO. Measured over 9-16 Oct 2026, 25 failures: 14 "Customer -
// Payment Timed Out", 3 "Customer - Invalid Pin", 8 "Gateway - Technical Error"
// (7 of those 8 PhonePe Wallet, 5 of them one customer retrying a method that was
// failing 100% of the time). Those two groups need opposite handling:
//
//   * A GATEWAY / BANK failure is OUR problem and often systemic — a method that has
//     silently stopped working costs every customer who picks it. Worth an email
//     within the minute. At current rates that is roughly one a day.
//   * A customer timing out or mistyping a UPI PIN is not actionable individually and
//     nothing was charged. Fourteen separate emails a week trains you to ignore the
//     sender, which would also bury the gateway ones. Those go in a daily digest.
//
// Emailing everything immediately is the version of this feature that gets muted, so
// it is deliberately not what this does.
const razorpay = require('./razorpay');
const mailer = require('./mailer');
const { createClient } = require('@supabase/supabase-js');

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const DIGEST_STATE_KEY = 'payment_failure_digest_state';
const DIGEST_HOUR_IST = 9;          // send yesterday's digest after 09:00 IST
const IST_OFFSET_MS = 5.5 * 3600e3;

// Razorpay's own attribution. 'customer' and 'business' mean nobody's system broke.
const CALM_SOURCES = new Set(['customer', 'business']);

const rupees = (paise) => (Number(paise || 0) / 100).toFixed(2);

/**
 * URGENT (email now) or DIGEST (daily summary). Pure — no I/O, so it is testable.
 *
 * An unrecognised or missing error_source is URGENT on purpose. A failure we cannot
 * classify is far more likely to be a new systemic fault than a customer mistyping a
 * PIN, and the costs are not symmetric: guessing URGENT wrongly sends one extra
 * email, guessing DIGEST wrongly hides an outage for a day.
 */
function classifyFailure(payment = {}) {
  const source = String(payment.error_source || '').toLowerCase();
  return CALM_SOURCES.has(source) ? 'digest' : 'urgent';
}

/** One human-readable reason, matching how the Razorpay dashboard labels it. */
function describeFailure(payment = {}) {
  const source = payment.error_source ? String(payment.error_source) : 'unknown';
  const reason = payment.error_reason || payment.error_code || 'unknown';
  const pretty = String(reason).replace(/_/g, ' ');
  return `${source.charAt(0).toUpperCase()}${source.slice(1)} - ${pretty}`;
}

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function urgentEmail(payment) {
  const amount = rupees(payment.amount);
  const subject = `Payment failed (${describeFailure(payment)}) - Rs ${amount}`;
  const rows = [
    ['Amount', `Rs ${amount}`],
    ['Reason', describeFailure(payment)],
    ['Description', payment.error_description || '-'],
    ['Method', payment.method || '-'],
    ['Customer', payment.contact || payment.email || '-'],
    ['Payment ID', payment.id || '-'],
    ['Order ID', payment.order_id || '-'],
  ];
  const html = `
    <p><strong>This failure was not the customer's doing</strong> — Razorpay attributes it to
    <code>${esc(payment.error_source || 'unknown')}</code>, so it may affect everyone using
    this payment method.</p>
    <table cellpadding="6" style="border-collapse:collapse">
      ${rows.map(([k, v]) => `<tr><td style="color:#666">${esc(k)}</td><td><strong>${esc(v)}</strong></td></tr>`).join('')}
    </table>
    <p style="color:#666;font-size:12px">Nothing was charged to the customer. If several of these
    arrive for the same method, that method is probably broken — consider disabling it in checkout
    and raising it with Razorpay support.</p>`;
  return { subject, html };
}

/**
 * Immediate alert for a gateway/bank failure. Returns what it decided so the caller
 * can log it. Never throws — the webhook must still answer 200.
 */
async function handlePaymentFailed(payment) {
  try {
    const kind = classifyFailure(payment);
    if (kind !== 'urgent') return { kind, emailed: false };
    const { subject, html } = urgentEmail(payment);
    const res = await mailer.sendAlertEmail({ subject, html });
    return { kind, emailed: res.sent, skipped: res.skipped, error: res.error };
  } catch (err) {
    console.error('[paymentFailureAlerts] urgent alert failed:', err.message);
    return { kind: 'urgent', emailed: false, error: err.message };
  }
}

// ── Daily digest ────────────────────────────────────────────────────────────

/** 'YYYY-MM-DD' for the IST day containing `d`. */
function istDateKey(d = new Date()) {
  return new Date(d.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

/** [fromUnix, toUnix) for a whole IST day given its 'YYYY-MM-DD' key. */
function istDayBounds(dateKey) {
  const startUtcMs = new Date(`${dateKey}T00:00:00.000Z`).getTime() - IST_OFFSET_MS;
  return { fromUnix: Math.floor(startUtcMs / 1000), toUnix: Math.floor((startUtcMs + 86400e3) / 1000) };
}

async function readDigestState() {
  try {
    const { data } = await db.from('app_settings').select('value').eq('key', DIGEST_STATE_KEY).maybeSingle();
    if (!data?.value) return {};
    return typeof data.value === 'string' ? JSON.parse(data.value) : data.value;
  } catch (_) {
    return {};
  }
}

async function writeDigestState(state) {
  // Stored in app_settings rather than memory because the backend restarts on every
  // deploy. An in-memory "last sent" would re-send the same digest after each one.
  await db.from('app_settings').upsert({ key: DIGEST_STATE_KEY, value: JSON.stringify(state) }, { onConflict: 'key' });
}

function digestEmail(dateKey, failures) {
  const byReason = new Map();
  for (const p of failures) {
    const k = describeFailure(p);
    if (!byReason.has(k)) byReason.set(k, { n: 0, paise: 0 });
    const e = byReason.get(k);
    e.n += 1;
    e.paise += Number(p.amount || 0);
  }
  const ordered = [...byReason.entries()].sort((a, b) => b[1].n - a[1].n);
  const total = failures.reduce((m, p) => m + Number(p.amount || 0), 0);
  return {
    subject: `Payment failures ${dateKey}: ${failures.length} (Rs ${rupees(total)} not collected)`,
    html: `
      <p><strong>${failures.length}</strong> payment(s) failed on ${esc(dateKey)} (IST), worth
      <strong>Rs ${rupees(total)}</strong>. No customer was charged for any of these.</p>
      <table cellpadding="6" style="border-collapse:collapse">
        <tr><th align="left">Reason</th><th align="right">Count</th><th align="right">Value</th></tr>
        ${ordered.map(([k, v]) => `<tr><td>${esc(k)}</td><td align="right">${v.n}</td><td align="right">Rs ${rupees(v.paise)}</td></tr>`).join('')}
      </table>
      <p style="color:#666;font-size:12px">Timeouts and wrong PINs are the customer not finishing in
      their UPI app — normal, and not individually actionable. A method appearing here repeatedly
      is worth investigating.</p>`,
  };
}

/**
 * Send yesterday's digest if it is due and not already sent. Safe to call often —
 * it is a no-op until the hour passes, and the sent date is recorded in the DB so a
 * restart cannot cause a second one. Never throws.
 */
async function runDigestIfDue(now = new Date()) {
  try {
    if (!mailer.isConfigured() || !razorpay.isConfigured()) return { ran: false, reason: 'not_configured' };
    const istNow = new Date(now.getTime() + IST_OFFSET_MS);
    if (istNow.getUTCHours() < DIGEST_HOUR_IST) return { ran: false, reason: 'too_early' };

    const yesterday = istDateKey(new Date(now.getTime() - 86400e3));
    const state = await readDigestState();
    if (state.lastSentDate === yesterday) return { ran: false, reason: 'already_sent' };

    const { fromUnix, toUnix } = istDayBounds(yesterday);
    const payments = await razorpay.listPayments({ fromUnix, toUnix });
    const failures = payments.filter((p) => p.status === 'failed');

    // Record the date even with nothing to report, or every poll re-queries
    // Razorpay all day for a quiet day.
    if (!failures.length) {
      await writeDigestState({ ...state, lastSentDate: yesterday });
      return { ran: true, failures: 0, emailed: false };
    }

    const { subject, html } = digestEmail(yesterday, failures);
    const res = await mailer.sendAlertEmail({ subject, html });
    // Only record it as sent if it actually went, so a transient Resend outage
    // retries on the next tick instead of silently skipping a day.
    if (res.sent) await writeDigestState({ ...state, lastSentDate: yesterday });
    return { ran: true, failures: failures.length, emailed: res.sent, error: res.error };
  } catch (err) {
    console.error('[paymentFailureAlerts] digest failed:', err.message);
    return { ran: false, error: err.message };
  }
}

function startDigestTicker(intervalMs = 30 * 60 * 1000) {
  runDigestIfDue().catch(() => {});
  const t = setInterval(() => { runDigestIfDue().catch(() => {}); }, intervalMs);
  t.unref();
  return t;
}

module.exports = {
  DIGEST_STATE_KEY,
  classifyFailure,
  describeFailure,
  urgentEmail,
  digestEmail,
  istDateKey,
  istDayBounds,
  handlePaymentFailed,
  runDigestIfDue,
  startDigestTicker,
};
