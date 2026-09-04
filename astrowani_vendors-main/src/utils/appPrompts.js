// astrowani_vendors-main/src/utils/appPrompts.js
//
// Vendor-side twin of the customer app's src/utils/appPrompts.js — same helpers,
// same AsyncStorage keys (they are per-install and the two apps never share
// storage), differing only in APP_KIND, which is what makes the backend answer with
// the astrologer app's version numbers and Play Store listing.
//
// Kept as a copy rather than a shared module because these two apps have no shared
// package: every other cross-app utility here (useElapsedSeconds, Analytics,
// callForegroundService) is duplicated the same way. If one side is changed, change
// the other.
//
// EVERYTHING HERE FAILS SILENTLY TO "DO NOT SHOW" — an astrologer must never be
// blocked from answering a call by a prompt that failed to load properly.
import { Linking, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import DeviceInfo from 'react-native-device-info';
import Instance from '../api/ApiCall';

export const APP_KIND = 'vendor';

const K_UPDATE_SNOOZE = 'appUpdatePromptSnoozedUntil';
const K_REVIEW_SNOOZE = 'appReviewPromptSnoozedUntil';
const K_REVIEW_DONE = 'appReviewPromptCompleted';
const K_FIRST_LAUNCH = 'appFirstLaunchAt';
const K_OPEN_COUNT = 'appOpenCount';

const HOUR_MS = 3600 * 1000;
const DAY_MS = 24 * HOUR_MS;

function buildParams() {
  return {
    app: APP_KIND,
    platform: Platform.OS,
    version: DeviceInfo.getVersion(),
    build: DeviceInfo.getBuildNumber(),
  };
}

/** Resolves to null on ANY failure or when there is nothing to show. */
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
  } catch (_) {}
}

export const isUpdateSnoozed = () => isSnoozed(K_UPDATE_SNOOZE);
export const snoozeUpdate = (hours) => snooze(K_UPDATE_SNOOZE, Math.max(1, hours || 24) * HOUR_MS);

export const isReviewSnoozed = () => isSnoozed(K_REVIEW_SNOOZE);
export const snoozeReview = (days) => snooze(K_REVIEW_SNOOZE, Math.max(1, days || 30) * DAY_MS);

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

export async function openStore(url) {
  if (!url) return false;
  try {
    await Linking.openURL(url);
    return true;
  } catch (_) {
    return false;
  }
}

// The update prompt takes precedence over the review prompt when both are due at
// launch — see the customer app's copy of this file for the reasoning.
let updatePromptActive = false;
export const setUpdatePromptActive = (active) => { updatePromptActive = !!active; };
export const isUpdatePromptActive = () => updatePromptActive;

export function localizedCopy(cfg, language, fallbackTitle, fallbackMessage) {
  const hindi = language === 'Hindi';
  return {
    title: (hindi && cfg?.titleHi) || cfg?.title || fallbackTitle,
    message: (hindi && cfg?.messageHi) || cfg?.message || fallbackMessage,
  };
}
