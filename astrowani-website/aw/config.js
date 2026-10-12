/**
 * Single source of truth for where the web client talks to.
 *
 * The site is served from shop.astrowani.com/test-site today and will move; this
 * is the one value that has to change when it does. The backend's CORS_ORIGINS
 * env var must list whatever origin this site is served from, or every call here
 * fails the browser preflight (native apps send no Origin and are unaffected,
 * which is why this never came up before the web client existed).
 */
const PRODUCTION_BACKEND = 'https://backend.astrowani.com';

/**
 * On localhost the calls go to this same origin, where dev-server.js proxies
 * /api and /socket.io upstream — so a laptop needs no CORS entry of its own.
 * Anywhere else (including the deployed site) it is the real backend host, and
 * that origin DOES have to be in the backend's CORS_ORIGINS allowlist.
 */
const isLocal = typeof location !== 'undefined'
  && /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);

export const BACKEND_URL = isLocal ? '' : PRODUCTION_BACKEND;

/** Socket.io lives on the same host as the REST API. */
export const SOCKET_URL = isLocal ? location.origin : PRODUCTION_BACKEND;

/** localStorage keys. Prefixed so they cannot collide with the site's theme/lang keys. */
export const STORAGE = {
  token: 'aw_token',
  user: 'aw_user',
};

/**
 * How long a call may ring before we give up and cancel it. Matches the apps'
 * 45s auto-cancel so an astrologer sees the same window regardless of which
 * platform the customer rang from.
 */
export const RING_TIMEOUT_MS = 45000;

/**
 * The polling backstop for "has the astrologer picked up yet?".
 *
 * Acceptance arrives by socket, but a socket can be missed — a backgrounded tab,
 * a dropped connection, an accept that lands while the socket is still
 * connecting. The apps learned this the hard way (CLAUDE.md DF: a single
 * push-style message with no reconciliation meant calls rang out while the
 * astrologer sat in the room). The web client gets the same backstop from the
 * start rather than rediscovering it.
 */
export const REQUEST_POLL_MS = 2000;

/** Minimum wallet balance, in minutes of talk time, before a consultation may start. */
export const MIN_BALANCE_MINUTES = 5;
