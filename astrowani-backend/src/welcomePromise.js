// The welcome promise: the free call the app has ALREADY told a new visitor they won.
//
// ── WHY THIS EXISTS ───────────────────────────────────────────────────────────
// screens/FreeCall/CampaignGiftReveal.js says "YOU WIN!" and "aapne jeet li hai
// 7 minute ki free call" to EVERY signed-out first cold start — organic installs
// and every iPhone included, not just paid-campaign ones (acquisition.js
// isTargetCampaignFirstOpen ignores the referrer entirely; the "campaign" in the
// file name is a leftover from when it did not). It makes that promise with no
// eligibility check of any kind, before the visitor even has an account.
//
// Four things could then refuse the call after they signed up: free_call_offer
// .enabled, the mode:'selected' astrologer allowlist, audience_rules, and
// offerGuard. Told you won -> signed up -> did not get it.
//
// Owner's decision (2026-10-19): if we say "you win", they get the reward. So this
// module makes the promise true at the moment the account is created, rather than
// softening the wording. The reveal screen is untouched.
//
// ── HOW ───────────────────────────────────────────────────────────────────────
// By writing the same `free_call_invites` row the admin's "Invite customers to a
// free call" card writes (CLAUDE.md CR). That row already means exactly "this
// customer gets the offer, whatever else is switched off": freeCallRoutes.js lets
// an invite past offer.enabled (:1329, :2108, :2152), audience_rules (:1239,
// :1345, :2168), and the brand-new-customer rule (:1248, :1357, :2174). Nothing
// new had to be allowed to bypass anything — this is the existing mechanism,
// granted automatically instead of by hand.
//
// ⚠ THE ONE CONSEQUENCE TO KNOW: after this, switching free_call_offer.enabled
// off no longer stops the free call reaching NEW signups, because each of them now
// holds an invite. `free_call_welcome_promise.enabled` is their switch. Turning it
// off should go together with turning the reveal screen off
// (CAMPAIGN_GIFT_REVEAL_ENABLED), or the screen promises what the server refuses —
// which is the whole bug this closes. This is recorded as the fourth route in
// CLAUDE.md's "THREE WAYS THE FREE CALL CAN BE LIVE WHEN YOU THINK IT IS NOT".
//
// ── WHO GETS IT, TODAY AND LATER ─────────────────────────────────────────────
// Today: EVERYONE, because that is who the screen promises it to. Later it narrows
// to particular ad sources or kinds of visitor — and that needs NO code change,
// because "who" is the existing Audience Targeting feature `welcome_promise`
// (src/audience.js, admin -> Audience Targeting), matched on the
// acquisition_source written a few lines earlier in the same signup. An admin
// picks the segments there; empty/absent means everyone, which is the default.
//
// ── FAIL DIRECTIONS, AND WHY THEY ARE NOT ALL THE SAME ───────────────────────
// This module GRANTS an offer, so its instinct should be to fail closed the way
// freeCallRoutes.isNewCustomer does — a free call is a real astrologer's time. It
// deliberately does the opposite for the CONFIG read: an unreadable settings row
// means grant, because by the time this runs the app has already told the person
// they won, and a database blip must not turn that into a lie. The exposure is one
// free call per phone number ever, which offerGuard still bounds.
//
// The two checks that DO refuse:
//   * offerGuard FREE_CALL (failClosed) — this number already used its free call on
//     an account that was then deleted. Honouring the promise is not the same as
//     letting it be farmed by deleting and re-registering (CLAUDE.md CY), and the
//     owner asked for this one to stay.
//   * an explicit `enabled: false` in the settings row.
//
// Everything here is best-effort and never throws: the account exists by the time
// it runs, and no failure to grant a marketing offer may fail a signup.
const { createClient } = require('@supabase/supabase-js');

const audienceRules = require('./audience');
const offerGuard = require('./offerGuard');

// Service role, same as audience.js and freeCallRoutes.js: this writes an invite
// row that anon and authenticated hold zero privileges on (hardening_15/17).
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://fxpoustnddrgumhwdcma.supabase.co';
const db = createClient(SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const SETTINGS_KEY = 'free_call_welcome_promise';

/** The Audience Targeting feature key that decides WHO. Added to audience.FEATURES. */
const AUDIENCE_FEATURE = 'welcome_promise';

const DEFAULTS = Object.freeze({
  // ON, and that is the point: the screen is already promising it to everyone.
  enabled: true,
  // How long the granted invite lasts. Long enough that somebody who signs up and
  // only comes back the following week still has what they were promised; short
  // enough that it is a welcome offer rather than an entitlement with no end. The
  // admin card's own default is 7 days, which is too short for a promise the
  // person did not ask for and may not act on the same day.
  validDays: 30,
});

const CACHE_MS = 60 * 1000;
let cached = null;
let cachedAt = 0;

/** Drop the cache (used by the settings PATCH and by tests). */
function invalidateWelcomePromiseCache() {
  cached = null;
  cachedAt = 0;
}

function normalise(parsed) {
  const out = { ...DEFAULTS };
  if (!parsed || typeof parsed !== 'object') return out;
  // Only a LITERAL false switches it off. A typo, a half-written blob or an older
  // row all read as on, so nothing can silently stop honouring the promise.
  if (parsed.enabled === false) out.enabled = false;
  const days = Number(parsed.validDays);
  if (Number.isFinite(days) && days >= 1 && days <= 365) out.validDays = Math.floor(days);
  return out;
}

/**
 * The live config. Defaults (i.e. ON) on a missing key, bad JSON or a read error —
 * see the fail-direction note above.
 */
async function loadConfig() {
  if (cached && Date.now() - cachedAt < CACHE_MS) return cached;
  let parsed = null;
  try {
    const { data, error } = await db
      .from('app_settings')
      .select('value')
      .eq('key', SETTINGS_KEY)
      .limit(1);
    if (!error && data && data.length) {
      const raw = data[0].value;
      parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    }
  } catch (_) {
    parsed = null;
  }
  cached = normalise(parsed);
  cachedAt = Date.now();
  return cached;
}

/**
 * Honour the reveal screen's promise for an account that was just created.
 *
 * Call ONLY on the branch that creates the customer row, never on the
 * existing-customer branch — the same rule acquisition attribution follows. A
 * returning customer logging in has not just been promised anything, and a login
 * is not a signup.
 *
 * @param {string} customerId  the new customers.id
 * @param {object} opts
 * @param {string} opts.mobile              the phone number, for the offer guard
 * @param {string|null} [opts.acquisitionSource]  what was just written to
 *        customers.acquisition_source — passed in rather than re-read, so this
 *        cannot race the update that is still settling.
 * @returns {Promise<{granted: boolean, reason: string}>} never throws
 */
async function grantOnSignup(customerId, opts = {}) {
  try {
    if (!customerId) return { granted: false, reason: 'no_customer' };

    const cfg = await loadConfig();
    if (!cfg.enabled) return { granted: false, reason: 'disabled' };

    // WHO. Today every segment is allowed, so this is a no-op; it is the hook an
    // admin narrows later without a deploy. audience.isAllowed fails OPEN by
    // design, which is the right direction here too.
    const allowed = await audienceRules.isAllowed(
      { acquisition_source: opts.acquisitionSource || null },
      AUDIENCE_FEATURE,
    );
    if (!allowed) return { granted: false, reason: 'audience' };

    // The one refusal kept on purpose: this number already had its free call on an
    // account that has since been deleted.
    if (opts.mobile) {
      const claimed = await offerGuard.claimedByOther(
        opts.mobile, offerGuard.OFFERS.FREE_CALL, customerId, { failClosed: true },
      );
      if (claimed) return { granted: false, reason: 'claimed_by_earlier_account' };
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + cfg.validDays * 86400000).toISOString();

    // Upsert on customer_id, matching the admin card and the table's
    // free_call_invites unique constraint — so a retried OTP verify refreshes one
    // row instead of failing on a duplicate key.
    const { error } = await db.from('free_call_invites').upsert(
      {
        customer_id: customerId,
        invited_at: now.toISOString(),
        expires_at: expiresAt,
        invited_by: 'welcome_promise',
      },
      { onConflict: 'customer_id' },
    );
    if (error) {
      // A missing table means sql/free_call_invites.sql was never applied. Say so
      // loudly — the app is making a promise nothing is recording — but let the
      // signup stand.
      console.warn('[welcomePromise] could not grant the welcome free call:', error.message);
      return { granted: false, reason: 'write_failed' };
    }
    return { granted: true, reason: 'granted' };
  } catch (e) {
    console.warn('[welcomePromise] grant threw, signup unaffected:', e.message);
    return { granted: false, reason: 'threw' };
  }
}

module.exports = {
  SETTINGS_KEY,
  AUDIENCE_FEATURE,
  DEFAULTS,
  normalise,
  loadConfig,
  invalidateWelcomePromiseCache,
  grantOnSignup,
};
