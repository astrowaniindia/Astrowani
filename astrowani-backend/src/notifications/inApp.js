// astrowani-backend/src/notifications/inApp.js
//
// One place that writes the in-app copy of a notification.
//
// WHAT THIS CLOSES. The `notifications` table held THREE types in 15,468 rows —
// admin_broadcast, admin_personal and a single wallet_debt_explanation — while the
// backend pushed fifteen others: order updates, delivered reports, support
// replies, "your astrologer is free now", referral rewards, missed sessions,
// recharge confirmations. Every one of those existed only for the seconds it sat
// in the phone's notification tray. Miss the banner and the message was gone, with
// nowhere in the app to find it. That is most of why the in-app list has a 0.17%
// read rate: there was nothing in it worth opening.
//
// WHY IT IS A HELPER AND NOT EIGHT INSERTS. The same row has to be written beside
// eight different `sendPush` calls in six files, and `src/recipients.js` exists
// because the last thing that was copied four times carried the same two defects in
// three of the copies. One function, one place to add a type, one place to fix a
// bug.
//
// IT IS NOT A CAMPAIGN AND IS DELIBERATELY NOT GOVERNED. No quiet hours, no
// frequency cap, no category opt-out is applied here. These are direct pushes that
// the backend already decided to send — this function only records what was sent so
// the person can find it again. Suppressing the RECORD of a notification that was
// already delivered would be worse than useless: the banner would arrive and the
// app would show nothing. Governing the direct pushes themselves is a separate,
// larger change and must not be smuggled in through here.
//
// EVERYTHING IS BEST-EFFORT AND NEVER THROWS. Every caller is mid-request on a path
// that matters more than this one — a support reply, an order status, a referral
// payout. A failure to write the in-app copy must never fail the thing it describes.

const { db } = require('./db');

/**
 * The types this helper knows, and where tapping one should go.
 *
 * `deepLink` MUST be a screen on the receiving app's allowlist
 * (DEEP_LINK_SCREENS in each app's src/utils/notificationDevice.js) — a name no
 * navigator knows does nothing visible, which is the failure a deep link exists to
 * prevent.
 *
 * `deepLink: null` does NOT mean "goes nowhere". It means the destination needs
 * parameters a bare screen name cannot carry — an astrologer id, a conversation id
 * — so the app routes it from `type` instead, through the same table that already
 * handles a tap on the push itself. Keeping those two routers as one is the point:
 * a type that works from the banner then works from the list, for free.
 */
const TYPES = {
  // ── customer ──
  support_reply: { audience: 'customer', category: 'transactional', deepLink: null },
  astrologer_free: { audience: 'customer', category: 'engagement', deepLink: null },
  missed_session: { audience: 'customer', category: 'transactional', deepLink: 'Home' },
  referral_reward: { audience: 'customer', category: 'transactional', deepLink: 'ReferFriend' },
  report_delivered: { audience: 'customer', category: 'transactional', deepLink: 'MyOrders' },
  order_update: { audience: 'customer', category: 'transactional', deepLink: 'MyOrders' },
  recharge_paid: { audience: 'customer', category: 'transactional', deepLink: 'Wallet' },
  // Sent to BOTH sides with the same type, hence the explicit audience on the call
  // rather than a lookup here — see recordInApp's `audience` override.
  report_update: { audience: 'customer', category: 'transactional', deepLink: 'MyOrders' },
  // ── astrologer ──
  payout_update: { audience: 'astrologer', category: 'transactional', deepLink: 'Wallet' },
};

// Latched so a database missing sql/notification_platform.sql logs once per process
// rather than on every notification, and degrades to writing the row without the
// new columns. Same posture as push.js's removal-column guard.
let richColumnsAvailable = true;

function isMissingColumn(err) {
  const msg = `${err?.message || ''} ${err?.details || ''}`.toLowerCase();
  return err?.code === '42703' || err?.code === 'PGRST204'
    || msg.includes('deep_link') || msg.includes('image_url') || msg.includes('category');
}

/** Strings only, and nothing enormous: this lands in a jsonb column that the app
 *  reads on every list render. */
function cleanData(data) {
  const out = {};
  if (!data || typeof data !== 'object') return out;
  for (const [k, v] of Object.entries(data)) {
    if (v === null || v === undefined) continue;
    if (typeof v === 'object') continue;
    out[k] = String(v).slice(0, 500);
  }
  return out;
}

/**
 * Record the in-app copy of a notification that has just been pushed.
 *
 * @param {object}  opts
 * @param {string}  opts.type          a key of TYPES. An unknown type is IGNORED
 *                                     rather than guessed at — see below.
 * @param {string} [opts.customerId]
 * @param {string} [opts.astrologerId]
 * @param {string}  opts.title
 * @param {string}  opts.body
 * @param {object} [opts.data]         ids the app needs to route the tap
 * @param {string} [opts.audience]     'customer' | 'astrologer', for the two types
 *                                     that go to both
 * @param {string} [opts.deepLink]     overrides the table
 * @param {string} [opts.imageUrl]
 * @param {string} [opts.expiresAt]    ISO; the list hides it afterwards
 *
 * @returns {Promise<{ok: boolean, reason?: string, id?: string}>} never rejects.
 */
async function recordInApp({
  type, customerId, astrologerId, title, body,
  data, audience, deepLink, imageUrl, expiresAt,
} = {}) {
  try {
    const client = db();
    if (!client) return { ok: false, reason: 'no_db' };

    const spec = TYPES[type];
    // An UNKNOWN type writes nothing. The alternative — inserting it with no
    // category and no destination — puts a row in front of a customer that goes
    // nowhere when tapped, which is the state this whole module exists to end. A
    // new type is one line in TYPES above.
    if (!spec) return { ok: false, reason: 'unknown_type' };

    const who = audience || spec.audience;
    const ownerId = who === 'astrologer' ? astrologerId : customerId;
    if (!ownerId) return { ok: false, reason: 'no_recipient' };
    if (!title && !body) return { ok: false, reason: 'no_copy' };

    const row = {
      customer_id: who === 'customer' ? ownerId : null,
      astrologer_id: who === 'astrologer' ? ownerId : null,
      title: String(title || 'Astrowani').slice(0, 200),
      body: String(body || '').slice(0, 1000),
      type,
    };
    if (richColumnsAvailable) {
      row.category = spec.category;
      row.deep_link = deepLink !== undefined ? deepLink : spec.deepLink;
      row.image_url = imageUrl || null;
      row.expires_at = expiresAt || null;
      row.data = cleanData(data);
    }

    const { data: inserted, error } = await client.from('notifications').insert([row]).select('id');
    if (error) {
      if (richColumnsAvailable && isMissingColumn(error)) {
        richColumnsAvailable = false;
        console.warn('[notifications] in-app rich columns missing — run sql/notification_platform.sql. '
          + 'Writing title/body only until then.');
        const { data: retry, error: retryErr } = await client.from('notifications')
          .insert([{
            customer_id: row.customer_id,
            astrologer_id: row.astrologer_id,
            title: row.title,
            body: row.body,
            type,
          }]).select('id');
        if (retryErr) throw retryErr;
        return { ok: true, id: retry?.[0]?.id };
      }
      throw error;
    }
    return { ok: true, id: inserted?.[0]?.id };
  } catch (err) {
    console.error(`[notifications] in-app record failed for ${type}:`, err.message);
    return { ok: false, reason: 'failed' };
  }
}

/**
 * Fire-and-forget form, for the common case: a `sendPush` call that must not wait
 * on bookkeeping and must not be able to fail because of it.
 *
 * Returns nothing on purpose, so a caller cannot accidentally `await` it into its
 * own critical path.
 */
function recordInAppAsync(opts) {
  recordInApp(opts).catch(() => {});
}

module.exports = { recordInApp, recordInAppAsync, TYPES };
