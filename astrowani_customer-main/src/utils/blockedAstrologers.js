// ─────────────────────────────────────────────────────────────────────────────
// The customer's own "astrologers I have blocked" list, kept in one place.
//
// Before this (reported 2026-10-24, first iPhone TestFlight round) a block was
// written to the server and then never mentioned again anywhere in the app: the
// astrologer's profile looked exactly as before, the running chat carried on, there
// was no way to undo it, and a call simply failed without saying why. The block
// worked -- it was invisible.
//
// A tiny cache with subscribers rather than a fetch per screen, because three
// different surfaces need the same answer at the same moment (the profile's banner
// and its three action buttons, the chat header, the blocked-list screen), and an
// unblock on one of them has to be reflected on the others immediately.
//
// FAILS OPEN, deliberately and in the same direction as the server's own check: if
// the list cannot be fetched, `isBlocked` answers false and the buttons stay live.
// The server is the authority and refuses the call anyway with a message this app
// now shows, so the worst case is one refused tap -- whereas failing closed would
// grey out every astrologer in the app on a dropped request.
// ─────────────────────────────────────────────────────────────────────────────
import AsyncStorage from '@react-native-async-storage/async-storage';
import Instance from '../api/ApiCall';

let blockedIds = new Set();
let loaded = false;
let inFlight = null;
const listeners = new Set();

function notify() {
  listeners.forEach((fn) => {
    try { fn(new Set(blockedIds)); } catch (e) {}
  });
}

async function authHeaders() {
  const token = await AsyncStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/** Subscribe to changes. Returns an unsubscribe function. */
export function subscribeBlockedAstrologers(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Synchronous answer from whatever is cached. False until the list has loaded. */
export function isAstrologerBlocked(astrologerId) {
  return !!astrologerId && blockedIds.has(String(astrologerId));
}

export function hasLoadedBlockedAstrologers() {
  return loaded;
}

/**
 * Fetch the list. Concurrent callers share one request -- several screens ask on
 * mount at the same time and there is no reason to make the same call three times.
 */
export async function refreshBlockedAstrologers({ force = false } = {}) {
  if (loaded && !force && !inFlight) return Array.from(blockedIds);
  if (inFlight) return inFlight;
  inFlight = (async () => {
    try {
      const res = await Instance.get('/api/astrologers/blocked', { headers: await authHeaders() });
      const rows = (res.data && (res.data.data || res.data.blocked)) || [];
      blockedIds = new Set(rows.map((r) => String(r.astrologerId || r.astrologer_id)).filter(Boolean));
      loaded = true;
      notify();
      return rows;
    } catch (e) {
      // Not loaded, so a later screen will try again rather than trusting an empty set.
      return [];
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

/** The full list with names, for the blocked-astrologers screen. */
export async function fetchBlockedAstrologerList() {
  try {
    const res = await Instance.get('/api/astrologers/blocked', { headers: await authHeaders() });
    const rows = (res.data && (res.data.data || res.data.blocked)) || [];
    blockedIds = new Set(rows.map((r) => String(r.astrologerId || r.astrologer_id)).filter(Boolean));
    loaded = true;
    notify();
    return { ok: true, rows };
  } catch (e) {
    return { ok: false, rows: [] };
  }
}

/**
 * The cache is updated BEFORE the request resolves and rolled back if it fails, so
 * the profile's buttons change the instant the person taps -- a block that takes a
 * network round trip to become visible reads as a button that did nothing, which is
 * the complaint this whole module exists to answer.
 */
export async function unblockAstrologer(astrologerId) {
  const id = String(astrologerId);
  const had = blockedIds.has(id);
  blockedIds.delete(id);
  notify();
  try {
    await Instance.post('/api/astrologers/unblock', { astrologerId: id }, { headers: await authHeaders() });
    return { ok: true };
  } catch (e) {
    if (had) { blockedIds.add(id); notify(); }
    return { ok: false };
  }
}

/** Record a block made elsewhere (the moderation sheet owns the actual request). */
export function markAstrologerBlocked(astrologerId) {
  if (!astrologerId) return;
  blockedIds.add(String(astrologerId));
  notify();
}

/** Signing out must not leave the next account looking at someone else's blocks. */
export function resetBlockedAstrologers() {
  blockedIds = new Set();
  loaded = false;
  notify();
}

/**
 * Turn a refused /api/call/initiate or /api/chat/initiate into a sentence.
 *
 * The complaint this answers (2026-10-24): "when I try to call I was not specified
 * with the reason why I am not able to call". The server has always sent one; every
 * call site threw it away in a generic catch.
 *
 * Returns the message to show, or null if this error is not a block and the caller
 * should carry on with its own handling. When the block turns out to be the
 * customer's own, the local store is corrected too, so the astrologer's profile
 * switches to its blocked state without a refetch.
 */
export function describeBlockError(error, astrologerId) {
  const res = error && error.response;
  const body = res && res.data;
  if (!body || !body.blocked) return null;
  if (body.blockedByYou && astrologerId) markAstrologerBlocked(astrologerId);
  return body.message || null;
}
