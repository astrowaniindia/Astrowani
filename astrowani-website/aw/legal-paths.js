/**
 * THE LEGAL PAGES KEEP THEIR WORDPRESS ADDRESSES. One list, used everywhere.
 *
 * Owner's decision, 2026-11-20 (launch day): the policy pages must answer at
 * exactly the addresses astrowani.com has always used — /privacy-policy/,
 * /term_conditions/ and so on — and NOT redirect to a new .html address. Those
 * URLs are written into both apps, App Store Connect, Play Console (privacy,
 * account deletion, child safety) and the Meta developer app, and the point is
 * that none of them ever has to change. So the page IS the old address; the
 * .html file is only how it is stored.
 *
 *   file on disk (key)            public address (value, relative to the site root)
 *
 * Hindi versions follow the same shape under /hi/ (hi/privacy-policy/ serves
 * hi/privacy-policy.html).
 *
 * Who reads this list — change it here and they all follow:
 *   aw/apply-seo.js        canonical, og:url, hreflang, JSON-LD, and the <base>
 *   aw/apply-legal-links.js  every footer / in-page link to these pages
 *   dev-server.js          serves the addresses locally
 *   astrowani-backend/src/blogSitemap.js   the sitemap
 *   vps-deployment/scripts/indexnow-submit.js
 *   vps-deployment/scripts/check-wordpress-redirects.js (asserts nginx agrees)
 *
 * nginx cannot require() a JS file, so vps-deployment/nginx/astrowani-site.conf
 * and wordpress-redirects.conf spell the same seven out by hand; the redirect
 * checker fails if either one disagrees with this list.
 *
 * WHY EACH PAGE CARRIES A <base>. A page served at /privacy-policy/ resolves its
 * relative links (style.css, aw/…, assets/…) one folder too deep. apply-seo.js
 * writes <base href="/"> (or "/hi/") as the first thing in <head> of exactly
 * these pages, which makes those links resolve the same whether the file is
 * opened at /privacy-policy/ or at /privacy-policy.html.
 */
const LEGAL_PATHS = {
  'privacy-policy.html': 'privacy-policy/',
  'terms-and-conditions.html': 'term_conditions/',
  'refund-cancellation.html': 'refund_cancellation/',
  'delete-account.html': 'delete-account/',
  'child-safety.html': 'child-safety/',
  'safety-guidelines.html': 'safety-guidelines/',
  'report-vulnerability.html': 'report-vulnerability/',
};

/**
 * The public address of a page, relative to the site root, for a file path
 * relative to the website directory ('privacy-policy.html', 'hi/vastu.html').
 * Anything that is not a legal page keeps its file name.
 */
function publicPath(rel) {
  const hi = rel.startsWith('hi/');
  const file = hi ? rel.slice(3) : rel;
  if (!LEGAL_PATHS[file]) return rel;
  return `${hi ? 'hi/' : ''}${LEGAL_PATHS[file]}`;
}

/** The reverse: a request path ('/hi/term_conditions/') -> its file, or null. */
function fileForPath(urlPath) {
  const p = urlPath.replace(/^\/+/, '');
  const hi = p.startsWith('hi/');
  const rest = hi ? p.slice(3) : p;
  const file = Object.keys(LEGAL_PATHS).find((f) => LEGAL_PATHS[f] === rest);
  return file ? `${hi ? 'hi/' : ''}${file}` : null;
}

module.exports = { LEGAL_PATHS, publicPath, fileForPath };
