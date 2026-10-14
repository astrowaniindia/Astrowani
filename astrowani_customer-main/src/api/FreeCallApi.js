// Free 11-minute introductory call — every network call for the offer.
//
// The server is the only authority on which slots exist and which are free (see
// astrowani-backend/src/freeCallRoutes.js). Nothing here computes a slot, checks
// eligibility, or decides whether a time is available — it renders what it is told.
//
// Every read RESOLVES rather than rejects, with the offer switched off. A failed
// fetch must not break Home; the worst outcome of a failure is that a customer
// isn't shown the offer this launch, which is recoverable on the next one.

import { Image, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Instance from './ApiCall';

// Sent as `platform` on every free-call request so the admin can turn the offer
// off for one app while leaving it on for the other (astrowani-backend/src/
// freeCallRoutes.js `enabledPlatforms`). Not a security boundary -- just tells
// the server which per-platform switch to check.
const PLATFORM = Platform.OS;

// Warm the astrologer faces the offer card shows, the moment we know which they are.
// The card is a row of photographs off Supabase; fetched only when the card renders
// they arrive visibly late and the card pops. Doing it HERE (rather than in the
// screen) means every path that asks for the offer warms them -- including the
// prefetch SignupName fires while the customer is still typing their name, which
// buys roughly a minute.
function warmAstrologerFaces(data) {
  const list = data?.offer?.astrologers;
  if (!Array.isArray(list)) return;
  list.forEach((a) => {
    if (typeof a?.image === 'string' && /^https?:/.test(a.image)) {
      Image.prefetch(a.image).catch(() => {});
    }
  });
}

async function authHeader() {
  const token = await AsyncStorage.getItem('token');
  return { headers: { Authorization: `Bearer ${token}` } };
}

const OFFER_OFF = { enabled: false, eligible: false, booking: null, offer: null };

/**
 * { enabled, eligible, booking, offer } — whether to show the offer at all,
 * whether THIS customer can take it, and their existing booking if they already did.
 */
async function fetchFreeCallOffer() {
  try {
    const res = await Instance.get('/api/free-call/offer', {
      ...(await authHeader()),
      params: { platform: PLATFORM },
    });
    if (res.data?.success) {
      lastOffer = { data: res.data, at: Date.now() };
      warmAstrologerFaces(res.data);
      return res.data;
    }
    return OFFER_OFF;
  } catch (_) {
    return OFFER_OFF;
  }
}

// The last successful answer, so the low-balance popup can decide at once whether to
// offer the free call (Home fetches the offer on every load) instead of waiting on a
// round trip while the customer stares at nothing.
let lastOffer = null; // { data, at }
const LAST_OFFER_FRESH_MS = 5 * 60 * 1000;

/**
 * Can this customer book the free call right now? Uses the recent answer when there
 * is one, else asks the server but gives up after `timeoutMs`. Resolves false on any
 * doubt — the caller then shows the ordinary recharge prompt, which is always correct.
 * Home asks the server again before opening the sheet, so a stale "true" here costs
 * nothing worse than landing on the Wallet.
 */
export async function isFreeCallAvailable({ timeoutMs = 1500 } = {}) {
  const ok = (d) => !!(d && d.enabled && d.eligible);
  if (lastOffer && Date.now() - lastOffer.at < LAST_OFFER_FRESH_MS) return ok(lastOffer.data);
  const timeout = new Promise((resolve) => setTimeout(() => resolve(OFFER_OFF), timeoutMs));
  return ok(await Promise.race([fetchFreeCallOffer(), timeout]));
}

// A request started before Home opened (from the signup welcome screen), so the
// popup can appear the moment Home is on screen instead of after another round trip.
let offerPrefetch = null; // { promise, at }
const PREFETCH_FRESH_MS = 60 * 1000;

export function prefetchFreeCallOffer() {
  offerPrefetch = { promise: fetchFreeCallOffer(), at: Date.now() };
  return offerPrefetch.promise;
}

// `usePrefetched` takes the answer already on its way (if recent) instead of asking
// again. Used once, by Home's first load; later refreshes always ask the server.
export async function getFreeCallOffer({ usePrefetched = false } = {}) {
  if (usePrefetched && offerPrefetch && Date.now() - offerPrefetch.at < PREFETCH_FRESH_MS) {
    const { promise } = offerPrefetch;
    offerPrefetch = null;
    return promise;
  }
  return fetchFreeCallOffer();
}

/**
 * The slot grid for one date. `date` omitted means the first open date.
 * Taken slots are returned WITH a `taken` flag rather than removed, so the UI can
 * grey them out — a grid where unavailable times silently vanish reads as broken.
 */
export async function getFreeCallSlots(date) {
  try {
    const res = await Instance.get('/api/free-call/slots', {
      ...(await authHeader()),
      params: date ? { date, platform: PLATFORM } : { platform: PLATFORM },
    });
    return res.data?.success ? res.data : { dates: [], slots: [] };
  } catch (_) {
    return { dates: [], slots: [] };
  }
}

/**
 * Book a slot. Unlike the reads above this THROWS, because a failed booking is
 * something the customer must be told about — most importantly SLOT_TAKEN, which
 * means someone won the race and they need to pick again.
 *
 * Error carries `code`: SLOT_TAKEN | ALREADY_BOOKED | NOT_ELIGIBLE | SLOT_PAST |
 * BAD_SLOT | OFFER_CLOSED.
 */
export async function bookFreeCall(slotStart) {
  lastOffer = null; // eligibility is about to change either way
  try {
    const res = await Instance.post('/api/free-call/book', { slotStart, platform: PLATFORM }, await authHeader());
    return res.data;
  } catch (err) {
    const data = err?.response?.data;
    const e = new Error(data?.message || 'Could not book that slot. Please try again.');
    e.code = data?.code || null;
    e.booking = data?.booking || null;
    throw e;
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
 * INSTANT MODE
 * The customer picks whoever is free right now and that astrologer's phone rings
 * immediately. Same read/write split as above: the list RESOLVES on failure (an
 * empty list is a survivable screen), the ring THROWS (a failed call is something
 * the customer has to be told about).
 * ═══════════════════════════════════════════════════════════════════════════ */

const NO_ASTROLOGERS = { astrologers: [], durationMinutes: 11, attemptsLeft: 0 };

/**
 * Who can be called right now. Busy astrologers are included WITH an `isBusy` flag
 * rather than removed — the busy pill doubles as the "notify me" button, and a list
 * that empties itself at peak time reads as a broken screen.
 */
export async function getInstantAstrologers() {
  try {
    const res = await Instance.get('/api/free-call/instant/astrologers', {
      ...(await authHeader()),
      params: { platform: PLATFORM },
    });
    if (!res.data?.success) return { ...NO_ASTROLOGERS, code: res.data?.code || null };
    (res.data.astrologers || []).forEach((a) => {
      if (typeof a?.image === 'string' && /^https?:/.test(a.image)) Image.prefetch(a.image).catch(() => {});
    });
    return res.data;
  } catch (err) {
    // A refusal (not eligible, offer off) carries a code the screen can explain.
    return { ...NO_ASTROLOGERS, code: err?.response?.data?.code || null, message: err?.response?.data?.message };
  }
}

/**
 * Ring one astrologer. THROWS on refusal; `code` is what the screen branches on:
 * ASTROLOGER_BUSY | NOT_IN_POOL | UNAVAILABLE | SELF_BUSY | TOO_MANY_ATTEMPTS |
 * ALREADY_USED | NOT_ELIGIBLE | OFFER_CLOSED | MIGRATION_REQUIRED.
 */
/**
 * A window during which this device might be carrying an unfinished free-call offer.
 *
 * FreeCallContinueHost reads it to decide whether to ask the server about a live hold on
 * app foreground. Without it, every customer on every app open would pay for a request
 * that can only ever matter to someone who rang a free call in the last few minutes —
 * the cost that CLAUDE.md's section CJ says to watch. Written here because this is the
 * only way a free instant call can begin, and it is written BEFORE the offer exists
 * precisely because the interesting case is the app dying before it can be shown.
 */
export const FREE_CALL_HOLD_WINDOW_KEY = 'freeCallHoldPossibleUntil';
const HOLD_WINDOW_MS = 45 * 60 * 1000; // an 11-minute call, a long ring, and slack

export async function ringInstantAstrologer(astrologerId) {
  lastOffer = null; // eligibility changes the moment this succeeds
  try {
    const res = await Instance.post(
      '/api/free-call/instant/ring',
      { astrologerId, platform: PLATFORM },
      await authHeader(),
    );
    AsyncStorage.setItem(FREE_CALL_HOLD_WINDOW_KEY, String(Date.now() + HOLD_WINDOW_MS))
      .catch(() => {});
    return res.data;
  } catch (err) {
    const data = err?.response?.data;
    const e = new Error(data?.message || 'Could not connect that call. Please try again.');
    e.code = data?.code || null;
    e.busySince = data?.busySince || null;
    throw e;
  }
}

/**
 * Stop ringing — nobody answered, or the customer backed out. Resolves either way:
 * this is cleanup, and failing it must never block the customer from trying somebody
 * else. The server keeps the attempt open so they can.
 */
export async function giveUpInstantRing(requestId, status = 'cancelled') {
  try {
    await Instance.post('/api/free-call/instant/give-up', { requestId, status }, await authHeader());
    return true;
  } catch (_) {
    return false;
  }
}

/**
 * The "more minutes" offer after a free call: is an astrologer still held for me, and
 * what would each option cost? PRICES COME FROM HERE — the app never multiplies a rate
 * by minutes itself.
 */
export async function getContinueOptions() {
  try {
    // 8s, not the 20s default. This one request is the ONLY thing standing between the
    // customer and the next sheet, and it is the one post-call fetch that genuinely
    // cannot be prefetched: hitting it is what CREATES the decision hold server-side
    // (see the comment on /api/free-call/continue/options), so warming it early would
    // burn the customer's 60s window before they ever saw the offer.
    //
    // The origin leg through Cloudflare is documented to spike to 15-22s (the 2026-09-25
    // slowness investigation), so the 20s default meant a customer could watch a spinner
    // for most of half a minute immediately after a call. Past 8s we give up and resolve
    // to "nothing to sell", which the caller already handles by skipping the sheet
    // entirely and carrying straight on to the rating — a dropped upsell on a bad
    // connection is a far cheaper mistake than a half-minute spinner.
    const res = await Instance.get(
      '/api/free-call/continue/options',
      { ...(await authHeader()), timeout: 8000 },
    );
    return res.data?.success ? res.data : { active: false, options: [] };
  } catch (_) {
    return { active: false, options: [] };
  }
}

/**
 * Take one of those options: extends the reservation into its payment phase and opens
 * a Razorpay order for exactly that amount. THROWS — the customer is trying to spend
 * money and a silent failure here is the worst possible outcome.
 *
 * `code` is HOLD_EXPIRED when the astrologer is no longer reserved, which the sheet
 * turns into "they're busy now, shall we tell you when they're free?".
 */
export async function startContinuePayment(minutes) {
  try {
    const res = await Instance.post('/api/free-call/continue/start', { minutes }, await authHeader());
    return res.data;
  } catch (err) {
    const data = err?.response?.data;
    const e = new Error(data?.message || 'Could not start the payment. Please try again.');
    e.code = data?.code || null;
    throw e;
  }
}

/** Let the astrologer go (the dismiss button). Resolves either way — it is a courtesy. */
export async function releaseContinueHold() {
  try {
    await Instance.post('/api/free-call/continue/release', {}, await authHeader());
    return true;
  } catch (_) {
    return false;
  }
}

/**
 * The customer opened the gateway and backed out. Hands the astrologer back to other
 * customers (the hold drops from the payment phase to the decision phase) instead of
 * leaving them blocked to everyone for three minutes over a purchase that never
 * happened. Resolves either way — this runs on an error path and must not add a
 * second failure to the first.
 */
export async function abandonContinuePayment() {
  try {
    await Instance.post('/api/free-call/continue/abandon-payment', {}, await authHeader());
    return true;
  } catch (_) {
    return false;
  }
}

/**
 * How the customer rated ASTROWANI (not the astrologer, and not a store review).
 * Resolves on failure: they did us a favour by answering, and showing them an error
 * for it would be absurd.
 */
export async function submitAppRating({ rating, context, sessionId, comment } = {}) {
  try {
    await Instance.post('/api/app-rating', { rating, context, sessionId, comment }, await authHeader());
    return true;
  } catch (_) {
    return false;
  }
}
