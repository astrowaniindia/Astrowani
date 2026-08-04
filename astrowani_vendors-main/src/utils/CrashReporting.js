/**
 * @format
 */
// Sends JS-layer crashes/errors to Firebase Crashlytics. Native Android crashes are
// captured automatically once the Crashlytics Gradle plugin is applied (see
// android/build.gradle + android/app/build.gradle) — this file only covers the JS side,
// which Crashlytics does not see by default.
import crashlytics from '@react-native-firebase/crashlytics';

export function initCrashReporting() {
  crashlytics().setCrashlyticsCollectionEnabled(true).catch(() => {});

  const previousHandler = global.ErrorUtils ? global.ErrorUtils.getGlobalHandler() : null;
  if (global.ErrorUtils) {
    global.ErrorUtils.setGlobalHandler((error, isFatal) => {
      crashlytics().recordError(error, isFatal ? 'FatalJSError' : 'JSError');
      if (previousHandler) previousHandler(error, isFatal);
    });
  }

  // React Native doesn't route unhandled promise rejections through ErrorUtils.
  const rejectionTracking = require('promise/setimmediate/rejection-tracking');
  rejectionTracking.enable({
    allRejections: true,
    onUnhandled: (id, error) => {
      crashlytics().recordError(
        error instanceof Error ? error : new Error(String(error)),
        'UnhandledPromiseRejection',
      );
    },
    onHandled: () => {},
  });
}
