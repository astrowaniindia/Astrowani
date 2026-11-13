// RFC 6238 TOTP for admin two-factor login (security audit 2026-11-13). No dependency:
// it is ~40 lines of HMAC, and a new npm package would be one more supply-chain entry
// sitting in front of the admin dashboard.
//
// Works with every standard authenticator app (Google Authenticator, Microsoft
// Authenticator, 1Password, Authy …): SHA-1, 6 digits, 30-second steps — the defaults
// every app assumes when an otpauth:// URI leaves them out.

const crypto = require('crypto');

const STEP_SECONDS = 30;
const DIGITS = 6;
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Encode(buf) {
  let bits = 0; let value = 0; let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte; bits += 8;
    while (bits >= 5) { out += ALPHABET[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

function base32Decode(str) {
  const clean = String(str || '').toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0; let value = 0; const out = [];
  for (const ch of clean) {
    value = (value << 5) | ALPHABET.indexOf(ch); bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(out);
}

/** 160-bit secret, the size RFC 4226 recommends for SHA-1. */
function generateSecret() {
  return base32Encode(crypto.randomBytes(20));
}

function codeAt(secret, step) {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(step));
  const h = crypto.createHmac('sha1', base32Decode(secret)).update(msg).digest();
  const off = h[h.length - 1] & 15;
  const bin = ((h[off] & 0x7f) << 24) | (h[off + 1] << 16) | (h[off + 2] << 8) | h[off + 3];
  return String(bin % 10 ** DIGITS).padStart(DIGITS, '0');
}

const currentStep = (nowMs = Date.now()) => Math.floor(nowMs / 1000 / STEP_SECONDS);

/**
 * The step a code matches, or null. Accepts one step either side to absorb clock skew
 * between the server and the phone. `minStep` rejects anything at or before the last
 * accepted step, so a code that was just used (or shoulder-surfed) cannot be replayed.
 */
function verify(secret, code, { nowMs = Date.now(), minStep = null } = {}) {
  const c = String(code || '').replace(/\s/g, '');
  if (!secret || !/^\d{6}$/.test(c)) return null;
  const now = currentStep(nowMs);
  for (const step of [now - 1, now, now + 1]) {
    if (minStep != null && step <= minStep) continue;
    const want = codeAt(secret, step);
    if (crypto.timingSafeEqual(Buffer.from(want), Buffer.from(c))) return step;
  }
  return null;
}

function otpauthUrl(secret, accountName, issuer = 'Astrowani Admin') {
  const label = encodeURIComponent(`${issuer}:${accountName}`);
  return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=${DIGITS}&period=${STEP_SECONDS}`;
}

module.exports = { generateSecret, verify, codeAt, currentStep, otpauthUrl, base32Encode, base32Decode };
