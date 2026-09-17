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
    // Meta + Google Ads conversion SDKs — currently OFF on BOTH platforms (2026-09-14).
    //
    // Android: held back from store build 38 at the owner's request, until the Meta App
    // ID / Client Token exist and Play Console's Advertising ID + Data safety declarations
    // are done (CLAUDE.md CH). Linked, they merge com.google.android.gms.permission.AD_ID
    // into the manifest, and Play blocks a release that uses it undeclared. To switch them
    // on: delete the `android: null` lines, fill the ids (strings.xml + adTracking.js),
    // then a new STORE build — the ids are a native resource, so not OTA-able.
    // iOS: must wait for Apple's App Tracking Transparency prompt (and Info.plist ids).
    //
    // src/utils/adTracking.js no-ops when these native modules are absent, and the
    // Facebook <meta-data> left in AndroidManifest.xml is inert without the SDK.
    // Meta: Android switched ON 2026-09-16 (build 41) — ids filled in.
    'react-native-fbsdk-next': {
      platforms: {
        ios: null,
      },
    },
    // Google (Firebase Analytics → Google Ads): Android switched ON 2026-09-17 (build 42),
    // after Google Ads 819-134-9882 was linked to the Analytics property.
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
