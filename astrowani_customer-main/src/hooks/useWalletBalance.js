// astrowani_customer-main/src/hooks/useWalletBalance.js
//
// One shared 20s poll of GET /api/wallet, ref-counted the same way
// useSharedSocket.js shares one Socket.io connection — instead of every
// consumer (bottom tab bar, CustomHeader on 6 screens, the Wallet screen's own
// header) each running an independent setInterval against the same endpoint.
//
// Still polls (not Realtime) for the same reason the previous three copies
// did: `customers` carries every user's PII and Postgres GRANT is not
// row-scoped, so there is no anon column grant that exposes "your own"
// balance without exposing everyone's — see DATABASE_HARDENING_HANDOFF.md
// §3.1/§3.2. This file only removes the duplication, not the polling itself.
import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getWalletBalance } from '../utils/wallet';

const POLL_MS = 20000;
// Last known balance, kept on the phone so a returning customer sees their real
// balance on the first frame instead of 0/… followed by the true figure a poll
// later — which looked especially wrong right after a session had just spent
// money (2026-10-02). Always corrected by the first successful poll below.
const STORAGE_KEY = 'walletBalanceCache';

let cachedBalance = null;
const subscribers = new Set();
let refCount = 0;
let timer = null;
let inFlight = null;
// Bumped by resetWalletBalance(). A poll that started before a sign-out must not
// be allowed to land after it — otherwise the request made as the previous
// customer writes THEIR balance into the cache (and now onto the disk) that the
// next customer to sign in on this handset reads.
let generation = 0;

function notify() {
  subscribers.forEach((fn) => fn(cachedBalance));
}

async function poll() {
  if (inFlight) return inFlight;
  const startedGeneration = generation;
  inFlight = (async () => {
    try {
      const value = await getWalletBalance();
      if (startedGeneration !== generation) return;
      cachedBalance = value;
      notify();
      // Background write: nothing waits on it, and a failed write only costs the
      // next launch its head start.
      AsyncStorage.setItem(STORAGE_KEY, String(value)).catch(() => {});
    } catch (_) {
      // Silent — every previous caller kept showing the last known balance on
      // a failed poll rather than surfacing an error; preserved here.
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

function acquire(subscriber) {
  subscribers.add(subscriber);
  if (cachedBalance !== null) subscriber(cachedBalance);
  refCount += 1;
  if (refCount === 1) {
    poll();
    timer = setInterval(poll, POLL_MS);
  }
}

function release(subscriber) {
  subscribers.delete(subscriber);
  refCount = Math.max(0, refCount - 1);
  if (refCount === 0 && timer) {
    clearInterval(timer);
    timer = null;
  }
}

// Forces an immediate refetch (e.g. on screen focus) without starting a
// second timer — the existing 20s interval keeps running regardless.
export function refreshWalletBalance() {
  return poll();
}

// Reads last launch's balance into the shared cache, so the very first render of
// the tab bar / headers already shows a real figure. Call ONLY for a signed-in
// customer, and before the navigator mounts (App.js bootstrap).
//
// Never overwrites a value a poll has already produced: hydration is a head start,
// not a source of truth, and a fresh balance must always win a race with the disk.
export async function hydrateWalletBalance() {
  if (cachedBalance !== null) return;
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw === null || cachedBalance !== null) return;
    const value = Number(raw);
    if (!Number.isFinite(value)) return;
    cachedBalance = value;
    notify();
  } catch (_) {}
}

// Call on logout — `cachedBalance` is module-level (that's the whole point,
// it's what lets every consumer share one poll), so without this it survives
// past AsyncStorage.clear(): the next account to log in in the same app
// process would see the PREVIOUS account's balance for one network
// round-trip before the first fresh poll resolves. Mirrors the existing
// resetAnalyticsIdentity() call already made on logout for the same reason
// (module-level identity state outliving the session it belonged to).
export function resetWalletBalance() {
  generation += 1;
  cachedBalance = null;
  notify();
  // The stored copy must go too, for exactly the reason above: it outlives the
  // process, so without this the NEXT account to log in on this phone would be
  // shown the previous account's balance on its first frame — the very head start
  // hydrateWalletBalance() exists to give.
  AsyncStorage.removeItem(STORAGE_KEY).catch(() => {});
}

export default function useWalletBalance() {
  const [balance, setBalance] = useState(cachedBalance);
  useEffect(() => {
    const subscriber = (value) => setBalance(value);
    acquire(subscriber);
    return () => release(subscriber);
  }, []);
  return balance;
}
