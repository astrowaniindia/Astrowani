// Why a call failed to connect, not just that it did.
//
// `call_ended` already carries `connected: false`, which is enough to measure the
// failure RATE — measured 2026-09-27 at roughly 1 in 10 production calls. It is not
// enough to act on, because it cannot distinguish:
//
//   * TURN was never reachable        -> we gathered no relay candidate at all
//   * TURN worked, the network didn't -> we had a relay candidate and still failed
//   * signalling never delivered      -> the other side's candidates never arrived
//
// Those three have completely different fixes (buy a relay / change transport / fix the
// socket), and without this you cannot tell them apart. Attach a tracker to the peer
// connection, feed it the three things it asks for, and read `snapshot()` when a call
// ends without having connected.
//
// EVERYTHING HERE IS BEST-EFFORT AND SILENT. It runs on the failure path of a call that
// is already going badly; a diagnostic that throws would turn a failed call into a
// crash. Every method swallows its own errors.

/** A candidate line looks like "candidate:... typ relay raddr ...". */
function candidateType(candidate) {
  try {
    const line = typeof candidate === 'string' ? candidate : candidate && candidate.candidate;
    if (!line) return null;
    const m = / typ (host|srflx|prflx|relay)/.exec(line);
    return m ? m[1] : null;
  } catch (_) {
    return null;
  }
}

export function createIceDiagnostics(callType) {
  const startedAt = Date.now();
  const local = { host: 0, srflx: 0, relay: 0, other: 0 };
  const remote = { host: 0, srflx: 0, relay: 0, other: 0 };
  const states = [];
  let lastState = 'new';
  let restarts = 0;

  const bump = (bucket, type) => {
    if (!type) { bucket.other += 1; return; }
    if (bucket[type] === undefined) bucket.other += 1;
    else bucket[type] += 1;
  };

  return {
    noteLocalCandidate(c) { try { bump(local, candidateType(c)); } catch (_) {} },
    noteRemoteCandidate(c) { try { bump(remote, candidateType(c)); } catch (_) {} },
    noteIceState(s) {
      try {
        if (!s || s === lastState) return;
        lastState = s;
        // Cap the trail: a call that flaps for minutes must not build an unbounded
        // string that then gets sent to analytics.
        if (states.length < 12) states.push(s);
      } catch (_) {}
    },
    noteRestart() { try { restarts += 1; } catch (_) {} },

    /**
     * The properties to attach to `call_connect_failed`. Deliberately booleans and small
     * counts — no IPs, no candidate strings, nothing that identifies a network or a
     * person.
     */
    snapshot(extra) {
      try {
        return {
          call_type: callType,
          seconds_waiting: Math.round((Date.now() - startedAt) / 1000),
          ice_state: lastState,
          ice_state_trail: states.join('>'),
          ice_restarts: restarts,
          // THE question this exists to answer: did our own TURN server ever give us a
          // relay candidate? No relay locally means TURN was unreachable or refused us,
          // and no amount of retrying on the customer's side will help.
          local_relay: local.relay > 0,
          local_srflx: local.srflx > 0,
          local_host_only: local.relay === 0 && local.srflx === 0 && local.host > 0,
          local_candidates: local.host + local.srflx + local.relay + local.other,
          // And did the other side's candidates reach us at all? Zero means signalling
          // failed, which is a socket problem, not a relay problem.
          remote_relay: remote.relay > 0,
          remote_candidates: remote.host + remote.srflx + remote.relay + remote.other,
          ...(extra || {}),
        };
      } catch (_) {
        return { call_type: callType, ice_state: 'unknown' };
      }
    },
  };
}
