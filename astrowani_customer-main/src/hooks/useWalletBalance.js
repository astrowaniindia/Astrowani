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
import { getWalletBalance } from '../utils/wallet';

const POLL_MS = 20000;

let cachedBalance = null;
const subscribers = new Set();
let refCount = 0;
let timer = null;
let inFlight = null;

function notify() {
  subscribers.forEach((fn) => fn(cachedBalance));
}

async function poll() {
  if (inFlight) return inFlight;
  inFlight = (async () => {
    try {
      const value = await getWalletBalance();
      cachedBalance = value;
      notify();
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

// Call on logout — `cachedBalance` is module-level (that's the whole point,
// it's what lets every consumer share one poll), so without this it survives
// past AsyncStorage.clear(): the next account to log in in the same app
// process would see the PREVIOUS account's balance for one network
// round-trip before the first fresh poll resolves. Mirrors the existing
// resetAnalyticsIdentity() call already made on logout for the same reason
// (module-level identity state outliving the session it belonged to).
export function resetWalletBalance() {
  cachedBalance = null;
  notify();
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
