// Outbound operational email — alerts to the owner, never to customers.
//
// Brevo's transactional API (free tier: 300 emails/day, which is ~300x the current
// alert volume).
//
// NO NEW DEPENDENCY ON PURPOSE. This backend had no email capability at all
// (checked 2026-10-16: no nodemailer, no SendGrid, no SMTP config anywhere), and
// Brevo's API is a single HTTPS POST, so axios — already a dependency — is enough.
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
//   BREVO_API_KEY    brevo.com -> SMTP & API -> API keys. Free tier is 300/day.
//   ALERT_EMAIL_TO   where alerts go — comma-separated for several recipients.
//                    Change this and restart; no code change, no redeploy.
//   ALERT_EMAIL_FROM the sender, "Astrowani Alerts <alerts@astrowani.com>" or a bare
//                    address. Brevo requires the ADDRESS to be a verified sender on
//                    the account (Senders & IPs -> Senders). A plain Gmail works, so
//                    no domain setup is needed — but an unverified address is
//                    rejected, and that is the likeliest reason a setup that looks
//                    correct delivers nothing.
const axios = require('axios');

const BREVO_ENDPOINT = 'https://api.brevo.com/v3/smtp/email';

const recipients = () => (process.env.ALERT_EMAIL_TO || '')
  .split(',').map((s) => s.trim()).filter(Boolean);

/** Accepts "Name <a@b.com>" or "a@b.com". Brevo wants the two parts separately. */
function parseSender(raw) {
  const s = String(raw || '').trim();
  const m = s.match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
  if (m) return { name: m[1] || 'Astrowani Alerts', email: m[2].trim() };
  return { name: 'Astrowani Alerts', email: s };
}

function isConfigured() {
  return Boolean(process.env.BREVO_API_KEY && parseSender(process.env.ALERT_EMAIL_FROM).email && recipients().length);
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
      console.warn('[mailer] BREVO_API_KEY / ALERT_EMAIL_FROM / ALERT_EMAIL_TO not all set — operational emails are disabled. See src/mailer.js.');
    }
    return { sent: false, skipped: 'not_configured' };
  }
  try {
    const res = await axios.post(
      BREVO_ENDPOINT,
      {
        sender: parseSender(process.env.ALERT_EMAIL_FROM),
        to: recipients().map((email) => ({ email })),
        subject,
        ...(html ? { htmlContent: html } : {}),
        ...(text ? { textContent: text } : {}),
      },
      {
        headers: { 'api-key': process.env.BREVO_API_KEY, 'Content-Type': 'application/json' },
        timeout: 10000,
      },
    );
    return { sent: true, id: res.data?.messageId };
  } catch (err) {
    const detail = err.response?.data ? JSON.stringify(err.response.data) : err.message;
    console.error('[mailer] could not send alert email:', detail);
    return { sent: false, error: detail };
  }
}

module.exports = { isConfigured, recipients, parseSender, sendAlertEmail };
