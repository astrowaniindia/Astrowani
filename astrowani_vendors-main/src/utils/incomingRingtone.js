// Continuous "incoming call" ringtone for the vendor app — re-triggers InCallManager's
// ringtone on an interval until explicitly stopped.
//
// Why not just rely on InCallManager's native looping (setLooping(true))? Verified on-device
// (logcat) that it doesn't reliably loop: '_DEFAULT_' can resolve to
// `content://settings/system/notification_sound` rather than an actual telephony ringtone
// (common on devices/emulators with no SIM or no ringtone configured), and playback for that
// URI is delegated to Android's system RingtonePlayer service, which plays the clip once
// (~2-3s) and completes — it does not honor the caller's setLooping request, since the actual
// decoding happens in the system process, not the app's local MediaPlayer. Observed via logcat:
// "RingtonePlayer: onCompletion() abandoning AudioFocus" a few seconds after start, every time.
// Re-triggering from JS on an interval sidesteps this entirely and doesn't depend on
// device-specific ringtone-resolution behavior.
import InCallManager from 'react-native-incall-manager';
import { Vibration } from 'react-native';

const RETRIGGER_MS = 3000; // slightly longer than the observed ~2.5s single play-through
const VIBRATE_PATTERN = [0, 1000, 1000];

let intervalId = null;

function fire() {
  try {
    InCallManager.startRingtone('_DEFAULT_');
  } catch (e) {
    console.warn('[incomingRingtone] startRingtone error:', e?.message);
  }
}

export function startRinging() {
  if (intervalId) return; // already ringing
  fire();
  Vibration.vibrate(VIBRATE_PATTERN, true);
  intervalId = setInterval(fire, RETRIGGER_MS);
}

export function stopRinging() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
  Vibration.cancel();
  try {
    InCallManager.stopRingtone();
  } catch (e) {
    console.warn('[incomingRingtone] stopRingtone error:', e?.message);
  }
}
