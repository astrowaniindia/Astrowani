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
// An `ongoing: true` local notification is NOT a substitute: it looks like a call
// notification but grants no microphone privilege. See
// android/.../CallForegroundService.kt.
//
// Every function is a safe no-op on iOS and swallows failures — losing the service
// degrades a call (the mic gets gagged in the background again) but must never break
// one by throwing into a call screen.
import { NativeModules, Platform } from 'react-native';

const { CallForegroundService } = NativeModules;

const available = Platform.OS === 'android' && !!CallForegroundService;

/**
 * Start the ongoing-call foreground service.
 *
 * MUST be called while the app is in the foreground — Android forbids starting a
 * microphone-type foreground service from the background, and RECORD_AUDIO must
 * already be granted. Both hold at the point every caller uses: the moment the call
 * reports itself connected, with the call screen on screen.
 */
export async function startCallForegroundService(title, body) {
  if (!available) return false;
  try {
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
