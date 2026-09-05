// New file, added with the iOS CallKit/PushKit work (CLAUDE.md iOS port, Phase 4).
//
// THE ONLY REASON THIS FILE EXISTS: to keep react-native-callkeep OFF Android.
//
// CallKeep ships an Android ConnectionService whose AndroidManifest.xml declares
// CALL_PHONE, READ_PHONE_STATE, READ_PHONE_NUMBERS and MANAGE_OWN_CALLS. Android
// manifest merging would pull all four into this app, which currently ships with
// none of them. That means new sensitive permissions appearing on a live Play Store
// listing — CALL_PHONE and the phone-number permissions require their own Play
// Console declarations and can trigger a policy review — on an app whose Android
// call flow already works fine via the FCM data push + CallForegroundService
// (microphone foreground service) path documented in CLAUDE.md subsystem AE.
//
// CallKit is an iOS-only problem: iOS cannot ring a killed app from a data push,
// Android can. So CallKeep is scoped to iOS and the Android build is left exactly
// as it was.
//
// react-native-voip-push-notification needs no entry here — it ships no android/
// directory at all, so there is nothing for autolinking to pick up.
//
// NOTE: this file previously did not exist in this app. Adding it does NOT change
// any other autolinking or asset behaviour: only the keys named below are
// overridden, everything else keeps its default. (Unlike the customer app, this app
// bundles no custom fonts, so there is deliberately no `assets` key.)
module.exports = {
  dependencies: {
    'react-native-callkeep': {
      platforms: {
        android: null,
      },
    },

    // The otpless-react-native entry that used to sit here is GONE (2026-09-05),
    // together with the dependency itself. It noted that "the real fix is removing
    // the dependency from package.json, which is an Android-affecting change and so
    // is left as a separate decision" — that decision has now been made and verified:
    // the package was dead code (its only importer, src/utils/startOtpVerification.js,
    // was imported by nothing), it carried all four of this app's critical npm
    // advisories via minimist -> optimist -> ts-lint, and `assembleRelease` succeeds
    // without it. Removing it also dropped ACCESS_WIFI_STATE, CHANGE_WIFI_STATE,
    // CHANGE_NETWORK_STATE and GET_SIGNATURES out of the merged manifest, which the
    // OTPLESS SDK was contributing.
  },
};
