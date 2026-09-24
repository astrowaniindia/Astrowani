// The "chat / live is in progress — tap to return" notification, and the foreground service
// that keeps the app alive behind it (2026-09-24).
//
// An astrologer must be able to switch to another app mid-chat or mid-broadcast, see
// something in the notification bar saying it is still going on, and tap it to get back.
// Calls already do this through CallForegroundService (see callForegroundService.js); this
// gives chat and live the same treatment.
//
// Two layers, best first:
//   1. The native foreground service in mode 'chat' / 'live'. It owns the notification AND
//      keeps the process (and so the socket / camera) alive in the background.
//   2. On a binary that predates those modes, a plain ongoing notifee notification. It
//      still gives the astrologer a way back in — the app then reopens and the
//      active-session check (activeSessionResume.js) puts them straight back — but it
//      cannot stop Android freezing the app.
//
// Tapping either notification just launches/foregrounds MainActivity; getting to the right
// screen is the resume check's job, so there is deliberately no deep link in the intent.
import notifee, { AndroidImportance, AndroidVisibility } from '@notifee/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { startCallForegroundService, stopCallForegroundService } from './callForegroundService';

const CHANNEL_ID = 'astrowani-ongoing-session';
const NOTIFICATION_ID = 'ongoing_session';
const STORE_KEY = 'ongoingSessionId';
// Same ceilings the native service uses for its own auto-stop.
const TIMEOUT_MS = { chat: 3 * 60 * 60 * 1000, live: 12 * 60 * 60 * 1000 };

let channelReady = null;
function ensureChannel() {
  if (!channelReady) {
    channelReady = notifee.createChannel({
      id: CHANNEL_ID,
      name: 'Ongoing chat / live',
      // LOW: it is a status indicator, not an alert. It must never buzz or ping.
      importance: AndroidImportance.LOW,
      visibility: AndroidVisibility.PUBLIC,
      vibration: false,
    });
  }
  return channelReady;
}

/**
 * Show the ongoing notification for a chat or a live broadcast.
 * Call it while the app is in the foreground, once the session is actually running.
 * Never throws.
 *
 * @param {{kind: 'chat'|'live', sessionId: string, title: string, body: string}} opts
 */
export async function showOngoingSession({ kind, sessionId, title, body }) {
  if (Platform.OS !== 'android') return;
  try {
    if (sessionId) await AsyncStorage.setItem(STORE_KEY, String(sessionId));
    const started = await startCallForegroundService(title, body, kind);
    if (started) return;

    // Older binary (or the service refused): fall back to a plain ongoing notification.
    await ensureChannel();
    await notifee.displayNotification({
      id: NOTIFICATION_ID,
      title,
      body,
      android: {
        channelId: CHANNEL_ID,
        ongoing: true,
        autoCancel: false,
        onlyAlertOnce: true,
        smallIcon: 'ic_notification',
        largeIcon: 'ic_launcher',
        timeoutAfter: TIMEOUT_MS[kind] || TIMEOUT_MS.chat,
        pressAction: { id: 'default', launchActivity: 'default' },
      },
    });
  } catch (e) {
    console.log('[ongoingSession] show failed:', e?.message);
  }
}

/**
 * Clear the notification and stop the service.
 *
 * If `sessionId` is given, it only acts when that is exactly the session being shown — a
 * late "session_ended" push for a chat that finished a minute ago must not tear down the
 * notification of the chat that started since, and a push for a CALL (which this module
 * never shows, and whose own service its screen stops) must not touch a running call's
 * service at all.
 */
export async function hideOngoingSession(sessionId) {
  if (Platform.OS !== 'android') return;
  try {
    if (sessionId) {
      const current = await AsyncStorage.getItem(STORE_KEY);
      if (!current || String(current) !== String(sessionId)) return;
    }
    await AsyncStorage.removeItem(STORE_KEY);
    await stopCallForegroundService();
    await notifee.cancelNotification(NOTIFICATION_ID);
  } catch (e) {
    console.log('[ongoingSession] hide failed:', e?.message);
  }
}
