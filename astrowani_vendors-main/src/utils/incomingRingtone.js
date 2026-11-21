// "Incoming call" ringtone for the vendor app.
//
// A single InCallManager.startRingtone('_DEFAULT_') call is enough — and is the correct,
// normal-sounding behaviour. Confirmed against the actual installed version's native source
// (react-native-incall-manager@4.2.1, android/.../InCallManagerModule.java): it plays the
// device's real ringtone (Settings.System.DEFAULT_RINGTONE_URI) through a local MediaPlayer
// with setLooping(true) set explicitly, and with no `seconds` argument the JS wrapper passes
// -1 (loop forever) — so it rings continuously, exactly like a normal phone call, until
// stopRingtone() is called. No JS-side keepalive is needed.
//
// ⚠ 2026-09-28: this used to re-trigger startRingtone() on a 3s setInterval, based on a
// mistaken belief (in an earlier version of this comment) that Android's system
// RingtonePlayer service plays the clip once and never loops. That class isn't used by this
// library at all — MediaPlayer.setLooping(true) is. The retrigger didn't just do nothing: it
// RACED the native player's async prepareAsync(). If a 3s retrigger landed in the brief
// window after startRingtone() had created the player but before playback had actually begun,
// the native code saw isPlaying() === false, tore down the not-yet-playing player, and started
// a new one — every ~3 seconds, forever. That's what produced the broken "tone... tone...
// tone" stutter instead of one continuous ring (reported on a real device, not an emulator).
// Do not reintroduce a retrigger loop here without first re-confirming (against the actual
// installed version's source, not assumption) that the native side genuinely stops early.
import InCallManager from 'react-native-incall-manager';
import { Vibration } from 'react-native';

const VIBRATE_PATTERN = [0, 1000, 1000];

let ringing = false;
let lastStopAt = 0;

// HOW LONG THE NATIVE RINGTONE TEARDOWN IS GIVEN BEFORE ANYTHING ELSE TOUCHES InCallManager.
//
// 2026-11-14: a fatal IllegalStateException (Sentry ASTROWANI-VENDOR-K) from
// android.media.MediaPlayer.isPlaying(), on the React Native bridge thread, inside the
// library's own start(). Read against the installed version's native source
// (react-native-incall-manager@4.2.1, android/.../InCallManagerModule.java):
//
//   * start() runs on the bridge thread and opens with
//       if (mRingtone != null && mRingtone.isPlaying()) { stopRingtone(); }
//   * stopRingtone() does its work on a BRAND NEW BACKGROUND THREAD:
//       mRingtone.stopPlay();   // stop(); reset(); release();
//       mRingtone = null;
//
// Between release() and that null assignment, mRingtone is a non-null MediaPlayer whose
// native object is gone — and isPlaying() on a released player throws. start() has no
// try/catch of its own (startRingtone() and stopRingtone() both wrap their whole bodies,
// which is why only start() ever crashes), so the exception reaches the bridge thread
// uncaught and kills the app.
//
// That window opens exactly when an astrologer ANSWERS: stopRinging() below, then the call
// screen mounts and calls InCallManager.start(). A JS try/catch around start() cannot help —
// the throw happens on the native module thread, not in JS.
//
// So the call screens await awaitRingtoneTeardown() first. The settle has to cover the
// asynchronous bridge dispatch of stopRingtone(), that thread starting, and stop/reset/
// release — together a few milliseconds in practice; 300 ms is generous and is imperceptible
// against a call that is still negotiating WebRTC.
//
// ⚠ This narrows the window, it does not prove it shut: mRingtone is a plain field, so this
// is a timing guard, not a lock we can take from JS. The deterministic fix is on the native
// side — upstream master has since moved start()/startRingtone()/stopRingtone() onto one
// shared lifecycle thread (runOnLifecycleThread), which removes the race outright — but a
// library upgrade or a patch-package patch to that Java is a native change and needs a store
// build, not an OTA. Do not shorten this without re-reading the installed version's source.
const TEARDOWN_SETTLE_MS = 300;

export function startRinging() {
  if (ringing) return; // already ringing — never call startRingtone() a second time while live
  ringing = true;
  try {
    InCallManager.startRingtone('_DEFAULT_');
  } catch (e) {
    console.warn('[incomingRingtone] startRingtone error:', e?.message);
  }
  Vibration.vibrate(VIBRATE_PATTERN, true);
}

export function stopRinging() {
  ringing = false;
  // Stamped unconditionally, and before the call below can throw. Gating this on `ringing`
  // would skip the guard in the one case the unconditional stopRingtone() exists for — a
  // stale JS flag over a native player that is still very much alive.
  lastStopAt = Date.now();
  Vibration.cancel();
  try {
    InCallManager.stopRingtone();
  } catch (e) {
    console.warn('[incomingRingtone] stopRingtone error:', e?.message);
  }
}

// Resolves once the native stopRingtone() teardown has had time to finish. Already-resolved
// when no ringtone has been stopped recently, so call sites that never follow a ring (going
// live) pay nothing. See TEARDOWN_SETTLE_MS for why this exists.
export function awaitRingtoneTeardown() {
  const remaining = TEARDOWN_SETTLE_MS - (Date.now() - lastStopAt);
  if (remaining <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, remaining));
}
