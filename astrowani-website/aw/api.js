import { BACKEND_URL } from './config.js?v=20';
import { getToken, signOut } from './session.js?v=20';

/**
 * One fetch wrapper for every backend call.
 *
 * Returns the parsed body on success and throws an ApiError carrying the
 * backend's own `code`/`message` on failure, so call sites can branch on the
 * codes the API actually documents (`NO_ACCOUNT`, `ASTROLOGER_BUSY`,
 * `OFFER_CLOSED`, …) instead of string-matching prose.
 */

export class ApiError extends Error {
  constructor(message, { status, code, body } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.body = body;
  }
}

export async function request(path, { method = 'GET', body, auth = true, timeoutMs = 20000 } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  if (auth) {
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let res;
  try {
    res = await fetch(`${BACKEND_URL}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    // An aborted request and a dead network look the same to the caller and are
    // handled the same way, so they get one message rather than two.
    throw new ApiError('Could not reach Astrowani. Please check your connection.', { status: 0 });
  }
  clearTimeout(timer);

  let payload = null;
  try {
    payload = await res.json();
  } catch (_) {
    payload = null;
  }

  if (!res.ok) {
    // A 401 on an authenticated call means the token is gone or expired. Clear it
    // so the UI falls back to signed-out rather than retrying forever with a dead
    // credential. Auth endpoints themselves are exempt: a wrong OTP is a 401 there
    // and must not wipe an existing session.
    if (res.status === 401 && auth && !path.startsWith('/api/users/mobile-otp')) {
      signOut();
    }
    throw new ApiError(payload?.message || `Request failed (${res.status})`, {
      status: res.status,
      code: payload?.code,
      body: payload,
    });
  }

  return payload;
}

export const api = {
  get: (path, opts) => request(path, { ...opts, method: 'GET' }),
  post: (path, body, opts) => request(path, { ...opts, method: 'POST', body }),
  put: (path, body, opts) => request(path, { ...opts, method: 'PUT', body }),
};
