const fs = require('fs');
const path = require('path');
const { captureError } = require('./sentry');

// File-based error log the bug-scanning agent reads from. Short-lived buffer,
// not a permanent archive — good enough for "what broke since the last scan."
//
// NOTE: an earlier comment here said the disk was ephemeral and wiped on every
// deploy. That was true of Render; the backend has since moved to a Hostinger
// VPS, where this file PERSISTS across restarts and grows without bound. That
// stale assumption is why nothing ever capped it — a 26 GB errors.log was found
// on 2026-08-18. See MD files/otp-audit-2026-08-18.md finding 5.
const LOG_DIR = path.join(__dirname, '..', 'logs');
const LOG_FILE = path.join(LOG_DIR, 'errors.log');

// Rotate at 50 MB, keeping one previous generation. Bounded at ~100 MB total,
// which is far more history than the bug-scan agent needs and small enough that
// a runaway error loop cannot fill the disk. A full disk takes down Supabase
// writes and the EnableX call together, which looks like OTP randomly breaking
// for everyone and then fixing itself on the next restart.
const MAX_LOG_BYTES = 50 * 1024 * 1024;
const ROTATED_FILE = `${LOG_FILE}.1`;

// Re-entry guard. logError is wired to process.on('uncaughtException'), so ANY
// throw from inside it re-enters it forever. That is not hypothetical: this is
// exactly how the 26 GB file was produced —
//
//   logError -> console.error -> EPIPE (stdout is a broken pipe)
//     -> uncaughtException -> logError -> console.error -> EPIPE -> ...
//
// The fs.appendFileSync was already wrapped in try/catch; console.error was
// not, and it is the call that throws. Both are guarded below, but the flag is
// the backstop that makes the loop structurally impossible regardless of which
// call starts misbehaving.
let inLogError = false;

function ensureLogDir() {
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  } catch (_) {}
}

// Keep the log bounded. Best-effort: a rotation failure must never propagate,
// because the caller is often already handling a crash.
function rotateIfOversized() {
  try {
    const { size } = fs.statSync(LOG_FILE);
    if (size < MAX_LOG_BYTES) return;
    try { fs.unlinkSync(ROTATED_FILE); } catch (_) {}
    fs.renameSync(LOG_FILE, ROTATED_FILE);
  } catch (_) {
    // Missing file (nothing logged yet) is the common case and is fine.
  }
}

function logError(source, err, extra = {}) {
  // Dropping a nested error is the correct trade: the outer one is already
  // being recorded, and the alternative is an unbounded loop.
  if (inLogError) return;
  inLogError = true;

  try {
    ensureLogDir();
    rotateIfOversized();

    const entry = {
      ts: new Date().toISOString(),
      source, // e.g. 'express', 'uncaughtException', 'unhandledRejection', 'socket'
      message: err && err.message ? err.message : String(err),
      stack: err && err.stack ? err.stack : undefined,
      ...extra,
    };

    try {
      fs.appendFileSync(LOG_FILE, JSON.stringify(entry) + '\n');
    } catch (_) {
      // Logging must never itself crash the process.
    }

    // Was unguarded. Throws EPIPE whenever stdout is a broken pipe — e.g. the
    // process is piped to something that exited, or a detached PM2 run loses
    // its output stream.
    try {
      console.error(`[${source}]`, entry.message);
    } catch (_) {}

    try {
      captureError(err instanceof Error ? err : new Error(entry.message));
    } catch (_) {}
  } finally {
    inLogError = false;
  }
}

/**
 * Stop a dead output stream from becoming a process-level crash.
 *
 * Without an 'error' listener, an EPIPE on stdout/stderr surfaces as an
 * uncaughtException — which is what fed the loop described above. Attaching a
 * no-op listener makes the write fail silently instead, which is the right
 * behaviour: if nobody is reading our output, being unable to write it is not
 * an application error.
 *
 * Call once at startup, before anything else can log.
 */
function installStreamErrorGuards() {
  try {
    process.stdout.on('error', () => {});
    process.stderr.on('error', () => {});
  } catch (_) {}
}

module.exports = { logError, LOG_FILE, installStreamErrorGuards };
