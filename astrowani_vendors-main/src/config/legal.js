// Policy pages, maintained on the marketing site rather than duplicated as in-app
// screens so they cannot go stale here when legal/support updates the real page.
//
// Deliberately a per-app copy rather than a shared module: the two React Native
// apps have no common source root, so a "shared" file would have to be reached
// through a relative path out of one app and into the other, which breaks Metro's
// watch roots. Keep the URLs in sync by hand when they change.
export const LEGAL_LINKS = {
  termsOfUse: 'https://astrowani.com/term_conditions/',
  privacyPolicy: 'https://astrowani.com/privacy-policy/',
};

export default LEGAL_LINKS;
