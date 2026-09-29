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
  Vibration.cancel();
  try {
    InCallManager.stopRingtone();
  } catch (e) {
    console.warn('[incomingRingtone] stopRingtone error:', e?.message);
  }
}
