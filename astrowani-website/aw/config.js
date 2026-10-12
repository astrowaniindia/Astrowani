/**
 * Single source of truth for where the web client talks to.
 *
 * REST and the socket deliberately do NOT resolve the same way — see below.
 */
const PRODUCTION_BACKEND = 'https://backend.astrowani.com';

/**
 * Origins that serve /api/ from their own nginx, proxied to the backend on
 * loopback. To the browser those calls are same-origin, so there is no preflight
 * and no CORS entry to maintain.
 *
 * DO NOT "simplify" this to always calling PRODUCTION_BACKEND. The backend sets
 * its own Access-Control-Allow-Origin from a CORS_ORIGINS allowlist, and
 * vps-deployment/nginx/astrowani-shop.conf explains why shop.astrowani.com was
 * deliberately NOT added to it: a second source of that header produces
 * duplicate Access-Control-Allow-Origin values, which browsers reject outright,
 * and that would take the admin dashboard down. The proxy is the supported path.
 *
 * localhost is here for the same reason — dev-server.js proxies /api upstream.
 *
 * An origin NOT listed here falls back to calling the backend host directly,
 * which then DOES need to be in CORS_ORIGINS. If the site moves, the choice is:
 * proxy /api/ on the new host and add it here (preferred), or add it to the
 * backend allowlist.
 */
const SAME_ORIGIN_API_HOSTS = [
  'localhost',
  '127.0.0.1',
  '[::1]',
  'shop.astrowani.com',
];

const host = typeof location !== 'undefined' ? location.hostname : '';
const apiIsSameOrigin = SAME_ORIGIN_API_HOSTS.includes(host);

export const BACKEND_URL = apiIsSameOrigin ? '' : PRODUCTION_BACKEND;

/**
 * The socket is a SEPARATE decision, because /socket.io/ is not proxied by the
 * shop's nginx — only /api/ is. It therefore connects to the backend host
 * directly even where REST does not, which is allowed: the Socket.io server is
 * configured `cors: { origin: '*' }` (index.js), independently of the REST
 * allowlist. Routing it through location.origin on the deployed site would ask
 * nginx for a path it does not serve, and the handshake would 404.
 *
 * Only dev-server.js, which proxies the websocket upgrade too, serves both.
 */
const isLocal = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(host);

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
