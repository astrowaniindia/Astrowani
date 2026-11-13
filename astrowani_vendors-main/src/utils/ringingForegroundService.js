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
// OVERLAY (added 2026-09-30): the service now also shows a persistent floating banner
// (SYSTEM_ALERT_WINDOW) with Accept/Reject buttons at the top of the screen. The
// standard heads-up notification auto-dismisses after ~5s; the overlay stays visible
// until the astrologer acts or the caller gives up. Requires "Display over other apps"
// permission — degrades to notification-only if not granted.
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

// start() gained its third `requestDataJson` parameter in the same native change that
// added the overlay. An OTA bundle reaches OLDER store builds too (they share a
// versionName), and calling a legacy-bridge method with the wrong number of arguments is
// a FATAL crash on the native modules thread — thrown before any promise exists, so the
// try/catch below cannot see it and the whole app dies. The overlay methods shipped with
// that extra parameter, so their presence is how we tell which signature this build has.
const supportsOverlay =
  available && typeof RingingCallService.getPendingOverlayAction === 'function';

export async function startRingingService(title, body, requestDataJson) {
  if (!available) return false;
  try {
    if (!supportsOverlay) {
      // Older build: still rings, but has no overlay to hand the payload to.
      return await RingingCallService.start(title || null, body || null);
    }
    return await RingingCallService.start(title || null, body || null, requestDataJson || null);
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

// ── Overlay permission helpers ────────────────────────────────────────────

/**
 * Returns true if the app has permission to draw over other apps
 * (SYSTEM_ALERT_WINDOW). On iOS or if the module is unavailable, returns false.
 */
export async function checkOverlayPermission() {
  if (!available) return false;
  try {
    return await RingingCallService.checkOverlayPermission();
  } catch (_) {
    return false;
  }
}

/**
 * Opens the system Settings screen where the user can grant "Display over other apps".
 * Safe no-op on iOS.
 */
export async function requestOverlayPermission() {
  if (!available) return false;
  try {
    return await RingingCallService.requestOverlayPermission();
  } catch (_) {
    return false;
  }
}

/**
 * Returns (and clears) any pending Accept/Reject action that was stored by
 * the overlay's button handler in SharedPreferences. Used on cold start when
 * the JS bridge wasn't alive to receive a DeviceEvent.
 *
 * Returns { action: 'accept'|'reject', data: string (JSON) } or null.
 */
export async function getPendingOverlayAction() {
  if (!available) return null;
  try {
    return await RingingCallService.getPendingOverlayAction();
  } catch (_) {
    return null;
  }
}

export const isRingingServiceAvailable = available;

// False on a build whose native side has no overlay at all — asking for the permission
// there would open nothing and could never be satisfied.
export const isOverlaySupported = supportsOverlay;
