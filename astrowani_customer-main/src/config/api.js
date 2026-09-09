export const SOCKET_URL = 'https://backend.astrowani.com';
export const FREE_SERVICES_URL = SOCKET_URL;

// Public Play Store listing for this app. Used by all three share paths — the
// drawer's "Share app", ReferAndEarnScreen, and ReferralPromptHost — which each
// had (or in the drawer's case, were missing) their own copy of this URL. One
// constant so a package-name change is a single edit.
// Must match `applicationId` in android/app/build.gradle (com.astrowanicustomer).
export const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=com.astrowanicustomer';

// iOS counterpart of PLAY_STORE_URL. EMPTY UNTIL THE APP STORE LISTING EXISTS.
//
// The share message labels each platform and adds the iPhone line ONLY when this
// is set, so today a recipient sees just the working Android link. A placeholder
// or a guessed URL would be worse than omitting it — this text goes to strangers,
// and a dead App Store link reads as a broken app.
//
// To turn it on: after the app record is created in App Store Connect, set this to
//     https://apps.apple.com/app/id<APPLE_ID>
// using the numeric id from that record (the same one APPLE_IAP_APP_APPLE_ID needs
// on the backend). Nothing else has to change — both apps pick it up.
export const APP_STORE_URL = '';

