const {getDefaultConfig, mergeConfig} = require('@react-native/metro-config');
const {withSentryConfig} = require('@sentry/react-native/metro');

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * @type {import('metro-config').MetroConfig}
 */
const config = {
  resolver: {
    // posthog-react-native depends on @posthog/core subpaths (e.g. @posthog/core/surveys)
    // declared via package.json "exports" — Metro doesn't resolve those by default, which
    // otherwise fails the whole bundle (not just analytics) with "could not be found".
    unstable_enablePackageExports: true,
  },
};

// withSentryConfig injects a `debugId` into the generated bundle + source map,
// which is how Sentry ties a minified stack frame back to real source.
//
// WHY THIS WRAPPER WAS ADDED (2026-08-19). sentry.gradle was already applied in
// android/app/build.gradle, so every release build ran Sentry's upload task —
// but nothing was injecting a debugId, so the task's own precondition check
// (@sentry/react-native/scripts/has-sourcemap-debugid.js) found none and tried
// to bail out. That script calls `process.exist(1)` instead of `process.exit(1)`,
// a typo in the package, so instead of failing cleanly it threw
// "TypeError: process.exist is not a function" and took the whole release build
// down with it. Both AABs on 2026-08-18 had to be built with
// SENTRY_DISABLE_AUTO_UPLOAD=true to get past it.
//
// Fixing the wrapper removes the precondition failure at its source. Note the
// typo is still there in node_modules and would still misfire on any future
// missing-debugId condition — patching it is pointless though, since a correct
// process.exit(1) would just fail the build for the real reason instead.
module.exports = withSentryConfig(mergeConfig(getDefaultConfig(__dirname), config));
