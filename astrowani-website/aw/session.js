import { STORAGE } from './config.js?v=32';

/**
 * Who is signed in, and a way to be told when that changes.
 *
 * The site is multi-page, so this is rebuilt from localStorage on every
 * navigation — the token is the only thing that persists. A 30-day JWT is what
 * the backend mints, so a returning visitor stays signed in.
 */

const listeners = new Set();

let token = null;
let user = null;

try {
  token = localStorage.getItem(STORAGE.token);
  const raw = localStorage.getItem(STORAGE.user);
  user = raw ? JSON.parse(raw) : null;
} catch (_) {
  // Private browsing, blocked site data, corrupt JSON. Signed out is the correct
  // fallback — never let a storage failure throw during boot.
  token = null;
  user = null;
}

export function getToken() {
  return token;
}

export function getUser() {
  return user;
}

export function isSignedIn() {
  return !!token;
}

export function signIn(nextToken, nextUser) {
  token = nextToken;
  user = nextUser || null;
  try {
    localStorage.setItem(STORAGE.token, nextToken);
    if (nextUser) localStorage.setItem(STORAGE.user, JSON.stringify(nextUser));
  } catch (_) {}
  emit();
}

export function signOut() {
  token = null;
  user = null;
  try {
    localStorage.removeItem(STORAGE.token);
    localStorage.removeItem(STORAGE.user);
  } catch (_) {}
  emit();
}

/** Subscribe to sign-in/sign-out. Returns an unsubscribe function. */
export function onAuthChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit() {
  listeners.forEach((fn) => {
    try {
      fn({ token, user });
    } catch (e) {
      console.error('[aw/session] listener failed:', e);
    }
  });
}
