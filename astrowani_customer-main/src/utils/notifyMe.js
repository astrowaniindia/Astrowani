// src/utils/notifyMe.js
// "Notify me" waitlist join — shared by every busy-state UI (list cards + profile dock).
//
// PERMISSION IS ASKED HERE, and this is the one moment in the app where a customer has
// an obvious reason to say yes: they have just asked to be told something. Asking at
// launch, before they want anything, is how an app gets a permanent "no".
//
// The order matters and is deliberate:
//   1. a themed popup explaining what the notification is for — ours, not the OS one,
//      so it can be worded and can be declined without burning the real prompt;
//   2. the OS permission prompt;
//   3. the waitlist registration.
//
// Registering ANYWAY when permission is refused is intentional. The customer still
// asked to be told; a denied OS permission is not a "no" to the waitlist, and they may
// turn notifications on later. The alternative — silently not registering — means a
// customer who grants permission next week never hears from us about this astrologer.

import AsyncStorage from '@react-native-async-storage/async-storage';
import Instance from '../api/ApiCall';
import { requestUserPermission, hasNotificationPermission } from './PushNotification';
import { showStatusPopup } from '../components/StatusPopup';

// Once per app run. Somebody tapping "notify me" on four busy astrologers in a row
// should not be walked through the explanation four times.
let explainedThisSession = false;

/**
 * Show the "why we need this" popup and then the OS prompt — but ONLY when there is
 * an actual OS prompt for it to lead into (owner, 2026-10-04).
 *
 * Android's `PermissionsAndroid.request()` resolves INSTANTLY, with no dialog, the
 * moment a decision already exists — granted or denied. So a customer who had already
 * answered Android's own prompt (at any earlier point in the app) would tap our
 * "Yes, notify me" and watch nothing happen: that looked like a dead button, not like
 * "you already said yes". `hasNotificationPermission()` is checked FIRST and never
 * prompts, so this explainer is skipped entirely once permission is already granted —
 * the waitlist join below still runs regardless.
 *
 * Single button, no decline (owner, 2026-10-04): the customer already asked to be put
 * on the waitlist by tapping "Notify me" one screen up, so this is confirming how,
 * not asking again whether. Declining the explainer never skipped the waitlist join
 * anyway — the join always ran — so a second way to say no was two buttons for one
 * decision already made.
 */
async function explainThenAsk(t) {
  if (await hasNotificationPermission()) return;

  if (explainedThisSession) {
    requestUserPermission().catch(() => {});
    return;
  }
  explainedThisSession = true;
  return new Promise((resolve) => {
    showStatusPopup({
      variant: 'info',
      title: t ? t('notifyMe.permTitle') : 'Shall we ping you?',
      message: t ? t('notifyMe.permBody') : "They're usually free again within a few minutes. Allow notifications and we'll tell you the moment they are.",
      buttonText: t ? t('notifyMe.permAllow') : 'Yes, notify me',
      onClose: () => {
        // Fire the OS prompt, but do not wait on it — requestUserPermission
        // deliberately never throws and can defer itself until the app is active
        // (see PushNotification.js). Blocking the waitlist join on it would strand
        // the customer behind a prompt that may not appear until later.
        requestUserPermission().catch(() => {});
        resolve();
      },
    });
  });
}

/**
 * Join the waitlist for one astrologer.
 *
 * @param {string} astrologerId
 * @param {'chat'|'audio'|'video'} requestType
 * @param {{ t?: Function, skipPermission?: boolean }} [opts]
 *        `skipPermission` is for callers that have already asked.
 * @returns {Promise<{ok: boolean}>}
 */
export async function requestNotifyMe(astrologerId, requestType = 'chat', opts = {}) {
  try {
    const token = await AsyncStorage.getItem('token');
    if (!token || !astrologerId) return { ok: false };

    if (!opts.skipPermission) {
      await explainThenAsk(opts.t);
    }

    const resp = await fetch(`${Instance.defaults.baseURL}/api/astrologer/${astrologerId}/notify-me`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ requestType }),
    });
    return { ok: resp.ok };
  } catch (e) {
    return { ok: false };
  }
}
