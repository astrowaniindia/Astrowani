/**
 * @format
 */
// Sends JS + native crashes/errors to Sentry. Sentry.init() sets up the global JS error
// handler, unhandled promise rejection tracking, and native (Java/NDK) crash capture on its
// own — no manual ErrorUtils wrapping needed (unlike the old Crashlytics setup).
import * as Sentry from '@sentry/react-native';

export function initCrashReporting() {
  Sentry.init({
    dsn: 'https://aaf2bbf981f34cb69a01d29493ddc957@o4511853415301120.ingest.us.sentry.io/4511853424934912',
    tracesSampleRate: 0,
    // Debug builds (the emulator over Metro) do not report. They were ~75% of all
    // issues in the customer project -- ReferenceErrors from half-saved files during
    // editing, tagged environment=development -- which buried the handful of real
    // customer crashes. Release builds, including every OTA bundle, still report.
    enabled: !__DEV__,
  });
}
