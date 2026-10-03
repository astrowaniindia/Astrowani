// Features switched off on iOS for the FIRST App Store build (decided 2026-09-16).
// Android is unaffected. See also DIGITAL_PURCHASES_ENABLED in utils/payments.js.
import { Platform } from 'react-native';

/**
 * The free 5-minute welcome chat. Its replies come from Google Gemini while the
 * offer presents a named astrologer persona and sends the customer's birth
 * details to that model, with no AI disclosure or consent screen. App Review
 * rejects that (Guideline 5.1.2(i): disclose and get permission before sharing
 * personal data with third-party AI). Hidden on iOS until the offer is labelled
 * as AI and asks for consent.
 */
export const FREE_BOT_CHAT_ENABLED = Platform.OS !== 'ios';

// ── Post-free-call prompts, all switched OFF (owner, 2026-10-03) ───────────────
//
// When an 11-minute free intro call ends, the customer used to be walked through up to
// four modals in a row: "want to keep talking?" (with a 90-second countdown, then the
// priced 5 / 10 / 15 minute options), "did you like the call?", the Dakshina ask, and
// finally "would you rate us?". The owner wants the moment the call ends to be the end
// of it — the customer goes straight Home and nothing is asked of them.
//
// HIDDEN, NOT DELETED. Every component, endpoint and backend route stays exactly where
// it is; these flags are the only thing in the way, so each one can be brought back on
// its own. The server-side reservation that backs the continue sheet is turned off to
// match, in sessionManager's UPSELL_SHEET_ENABLED — leaving it on would hold the
// astrologer busy for ninety seconds after every free call for a sheet nobody sees.
//
// Platform-independent: unlike the flag above, this is a product decision, not an App
// Review one, so it applies on Android and iOS alike.

/** The "5 / 10 / 15 more minutes" sheet, and its "we've held your place" countdown. */
export const FREE_CALL_CONTINUE_ENABLED = false;

/** "Did you like the free call?" — the yes/no gate in front of the Dakshina ask. */
export const CALL_FEEDBACK_PROMPT_ENABLED = false;

/**
 * The Dakshina (thank-you payment) sheet raised after a free call. Superseded by
 * SHAGUN_RECHARGE_ENABLED below (owner, 2026-10-03) — kept OFF and kept in the codebase
 * rather than deleted, since both call the same backend and either can be the one shown.
 */
export const DAKSHINA_PROMPT_ENABLED = false;

/**
 * "Shagun Recharge" (owner, 2026-10-03) — the new post-free-call thank-you ask, a 3x3
 * grid of fixed amounts (₹11 through ₹5100) plus the astrologer's avatar and a short
 * Hinglish note, replacing Dakshina's three-row sheet for this moment. Same backend
 * endpoints as Dakshina (astrowani-backend/src/dakshinaRoutes.js) — see
 * components/ShagunRechargePrompt.js for why this is a new skin, not a new payment path.
 */
export const SHAGUN_RECHARGE_ENABLED = true;

/**
 * The "thanks — would you share a review?" star card, AFTER A FREE CALL ONLY.
 * The prompt itself is untouched elsewhere: an admin can still raise it deliberately
 * from the dashboard (socket `show_review_popup`) or by a push the customer taps.
 */
export const FREE_CALL_RATING_PROMPT_ENABLED = false;
