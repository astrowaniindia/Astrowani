/**
 * @format
 */
// Sends JS + native crashes/errors to Sentry. Sentry.init() sets up the global JS error
// handler, unhandled promise rejection tracking, and native (Java/NDK) crash capture on its
// own — no manual ErrorUtils wrapping needed (unlike the old Crashlytics setup).
import * as Sentry from '@sentry/react-native';

export function initCrashReporting() {
  Sentry.init({
    dsn: 'https://9b8ce1cc55ee633fee9640c5a8323bf9@o4511853415301120.ingest.us.sentry.io/4511853433323520',
    tracesSampleRate: 0,
  });
}
