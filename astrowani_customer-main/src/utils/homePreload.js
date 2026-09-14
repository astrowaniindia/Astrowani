// Home, prepared before the customer reaches it.
//
// WHY. On a cold start Home used to fetch every section itself, so cards, banners
// and report tiles appeared one by one (and images faded in) while the customer was
// already looking at it. Everything Home shows is public data, so it can be
// fetched and its images downloaded while the customer is still on the splash,
// login or signup screen.
//
// HOW.
//  1. hydrateHomeCache() reads last time's saved data from AsyncStorage into an
//     in-memory store at app start. Home reads that store SYNCHRONOUSLY in its
//     useState initialisers, so its first frame already has data — no spinner,
//     no sections popping in.
//  2. prefetchHomeData() fetches every section fresh, saves it (memory + storage)
//     and pre-downloads all the images into FastImage's disk cache.
//  Both survive the app being killed or removed from recents; only clearing the
//  app's data or uninstalling empties them. Home still refreshes in the
//  background on open and updates in place, so nothing shown stays stale long.
//
// The storage keys are the ones Home and PlacementBanner already used (via
// utils/cacheFetch), so existing saved data is picked up with no migration.
import AsyncStorage from '@react-native-async-storage/async-storage';
import FastImage from 'react-native-fast-image';
import Instance from '../api/ApiCall';
import { getAstroServices } from '../api/astroApi';

const CACHE_PREFIX = 'cache_v1_'; // must match utils/cacheFetch.js

export const HOME_KEYS = {
  astrologers: 'home_astrologers',
  categories: 'home_categories',
  blogs: 'home_blogs',
  reviews: 'home_top_reviews',
  live: 'home_live',
  astroServices: 'home_astro_services',
  thoughts: 'home_thoughts',
};

// Home's two banner slots, in both languages (the customer can switch).
const BANNER_PLACEMENTS = ['home_primary', 'home_secondary'];
const BANNER_LANGUAGES = ['english', 'hindi'];
export const bannerCacheKey = (app, placement, apiLanguage) =>
  `banners_${app}_${placement}_${apiLanguage}`;

const memory = {};

export const getHomeMemory = (key) => memory[key];

// Memory now (so an open Home re-render sees it), storage in the background.
export const saveHomeData = (key, value) => {
  memory[key] = value;
  AsyncStorage.setItem(CACHE_PREFIX + key, JSON.stringify(value)).catch(() => {});
};

// The Home greeting shown last time, so the next Home shows the NEXT line.
const GREETING_LAST_ID_KEY = 'homeGreetingLastId';
let lastGreetingId = null;

// Picks the greeting line after the one shown last time and remembers it.
// Synchronous on purpose: Home calls it in a useState initialiser so the greeting
// is on its first frame. Returns the { thoughtText, hindi } shape Home renders.
export function pickNextGreeting(lines) {
  if (!Array.isArray(lines) || !lines.length) return undefined;
  const lastIndex = lines.findIndex((l) => String(l.id) === lastGreetingId);
  const next = lines[(lastIndex + 1) % lines.length];
  lastGreetingId = String(next.id);
  AsyncStorage.setItem(GREETING_LAST_ID_KEY, lastGreetingId).catch(() => {});
  return { thoughtText: next.text, hindi: { thoughtText: next.textHi || next.text } };
}

let hydratePromise = null;
export function hydrateHomeCache() {
  if (hydratePromise) return hydratePromise;
  const keys = [
    ...Object.values(HOME_KEYS),
    ...BANNER_PLACEMENTS.flatMap((p) => BANNER_LANGUAGES.map((l) => bannerCacheKey('customer', p, l))),
  ];
  hydratePromise = AsyncStorage.multiGet([...keys.map((k) => CACHE_PREFIX + k), GREETING_LAST_ID_KEY])
    .then((pairs) => {
      for (const [storageKey, raw] of pairs) {
        if (!raw) continue;
        if (storageKey === GREETING_LAST_ID_KEY) {
          if (lastGreetingId === null) lastGreetingId = raw;
          continue;
        }
        const key = storageKey.slice(CACHE_PREFIX.length);
        // Never overwrite something fresher that already landed in memory.
        if (memory[key] !== undefined) continue;
        try { memory[key] = JSON.parse(raw); } catch (_) {}
      }
    })
    .catch(() => {});
  return hydratePromise;
}

// Downloads images into FastImage's disk cache so they appear instantly later.
const preloadImages = (uris) => {
  const sources = [...new Set(uris)]
    .filter((u) => typeof u === 'string' && /^https?:\/\//.test(u))
    .map((uri) => ({ uri, priority: FastImage.priority.low }));
  if (sources.length) {
    try { FastImage.preload(sources); } catch (_) {}
  }
};

const topReviewsFrom = (list) => {
  const sorted = [...(Array.isArray(list) ? list : [])].sort((a, b) => b.rating - a.rating);
  return sorted.slice(0, 5);
};

let lastPrefetchAt = 0;
let prefetchInFlight = null;
const PREFETCH_MIN_GAP_MS = 60 * 1000;

// Fetches everything Home shows. Every request is independent and failure-safe:
// a failed one just keeps whatever was saved before.
export function prefetchHomeData({ force = false } = {}) {
  if (prefetchInFlight) return prefetchInFlight;
  if (!force && Date.now() - lastPrefetchAt < PREFETCH_MIN_GAP_MS) return Promise.resolve();
  lastPrefetchAt = Date.now();

  const safe = (p) => p.catch(() => null);
  prefetchInFlight = Promise.all([
    safe(Instance.get('/api/astrologers').then((res) => {
      const list = res?.data?.data || [];
      saveHomeData(HOME_KEYS.astrologers, list);
      preloadImages(list.map((a) => a.profileImage));
    })),
    safe(Instance.get('/api/categories').then((res) => {
      const list = res?.data?.categories || [];
      saveHomeData(HOME_KEYS.categories, list);
      preloadImages(list.map((c) => c.image));
    })),
    safe(Instance.get('/api/blogs').then((res) => {
      const all = Array.isArray(res?.data) ? res.data : [];
      saveHomeData(HOME_KEYS.blogs, { blogsToShow: all.slice(0, 6), blogs: all });
      preloadImages(all.slice(0, 6).map((b) => b.thumbnail));
    })),
    safe(Instance.get('/api/reviews/astrologers/reviews').then((res) => {
      const top = topReviewsFrom(res?.data);
      saveHomeData(HOME_KEYS.reviews, top);
      preloadImages(top.map((r) => r.user?.profilePic));
    })),
    safe(Instance.get('/api/live/active').then((res) => {
      const list = res?.data?.data || [];
      saveHomeData(HOME_KEYS.live, list);
      preloadImages(list.map((a) => a.profileImage || a.image));
    })),
    safe(getAstroServices().then((list) => {
      saveHomeData(HOME_KEYS.astroServices, list);
      preloadImages(list.map((s) => s.image));
    })),
    safe(Instance.get('/api/thoughts/active').then((res) => {
      const lines = Array.isArray(res?.data?.thoughts) ? res.data.thoughts : [];
      if (lines.length) saveHomeData(HOME_KEYS.thoughts, lines);
    })),
    ...BANNER_PLACEMENTS.flatMap((placement) => BANNER_LANGUAGES.map((language) =>
      safe(Instance.get(`/api/banners/all?app=customer&placement=${placement}&language=${language}`).then((res) => {
        const banners = res?.data?.data || [];
        const secs = Number(res?.data?.intervalSeconds);
        saveHomeData(bannerCacheKey('customer', placement, language), {
          banners,
          intervalMs: secs > 0 ? secs * 1000 : 4000,
        });
        preloadImages(banners.map((b) => b.imageUrl));
      })),
    )),
  ]).finally(() => { prefetchInFlight = null; });
  return prefetchInFlight;
}

// App start: saved data into memory first, then refresh everything in the background.
export function warmUpHome() {
  hydrateHomeCache().finally(() => { prefetchHomeData(); });
}
