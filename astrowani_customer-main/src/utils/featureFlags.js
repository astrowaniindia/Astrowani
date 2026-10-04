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

// ── Post-free-call prompts (owner, rewritten 2026-10-04) ──────────────────────
//
// THE ORDER AFTER AN 11-MINUTE FREE CALL, and it is deliberate:
//
//     Shagun Arpan  ->  [ more minutes, ONLY if the call ran >= 9 min ]  ->  rate us
//
// Shagun is ALWAYS first, whatever the call's length and whoever hung up. Paying ends
// with a thank-you the customer dismisses themselves; pressing ✕ moves straight on. The
// "more minutes" sheet is the only conditional step. Rating is always last, and 1-3
// stars apologises while 4-5 offers the Play Store (components/RateAstrowaniPrompt).
//
// These were all switched off on 2026-10-03 — the owner wanted the call simply to end —
// and brought back in this order on 2026-10-04. "Did you like the call?" was NOT brought
// back: it used to gate the Dakshina ask, and Shagun now comes first unconditionally, so
// it has no place left in the chain.
//
// Platform-independent: unlike the flag above, this is a product decision, not an App
// Review one, so it applies on Android and iOS alike.

/**
 * The "5 / 10 / 15 more minutes" sheet, and its decision countdown.
 *
 * Shown ONLY after a call of MIN_UPSELL_SECONDS (9 min) or more — see VoiceCallScreen.
 * The countdown is a real server-side reservation, not decoration: it takes the
 * astrologer off the market. Because Shagun now runs first and can take a minute of
 * Razorpay, that hold is created when THIS sheet opens rather than when the call ends
 * (owner's decision, 2026-10-04) — see /api/free-call/continue/options.
 */
export const FREE_CALL_CONTINUE_ENABLED = true;

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
 *
 * ALWAYS THE LAST STEP of the post-call chain, reached from Shagun (paid or dismissed)
 * or from the "more minutes" sheet being declined.
 */
export const FREE_CALL_RATING_PROMPT_ENABLED = true;
