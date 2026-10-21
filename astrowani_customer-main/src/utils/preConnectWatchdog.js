// createPreConnectWatchdog — nothing may sit on "Connecting…" forever.
//
// WHY THIS EXISTS (2026-09-30, reported from the field). Between the astrologer accepting and
// media actually flowing there is a window of a few seconds. If either side hangs up inside
// that window, the other side used to stay on "Connecting…" indefinitely, with no message and
// no idea why. Three separate reasons, all real:
//
//   1. `session_ended` is emitted to the two personal rooms and the session room, but a
//      socket that has not finished joining is in NONE of them, and Socket.io never replays
//      to a room you join afterwards. So the one notification simply missed.
//   2. The astrologer's call screen joins the session room ONLY (HomeScreen owns the personal
//      room) and HomeScreen has no `session_ended` listener — so a customer who hung up early
//      reached the astrologer's app nowhere at all.
//   3. The 30s countdown only starts once the screen reaches 'ringing'. A screen stuck in
//      'connecting' had NO deadline of any kind.
//
// This watchdog fixes all three the same way: while we are not connected, ask the server
// whether the session is still alive. If it has ended, leave straight away and say who ended
// it. If it is still alive but we have been waiting too long, stop and say the call could not
// be connected — never leave the person staring at a spinner.

import AsyncStorage from '@react-native-async-storage/async-storage';
import Instance from '../api/ApiCall';

const POLL_MS = 3000;
// Long enough that a slow-but-real connection is never cut short (ICE over a relay on a poor
// mobile network can take a good few seconds), short enough that a dead call is not a mystery.
const DEFAULT_DEADLINE_MS = 45000;
// The outer bound, measured from mount, for media never opening at all. Generous on purpose:
// the thing it is usually waiting for is a human reading a permission dialog, and cutting that
// short is the exact bug this guard was added to stop (see isMediaReady below).
const DEFAULT_SETUP_DEADLINE_MS = 120000;

/**
 * @param {object} args
 * @param {() => string|null} args.getSessionId   read at poll time — it can arrive late
 * @param {() => boolean} args.isConnected        true once media is flowing; stops the watchdog
 * @param {() => boolean} args.isEnding           true once we are already tearing down
 * @param {(info:{reason:'ended_by_other'|'timeout'}) => void} args.onGiveUp
 * @param {() => boolean} [args.isMediaReady] true once the mic is actually open — see below
 * @param {number} [args.deadlineMs]
 * @param {number} [args.setupDeadlineMs]
 * @param {string} [args.label]
 */
export function createPreConnectWatchdog({
  getSessionId, isConnected, isEnding, onGiveUp, isMediaReady = null,
  deadlineMs = DEFAULT_DEADLINE_MS, setupDeadlineMs = DEFAULT_SETUP_DEADLINE_MS, label = 'call',
}) {
  let stopped = false;
  let timer = null;
  // Set once the state endpoint has actually answered. The deadline below only applies when
  // it has: on a build that is running against a backend WITHOUT /api/session/:id/state
  // (i.e. before this change is deployed) we must not start ending calls on a timer we
  // cannot verify — that would turn a slow-but-real connection into a dropped one. Without
  // the server we simply behave as before: no forced give-up.
  let sawServer = false;
  const startedAt = Date.now();
  // WHEN THE 45s CLOCK IS ALLOWED TO START (2026-10-21). It used to start at mount — but at
  // mount the screen may still be awaiting `PermissionsAndroid.request(RECORD_AUDIO)`, which
  // blocks on a human tapping "Allow". The deadline then expired underneath the dialog and
  // killed a call that had never been given a microphone to connect with: 14% of all audio
  // calls, and 16.4% of every customer's FIRST call. The permission is now asked for at the
  // tap instead (src/utils/callPermissions.js), so this should no longer be reachable — but
  // the clock belongs where it measures the right thing regardless, so `deadlineMs` now runs
  // from the moment media is genuinely open. A caller that passes no isMediaReady keeps
  // exactly the old behaviour.
  let readyAt = isMediaReady ? null : startedAt;

  const stop = () => { stopped = true; if (timer) { clearTimeout(timer); timer = null; } };

  const finish = (reason) => {
    stop();
    console.log(`[${label}] pre-connect watchdog giving up: ${reason}`);
    try { onGiveUp({ reason }); } catch (_) {}
  };

  const tick = async () => {
    if (stopped) return;
    // Connected, or we are already ending it ourselves — nothing left to watch.
    if (isConnected() || isEnding()) { stop(); return; }

    const sessionId = getSessionId();
    if (sessionId) {
      try {
        const token = await AsyncStorage.getItem('token');
        if (token) {
          const res = await Instance.get(`/api/session/${sessionId}/state`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (stopped) return;
          if (res?.data?.success) sawServer = true;
          // The other side hung up (or the server ended it) before we ever connected.
          // We know it was not us, because isEnding() is false.
          if (res?.data?.ended) { finish('ended_by_other'); return; }
        }
      } catch (e) {
        // A failed check must never end a call that might still be fine. Try again next tick.
      }
    }

    if (readyAt === null) {
      try { if (isMediaReady()) readyAt = Date.now(); } catch (_) {}
    }

    if (sawServer) {
      // Media is open: the connection itself is what we are now waiting on.
      if (readyAt !== null && Date.now() - readyAt > deadlineMs) { finish('timeout'); return; }
      // Media never opened. Still bounded — "nothing may sit on Connecting… forever" — but on
      // the long clock, because this is the permission-dialog case and not a failing call.
      if (readyAt === null && Date.now() - startedAt > setupDeadlineMs) { finish('timeout'); return; }
    }
    if (!stopped) { timer = setTimeout(tick, POLL_MS); }
  };

  timer = setTimeout(tick, POLL_MS);
  return { stop };
}

export default createPreConnectWatchdog;
