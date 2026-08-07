const {getDefaultConfig, mergeConfig} = require('@react-native/metro-config');

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

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
