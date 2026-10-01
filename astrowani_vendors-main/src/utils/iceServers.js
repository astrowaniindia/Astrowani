// The WebRTC relay list, fetched from the backend with a safe local fallback.
//
// WHY (2026-10-01). This list used to be hardcoded in three screens in this app
// and three more in the astrologer app. Two things went wrong with that:
//
//   1. `openrelay.metered.ca` — the only relay besides our own, and three of the
//      seven entries — is DEAD. Measured: its TCP ports accept a connection but
//      it never answers the STUN/TURN protocol, because the free
//      `openrelayproject` credentials are no longer served. Every installed app
//      still wastes ICE gathering time on it, and the list LOOKS like it has a
//      backup relay when it has none. Those entries are gone from the fallback
//      below.
//   2. Fixing that, rotating the credentials, or adding a relay (a second
//      provider, or TURNS on 443 for networks that block UDP and non-standard
//      ports) all required a store release and then waiting for adoption.
//
// Fetching the list means the backend can repair or extend it for every
// installed app in one deploy.
//
// WHAT TURN ACTUALLY DOES FOR A CALL — worth knowing before editing this.
// It is the call's automatic, same-call backup. ICE gathers direct (host/srflx)
// and relay candidates in PARALLEL during one connection attempt; if the direct
// path fails, it switches to the relay by itself, typically within a second or
// two. It is not a redial and the user never sees it. A broken relay list does
// not produce an error — it produces calls that silently fail to connect on
// restrictive networks.
//
// FAILURE POSTURE: every failure path returns the bundled list. A slow, down or
// unauthorised backend must never delay or block a call — this can only ever
// improve the list, never withhold one.

import AsyncStorage from '@react-native-async-storage/async-storage';
import {SOCKET_URL} from '../config/api';

// Used whenever the backend cannot be reached. Deliberately our own relay only:
// a dead entry is not a safety net, it is just latency during ICE gathering.
export const FALLBACK_ICE_SERVERS = {
  iceServers: [
    {urls: 'stun:stun.l.google.com:19302'},
    {urls: 'stun:stun1.l.google.com:19302'},
    {
      urls: [
        'turn:76.13.243.165:3478',
        'turn:76.13.243.165:3478?transport=tcp',
      ],
      username: 'astrowani',
      credential: '23fc84a011212f5bc729bf9752961d2e',
    },
  ],
};

// Call setup is latency-sensitive, so this is short on purpose. Missing the
// fetch costs nothing but the fallback; waiting on it costs ringing time.
const FETCH_TIMEOUT_MS = 3500;

let cached = null;
let cachedUntil = 0;

/**
 * Resolve the ICE configuration for a new RTCPeerConnection.
 * Always resolves — never rejects.
 */
export async function getIceServers() {
  if (cached && Date.now() < cachedUntil) return cached;

  try {
    const token = await AsyncStorage.getItem('token');
    if (!token) return FALLBACK_ICE_SERVERS;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    let res;
    try {
      res = await fetch(`${SOCKET_URL}/api/call/ice-servers`, {
        headers: {Authorization: `Bearer ${token}`},
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
    if (!res || !res.ok) return FALLBACK_ICE_SERVERS;

    const body = await res.json();
    if (!body || !Array.isArray(body.iceServers) || !body.iceServers.length) {
      return FALLBACK_ICE_SERVERS;
    }

    cached = {iceServers: body.iceServers};
    // Re-fetch before a time-limited credential expires. Cap the cache so a
    // relay change still reaches a long-running app within the hour.
    const ttlSec = Number(body.expiresInSeconds) || 3600;
    cachedUntil = Date.now() + Math.min(ttlSec * 0.8, 3600) * 1000;
    return cached;
  } catch (_) {
    // Offline, timed out, 401, malformed JSON — all mean "use what we shipped".
    return FALLBACK_ICE_SERVERS;
  }
}

/** Drop the cache, e.g. after a failed connection, so the next try re-fetches. */
export function clearIceServerCache() {
  cached = null;
  cachedUntil = 0;
}

export default getIceServers;
