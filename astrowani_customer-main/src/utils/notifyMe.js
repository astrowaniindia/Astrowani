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
import { requestUserPermission } from './PushNotification';
import { showStatusPopup } from '../components/StatusPopup';

// Once per app run. Somebody tapping "notify me" on four busy astrologers in a row
// should not be walked through the explanation four times.
let explainedThisSession = false;

/**
 * Show the "why we need this" popup and then the OS prompt.
 * Resolves when the customer has answered ours — we never block on the OS one.
 */
function explainThenAsk(t) {
  if (explainedThisSession) {
    requestUserPermission().catch(() => {});
    return Promise.resolve();
  }
  explainedThisSession = true;
  return new Promise((resolve) => {
    showStatusPopup({
      variant: 'info',
      title: t ? t('notifyMe.permTitle') : 'Shall we ping you?',
      message: t ? t('notifyMe.permBody') : "They're usually free again within a few minutes. Allow notifications and we'll tell you the moment they are.",
      confirmText: t ? t('notifyMe.permAllow') : 'Yes, notify me',
      cancelText: t ? t('notifyMe.permSkip') : 'Not now',
      onConfirm: () => {
        // Fire the OS prompt, but do not wait on it — requestUserPermission
        // deliberately never throws and can defer itself until the app is active
        // (see PushNotification.js). Blocking the waitlist join on it would strand
        // the customer behind a prompt that may not appear until later.
        requestUserPermission().catch(() => {});
        resolve();
      },
      onCancel: () => resolve(),
      onClose: () => resolve(),
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
