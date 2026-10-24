// ─────────────────────────────────────────────────────────────────────────────
// remoteVideoWatchdog — notice when the other person's video has stopped painting,
// and re-attach the renderer so it comes back on its own.
//
// WHY THIS EXISTS. Reported from the first iPhone TestFlight round (2026-10-24):
// "video call mein after 10-20 seconds on the astrologer's side black screen
// happening again and again". The call itself survives — audio keeps working and
// neither side hangs up — so this is the picture dying, not the session.
//
// WHAT IT DOES NOT CLAIM. It is NOT a diagnosis. The signalling was audited when
// this was written and is sound: the offer is created once behind a guard, the
// `webrtc_ready` retry stops at the first offer, `video_paused` is only ever sent
// by an explicit camera toggle, and ICE 'disconnected' does not tear the view down.
// So the cause is below our signalling, in the renderer or the decoder, where this
// app cannot see. What was genuinely missing is that NOTHING recovered from it:
// once the picture went, it stayed gone until somebody redialled.
//
// HOW IT DECIDES. `framesDecoded` on the inbound video stream is the only honest
// "a picture actually arrived" counter available to us. If it stops advancing for
// `stallMs` while ICE still reports a live connection, the remote picture is gone
// for a reason the connection cannot explain, and `onStalled` fires.
//
// Re-attaching the view is the documented answer to the Android case, where the
// SurfaceView behind RTCView can end up detached from a stream that is still
// arriving perfectly well — the frames are decoded, there is simply nothing on
// screen. In that case this watchdog never fires (framesDecoded keeps climbing),
// which is why the caller ALSO re-attaches on a stall it can see: one cheap action
// covers both the visible and the invisible version of the same symptom.
//
// It is deliberately quiet about everything else. A call that is genuinely dying
// is the ICE recovery's job (utils/iceRecovery.js), not this one's.
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULTS = {
  // Long enough that a brief freeze on a weak Indian mobile link is not treated as
  // a fault. Re-attaching costs a frame, but doing it every two seconds on a
  // genuinely slow connection would be its own flicker.
  stallMs: 6000,
  pollMs: 2000,
  // A stall that keeps coming back is not something re-attaching can fix, and
  // re-attaching forever would be a loop nobody can see. Stop and let the call be.
  maxRecoveries: 3,
};

export function createRemoteVideoWatchdog({ getPeer, onStalled, label = 'video', ...opts } = {}) {
  const cfg = { ...DEFAULTS, ...opts };
  let timer = null;
  let lastFrames = -1;
  let lastProgressAt = Date.now();
  let recoveries = 0;
  let stopped = false;

  const readFramesDecoded = async () => {
    const peer = getPeer && getPeer();
    if (!peer || typeof peer.getStats !== 'function') return null;
    // A peer connection that is not actually up has no picture to miss.
    const ice = peer.iceConnectionState;
    if (ice !== 'connected' && ice !== 'completed') return null;
    try {
      const stats = await peer.getStats();
      let frames = null;
      // react-native-webrtc returns a Map-like; forEach is the one shape both the
      // Android and the iOS implementation agree on.
      stats.forEach((report) => {
        if (report && report.type === 'inbound-rtp' && report.kind === 'video') {
          if (typeof report.framesDecoded === 'number') frames = report.framesDecoded;
        }
      });
      return frames;
    } catch (e) {
      return null;
    }
  };

  const tick = async () => {
    if (stopped) return;
    const frames = await readFramesDecoded();
    if (stopped) return;

    // null = we cannot tell (not connected yet, no inbound video report, getStats
    // threw). Treat it as "no evidence of a fault" and reset the clock, so a call
    // that has not started yet can never be reported as stalled.
    if (frames === null) {
      lastProgressAt = Date.now();
      lastFrames = -1;
      return;
    }

    if (frames !== lastFrames) {
      lastFrames = frames;
      lastProgressAt = Date.now();
      return;
    }

    if (Date.now() - lastProgressAt >= cfg.stallMs) {
      if (recoveries >= cfg.maxRecoveries) return;
      recoveries += 1;
      lastProgressAt = Date.now();
      console.log(`[${label}] remote video stalled at ${frames} frames — re-attaching (${recoveries}/${cfg.maxRecoveries})`);
      try { onStalled && onStalled(recoveries); } catch (e) {}
    }
  };

  return {
    start() {
      if (timer) return;
      lastProgressAt = Date.now();
      timer = setInterval(tick, cfg.pollMs);
    },
    stop() {
      stopped = true;
      if (timer) { clearInterval(timer); timer = null; }
    },
  };
}
