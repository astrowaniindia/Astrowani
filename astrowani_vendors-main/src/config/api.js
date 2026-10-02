export const SOCKET_URL = 'https://backend.astrowani.com';


// The CUSTOMER app's Play Store listing, not this one.
//
// This is the link an astrologer sends out when sharing their profile (see
// utils/shareAstrologerProfile.js). The recipient is a prospective client, so
// pointing them at the astrologer app would send them to the wrong side of the
// marketplace -- they would land on a sign-up for astrologers.
//
// Must match `applicationId` in the CUSTOMER app's android/app/build.gradle
// (com.astrowanicustomer), and is deliberately the same string as
// astrowani_customer-main/src/config/api.js PLAY_STORE_URL.
export const CUSTOMER_PLAY_STORE_URL =
  'https://play.google.com/store/apps/details?id=com.astrowanicustomer';

// iOS counterpart of CUSTOMER_PLAY_STORE_URL. EMPTY UNTIL THE LISTING EXISTS, and
// deliberately the same string as the customer app's APP_STORE_URL.
// See that file for why a placeholder is not used.
export const CUSTOMER_APP_STORE_URL = '';

// Official social profiles, shown as the "Follow us" row in the drawer.
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
// CUSTOMER_APP_STORE_URL above. Better no icon than an icon that does nothing.
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

