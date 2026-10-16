// Outbound operational email — alerts to the owner, never to customers.
//
// NO NEW DEPENDENCY ON PURPOSE. This backend had no email capability at all
// (checked 2026-10-16: no nodemailer, no SendGrid, no SMTP config anywhere), and
// Resend's API is a single HTTPS POST, so axios — already a dependency — is enough.
// An SMTP library would have meant a new package, connection pooling and a class of
// timeout bugs, for one POST.
//
// FAILS SOFT, ALWAYS. Every caller is a side-effect on a path that matters more than
// the email does: the Razorpay webhook must return 200 so Razorpay does not retry a
// payment we already handled, and the digest must not crash a ticker. So nothing here
// throws — a failure is logged and reported in the return value.
//
// SETUP (nothing is sent until all three are set; with none set this is a no-op that
// logs once, so deploying it changes nothing):
//   RESEND_API_KEY   from resend.com (free tier: 3,000 emails/month, 100/day)
//   ALERT_EMAIL_TO   where alerts go — comma-separated for several recipients.
//                    Change this and restart; no code change, no redeploy.
//   ALERT_EMAIL_FROM a sender on a domain verified in Resend, e.g.
//                    "Astrowani Alerts <alerts@astrowani.com>". Resend REFUSES an
//                    unverified sender domain, which is the single most likely reason
//                    a correctly-configured-looking setup sends nothing.
const axios = require('axios');

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

const recipients = () => (process.env.ALERT_EMAIL_TO || '')
  .split(',').map((s) => s.trim()).filter(Boolean);

function isConfigured() {
  return Boolean(process.env.RESEND_API_KEY && process.env.ALERT_EMAIL_FROM && recipients().length);
}

let warnedUnconfigured = false;

/**
 * @returns {Promise<{sent:boolean, skipped?:string, id?:string, error?:string}>}
 *          Never throws.
 */
async function sendAlertEmail({ subject, html, text }) {
  if (!isConfigured()) {
    // Once, not per alert: an unconfigured server would otherwise print this on
    // every failed payment and bury everything else in the log.
    if (!warnedUnconfigured) {
      warnedUnconfigured = true;
      console.warn('[mailer] RESEND_API_KEY / ALERT_EMAIL_FROM / ALERT_EMAIL_TO not all set — operational emails are disabled. See src/mailer.js.');
    }
    return { sent: false, skipped: 'not_configured' };
  }
  try {
    const res = await axios.post(
      RESEND_ENDPOINT,
      {
        from: process.env.ALERT_EMAIL_FROM,
        to: recipients(),
        subject,
        ...(html ? { html } : {}),
        ...(text ? { text } : {}),
      },
      {
        headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
        timeout: 10000,
      },
    );
    return { sent: true, id: res.data?.id };
  } catch (err) {
    const detail = err.response?.data ? JSON.stringify(err.response.data) : err.message;
    console.error('[mailer] could not send alert email:', detail);
    return { sent: false, error: detail };
  }
}

module.exports = { isConfigured, recipients, sendAlertEmail };
