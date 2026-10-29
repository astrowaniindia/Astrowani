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
    title: 'Talk to Verified Astrologers Online | Astrowani',
    desc: "Chat, call or video with India's verified astrologers for love, career, marriage and family guidance — in your own language, available around the clock.",
  },
  'about.html': {
    title: 'About Astrowani — Verified Astrologers Online',
    desc: 'Why Astrowani is different: a proper first consultation with a verified astrologer, instead of a rushed free reading that leaves you with more questions.',
  },
  'astrologers.html': {
    title: 'Ask an Astrologer — Verified Astrologers | Astrowani',
    desc: 'Browse every verified astrologer on Astrowani. Each one is reviewed before they can take consultations — filter by what you need help with.',
  },
  'blog.html': {
    title: 'Astrology Blog — Kundli, Doshas & Remedies | Astrowani',
    desc: 'Astrology articles from the Astrowani team — doshas, remedies, muhurats and everyday guidance, explained plainly and without scare tactics.',
  },
  'blog-post.html': {
    // aw/blog.js overwrites title, description, canonical and og:* per article
    // once the slug loads. This is only the fallback a crawler sees first.
    desc: 'Astrology articles from the Astrowani team — doshas, remedies, muhurats and everyday guidance, explained plainly.',
    type: 'article',
  },
  'book-call.html': {
    title: 'Talk to an Astrologer by Phone or Chat | Astrowani',
    desc: 'Book a consultation with a verified astrologer. Choose who you want to speak to, pick chat, call or video, and connect from the Astrowani app.',
  },
  'calculators.html': {
    title: 'Free Astrology Calculators & Kundli Tools | Astrowani',
    desc: "Free astrology calculators — instant, real calculations for the ones that don't need a full birth chart, and an honest note on the ones that do.",
  },
  'consult.html': {
    title: 'Astrology Consultation Online — Chat, Call or Video',
    desc: 'Chat, call or video with a verified astrologer on Astrowani. Pick someone available right now and start a one-to-one consultation.',
  },
  'courses.html': {
    title: 'Learn Astrology — Online Courses | Astrowani',
    desc: "Learn astrology from Astrowani's own verified astrologers — structured courses from first principles through to advanced remedies.",
  },
  'free-services.html': {
    title: 'Free Kundli, Horoscope & Matching Tools | Astrowani',
    desc: 'Free astrology services on Astrowani — kundli, kundali matching and more. Try the quick versions free here, or get the full reading in the app.',
  },
  'horoscope.html': {
    title: 'Free Daily Horoscope by Zodiac Sign | Astrowani',
    desc: 'Daily, weekly, monthly and yearly horoscope for every zodiac sign — written for real life, not vague predictions.',
  },
  'marriage.html': {
    title: 'Online Kundli Matching for Marriage | Astrowani',
    desc: 'Kundali matching for marriage — traditional Ashtakoot Guna Milan, read and explained by a real astrologer rather than reduced to a compatibility score.',
  },
  'panchang.html': {
    title: "Today's Panchang & Online Muhurat | Astrowani",
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
  // A 404 page must never be indexed, and must still let a crawler follow its
  // links out. The HTML alone is not the fix: nginx has to SERVE it with a 404
  // status. Today any missing URL returns 200, which is what makes every typo an
  // indexable page. See the audit, section 1.3.
  '404.html': { desc: 'That page is not here. Find astrologers, horoscopes and consultations on Astrowani.', noindex: true },
  'wallet.html': { desc: 'Your Astrowani wallet.', noindex: true },
  'chat.html': { desc: 'Astrowani consultation.', noindex: true },
  'call.html': { desc: 'Astrowani consultation.', noindex: true },
  'concept-hero.html': { desc: 'Astrowani design concept.', noindex: true },
};

const START = '<!-- SEO:START — generated by aw/apply-seo.js. Do not edit here; edit that file and re-run. -->';
const END = '<!-- SEO:END -->';

/**
 * sameAs is DELIBERATELY ABSENT. It lists an organisation's other official
 * profiles, and a wrong one actively misinforms the knowledge graph. The live
 * WordPress site was checked on 2026-10-29 and carries no social profile links
 * at all — only a single YouTube *video*, which is not a channel. Add real
 * Facebook / Instagram / YouTube / LinkedIn profile URLs here when they exist.
 *
 * The address is likewise absent rather than guessed: LocalBusiness/PostalAddress
 * would be the stronger schema, but it needs ASTROWANIINDIA's registered address,
 * and publishing the wrong one is worse than publishing none.
 */
function orgGraph() {
  return {
    '@type': 'Organization',
    '@id': `${SITE_BASE}/#organization`,
    name: SITE_NAME,
    url: `${SITE_BASE}/`,
    logo: {
      '@type': 'ImageObject',
      '@id': `${SITE_BASE}/#logo`,
      url: `${SITE_BASE}/assets/logo.png`,
      width: 1024,
      height: 1024,
    },
    description: "Astrowani connects people with verified Indian astrologers for live one-to-one chat, voice and video consultations.",
    contactPoint: {
      '@type': 'ContactPoint',
      contactType: 'customer support',
      email: 'support@astrowani.com',
      areaServed: 'IN',
      availableLanguage: ['en', 'hi'],
    },
  };
}

function siteGraph() {
  return {
    '@type': 'WebSite',
    '@id': `${SITE_BASE}/#website`,
    url: `${SITE_BASE}/`,
    name: SITE_NAME,
    inLanguage: 'en-IN',
    publisher: { '@id': `${SITE_BASE}/#organization` },
  };
}

/**
 * Build BreadcrumbList from the trail the page ALREADY SHOWS, rather than from a
 * hand-kept list here. Every inner page renders
 *   <div class="crumb"><a href="index.html">Home</a> · Marriage</div>
 * and Google requires the structured trail to match the visible one — inventing
 * a different trail is a structured-data violation, not a clever shortcut. If a
 * page has no visible crumb it gets no BreadcrumbList, which is correct.
 */
function crumbGraph(file, html) {
  if (file === 'index.html') return null;
  const m = html.match(/<div class="crumb"[^>]*>([\s\S]*?)<\/div>/i);
  if (!m) return null;
  // Keep each crumb's own href where it has one. "Legal" on the policy pages is
  // a LABEL, not a page — it has no link because no such page exists. Giving it
  // the current page's URL would put two list items on the same URL, which
  // Google can reject the whole rich result over. An entry with no href simply
  // gets no `item`, which is also what the spec says to do for the final crumb.
  const inner = m[1];
  const marked = inner.replace(
    /<a\b[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi,
    (_, href, text) => `\u0001${href}\u0002${text.replace(/<[^>]+>/g, '')}\u0001`,
  );
  const parts = marked
    .replace(/<[^>]+>/g, '')
    .split(/\s*(?:·|›|»)\s*/)
    .map((raw) => {
      const t = raw.trim();
      const link = t.match(/^\u0001([^\u0002]*)\u0002([\s\S]*)\u0001$/);
      return link
        ? { name: link[2].trim(), href: link[1].trim() }
        : { name: t.replace(/[\u0001\u0002]/g, '').trim(), href: null };
    })
    .filter((p) => p.name);
  if (parts.length < 2) return null;

  return {
    '@type': 'BreadcrumbList',
    '@id': `${SITE_BASE}/${file}#breadcrumb`,
    itemListElement: parts.map((p, i) => {
      const node = { '@type': 'ListItem', position: i + 1, name: p.name };
      if (p.href) {
        node.item = p.href === 'index.html' ? `${SITE_BASE}/` : `${SITE_BASE}/${p.href}`;
      }
      return node;
    }),
  };
}

const esc = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * The page title. `cfg.title` wins where it is set, otherwise the page keeps the
 * one already in its HTML.
 *
 * TITLES ARE KEYWORD-LED, not section-led. Eleven of them used to read
 * "<Section> — Astrowani" and were under 30 characters against a usable ~60,
 * which spends the strongest on-page signal on the brand name. They now lead
 * with the phrase a person actually types, from the keyword list supplied
 * 2026-10-29, and keep the brand as a suffix.
 */
function titleOf(html, cfg) {
  if (cfg && cfg.title) return cfg.title;
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!m) return SITE_NAME;
  return m[1].replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();
}

function block(file, cfg, html) {
  // index.html canonicalises to the bare directory, so / and /index.html agree
  // on one address rather than competing.
  const url = file === 'index.html' ? `${SITE_BASE}/` : `${SITE_BASE}/${file}`;
  const title = titleOf(html, cfg);
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
  );

  // Structured data. One @graph rather than several separate blocks, so the
  // nodes can reference each other by @id — WebSite -> Organization, and the
  // breadcrumb alongside. There was none of this anywhere before.
  //
  // NOT emitted on the noindex pages: structured data for a page that must not
  // be indexed is pure noise.
  //
  // blog-post.html is also skipped, because aw/blog.js writes a real Article
  // graph for the loaded slug. Two Article-ish graphs on one page is worse than
  // one, and the per-article one is the accurate one.
  if (!cfg.noindex && file !== 'blog-post.html') {
    const graph = [orgGraph(), siteGraph()];
    const crumb = crumbGraph(file, html);
    if (crumb) graph.push(crumb);
    lines.push(
      '<script type="application/ld+json">',
      JSON.stringify({ '@context': 'https://schema.org', '@graph': graph }),
      '</script>',
    );
  }

  lines.push(END);
  return lines.join('\n');
}

const check = process.argv.includes('--check');
let changed = 0, skipped = [];

for (const [file, cfg] of Object.entries(PAGES)) {
  const p = path.join(ROOT, file);
  if (!fs.existsSync(p)) { skipped.push(file); continue; }
  const original = fs.readFileSync(p, 'utf8');
  let html = original;

  // Rewrite the <title> itself where PAGES sets one. Done BEFORE the block is
  // built so og:title and twitter:title pick up the same string — three places
  // claiming different titles for one page is its own problem.
  if (cfg.title) {
    const want = `<title>${cfg.title.replace(/&/g, '&amp;')}</title>`;
    if (/<title[^>]*>[\s\S]*?<\/title>/i.test(html)) {
      html = html.replace(/<title[^>]*>[\s\S]*?<\/title>/i, want);
    }
  }

  // Match the file's own line endings. git checks these files out with CRLF on
  // Windows, and a block written with LF makes every page differ on every run —
  // a 24-line diff per page, forever, for no actual change. Caught 2026-10-29
  // when a title-only edit reported 21 pages changed instead of 12.
  const eol = original.includes('\r\n') ? '\r\n' : '\n';
  const fresh = block(file, cfg, html).split('\n').join(eol);

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

  if (next !== original) {
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
