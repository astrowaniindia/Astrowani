// "Turn on notifications so you see our reply" — asked right after someone writes
// to support.
//
// WHY HERE. Measured 2026-11-07: of ~4,900 customers only 289 can receive a push
// at all. So a support reply mostly lived in a screen nobody was looking at — the
// person asked, closed the app, and never learned we had answered. The moment they
// have just asked us something is the one moment they have an obvious reason to
// say yes (the same reasoning as notifyMe.js).
//
// THE TWO CASES THAT LOOK THE SAME AND ARE NOT:
//   - the OS can still show its prompt  -> ask it.
//   - the OS has already said no for good (Android "don't ask again", iOS denied,
//     or switched off in Settings) -> the system prompt will never appear again,
//     so "Turn on" opens the app's Settings page instead. Calling request() there
//     resolves instantly with no dialog, which reads as a dead button.
//
// Shown at most once per conversation, and never when notifications already work.
// The copy lives here rather than in LanguageContext so this file stands alone.

import { Linking, PermissionsAndroid, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import messaging from '@react-native-firebase/messaging';
import { showStatusPopup } from '../components/StatusPopup';
import { requestUserPermission } from './PushNotification';
import { syncNotificationDevice } from './notificationDevice';
import { getCurrentLanguage } from '../context/LanguageContext';
import { captureEvent } from './Analytics';

const COPY = {
  en: {
    title: 'Get our reply on your phone',
    body: "We'll answer you here. Turn on notifications so you know the moment we reply — even if the app is closed.",
    allow: 'Turn on notifications',
    later: 'Not now',
    settingsBody: "Notifications are switched off for Astrowani, so you won't see when we reply. Open Settings and turn them on.",
    openSettings: 'Open Settings',
  },
  hi: {
    title: 'हमारा जवाब फ़ोन पर पाएँ',
    body: 'हम आपको यहीं जवाब देंगे। नोटिफ़िकेशन चालू करें ताकि जवाब आते ही आपको पता चले — ऐप बंद होने पर भी।',
    allow: 'नोटिफ़िकेशन चालू करें',
    later: 'अभी नहीं',
    settingsBody: 'Astrowani के नोटिफ़िकेशन बंद हैं, इसलिए जवाब आने पर आपको पता नहीं चलेगा। सेटिंग्स खोलकर इन्हें चालू करें।',
    openSettings: 'सेटिंग्स खोलें',
  },
};

const copy = () => (String(getCurrentLanguage() || '').toLowerCase().startsWith('hi') ? COPY.hi : COPY.en);
const promptedKey = (id) => `support_notif_prompted_${id}`;
const shownThisRun = new Set();

/** 'granted' | 'can_ask' | 'blocked'. Never prompts, never throws. */
async function permissionState() {
  try {
    const auth = await messaging().hasPermission();
    if (auth === messaging.AuthorizationStatus.AUTHORIZED || auth === messaging.AuthorizationStatus.PROVISIONAL) {
      return 'granted';
    }
    if (Platform.OS === 'ios') {
      return auth === messaging.AuthorizationStatus.NOT_DETERMINED ? 'can_ask' : 'blocked';
    }
    // Android 13+ has a runtime prompt we may still be allowed to show; whether
    // Android will actually show it is only known by trying (see onAllow).
    if (Platform.Version >= 33) return 'can_ask';
    // Android 12 and below: no runtime prompt exists. Off means off in Settings.
    return 'blocked';
  } catch (_) {
    return 'can_ask';
  }
}

async function openSettings() {
  try { await Linking.openSettings(); } catch (_) { /* nothing more to do */ }
}

async function onAllow(state) {
  captureEvent('support_notif_prompt_allow', { state });
  if (state === 'blocked') {
    await openSettings();
    return;
  }
  if (Platform.OS === 'android' && Platform.Version >= 33) {
    let result = null;
    try {
      result = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
    } catch (_) { /* fall through */ }
    if (result === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN) {
      // No dialog was shown — Android has stopped asking. Settings is the only way.
      syncNotificationDevice({ force: true, asked: true }).catch(() => {});
      await openSettings();
      return;
    }
    // Granted (or a fresh "deny"): requestUserPermission records the answer and,
    // when granted, fetches the token so the reply can actually be delivered.
    requestUserPermission().catch(() => {});
    return;
  }
  requestUserPermission().catch(() => {});
}

/**
 * Call after a support message is sent or a person is requested. Fire and forget.
 * @param {string} conversationId
 */
export async function maybeAskForSupportNotifications(conversationId) {
  try {
    if (!conversationId || shownThisRun.has(conversationId)) return;
    if (await AsyncStorage.getItem(promptedKey(conversationId))) return;

    const state = await permissionState();
    if (state === 'granted') return;

    shownThisRun.add(conversationId);
    await AsyncStorage.setItem(promptedKey(conversationId), String(Date.now())).catch(() => {});
    captureEvent('support_notif_prompt_shown', { state });

    const c = copy();
    showStatusPopup({
      variant: 'info',
      title: c.title,
      message: state === 'blocked' ? c.settingsBody : c.body,
      confirmText: state === 'blocked' ? c.openSettings : c.allow,
      cancelText: c.later,
      onConfirm: () => { onAllow(state).catch(() => {}); },
      onCancel: () => { captureEvent('support_notif_prompt_later', { state }); },
    });
  } catch (_) {
    // Never let a prompt break the support screen.
  }
}
