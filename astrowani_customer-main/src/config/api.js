export const SOCKET_URL = 'https://backend.astrowani.com';
export const FREE_SERVICES_URL = SOCKET_URL;

// Public Play Store listing for this app. Used by all three share paths — the
// drawer's "Share app", ReferAndEarnScreen, and ReferralPromptHost — which each
// had (or in the drawer's case, were missing) their own copy of this URL. One
// constant so a package-name change is a single edit.
// Must match `applicationId` in android/app/build.gradle (com.astrowanicustomer).
export const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=com.astrowanicustomer';
