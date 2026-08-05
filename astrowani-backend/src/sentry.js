// Routes backend errors into the (previously unused) astrowani-backend Sentry project,
// so the bug-scan agent — and anyone watching Sentry — sees backend crashes the same way
// it already sees customer/vendor app crashes. Purely additive: errorLogger's file-based
// log (read by /api/bug-agent/errors) keeps working exactly as before whether or not this
// is configured.
const Sentry = require('@sentry/node');

let initialized = false;

function initSentry() {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) {
    console.log('[Sentry] SENTRY_DSN not set — backend error reporting to Sentry is disabled.');
    return;
  }
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV || 'production',
    tracesSampleRate: 0, // error tracking only, no perf tracing
  });
  initialized = true;
  console.log('[Sentry] Backend error reporting initialized.');
}

function captureError(err) {
  if (!initialized || !err) return;
  try {
    Sentry.captureException(err instanceof Error ? err : new Error(String(err)));
  } catch (_) {
    // Reporting must never itself crash the process.
  }
}

module.exports = { initSentry, captureError };
