// Thin JS wrapper over the native RingingCallService (Android only).
//
// WHY IT EXISTS: an incoming call/chat request notification's own sound (Notifee's
// channel `sound`) can only ever be Android's generic default NOTIFICATION "ding" or a
// bundled raw audio resource — there is no JS-level way to point it at the phone's
// actual RINGTONE instead, and Notifee does not expose Android's native
// Notification.CallStyle either (which would otherwise handle this correctly out of the
// box). Looping that short ding via `loopSound` produced exactly the "irritating loop"
// reported 2026-09-29 — nothing like a real incoming call.
//
// The real ringtone (the one `incomingRingtone.js` already plays correctly while the
// app is alive) has to be played by something that survives the app being backgrounded
// OR fully killed. This starts a real Android foreground service (type `phoneCall`) that
// plays it NATIVELY, independent of whether the JS engine itself stays up after a
// background push handler returns.
//
// Called from Firebase.js's onMessage/setBackgroundMessageHandler for EVERY incoming
// request notification — not just the killed-app case — so foreground and background
// behave identically and there is exactly one code path to reason about. It is separate
// from (and runs alongside) the existing Notifee notification and incomingRingtone.js;
// this service's own notification is deliberately silent so the two never compete.
//
// Every function is a safe no-op on iOS and swallows failures — losing this service
// degrades the ring (falls back to the notification's own short sound) but must never
// throw into a push handler.
import { NativeModules, Platform } from 'react-native';

const { RingingCallService } = NativeModules;

const available = Platform.OS === 'android' && !!RingingCallService;

export async function startRingingService(title, body) {
  if (!available) return false;
  try {
    return await RingingCallService.start(title || null, body || null);
  } catch (_) {
    return false;
  }
}

export async function stopRingingService() {
  if (!available) return false;
  try {
    return await RingingCallService.stop();
  } catch (_) {
    return false;
  }
}

export const isRingingServiceAvailable = available;
