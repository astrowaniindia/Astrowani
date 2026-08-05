const fs = require('fs');
const path = require('path');
const { captureError } = require('./sentry');

// File-based error log the bug-scanning agent reads from. Render's disk is
// ephemeral (wiped on each deploy/restart), so this is a short-lived buffer,
// not a permanent archive — good enough for "what broke since the last scan."
const LOG_DIR = path.join(__dirname, '..', 'logs');
const LOG_FILE = path.join(LOG_DIR, 'errors.log');

function ensureLogDir() {
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  } catch (_) {}
}

function logError(source, err, extra = {}) {
  ensureLogDir();
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
  console.error(`[${source}]`, entry.message);
  captureError(err instanceof Error ? err : new Error(entry.message));
}

module.exports = { logError, LOG_FILE };
