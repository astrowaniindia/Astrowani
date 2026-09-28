// Heads-up, actionable notification for incoming calls/video calls/chat requests — shows
// even when the app is backgrounded or fully killed (unlike the in-app-only popup in
// HomeScreen.js, which only works while that screen is mounted). Data-only FCM payloads
// from the backend land here via Firebase.js's onMessage/setBackgroundMessageHandler.
import notifee, { AndroidImportance, AndroidVisibility, AndroidCategory } from '@notifee/react-native';
import { startRinging, stopRinging } from './incomingRingtone';

// TWO channels, and the difference is the whole point (fixed 2026-09-28).
//
// THE BUG: there was one channel, deliberately SILENT (sound: undefined, vibration: false),
// because incomingRingtone.js plays the ringtone itself. That works while the app is alive —
// and is exactly why astrologers were missing requests when it was not. With the app killed,
// an incoming request runs through Firebase's headless background handler, which rings for a
// second or two and is then killed by Android along with the whole process. The ringtone is a
// JS setInterval, so it dies with it. The notification itself survives (verified: process
// dead, notification still posted) but is silent, and its heads-up banner collapses into the
// shade after a few seconds. To the astrologer that is "it came for one second and vanished",
// and the customer sat there ringing out. Measured on an Android 14 emulator.
//
// THE FIX: when the app is NOT in the foreground, post on a channel that carries the sound and
// vibration itself, so ANDROID rings it — that keeps ringing whether or not our process is
// alive. When the app IS in the foreground we keep the silent channel and let
// incomingRingtone.js ring, because the app is alive by definition and this avoids the
// "ping then ring" double-sound that the old v1 channel caused.
//
// ⚠ Channel sound/vibration are IMMUTABLE once created on a device (Android platform
// restriction — Notifee cannot override them afterwards), so these ids must be bumped rather
// than edited to change sound behaviour on already-installed apps. That is why they are v3.
const CHANNEL_ID_SILENT = 'astrowani-incoming-requests-v3-silent';
const CHANNEL_ID_RINGING = 'astrowani-incoming-requests-v3-ringing';
// Kept so an upgrading device stops showing the old, permanently-silent channel in settings.
const LEGACY_CHANNEL_IDS = ['astrowani-incoming-requests-v2'];
const channelsReady = {};

// The ringtone used to be started only from HomeScreen.js's popupQueue effect — which
// requires the React app to actually be mounted. That's fine while the app is open, but a
// killed-app push runs through Firebase's headless background handler (setBackgroundMessageHandler
// in Firebase.js), which calls displayIncomingRequestNotification() directly and never mounts
// HomeScreen — so the OS notification appeared but nothing ever rang (confirmed on a real
// device: notification shown, zero ringing). Starting/stopping the ringtone here instead, keyed
// to notification display/cancel, covers every app state uniformly. Tracked as a Set (not a
// single boolean) because more than one request can be queued — see HomeScreen.js's popupQueue
// — and ringing should only stop once none of them are still outstanding.
const activeNotificationIds = new Set();

async function ensureChannel(ringing) {
  const id = ringing ? CHANNEL_ID_RINGING : CHANNEL_ID_SILENT;
  if (!channelsReady[id]) {
    channelsReady[id] = notifee.createChannel({
      id,
      name: ringing ? 'Incoming Calls & Chats' : 'Incoming Calls & Chats (in app)',
      importance: AndroidImportance.HIGH,
      visibility: AndroidVisibility.PUBLIC,
      // Ringing channel: Android owns the sound and vibration, so they survive our process
      // being killed. Silent channel: incomingRingtone.js is the sole source of both.
      sound: ringing ? 'default' : undefined,
      vibration: !!ringing,
      vibrationPattern: ringing ? [300, 700, 300, 700] : undefined,
    });
    // Best-effort tidy-up of the superseded channel; never let it block a ringing request.
    LEGACY_CHANNEL_IDS.forEach((legacy) => {
      notifee.deleteChannel(legacy).catch(() => {});
    });
  }
  return channelsReady[id];
}

function titleFor(type) {
  if (type === 'incoming_video_call') return 'Incoming Video Call';
  if (type === 'incoming_call') return 'Incoming Call';
  if (type === 'chat_request') return 'New Chat Request';
  return 'Astrowani';
}

function callTypeFor(type) {
  if (type === 'incoming_video_call') return 'video';
  if (type === 'incoming_call') return 'audio';
  return 'chat';
}

// Shared key so display and cancel always compute the same notification id for the same
// request — calls key on roomId, chats (no room_id column) key on callerId.
function idKeyFor(payload) {
  return payload.roomId || payload.callerId;
}

// Returns the notification's id (also used as the notifee-side dedupe key, keyed to the
// room/caller so a duplicate socket+push delivery of the same request doesn't double-post).
// `foreground` says the React app is alive and on screen, so incomingRingtone.js can be
// trusted to ring. Anything else (backgrounded, or a headless push into a killed app) must
// use the ringing channel, because our process may be gone a second from now.
export async function displayIncomingRequestNotification(payload, { foreground = false } = {}) {
  const ringing = !foreground;
  await ensureChannel(ringing);
  const type = payload.type;
  const isChat = type === 'chat_request';
  const notificationId = `incoming_${idKeyFor(payload) || Date.now()}`;

  const requestData = {
    table: isChat ? 'chat_requests' : 'call_requests',
    callType: callTypeFor(type),
    callerId: payload.callerId || '',
    callerName: payload.callerName || '',
    roomId: payload.roomId || '',
    sessionId: payload.sessionId || '',
    token: payload.token || '',
  };

  await notifee.displayNotification({
    id: notificationId,
    title: titleFor(type),
    body: payload.callerName ? `From ${payload.callerName}` : undefined,
    data: requestData,
    android: {
      channelId: ringing ? CHANNEL_ID_RINGING : CHANNEL_ID_SILENT,
      importance: AndroidImportance.HIGH,
      category: AndroidCategory.CALL,
      ongoing: true,
      autoCancel: false,
      // Keeps the channel's sound repeating like a real incoming call instead of a single
      // ping, for as long as the notification is up. Only meaningful on the ringing channel;
      // the silent one has no sound to loop.
      loopSound: ringing,
      // NO fullScreenAction, deliberately (removed 2026-09-03).
      //
      // It used to be set here so an incoming request could launch the app full-screen over
      // a locked phone. The manifest declares USE_FULL_SCREEN_INTENT and the app targets
      // SDK 36, so on Android 14+ this counts as a calling app and the intent IS granted —
      // meaning Android threw the app to the foreground the instant a request arrived. The
      // astrologer therefore never got to use the Accept/Reject buttons below: by the time
      // they looked at the screen they were already inside the app, facing the in-app popup,
      // and had to action it a second time there. Reported as "I can't accept or reject from
      // the notification, it takes me into the app".
      //
      // Without it the notification presents as a heads-up banner when the screen is on, and
      // as a lock-screen notification when it is not — both of which show Reject and Accept
      // and can be actioned in place. It still RINGS in every app state, because that comes
      // from incomingRingtone.js (started right below), not from the full-screen intent —
      // and it still reads as a call to Android via AndroidCategory.CALL + HIGH importance.
      //
      // The trade-off, stated plainly: a locked phone no longer wakes straight into the app.
      // It shows a ringing, actionable notification on the lock screen instead. That is the
      // behaviour that was asked for; restoring the old one means putting this line back.
      visibility: AndroidVisibility.PUBLIC, // show the buttons on the lock screen, not just the title
      // App logo in the notification's large-icon slot (top-right corner) — mipmap
      // resource already bundled for the launcher icon, no extra asset needed.
      largeIcon: 'ic_launcher',
      pressAction: { id: 'default', launchActivity: 'default' },
      actions: [
        { title: 'Reject', pressAction: { id: 'reject' } },
        { title: 'Accept', pressAction: { id: 'accept', launchActivity: 'default' } },
      ],
    },
  });

  activeNotificationIds.add(notificationId);
  // Only ring from JS when the app is actually alive to keep doing it. On the background/
  // killed path the channel rings instead — starting a setInterval there would ring for the
  // second or two before Android kills the process and then stop dead, which is precisely
  // the symptom this change exists to remove.
  if (foreground) startRinging();

  return notificationId;
}

// Admin broadcast/personal notifications — sent from the admin dashboard with a freeform
// title (e.g. an astrologer persona name like "Manju Ji") and body text. Distinct from the
// incoming-request notifications above: no actions, no ongoing/ CALL category, plain tap-to-open.
export async function displayGenericNotification({ title, body }) {
  // Silent channel: an admin broadcast must not ring like an incoming consultation.
  await ensureChannel(false);
  await notifee.displayNotification({
    title: title || 'Astrowani',
    body,
    android: {
      channelId: CHANNEL_ID_SILENT,
      importance: AndroidImportance.HIGH,
      largeIcon: 'ic_launcher',
      pressAction: { id: 'default', launchActivity: 'default' },
    },
  });
}

export async function cancelIncomingRequestNotification(notificationId) {
  if (!notificationId) return;
  activeNotificationIds.delete(notificationId);
  if (activeNotificationIds.size === 0) {
    stopRinging();
  }
  try {
    await notifee.cancelNotification(notificationId);
  } catch (_) {
    // best-effort
  }
}

// The customer gave up (timed out, cancelled, or the backend's own stale-request sweep
// caught it) before the vendor acted — dismiss the matching heads-up notification so it
// doesn't sit there indefinitely advertising a request nobody's waiting on anymore.
export async function cancelIncomingRequestForKey(payload) {
  const key = idKeyFor(payload);
  if (!key) return;
  await cancelIncomingRequestNotification(`incoming_${key}`);
}
