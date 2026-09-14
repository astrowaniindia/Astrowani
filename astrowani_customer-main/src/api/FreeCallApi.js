// Free 12-minute introductory call — every network call for the offer.
//
// The server is the only authority on which slots exist and which are free (see
// astrowani-backend/src/freeCallRoutes.js). Nothing here computes a slot, checks
// eligibility, or decides whether a time is available — it renders what it is told.
//
// Every read RESOLVES rather than rejects, with the offer switched off. A failed
// fetch must not break Home; the worst outcome of a failure is that a customer
// isn't shown the offer this launch, which is recoverable on the next one.

import AsyncStorage from '@react-native-async-storage/async-storage';
import Instance from './ApiCall';

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
    const res = await Instance.get('/api/free-call/offer', await authHeader());
    return res.data?.success ? res.data : OFFER_OFF;
  } catch (_) {
    return OFFER_OFF;
  }
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
      params: date ? { date } : {},
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
  try {
    const res = await Instance.post('/api/free-call/book', { slotStart }, await authHeader());
    return res.data;
  } catch (err) {
    const data = err?.response?.data;
    const e = new Error(data?.message || 'Could not book that slot. Please try again.');
    e.code = data?.code || null;
    e.booking = data?.booking || null;
    throw e;
  }
}
