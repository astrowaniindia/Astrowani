// Heads-up, actionable notification for incoming calls/video calls/chat requests — shows
// even when the app is backgrounded or fully killed (unlike the in-app-only popup in
// HomeScreen.js, which only works while that screen is mounted). Data-only FCM payloads
// from the backend land here via Firebase.js's onMessage/setBackgroundMessageHandler.
import notifee, { AndroidImportance, AndroidVisibility, AndroidCategory } from '@notifee/react-native';
import { startRinging, stopRinging } from './incomingRingtone';

// v2: the v1 channel had sound:'default' + vibration:true, which made Android play its own
// one-shot notification ping/buzz the instant the notification posted — a beat before
// incomingRingtone.js's continuous ringtone kicked in ("ping then ring"). Channel sound/
// vibration are immutable once created on a device (Android platform restriction — Notifee
// can't override them post-creation), so silencing v1 in code wouldn't have applied to an
// already-installed app; bumping the id forces a fresh channel with the corrected settings.
const CHANNEL_ID = 'astrowani-incoming-requests-v2';
let channelReady = null;

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

async function ensureChannel() {
  if (!channelReady) {
    channelReady = notifee.createChannel({
      id: CHANNEL_ID,
      name: 'Incoming Calls & Chats',
      importance: AndroidImportance.HIGH,
      visibility: AndroidVisibility.PUBLIC,
      // No channel sound/vibration — incomingRingtone.js (InCallManager + Vibration) is the
      // sole source of both, so the notification post itself stays silent and the ringtone is
      // the first and only thing the vendor hears.
      sound: undefined,
      vibration: false,
    });
  }
  return channelReady;
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
export async function displayIncomingRequestNotification(payload) {
  await ensureChannel();
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
      channelId: CHANNEL_ID,
      importance: AndroidImportance.HIGH,
      category: AndroidCategory.CALL,
      ongoing: true,
      autoCancel: false,
      // Makes Android treat this as a genuine incoming-call notification — can launch the
      // app full-screen even over a locked screen, instead of sitting as a passive heads-up
      // banner. Combined with the continuous ringtone (started right below, independent of
      // whether the app is open, backgrounded, or killed) this is what actually makes it
      // "ring" rather than buzz once.
      fullScreenAction: { id: 'default', launchActivity: 'default' },
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
  startRinging();

  return notificationId;
}

// Admin broadcast/personal notifications — sent from the admin dashboard with a freeform
// title (e.g. an astrologer persona name like "Manju Ji") and body text. Distinct from the
// incoming-request notifications above: no actions, no ongoing/ CALL category, plain tap-to-open.
export async function displayGenericNotification({ title, body }) {
  await ensureChannel();
  await notifee.displayNotification({
    title: title || 'Astrowani',
    body,
    android: {
      channelId: CHANNEL_ID,
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
