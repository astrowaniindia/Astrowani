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

/**
 * @param {object} args
 * @param {() => string|null} args.getSessionId   read at poll time — it can arrive late
 * @param {() => boolean} args.isConnected        true once media is flowing; stops the watchdog
 * @param {() => boolean} args.isEnding           true once we are already tearing down
 * @param {(info:{reason:'ended_by_other'|'timeout'}) => void} args.onGiveUp
 * @param {number} [args.deadlineMs]
 * @param {string} [args.label]
 */
export function createPreConnectWatchdog({
  getSessionId, isConnected, isEnding, onGiveUp, deadlineMs = DEFAULT_DEADLINE_MS, label = 'call',
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

    if (sawServer && Date.now() - startedAt > deadlineMs) { finish('timeout'); return; }
    if (!stopped) { timer = setTimeout(tick, POLL_MS); }
  };

  timer = setTimeout(tick, POLL_MS);
  return { stop };
}

export default createPreConnectWatchdog;
