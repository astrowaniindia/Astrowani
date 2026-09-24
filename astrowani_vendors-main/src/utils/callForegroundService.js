// Thin JS wrapper over the native CallForegroundService (Android only).
//
// WHY IT EXISTS: from Android 11 the OS silences the microphone for any app that is
// not in the foreground, and from Android 14 the only way to keep capturing is a
// running foreground service whose type is `microphone`. Neither app declared one, so
// backgrounding a live call stopped the user's voice reaching the other side until
// they returned — the reported bug. Keeping the service alive also stops Android
// freezing or killing the process, which is the likely cause of the rarer
// "call just cut" report.
//
// An `ongoing: true` local notification is NOT a substitute for a CALL: it looks like a
// call notification but grants no microphone privilege. See
// android/.../CallForegroundService.kt.
//
// The same service now also backs two more things the astrologer must be able to leave
// and come back to (2026-09-24):
//   mode 'chat'  — keeps the app (and its socket) alive while a chat is in the background
//   mode 'live'  — keeps camera + microphone capturing for a broadcast in the background
// Both need a binary that has startMode(); on an older binary they fall back to a plain
// ongoing notification via notifee (see ongoingSession.js), which still gives the
// astrologer a way back in but cannot keep the process alive.
//
// Every function is a safe no-op on iOS and swallows failures — losing the service
// degrades a call (the mic gets gagged in the background again) but must never break
// one by throwing into a call screen.
import { NativeModules, Platform } from 'react-native';

const { CallForegroundService } = NativeModules;

const available = Platform.OS === 'android' && !!CallForegroundService;
// True only on a binary that knows about "chat" and "live".
const modesAvailable = available && typeof CallForegroundService.startMode === 'function';

/**
 * Start the ongoing foreground service.
 *
 * MUST be called while the app is in the foreground — Android forbids starting a
 * foreground service of these types from the background, and the matching runtime
 * permission (RECORD_AUDIO / CAMERA) must already be granted. Both hold at the point every
 * caller uses: the moment the session reports itself connected, with the screen visible.
 *
 * @param {string} title
 * @param {string} body
 * @param {'call'|'chat'|'video'|'live'} [mode='call'] — 'video' holds the camera type too,
 *   so a backgrounded video call keeps publishing video instead of freezing to audio only.
 * @returns {Promise<boolean>} whether a real foreground service was started
 */
export async function startCallForegroundService(title, body, mode = 'call') {
  if (!available) return false;
  try {
    if (modesAvailable) {
      return await CallForegroundService.startMode(title || null, body || null, mode);
    }
    // Older binary: it only understands the original call service.
    if (mode !== 'call') return false;
    return await CallForegroundService.start(title || null, body || null);
  } catch (_) {
    return false;
  }
}

export async function stopCallForegroundService() {
  if (!available) return false;
  try {
    return await CallForegroundService.stop();
  } catch (_) {
    return false;
  }
}

export const isCallForegroundServiceAvailable = available;
export const areSessionModesAvailable = modesAvailable;
