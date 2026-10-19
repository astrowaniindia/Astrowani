// Which platform this install is, as the backend's login endpoint wants it.
//
// WHY A FILE FOR ONE LINE. Three screens post to /api/users/mobile-otp-verify
// (SignupGatePopup, OtpScreen/VerifyOtp, OtpScreen/OtpScreen) and ALL THREE have to
// send this, or a customer's platform goes unrecorded depending only on which screen
// they happened to come through — the login screen creates accounts too. One constant
// imported three times is how that stays true when a fourth entry point appears.
//
// It also keeps `Platform.OS` out of the screens, the same discipline utils/payments.js
// and utils/featureFlags.js already enforce: a platform check scattered through screens
// is how iOS/Android differences become invisible and drift.
//
// The backend records this on `customers.platform` (rewritten every login) and
// `customers.signup_platform` (written once, at account creation) — see
// astrowani-backend/sql/customer_platform.sql. It is what lets the admin dashboard tell
// iPhone customers from Android ones, which nothing could do before the App Store
// launch, and it is NOT backfillable, so it has to be in place before the first iPhone
// signs up.
//
// Pure JS: this reaches installed builds by OTA, with no store release.
import { Platform } from 'react-native';

/**
 * 'ios' | 'android' — the two values the backend's whitelist and the database CHECK
 * accept (src/devicePlatform.js, sql/customer_platform.sql).
 *
 * Normalised to exactly these two rather than passed through raw: React Native reports
 * 'windows' / 'macos' / 'web' on platforms we do not ship, and the backend would store
 * any of those as 'unknown'. Collapsing here means the column only ever holds something
 * meaningful. Mirrors the vendor app's deviceInfoPayload() in src/utils/deviceId.js.
 */
export const DEVICE_PLATFORM = Platform.OS === 'ios' ? 'ios' : 'android';
