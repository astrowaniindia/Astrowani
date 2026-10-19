// Which store link a share message may carry, on THIS platform.
//
// ── WHY THIS IS NOT JUST `PLAY_STORE_URL` ─────────────────────────────────────
// App Store Guideline 2.3.10 forbids naming or linking another mobile platform
// from inside the app. The drawer's "Share app", ReferAndEarnScreen and
// ReferralPromptHost all pasted PLAY_STORE_URL straight into their message with
// no platform check, so on an iPhone the share sheet handed a `play.google.com`
// URL to the recipient — and all three are one tap from the drawer, which is
// exactly where a reviewer pokes around. fc0e5d74 closed the same hole in the
// post-call rating card; these three were never covered because they import the
// constant directly rather than going through appPrompts.
//
// ── WHY iOS RETURNS NOTHING TODAY, RATHER THAN A GUESS ────────────────────────
// APP_STORE_URL is deliberately empty until the App Store Connect record exists
// (see config/api.js). This text goes to strangers, so a placeholder or a guessed
// id reads as a broken app — worse than a message with no link. Callers therefore
// have to cope with '' and drop their "download:" clause, which is a visible,
// correct message rather than a dangling colon.
//
// Once APP_STORE_URL is filled in, every caller starts carrying the iPhone link
// with no further change here or in them.
//
// ── NOT the same job as utils/shareAstrologerProfile.js ───────────────────────
// That file builds a message for a RECIPIENT who may be on either platform, so it
// labels both links ("Android: …", "iPhone: …") and is right to send the Play link
// from an iPhone — a labelled cross-platform link list is what a referral actually
// needs. It is i18n-keyed and profile-specific. These three callers are plain
// one-line English messages, so they get the single link for the sender's own
// platform instead of a second copy of that logic.
import { Platform } from 'react-native';

import { PLAY_STORE_URL, APP_STORE_URL } from '../config/api';

/**
 * The store URL this platform's share messages may include.
 *
 * @returns {string} the listing URL, or '' when there is none to offer yet
 *                   (iOS, until APP_STORE_URL is set). Always check before
 *                   interpolating it into a sentence.
 */
export function shareDownloadUrl() {
  return Platform.OS === 'ios' ? APP_STORE_URL || '' : PLAY_STORE_URL;
}

export default shareDownloadUrl;
