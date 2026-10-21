// ensureCallPermissions — ask for the microphone BEFORE a call is placed.
//
// WHY THIS EXISTS (2026-10-21, measured). Every call screen asked for RECORD_AUDIO on mount,
// inside setupWebRTC(), and armed createPreConnectWatchdog() in the same effect — but the
// watchdog's 45s clock starts at mount while setupWebRTC() is still sitting on
// `await PermissionsAndroid.request(...)`, which blocks on a human tapping "Allow".
//
// So a customer who hesitated at the permission dialog had their call killed underneath it
// with "We could not connect this call". Over the 7 days to 2026-10-21 that was 68 of 475
// audio calls (14%), in a spike at 47-51 seconds, 56 of which never flowed any media at all.
// A customer's FIRST EVER call failed 16.4% of the time against 7.3% for every later call —
// Android only shows that dialog once, and that gap is the dialog.
//
// Asking here, at the tap, fixes it at the root: by the time the call screen mounts the
// permission is already settled, so there is nothing for the watchdog to race. It also means
// a customer who denies the microphone never rings an astrologer's phone — and, on the free
// intro call, never burns their one-per-customer offer on a call that could not have worked.
//
// FAILS OPEN, deliberately. Anything other than an explicit denial (a thrown bridge error, an
// unreadable result) returns true and lets the call proceed: the call screen asks again and
// handles a real denial with its own alert, so the worst case here is today's behaviour. The
// opposite — refusing to place a call because a permission probe misfired — would block a
// consultation that would have worked fine.

import {PermissionsAndroid, Platform} from 'react-native';
import {mediaDevices} from 'react-native-webrtc';

/**
 * @param {object}  [args]
 * @param {boolean} [args.video]  also ask for CAMERA (video calls)
 * @param {string}  [args.label]  for the log line only
 * @returns {Promise<boolean>} false ONLY on an explicit denial by the user
 */
export async function ensureCallPermissions({video = false, label = 'call'} = {}) {
  if (Platform.OS === 'android') {
    const wanted = [PermissionsAndroid.PERMISSIONS.RECORD_AUDIO];
    if (video) wanted.push(PermissionsAndroid.PERMISSIONS.CAMERA);
    try {
      // check() first, so an already-granted permission never draws a dialog. Without it
      // every repeat caller would see a flicker on a tap that used to be instant.
      const held = await Promise.all(wanted.map((p) => PermissionsAndroid.check(p)));
      if (held.every(Boolean)) return true;

      const res = await PermissionsAndroid.requestMultiple(wanted);
      return wanted.every((p) => res[p] === PermissionsAndroid.RESULTS.GRANTED);
    } catch (e) {
      console.warn(`[${label}] permission pre-check failed, continuing:`, e);
      return true;
    }
  }

  // iOS has no PermissionsAndroid, and the microphone prompt is raised by getUserMedia
  // itself — so the only way to settle it before the call screen is to open a stream here
  // and release it immediately. The grant is cached by the OS, so the call screen's own
  // getUserMedia a moment later does not prompt again.
  try {
    const stream = await mediaDevices.getUserMedia({audio: true, video});
    stream.getTracks().forEach((track) => {
      try { track.stop(); } catch (_) {}
    });
    return true;
  } catch (err) {
    const detail = `${err?.name || ''} ${err?.message || ''}`;
    if (/NotAllowed|Permission|denied/i.test(detail)) return false;
    console.warn(`[${label}] microphone probe failed, continuing:`, detail);
    return true;
  }
}

export default ensureCallPermissions;
