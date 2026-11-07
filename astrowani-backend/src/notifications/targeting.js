// astrowani-backend/src/notifications/targeting.js
//
// Who gets it, and who is held back.
//
// Two separate jobs, deliberately in one file because they are the two halves of
// one question and splitting them invites a caller that does the first and forgets
// the second:
//
//   1. RESOLVE — turn an audience + filters into a list of people.
//   2. GOVERN  — decide which of those people must NOT be sent to right now, and
//                say why: opted out, quiet hours, frequency cap, no device.
//
// THE RULE THAT OVERRIDES EVERYTHING HERE: a `transactional` notification is never
// governed. A chat request, an incoming call, an order update and a support reply
// ignore quiet hours, frequency caps and category opt-outs, because the cost of
// holding one back is a customer missing a consultation they have paid for. Only
// `engagement` and `promotional` pass through the governor at all.

const { db, pageAll } = require('./db');
const audienceRules = require('../audience');
const { buildRecipients } = require('../recipients');
const { safeInValues } = require('../pgrstFilter');

const GOVERNED = new Set(['engagement', 'promotional']);

// How many uuids may go into one `.in()`. 150 is this project's own established
// figure — see the comment on chunkIds in src/pagedSelect.js ("150 UUIDs ~= 5.6
// KB, comfortably inside every default limit") and the 414 that ~1000 of them
// caused. Not a number to raise casually: the failure is an HTTP 414 from a URL
// nobody can see.
const ID_CHUNK = 150;

// Platform defaults, overridable per customer in notification_preferences and
// globally in app_settings.notification_limits.
//
// 22:00–08:00 IST is quiet. The published India timing research puts the useful
// windows at 8–9am, 12–1pm and 8–10pm, so this blocks nothing anybody wants.
const DEFAULTS = {
  quietStart: 22,
  quietEnd: 8,
  // "46% of users opt out if they receive 2–5 push messages per week" — so one
  // promotional a day is already generous, and the history shows the same Diwali
  // offer going out three times in 24 hours.
  promoPerDay: 1,
  totalPerDay: 3,
};

let cached = null;
let cachedAt = 0;
const CACHE_MS = 60 * 1000;

/** Global limits from app_settings.notification_limits, merged over DEFAULTS.
 *  Fails to the DEFAULTS: an unreadable setting must not mean "no limits". */
async function loadLimits() {
  if (cached && Date.now() - cachedAt < CACHE_MS) return cached;
  const client = db();
  let parsed = {};
  if (client) {
    try {
      const { data } = await client.from('app_settings').select('value').eq('key', 'notification_limits').maybeSingle();
      if (data?.value) parsed = typeof data.value === 'string' ? JSON.parse(data.value) : data.value;
    } catch (_) { parsed = {}; }
  }
  const out = { ...DEFAULTS };
  for (const k of Object.keys(DEFAULTS)) {
    const v = Number(parsed?.[k]);
    if (Number.isFinite(v) && v >= 0) out[k] = v;
  }
  cached = out;
  cachedAt = Date.now();
  return out;
}

function invalidateLimitsCache() { cached = null; }

// ───────────────────────────────────────────────────────────────── 1. RESOLVE ──

/**
 * @returns {Promise<{recipients: Array, recipientType: 'customer'|'astrologer', skippedSegment: number, truncated: boolean}>}
 *
 * Customers go through the notification_audience SQL function, which is the only
 * thing that can answer "11 consultations, quiet 20 days, wallet under ₹20"
 * without dragging chat_sessions across the network.
 *
 * Astrologers go through the existing recipients.js. They have no acquisition
 * source, no wallet-recharge history and no free-call state, so almost none of the
 * filter vocabulary applies to them — writing a second SQL function to support
 * three usable filters would be worse than reusing the path that already works.
 */
async function resolveAudience({ audience, targetIds, filters = {}, segments } = {}) {
  const client = db();
  const recipientType = (audience === 'astrologer' || audience === 'all_astrologers') ? 'astrologer' : 'customer';

  if (recipientType === 'astrologer') {
    const built = await buildRecipients(client, 'astrologers', {
      targetIds: Array.isArray(targetIds) && targetIds.length ? targetIds : null,
      extraCols: 'first_name, last_name',
    });
    return {
      recipientType,
      recipients: built.recipients.map((r) => ({
        id: r.id,
        name: `${r.first_name || ''} ${r.last_name || ''}`.trim() || 'Astrologer',
        fcm_token: r.fcm_token,
        locale: null,
        platform: null,
      })),
      skippedSegment: 0,
      truncated: built.truncated,
    };
  }

  // A personal send names its people. An admin picking somebody by hand means it,
  // so no filter and no segment is applied on top — the same decision
  // recipients.js already takes, and for the same reason.
  if (Array.isArray(targetIds) && targetIds.length) {
    const built = await buildRecipients(client, 'customers', { targetIds, extraCols: 'name' });
    return {
      recipientType,
      recipients: built.recipients.map((r) => ({ id: r.id, name: r.name || 'Customer', fcm_token: r.fcm_token, locale: null, platform: null })),
      skippedSegment: 0,
      truncated: built.truncated,
    };
  }

  // ── THE RPC MUST BE PAGED ─────────────────────────────────────────────────
  // PostgREST caps a response body at `db-max-rows`, measured at 1000 against this
  // project, and a SET-RETURNING FUNCTION IS NO EXCEPTION. The comment that used to
  // sit here said the opposite — "the RPC returns the whole set in one body; no
  // 1000-row cap" — and it was wrong: an audience of 4,858 customers came back as
  // 1,000 with no error of any kind, which is the worst shape a bug can take on a
  // notification path and is exactly the defect recipients.js was written to kill.
  // Caught by scripts/notificationPlatformCheck.js, where a filter matching
  // thousands of people did not contain the one customer it was asked about.
  //
  // The function carries `order by c.id` so paging is stable; without a
  // deterministic order, paging a cap can miss or repeat rows.
  const PAGE = 1000;
  const HARD_STOP = 500000;
  let rows = [];
  let hitHardStop = false;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await client
      .rpc('notification_audience', { p_filters: filters || {} })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    const batch = data || [];
    rows.push(...batch);
    if (batch.length < PAGE) break;
    if (from + PAGE >= HARD_STOP) { hitHardStop = true; break; }
  }

  // The pre-existing acquisition-source segments, kept so nothing that worked
  // stops working. Applied in JS on top of the SQL result because the rules live in
  // app_settings and are interpreted by audience.js, which is the authority on what
  // a segment means.
  let skippedSegment = 0;
  const want = Array.isArray(segments) ? segments.filter(Boolean) : [];
  if (want.length) {
    const rules = await audienceRules.loadRules();
    const before = rows.length;
    rows = rows.filter((r) => {
      const { segment } = audienceRules.decideWith(rules, r.acquisition_source, r.acquisition_raw);
      return want.includes(segment);
    });
    skippedSegment = before - rows.length;
  }

  return {
    recipientType,
    recipients: rows.map((r) => ({
      id: r.customer_id,
      name: r.name || 'Customer',
      locale: r.locale || null,
      platform: r.platform || null,
      deviceCount: r.device_count || 0,
      walletBalance: r.wallet_balance,
      consultations: r.consultations,
      daysSinceSession: r.days_since_session,
      daysSinceSignup: r.days_since_signup,
    })),
    skippedSegment,
    truncated: hitHardStop,
  };
}

// ───────────────────────────────────────────────────────────────── 2. GOVERN ──

/** Map<customerId, preferences>. Absent means "all defaults", i.e. everything on. */
async function preferencesFor(customerIds) {
  const client = db();
  const out = new Map();
  if (!client || !customerIds?.length) return out;
  const ids = [...new Set(customerIds.map(String))];
  for (let i = 0; i < ids.length; i += ID_CHUNK) {
    const { rows } = await pageAll(() => client
      .from('notification_preferences')
      .select('customer_id, promotional, engagement, horoscope, quiet_start, quiet_end, timezone')
      .in('customer_id', safeInValues(ids.slice(i, i + ID_CHUNK))));
    for (const r of rows) out.set(String(r.customer_id), r);
  }
  return out;
}

/** The hour of day right now in a timezone, 0–23. Falls back to IST on a bad name
 *  rather than throwing — a typo'd timezone must not stop a campaign. */
function localHour(timezone = 'Asia/Kolkata', at = new Date()) {
  try {
    const s = at.toLocaleString('en-GB', { timeZone: timezone, hour: '2-digit', hour12: false });
    const h = parseInt(s, 10);
    return Number.isFinite(h) ? (h % 24) : localHour('Asia/Kolkata', at);
  } catch (_) {
    if (timezone === 'Asia/Kolkata') return at.getUTCHours();
    return localHour('Asia/Kolkata', at);
  }
}

/** Is `hour` inside a window that may wrap past midnight? 22→8 is the normal case
 *  and a naive start <= h < end test gets it exactly backwards. */
function hourInWindow(hour, start, end) {
  if (start == null || end == null) return false;
  if (start === end) return false;            // a zero-width window is "no quiet hours"
  if (start < end) return hour >= start && hour < end;
  return hour >= start || hour < end;         // wraps midnight
}

/**
 * The set of customers who have already had as much as they are allowed today.
 *
 * Counted from notification_sends — the only place that has ever known — over a
 * rolling 24 hours, and ONLY governed categories count toward it. A day full of
 * order updates must not use up somebody's promotional allowance.
 *
 * @returns {Promise<Set<string>>} customer ids to hold back
 */
async function frequencyCapped(customerIds, category) {
  const client = db();
  const capped = new Set();
  if (!client || !customerIds?.length || !GOVERNED.has(category)) return capped;

  const limits = await loadLimits();
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const ids = [...new Set(customerIds.map(String))];

  // The sends in the window first, then the categories of EXACTLY those
  // campaigns.
  //
  // THE ORDER MATTERS AND THIS USED TO BE THE OTHER WAY ROUND: the categories
  // were read from campaigns CREATED in the last 3 days while the sends were
  // counted over the last 24 hours. A campaign scheduled a week in advance and
  // sent today had no category in the map, so it counted towards nobody's cap —
  // meaning scheduling far ahead silently defeated the frequency cap, which is
  // the one thing it exists to prevent. Deriving the ids from the sends removes
  // the window, and the guess with it.
  const sends = [];
  for (let i = 0; i < ids.length; i += ID_CHUNK) {
    const { rows } = await pageAll(() => client
      .from('notification_sends')
      .select('customer_id, campaign_id')
      .eq('status', 'sent')
      .gte('sent_at', since)
      .in('customer_id', safeInValues(ids.slice(i, i + ID_CHUNK))));
    sends.push(...rows);
  }
  if (!sends.length) return capped;

  const campaignIds = [...new Set(sends.map((r) => String(r.campaign_id)).filter(Boolean))];
  const catById = new Map();
  for (let i = 0; i < campaignIds.length; i += ID_CHUNK) {
    const { rows } = await pageAll(() => client
      .from('notification_campaigns')
      .select('id, category')
      .in('id', safeInValues(campaignIds.slice(i, i + ID_CHUNK))));
    for (const c of rows) catById.set(String(c.id), c.category);
  }

  const counts = new Map(); // id -> { promo, total }
  for (const r of sends) {
    const cat = catById.get(String(r.campaign_id));
    // Transactional sends are not counted: a day full of order updates must not
    // use up somebody's promotional allowance.
    if (!GOVERNED.has(cat)) continue;
    const key = String(r.customer_id);
    const c = counts.get(key) || { promo: 0, total: 0 };
    if (cat === 'promotional') c.promo += 1;
    c.total += 1;
    counts.set(key, c);
  }

  for (const [id, c] of counts) {
    if (c.total >= limits.totalPerDay) { capped.add(id); continue; }
    if (category === 'promotional' && c.promo >= limits.promoPerDay) capped.add(id);
  }
  return capped;
}

/**
 * Customers this automation has already reached inside its cooldown.
 *
 * Without this, a `condition` automation ("wallet is empty") pushes the same person
 * on every single sweep for as long as the condition holds — which for an empty
 * wallet is forever.
 */
async function withinCooldown(automationId, cooldownDays) {
  const client = db();
  const seen = new Set();
  if (!client || !automationId || !(cooldownDays > 0)) return seen;
  const since = new Date(Date.now() - cooldownDays * 24 * 60 * 60 * 1000).toISOString();

  const { rows: camps } = await pageAll(() => client
    .from('notification_campaigns')
    .select('id')
    .eq('automation_id', automationId)
    .gte('created_at', since));
  if (!camps.length) return seen;

  const campIds = camps.map((c) => String(c.id));
  for (let i = 0; i < campIds.length; i += ID_CHUNK) {
    const { rows } = await pageAll(() => client
      .from('notification_sends')
      .select('customer_id')
      .in('campaign_id', safeInValues(campIds.slice(i, i + ID_CHUNK)))
      // 'sent' only. Somebody who was SUPPRESSED (quiet hours, say) has not heard
      // from us, so counting them would mean the cooldown silently consumed a
      // notification that was never delivered.
      .eq('status', 'sent'));
    for (const r of rows) if (r.customer_id) seen.add(String(r.customer_id));
  }
  return seen;
}

/**
 * The governor. Splits a resolved recipient list into who to send to now and who
 * to record as suppressed, with a reason each.
 *
 * `transactional` passes everything through untouched — see the file header.
 */
async function govern({
  recipients, recipientType, category, respectQuietHours = true, respectFrequencyCap = true,
  timezone = 'Asia/Kolkata', automationId = null, cooldownDays = 0, devices = null,
} = {}) {
  const send = [];
  const suppressed = [];

  // Astrologers have no preference rows and no quiet hours — their notifications
  // are overwhelmingly "a customer is waiting", which is transactional by nature.
  const governed = GOVERNED.has(category) && recipientType === 'customer';

  const ids = recipients.map((r) => String(r.id));
  const deviceMap = devices || new Map();

  const prefs = governed ? await preferencesFor(ids) : new Map();
  const capped = (governed && respectFrequencyCap) ? await frequencyCapped(ids, category) : new Set();
  const cooled = automationId ? await withinCooldown(automationId, cooldownDays) : new Set();
  const limits = await loadLimits();

  for (const r of recipients) {
    const id = String(r.id);
    const entry = deviceMap.get(id);

    // ── THE LEGACY TOKEN IS FOR ASTROLOGERS ONLY ────────────────────────────
    // This used to fall back to `r.fcm_token` for anybody, and for a customer that
    // reads straight off `customers.fcm_token` — which is written at login and
    // knows nothing about the OS permission. So a personal send to a customer
    // whose every device had permission DENIED went out anyway, bypassing the
    // whole point of the device table. Caught by
    // scripts/notificationPlatformCheck.js: with all devices denied, the send
    // reported sent: 1.
    //
    // Astrologers genuinely have no `customer_devices` row, so for them the column
    // is still the only source — and their notifications are overwhelmingly "a
    // customer is waiting", which is transactional by nature.
    const tokens = entry?.tokens?.length
      ? entry.tokens
      : (recipientType === 'astrologer' && r.fcm_token ? [r.fcm_token] : []);

    if (cooled.has(id)) { suppressed.push({ r, reason: 'cooldown' }); continue; }

    if (governed) {
      const p = prefs.get(id);
      const categoryOn = category === 'promotional'
        ? (p ? p.promotional !== false : true)
        : (p ? p.engagement !== false : true);
      if (!categoryOn) { suppressed.push({ r, reason: 'opted_out' }); continue; }

      if (capped.has(id)) { suppressed.push({ r, reason: 'frequency_cap' }); continue; }

      if (respectQuietHours) {
        const tz = p?.timezone || timezone || 'Asia/Kolkata';
        const qs = p?.quiet_start ?? limits.quietStart;
        const qe = p?.quiet_end ?? limits.quietEnd;
        if (hourInWindow(localHour(tz), qs, qe)) { suppressed.push({ r, reason: 'quiet_hours' }); continue; }
      }
    }

    if (!tokens.length) { suppressed.push({ r, reason: 'no_device' }); continue; }

    send.push({ ...r, tokens, locale: entry?.locale || r.locale || null, platform: entry?.platform || r.platform || null });
  }

  return { send, suppressed };
}

module.exports = {
  resolveAudience,
  govern,
  preferencesFor,
  frequencyCapped,
  withinCooldown,
  loadLimits,
  invalidateLimitsCache,
  localHour,
  hourInWindow,
  GOVERNED,
  DEFAULTS,
};
