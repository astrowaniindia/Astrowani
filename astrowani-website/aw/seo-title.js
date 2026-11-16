'use strict';
/**
 * One rule for page titles, shared by apply-seo.js and the page generators so
 * they never disagree (if they did, every generator --check would report drift).
 *
 * Google shows about 60 characters of a title and rewrites longer ones. When a
 * title only runs over because of the " | Astrowani" suffix, the suffix goes and
 * the searched-for words stay. (SEO audit 2026-11-16.)
 */
const TITLE_MAX = 60;
const BRAND_SUFFIX = ' | Astrowani';
function fitTitle(t) {
  const s = String(t);
  return s.length > TITLE_MAX && s.endsWith(BRAND_SUFFIX) ? s.slice(0, -BRAND_SUFFIX.length).trim() : s;
}
module.exports = { fitTitle, TITLE_MAX, BRAND_SUFFIX };
