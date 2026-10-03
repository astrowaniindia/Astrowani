// astrowani-backend/src/freeCallRoutes.js
//
// Free 11-minute introductory call — the customer-facing booking API and the
// admin management API. Replaces the free 5-minute scripted bot chat.
//
// THE ONE RULE: the server decides which slots exist and which are free. The app
// renders what it is told and re-checks nothing, because a client cannot be the
// authority on a shared resource. Two customers tapping the same slot at the same
// instant are separated by a partial UNIQUE index in Postgres, not by a
// read-then-write check here — see sql/free_call_booking_schema.sql.
//
// WHAT THIS DELIBERATELY DOES NOT DO: place the call. The astrologer rings the
// customer directly on the phone number snapshotted at booking time. There is no
// session, no wallet, no billing anywhere in this file.

const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { createClient } = require('@supabase/supabase-js');
const { findCustomerByPhone, findCustomerById } = require('./customerLookup');
const { requireAdmin } = require('./adminRoutes');
const { sendPush } = require('./push');
const vendorDevices = require('./vendorDevices');
const { checkAstrologerBusy, checkCustomerBusy, buildBusyMap } = require('./busyStatus');
const { pagedSelect, chunkIds } = require('./pagedSelect');
const holds = require('./astrologerHolds');
const { quoteLikePattern } = require('./pgrstFilter');
// Local-only overrides. Inert unless FREE_CALL_LOCAL_TEST=true AND this process is
// not the billing host — see the interlock in that file.
const localTest = require('./freeCallLocalTest');
const { ringAstrologer } = require('./ringAstrologer');
const { notifyWaitlistIfFree } = require('./waitlist');
const { createRechargeOrder } = require('./walletRecharge');
const { normaliseMilestones, DEFAULT_MILESTONES } = require('./freeCallPayout');
// Named audienceRules, not `audience`: inviteRecipients(audience, targetIds) below
// already uses that identifier for its own string parameter, and a shadowed module
// reference inside that function would be a silent trap for whoever edits it next.
const audienceRules = require('./audience');

const JWT_SECRET = process.env.JWT_SECRET;
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://fxpoustnddrgumhwdcma.supabase.co';
const db = createClient(SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// The offer runs on Indian business hours regardless of where the phone is. Slot
// grids are generated against this offset and stored as real instants, so a
// customer whose device is in another timezone still books 3pm IST.
const FREE_CALL_TZ_OFFSET_MIN = 330; // IST, UTC+5:30

// The face cluster on the offer card. MIN is what the card is designed around —
// a "shuffle" that lands on somebody is only readable with a few faces to move
// between — and MAX keeps the row from overflowing a phone width.
const DISPLAY_ROSTER_MIN = 5;
const DISPLAY_ROSTER_MAX = 6;

const DEFAULTS = {
  enabled: false,
  durationMinutes: 11,
  slotMinutes: 30,
  openHour: 10,
  closeHour: 20,
  daysAhead: 7,
  minLeadMinutes: 60,
  // WHO TAKES THE CALL, decided at the moment of booking:
  //   'manual' — nobody; the admin hands each one out.
  //   'single' — always assignedAstrologerId.
  //   'pool'   — split automatically across poolAstrologerIds, least-loaded first.
  // An admin can reassign any individual booking afterwards regardless of mode.
  //
  // The mode also sets how many customers one slot holds: 'pool' gives a slot as
  // many places as there are astrologers in the pool (two astrologers => two
  // people can both take 3pm), while the other two modes hold one.
  assignmentMode: 'manual',
  assignedAstrologerId: '',
  poolAstrologerIds: [],
  // The FACES on the offer card — a static cluster of overlapping photos.
  // Purely presentational: it has nothing to do with assignment above, which is
  // what actually decides who rings the customer. Left empty the server fills the
  // cluster from approved astrologers, so the card never renders a lonely photo.
  //
  // NOBODY IS SINGLED OUT (2026-09-05). The card used to spin a reel and stop on
  // one astrologer, backed by a `displayFeaturedAstrologerId` plus a typed
  // astrologerName/Image/Experience/Specialities persona. All of that is gone: the
  // cluster shows the panel as a group under "By verified & certified astrologers",
  // because the offer is not a promise about a particular person — pool mode can
  // assign any of several, and in manual mode nobody is assigned yet when the
  // customer is looking at the card.
  //
  // Stored blobs from before that date may still carry those keys; they are simply
  // ignored, since DEFAULTS is what defines the shape.
  displayAstrologerIds: [],
  // Per-platform kill switch, independent of `enabled` above. Lets the admin run
  // the offer on one app while it is off on the other -- e.g. keep it live on iOS
  // during the first App Store submission while pausing it on Android for a
  // capacity reason, or the reverse. Missing/unrecognised platform (web, admin,
  // an old app build that sends nothing) is never blocked -- only 'android' and
  // 'ios' can actually be turned off.
  enabledPlatforms: { android: true, ios: true },
  headerText: 'Your first 11-minute call is on us',
  bodyText: 'Pick a date and time that suits you. Our astrologer will call you directly — you do not have to do anything else.',
  ctaText: 'Book my free call',
  successText: 'Booked! Our astrologer will call you at the time you chose.',

  // ── INSTANT MODE (2026-09-27) ────────────────────────────────────────────
  // 'scheduled' is everything above: pick a slot, the astrologer rings you later.
  // 'instant'   is the day-1 retention version: pick whoever is free RIGHT NOW and
  //             their phone rings immediately, exactly as a paid call does.
  // 'off'       shows nothing, without deleting either.
  //
  // The scheduled machinery is deliberately kept rather than removed, so switching
  // back is one dropdown and not a deploy.
  mode: 'scheduled',
  // Who may receive an instant call. Falls back to poolAstrologerIds when empty, so an
  // admin who already curated a pool does not have to do it twice. An astrologer NOT in
  // this list is never offered a free call and is completely unaffected by the feature.
  // Astrologers the ADMIN pins into the instant pool. This is an override on top of the
  // astrologers' own `free_intro_call_enabled` toggle, not a replacement for it: anyone
  // who switches themselves on is in the pool, and anyone listed here is in it whether
  // they switched on or not. Leave it empty to let supply be entirely opt-in.
  instantPoolAstrologerIds: [],
  // How many free intro calls an astrologer must have completed before they are allowed
  // to switch the toggle back OFF. The point of the commitment: the offer is advertised
  // to brand-new customers, and a pool that empties itself the first busy evening leaves
  // them staring at a screen with nobody on it.
  minFreeCallsBeforeOptOut: 10,
  // What the astrologer earns for a free call, as a MARK REACHED rather than minutes
  // elapsed: ₹5 once the call passes 4 minutes, and ₹5 is the whole payout however long
  // it then runs — the same ₹5 at 5 minutes and at the full 11. Paid out of admin_wallet
  // by sessionManager when the call ends — see payFreeCallAstrologer, and
  // freeCallPayout.js for why it is not per-minute.
  payoutMilestones: DEFAULT_MILESTONES.map((m) => ({ ...m })),
  // The reservation after a free call ends, in seconds. 'decision' is how long the
  // customer has to tap something; 'payment' is how long the gateway gets once they do.
  // See src/astrologerHolds.js for what each phase blocks.
  //
  // holdDecisionSeconds IS THE COUNTDOWN THE CUSTOMER SEES. The continue sheet counts
  // down the hold's real remaining seconds, so changing this changes the on-screen timer
  // and how long the astrologer looks busy — the two can never drift apart.
  holdDecisionSeconds: 90,
  holdPaymentSeconds: 180,
  // How long one astrologer is allowed to ring before the app offers the others.
  ringTimeoutSeconds: 60,
  // The "more minutes" buttons. Priced server-side at the astrologer's own rate.
  continueOptions: [5, 10, 15],
  // How many astrologers one customer may ring on a single free-call attempt, before
  // they are asked to come back later. Stops the pool being walked for attention.
  maxRingAttempts: 10,
  instantHeaderText: 'Talk to an astrologer free, right now',
  instantBodyText: 'Pick anyone who is free and we will connect you straight away. Your first 11 minutes are on us.',
};

const h = (fn) => (req, res) => fn(req, res).catch((err) => {
  console.error(`[freeCallRoutes] ${req.method} ${req.path}:`, err.message);
  res.status(500).json({ success: false, message: 'Something went wrong' });
});

// "That table does not exist yet." PostgREST reports this as PGRST205 (its schema
// cache) rather than Postgres's own 42P01, and it answers with the former in
// practice — checking only 42P01 turned a not-yet-migrated database into a 500.
// Both are matched so this holds whichever layer reports it.
const isMissingTable = (error) =>
  !!error && (error.code === '42P01' || error.code === 'PGRST205');

/**
 * "That COLUMN does not exist yet." Same two-layer problem as isMissingTable: PostgREST
 * answers PGRST204 from its schema cache where Postgres would say 42703, and an insert
 * naming an unknown column can surface as either. The message check is the backstop.
 */
const isMissingColumn = (error, column) =>
  !!error && (error.code === '42703' || error.code === 'PGRST204'
    || new RegExp(column, 'i').test(error.message || ''));

/**
 * A clock time as minutes after midnight, or null if it is not a valid one.
 * Accepts "11:30", "24:00", 11.5, a whole hour (11 -> 11:00) and the "1130" /
 * "2330" form an admin once typed into the hour fields. Hours alone could not say
 * 11:30, which is why the window moved to minutes (2026-09-19).
 */
function parseClock(v) {
  if (v === null || v === undefined || v === '') return null;
  const str = String(v).trim();
  let h;
  let m;
  const colon = /^(\d{1,2}):(\d{2})$/.exec(str);
  if (colon) {
    h = Number(colon[1]);
    m = Number(colon[2]);
  } else if (/^\d{3,4}$/.test(str)) {
    // "1130" -> 11:30, "930" -> 9:30
    h = Math.floor(Number(str) / 100);
    m = Number(str) % 100;
  } else {
    const n = Number(str);
    if (!Number.isFinite(n)) return null;
    h = Math.floor(n);
    m = Math.round((n - h) * 60);
  }
  if (!Number.isInteger(h) || !Number.isInteger(m) || m < 0 || m > 59 || h < 0) return null;
  const total = h * 60 + m;
  return total <= 24 * 60 ? total : null;
}

const clampInt = (v, lo, hi, fallback) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n >= lo && n <= hi ? n : fallback;
};

/**
 * Reads and sanitises the offer config. Every numeric field is clamped, because
 * these come from a free-text admin JSON blob and a nonsense value (closeHour 99,
 * slotMinutes 0) would otherwise generate an infinite or empty slot grid.
 */
/**
 * Astrologers who have switched the free intro call ON for themselves.
 *
 * Cached for 15 seconds: loadOffer runs on every free-call request and this would
 * otherwise add a query to each one. On ANY failure it returns the last known list
 * rather than an empty one — emptying the pool is how the instant offer silently falls
 * back to the scheduled flow, and a transient database error must not do that.
 *
 * Before sql/free_intro_call_toggle.sql has run the column does not exist; the latch
 * stops every subsequent call re-asking, and the admin's pinned list still supplies the
 * pool exactly as it did before, so deploy order does not matter.
 */
let optedInCache = { ids: [], at: 0 };
let optInColumnAvailable = true;
const OPTED_IN_TTL_MS = 15_000;

function isMissingOptInColumn(err) {
  const s = `${err?.code || ''} ${err?.message || ''}`;
  return err?.code === '42703' || /free_intro_call_enabled/.test(s);
}

async function selfOptedInAstrologerIds() {
  if (!optInColumnAvailable) return [];
  if (Date.now() - optedInCache.at < OPTED_IN_TTL_MS) return optedInCache.ids;
  try {
    const { data, error } = await db
      .from('astrologers')
      .select('id')
      .eq('free_intro_call_enabled', true);
    if (error) {
      if (isMissingOptInColumn(error)) {
        optInColumnAvailable = false;
        console.warn('[freeCallRoutes] astrologers.free_intro_call_enabled is missing — run '
          + 'sql/free_intro_call_toggle.sql. Until then the instant pool is the admin list only.');
        return [];
      }
      return optedInCache.ids;
    }
    optedInCache = { ids: (data || []).map((r) => r.id), at: Date.now() };
    return optedInCache.ids;
  } catch (_) {
    return optedInCache.ids;
  }
}

/** Called after a toggle write so the change shows up immediately, not in 15 seconds. */
function invalidateOptedInCache() { optedInCache = { ids: optedInCache.ids, at: 0 }; }

/* ── Admin control over who SEES the free-intro-call card ────────────────────
 * Kept in its OWN app_settings key rather than inside `free_call_offer`: that blob is
 * the customer-facing offer, and the admin form which owns it rewrites it wholesale, so
 * a visibility flag parked in there could be wiped by an unrelated save of that form.
 * This key is only ever written by its own card.
 *
 * Hiding needs no app change at all. `{available:false}` is already how
 * freeIntroToggleState hides the card — the vendor dashboard renders nothing for it —
 * so this takes effect on the next dashboard load, with no OTA.
 *
 * NOTE what this does NOT do: it hides the astrologer's own switch, it does not take
 * them out of the instant pool. Someone already opted in keeps receiving free intro
 * calls, they just cannot see or change the setting. Turning the offer off for
 * customers entirely is a different control — `free_call_offer.enabled`.
 */
const INTRO_VISIBILITY_KEY = 'free_intro_call_visibility';
const INTRO_VISIBILITY_TTL_MS = 15 * 1000;
let introVisibilityCache = { value: null, at: 0 };

async function loadIntroVisibility() {
  if (introVisibilityCache.value && Date.now() - introVisibilityCache.at < INTRO_VISIBILITY_TTL_MS) {
    return introVisibilityCache.value;
  }

  let row;
  try {
    const { data, error } = await db
      .from('app_settings').select('value').eq('key', INTRO_VISIBILITY_KEY).limit(1);
    if (error) throw new Error(error.message);
    row = data && data.length ? data[0].value : null;
  } catch (_) {
    // Could not read it. Serve the last known good answer rather than flipping the card
    // back on for an admin who deliberately hid it. With nothing cached, hide: re-showing
    // something an admin switched off is the worse of the two failures, and it corrects
    // itself on the next successful read 15s later.
    if (introVisibilityCache.value) return introVisibilityCache.value;
    return { hiddenForAll: true, hiddenAstrologerIds: [] };
  }

  // No row yet = never configured = nothing hidden. Deliberately NOT the same as a failed
  // read above: an absent key must preserve the behaviour this feature already had.
  let parsed = {};
  if (row) {
    try { parsed = JSON.parse(row) || {}; } catch (_) { parsed = {}; }
  }
  const value = {
    hiddenForAll: parsed.hiddenForAll === true || parsed.hiddenForAll === 'true',
    hiddenAstrologerIds: Array.isArray(parsed.hiddenAstrologerIds)
      ? parsed.hiddenAstrologerIds.filter((id) => typeof id === 'string' && id)
      : [],
  };
  introVisibilityCache = { value, at: Date.now() };
  return value;
}

/**
 * Which audience rule governs the flow this offer is currently running.
 *
 * The two flows are marketed to different people (src/audience.js FEATURES), and
 * `mode` is what decides which one a customer can actually reach, so the rule that
 * applies is the one for the live flow. Instant falls back to `free_call`'s rule when
 * no instant rule has been written, so adding the key changed nothing on its own.
 */
function audienceFeatureFor(offer) {
  return offer && offer.mode === 'instant' ? 'free_call_instant' : 'free_call';
}

async function loadOffer() {
  let raw = null;
  try {
    const { data } = await db.from('app_settings').select('value').eq('key', 'free_call_offer').limit(1);
    if (data && data.length) raw = data[0].value;
  } catch (_) { /* falls through to defaults */ }

  let parsed = {};
  if (raw) {
    try { parsed = JSON.parse(raw) || {}; } catch (_) { parsed = {}; }
  }
  const merged = { ...DEFAULTS, ...parsed };

  merged.enabled = merged.enabled === true || merged.enabled === 'true';
  merged.durationMinutes = clampInt(merged.durationMinutes, 1, 180, DEFAULTS.durationMinutes);
  merged.slotMinutes = clampInt(merged.slotMinutes, 5, 240, DEFAULTS.slotMinutes);
  // The window in minutes after midnight. openTime/closeTime ("11:30", "24:00")
  // win; the older whole-hour openHour/closeHour fields are still read.
  let openMin = parseClock(merged.openTime ?? merged.openHour);
  let closeMin = parseClock(merged.closeTime ?? merged.closeHour);
  if (openMin === null || openMin > 23 * 60 + 59) openMin = DEFAULTS.openHour * 60;
  if (closeMin === null || closeMin < 1) closeMin = DEFAULTS.closeHour * 60;
  merged.daysAhead = clampInt(merged.daysAhead, 1, 60, DEFAULTS.daysAhead);
  merged.minLeadMinutes = clampInt(merged.minLeadMinutes, 0, 10080, DEFAULTS.minLeadMinutes);
  if (!['single', 'pool'].includes(merged.assignmentMode)) merged.assignmentMode = 'manual';
  if (typeof merged.assignedAstrologerId !== 'string') merged.assignedAstrologerId = '';
  if (!Array.isArray(merged.poolAstrologerIds)) merged.poolAstrologerIds = [];
  merged.poolAstrologerIds = merged.poolAstrologerIds.filter((id) => typeof id === 'string' && id);
  if (!Array.isArray(merged.displayAstrologerIds)) merged.displayAstrologerIds = [];
  merged.displayAstrologerIds = merged.displayAstrologerIds
    .filter((id) => typeof id === 'string' && id)
    .slice(0, DISPLAY_ROSTER_MAX);
  // Read field-by-field rather than spreading `parsed.enabledPlatforms` wholesale --
  // an admin blob carrying only {android:false} must still default ios to true, not
  // drop it. Anything other than the literal `false` counts as enabled, matching
  // this file's general fail-open posture for a feature toggle (not a money path).
  {
    const rawPlat = (parsed && typeof parsed.enabledPlatforms === 'object' && parsed.enabledPlatforms) || {};
    merged.enabledPlatforms = {
      android: rawPlat.android !== false,
      ios: rawPlat.ios !== false,
    };
  }
  // An empty pool would mean a capacity of zero, i.e. nothing bookable at all.
  // Falling back to manual keeps the offer working and leaves the bookings in the
  // admin's queue, which is recoverable; a dead offer is not.
  if (merged.assignmentMode === 'pool' && merged.poolAstrologerIds.length === 0) {
    merged.assignmentMode = 'manual';
  }
  if (closeMin <= openMin) {
    openMin = DEFAULTS.openHour * 60;
    closeMin = DEFAULTS.closeHour * 60;
  }
  merged.openMin = openMin;
  merged.closeMin = closeMin;
  const hhmm = (t) => `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
  merged.openTime = hhmm(openMin);
  merged.closeTime = hhmm(closeMin);
  // Kept for anything still reading whole hours.
  merged.openHour = Math.floor(openMin / 60);
  merged.closeHour = Math.ceil(closeMin / 60);

  // ── Instant mode ──────────────────────────────────────────────────────────
  // Everything below is admin free-text, so every value is clamped. An admin typing
  // 5000 into "payout per minute" must not be able to drain admin_wallet, and typing
  // 99999 into a hold window must not be able to take an astrologer off the market
  // for a day.
  if (!['instant', 'off'].includes(merged.mode)) merged.mode = 'scheduled';
  if (!Array.isArray(merged.instantPoolAstrologerIds)) merged.instantPoolAstrologerIds = [];
  merged.instantPoolAstrologerIds = merged.instantPoolAstrologerIds.filter((id) => typeof id === 'string' && id);
  // Curating one list is enough: an admin who already built a scheduled pool gets it
  // reused rather than having to tick the same ten people twice.
  if (!merged.instantPoolAstrologerIds.length) {
    merged.instantPoolAstrologerIds = merged.poolAstrologerIds.slice();
  }
  merged.minFreeCallsBeforeOptOut = clampInt(merged.minFreeCallsBeforeOptOut, 0, 500, DEFAULTS.minFreeCallsBeforeOptOut);
  // Who is actually offered to customers: everyone who switched themselves on, plus
  // anyone the admin pinned. Resolved here so the three places that care — the list, the
  // ring gate, and the "is there anybody at all" fallback below — can never disagree.
  merged.effectiveInstantPool = [...new Set([
    ...merged.instantPoolAstrologerIds,
    ...(await selfOptedInAstrologerIds()),
  ])];
  merged.payoutMilestones = normaliseMilestones(merged.payoutMilestones);
  merged.holdDecisionSeconds = clampInt(merged.holdDecisionSeconds, 10, 600, DEFAULTS.holdDecisionSeconds);
  merged.holdPaymentSeconds = clampInt(merged.holdPaymentSeconds, 30, 900, DEFAULTS.holdPaymentSeconds);
  merged.ringTimeoutSeconds = clampInt(merged.ringTimeoutSeconds, 15, 300, DEFAULTS.ringTimeoutSeconds);
  merged.maxRingAttempts = clampInt(merged.maxRingAttempts, 1, 50, DEFAULTS.maxRingAttempts);
  if (!Array.isArray(merged.continueOptions)) merged.continueOptions = DEFAULTS.continueOptions.slice();
  merged.continueOptions = [...new Set(
    merged.continueOptions.map((n) => clampInt(n, 1, 120, 0)).filter((n) => n > 0),
  )].sort((a, b) => a - b).slice(0, 4);
  if (!merged.continueOptions.length) merged.continueOptions = DEFAULTS.continueOptions.slice();
  // An instant offer with nobody in the pool has no astrologers to show, which reads to
  // the customer as a broken screen. Fall back to the scheduled flow, which at least
  // still works, rather than leaving a dead button on Home.
  if (merged.mode === 'instant' && merged.effectiveInstantPool.length === 0) {
    console.warn('[freeCallRoutes] instant mode is on but the pool is empty — falling back to scheduled.');
    merged.mode = 'scheduled';
  }
  // LAST, deliberately: after every clamp and after the empty-pool fallback above, so a
  // forced test pool cannot be clamped away or downgraded back to 'scheduled'. A no-op
  // in every environment but a developer's own machine.
  return localTest.applyToOffer(merged);
}

// acquisition_source/_raw ride along so the audience check (src/audience.js) costs no
// extra query. Null for every pre-tracking signup and every iOS customer, which the
// audience module treats as the `unknown` segment and leaves alone by default.
const offerGuard = require('./offerGuard');
const CUSTOMER_COLS = 'id, name, mobile, acquisition_source, acquisition_raw';

/** JWT → the real customers row. Same pattern as orderRoutes/astroRoutes. */
async function resolveCustomer(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader) return null;
  let decoded;
  try {
    decoded = jwt.verify(authHeader.replace('Bearer ', ''), JWT_SECRET);
  } catch (_) {
    return null;
  }
  let customer = null;
  if (decoded.phone) {
    customer = await findCustomerByPhone(db, decoded.phone, CUSTOMER_COLS);
  }
  const userId = decoded.userId || decoded._id || decoded.id;
  // Guarded: a soft-removed account must not resolve from a retained token.
  if (!customer && userId) {
    customer = await findCustomerById(db, userId, CUSTOMER_COLS);
  }
  return customer;
}

/** Astrologer id from the vendor JWT. Same shape as remedyReferralRoutes. */
function resolveAstrologerId(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader) return null;
  try {
    const decoded = jwt.verify(authHeader.replace('Bearer ', ''), JWT_SECRET);
    return decoded.astroId || decoded.vendorId || decoded.id || null;
  } catch (_) {
    return null;
  }
}

/* ─────────────────────────── slot grid arithmetic ────────────────────────────
 * All of this works in "business minutes since the UTC epoch", i.e. UTC shifted
 * by FREE_CALL_TZ_OFFSET_MIN. Doing it with local Date getters would silently
 * follow the SERVER's timezone, which is not necessarily India.
 */

/** 'YYYY-MM-DD' for an instant, in business time. */
function businessDateKey(instant) {
  const shifted = new Date(instant.getTime() + FREE_CALL_TZ_OFFSET_MIN * 60000);
  return shifted.toISOString().slice(0, 10);
}

/** A 'YYYY-MM-DD' + hour/minute in business time → the real UTC instant. */
function businessInstant(dateKey, hour, minute) {
  const [y, m, d] = dateKey.split('-').map(Number);
  const asUtc = Date.UTC(y, m - 1, d, hour, minute, 0, 0);
  return new Date(asUtc - FREE_CALL_TZ_OFFSET_MIN * 60000);
}

/** The list of date keys the offer is currently open for, starting today. */
function offerDateKeys(offer, now = new Date()) {
  const keys = [];
  const todayKey = businessDateKey(now);
  const [y, m, d] = todayKey.split('-').map(Number);
  for (let i = 0; i < offer.daysAhead; i++) {
    const dt = new Date(Date.UTC(y, m - 1, d + i));
    keys.push(dt.toISOString().slice(0, 10));
  }
  return keys;
}

/**
 * Every slot on one business date. A slot is offered only if it fits entirely
 * inside the working window (an 11-minute call cannot start at 19:55 when the day
 * closes at 20:00) and starts at least minLeadMinutes from now.
 */
function buildSlots(offer, dateKey, now = new Date()) {
  const out = [];
  const earliest = now.getTime() + offer.minLeadMinutes * 60000;
  // openMin/closeMin come from loadOffer; a bare { openHour, closeHour } offer
  // (the slot check script) still works.
  const openMin = Number.isFinite(offer.openMin) ? offer.openMin : offer.openHour * 60;
  const closeMin = Number.isFinite(offer.closeMin) ? offer.closeMin : offer.closeHour * 60;
  const windowEnd = businessInstant(dateKey, 0, closeMin).getTime();

  for (let mins = openMin; mins < closeMin; mins += offer.slotMinutes) {
    const start = businessInstant(dateKey, Math.floor(mins / 60), mins % 60);
    const end = new Date(start.getTime() + offer.durationMinutes * 60000);
    if (end.getTime() > windowEnd) continue;
    const past = start.getTime() < earliest;
    out.push({
      start,
      end,
      startIso: start.toISOString(),
      endIso: end.toISOString(),
      label: (!past && soonLabel(start, now)) || formatSlotLabel(start),
      past,
    });
  }
  return out;
}

// Slots starting within the next hour read as "In 15 min" instead of a clock time,
// so a customer who wants to talk now can see that now is on offer.
const SOON_LABEL_MINUTES = 60;
function soonLabel(start, now) {
  const mins = Math.round((start.getTime() - now.getTime()) / 60000);
  if (mins <= 0 || mins > SOON_LABEL_MINUTES) return null;
  return `In ${mins} min`;
}

// "today at 3:15 PM", "tomorrow at 9:00 AM", "on 22 Sep at 6:30 PM" — business time.
function describeWhen(instant, now = new Date()) {
  const time = formatSlotLabel(instant);
  const day = businessDateKey(instant);
  if (day === businessDateKey(now)) return `today at ${time}`;
  if (day === businessDateKey(new Date(now.getTime() + 86400000))) return `tomorrow at ${time}`;
  const shifted = new Date(instant.getTime() + FREE_CALL_TZ_OFFSET_MIN * 60000);
  const mon = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][shifted.getUTCMonth()];
  return `on ${shifted.getUTCDate()} ${mon} at ${time}`;
}

/**
 * Tell the assigned astrologer about a free-call booking: a row in their
 * notification list, a socket event if their app is open, and a push. Sent as
 * 'admin_personal' because that is a type every installed astrologer app already
 * displays. Never throws — the booking has already succeeded.
 */
async function notifyAstrologerOfBooking(app, booking, kind) {
  try {
    if (!booking?.astrologer_id) return;
    const who = booking.customer_name || 'A new customer';
    const when = describeWhen(new Date(booking.slot_start));
    const title = kind === 'reminder' ? 'Free call starting soon' : 'New free call booked';
    const body = kind === 'reminder'
      ? `Please call ${who} ${when}. Open My Free Calls to ring them.`
      : `${who} booked a free call ${when}. Open My Free Calls to ring them on time.`;
    const type = 'admin_personal';

    const { error } = await db.from('notifications').insert([{ astrologer_id: booking.astrologer_id, customer_id: null, title, body, type }]);
    if (error) console.warn('[freeCallRoutes] astrologer notification insert failed:', error.message);

    const io = app.locals.io;
    if (io) io.to(String(booking.astrologer_id)).emit('new_notification', { title, body, type, recipient_type: 'astrologer' });

    const target = await vendorDevices.pushTargetFor(booking.astrologer_id);
    if (target?.fcm_token) await sendPush(target.fcm_token, { data: { type, title, body } });
  } catch (e) {
    console.warn('[freeCallRoutes] astrologer booking notification failed:', e.message);
  }
}

// Reminds the astrologer a few minutes before each booked call. Remembered in memory,
// so a backend restart inside the window can send one reminder twice — harmless.
const REMINDER_LEAD_MINUTES = 10;
const remindedBookingIds = new Set();
async function sendDueReminders(app) {
  try {
    const now = Date.now();
    const { data, error } = await db
      .from('free_call_bookings')
      .select('id, astrologer_id, customer_name, slot_start, created_at')
      .eq('status', 'booked')
      .not('astrologer_id', 'is', null)
      .gte('slot_start', new Date(now).toISOString())
      .lte('slot_start', new Date(now + REMINDER_LEAD_MINUTES * 60000).toISOString());
    if (error || !data) return;
    for (const b of data) {
      if (remindedBookingIds.has(b.id)) continue;
      remindedBookingIds.add(b.id);
      // Booked within the reminder window: the "new booking" notice just went out.
      if (new Date(b.slot_start).getTime() - new Date(b.created_at).getTime() <= REMINDER_LEAD_MINUTES * 60000) continue;
      await notifyAstrologerOfBooking(app, b, 'reminder');
    }
    if (remindedBookingIds.size > 5000) remindedBookingIds.clear();
  } catch (_) {
    // next tick tries again
  }
}

function formatSlotLabel(instant) {
  const shifted = new Date(instant.getTime() + FREE_CALL_TZ_OFFSET_MIN * 60000);
  let hh = shifted.getUTCHours();
  const mm = String(shifted.getUTCMinutes()).padStart(2, '0');
  const ampm = hh >= 12 ? 'PM' : 'AM';
  hh = hh % 12 === 0 ? 12 : hh % 12;
  return `${hh}:${mm} ${ampm}`;
}

/** Only approved, unsuspended astrologers may be handed new work. */
async function activeAstrologers(ids) {
  if (!ids || !ids.length) return [];
  const { data } = await db
    .from('astrologers')
    .select('id, first_name, last_name, approval_status, is_suspended')
    .in('id', ids);
  return (data || []).filter(
    (a) => !a.is_suspended && (!a.approval_status || a.approval_status === 'approved'),
  );
}

/**
 * How many customers one slot can hold. In pool mode this is the number of
 * ACTIVE pool members — the whole point of a pool is that adding an astrologer
 * adds capacity, rather than several astrologers sharing the same single place.
 * Suspending someone therefore reduces capacity, which is correct: an inactive
 * astrologer cannot take a call.
 */
async function slotCapacity(offer) {
  if (offer.assignmentMode !== 'pool') return 1;
  const active = await activeAstrologers(offer.poolAstrologerIds);
  return Math.max(1, active.length);
}

/**
 * The astrologers a new booking could go to, best candidate first. Empty means
 * "leave it unassigned", which is a normal outcome (manual mode), not an error.
 *
 * Pool ordering is LEAST-LOADED, not round-robin: it counts each member's live
 * upcoming bookings and puts the emptiest first. Least-loaded self-corrects when
 * a call is cancelled, reassigned or someone joins the pool late, whereas a
 * round-robin cursor drifts permanently out of balance the first time a booking
 * is cancelled. Over 100 bookings and two astrologers this lands on 50/50.
 *
 * Returns a LIST rather than one astrologer because the caller retries down it:
 * two customers booking the same slot at the same instant can both pick the same
 * emptiest astrologer, and the loser needs somewhere else to go.
 */
async function assigneeCandidates(offer) {
  try {
    if (offer.assignmentMode === 'single') {
      if (!offer.assignedAstrologerId) return [];
      const active = await activeAstrologers([offer.assignedAstrologerId]);
      if (!active.length) {
        console.warn('[freeCallRoutes] assigned astrologer is not active; booking left unassigned');
      }
      return active;
    }

    if (offer.assignmentMode === 'pool') {
      const active = await activeAstrologers(offer.poolAstrologerIds);
      if (!active.length) return [];

      // Live upcoming load per member. Only future, still-'booked' calls count —
      // completed and missed ones are finished work and must not keep pushing new
      // customers away from an astrologer forever.
      const { data: load } = await db
        .from('free_call_bookings')
        .select('astrologer_id')
        .eq('status', 'booked')
        .gte('slot_start', new Date().toISOString())
        .in('astrologer_id', active.map((a) => a.id));

      const counts = new Map(active.map((a) => [a.id, 0]));
      (load || []).forEach((r) => {
        if (counts.has(r.astrologer_id)) counts.set(r.astrologer_id, counts.get(r.astrologer_id) + 1);
      });
      return [...active].sort((a, b) => (counts.get(a.id) || 0) - (counts.get(b.id) || 0));
    }

    return [];
  } catch (_) {
    // Assignment is never worth failing a booking over — an unassigned booking
    // sits in the admin's queue and is one click from fixed.
    return [];
  }
}

const astrologerFullName = (a) =>
  a ? [a.first_name, a.last_name].filter(Boolean).join(' ').trim() || null : null;

/** How many live bookings each slot already holds, keyed by slot instant. */
async function slotUsage(slots) {
  const used = new Map();
  if (!slots.length) return used;
  const { data } = await db
    .from('free_call_bookings')
    .select('slot_start')
    .neq('status', 'cancelled')
    .gte('slot_start', slots[0].startIso)
    .lte('slot_start', slots[slots.length - 1].startIso);
  (data || []).forEach((r) => {
    const k = new Date(r.slot_start).getTime();
    used.set(k, (used.get(k) || 0) + 1);
  });
  return used;
}

/** The customer's own live booking, if any. */
async function findLiveBooking(customerId) {
  const { data } = await db
    .from('free_call_bookings')
    .select('*')
    .eq('customer_id', customerId)
    .neq('status', 'cancelled')
    .order('slot_start', { ascending: false })
    .limit(1);
  return data && data.length ? data[0] : null;
}

/**
 * The customer's unexpired admin invite, or null. An invite (sent from the admin
 * Free Call Bookings page with a push) opens the offer to this one customer even
 * while the public offer is switched off, and drops the brand-new-customer rule
 * for them. Fails to null: a missing table or a read error means "not invited",
 * which only withholds an offer, never hands one out.
 */
async function findActiveInvite(customerId) {
  try {
    const { data, error } = await db
      .from('free_call_invites')
      .select('id, expires_at')
      .eq('customer_id', customerId)
      .gt('expires_at', new Date().toISOString())
      .limit(1);
    if (error) return null;
    return data && data.length ? data[0] : null;
  } catch (_) {
    return null;
  }
}

/**
 * Eligibility: brand-new customers only — nobody who has ever had a session.
 * Fails CLOSED. If the sessions table can't be read we do not know whether this
 * customer is new, and wrongly handing out a free astrologer call is worse than
 * wrongly withholding an offer the customer can still be shown later.
 */
async function isNewCustomer(customerId) {
  try {
    const { count, error } = await db
      .from('chat_sessions')
      .select('id', { count: 'exact', head: true })
      .eq('caller_id', customerId);
    if (error) return false;
    return (count || 0) === 0;
  } catch (_) {
    return false;
  }
}

/**
 * Did an earlier account on this phone number already use the free call, or already have a
 * real consultation? (src/offerGuard.js -- recorded when that account was deleted.)
 * An INVITED customer is still held to "one free call per person", but is not required to be
 * a first-time customer, which is what the invite exists to override.
 */
async function usedByEarlierAccount(customer, invited) {
  if (await offerGuard.claimedByOther(customer.mobile, offerGuard.OFFERS.FREE_CALL, customer.id, { failClosed: true })) return true;
  if (invited) return false;
  return offerGuard.claimedByOther(customer.mobile, offerGuard.OFFERS.WELCOME, customer.id, { failClosed: true });
}

/**
 * The face cluster shown on the offer card, and which of those faces the card
 * settles on.
 *
 * THIS IS PRESENTATION, NOT ROUTING. The customer sees the cluster shuffle and
 * stop on somebody, which reads as a random match — but the stopping point is
 * chosen HERE, on the server, and the astrologer who actually rings them is
 * decided separately at booking time by assigneeCandidates(). The client never
 * picks; if it did, the card could promise a face the admin never intended.
 *
 * The featured entry is the offer's configured display astrologer. Everyone else
 * is filler: whoever the admin listed in displayAstrologerIds, topped up from
 * approved astrologers when that leaves the cluster too thin to animate.
 *
 * Order is shuffled per request so the highlight does not land in the same spot
 * every time, which is what would give the trick away.
 */
let rosterCache = { at: 0, rows: [] };

async function approvedAstrologerFaces() {
  if (Date.now() - rosterCache.at < 60000) return rosterCache.rows;
  try {
    // profile_pic_url is the ONLY image column on this table — `profile_image` is a
    // legacy fallback name that does not exist here and makes PostgREST 400 (see
    // ASTROLOGER_LIST_COLUMNS in index.js).
    const { data, error } = await db
      .from('astrologers')
      .select('id, first_name, last_name, profile_pic_url, approval_status, is_suspended')
      .limit(200);
    if (error) {
      console.warn('[freeCallRoutes] display roster read failed:', error.message);
      return rosterCache.rows;
    }
    const rows = (data || [])
      .filter((a) => !a.is_suspended && (!a.approval_status || a.approval_status === 'approved'))
      .map((a) => ({
        id: a.id,
        name: astrologerFullName(a) || 'Astrologer',
        image: a.profile_pic_url || '',
      }));
    rosterCache = { at: Date.now(), rows };
    return rows;
  } catch (_) {
    // A cluster is decoration. Failing to read it must never take the offer down.
    return rosterCache.rows;
  }
}

function shuffled(arr) {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = crypto.randomInt(i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * The faces on the offer card, as a flat list. Nobody is featured and no name is
 * returned for the customer to read — the card renders these as an overlapping
 * cluster under "By verified & certified astrologers".
 *
 * Everyone here is a real, approved astrologer read live from their profile, so a
 * photo never goes stale and the card can never show someone who has since been
 * suspended. There is deliberately no typed-persona fallback any more: showing a
 * face that belongs to nobody bookable is exactly the promise this offer should
 * not make.
 */
async function buildDisplayRoster(offer) {
  const all = await approvedAstrologerFaces();
  const byId = new Map(all.map((a) => [a.id, a]));

  const picked = [];
  const seen = new Set();
  const take = (entry) => {
    const key = (entry.name || '').trim().toLowerCase();
    if (!entry.name || seen.has(key)) return;
    seen.add(key);
    picked.push({ name: entry.name, image: entry.image || '' });
  };

  // An admin's explicit picks come first, in the order they chose them.
  offer.displayAstrologerIds.forEach((id) => {
    const a = byId.get(id);
    if (a) take(a);
  });

  // Top up. Faces WITH a photo first — a cluster of grey placeholders is worse
  // than a smaller cluster, so photoless astrologers are only used as a last
  // resort to reach the minimum.
  if (picked.length < DISPLAY_ROSTER_MIN) {
    const rest = shuffled(all.filter((a) => !seen.has(a.name.trim().toLowerCase())));
    rest.sort((a, b) => (b.image ? 1 : 0) - (a.image ? 1 : 0));
    for (const a of rest) {
      if (picked.length >= DISPLAY_ROSTER_MIN) break;
      take(a);
    }
  }

  return { astrologers: shuffled(picked).slice(0, DISPLAY_ROSTER_MAX) };
}

const publicOffer = (offer) => ({
  enabled: offer.enabled,
  durationMinutes: offer.durationMinutes,
  headerText: offer.headerText,
  bodyText: offer.bodyText,
  ctaText: offer.ctaText,
  successText: offer.successText,
  // Which of the two flows the app should render. Everything below is only read in
  // instant mode; sending it always keeps the app from needing a second round trip.
  mode: offer.mode,
  instantHeaderText: offer.instantHeaderText,
  instantBodyText: offer.instantBodyText,
  ringTimeoutSeconds: offer.ringTimeoutSeconds,
  // NOT sent: payoutMilestones, the pool ids. What an astrologer earns is
  // not the customer's business, and the pool is an implementation detail — the app
  // only ever sees the astrologers the list endpoint chooses to return.
});

const publicBooking = (b) => b && ({
  id: b.id,
  slotStart: b.slot_start,
  slotEnd: b.slot_end,
  durationMinutes: b.duration_minutes,
  status: b.status,
  astrologerName: b.astrologer_name,
  // The number the astrologer will actually dial, as snapshotted at booking
  // time. Returned so the confirmation quotes THIS rather than whatever the app
  // happens to hold — if the customer later edits their profile the two diverge,
  // and the snapshot is the one that gets called.
  customerPhone: b.customer_phone || '',
  label: `${formatSlotLabel(new Date(b.slot_start))}`,
  dateKey: businessDateKey(new Date(b.slot_start)),
});

/**
 * Which platform is asking, from the app-sent `platform` param -- query for GETs,
 * body for the POST. Anything other than exactly 'android' or 'ios' (missing,
 * 'web', an unrecognised value) is treated as unknown, never as one of the two
 * real platforms, so it can never be blocked by a platform-specific toggle.
 */
function platformOf(req) {
  const v = (req.query && req.query.platform) || (req.body && req.body.platform);
  return v === 'ios' || v === 'android' ? v : null;
}

/**
 * The platform kill switch. This is a HARD stop -- it wins over an active invite,
 * unlike `offer.enabled` -- because if the admin has switched Android off, an
 * invited Android customer should not slip through either. An unrecognised
 * platform is never blocked (see platformOf above).
 */
function platformAllowed(offer, platform) {
  if (platform !== 'android' && platform !== 'ios') return true;
  return offer.enabledPlatforms[platform] !== false;
}

module.exports = function registerFreeCallRoutes(app) {
  setInterval(() => sendDueReminders(app), 60 * 1000).unref();
  /* ── Customer: is the offer on, am I eligible, have I already booked? ────── */
  app.get('/api/free-call/offer', h(async (req, res) => {
    const offer = await loadOffer();
    if (!platformAllowed(offer, platformOf(req))) {
      return res.status(200).json({ success: true, enabled: false, eligible: false, booking: null });
    }
    const customer = await resolveCustomer(req);
    // An invited customer sees the offer even while it is switched off for everyone else.
    const invite = customer ? await findActiveInvite(customer.id) : null;
    if (!offer.enabled && !invite) {
      // A disabled offer is not an error — the app just shows nothing.
      return res.status(200).json({ success: true, enabled: false, eligible: false, booking: null });
    }
    // The face cluster is built per request so its order (and therefore where the
    // highlight lands) differs each time the card is opened.
    const roster = await buildDisplayRoster(offer);
    const shown = { ...publicOffer(offer), enabled: true, ...roster };

    if (!customer) {
      return res.status(200).json({
        success: true, enabled: true, eligible: false, booking: null, offer: shown,
      });
    }
    const booking = await findLiveBooking(customer.id);
    // Invited: anyone without a live free-call booking. Otherwise brand-new only, AND
    // in an audience the admin still offers this to (src/audience.js).
    //
    // An invite deliberately bypasses the audience rule, exactly as it already bypasses
    // offer.enabled and isNewCustomer: an admin who hand-picked this customer means it.
    const audienceOk = !!invite || (await audienceRules.isAllowed(customer, audienceFeatureFor(offer)));
    // An earlier, now-deleted account on this number already used the offer (or was a real
    // customer). Fails closed: a free call is a real astrologer's time.
    const usedBefore = await usedByEarlierAccount(customer, !!invite);
    // The same local-test bypass instantGate applies. This endpoint computes eligibility
    // independently of that gate, so without this line the card never appears on Home and
    // there is no way into the flow — the gate further in would have allowed it.
    const eligible = localTest.bypassEligibility()
      ? true
      : (!booking && audienceOk && !usedBefore && (!!invite || (await isNewCustomer(customer.id))));
    return res.status(200).json({
      success: true,
      enabled: true,
      eligible,
      invited: !!invite,
      booking: publicBooking(booking),
      offer: shown,
    });
  }));

  /* ═══════════════════════════════════════════════════════════════════════════
   * INSTANT FREE CALL (2026-09-27)
   *
   * The customer picks whoever is free right now and that astrologer's phone rings
   * immediately, exactly as it does for a paid call — same NotificationPopup, same
   * ringtone, same Accept button, same call screen. The only differences are that
   * call_requests.is_free is set (which /api/session/accept turns into a session that
   * the billing loop never touches) and that the astrologer is paid out of
   * admin_wallet when it ends.
   *
   * WHY IT RIDES THE PAID PATH RATHER THAN THE SCHEDULED ONE: the scheduled free call
   * has the ASTROLOGER ring the CUSTOMER, which needs the customer's app to be
   * reachable and gives them nothing to do. Reversing it means the whole battle-tested
   * accept/reject/cold-start stack is reused and the customer gets the familiar
   * "calling…" screen.
   *
   * WHY IT STILL WRITES A free_call_bookings ROW: everything already built on that
   * table keeps working unchanged — one-free-call-per-customer (an index),
   * closeFreeCallBooking, endOverdueFreeCalls' 11-minute backstop, offerGuard's
   * delete-and-reclaim protection, and the admin list. `kind` tells them apart.
   * ═══════════════════════════════════════════════════════════════════════════ */

  /**
   * An instant attempt already under way: the booking exists but no call has connected
   * on it yet. That is the customer ringing round the pool — they must be allowed to
   * carry on, even though findLiveBooking() makes them "ineligible" for a NEW offer.
   */
  /**
   * Can this astrologer be sold a paid call right now?
   *
   * The decision window is ninety seconds long and the world moves inside it: an
   * astrologer can finish their shift and switch calls off, or be suspended, between the
   * free call ending and the customer tapping an amount. Selling minutes with somebody
   * who has gone is not a lost sale, it is a customer who paid and then could not talk.
   *
   * Deliberately NOT checked: is_online / is_available. A phone that died mid-call leaves
   * those exactly as they were, so they would refuse nothing real while quietly blocking
   * every upsell from an astrologer who simply has not toggled themselves live.
   */
  const canTakePaidCall = (a) => !!a
    && a.is_suspended !== true
    && a.approval_status !== 'rejected'
    && a.is_call_enabled !== false;

  const resumableInstantAttempt = (booking) => !!booking
    && booking.kind === 'instant'
    && booking.status === 'booked'
    && !booking.call_session_id;

  /**
   * Everything the instant screen needs to decide what to show, in one place, so the
   * list endpoint and the ring endpoint can never disagree about who is eligible.
   *
   * Returns { ok, code, message, customer, offer, booking } — `ok:false` carries the
   * exact refusal the app should render.
   */
  async function instantGate(req) {
    const offer = await loadOffer();
    if (!platformAllowed(offer, platformOf(req))) {
      return { ok: false, status: 403, code: 'PLATFORM_DISABLED', message: 'This offer is not available on your device right now.' };
    }
    const customer = await resolveCustomer(req);
    if (!customer) {
      return { ok: false, status: 401, code: 'UNAUTHORIZED', message: 'Please log in.' };
    }
    const invite = await findActiveInvite(customer.id);
    if (offer.mode !== 'instant') {
      return { ok: false, status: 403, code: 'NOT_INSTANT', message: 'Instant calls are not switched on.', offer, customer };
    }
    if (!offer.enabled && !invite) {
      return { ok: false, status: 403, code: 'OFFER_CLOSED', message: 'This offer is closed right now.', offer, customer };
    }

    const booking = await findLiveBooking(customer.id);
    // A booking that has already CONNECTED means the free call happened. A booking
    // still being rung round the pool does not.
    if (booking && !resumableInstantAttempt(booking) && !localTest.bypassEligibility()) {
      return { ok: false, status: 409, code: 'ALREADY_USED', message: 'You have already used your free call.', offer, customer, booking };
    }

    // Local test mode skips the three eligibility gates below. They are all correct and
    // all fail CLOSED by design, which is exactly why a useful test account is otherwise
    // single-use: the first run consumes the offer and every run after it answers
    // NOT_ELIGIBLE, which looks identical to the feature being broken.
    if (!localTest.bypassEligibility()) {
      // Instant by definition: this helper has already refused NOT_INSTANT above.
      const audienceOk = !!invite || (await audienceRules.isAllowed(customer, 'free_call_instant'));
      if (!audienceOk) {
        return { ok: false, status: 403, code: 'NOT_ELIGIBLE', message: 'This offer is not available for your account.', offer, customer };
      }
      // Fails CLOSED (see usedByEarlierAccount / isNewCustomer): a free call is a real
      // astrologer's time, so "we cannot tell" must mean "no".
      if (await usedByEarlierAccount(customer, !!invite)) {
        return { ok: false, status: 403, code: 'NOT_ELIGIBLE', message: 'This offer has already been used on this number.', offer, customer };
      }
      // An attempt already under way proves they were eligible when it started; do not
      // re-run the brand-new check, because ringing somebody does not create a session
      // but a half-finished one would still be confusing to re-evaluate mid-flow.
      if (!booking && !invite && !(await isNewCustomer(customer.id))) {
        return { ok: false, status: 403, code: 'NOT_ELIGIBLE', message: 'This offer is for new customers only.', offer, customer };
      }
    }

    return { ok: true, customer, offer, booking: booking || null };
  }

  /** Compact astrologer card for the instant list. Never exposes rates for the free call. */
  const instantCard = (a, busy) => ({
    id: a.id,
    name: astrologerFullName(a) || 'Astrologer',
    image: a.profile_pic_url || '',
    experience: a.experience || 0,
    rating: Number(a.average_rating) || 0,
    totalReviews: a.total_reviews || 0,
    languages: Array.isArray(a.languages) ? a.languages : (a.languages ? [a.languages] : []),
    badgeType: a.badge || null,
    isBusy: !!(busy && busy.isBusy),
    busySince: (busy && busy.busySince) || null,
    busyReason: (busy && busy.reason) || null,
  });

  /* ── Customer: who can I call right now? ──────────────────────────────────
   * Busy astrologers are returned too, deliberately. Hiding them would make the
   * pool look tiny at exactly the busiest moments, and the customer has no way to
   * ask for the one they wanted — with them visible, the busy pill doubles as the
   * "notify me" button. The app sorts idle first; the server sends the flag.
   */
  app.get('/api/free-call/instant/astrologers', h(async (req, res) => {
    const gate = await instantGate(req);
    if (!gate.ok) {
      return res.status(gate.status).json({
        success: false, code: gate.code, message: gate.message, astrologers: [],
      });
    }
    const { offer, customer, booking } = gate;

    const active = await activeAstrologers(offer.effectiveInstantPool);
    if (!active.length) {
      return res.status(200).json({
        success: true, astrologers: [], durationMinutes: offer.durationMinutes,
        attemptsLeft: offer.maxRingAttempts,
      });
    }

    const { data: rows, error: rowsErr } = await db
      .from('astrologers')
      .select('id, first_name, last_name, profile_pic_url, experience, languages, average_rating, total_reviews, badge, is_online, hidden_from_customers')
      // hidden_from_customers is respected here for the same reason /api/astrologers
      // respects it: it exists to keep an approved-but-not-public astrologer (the store
      // reviewer account) out of customer-facing lists. An admin who pools somebody
      // hidden would otherwise be quietly sending real customers to them.
      .not('hidden_from_customers', 'is', true)
      .in('id', active.map((a) => a.id));

    // DO NOT swallow this. A failed select returns null, which reads downstream as "the
    // whole panel is offline" — indistinguishable from nobody being available, and the
    // customer is told to come back later while the astrologers sit idle. One mistyped
    // column name in the list above is enough to do it (that is exactly how
    // `profile_image`, which does not exist on this table, hid the entire pool during
    // testing). Answer 503 so it reads as our fault, not theirs.
    if (rowsErr) {
      console.error('[FreeCall] instant list query failed — the pool will look empty:', rowsErr.message);
      return res.status(503).json({
        success: false, code: 'LOOKUP_FAILED', astrologers: [],
        message: 'We could not load the astrologers just now. Please try again in a moment.',
      });
    }

    const busyMap = await buildBusyMap(db);
    const holdMap = await holds.buildHoldMap(db);

    const cards = (rows || [])
      // An astrologer who is signed out cannot answer, and showing them only produces
      // a ring nobody hears. Busy is different from absent and stays visible.
      .filter((a) => a.is_online !== false)
      .map((a) => {
        let busy = busyMap[a.id];
        // Our own reservation must not show us the person we are about to buy more
        // minutes from as "busy" — they are held FOR this customer.
        const hold = holdMap[a.id];
        if (busy && busy.reason === 'hold' && hold && String(hold.customer_id) === String(customer.id)) {
          busy = null;
        }
        return instantCard(a, busy);
      })
      .sort((x, y) => (x.isBusy === y.isBusy ? (y.rating - x.rating) : (x.isBusy ? 1 : -1)));

    // Local-test filler only (display), so the grid can be judged without opting real
    // astrologers in. Empty in every environment but a developer's own machine.
    const withFillers = [...cards, ...localTest.fakeCards()];

    return res.status(200).json({
      success: true,
      astrologers: withFillers,
      durationMinutes: offer.durationMinutes,
      ringTimeoutSeconds: offer.ringTimeoutSeconds,
      attemptsLeft: Math.max(0, offer.maxRingAttempts - ((booking && booking.call_attempts) || 0)),
    });
  }));

  /* ── Customer: ring this astrologer now ───────────────────────────────────── */
  app.post('/api/free-call/instant/ring', h(async (req, res) => {
    const gate = await instantGate(req);
    if (!gate.ok) {
      return res.status(gate.status).json({ success: false, code: gate.code, message: gate.message });
    }
    const { customer, offer } = gate;
    let booking = gate.booking;

    const astrologerId = String(req.body?.astrologerId || '');
    if (!astrologerId) {
      return res.status(400).json({ success: false, code: 'BAD_REQUEST', message: 'astrologerId is required' });
    }
    // Pool membership is checked server-side: the id arrives from the client and a
    // client can name anyone. An astrologer outside the pool never agreed to take
    // free calls and must not be rung by one.
    if (!offer.effectiveInstantPool.includes(astrologerId)) {
      return res.status(403).json({ success: false, code: 'NOT_IN_POOL', message: 'That astrologer is not taking free calls.' });
    }
    const [active] = await activeAstrologers([astrologerId]);
    if (!active) {
      return res.status(404).json({ success: false, code: 'UNAVAILABLE', message: 'That astrologer is not available right now.' });
    }

    if (booking && (booking.call_attempts || 0) >= offer.maxRingAttempts) {
      return res.status(429).json({
        success: false, code: 'TOO_MANY_ATTEMPTS',
        message: 'You have tried a few astrologers already. Please come back in a little while.',
      });
    }

    // Don't ring on top of something the customer is already in.
    const customerBusy = await checkCustomerBusy(db, customer.id);
    if (customerBusy.busy) {
      return res.status(409).json({ success: false, code: 'SELF_BUSY', message: 'You are already on a call or chat.' });
    }
    // isFreeCall: true means a 'decision'-phase hold blocks this, while a paying
    // customer would still get through. See src/astrologerHolds.js.
    const astroBusy = await checkAstrologerBusy(db, astrologerId, { customerId: customer.id, isFreeCall: true });
    if (astroBusy.busy) {
      return res.status(409).json({
        success: false, code: 'ASTROLOGER_BUSY', busy: true,
        busySince: astroBusy.busySince, reason: astroBusy.reason,
        message: 'They just got busy. Pick someone else, or ask us to tell you when they are free.',
      });
    }

    const now = new Date();
    const durationMinutes = offer.durationMinutes;

    // One booking per attempt, reused across every astrologer they try. Creating a
    // fresh one per ring would trip free_call_bookings_customer_live_uniq on the
    // second attempt, and would lose the attempt count that caps this.
    if (!booking) {
      const row = {
        customer_id: customer.id,
        kind: 'instant',
        slot_start: now.toISOString(),
        slot_end: new Date(now.getTime() + durationMinutes * 60000).toISOString(),
        duration_minutes: durationMinutes,
        status: 'booked',
        customer_name: customer.name || null,
        customer_phone: customer.mobile || null,
        astrologer_id: astrologerId,
        call_attempts: 0,
      };
      const { data: created, error: bookErr } = await db
        .from('free_call_bookings').insert([row]).select('*').single();
      if (bookErr) {
        if (isMissingTable(bookErr)) {
          return res.status(503).json({ success: false, code: 'MIGRATION_REQUIRED', message: 'Free calls are not set up on the server yet.' });
        }
        // `kind` missing = sql/free_call_instant.sql has not run. Refuse rather than
        // silently writing a row the sweeps and the admin cannot tell apart.
        if (/kind/.test(bookErr.message || '')) {
          console.warn('[FreeCall] free_call_bookings.kind missing — run sql/free_call_instant.sql');
          return res.status(503).json({ success: false, code: 'MIGRATION_REQUIRED', message: 'Free calls are not set up on the server yet.' });
        }
        if (bookErr.code === '23505') {
          return res.status(409).json({ success: false, code: 'ALREADY_USED', message: 'You have already used your free call.' });
        }
        throw new Error(bookErr.message);
      }
      booking = created;
    }

    const sessionId = crypto.randomUUID();
    const roomId = crypto.randomUUID();

    // THE row that makes this call free. is_free is written here, by the server, and
    // read back by /api/session/accept — the vendor app never gets a say.
    const { data: requestRow, error: reqErr } = await db
      .from('call_requests')
      .insert([{
        customer_id: customer.id,
        astrologer_id: astrologerId,
        customer_name: customer.name || 'Customer',
        call_type: 'audio',
        status: 'pending',
        room_id: roomId,
        session_id: sessionId,
        is_free: true,
      }])
      .select('id')
      .single();

    if (reqErr) {
      // FAILS CLOSED, and this is the most important refusal in the file. Without the
      // is_free column the request would become an ordinary PAID session at the
      // astrologer's full rate — a customer charged for something advertised as free.
      // Refusing the call is the only safe direction.
      if (isMissingColumn(reqErr, 'is_free')) {
        console.error('[FreeCall] call_requests.is_free is missing — run sql/free_call_instant.sql. '
          + 'Refusing the free call rather than creating a BILLED session.');
        return res.status(503).json({
          success: false, code: 'MIGRATION_REQUIRED',
          message: 'Free calls are not set up on the server yet.',
        });
      }
      // A pending request already exists for this astrologer or this customer (the
      // partial unique indexes from hardening_04 / hardening_10). Somebody won the race.
      if (reqErr.code === '23505') {
        return res.status(409).json({
          success: false, code: 'ASTROLOGER_BUSY', busy: true,
          message: 'They just got busy. Pick someone else.',
        });
      }
      throw new Error(reqErr.message);
    }

    await db.from('free_call_bookings')
      .update({ astrologer_id: astrologerId, call_attempts: (booking.call_attempts || 0) + 1 })
      .eq('id', booking.id);

    await ringAstrologer({
      io: app.locals.io,
      db,
      receiverId: astrologerId,
      callType: 'audio',
      callerName: customer.name || 'Customer',
      callerId: customer.id,
      sessionId,
      roomId,
      isFree: true,
      freeMinutes: durationMinutes,
    });

    console.log(`[FreeCall] instant: customer ${customer.id} ringing astrologer ${astrologerId} (session ${sessionId})`);
    return res.status(200).json({
      success: true,
      requestId: requestRow.id,
      sessionId,
      roomId,
      bookingId: booking.id,
      durationMinutes,
      ringTimeoutSeconds: offer.ringTimeoutSeconds,
      astrologerName: astrologerFullName(active) || 'Astrologer',
      attemptsLeft: Math.max(0, offer.maxRingAttempts - ((booking.call_attempts || 0) + 1)),
    });
  }));

  /* ── Customer: nobody answered / I changed my mind ─────────────────────────
   * The booking is deliberately NOT cancelled here — the customer is still mid-attempt
   * and about to try somebody else. cancelStaleInstantBookings in sessionManager hands
   * the free call back if they never connect with anyone.
   */
  app.post('/api/free-call/instant/give-up', h(async (req, res) => {
    const customer = await resolveCustomer(req);
    if (!customer) return res.status(401).json({ success: false, message: 'Please log in.' });

    const requestId = String(req.body?.requestId || '');
    const status = req.body?.status === 'missed' ? 'missed' : 'cancelled';
    if (!requestId) return res.status(400).json({ success: false, message: 'requestId is required' });

    // Scoped to this customer AND to a still-pending row: an atomic claim, so a request
    // the astrologer accepted a moment ago is never overwritten.
    const { data } = await db
      .from('call_requests')
      .update({ status, responded_at: new Date().toISOString() })
      .eq('id', requestId)
      .eq('customer_id', customer.id)
      .eq('status', 'pending')
      .select('id, astrologer_id');

    const changed = !!(data && data.length);
    // Let the astrologer's popup dismiss itself, same as the paid cancel path.
    if (changed && app.locals.io) {
      app.locals.io.to(String(data[0].astrologer_id)).emit('call_cancelled', { requestId });
    }
    return res.status(200).json({ success: true, changed });
  }));

  /* ── Customer: buy more minutes with the astrologer I just spoke to ────────
   * Prices come from HERE, never from the app. The app renders what it is told.
   */
  app.get('/api/free-call/continue/options', h(async (req, res) => {
    const customer = await resolveCustomer(req);
    if (!customer) return res.status(401).json({ success: false, message: 'Please log in.' });

    const hold = await holds.getHoldForCustomer(db, customer.id);
    if (!hold) {
      return res.status(200).json({ success: true, active: false, options: [] });
    }

    const { data: astro } = await db
      .from('astrologers')
      .select('id, first_name, last_name, profile_pic_url, call_charge_per_minute, audio_price, '
        + 'is_call_enabled, is_suspended, approval_status')
      .eq('id', hold.astrologer_id)
      .maybeSingle();

    // Same fallback chain as /api/call/initiate, so the price quoted here is the price
    // the paid call will actually bill at.
    const rate = Number(astro?.call_charge_per_minute ?? astro?.audio_price ?? 0);
    const offer = await loadOffer();

    // Nothing coherent to sell: a zero rate, an astrologer who has switched calls off
    // since the free call ended, or one who has already been taken by a paying customer
    // (a decision-phase hold blocks free calls only — that is deliberate). Their own
    // hold must not count against them, hence customerId. Fails OPEN on a database
    // error, matching busyStatus: a blip should cost nobody their upsell.
    const sellable = rate > 0 && canTakePaidCall(astro)
      && !(await checkAstrologerBusy(db, hold.astrologer_id, { customerId: customer.id })).busy;
    const options = sellable
      ? offer.continueOptions.map((minutes) => ({ minutes, amount: Math.round(rate * minutes) }))
      : [];

    return res.status(200).json({
      success: true,
      active: true,
      astrologerId: hold.astrologer_id,
      astrologerName: astrologerFullName(astro || {}) || 'Astrologer',
      astrologerImage: astro?.profile_pic_url || '',
      ratePerMinute: rate,
      options,
      phase: hold.phase,
      // The call this offer follows. Carried so an app that was killed mid-offer and
      // reopens can still raise the "how was Astrowani?" prompt against the right
      // session — and so it can tell a 'decision' hold (safe to re-offer) from a
      // 'payment' one (they have already tapped an amount; offering again risks
      // charging twice).
      sessionId: hold.session_id || null,
      // Seconds left, so the sheet can count down rather than guess.
      expiresInSeconds: Math.max(0, Math.round((new Date(hold.expires_at).getTime() - Date.now()) / 1000)),
    });
  }));

  /* ── Customer: I want N more minutes — open the gateway ────────────────────
   * Deliberately creates an ORDINARY wallet recharge (a wallet_recharges row through
   * the same helper /api/wallet/create-order uses). Two reasons:
   *   1. razorpayWebhookRoutes already recovers a wallet recharge whose app died after
   *      paying. A bespoke order type would need its own recovery probe, and the
   *      "paid but the app crashed" case is exactly the one nobody tests.
   *   2. If the astrologer is gone by the time they pay, the money is still theirs,
   *      sitting in their wallet. Nothing is lost and no refund path is needed.
   * The paid call is then started by the app through the normal /api/call/initiate.
   */
  app.post('/api/free-call/continue/start', h(async (req, res) => {
    const customer = await resolveCustomer(req);
    if (!customer) return res.status(401).json({ success: false, message: 'Please log in.' });

    const minutes = clampInt(req.body?.minutes, 1, 120, 0);
    if (!minutes) return res.status(400).json({ success: false, message: 'minutes is required' });

    const hold = await holds.getHoldForCustomer(db, customer.id);
    if (!hold) {
      return res.status(409).json({
        success: false, code: 'HOLD_EXPIRED',
        message: 'That astrologer is no longer held for you. We can tell you when they are free.',
      });
    }
    const offer = await loadOffer();
    if (!offer.continueOptions.includes(minutes)) {
      return res.status(400).json({ success: false, code: 'BAD_OPTION', message: 'That option is not available.' });
    }

    const { data: astro } = await db
      .from('astrologers')
      .select('id, call_charge_per_minute, audio_price, is_call_enabled, is_suspended, approval_status')
      .eq('id', hold.astrologer_id)
      .maybeSingle();
    const rate = Number(astro?.call_charge_per_minute ?? astro?.audio_price ?? 0);
    if (!(rate > 0)) {
      return res.status(409).json({ success: false, code: 'NO_RATE', message: 'This astrologer is not taking paid calls right now.' });
    }

    // LAST CHECK BEFORE THE GATEWAY OPENS. The options were priced up to ninety seconds
    // ago and a decision-phase hold deliberately lets a PAYING customer through, so the
    // astrologer may have been taken, or have ended their shift, in the meantime. Taking
    // the money anyway is not harmless just because it lands in the customer's own
    // wallet — they paid to talk to a specific person, and would meet a 409 on the way
    // to the call. Refused as HOLD_EXPIRED so the sheet offers the waitlist, which is
    // the useful answer.
    if (!canTakePaidCall(astro)
      || (await checkAstrologerBusy(db, hold.astrologer_id, { customerId: customer.id })).busy) {
      return res.status(409).json({
        success: false, code: 'HOLD_EXPIRED',
        message: 'That astrologer has just been taken. We can tell you when they are free.',
      });
    }

    const amount = Math.round(rate * minutes);

    // Extend the reservation BEFORE opening the gateway. From here the astrologer is
    // blocked to everyone else, free or paid — the customer is about to commit money.
    const upgraded = await holds.upgradeToPayment(db, {
      astrologerId: hold.astrologer_id,
      customerId: customer.id,
      minutes,
      seconds: offer.holdPaymentSeconds,
    });
    if (!upgraded) {
      return res.status(409).json({
        success: false, code: 'HOLD_EXPIRED',
        message: 'That astrologer is no longer held for you. We can tell you when they are free.',
      });
    }

    const order = await createRechargeOrder(customer.id, amount, 'fcc');
    if (!order.ok) {
      return res.status(order.status || 503).json({ success: false, code: order.code, message: order.message });
    }

    return res.status(200).json({
      success: true,
      orderId: order.orderId,
      amount,
      minutes,
      currency: order.currency,
      keyId: order.keyId,
      astrologerId: hold.astrologer_id,
      holdSeconds: offer.holdPaymentSeconds,
    });
  }));

  /* ── Customer: no thanks (the dismiss button) ──────────────────────────────
   * Frees the astrologer immediately rather than making the next customer wait out a
   * reservation nobody wants any more.
   */
  /* ── Customer abandoned the gateway ───────────────────────────────────────
   * Puts the hold back to the decision phase instead of releasing it outright.
   * Releasing would be simpler but it would send a customer who merely mistyped a
   * card straight to the waitlist; keeping the payment phase would block every OTHER
   * customer for three minutes over a purchase that never happened. Decision phase is
   * the honest middle: this customer can retry, and paying customers get through.
   */
  app.post('/api/free-call/continue/abandon-payment', h(async (req, res) => {
    const customer = await resolveCustomer(req);
    if (!customer) return res.status(401).json({ success: false, message: 'Unauthorized' });
    const hold = await holds.getHoldForCustomer(db, customer.id);
    if (!hold) return res.status(200).json({ success: true, active: false });
    const ok = await holds.downgradeToDecision(db, {
      astrologerId: hold.astrologer_id,
      customerId: customer.id,
      seconds: 45,
    });
    return res.status(200).json({ success: true, active: ok });
  }));

  app.post('/api/free-call/continue/release', h(async (req, res) => {
    const customer = await resolveCustomer(req);
    if (!customer) return res.status(401).json({ success: false, message: 'Please log in.' });

    const hold = await holds.getHoldForCustomer(db, customer.id);
    if (hold) {
      // Scoped to this customer, so a release can only ever free your OWN reservation.
      await holds.releaseHold(db, { astrologerId: hold.astrologer_id, customerId: customer.id });
      // Clear the astrologer's "you are reserved" banner at once, rather than leaving
      // it counting down against a reservation that no longer exists.
      const io = app.locals.io;
      if (io) io.to(hold.astrologer_id).emit('astrologer_hold_ended', { astrologerId: hold.astrologer_id });
      // They are free now, so anyone on the waitlist for them should hear about it.
      const stillBusy = await checkAstrologerBusy(db, hold.astrologer_id);
      if (!stillBusy.busy) {
        notifyWaitlistIfFree(db, sendPush, hold.astrologer_id).catch(() => {});
      }
    }
    return res.status(200).json({ success: true });
  }));

  /* ── Customer: how was Astrowani? ──────────────────────────────────────────
   * OUR rating, not a store review. Deliberately not wired to the Play Store / App
   * Store prompt: routing only the happy answers to the store is review gating, which
   * Google's In-App Review guidance names directly and Play treats as ratings
   * manipulation. The store prompt is triggered by BEHAVIOUR (a call that ran most of
   * its length) instead — see the app's appReviewGoodMoment flag.
   */
  app.post('/api/app-rating', h(async (req, res) => {
    const customer = await resolveCustomer(req);
    if (!customer) return res.status(401).json({ success: false, message: 'Please log in.' });

    const rating = clampInt(req.body?.rating, 1, 5, 0);
    if (!rating) return res.status(400).json({ success: false, message: 'rating must be 1-5' });

    const { error } = await db.from('app_ratings').insert([{
      customer_id: customer.id,
      rating,
      context: typeof req.body?.context === 'string' ? req.body.context.slice(0, 40) : null,
      session_id: req.body?.sessionId || null,
      comment: typeof req.body?.comment === 'string' ? req.body.comment.slice(0, 2000) : null,
    }]);
    if (error && !isMissingTable(error)) {
      console.error('[app-rating] insert failed:', error.message);
    }
    // Always 200: a rating that fails to save must not show the customer an error for
    // something they did us a favour by answering.
    return res.status(200).json({ success: true });
  }));

  /* ── Customer: the slot grid ──────────────────────────────────────────────
   * Returns every date the offer is open for and, for the requested date, every
   * slot with a `taken` flag. Taken slots are still returned rather than removed
   * so the app can grey them out — a customer seeing "3:00 PM — taken" trusts the
   * grid more than one where times silently vanish.
   */
  app.get('/api/free-call/slots', h(async (req, res) => {
    const offer = await loadOffer();
    if (!platformAllowed(offer, platformOf(req))) {
      return res.status(200).json({ success: true, enabled: false, dates: [], slots: [] });
    }
    const customer = await resolveCustomer(req);
    if (!offer.enabled && !(customer && (await findActiveInvite(customer.id)))) {
      return res.status(200).json({ success: true, enabled: false, dates: [], slots: [] });
    }
    if (!customer) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const now = new Date();
    const dates = offerDateKeys(offer, now);
    const dateKey = dates.includes(req.query.date) ? req.query.date : dates[0];

    const slots = buildSlots(offer, dateKey, now);
    // A slot is full when it holds as many bookings as there are astrologers to
    // take them — one in single/manual mode, one per pool member in pool mode.
    const capacity = await slotCapacity(offer);
    const used = await slotUsage(slots);

    return res.status(200).json({
      success: true,
      enabled: true,
      date: dateKey,
      dates: dates.map((k) => ({ key: k, label: dateLabel(k) })),
      slots: slots.map((s) => ({
        start: s.startIso,
        end: s.endIso,
        label: s.label,
        taken: (used.get(s.start.getTime()) || 0) >= capacity,
        past: s.past,
      })),
    });
  }));

  /* ── Customer: book ───────────────────────────────────────────────────────
   * Validation order matters: eligibility and slot validity are checked before
   * the insert so the common refusals get a clear message, but the ACTUAL
   * anti-double-book guarantee is the unique index. A 23505 here is not a bug,
   * it is the race being caught correctly.
   */
  app.post('/api/free-call/book', h(async (req, res) => {
    const offer = await loadOffer();
    if (!platformAllowed(offer, platformOf(req))) {
      return res.status(403).json({ success: false, code: 'PLATFORM_DISABLED', message: 'This offer is not available in this app right now.' });
    }
    const customer = await resolveCustomer(req);
    const invite = customer ? await findActiveInvite(customer.id) : null;
    if (!offer.enabled && !invite) {
      return res.status(403).json({ success: false, code: 'OFFER_CLOSED', message: 'This offer is no longer available.' });
    }
    if (!customer) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const existing = await findLiveBooking(customer.id);
    if (existing) {
      return res.status(409).json({
        success: false, code: 'ALREADY_BOOKED',
        message: 'You have already booked your free call.',
        booking: publicBooking(existing),
      });
    }
    // Re-checked here and not just in /offer: the offer response is advisory, this is
    // the write. Same NOT_ELIGIBLE code on purpose — FreeCallOffer.js already handles
    // it, so no app release is needed for the refusal path.
    // The booking flow, so always the scheduled rule — never the instant one.
    if (!invite && !(await audienceRules.isAllowed(customer, 'free_call'))) {
      return res.status(403).json({
        success: false, code: 'NOT_ELIGIBLE',
        message: 'This offer is not available for your account.',
      });
    }
    if (!invite && !(await isNewCustomer(customer.id))) {
      return res.status(403).json({
        success: false, code: 'NOT_ELIGIBLE',
        message: 'This offer is for first-time customers only.',
      });
    }
    if (await usedByEarlierAccount(customer, !!invite)) {
      await offerGuard.logBlock({ offerKey: offerGuard.OFFERS.FREE_CALL, customerId: customer.id, mobile: customer.mobile });
      return res.status(403).json({
        success: false, code: 'NOT_ELIGIBLE',
        message: 'This offer has already been used with this phone number.',
      });
    }

    const startIso = req.body?.slotStart;
    const start = startIso ? new Date(startIso) : null;
    if (!start || isNaN(start.getTime())) {
      return res.status(400).json({ success: false, code: 'BAD_SLOT', message: 'Pick a time slot.' });
    }

    // The slot must be one this server would actually offer — never trust a
    // timestamp from the body. This rejects hand-crafted 3am slots outright.
    const now = new Date();
    const dateKey = businessDateKey(start);
    if (!offerDateKeys(offer, now).includes(dateKey)) {
      return res.status(400).json({ success: false, code: 'BAD_SLOT', message: 'That date is not open for booking.' });
    }
    const match = buildSlots(offer, dateKey, now).find((s) => s.start.getTime() === start.getTime());
    if (!match) {
      return res.status(400).json({ success: false, code: 'BAD_SLOT', message: 'That time is not available.' });
    }
    if (match.past) {
      return res.status(409).json({ success: false, code: 'SLOT_PAST', message: 'That time has passed. Please pick another.' });
    }

    const baseRow = {
      customer_id: customer.id,
      slot_start: match.startIso,
      slot_end: match.endIso,
      duration_minutes: offer.durationMinutes,
      status: 'booked',
      customer_name: customer.name || null,
      customer_phone: customer.mobile || null,
      // Left null on purpose. This used to snapshot the persona the customer was
      // shown on the card; the card no longer names anybody, so there is nothing
      // to promise and nothing to preserve. The real assignee is `astrologer_id`
      // (set by the candidate loop below), and every reader already falls back to
      // resolving the name from that row — see the vendor/admin list builders.
      astrologer_name: null,
    };

    // Candidates are ordered emptiest-first. We walk down them because the
    // database, not this code, is what decides whether an astrologer is free at
    // this slot: a 23505 on the (slot_start, astrologer_id) index means someone
    // else just took that astrologer's place, so we try the next one. `null` is
    // the final attempt — manual mode, or a pool that is genuinely full.
    const candidates = await assigneeCandidates(offer);
    const attempts = candidates.length ? candidates.map((a) => a.id) : [null];

    let data = null;
    let lastError = null;
    for (const astrologerId of attempts) {
      const result = await db
        .from('free_call_bookings')
        .insert({ ...baseRow, astrologer_id: astrologerId })
        .select('*')
        .single();

      if (!result.error) { data = result.data; break; }
      lastError = result.error;

      if (result.error.code === '23505') {
        // Losing the per-customer race is terminal: they already have a booking,
        // and no other astrologer changes that.
        if (String(result.error.message).includes('customer_live_uniq')) break;
        continue; // that astrologer is busy at this slot — try the next.
      }
      break; // anything else is a real failure, not a race.
    }

    if (!data) {
      const error = lastError;
      if (error && error.code === '23505') {
        if (String(error.message).includes('customer_live_uniq')) {
          const mine = await findLiveBooking(customer.id);
          return res.status(409).json({
            success: false, code: 'ALREADY_BOOKED',
            message: 'You have already booked your free call.',
            booking: publicBooking(mine),
          });
        }
        // Every candidate was busy at this slot, so the slot really is full.
        return res.status(409).json({
          success: false, code: 'SLOT_TAKEN',
          message: 'Someone just booked that slot. Please pick another time.',
        });
      }
      if (isMissingTable(error)) {
        console.error('[freeCallRoutes] free_call_bookings table missing — run sql/free_call_booking_schema.sql');
        return res.status(503).json({ success: false, message: 'Booking is not available yet.' });
      }
      throw new Error(error ? error.message : 'Booking failed');
    }

    notifyAstrologerOfBooking(app, data, 'booked'); // not awaited: the customer is done
    return res.status(201).json({ success: true, booking: publicBooking(data), message: offer.successText });
  }));

  /* ── Admin: free-call invites ─────────────────────────────────────────────
   * Offer the free call to customers by push, whether or not the public offer is
   * switched on. Who can be invited: anyone without a live (non-cancelled)
   * free-call booking — that is also the only rule the invite applies at booking
   * time, so a customer who is sent one can always use it until it expires.
   *
   * audience: 'all_not_booked' (every such customer) | 'customers' (targetIds).
   * Customers who already have a booking are skipped and counted, not errored.
   */
  async function inviteRecipients(audience, targetIds) {
    const { rows: booked } = await pagedSelect(() => db
      .from('free_call_bookings')
      .select('customer_id')
      .neq('status', 'cancelled')
      .order('id'));
    const bookedIds = new Set(booked.map((r) => r.customer_id));

    let candidates;
    if (audience === 'customers') {
      candidates = [];
      for (const ids of chunkIds([...new Set(targetIds.map(String))])) {
        const { data, error } = await db
          .from('customers')
          .select('id, name, mobile, fcm_token')
          .in('id', ids);
        if (error) throw error;
        candidates.push(...(data || []));
      }
    } else {
      const { rows } = await pagedSelect(() => db
        .from('customers')
        .select('id, name, mobile, fcm_token')
        .order('id'));
      candidates = rows;
    }
    // Soft-deleted accounts carry a 'deleted:' phone tag and must never be contacted.
    candidates = candidates.filter((c) => !String(c.mobile || '').startsWith('deleted:'));
    const recipients = candidates.filter((c) => !bookedIds.has(c.id));
    return { recipients, skippedBooked: candidates.length - recipients.length };
  }

  const INVITE_AUDIENCES = ['all_not_booked', 'customers'];

  app.post('/api/admin/free-call-invites/preview', requireAdmin, h(async (req, res) => {
    const { audience, targetIds } = req.body || {};
    if (!INVITE_AUDIENCES.includes(audience)) {
      return res.status(400).json({ success: false, message: 'Invalid audience' });
    }
    if (audience === 'customers' && (!Array.isArray(targetIds) || !targetIds.length)) {
      return res.status(400).json({ success: false, message: 'Pick at least one customer' });
    }
    const { recipients, skippedBooked } = await inviteRecipients(audience, targetIds);
    return res.json({
      success: true,
      recipientCount: recipients.length,
      withPushToken: recipients.filter((r) => r.fcm_token).length,
      skippedBooked,
    });
  }));

  app.post('/api/admin/free-call-invites/send', requireAdmin, h(async (req, res) => {
    const { audience, targetIds } = req.body || {};
    const title = String(req.body?.title || '').trim();
    const body = String(req.body?.body || '').trim();
    const validDays = clampInt(req.body?.validDays, 1, 60, 7);

    if (!INVITE_AUDIENCES.includes(audience)) {
      return res.status(400).json({ success: false, message: 'Invalid audience' });
    }
    if (audience === 'customers' && (!Array.isArray(targetIds) || !targetIds.length)) {
      return res.status(400).json({ success: false, message: 'Pick at least one customer' });
    }
    if (!title || !body || title.length > 120 || body.length > 500) {
      return res.status(400).json({ success: false, message: 'Title (max 120) and message (max 500) are required' });
    }

    const { recipients, skippedBooked } = await inviteRecipients(audience, targetIds);
    if (!recipients.length) {
      return res.status(404).json({
        success: false,
        message: skippedBooked ? 'Everyone selected already has a free call booked.' : 'No matching customers found.',
        skippedBooked,
      });
    }

    const expiresAt = new Date(Date.now() + validDays * 86400000).toISOString();
    const invitedBy = req.admin?.email || req.admin?.id || 'admin';

    // 1. The invite rows first: a push that lands before its invite exists would
    // open an offer the server then refuses.
    for (const ids of chunkIds(recipients.map((r) => r.id), 500)) {
      const { error } = await db.from('free_call_invites').upsert(
        ids.map((id) => ({ customer_id: id, invited_at: new Date().toISOString(), expires_at: expiresAt, invited_by: String(invitedBy) })),
        { onConflict: 'customer_id' },
      );
      if (error) {
        if (isMissingTable(error)) {
          return res.status(503).json({ success: false, message: 'Run sql/free_call_invites.sql first.' });
        }
        throw error;
      }
    }

    // 2. In-app notification list (tapping it opens the booking in the app).
    const type = 'free_call_invite';
    for (let i = 0; i < recipients.length; i += 500) {
      const rows = recipients.slice(i, i + 500).map((r) => ({ customer_id: r.id, astrologer_id: null, title, body, type }));
      const { error } = await db.from('notifications').insert(rows);
      if (error) console.warn('[freeCallRoutes] invite notifications insert failed:', error.message);
    }

    // 3. Foregrounded apps, then FCM (data-only, same as notificationRoutes.js).
    const io = app.locals.io;
    if (io) recipients.forEach((r) => io.to(String(r.id)).emit('new_notification', { title, body, type, recipient_type: 'customer' }));

    const tokens = recipients.map((r) => r.fcm_token).filter(Boolean);
    let pushSuccess = 0;
    let pushFailure = 0;
    for (let i = 0; i < tokens.length; i += 500) {
      const result = await sendPush(tokens.slice(i, i + 500), { data: { type, title, body } });
      pushSuccess += result.successCount || 0;
      pushFailure += result.failureCount || 0;
    }

    await db.from('notification_broadcasts').insert([{
      audience: `free_call_invite:${audience}`,
      target_id: recipients.length === 1 ? recipients[0].id : null,
      target_name: audience === 'customers' ? recipients.map((r) => r.name || 'Customer').join(', ').slice(0, 1000) : null,
      title,
      body,
      recipient_count: recipients.length,
      push_success: pushSuccess,
      push_failure: pushFailure,
    }]);

    return res.json({
      success: true,
      recipientCount: recipients.length,
      skippedBooked,
      pushSuccess,
      pushFailure,
      noPushToken: recipients.length - tokens.length,
      expiresAt,
    });
  }));

  app.get('/api/admin/free-call-invites/summary', requireAdmin, h(async (req, res) => {
    const nowIso = new Date().toISOString();
    const { count: active, error } = await db
      .from('free_call_invites')
      .select('id', { count: 'exact', head: true })
      .gt('expires_at', nowIso);
    if (error) {
      if (isMissingTable(error)) return res.json({ success: true, tableMissing: true, active: 0, bookedFromInvites: 0 });
      throw error;
    }
    // Invited customers who went on to book (booking made after the invite).
    const { rows: invites } = await pagedSelect(() => db.from('free_call_invites').select('customer_id, invited_at').order('customer_id'));
    let bookedFromInvites = 0;
    const invitedAt = new Map(invites.map((i) => [i.customer_id, i.invited_at]));
    for (const ids of chunkIds(invites.map((i) => i.customer_id))) {
      const { data } = await db
        .from('free_call_bookings')
        .select('customer_id, created_at')
        .in('customer_id', ids)
        .neq('status', 'cancelled');
      (data || []).forEach((b) => {
        if (new Date(b.created_at) >= new Date(invitedAt.get(b.customer_id))) bookedFromInvites += 1;
      });
    }
    return res.json({ success: true, active: active || 0, bookedFromInvites });
  }));

  /* ── Admin: list, with search + filters + real-calendar sorting ──────────── */
  app.get('/api/admin/free-call-bookings', requireAdmin, h(async (req, res) => {
    const { status, from, to, q } = req.query;
    const limit = clampInt(req.query.limit, 1, 500, 200);

    // The joined astrologer is the ASSIGNEE (who makes the call), which is a
    // different thing from the astrologer_name column (what the customer was
    // shown on the offer card). The admin table shows both.
    let query = db
      .from('free_call_bookings')
      .select('*, assignee:astrologer_id (id, first_name, last_name, phone_number), customer:customer_id (id, name, mobile, dob, time_of_birth, place_of_birth, gender)', { count: 'exact' });
    if (status && status !== 'all') query = query.eq('status', status);
    if (req.query.astrologerId === 'unassigned') query = query.is('astrologer_id', null);
    else if (req.query.astrologerId) query = query.eq('astrologer_id', req.query.astrologerId);
    if (from) query = query.gte('slot_start', new Date(from).toISOString());
    if (to) {
      // `to` is an inclusive calendar day from a date input, so extend to its end.
      const end = new Date(to);
      end.setUTCHours(23, 59, 59, 999);
      query = query.lte('slot_start', end.toISOString());
    }
    if (q) {
      // Quoted so a search term's punctuation stays a search term. Admin-authed, so
      // this is hygiene rather than a privilege hole — but an unquoted term also 400s
      // the whole query on anything containing a comma or bracket, which reads to the
      // admin as the page being broken. See src/pgrstFilter.js.
      const term = quoteLikePattern(q);
      query = query.or(`customer_name.ilike.${term},customer_phone.ilike.${term},astrologer_name.ilike.${term},admin_note.ilike.${term}`);
    }

    // Upcoming first: the admin's job is the next call, not the oldest one.
    const { data, error, count } = await query.order('slot_start', { ascending: false }).limit(limit);
    if (error) {
      // The admin page renders a "run the migration" banner off `tableMissing`,
      // so this must be a 200 with a flag, not an error the page can only show
      // as a generic failure.
      if (isMissingTable(error)) {
        return res.status(200).json({ success: true, bookings: [], total: 0, tableMissing: true });
      }
      throw new Error(error.message);
    }

    return res.status(200).json({
      success: true,
      total: count || 0,
      bookings: (data || []).map((b) => ({
        ...b,
        customer_dob: b.customer?.dob || b.customer_dob || null,
        customer_time_of_birth: b.customer?.time_of_birth || null,
        customer_place_of_birth: b.customer?.place_of_birth || null,
        customer_gender: b.customer?.gender || null,
        assigneeName: astrologerFullName(b.assignee),
        slotLabel: formatSlotLabel(new Date(b.slot_start)),
        dateKey: businessDateKey(new Date(b.slot_start)),
      })),
    });
  }));

  /* ── Admin: mark done / missed / cancelled, reschedule, add a note ────────
   * Rescheduling goes through the SAME unique index as customer booking, so an
   * admin cannot move a booking onto a slot another customer already holds.
   */
  app.patch('/api/admin/free-call-bookings/:id', requireAdmin, h(async (req, res) => {
    const { status, slotStart, adminNote, astrologerId } = req.body || {};
    const patch = {};

    // `astrologerId: null` unassigns. Any approved, unsuspended astrologer can be
    // given a booking — this is the "admin decides who handles it" control, and
    // it works whether the offer is in single or manual mode.
    if (astrologerId !== undefined) {
      if (astrologerId === null || astrologerId === '') {
        patch.astrologer_id = null;
      } else {
        const { data: astro } = await db
          .from('astrologers')
          .select('id, is_suspended, approval_status')
          .eq('id', astrologerId)
          .single();
        if (!astro) return res.status(400).json({ success: false, message: 'Unknown astrologer' });
        if (astro.is_suspended || (astro.approval_status && astro.approval_status !== 'approved')) {
          return res.status(400).json({
            success: false,
            message: 'That astrologer is suspended or not approved, so cannot be given bookings.',
          });
        }
        patch.astrologer_id = astro.id;
      }
    }

    if (status !== undefined) {
      if (!['booked', 'completed', 'missed', 'cancelled'].includes(status)) {
        return res.status(400).json({ success: false, message: 'Invalid status' });
      }
      patch.status = status;
      patch.completed_at = status === 'completed' ? new Date().toISOString() : null;
    }
    if (adminNote !== undefined) patch.admin_note = adminNote;

    const { data: current, error: readErr } = await db
      .from('free_call_bookings').select('*').eq('id', req.params.id).single();
    if (readErr || !current) return res.status(404).json({ success: false, message: 'Booking not found' });

    if (slotStart) {
      const start = new Date(slotStart);
      if (isNaN(start.getTime())) return res.status(400).json({ success: false, message: 'Invalid time' });
      const offer = await loadOffer();
      patch.slot_start = start.toISOString();
      patch.slot_end = new Date(start.getTime() + (current.duration_minutes || offer.durationMinutes) * 60000).toISOString();
      // Only stamp the original the FIRST time, so it keeps meaning "when the
      // customer was originally promised", not "the previous admin edit".
      if (!current.rescheduled_from) patch.rescheduled_from = current.slot_start;
      patch.reschedule_count = (current.reschedule_count || 0) + 1;
    }

    if (!Object.keys(patch).length) {
      return res.status(400).json({ success: false, message: 'Nothing to update' });
    }

    const { data, error } = await db
      .from('free_call_bookings').update(patch).eq('id', req.params.id)
      .select('*, assignee:astrologer_id (id, first_name, last_name, phone_number), customer:customer_id (id, name, mobile, dob, time_of_birth, place_of_birth, gender)').single();
    if (error) {
      if (error.code === '23505') {
        // With one booking per astrologer per slot, a clash now means "that
        // astrologer already has a call at that time", not "the slot is gone".
        return res.status(409).json({
          success: false, code: 'SLOT_TAKEN',
          message: patch.astrologer_id !== undefined
            ? 'That astrologer already has a free call at this time.'
            : 'That astrologer already has a call at the new time. Assign someone else, or pick another slot.',
        });
      }
      throw new Error(error.message);
    }

    return res.status(200).json({
      success: true,
      booking: {
        ...data,
        customer_dob: data.customer?.dob || data.customer_dob || null,
        customer_time_of_birth: data.customer?.time_of_birth || null,
        customer_place_of_birth: data.customer?.place_of_birth || null,
        customer_gender: data.customer?.gender || null,
        assigneeName: astrologerFullName(data.assignee),
        slotLabel: formatSlotLabel(new Date(data.slot_start)),
        dateKey: businessDateKey(new Date(data.slot_start)),
      },
    });
  }));

  /* ── Admin: permanently delete a booking ──────────────────────────────────
   * Distinct from `status: 'cancelled'` (which keeps the row as a record) —
   * this removes it entirely, e.g. for a test/spam/mistaken booking. Because
   * `free_call_bookings_customer_live_uniq` blocks a second live booking per
   * customer, deleting is also the only way to let that customer book again.
   */
  app.delete('/api/admin/free-call-bookings/:id', requireAdmin, h(async (req, res) => {
    const { data: existing, error: readErr } = await db
      .from('free_call_bookings').select('id').eq('id', req.params.id).single();
    if (readErr || !existing) return res.status(404).json({ success: false, message: 'Booking not found' });

    const { error } = await db.from('free_call_bookings').delete().eq('id', req.params.id);
    if (error) throw new Error(error.message);

    return res.status(200).json({ success: true });
  }));

  /* ── Vendor: the free intro call toggle ────────────────────────────────────
   * Switching ON puts this astrologer into the pool customers pick from; switching OFF
   * takes them out. The astrologer id comes from the verified JWT, never the body.
   *
   * THE COMMITMENT, and why the server owns it: an astrologer must complete
   * `minFreeCallsBeforeOptOut` free calls before they may switch it back off. The offer
   * is advertised to brand-new customers, so a pool that drains itself the first busy
   * evening leaves them on a screen with nobody on it. The vendor app shows a warning on
   * the way in and refuses on the way out, but the app is never the enforcement point —
   * the refusal below is (same rule as /api/vendor/availability).
   *
   * Switching ON is ALWAYS allowed. The rule exists to keep supply up, and it would be
   * a strange one that made it harder to volunteer.
   */
  async function freeIntroToggleState(astrologerId) {
    // Admin hide comes first and costs one cached read: a hidden card should not run the
    // booking count or the astrologer row query behind it. `available:false` is the same
    // answer the vendor app already handles, so nothing app-side needs to know about this.
    const visibility = await loadIntroVisibility();
    if (visibility.hiddenForAll || visibility.hiddenAstrologerIds.includes(astrologerId)) {
      return { available: false };
    }

    const offer = await loadOffer();
    const required = offer.minFreeCallsBeforeOptOut;
    const pinned = offer.instantPoolAstrologerIds.includes(astrologerId);

    const { data: astro, error } = await db
      .from('astrologers')
      .select('free_intro_call_enabled')
      .eq('id', astrologerId)
      .maybeSingle();
    if (error && isMissingOptInColumn(error)) {
      optInColumnAvailable = false;
      return { available: false };
    }
    if (error || !astro) return { available: false };

    // Everything they have already given, scheduled or instant — it is the same work,
    // and counting only one kind would read as the platform moving the goalposts.
    const { count } = await db
      .from('free_call_bookings')
      .select('id', { count: 'exact', head: true })
      .eq('astrologer_id', astrologerId)
      .eq('status', 'completed');
    const completed = Number(count) || 0;

    return {
      available: true,
      enabled: astro.free_intro_call_enabled === true || pinned,
      // Pinned by the admin: their own switch cannot take them out, so say so rather
      // than showing a toggle that flips back and a pool that keeps calling them.
      managedByAdmin: pinned,
      completed,
      required,
      remaining: Math.max(0, required - completed),
      canDisable: !pinned && completed >= required,
    };
  }

  app.get('/api/vendor/free-intro-call', h(async (req, res) => {
    const astrologerId = resolveAstrologerId(req);
    if (!astrologerId) return res.status(401).json({ success: false, message: 'Unauthorized' });
    return res.status(200).json({ success: true, ...(await freeIntroToggleState(astrologerId)) });
  }));

  app.post('/api/vendor/free-intro-call', h(async (req, res) => {
    const astrologerId = resolveAstrologerId(req);
    if (!astrologerId) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const enabled = req.body?.enabled;
    if (typeof enabled !== 'boolean') {
      return res.status(400).json({ success: false, code: 'BAD_REQUEST', message: 'enabled must be true or false' });
    }

    const state = await freeIntroToggleState(astrologerId);
    if (!state.available) {
      return res.status(503).json({
        success: false, code: 'NOT_CONFIGURED',
        message: 'Free intro calls are not set up yet.',
      });
    }

    if (!enabled && state.enabled) {
      if (state.managedByAdmin) {
        return res.status(403).json({
          success: false, code: 'MANAGED_BY_ADMIN', ...state,
          message: 'Astrowani has added you to the free intro call programme. Please contact support to opt out.',
        });
      }
      if (!state.canDisable) {
        return res.status(403).json({
          success: false, code: 'MIN_CALLS_NOT_MET', ...state,
          message: `Please complete ${state.required} free intro calls before switching this off. `
            + `You have done ${state.completed}.`,
        });
      }
    }

    const { error } = await db
      .from('astrologers')
      .update({ free_intro_call_enabled: enabled })
      .eq('id', astrologerId);
    if (error) {
      if (isMissingOptInColumn(error)) {
        optInColumnAvailable = false;
        return res.status(503).json({ success: false, code: 'NOT_CONFIGURED', message: 'Free intro calls are not set up yet.' });
      }
      throw new Error(error.message);
    }
    // So the customer-facing list reflects this on the very next request rather than up
    // to fifteen seconds later — an astrologer who switches on and is told to wait reads
    // it as broken.
    invalidateOptedInCache();

    return res.status(200).json({ success: true, ...(await freeIntroToggleState(astrologerId)) });
  }));

  /* ── Vendor: my assigned free calls ───────────────────────────────────────
   * The astrologer_id comes from the verified vendor JWT, never the query — an
   * astrologer must not be able to read another's list, which here means reading
   * customers' phone numbers.
   *
   * Returns upcoming calls first. Past ones are kept for a week so an astrologer
   * who forgot to mark one done can still find it.
   */
  app.get('/api/vendor/free-call-bookings', h(async (req, res) => {
    const astrologerId = resolveAstrologerId(req);
    if (!astrologerId) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await db
      .from('free_call_bookings')
      .select('*, customer:customer_id (id, name, mobile, dob, time_of_birth, place_of_birth, gender)')
      .eq('astrologer_id', astrologerId)
      .neq('status', 'cancelled')
      .gte('slot_start', since)
      .order('slot_start', { ascending: true });

    if (error) {
      if (isMissingTable(error)) return res.status(200).json({ success: true, bookings: [] });
      throw new Error(error.message);
    }

    const now = Date.now();
    return res.status(200).json({
      success: true,
      bookings: (data || []).map((b) => ({
        id: b.id,
        slotStart: b.slot_start,
        slotEnd: b.slot_end,
        durationMinutes: b.duration_minutes,
        status: b.status,
        customerName: b.customer_name,
        customerPhone: b.customer_phone,
        customerDob: b.customer?.dob || b.customer_dob || null,
        customerTimeOfBirth: b.customer?.time_of_birth || null,
        customerPlaceOfBirth: b.customer?.place_of_birth || null,
        customerGender: b.customer?.gender || null,
        adminNote: b.admin_note,
        slotLabel: formatSlotLabel(new Date(b.slot_start)),
        dateKey: businessDateKey(new Date(b.slot_start)),
        isPast: new Date(b.slot_start).getTime() < now,
      })),
    });
  }));

  /* -- Vendor: ring the customer, in the app --------------------------------
   * This is the astrologer STARTING the free call. It is the only place in this
   * codebase where a call is initiated by the astrologer rather than the customer,
   * which is why it cannot reuse /api/call/initiate.
   *
   * It creates a real chat_sessions row because that row is what authorises
   * everything downstream: socket join_session, signal_connection and
   * /api/call/end all verify membership against caller_id / vendor_id (closed in
   * the 2026-08-08 security audit -- do not loosen those checks to avoid this row).
   *
   * The row is marked is_free and priced at 0, so the billing loop skips it and
   * could not charge anything even if it did not. NOTHING here moves money.
   */
  app.post('/api/vendor/free-call-bookings/:id/ring', h(async (req, res) => {
    const astrologerId = resolveAstrologerId(req);
    if (!astrologerId) return res.status(401).json({ success: false, message: 'Unauthorized' });

    // The astrologer_id filter IS the authorisation check, same as the PATCH above.
    const { data: booking, error: readErr } = await db
      .from('free_call_bookings')
      .select('*')
      .eq('id', req.params.id)
      .eq('astrologer_id', astrologerId)
      .maybeSingle();
    if (readErr) {
      if (isMissingTable(readErr)) return res.status(503).json({ success: false, message: 'Bookings table not created yet.' });
      throw new Error(readErr.message);
    }
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });

    // select('*') returns whatever columns exist, so a missing key here IS the
    // "migration not applied" signal -- no extra probe query needed.
    if (!('call_session_id' in booking)) {
      console.warn('[FreeCall] free_call_bookings is missing the call_* columns -- run sql/free_call_in_app.sql');
      return res.status(503).json({
        success: false,
        code: 'MIGRATION_REQUIRED',
        message: 'In-app calling is not set up on the server yet. Ask the admin to run the free-call update.',
      });
    }

    if (booking.status === 'cancelled') {
      return res.status(409).json({ success: false, code: 'CANCELLED', message: 'This booking was cancelled.' });
    }

    // Rejoining a call already in progress (the astrologer backgrounded the app,
    // or tapped twice) must NOT mint a second session -- that would leave the first
    // one active forever with the customer connected to a room nobody is in.
    if (booking.call_session_id && !booking.call_ended_at) {
      const { data: live } = await db
        .from('chat_sessions')
        .select('id, is_active')
        .eq('id', booking.call_session_id)
        .maybeSingle();
      if (live && live.is_active) {
        return res.status(200).json({
          success: true,
          rejoined: true,
          sessionId: live.id,
          customerName: booking.customer_name || 'Customer',
          durationMinutes: booking.duration_minutes || 11,
        });
      }
    }

    // Don't ring a customer who is already mid-consultation with someone else --
    // they would get a second call screen over a live paid one.
    const customerBusy = await checkCustomerBusy(db, booking.customer_id);
    if (customerBusy.busy) {
      return res.status(409).json({
        success: false, code: 'CUSTOMER_BUSY',
        message: 'This customer is already on a call or chat. Try again in a few minutes.',
      });
    }
    // And don't let the astrologer start a free call on top of a paid one of their own.
    const selfBusy = await checkAstrologerBusy(db, astrologerId);
    if (selfBusy.busy) {
      return res.status(409).json({
        success: false, code: 'SELF_BUSY',
        message: 'Finish your current session before starting this free call.',
      });
    }

    const sessionId = crypto.randomUUID();
    const startedAt = new Date();
    const durationMinutes = booking.duration_minutes || 11;

    // is_active true from the moment it rings, so the astrologer counts as busy for
    // the whole attempt and a paying customer cannot ring them mid-free-call.
    // endOverdueFreeCalls() in sessionManager is the backstop that closes it if both
    // apps die -- this row must never be able to strand somebody as permanently busy.
    const sessionRow = {
      id: sessionId,
      caller_id: booking.customer_id,
      vendor_id: astrologerId,
      is_active: true,
      per_minute_charge: 0,
      started_at: startedAt.toISOString(),
      // Far enough out that it is never "due" even on a database where the is_free
      // filter has not been migrated yet; the charge is 0 regardless.
      next_billing_at: new Date(startedAt.getTime() + 24 * 60 * 60 * 1000).toISOString(),
      is_free: true,
    };
    let { error: sessErr } = await db.from('chat_sessions').insert([sessionRow]);
    if (sessErr && /is_free/.test(sessErr.message || '')) {
      // Pre-migration: retry without the flag rather than refusing to place the
      // call. per_minute_charge stays 0 and next_billing_at is a day out, so the
      // degraded path still cannot charge the customer.
      delete sessionRow.is_free;
      console.warn('[FreeCall] chat_sessions.is_free missing -- run sql/free_call_in_app.sql');
      ({ error: sessErr } = await db.from('chat_sessions').insert([sessionRow]));
    }
    if (sessErr) throw new Error(sessErr.message);

    const { error: bookErr } = await db
      .from('free_call_bookings')
      .update({
        call_session_id: sessionId,
        call_started_at: startedAt.toISOString(),
        call_ended_at: null,
        call_duration_seconds: null,
        call_attempts: (booking.call_attempts || 0) + 1,
      })
      .eq('id', booking.id);
    if (bookErr) {
      // The booking could not be linked to the session, so nothing would ever close
      // that session out. Roll it back rather than leaving the astrologer busy.
      await db.from('chat_sessions').delete().eq('id', sessionId);
      throw new Error(bookErr.message);
    }

    const { data: astro } = await db
      .from('astrologers')
      .select('id, name, first_name, last_name, profile_pic_url')
      .eq('id', astrologerId)
      .maybeSingle();
    const astroName = booking.astrologer_name || astrologerFullName(astro || {}) || 'Astrologer';
    const astroImage = astro?.profile_pic_url || '';

    const payload = {
      type: 'free_call_incoming',
      bookingId: booking.id,
      sessionId,
      astrologerId,
      astrologerName: astroName,
      astrologerImage: astroImage,
      durationMinutes,
      // title/body are REQUIRED for the customer app to render anything: its
      // showLocalNotification() returns early without a body, so a data-only push
      // with neither would reach a backgrounded phone and display nothing at all.
      title: `${astroName} is calling you`,
      body: `Your free ${durationMinutes}-minute consultation is starting. Tap to answer.`,
    };

    // Socket reaches a customer with the app open; the data-only push is what reaches
    // a backgrounded one. Both, always -- this is a scheduled call the customer is
    // expecting, so a missed ring is the whole feature failing.
    const io = app.locals.io;
    if (io) io.to(String(booking.customer_id)).emit('free_call_incoming', payload);

    db.from('customers').select('fcm_token').eq('id', booking.customer_id).maybeSingle()
      .then(({ data: cust }) => {
        if (cust?.fcm_token) {
          sendPush(cust.fcm_token, {
            data: Object.fromEntries(Object.entries(payload).map(([k, v]) => [k, String(v)])),
          }).catch((e) => console.error('[FreeCall] push error:', e.message));
        }
      })
      .catch(() => {});

    console.log(`[FreeCall] Astrologer ${astrologerId} ringing customer ${booking.customer_id} (session ${sessionId})`);
    return res.status(200).json({
      success: true,
      sessionId,
      customerName: booking.customer_name || 'Customer',
      durationMinutes,
    });
  }));

  /* -- Customer: is an astrologer ringing me right now? ---------------------
   * The socket event is what normally raises the incoming-call screen, but it only
   * reaches an app that is already running. A customer whose app was killed and is
   * opened from the push notification has missed it entirely. This lets the app ask
   * on launch, so the ring survives a cold start.
   *
   * "Ringing" = a live free session for this customer whose booking has not been
   * closed out and which started within the last two minutes -- past that, nobody
   * is still holding a phone to their ear waiting.
   */
  app.get('/api/free-call/incoming', h(async (req, res) => {
    const customer = await resolveCustomer(req);
    if (!customer) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const since = new Date(Date.now() - 2 * 60 * 1000).toISOString();
    const { data: booking, error } = await db
      .from('free_call_bookings')
      .select('id, call_session_id, astrologer_id, astrologer_name, duration_minutes, call_started_at')
      .eq('customer_id', customer.id)
      .not('call_session_id', 'is', null)
      .is('call_ended_at', null)
      .gte('call_started_at', since)
      .order('call_started_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      // Not migrated / no such booking: nobody is ringing. Never an error to the
      // app -- this runs on every launch and must not make a launch look broken.
      return res.status(200).json({ success: true, incoming: null });
    }
    if (!booking) return res.status(200).json({ success: true, incoming: null });

    // The booking row alone is not proof the call is still up: the astrologer may
    // have hung up in a way that ended the session before the booking was stamped.
    const { data: sess } = await db
      .from('chat_sessions')
      .select('id, is_active')
      .eq('id', booking.call_session_id)
      .maybeSingle();
    if (!sess || !sess.is_active) return res.status(200).json({ success: true, incoming: null });

    const { data: astro } = await db
      .from('astrologers')
      .select('id, name, first_name, last_name, profile_pic_url')
      .eq('id', booking.astrologer_id)
      .maybeSingle();

    return res.status(200).json({
      success: true,
      incoming: {
        bookingId: booking.id,
        sessionId: booking.call_session_id,
        astrologerId: booking.astrologer_id,
        astrologerName: booking.astrologer_name || astrologerFullName(astro || {}) || 'Astrologer',
        astrologerImage: astro?.profile_pic_url || '',
        durationMinutes: booking.duration_minutes || 11,
      },
    });
  }));

  /* -- Customer: I can't take this call right now ---------------------------
   * Declining ends the session immediately so the astrologer's screen drops out of
   * ringing instead of sitting there for the full timeout, and so neither party is
   * left marked busy. The booking stays 'booked' -- a declined ring is not a
   * delivered call, and the astrologer can try again.
   */
  app.post('/api/free-call/:bookingId/decline', h(async (req, res) => {
    const customer = await resolveCustomer(req);
    if (!customer) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const { data: booking } = await db
      .from('free_call_bookings')
      .select('id, call_session_id, astrologer_id')
      .eq('id', req.params.bookingId)
      .eq('customer_id', customer.id)
      .maybeSingle();
    if (!booking || !booking.call_session_id) {
      return res.status(404).json({ success: false, message: 'No call to decline' });
    }

    const sessionManager = app.locals.sessionManager;
    if (sessionManager) {
      // The normal path: this also notifies both parties and clears the astrologer's
      // busy state, and stamps the booking via closeFreeCallBooking().
      await sessionManager.terminateSession(booking.call_session_id, 'Customer declined the free call');
    } else {
      // Fallback for a process where sessionManager was never attached. Close the
      // booking out here too -- leaving call_ended_at null would make this look like
      // a call still in progress to endOverdueFreeCalls and to the incoming-call check.
      const endedAt = new Date().toISOString();
      await db.from('chat_sessions')
        .update({ is_active: false, ended_at: endedAt })
        .eq('id', booking.call_session_id);
      await db.from('free_call_bookings')
        .update({ call_ended_at: endedAt })
        .eq('id', booking.id);
    }

    const io = app.locals.io;
    if (io) {
      io.to(String(booking.astrologer_id)).emit('free_call_declined', {
        bookingId: booking.id,
        sessionId: booking.call_session_id,
      });
    }
    return res.status(200).json({ success: true });
  }));

  /* -- Vendor: mark one of my calls done or missed --------------------------
   * Deliberately narrower than the admin PATCH: an astrologer can record what
   * happened, but cannot reschedule or cancel. Moving a customer's appointment
   * is a conversation the admin has, not a button in the vendor app.
   */
  app.patch('/api/vendor/free-call-bookings/:id', h(async (req, res) => {
    const astrologerId = resolveAstrologerId(req);
    if (!astrologerId) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const { status } = req.body || {};
    if (!['completed', 'missed'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Status must be completed or missed' });
    }

    // The astrologer_id filter is the authorisation check: an id that is not
    // theirs simply updates zero rows and 404s.
    const { data, error } = await db
      .from('free_call_bookings')
      .update({ status, completed_at: status === 'completed' ? new Date().toISOString() : null })
      .eq('id', req.params.id)
      .eq('astrologer_id', astrologerId)
      .select('id, status')
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!data) return res.status(404).json({ success: false, message: 'Booking not found' });
    return res.status(200).json({ success: true, booking: data });
  }));

  /* ── Admin: spread every unassigned booking across the astrologers ────────
   * Switching to pool mode only changes what happens to FUTURE bookings, so
   * anything already sitting unassigned would stay that way forever. This is the
   * catch-up: one call hands out the whole backlog on the same least-loaded rule
   * new bookings use, so an admin never has to work through them one at a time.
   *
   * Takes `astrologerIds` from the body, or falls back to the configured pool.
   * Only ever touches future, still-'booked', unassigned rows — it will not
   * reassign work someone already has, or disturb the past.
   */
  app.post('/api/admin/free-call-bookings/distribute', requireAdmin, h(async (req, res) => {
    const offer = await loadOffer();
    const requested = Array.isArray(req.body?.astrologerIds) ? req.body.astrologerIds : null;
    const poolIds = requested && requested.length
      ? requested
      : (offer.assignmentMode === 'pool' ? offer.poolAstrologerIds : []);

    const pool = await activeAstrologers(poolIds);
    if (!pool.length) {
      return res.status(400).json({
        success: false,
        code: 'NO_POOL',
        message: 'Choose at least one approved astrologer to share the bookings between.',
      });
    }

    const nowIso = new Date().toISOString();
    const { data: pending, error: readErr } = await db
      .from('free_call_bookings')
      .select('id, slot_start')
      .is('astrologer_id', null)
      .eq('status', 'booked')
      .gte('slot_start', nowIso)
      .order('slot_start', { ascending: true });
    if (readErr) {
      if (isMissingTable(readErr)) return res.status(503).json({ success: false, message: 'Bookings table not created yet.' });
      throw new Error(readErr.message);
    }
    if (!pending || !pending.length) {
      return res.status(200).json({ success: true, assigned: 0, skipped: 0, perAstrologer: [], message: 'Nothing was waiting to be assigned.' });
    }

    // Seed each astrologer's running count from the work they ALREADY hold, so a
    // backlog is spread to even out the real totals rather than being dealt out
    // evenly on top of an existing imbalance.
    const counts = new Map(pool.map((a) => [a.id, 0]));
    const { data: existing } = await db
      .from('free_call_bookings')
      .select('astrologer_id')
      .eq('status', 'booked')
      .gte('slot_start', nowIso)
      .in('astrologer_id', pool.map((a) => a.id));
    (existing || []).forEach((r) => {
      if (counts.has(r.astrologer_id)) counts.set(r.astrologer_id, counts.get(r.astrologer_id) + 1);
    });

    let assigned = 0;
    let skipped = 0;
    for (const row of pending) {
      // Emptiest first, and walk down on a clash: a 23505 means that astrologer
      // already has a call at this exact slot, which is the database enforcing
      // "nobody is double-booked" — not an error to report.
      const order = [...pool].sort((a, b) => counts.get(a.id) - counts.get(b.id));
      let placed = false;
      for (const astro of order) {
        const { error } = await db
          .from('free_call_bookings')
          .update({ astrologer_id: astro.id })
          .eq('id', row.id)
          .is('astrologer_id', null);   // never steal a row someone just claimed
        if (!error) {
          counts.set(astro.id, counts.get(astro.id) + 1);
          assigned += 1;
          placed = true;
          break;
        }
        if (error.code !== '23505') throw new Error(error.message);
      }
      // Every pool member is already busy at that slot. Left unassigned on
      // purpose and reported, rather than silently double-booking someone.
      if (!placed) skipped += 1;
    }

    return res.status(200).json({
      success: true,
      assigned,
      skipped,
      perAstrologer: pool.map((a) => ({
        id: a.id,
        name: astrologerFullName(a),
        total: counts.get(a.id),
      })),
    });
  }));

  /* ── Admin: the slot grid, for the reschedule picker ─────────────────────── */
  app.get('/api/admin/free-call-slots', requireAdmin, h(async (req, res) => {
    const offer = await loadOffer();
    const now = new Date();
    const dates = offerDateKeys(offer, now);
    const dateKey = req.query.date || dates[0];
    // Admins may reschedule outside the customer-facing lead time, so `past` is
    // reported but not enforced — a call can legitimately be moved to 20 minutes
    // from now after a phone conversation.
    const slots = buildSlots(offer, dateKey, now);
    const capacity = await slotCapacity(offer);
    const used = await slotUsage(slots);
    return res.status(200).json({
      success: true,
      date: dateKey,
      capacity,
      dates: dates.map((k) => ({ key: k, label: dateLabel(k) })),
      slots: slots.map((s) => ({
        start: s.startIso,
        label: s.label,
        used: used.get(s.start.getTime()) || 0,
        taken: (used.get(s.start.getTime()) || 0) >= capacity,
        past: s.past,
      })),
    });
  }));
};

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MON_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function dateLabel(dateKey) {
  const [y, m, d] = dateKey.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return { day: DAY_NAMES[dt.getUTCDay()], date: d, month: MON_NAMES[m - 1] };
}

/**
 * Point a customer's live INSTANT booking at the session that has just been created for
 * it, and stamp when the call started.
 *
 * WHY THIS EXISTS, and why it is not optional: everything that happens at the END of a
 * free call is keyed on `free_call_bookings.call_session_id`.
 *   * sessionManager.closeFreeCallBooking() finds the booking by it — no link, no booking
 *     closure, NO PAYOUT and no hold, so the upsell never appears either;
 *   * sessionManager.endOverdueFreeCalls() finds overrunning calls by it — no link means
 *     the 11-minute limit is never enforced by the server.
 * The scheduled flow sets this in its own /ring endpoint. The instant flow cannot: the
 * session is created later, by /api/session/accept, when the astrologer accepts.
 *
 * Found by driving two emulators (2026-09-27): every earlier test stopped at the ring, so
 * nothing had ever exercised the accept. The call worked and was correctly free — it just
 * silently paid nobody and would have run forever.
 *
 * Never throws: the call is already connecting by the time this runs and must not be
 * broken by a bookkeeping failure. A miss is loud in the log and fixable by hand.
 */
async function linkInstantBookingToSession(customerId, sessionId) {
  if (!customerId || !sessionId) return false;
  try {
    const { data, error } = await db
      .from('free_call_bookings')
      .update({
        call_session_id: sessionId,
        call_started_at: new Date().toISOString(),
        call_ended_at: null,
        call_duration_seconds: null,
      })
      .eq('customer_id', customerId)
      .eq('kind', 'instant')
      .eq('status', 'booked')
      .is('call_session_id', null)
      .select('id');
    if (error) {
      if (isMissingColumn(error, 'kind')) return false; // pre-migration; nothing to link
      console.error('[FreeCall] could not link instant booking to session '
        + `${sessionId} — this call will NOT pay the astrologer:`, error.message);
      return false;
    }
    if (!data || !data.length) {
      console.warn(`[FreeCall] no open instant booking for customer ${customerId}; `
        + `session ${sessionId} is free but unlinked (no payout, no hold).`);
      return false;
    }
    return true;
  } catch (e) {
    console.error('[FreeCall] linkInstantBookingToSession threw:', e.message);
    return false;
  }
}

module.exports.linkInstantBookingToSession = linkInstantBookingToSession;

/**
 * Configured free-call length in seconds, for /api/session/accept to hand to the
 * ASTROLOGER's call screen. That screen already knows how to run a free call (it takes
 * freeCall/freeCallSeconds and shows the remaining time); it simply was not being told,
 * so the astrologer saw a plain elapsed counter while the customer watched a countdown
 * and had no idea when the free period ran out.
 */
async function freeCallDurationSeconds() {
  try {
    const offer = await loadOffer();
    return (Number(offer.durationMinutes) || 11) * 60;
  } catch (_) {
    return 11 * 60;
  }
}
module.exports.freeCallDurationSeconds = freeCallDurationSeconds;
module.exports.loadOffer = loadOffer;
module.exports.FREE_CALL_TZ_OFFSET_MIN = FREE_CALL_TZ_OFFSET_MIN;
// Exported for tests only. The slot arithmetic is the part of this file most
// likely to be wrong in a way nobody notices (it must not follow the server's
// own timezone), so it is testable without a database.
module.exports._internals = { buildSlots, offerDateKeys, businessDateKey, businessInstant, formatSlotLabel, describeWhen, DEFAULTS, parseClock };
module.exports.assigneeCandidates = assigneeCandidates;
module.exports.slotCapacity = slotCapacity;
