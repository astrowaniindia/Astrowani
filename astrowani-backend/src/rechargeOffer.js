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

let cache = { value: null, at: 0 };

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

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

  return {
    enabled: (parsed.enabled === true || parsed.enabled === 'true') && slabs.length > 0,
    slabs,
  };
}

const OFF = { enabled: false, slabs: [] };

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
 * How much extra this recharge earns. Pure — give it the config and it will not touch IO.
 *
 * @param {number} amountRupees what the customer actually paid
 * @param {{enabled:boolean, slabs:Array}} offer
 * @returns {{bonus:number, label:string|null, slab:object|null}}
 */
function resolveBonus(amountRupees, offer) {
  const none = { bonus: 0, label: null, slab: null };
  if (!offer || !offer.enabled) return none;

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
async function publicOffer() {
  const offer = await loadOffer();
  if (!offer.enabled) return { enabled: false, slabs: [] };
  return {
    enabled: true,
    slabs: offer.slabs
      .slice()
      .sort((a, b) => a.minAmount - b.minAmount)
      .map((s) => ({
        minAmount: s.minAmount,
        type: s.type,
        value: s.value,
        maxBonus: s.maxBonus || null,
        // Pre-rendered so the app cannot arrive at a different number than we would.
        example: resolveBonus(s.minAmount, offer).bonus,
      })),
  };
}

module.exports = {
  SETTINGS_KEY,
  loadOffer,
  invalidateCache,
  resolveBonus,
  bonusFor,
  publicOffer,
  normalise,
  MAX_PERCENT,
  MAX_FLAT_BONUS,
  MAX_SLABS,
};
