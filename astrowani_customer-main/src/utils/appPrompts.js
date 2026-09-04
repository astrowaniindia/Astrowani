// Shared plumbing for the two store-facing prompts: "a new version is available"
// and "please rate us on the Play Store".
//
// Both ask the backend rather than reading app_settings directly (the usual pattern
// for config in this app) — see the header of astrowani-backend/src/appPromptRoutes.js
// for why the update comparison has to live server-side.
//
// EVERYTHING HERE FAILS SILENTLY TO "DO NOT SHOW". These prompts sit on top of the
// whole app at launch; a network blip must never leave a customer staring at a modal
// they cannot dismiss, and it must never block Home from rendering.
import { Linking, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import DeviceInfo from 'react-native-device-info';
import Instance from '../api/ApiCall';

export const APP_KIND = 'customer';

// AsyncStorage keys. All prompt state is per-device, not per-account: "I already
// rated this app" and "remind me tomorrow" are properties of the install, and
// re-asking someone who switched accounts on the same phone would be the annoying
// outcome the snooze exists to prevent.
const K_UPDATE_SNOOZE = 'appUpdatePromptSnoozedUntil';
const K_REVIEW_SNOOZE = 'appReviewPromptSnoozedUntil';
const K_REVIEW_DONE = 'appReviewPromptCompleted';
const K_FIRST_LAUNCH = 'appFirstLaunchAt';
const K_OPEN_COUNT = 'appOpenCount';

const HOUR_MS = 3600 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** Version/platform of the running build, as the backend's query params. */
function buildParams() {
  return {
    app: APP_KIND,
    platform: Platform.OS,
    version: DeviceInfo.getVersion(), // versionName, e.g. "24.1"
    build: DeviceInfo.getBuildNumber(), // versionCode, e.g. "33"
  };
}

/**
 * Ask the backend whether this installed build is behind.
 * Resolves to null on ANY failure or when there is nothing to show.
 */
export async function fetchUpdateStatus() {
  try {
    const res = await Instance.get('/api/app/update-check', { params: buildParams() });
    const d = res?.data;
    if (!d?.success || !d.updateAvailable || !d.storeUrl) return null;
    return d;
  } catch (_) {
    return null;
  }
}

/** Admin-configured review-prompt copy + thresholds, or null when off/unreachable. */
export async function fetchReviewConfig() {
  try {
    const res = await Instance.get('/api/app/review-prompt', {
      params: { app: APP_KIND, platform: Platform.OS },
    });
    const d = res?.data;
    if (!d?.success || !d.enabled || !d.storeUrl) return null;
    return d;
  } catch (_) {
    return null;
  }
}

/**
 * Count this launch and remember when the app was first opened.
 * Call once per cold start. Returns { openCount, daysSinceInstall }.
 */
export async function recordAppOpen() {
  try {
    const [firstRaw, countRaw] = await Promise.all([
      AsyncStorage.getItem(K_FIRST_LAUNCH),
      AsyncStorage.getItem(K_OPEN_COUNT),
    ]);
    const now = Date.now();
    const firstAt = parseInt(firstRaw, 10) || now;
    const openCount = (parseInt(countRaw, 10) || 0) + 1;
    await AsyncStorage.multiSet([
      [K_FIRST_LAUNCH, String(firstAt)],
      [K_OPEN_COUNT, String(openCount)],
    ]);
    return { openCount, daysSinceInstall: (now - firstAt) / DAY_MS };
  } catch (_) {
    // Storage unavailable: report the most conservative reading, so an unreadable
    // device can never satisfy the "used the app enough" gate.
    return { openCount: 0, daysSinceInstall: 0 };
  }
}

async function isSnoozed(key) {
  try {
    const until = parseInt(await AsyncStorage.getItem(key), 10);
    return Number.isFinite(until) && until > Date.now();
  } catch (_) {
    return false;
  }
}

async function snooze(key, ms) {
  try {
    await AsyncStorage.setItem(key, String(Date.now() + ms));
  } catch (_) {
    // A failed snooze only means they may be asked again next launch.
  }
}

export const isUpdateSnoozed = () => isSnoozed(K_UPDATE_SNOOZE);
export const snoozeUpdate = (hours) => snooze(K_UPDATE_SNOOZE, Math.max(1, hours || 24) * HOUR_MS);

export const isReviewSnoozed = () => isSnoozed(K_REVIEW_SNOOZE);
export const snoozeReview = (days) => snooze(K_REVIEW_SNOOZE, Math.max(1, days || 30) * DAY_MS);

/** True once they have tapped through to the store — we never ask that person again. */
export async function hasReviewed() {
  try {
    return (await AsyncStorage.getItem(K_REVIEW_DONE)) === 'true';
  } catch (_) {
    return false;
  }
}

export async function markReviewed() {
  try {
    await AsyncStorage.setItem(K_REVIEW_DONE, 'true');
  } catch (_) {}
}

/**
 * Open a store listing. Returns false if the URL could not be opened, so the caller
 * can leave the prompt up instead of closing it over a dead link.
 */
export async function openStore(url) {
  if (!url) return false;
  try {
    await Linking.openURL(url);
    return true;
  } catch (_) {
    return false;
  }
}

// ── "Good moment" signal ─────────────────────────────────────────────────────
// Set when someone gives a session 4 or 5 stars in ReviewPrompt.js. The next time
// the review host runs its check, that person skips the "have they used it enough"
// gates — they have just told us they are happy, which is a far better signal than
// an open count.
//
// A FLAG, NOT A DIRECT CALL, on purpose: the star prompt finishes by showing a
// success popup, and raising a second root modal on top of it is the stacked-modal
// shape that freezes the app on iOS (see utils/modalPresentation). Deferring to the
// next launch costs nothing and cannot stack.
const K_GOOD_MOMENT = 'appReviewGoodMoment';

export async function markReviewGoodMoment() {
  try {
    await AsyncStorage.setItem(K_GOOD_MOMENT, String(Date.now()));
  } catch (_) {}
}

/** Reads and clears the flag — a good moment is spent the first time it is used. */
export async function consumeReviewGoodMoment() {
  try {
    const raw = await AsyncStorage.getItem(K_GOOD_MOMENT);
    if (!raw) return false;
    await AsyncStorage.removeItem(K_GOOD_MOMENT);
    // Stale beyond a week: whatever they were happy about is no longer "just now",
    // so fall back to the normal usage gates rather than trading on old goodwill.
    const at = parseInt(raw, 10);
    return Number.isFinite(at) && Date.now() - at < 7 * DAY_MS;
  } catch (_) {
    return false;
  }
}

// ── Mutual exclusion between the two prompts ─────────────────────────────────
// Both hosts run their check at launch, so without this a user who is BOTH behind
// on versions and due a review gets two stacked modals. The update prompt wins:
// it is the one that can be forced, and asking someone to rate an app we have just
// told them is out of date is the wrong order. iOS's modal registry serialises
// presentation but does not decide precedence — that is this flag's job.
let updatePromptActive = false;
export const setUpdatePromptActive = (active) => { updatePromptActive = !!active; };
export const isUpdatePromptActive = () => updatePromptActive;

/** Pick the Hindi copy when the app is in Hindi and it has actually been filled in. */
export function localizedCopy(cfg, language, fallbackTitle, fallbackMessage) {
  const hindi = language === 'Hindi';
  return {
    title: (hindi && cfg?.titleHi) || cfg?.title || fallbackTitle,
    message: (hindi && cfg?.messageHi) || cfg?.message || fallbackMessage,
  };
}
