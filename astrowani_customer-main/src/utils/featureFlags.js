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
