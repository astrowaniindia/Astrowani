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

