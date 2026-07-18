// Heads-up, actionable notification for incoming calls/video calls/chat requests — shows
// even when the app is backgrounded or fully killed (unlike the in-app-only popup in
// HomeScreen.js, which only works while that screen is mounted). Data-only FCM payloads
// from the backend land here via Firebase.js's onMessage/setBackgroundMessageHandler.
import notifee, { AndroidImportance, AndroidVisibility, AndroidCategory } from '@notifee/react-native';

const CHANNEL_ID = 'astrowani-incoming-requests';
let channelReady = null;

async function ensureChannel() {
  if (!channelReady) {
    channelReady = notifee.createChannel({
      id: CHANNEL_ID,
      name: 'Incoming Calls & Chats',
      importance: AndroidImportance.HIGH,
      visibility: AndroidVisibility.PUBLIC,
      sound: 'default',
      vibration: true,
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
      category: isChat ? undefined : AndroidCategory.CALL,
      ongoing: !isChat,
      autoCancel: false,
      pressAction: { id: 'default', launchActivity: 'default' },
      actions: [
        { title: 'Reject', pressAction: { id: 'reject' } },
        { title: 'Accept', pressAction: { id: 'accept', launchActivity: 'default' } },
      ],
    },
  });

  return notificationId;
}

export async function cancelIncomingRequestNotification(notificationId) {
  if (!notificationId) return;
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
