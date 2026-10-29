#!/usr/bin/env node
/**
 * Write the SEO head block into every page.
 *
 *   node aw/apply-seo.js            # apply
 *   node aw/apply-seo.js --check    # report what would change, write nothing
 *
 * ============================================================================
 * THE DOMAIN LIVES IN ONE PLACE: SITE_BASE, below.
 *
 * The site is served from a test path today and moves to its real domain at
 * launch. Every canonical, every og:url and every JSON-LD @id is built from
 * SITE_BASE, so the move is: change that one line, re-run this script, commit.
 * Nothing else in any of the 24 pages hard-codes a domain.
 *
 * That is the whole reason this is a script and not 24 hand-edited <head>
 * blocks. A canonical tag pointing at the wrong host is worse than no canonical
 * at all — it tells Google the real page lives somewhere else.
 * ============================================================================
 *
 * WHAT IT WRITES, and why each one is here (audited 2026-10-29, see
 * `MD files/SEO-Audit-new-website-2026-10-29.md`):
 *
 *   canonical    — there was none on any page, and / and /index.html both
 *                  return 200, so Google had to guess which to index.
 *   description  — 22 of 24 pages had none.
 *   og:* / twitter:* — none anywhere, so every WhatsApp share was a bare link.
 *   robots       — only on the four pages that must NOT be indexed.
 *   theme-color, icons, manifest — none existed.
 *
 * IDEMPOTENT. Everything goes between SEO:START / SEO:END markers and is
 * replaced wholesale on each run, so running it twice changes nothing and
 * running it after editing this file updates every page.
 *
 * DESCRIPTIONS ARE INTERIM. They were written from each page's own H1 and lead
 * paragraph so they are accurate, but they are not keyword-researched. When the
 * keyword list arrives, edit them HERE and re-run — never in the HTML, or the
 * next run overwrites them.
 */

const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// CHANGE THIS ONE LINE AT LAUNCH, then re-run. No trailing slash.
const SITE_BASE = 'https://shop.astrowani.com/test-site';
// ---------------------------------------------------------------------------

const SITE_NAME = 'Astrowani';
const LOCALE = 'en_IN';
const THEME = '#592A19';
const OG_DEFAULT = 'assets/og-default.jpg';

const ROOT = path.join(__dirname, '..');

/**
 * `desc` is the meta description. `noindex` keeps a page out of search while
 * still letting crawlers follow its links. `type` is og:type.
 *
 * NOINDEX, and why each one:
 *   wallet.html        per-user, behind a login, different for every visitor.
 *   chat.html/call.html  these are the LIVE CONSULTATION SCREENS, not landing
 *                      pages — their entire content is "Connecting… / Mute /
 *                      End". robots.txt used to claim the opposite and the
 *                      sitemap submitted them, so Google could serve a page
 *                      reading "Connecting…" for "chat with an astrologer".
 *                      The real landing page is consult.html.
 *   concept-hero.html  a leftover design experiment, reachable but unlinked.
 */
const PAGES = {
  'index.html': {
    desc: "Chat, call or video with India's verified astrologers for love, career, marriage and family guidance — in your own language, available around the clock.",
  },
  'about.html': {
    desc: 'Why Astrowani is different: a proper first consultation with a verified astrologer, instead of a rushed free reading that leaves you with more questions.',
  },
  'astrologers.html': {
    desc: 'Browse every verified astrologer on Astrowani. Each one is reviewed before they can take consultations — filter by what you need help with.',
  },
  'blog.html': {
    desc: 'Astrology articles from the Astrowani team — doshas, remedies, muhurats and everyday guidance, explained plainly and without scare tactics.',
  },
  'blog-post.html': {
    // aw/blog.js overwrites title, description, canonical and og:* per article
    // once the slug loads. This is only the fallback a crawler sees first.
    desc: 'Astrology articles from the Astrowani team — doshas, remedies, muhurats and everyday guidance, explained plainly.',
    type: 'article',
  },
  'book-call.html': {
    desc: 'Book a consultation with a verified astrologer. Choose who you want to speak to, pick chat, call or video, and connect from the Astrowani app.',
  },
  'calculators.html': {
    desc: "Free astrology calculators — instant, real calculations for the ones that don't need a full birth chart, and an honest note on the ones that do.",
  },
  'consult.html': {
    desc: 'Chat, call or video with a verified astrologer on Astrowani. Pick someone available right now and start a one-to-one consultation.',
  },
  'courses.html': {
    desc: "Learn astrology from Astrowani's own verified astrologers — structured courses from first principles through to advanced remedies.",
  },
  'free-services.html': {
    desc: 'Free astrology services on Astrowani — kundli, kundali matching and more. Try the quick versions free here, or get the full reading in the app.',
  },
  'horoscope.html': {
    desc: 'Daily, weekly, monthly and yearly horoscope for every zodiac sign — written for real life, not vague predictions.',
  },
  'marriage.html': {
    desc: 'Kundali matching for marriage — traditional Ashtakoot Guna Milan, read and explained by a real astrologer rather than reduced to a compatibility score.',
  },
  'panchang.html': {
    desc: "Today's Panchang — tithi, nakshatra, yoga, karana and the day's auspicious and inauspicious timings, updated every day.",
  },
  'delete-account.html': {
    desc: 'How to delete your Astrowani account and what happens to your data afterwards, for both the customer app and the astrologer app.',
  },
  'privacy-policy.html': {
    desc: 'How Astrowani collects, uses and protects your personal data, who it is shared with, and the choices you have over it.',
  },
  'terms-and-conditions.html': {
    desc: "The terms governing your use of Astrowani's apps, website and consultations, including payments, refunds and acceptable conduct.",
  },
  'refund-cancellation.html': {
    desc: "Astrowani's refund and cancellation policy for consultations, wallet recharges and Wani Shop orders, and how to raise a request.",
  },
  'safety-guidelines.html': {
    desc: 'Safety guidelines for everyone on Astrowani — what is expected, what is not allowed, and how to report a problem with a consultation.',
  },
  'child-safety.html': {
    desc: "Astrowani's child safety standards and zero-tolerance policy on child sexual abuse and exploitation, with reporting contacts.",
  },
  'report-vulnerability.html': {
    desc: 'Report a security vulnerability in Astrowani responsibly — what to send, where to send it, and what to expect back from us.',
  },
  'wallet.html': { desc: 'Your Astrowani wallet.', noindex: true },
  'chat.html': { desc: 'Astrowani consultation.', noindex: true },
  'call.html': { desc: 'Astrowani consultation.', noindex: true },
  'concept-hero.html': { desc: 'Astrowani design concept.', noindex: true },
};

const START = '<!-- SEO:START — generated by aw/apply-seo.js. Do not edit here; edit that file and re-run. -->';
const END = '<!-- SEO:END -->';

const esc = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Strip tags and entities from the page's own <title> so og:title reads cleanly. */
function titleOf(html) {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!m) return SITE_NAME;
  return m[1].replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();
}

function block(file, cfg, html) {
  // index.html canonicalises to the bare directory, so / and /index.html agree
  // on one address rather than competing.
  const url = file === 'index.html' ? `${SITE_BASE}/` : `${SITE_BASE}/${file}`;
  const title = titleOf(html);
  const desc = cfg.desc;
  const img = `${SITE_BASE}/${cfg.ogImage || OG_DEFAULT}`;
  const lines = [
    START,
    `<link rel="canonical" href="${url}">`,
    `<meta name="description" content="${esc(desc)}">`,
  ];
  if (cfg.noindex) lines.push('<meta name="robots" content="noindex, follow">');
  lines.push(
    `<meta name="theme-color" content="${THEME}">`,
    `<meta property="og:type" content="${cfg.type || 'website'}">`,
    `<meta property="og:site_name" content="${SITE_NAME}">`,
    `<meta property="og:locale" content="${LOCALE}">`,
    `<meta property="og:title" content="${esc(title)}">`,
    `<meta property="og:description" content="${esc(desc)}">`,
    `<meta property="og:url" content="${url}">`,
    `<meta property="og:image" content="${img}">`,
    `<meta property="og:image:width" content="1200">`,
    `<meta property="og:image:height" content="630">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:title" content="${esc(title)}">`,
    `<meta name="twitter:description" content="${esc(desc)}">`,
    `<meta name="twitter:image" content="${img}">`,
    `<link rel="icon" href="assets/favicon-32.png" sizes="32x32">`,
    `<link rel="icon" href="assets/favicon-16.png" sizes="16x16">`,
    `<link rel="apple-touch-icon" href="assets/apple-touch-icon.png">`,
    `<link rel="manifest" href="site.webmanifest">`,
    END,
  );
  return lines.join('\n');
}

const check = process.argv.includes('--check');
let changed = 0, skipped = [];

for (const [file, cfg] of Object.entries(PAGES)) {
  const p = path.join(ROOT, file);
  if (!fs.existsSync(p)) { skipped.push(file); continue; }
  let html = fs.readFileSync(p, 'utf8');
  const fresh = block(file, cfg, html);

  const re = new RegExp(`${START.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s\\S]*?${END}`);
  let next;
  if (re.test(html)) {
    next = html.replace(re, fresh);
  } else {
    // First run: drop it in straight after </title>, which every page has.
    if (!/<\/title>/i.test(html)) { skipped.push(`${file} (no <title>)`); continue; }
    next = html.replace(/<\/title>/i, `</title>\n${fresh}`);
    // The old 522 KB favicon line is superseded by the icons in the block.
    next = next.replace(/\n?<link rel="icon" href="assets\/logo\.png">/i, '');
  }

  if (next !== html) {
    changed++;
    if (!check) fs.writeFileSync(p, next);
    console.log(`${check ? 'would update' : 'updated'}  ${file}`);
  }
}

const missing = Object.keys(PAGES).filter((f) => !fs.existsSync(path.join(ROOT, f)));
const unlisted = fs.readdirSync(ROOT).filter((f) => f.endsWith('.html') && !PAGES[f]);

console.log(`\n${check ? 'would change' : 'changed'}: ${changed} page(s)`);
if (missing.length) console.log('listed here but not on disk:', missing.join(', '));
// A page on disk with no entry here silently gets no canonical and no
// description — exactly the state this script exists to end. Fail loudly.
if (unlisted.length) {
  console.error('\nERROR: these pages exist but are not in PAGES, so they got nothing:');
  unlisted.forEach((f) => console.error('   ' + f));
  process.exit(1);
}
if (skipped.length) console.log('skipped:', skipped.join(', '));
console.log(`SITE_BASE = ${SITE_BASE}`);
