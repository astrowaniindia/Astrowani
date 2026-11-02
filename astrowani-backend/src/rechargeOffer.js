// Recharge bonus offers — "add ₹500, get ₹50 extra".
//
// The customer pays the gateway what they always paid; we credit their wallet MORE than
// that. Razorpay knows nothing about this, which is what makes it cheap to run: the extra
// is only ever spendable inside the app.
//
// THE RULE: the server decides the bonus. Nothing about it is ever taken from the app.
// The app is told what is on offer only so it can display it.
//
// WHERE IT IS APPLIED: src/walletRecharge.js, at the moment the recharge is claimed
// (created -> paid), inside the SAME single wallet credit as the recharge itself and under
// the same `razorpay:<paymentId>` idempotency key. That is deliberate — the app callback
// and the Razorpay webhook race each other on every payment, and a bonus credited under
// its own separate key would be a second thing that could double-fire or half-fail. One
// credit, one key, exactly once.
//
// The resolved figure is then written to wallet_recharges.bonus_amount and never
// recomputed. An offer changed or switched off between two attempts at the same payment
// cannot change what that payment was worth.
//
// SEASONAL OFFERS: `endsAt` stops the payout at a moment in time without anybody having
// to remember to switch it off, which is what a festival offer actually needs. Expiry is
// evaluated per decision rather than at load — see isExpired() — and an expired offer is
// indistinguishable from a switched-off one to the app.
const { createClient } = require('@supabase/supabase-js');

const db = createClient(
  process.env.SUPABASE_URL || 'https://fxpoustnddrgumhwdcma.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const SETTINGS_KEY = 'recharge_offer';
const CACHE_TTL_MS = 30 * 1000;

// Hard ceilings. These are not the admin's to raise — they exist so a typo in the admin
// form cannot mint money. A percent field is the dangerous one: "10" and "1000" differ by
// one keystroke, and the second would hand out ten times the recharge.
const MAX_PERCENT = 100;
const MAX_FLAT_BONUS = 100000;
const MAX_SLABS = 10;
// A bonus may never exceed the recharge itself. Even a 100%-correct config is capped at
// "double your money", which is as far as any sane promotion goes.
const MAX_BONUS_RATIO = 1;
// Display-only heading for the wallet card ("Diwali Dhamaka"). Capped so a paste accident
// cannot push the layout apart. It takes no part in any arithmetic and never reaches the
// ledger — the credit note is still generated from the figure actually credited, so this
// text can never disagree with the money.
const MAX_TITLE_LEN = 40;

let cache = { value: null, at: 0 };

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

/**
 * When the offer stops paying out.
 *
 * ABSENT means "runs until somebody switches it off"; PRESENT BUT UNPARSEABLE means
 * EXPIRED, not "no expiry". That asymmetry is deliberate and is the whole point of the
 * field: a seasonal offer is set up once and then forgotten, so the dangerous direction
 * is an end date that silently evaporates into "forever". A typo costs an offer that
 * pays nothing — visible within minutes, and fixable — while the other way round pays
 * real money for as long as nobody notices.
 *
 * @returns {{endsAt:string|null, endsAtInvalid:boolean}}
 */
function parseEndsAt(raw) {
  if (raw === undefined || raw === null || raw === '') return { endsAt: null, endsAtInvalid: false };
  const t = Date.parse(raw);
  if (!Number.isFinite(t)) return { endsAt: null, endsAtInvalid: true };
  return { endsAt: new Date(t).toISOString(), endsAtInvalid: false };
}

/**
 * Coerce whatever is in app_settings into something safe to do arithmetic with.
 * Anything unparseable, out of range or the wrong shape is dropped rather than guessed at.
 */
function normalise(raw) {
  let parsed = {};
  if (raw) {
    try { parsed = JSON.parse(raw) || {}; } catch (_) { parsed = {}; }
  }

  const slabs = (Array.isArray(parsed.slabs) ? parsed.slabs : [])
    .map((s) => {
      const minAmount = Number(s?.minAmount);
      const value = Number(s?.value);
      const type = s?.type === 'flat' ? 'flat' : 'percent';
      if (!Number.isFinite(minAmount) || minAmount < 1) return null;
      if (!Number.isFinite(value) || value <= 0) return null;
      const maxBonus = Number(s?.maxBonus);
      return {
        minAmount: Math.floor(minAmount),
        type,
        value: type === 'percent'
          ? Math.min(value, MAX_PERCENT)
          : Math.min(value, MAX_FLAT_BONUS),
        // 0 / absent / nonsense all mean "no cap of its own"; the global ratio still applies.
        maxBonus: Number.isFinite(maxBonus) && maxBonus > 0 ? maxBonus : 0,
      };
    })
    .filter(Boolean)
    // Biggest first: resolveBonus takes the first match, which is the most generous slab
    // the customer qualifies for.
    .sort((a, b) => b.minAmount - a.minAmount)
    .slice(0, MAX_SLABS);

  const title = typeof parsed.title === 'string'
    // Control characters stripped: this string is rendered in the app, and a stray
    // newline from a paste would break the card's single-line heading.
    ? parsed.title.replace(/[\u0000-\u001F\u007F]/g, ' ').trim().slice(0, MAX_TITLE_LEN) || null
    : null;

  return {
    enabled: (parsed.enabled === true || parsed.enabled === 'true') && slabs.length > 0,
    slabs,
    title,
    ...parseEndsAt(parsed.endsAt),
  };
}

const OFF = { enabled: false, slabs: [], title: null, endsAt: null, endsAtInvalid: false };

/**
 * Current offer config.
 *
 * FAILS CLOSED: if it cannot be read, nobody gets a bonus. The opposite default would
 * hand out money on the strength of a database blip, and a missed bonus is something a
 * human can put right afterwards while an unintended one is already spent.
 */
async function loadOffer() {
  if (cache.value && Date.now() - cache.at < CACHE_TTL_MS) return cache.value;
  try {
    const { data, error } = await db
      .from('app_settings').select('value').eq('key', SETTINGS_KEY).limit(1);
    if (error) throw new Error(error.message);
    const value = normalise(data && data.length ? data[0].value : null);
    cache = { value, at: Date.now() };
    return value;
  } catch (e) {
    if (cache.value) return cache.value;
    console.warn('[rechargeOffer] could not read the offer config — no bonus will be applied:', e.message);
    return OFF;
  }
}

function invalidateCache() { cache = { value: cache.value, at: 0 }; }

/** Human wording for the ledger line and the app. Generated, never admin free-text, so it
 *  can never disagree with the number actually credited. */
function labelFor(slab, bonus) {
  return slab.type === 'percent'
    ? `${slab.value}% recharge bonus (₹${bonus})`
    : `₹${bonus} recharge bonus`;
}

/**
 * Has the offer's end date passed?
 *
 * Checked HERE rather than in loadOffer because loadOffer is cached for 30s: an offer
 * that expires inside that window would otherwise keep paying out until the cache turned
 * over. Expiry is evaluated against the clock at the moment of each decision instead.
 *
 * @param {{endsAt:string|null, endsAtInvalid:boolean}} offer
 * @param {number} [now] epoch ms
 */
function isExpired(offer, now = Date.now()) {
  if (!offer) return true;
  if (offer.endsAtInvalid) return true;          // see parseEndsAt
  if (!offer.endsAt) return false;               // no end date set — runs until switched off
  return Date.parse(offer.endsAt) <= now;
}

/**
 * How much extra this recharge earns. Pure — give it the config and it will not touch IO.
 *
 * @param {number} amountRupees what the customer actually paid
 * @param {{enabled:boolean, slabs:Array, endsAt:string|null}} offer
 * @param {number} [now] epoch ms, so expiry is testable without touching the clock
 * @returns {{bonus:number, label:string|null, slab:object|null}}
 */
function resolveBonus(amountRupees, offer, now = Date.now()) {
  const none = { bonus: 0, label: null, slab: null };
  if (!offer || !offer.enabled) return none;
  if (isExpired(offer, now)) return none;

  const amount = Number(amountRupees);
  if (!Number.isFinite(amount) || amount <= 0) return none;

  const slab = offer.slabs.find((s) => amount >= s.minAmount);
  if (!slab) return none;

  let bonus = slab.type === 'percent' ? (amount * slab.value) / 100 : slab.value;
  if (slab.maxBonus > 0) bonus = Math.min(bonus, slab.maxBonus);
  bonus = Math.min(bonus, amount * MAX_BONUS_RATIO);
  bonus = round2(bonus);

  if (!Number.isFinite(bonus) || bonus <= 0) return none;
  return { bonus, label: labelFor(slab, bonus), slab };
}

/** Config + resolver in one, for the credit path. Never throws. */
async function bonusFor(amountRupees) {
  try {
    return resolveBonus(amountRupees, await loadOffer());
  } catch (e) {
    console.warn('[rechargeOffer] bonus resolution failed — crediting the recharge only:', e.message);
    return { bonus: 0, label: null, slab: null };
  }
}

/**
 * What to show the customer before they pay. Shape is deliberately display-only: the app
 * never sends any of this back, and the server does not trust it if it does.
 */
function buildPublicOffer(offer, now = Date.now()) {
  // An expired offer is served exactly like a switched-off one. The app therefore never
  // has to decide whether to believe its own clock: the only offers it is ever handed are
  // live ones, and the countdown it draws is decoration over a decision already made here.
  if (!offer || !offer.enabled || isExpired(offer, now)) return { enabled: false, slabs: [] };
  return {
    enabled: true,
    title: offer.title,
    endsAt: offer.endsAt,
    slabs: offer.slabs
      .slice()
      .sort((a, b) => a.minAmount - b.minAmount)
      .map((s) => {
        // Pre-rendered so the app cannot arrive at a different number than we would.
        const example = resolveBonus(s.minAmount, offer, now).bonus;
        return {
          minAmount: s.minAmount,
          type: s.type,
          value: s.value,
          maxBonus: s.maxBonus || null,
          example,
          // What the customer ends up with for exactly this amount — the "pay ₹75, get
          // ₹100" line. Computed here for the same reason as `example`.
          total: round2(s.minAmount + example),
        };
      }),
  };
}

/** The IO shell around buildPublicOffer. */
async function publicOffer(now = Date.now()) {
  return buildPublicOffer(await loadOffer(), now);
}

module.exports = {
  SETTINGS_KEY,
  loadOffer,
  invalidateCache,
  isExpired,
  resolveBonus,
  bonusFor,
  publicOffer,
  buildPublicOffer,
  normalise,
  MAX_PERCENT,
  MAX_FLAT_BONUS,
  MAX_SLABS,
  MAX_TITLE_LEN,
};
