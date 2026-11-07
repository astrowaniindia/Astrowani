const {getDefaultConfig, mergeConfig} = require('@react-native/metro-config');
const {withSentryConfig} = require('@sentry/react-native/metro');

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * @type {import('metro-config').MetroConfig}
 */
const config = {
  // RELEASE BUILDS RAN OUT OF MEMORY WITHOUT THIS (2026-10-26). Metro defaults to one
  // transform worker per CPU core, and each is a separate Node process with its own
  // heap -- on this 16GB machine that collectively exhausted the free RAM part-way
  // through `createBundleReleaseJsAndAssets` and the bundle died with
  // "FATAL ERROR: ... JavaScript heap out of memory" (exit 134). Raising NODE_OPTIONS
  // alone did NOT fix it, because the ceiling was the total across workers, not any
  // single one. Four is enough to keep the bundle reasonably fast while leaving room
  // for Gradle's own JVM alongside it.
  // OVERRIDABLE PER BUILD (2026-11-07). Four is still right as the default, but it
  // is not always enough on THIS machine: a release build died again with
  // "Fatal process out of memory: Zone" inside a jest-worker while free RAM was
  // 5.3GB of 15.7GB, and fell to 0.9GB mid-transform on the retry.
  //
  // THE NOTE ABOVE IS EXACTLY RIGHT AND WAS RE-LEARNED THE HARD WAY. The ceiling is
  // the TOTAL across workers, so `NODE_OPTIONS=--max-old-space-size=...` does nothing
  // for it. Worse, RAISING that value is actively counterproductive, and measuring it
  // is what showed why: on this machine the default cap is ALREADY ~4096MB
  // (`v8.getHeapStatistics().heap_size_limit` reports 4144 for the default AND for an
  // explicit 4096, i.e. they are the same number). So "raise NODE_OPTIONS to 4096" is
  // a no-op, and anything larger just lets each worker grow further into RAM that is
  // not there.
  //
  // The only two real levers are FEWER WORKERS and a LOWER per-worker cap. This env
  // override exists so a memory-starved build can pull the first without changing the
  // default for CI (the GitHub runners that build OTA bundles have 4 cores and ample
  // RAM; capping them at 2 would only make every OTA slower):
  //
  //   METRO_MAX_WORKERS=2 NODE_OPTIONS=--max-old-space-size=2048 ./gradlew bundleRelease
  //
  // Changing this value invalidates Metro's transform cache, so the run that uses it
  // is a COLD one and therefore the hungriest — which is why the per-worker cap
  // matters alongside it rather than instead of it.
  maxWorkers: Number(process.env.METRO_MAX_WORKERS) || 4,
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
