// Policy pages, maintained on the marketing site rather than duplicated as in-app
// screens so they cannot go stale here when legal/support updates the real page.
//
// Lives in config/ rather than inside Settings.js because the sign-up screens now
// link the same Terms and Privacy pages for the acceptance checkbox, and two
// copies of a legal URL is one copy too many — a page that moves must move once.
export const LEGAL_LINKS = {
  termsOfUse: 'https://astrowani.com/term_conditions/',
  privacyPolicy: 'https://astrowani.com/privacy-policy/',
  refundCancellation: 'https://astrowani.com/refund_cancellation/',
  childSafety: 'https://astrowani.com/child-safety/',
  safetyGuidelines: 'https://astrowani.com/safety-guidelines/',
  reportVulnerability: 'https://astrowani.com/report-vulnerability/',
};

export default LEGAL_LINKS;
