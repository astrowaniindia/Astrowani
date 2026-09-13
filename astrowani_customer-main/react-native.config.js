module.exports = {
  project: {
    android: {},
    ios: {},
  },
  assets: ['./src/assets/Fonts'],
  dependencies: {
    // react-native-iap exists ONLY to satisfy Apple's In-App Purchase requirement
    // (App Store Guideline 3.1.1) for the three digital-content paths: astro
    // reports, gifts and free services. See astrowani-backend/sql/coin_schema.sql.
    //
    // ⚠ IT MUST STAY OFF ANDROID. Autolinked there it pulls in the Google Play
    // Billing library and merges com.android.vending.BILLING into the manifest —
    // a new permission on a LIVE Play Store listing, for a payment system this app
    // does not use on Android (everything there is Razorpay + the rupee wallet,
    // which is unchanged by this feature).
    //
    // Same reasoning and same mechanism as the vendor app's react-native-callkeep
    // exclusion, which is kept off Android so its ConnectionService cannot merge
    // CALL_PHONE / MANAGE_OWN_CALLS into a shipping listing.
    //
    // Verify after changing this by reading the MERGED manifest, not this file:
    //   cd android && ./gradlew processReleaseMainManifest
    //   grep -i billing app/build/intermediates/merged_manifests/release/AndroidManifest.xml
    // Expect zero hits.
    // Meta ad-conversion SDK: Android only for now. On iOS it must wait for Apple's App
    // Tracking Transparency prompt, and it needs FacebookAppID etc. in Info.plist — linking
    // the pod without those is a startup risk on a build that is not live yet anyway.
    // src/utils/adTracking.js already no-ops when the native module is absent.
    'react-native-fbsdk-next': {
      platforms: {
        ios: null,
      },
    },
    // Firebase Analytics, for Google Ads conversions. Android only for the same reason
    // as the Meta SDK above: iOS ad measurement waits for the ATT prompt.
    '@react-native-firebase/analytics': {
      platforms: {
        ios: null,
      },
    },
    'react-native-iap': {
      platforms: {
        android: null,
      },
    },
  },
};
