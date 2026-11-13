// switchCamera — flip the front/back camera on a local video track, without leaving an
// unhandled promise rejection behind.
//
// WHY THIS EXISTS (2026-11-01, Sentry ASTROWANI-VENDOR-G:
// "java.lang.Exception: Error switching camera: switchCamera: camera is not running.").
//
// Two separate faults stacked up, and the second is what made the first visible.
//
// 1. Turning the camera OFF stops the capturer outright, it does not merely drop frames.
//    Our video toggles set `videoTrack.enabled = false`, which react-native-webrtc 124
//    forwards to GetUserMediaImpl.mediaStreamTrackSetEnabled() ->
//    videoCaptureController.stopCapture(). A flip attempted in that state reaches
//    CameraCapturer.switchCameraInternal() with no open session, which reports
//    "switchCamera: camera is not running." So the flip button, which stays live while the
//    camera is off, could only ever fail.
//
// 2. `track._switchCamera()` is DEPRECATED and declared `void`: internally it calls
//    `applyConstraints()` and DROPS the returned promise. So the rejection belongs to a
//    promise nobody holds, and the `try { ... } catch { ... }` the call sites wrapped it in
//    — which is synchronous — could never see it. It surfaced instead as an
//    `onunhandledrejection`, which Sentry reports at error level, while the call itself
//    carried on perfectly normally.
//
// So this does exactly what `_switchCamera()` does, over the public API
// (`getSettings()` + `applyConstraints()`), and keeps hold of the promise. Any native
// failure that is left is logged, not reported as a production error.
//
// Deliberately silent to the user: a camera flip that does not happen is a cosmetic
// disappointment, never a reason to interrupt a paid consultation with an alert.

export function switchCamera(track: any, logTag: string = '[switchCamera]'): void {
  if (!track || track.kind !== 'video' || track.remote) {
    return;
  }

  // Nothing is running to flip: the camera is off, or the track has already ended because
  // the call is being torn down. Asking anyway is the crash above.
  if (track.enabled === false || track.readyState === 'ended') {
    return;
  }

  try {
    // getSettings() returns a clone of the same `_settings` map `_switchCamera()` reads,
    // so these constraints are identical to the library's — width, height and frameRate
    // included, which is what keeps the capture format unchanged across the flip.
    const settings: any = typeof track.getSettings === 'function' ? track.getSettings() : null;
    if (!settings) {
      return;
    }

    const constraints: any = {...settings};
    // deviceId takes precedence over facingMode natively, so it has to go or the flip
    // resolves straight back to the camera we are already on.
    delete constraints.deviceId;
    constraints.facingMode = settings.facingMode === 'user' ? 'environment' : 'user';

    const pending = track.applyConstraints(constraints);
    if (pending && typeof pending.catch === 'function') {
      pending.catch((e: any) => console.log(`${logTag} camera flip failed:`, e?.message || e));
    }
  } catch (e: any) {
    console.log(`${logTag} camera flip failed:`, e?.message || e);
  }
}
