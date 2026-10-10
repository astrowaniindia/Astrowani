// ⚠️ TEMP LOCAL TESTING — PUT THIS BACK TO 'https://backend.astrowani.com' BEFORE ANY
// BUILD, COMMIT OR OTA. 10.0.2.2 is the emulator's route to this machine; it points at
// `node --env-file=.env scripts/devServer.js` on PORT=4501, which is running the
// campaign-astrologer routing that production does not have yet. On a real device, or
// with that server stopped, every request simply fails.
export const SOCKET_URL = __DEV__
  ? 'http://10.0.2.2:4501'
  : 'https://backend.astrowani.com';
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

// Official social profiles, shown as the "Connect with us" row in the drawer.
//
// Before 2026-10-02 that row rendered five icons with NO onPress at all — tapping
// any of them did nothing. Same class of bug as the old fake "Delete account"
// button and the dead signup photo picker: a control that looks real and isn't.
// The icons are now driven by this list and actually open the profile.
//
// WhatsApp was removed from the row on the owner's instruction. Note that is only
// the SOCIAL icon — WhatsApp remains a real support/ordering channel elsewhere
// (the shop's "Message us", useWhatsAppShop, the backend's whatsapp* modules).
// Do not remove those.
//
// Icons are FontAwesome6 BRAND glyphs, so X gets its real logo rather than the
// retired bird. FontAwesome6_Brands.ttf is bundled by react-native-vector-icons'
// fonts.gradle (neither app overrides iconFontNames, so the default "*.ttf"
// copies every font) and was confirmed present in both apps' existing builds —
// which is why this ships over OTA and needs no store release.
//
// AN ENTRY WITH AN EMPTY url IS SKIPPED, deliberately — same convention as
// APP_STORE_URL above. Better no icon than an icon that does nothing.
export const SOCIAL_LINKS = [
  { key: 'facebook', icon: 'facebook', color: '#1877F2', label: 'Facebook',
    url: 'https://www.facebook.com/jyotishjagrati' },
  { key: 'instagram', icon: 'instagram', color: '#C13584', label: 'Instagram',
    url: 'https://www.instagram.com/astrowani_official/' },
  { key: 'x', icon: 'x-twitter', color: '#000000', label: 'X',
    url: 'https://x.com/astrowani_' },
  { key: 'linkedin', icon: 'linkedin', color: '#0A66C2', label: 'LinkedIn',
    url: 'https://www.linkedin.com/company/astrowani/' },
  { key: 'youtube', icon: 'youtube', color: '#FF0000', label: 'YouTube',
    url: 'https://www.youtube.com/@Astrowani' },
].filter((s) => s.url);

