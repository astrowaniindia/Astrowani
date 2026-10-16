/**
 * "New Signup Flow 17th Oct" — the analytics for the flow shipped on 2026-10-17.
 *
 * THE FLOW THIS MEASURES. A signed-out visitor opens the app and gets a gift box;
 * tapping it bursts into "YOU WIN · 11 minute free call"; after a reading beat the app
 * hands over to the free 11-minute panel itself, and a card rises over the bottom of it
 * carrying the whole sign-up — phone, OTP and name, without leaving the screen. The
 * card cannot be dismissed. (Before this, the reveal ended by replacing itself with the
 * full-screen Login form.)
 *
 * WHY THIS IS A SEPARATE MODULE AND A SEPARATE PAGE, rather than more cards on
 * Analytics. The existing auth funnels (`/analytics/auth-funnel`,
 * `/analytics/signup-to-consult`) measure the OLD route — Login screen → VerifyOtp →
 * SignupName — and they still matter, because that route is still live for anyone the
 * 401 interceptor or an explicit sign-out sends to Login. Folding both into one funnel
 * would average two different products together and neither number would mean
 * anything. These are deliberately parallel, not a replacement.
 *
 * ⚠️ THE LAUNCH DATE IS LOAD-BEARING. None of these events existed before
 * 2026-10-17, so any range reaching further back reports zeros that look like a
 * collapse rather than like "not shipped yet". Every response carries `launchedOn` and
 * `rangeStartsBeforeLaunch`, and the page says so instead of drawing an empty chart.
 *
 * Every query interpolates ENV_FILTER — production only, from the admin's chosen start
 * date, with excluded customers removed. See the note at the bottom of postHogRoutes.js.
 */

const { requireAdmin } = require('./adminRoutes');
const {
  runHogQL, isConfigured, ENV_FILTER, resolveDateWhere,
} = require('./postHogRoutes');

// The day the flow shipped. Nothing below this date can have produced these events.
const LAUNCHED_ON = '2026-10-17';

const h = (fn) => (req, res) => fn(req, res).catch((err) => {
  console.error('[newSignupFlow]', err?.response?.data || err.message);
  return res.status(502).json({ success: false, message: 'Analytics query failed.' });
});

function requireConfigured(req, res, next) {
  if (!isConfigured()) {
    return res.status(503).json({ success: false, message: 'PostHog is not configured on this server.' });
  }
  return next();
}

/**
 * ONE ROW PER PERSON, COUNTED WITH count(DISTINCT ...), not one row per event.
 *
 * A visitor who retypes a wrong OTP three times fires `signup_gate_phone_submitted`
 * three times, and on an event-count basis that stage would read HIGHER than the stage
 * above it — a funnel that widens as it descends, which is unreadable. Persons is also
 * the only basis on which "68% of people who saw the card finished" is a true sentence.
 */
const step = (key, label, cond) => ({ key, label, cond });

// ── Funnel 1: gift box → signed in ───────────────────────────────────────────
// Entry is the REVEAL, not the app opening: this funnel answers "of the people who
// were shown the prize, how many finished", and someone who never saw it was never in
// this flow at all.
const ACQUIRE = [
  step('reveal_shown', 'Gift box shown', `event = 'campaign_gift_reveal_shown'`),
  step('reveal_opened', 'Gift opened', `event = 'campaign_gift_reveal_opened'`),
  step('panel_shown', 'Free-call panel reached', `event = 'free_call_instant_opened' AND properties.signed_out = true`),
  step('gate_shown', 'Sign-up card shown', `event = 'signup_gate_shown'`),
  step('phone_entered', 'Number entered', `event = 'signup_gate_phone_submitted'`),
  step('otp_shown', 'OTP step reached', `event = 'signup_gate_otp_shown'`),
  step('signed_in', 'Signed in', `event = 'signup_gate_completed'`),
];

// ── Funnel 2: signed in → actually talked to someone ─────────────────────────
// The point of the flow is not the account, it is the call. Restricted to people who
// finished the CARD, so it cannot be inflated by customers who signed up some other
// way and later used the free panel.
const ACTIVATE = [
  step('signed_in', 'Signed in through the card', `event = 'signup_gate_completed'`),
  step('panel_live', 'Reached the live panel', `event = 'free_call_instant_opened' AND properties.signed_out = false`),
  step('rang', 'Rang an astrologer', `event = 'free_call_instant_ring'`),
  step('answered', 'Astrologer answered', `event = 'free_call_instant_answered'`),
];

const selectSteps = (steps) => steps
  .map((s) => `count(DISTINCT if(${s.cond}, person_id, NULL)) AS ${s.key}`)
  .join(',\n          ');

const toStages = (steps, row) => steps.map((s, i) => ({
  key: s.key,
  label: s.label,
  count: Number(row?.[i]) || 0,
}));

module.exports = function registerNewSignupFlowRoutes(app) {
  app.get('/api/admin/analytics/new-signup-flow', requireAdmin, requireConfigured, h(async (req, res) => {
    const dateWhere = resolveDateWhere(req, { defaultDays: 14 });
    const scope = `properties.app = 'customer' AND ${ENV_FILTER}`;

    const [acquireRows, activateRows, entryRows, dropRows, outcomeRows] = await Promise.all([
      runHogQL(`
        SELECT ${selectSteps(ACQUIRE)}
        FROM events WHERE ${scope} AND ${dateWhere}
      `),
      // Scoped to the people who finished the card IN THIS RANGE. Without the
      // person_id restriction this would count every free call on the platform.
      runHogQL(`
        SELECT ${selectSteps(ACTIVATE)}
        FROM events WHERE ${scope} AND ${dateWhere}
          AND person_id IN (
            SELECT person_id FROM events
            WHERE event = 'signup_gate_completed' AND ${scope} AND ${dateWhere}
          )
      `),
      // How signed-out visitors arrive at the panel. 'direct' is the second-launch
      // path — the reveal is once per install, so a visitor who closed the app part
      // way through comes back straight to the panel with no gift box. That number
      // climbing is the signal that people are leaving and returning.
      runHogQL(`
        SELECT
          count(DISTINCT if(properties.via = 'gift_reveal', person_id, NULL)) AS via_reveal,
          count(DISTINCT if(properties.via = 'direct', person_id, NULL)) AS via_direct
        FROM events
        WHERE event = 'free_call_instant_opened' AND properties.signed_out = true
          AND ${scope} AND ${dateWhere}
      `),
      // Where the card itself breaks, and why. `signup_gate_failed` carries the step
      // and the server's own reason code, so a cliff in the funnel above can be read
      // against an actual cause instead of guessed at.
      runHogQL(`
        SELECT properties.step AS step, properties.reason AS reason, count() AS n
        FROM events
        WHERE event = 'signup_gate_failed' AND ${scope} AND ${dateWhere}
        GROUP BY step, reason ORDER BY n DESC LIMIT 15
      `),
      // New account vs returning number. One phone box serves both, so a card that
      // looks like it is "signing up" 200 people may be logging most of them back in.
      runHogQL(`
        SELECT
          count(DISTINCT if(properties.how = 'signup', person_id, NULL)) AS new_accounts,
          count(DISTINCT if(properties.how = 'login', person_id, NULL)) AS returning,
          count(DISTINCT if(event = 'campaign_gift_reveal_abandoned', person_id, NULL)) AS left_on_box
        FROM events
        WHERE ${scope} AND ${dateWhere}
          AND event IN ('signup_gate_completed', 'campaign_gift_reveal_abandoned')
      `),
    ]);

    const range = { days: Number(req.query.days) || undefined, from: req.query.from, to: req.query.to };
    const [entry] = entryRows;
    const [outcome] = outcomeRows;

    return res.json({
      success: true,
      basis: 'persons',
      launchedOn: LAUNCHED_ON,
      acquire: toStages(ACQUIRE, acquireRows[0]),
      activate: toStages(ACTIVATE, activateRows[0]),
      entry: {
        viaReveal: Number(entry?.[0]) || 0,
        viaDirect: Number(entry?.[1]) || 0,
      },
      outcome: {
        newAccounts: Number(outcome?.[0]) || 0,
        returning: Number(outcome?.[1]) || 0,
        leftOnBox: Number(outcome?.[2]) || 0,
      },
      failures: (dropRows || []).map(([s, reason, n]) => ({
        step: s || 'unknown',
        reason: reason || 'unknown',
        count: Number(n) || 0,
      })),
      range,
    });
  }));

  console.log('[newSignupFlow] Registered GET /api/admin/analytics/new-signup-flow');
};

module.exports.LAUNCHED_ON = LAUNCHED_ON;
