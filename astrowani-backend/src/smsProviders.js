// OTP SMS delivery with automatic failover between providers.
//
// WHY THIS EXISTS (2026-08-20). On 2026-08-20 OTP SMS stopped arriving. It was
// investigated end to end and the cause was NOT in this codebase: a message
// composed and sent from EnableX's own "Try Now" dashboard — same project,
// campaign 1245560, sender ASTRWI, template "OTP for astrowani", same recipient,
// no involvement from our backend at all — came back "Not Delivered" exactly
// like ours. The account was funded (₹10,295), the campaign ACTIVE, our payload
// byte-identical to the 16 messages that delivered the previous day, and no
// commit had touched the OTP path in between.
//
// The real defect was architectural: a single SMS provider going quiet took down
// login AND signup for both apps, with no recourse and nothing anyone could do
// but wait. That is what this module fixes. Whose fault the outage is stops
// mattering if a second provider can carry the message.
//
// DESIGN NOTES
//
// - The SAME otp is passed to every provider. If both end up delivering, the
//   user receives two identical codes, which is harmless. Generating a fresh
//   code per provider would be actively dangerous: only one is stored, so
//   whichever SMS arrived first could be the dead one — the precise bug that
//   the atomic claim in otpStore.claimAndSet was written to eliminate.
// - Failover is on DISPATCH, not delivery. Waiting for a delivery receipt takes
//   tens of seconds to minutes, far beyond the apps' 20s client timeout, so it
//   cannot gate a login request. "The provider accepted it and shows it as
//   sent" is the strongest signal available inside a request.
// - Every provider is optional. With none configured beyond EnableX this
//   behaves exactly as before, so deploying it changes nothing until a fallback
//   is actually set up.

const axios = require('axios');

// ── EnableX ──────────────────────────────────────────────────────────────────

const ENABLEX_APP_ID = process.env.ENABLEX_APP_ID_otp_message;
const ENABLEX_APP_KEY = process.env.ENABLEX_APP_KEY_otp_message;
const ENABLEX_SMS_CAMPAIGN_ID = '1245560';
const ENABLEX_SMS_TEMPLATE_ID = '463430427'; // "OTP for astrowani" (DLT 1207172007863021380)
const ENABLEX_SMS_SENDER_ID = 'ASTRWI';

// Kept below both apps' 20s client timeout so the BACKEND always decides a send
// failed and can act on it, rather than the app giving up first while the server
// carries on and stores an OTP the user was told never arrived.
const SEND_TIMEOUT_MS = 10000;
// How long to let a job register before asking whether it actually dispatched.
// Successful sends have shown sent=1 within ~1s (delivery receipt at +1s on
// 2026-08-19), so 1.5s is comfortably past that without adding real latency.
const DISPATCH_CHECK_DELAY_MS = 1500;

const enablexAuth = () =>
  Buffer.from(`${ENABLEX_APP_ID}:${ENABLEX_APP_KEY}`).toString('base64');

function enablexConfigured() {
  return Boolean(ENABLEX_APP_ID && ENABLEX_APP_KEY);
}

/**
 * Ask EnableX whether a job actually went out.
 * @returns true (dispatched), false (positively NOT dispatched), or null (unknown).
 *
 * null and false are deliberately different. Only a positive "nothing was sent"
 * should trigger failover — a network blip on the status call must not cause a
 * duplicate SMS through another provider.
 */
async function enablexDispatched(jobId) {
  try {
    const { data } = await axios.get(`https://api.enablex.io/sms/v1/message/${jobId}`, {
      headers: { Authorization: `Basic ${enablexAuth()}` },
      timeout: 5000,
    });
    const s = data?.summary;
    if (!s) return null;
    if (Number(s.sent) > 0 || Number(s.delivered) > 0) return true;
    // The exact signature of the 2026-08-20 outage: accepted, job issued,
    // every counter zero.
    if (Number(s.total) === 0 && Number(s.sent) === 0
      && Number(s.failed) === 0 && Number(s.credit_used) === 0) return false;
    return null;
  } catch (_) {
    return null;
  }
}

async function sendViaEnableX(e164, otp) {
  if (!enablexConfigured()) return { ok: false, provider: 'enablex', reason: 'not configured' };
  try {
    const { data } = await axios.post(
      'https://api.enablex.io/sms/v1/messages/',
      {
        from: ENABLEX_SMS_SENDER_ID,
        to: [e164],
        type: 'sms',
        campaign_id: ENABLEX_SMS_CAMPAIGN_ID,
        template_id: ENABLEX_SMS_TEMPLATE_ID,
        data: { var1: otp }, // fills {$var1} in the approved template
        data_coding: 'plain',
      },
      {
        headers: { Authorization: `Basic ${enablexAuth()}`, 'Content-Type': 'application/json' },
        timeout: SEND_TIMEOUT_MS,
      },
    );
    // EnableX signals business failures in the BODY with HTTP 200, so axios does
    // not throw and status alone proves nothing.
    if (data?.result !== 0 || !data?.job_id) {
      return { ok: false, provider: 'enablex', reason: `rejected (result=${data?.result})`, body: data };
    }
    return { ok: true, provider: 'enablex', id: data.job_id };
  } catch (err) {
    return { ok: false, provider: 'enablex', reason: err?.response?.data?.desc || err.message };
  }
}

// ── MSG91 (fallback) ─────────────────────────────────────────────────────────
//
// Entirely env-driven and absent by default. MSG91 needs its own DLT-registered
// template; the variable name below must match whatever that template declares.
const MSG91_AUTH_KEY = process.env.MSG91_AUTH_KEY;
const MSG91_TEMPLATE_ID = process.env.MSG91_TEMPLATE_ID;
const MSG91_OTP_VAR = process.env.MSG91_OTP_VAR || 'otp';

function msg91Configured() {
  return Boolean(MSG91_AUTH_KEY && MSG91_TEMPLATE_ID);
}

async function sendViaMsg91(e164, otp) {
  if (!msg91Configured()) return { ok: false, provider: 'msg91', reason: 'not configured' };
  try {
    // MSG91 wants the number without a leading '+'.
    const mobiles = String(e164).replace(/^\+/, '');
    const { data } = await axios.post(
      'https://control.msg91.com/api/v5/flow/',
      { template_id: MSG91_TEMPLATE_ID, recipients: [{ mobiles, [MSG91_OTP_VAR]: otp }] },
      { headers: { authkey: MSG91_AUTH_KEY, 'Content-Type': 'application/json' }, timeout: SEND_TIMEOUT_MS },
    );
    // MSG91 answers {type:'success'|'error', message:'<id or reason>'}.
    if (String(data?.type).toLowerCase() !== 'success') {
      return { ok: false, provider: 'msg91', reason: data?.message || 'rejected', body: data };
    }
    return { ok: true, provider: 'msg91', id: data?.message };
  } catch (err) {
    return { ok: false, provider: 'msg91', reason: err?.response?.data?.message || err.message };
  }
}

// ── Orchestration ────────────────────────────────────────────────────────────

/**
 * Send one OTP, failing over to the next provider when the current one cannot
 * be shown to have dispatched it.
 *
 * @param e164  recipient in +91XXXXXXXXXX form
 * @param otp   the code — the SAME value is used for every provider (see header)
 * @param log   optional (scope, err, context) logger, wired to errorLogger
 * @returns {ok, provider, id, attempts[]}  ok=false only if EVERY provider failed
 */
async function sendOtpSms(e164, otp, log) {
  const attempts = [];

  const primary = await sendViaEnableX(e164, otp);
  attempts.push({ provider: 'enablex', ok: primary.ok, reason: primary.reason });

  if (primary.ok) {
    // Accepted — but acceptance is not dispatch. This is the check that would
    // have caught the 2026-08-20 outage in the first request instead of leaving
    // users staring at an OTP screen for a message that never existed.
    await new Promise((r) => setTimeout(r, DISPATCH_CHECK_DELAY_MS));
    const dispatched = await enablexDispatched(primary.id);
    if (dispatched !== false) {
      // true (confirmed) or null (could not tell) — do not send a second SMS on
      // a guess.
      return { ok: true, provider: 'enablex', id: primary.id, attempts };
    }
    attempts[0].reason = 'accepted but never dispatched (all counters zero)';
    if (log) {
      log('sms-failover', new Error('EnableX accepted an SMS it never dispatched'), {
        phone: e164, jobId: primary.id,
      });
    }
  }

  if (!msg91Configured()) {
    // Nothing to fall back to. Say so explicitly — the whole point of this
    // module is that this line is what a future outage looks like in the log.
    console.log(`[sms] no fallback provider configured; ${e164} has no second route`);
    // ok:false here even though the provider "accepted" it. Reaching this point
    // means either the send was rejected outright, or it was accepted and then
    // positively confirmed as never dispatched. Reporting success for a message
    // that demonstrably does not exist is the original 2026-08-20 failure mode:
    // the app opened an OTP screen and the user waited for nothing.
    return { ok: false, provider: 'enablex', id: primary.id, attempts, noFallback: true };
  }

  console.log(`[sms] failing over to MSG91 for ${e164} (enablex: ${attempts[0].reason})`);
  const fallback = await sendViaMsg91(e164, otp);
  attempts.push({ provider: 'msg91', ok: fallback.ok, reason: fallback.reason });
  if (fallback.ok) {
    if (log) {
      log('sms-failover', new Error('Primary SMS provider failed; delivered via fallback'), {
        phone: e164, attempts,
      });
    }
    return { ok: true, provider: 'msg91', id: fallback.id, attempts };
  }

  return { ok: false, provider: null, attempts };
}

module.exports = {
  sendOtpSms,
  sendViaEnableX,
  sendViaMsg91,
  enablexDispatched,
  enablexConfigured,
  msg91Configured,
};
