import {Image} from 'react-native';
import Instance from '../api/ApiCall';
import {PINNED_CENTRE_ID} from '../constants/featuredAstrologers';

/**
 * The live half of the astrologer row on the FREE-CALL LOGIN screen.
 *
 * The gift screen deliberately does not use this -- it shows the bundled five and
 * nothing else (owner, 2026-10-26). Only the login screen swaps in whoever is actually
 * reachable right now, so the faces someone sees just before handing over their number
 * are faces they could really be connected to.
 *
 * WHY THIS IS A MODULE AND NOT A HOOK ON THE SCREEN. The work has to start on the
 * screen BEFORE the login one, while the gift reveal is still being read, so that by
 * the time "Haan! Mujhe free call chahiye" is tapped the names AND the actual image
 * bytes are already in memory. A fetch started when the login screen mounts would show
 * the bundled five and then visibly shuffle them a moment later, which is exactly the
 * pop-in this exists to avoid. So the result is cached at module scope and the row
 * reads it synchronously on its very first render.
 *
 * EVERYTHING HERE FAILS SOFT. There is no loading state and no error state anywhere in
 * this file: every failure path -- offline, timeout, a 500, a malformed body -- simply
 * leaves the cache empty, and an empty cache means the row draws the bundled five. A
 * login screen is the worst possible place to surface a network problem, and the
 * bundled faces are always a correct thing to show.
 */

// How many of the five slots may be replaced. The centre is pinned, so it is the rest.
const SWAPPABLE = 4;
// Long enough that walking back and forth between the two screens does not refetch,
// short enough that "available right now" stays honest.
const FRESH_MS = 60 * 1000;

let cache = [];
let fetchedAt = 0;
let inFlight = null;
const listeners = new Set();

const notify = () => {
  listeners.forEach((fn) => {
    try {
      fn(cache);
    } catch (_) {
      // A broken subscriber must not take down the others, nor the prefetch.
    }
  });
};

/**
 * Reachable RIGHT NOW, which is a stricter test than "approved".
 *
 * `isOffline` is the backend's own single answer to "can this person be reached at
 * all" -- it already folds in the master online switch AND having every service
 * toggled off, so it must not be re-derived here or the two definitions drift
 * (see the formatter in astrowani-backend/index.js).
 *
 * `isBusy` is excluded too: someone mid-consultation cannot take this call, and
 * showing them is the same lie as showing someone offline, just a shorter one.
 */
const isReachable = (a) =>
  !!a && !!a.userId && a.isOffline !== true && a.isBusy !== true && a.isLoggedOut !== true;

/**
 * Fetch, pick, and warm the image cache. Safe to call repeatedly and from several
 * screens: a call while one is already running joins it rather than starting a second.
 */
export const prefetchLiveAstrologers = () => {
  if (inFlight) {
    return inFlight;
  }
  if (cache.length && Date.now() - fetchedAt < FRESH_MS) {
    return Promise.resolve(cache);
  }

  inFlight = Instance.get('/api/astrologers')
    .then(async (res) => {
      const rows = Array.isArray(res?.data) ? res.data : res?.data?.data || [];
      const picked = rows
        .filter(isReachable)
        // The pinned centre is dropped here rather than at render time. He is always
        // drawn from the bundled list, so leaving him in would spend one of the four
        // swappable slots on a face already on screen.
        .filter((a) => a.userId !== PINNED_CENTRE_ID)
        .slice(0, SWAPPABLE)
        .map((a) => ({
          key: `live-${a.userId}`,
          id: a.userId,
          name: a.name || 'Astrologer',
          // Already resized by the backend's thumbnailUrl, so this is ~10KB, not the
          // full-size upload (see CLAUDE.md subsystem EE).
          uri: a.profileImage || '',
        }))
        .filter((a) => !!a.uri);

      // THE PREFETCH IS THE WHOLE POINT, so it is awaited before the cache is published.
      // Publishing first would hand the row a set of URLs whose bytes have not arrived,
      // and it would draw five empty rings and fill them in one by one -- worse than the
      // bundled faces it replaced. A failure to warm one image is not fatal: it still
      // renders, just a beat later, and a broken URL falls back to its bundled face.
      await Promise.all(
        picked.map((a) =>
          Image.prefetch(a.uri).catch(() => {}),
        ),
      );

      cache = picked;
      fetchedAt = Date.now();
      notify();
      return cache;
    })
    .catch(() => {
      // Deliberately leaves whatever was cached before alone. A failed refresh should
      // not throw away a good list and fall back to the bundled five.
      return cache;
    })
    .finally(() => {
      inFlight = null;
    });

  return inFlight;
};

/** What the row should draw right now. Synchronous, so the first render is correct. */
export const getLiveAstrologers = () => cache;

/** Called when a prefetch lands, for a row that mounted before it finished. */
export const subscribeLiveAstrologers = (fn) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

export default prefetchLiveAstrologers;
