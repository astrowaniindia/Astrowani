const { firstFitting } = require('./seoTitle');
/**
 * Public website profile pages, one per astrologer: /astrologers/<slug>.
 *
 * ============================================================================
 * WHY. The website listed 58 real astrologers on one page and gave none of them
 * an address of their own, so nobody could find a specific astrologer by name in
 * a search engine, and a customer could not share or bookmark one. A profile page
 * is about one real person with their own bio, rates and reviews — which is the
 * honest version of the page type competitors have thousands of
 * (MD files/SEO-Growth-Gap-Analysis-2026-10-30.md, 1.5).
 *
 * Server-rendered, like the blog (src/blogPublic.js): rates, ratings and who is
 * visible change daily, so a static build would go stale, and a crawler must get
 * the real content in the first response.
 *
 * WHAT IS SHOWN, AND WHAT IS DELIBERATELY NOT:
 *  - VISIBILITY IS THE APP'S OWN RULE (src/astrologerVisibility.js). A pending,
 *    suspended, test/store-reviewer or incomplete profile is a 404 — never a
 *    public page — and drops out the moment the admin hides it.
 *  - Name, photo, experience, languages, specialities, bio, per-minute rates,
 *    rating and review text. NEVER email, phone, bank/UPI, earnings or notes —
 *    PROFILE_COLUMNS selects email only because the visibility rule checks it.
 *  - Reviews carry NO customer name. These pages are public and indexed; a
 *    customer who left a review in the app did not agree to their name being
 *    searchable next to an astrologer's.
 *  - Bio and review text pass through maskContacts, the same filter chat uses, so
 *    a phone number or handle typed into a bio is not published to the web.
 *  - The structured data is ProfilePage + Person, with NO aggregateRating. Google
 *    shows review stars only for products, businesses and similar types, never
 *    for a person, and dressing a profile up as a product to get them would be
 *    markup abuse. The rating is shown on the page itself.
 *
 * EVERY visible astrologer's page is indexed and in the sitemap — the owner's
 * decision on 2026-11-16. Many bios are short (median ~100 characters), so some
 * pages carry little unique text; the fallback "about" line built from the
 * profile's own facts is what fills them.
 *
 * THE SLUG is the name plus the first 6 characters of the id
 * (e.g. shyam-sundar-43a19a). The id part keeps it unique and stable when two
 * astrologers share a name; the name part is for people. If the name changes,
 * the old address 301s to the new one, because the id part still matches.
 * script.js builds the same slug for the listing cards — profileSlug() and
 * astroProfileSlug() must stay identical (scripts/testAstrologerProfiles.js
 * checks them against every live name).
 * ============================================================================
 */
const fs = require('fs');
const path = require('path');
const imageUrl = require('./imageUrl');
const { maskContacts } = require('./contactLeakDetector');
const { astrologerVisibleToCustomers } = require('./astrologerVisibility');
const { SITE_BASE } = require('./blogAgent/seo');

// What the page and the visibility rule read — nothing else. See the header.
const PROFILE_COLUMNS = [
  'id', 'first_name', 'last_name', 'email', 'gender', 'experience', 'languages', 'specialties',
  'bio', 'profile_pic_url', 'call_charge_per_minute', 'chat_charge_per_minute', 'video_charge_per_minute',
  'is_call_enabled', 'is_chat_enabled', 'is_video_call_enabled', 'average_rating', 'total_reviews',
  'approval_status', 'is_suspended', 'hidden_from_customers', 'badge', 'created_at',
].join(', ');

const CACHE_MS = 60 * 1000;
let cache = { at: 0, rows: null, cats: null };

const escape = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clean = (s) => maskContacts(String(s || '').replace(/\r/g, '').trim()).text;

/** The URL-safe slug. Mirrored by astroProfileSlug() in astrowani-website/script.js. */
function profileSlug(row) {
  const name = `${row.first_name || ''} ${row.last_name || ''}`
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60).replace(/-+$/, '');
  return `${name || 'astrologer'}-${String(row.id).slice(0, 6).toLowerCase()}`;
}

const profileUrl = (row, base = SITE_BASE) => `${base}/astrologers/${profileSlug(row)}`;

/** Every customer-visible astrologer, plus the category names. Cached for a minute. */
async function loadVisible(db) {
  if (cache.rows && Date.now() - cache.at < CACHE_MS) return cache;
  const [{ data, error }, { data: cats }] = await Promise.all([
    db.from('astrologers').select(PROFILE_COLUMNS)
      .eq('approval_status', 'approved').not('is_suspended', 'is', true).not('hidden_from_customers', 'is', true),
    db.from('categories').select('id, name'),
  ]);
  if (error) throw error;
  cache = {
    at: Date.now(),
    rows: (data || []).filter(astrologerVisibleToCustomers),
    cats: Object.fromEntries((cats || []).map((c) => [c.id, c.name])),
  };
  return cache;
}

/** The astrologer a slug names: by its id part, which survives a name change. */
function findBySlug(rows, slug) {
  const m = /-([0-9a-f]{6})$/.exec(String(slug || ''));
  if (!m) return null;
  const hits = rows.filter((r) => String(r.id).toLowerCase().startsWith(m[1]));
  if (hits.length === 1) return hits[0];
  // Two ids sharing six characters: only the exact slug may resolve, never a guess.
  return hits.find((r) => profileSlug(r) === slug) || null;
}

/** Up to 10 recent visible reviews that have text. Names are never selected. */
async function loadReviews(db, astrologerId) {
  const { data, error } = await db.from('reviews').select('rating, comment, created_at')
    .eq('astrologer_id', astrologerId).not('is_hidden', 'is', true)
    .order('created_at', { ascending: false }).limit(40);
  if (error) throw error;
  return (data || []).filter((r) => String(r.comment || '').trim().length >= 3).slice(0, 10);
}

function facts(row, cats) {
  const name = `${row.first_name || ''} ${row.last_name || ''}`.trim() || 'Astrologer';
  const specialties = (Array.isArray(row.specialties) ? row.specialties : []).map((id) => cats[id]).filter(Boolean);
  const languages = (Array.isArray(row.languages) ? row.languages : []).filter(Boolean);
  const rates = [
    row.is_chat_enabled && Number(row.chat_charge_per_minute) > 0 && ['Chat', Number(row.chat_charge_per_minute), `chat.html?astrologer=${encodeURIComponent(row.id)}`],
    row.is_call_enabled && Number(row.call_charge_per_minute) > 0 && ['Call', Number(row.call_charge_per_minute), `call.html?astrologer=${encodeURIComponent(row.id)}&type=audio`],
    row.is_video_call_enabled && Number(row.video_charge_per_minute) > 0 && ['Video call', Number(row.video_charge_per_minute), `call.html?astrologer=${encodeURIComponent(row.id)}&type=video`],
  ].filter(Boolean);
  const rating = Number(row.total_reviews) > 0 ? { value: Number(row.average_rating || 0).toFixed(1), count: Number(row.total_reviews) } : null;
  const photo = row.profile_pic_url && !String(row.profile_pic_url).startsWith('data:') ? imageUrl.avatarUrl(row.profile_pic_url) : null;
  return { name, specialties, languages, rates, rating, photo, years: Number(row.experience) || 0 };
}

/** The bio as paragraphs; when there is none, a factual line built from the profile. */
function aboutParagraphs(row, f) {
  const bio = clean(row.bio);
  if (bio.length >= 20) return bio.split(/\n{2,}|\n/).map((p) => p.trim()).filter(Boolean);
  const parts = [`${f.name} is a verified astrologer on Astrowani with ${f.years} year${f.years === 1 ? '' : 's'} of experience`];
  if (f.languages.length) parts.push(`consulting in ${f.languages.join(', ')}`);
  let line = parts.join(', ');
  if (f.specialties.length) line += `. Areas of practice: ${f.specialties.join(', ')}`;
  return [`${line}.`];
}

function fmtDate(v) {
  try { return new Date(v).toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' }); } catch (_) { return ''; }
}

const stars = (n) => '★'.repeat(Math.round(n)) + '☆'.repeat(5 - Math.round(n));

function renderProfile(shell, row, cats, reviews, { base = SITE_BASE } = {}) {
  base = base.replace(/\/$/, '');
  const f = facts(row, cats);
  const url = profileUrl(row, base);
  const about = aboutParagraphs(row, f);
  const summary = [f.specialties.slice(0, 3).join(', '), f.years ? `${f.years} years of experience` : '', f.languages.join(', ')].filter(Boolean).join(' · ');
  const title = firstFitting([
    f.specialties[0] ? `${f.name} — Astrologer for ${f.specialties[0]}` : '',
    `${f.name} — Astrologer`,
    f.name,
  ]);
  const desc = `${f.name}: ${summary}. ${about[0]}`.replace(/\s+/g, ' ').slice(0, 158);
  const image = f.photo || `${base}/assets/og-default.jpg`;

  const person = {
    '@type': 'Person', '@id': `${url}#person`, name: f.name, jobTitle: 'Astrologer', url,
    description: about.join(' ').slice(0, 500),
    ...(f.photo ? { image: f.photo } : {}),
    ...(f.languages.length ? { knowsLanguage: f.languages } : {}),
    ...(f.specialties.length ? { knowsAbout: f.specialties } : {}),
    worksFor: { '@id': `${base}/#organization` },
  };
  const graph = { '@context': 'https://schema.org', '@graph': [
    { '@type': 'ProfilePage', '@id': url, url, name: title, mainEntity: { '@id': `${url}#person` }, dateCreated: row.created_at },
    person,
    { '@type': 'BreadcrumbList', itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: `${base}/` },
      { '@type': 'ListItem', position: 2, name: 'Astrologers', item: `${base}/astrologers.html` },
      { '@type': 'ListItem', position: 3, name: f.name },
    ] },
  ] };
  const tags = [
    `<base href="${escape(`${base}/`)}">`,
    `<title>${escape(title)}</title>`,
    `<meta name="description" content="${escape(desc)}">`,
    `<link rel="canonical" href="${escape(url)}">`,
    `<meta property="og:type" content="profile">`,
    `<meta property="og:title" content="${escape(title)}">`,
    `<meta property="og:description" content="${escape(desc)}">`,
    `<meta property="og:url" content="${escape(url)}">`,
    `<meta property="og:image" content="${escape(image)}">`,
    `<meta name="twitter:card" content="summary">`,
    `<script type="application/ld+json">${JSON.stringify(graph).replace(/</g, '\\u003c')}</script>`,
  ];

  const P = 'style="font-size:15.5px; line-height:1.85; color:var(--ink-soft); margin:0 0 16px;"';
  const ratesHtml = f.rates.length
    ? f.rates.map(([label, price, href]) => `<a href="${escape(href)}" class="btn-gold magnetic" style="display:inline-block; padding:13px 22px; margin:0 10px 10px 0; font-size:15px;">${escape(label)} · &#8377;${escape(price)}/min</a>`).join('')
    : `<p ${P}>${escape(f.name)} is not taking consultations on the website right now. Other astrologers are available on the astrologers page.</p>`;
  const reviewsHtml = reviews.length
    ? reviews.map((r) => `<div style="padding:16px 0; border-bottom:1px solid rgba(89,42,25,.15);">
        <div style="color:var(--gold-deep); letter-spacing:2px;" aria-label="${escape(r.rating)} out of 5">${stars(Number(r.rating) || 0)}</div>
        <p style="font-size:15px; line-height:1.75; color:var(--ink); margin:6px 0 4px;">${escape(clean(r.comment))}</p>
        <div style="font-size:12.5px; color:var(--ink-soft);">Customer review · ${escape(fmtDate(r.created_at))}</div>
      </div>`).join('\n')
    : `<p ${P}>No written reviews yet.</p>`;

  const body = `<main id="content">
<div class="page-header">
  <div class="crumb"><a href="index.html" style="color:var(--gold);">Home</a> · <a href="astrologers.html" style="color:var(--gold);">Astrologers</a> · ${escape(f.name)}</div>
  ${f.photo ? `<img src="${escape(f.photo)}" alt="${escape(f.name)}" width="120" height="120" style="width:120px; height:120px; border-radius:50%; object-fit:cover; border:3px solid var(--gold); margin:10px auto 14px; display:block;">` : ''}
  <h1 class="serif">${escape(f.name)}</h1>
  <p>${escape(summary)}</p>
  ${f.rating ? `<p style="margin-top:8px;"><span style="color:var(--gold);">★</span> <strong>${escape(f.rating.value)}</strong> from ${escape(f.rating.count)} rating${f.rating.count === 1 ? '' : 's'}</p>` : `<p style="margin-top:8px;">New on Astrowani</p>`}
</div>

<div class="band">
  <div class="block" style="max-width:820px;">
    <h2 class="serif section-title" style="margin-bottom:18px;">Consult ${escape(f.name)}</h2>
    <div style="margin-bottom:8px;">${ratesHtml}</div>
    <p style="font-size:13px; color:var(--ink-soft); margin:6px 0 0;">Billed per minute from your Astrowani wallet. You can end the session at any time.</p>

    <h2 class="serif section-title" style="margin:44px 0 18px;">About ${escape(f.name)}</h2>
    ${about.map((p) => `<p ${P}>${escape(p)}</p>`).join('\n    ')}
    <div style="display:flex; flex-wrap:wrap; gap:24px; margin-top:18px; font-size:14.5px;">
      ${f.years ? `<div><div style="color:var(--ink-soft); font-size:12.5px;">Experience</div><strong style="color:var(--maroon);">${escape(f.years)} years</strong></div>` : ''}
      ${f.languages.length ? `<div><div style="color:var(--ink-soft); font-size:12.5px;">Languages</div><strong style="color:var(--maroon);">${escape(f.languages.join(', '))}</strong></div>` : ''}
      ${f.specialties.length ? `<div><div style="color:var(--ink-soft); font-size:12.5px;">Areas of practice</div><strong style="color:var(--maroon);">${escape(f.specialties.join(', '))}</strong></div>` : ''}
    </div>

    <h2 class="serif section-title" style="margin:44px 0 6px;">Reviews</h2>
    ${reviewsHtml}

    <p style="margin:34px 0 0;"><a href="astrologers.html" style="color:var(--maroon); font-weight:700;">← See all astrologers</a></p>
  </div>
</div>
</main>`;

  let html = shell.replace(/<head>([\s\S]*?)<\/head>/i, (_, head) => `<head>\n${tags[0]}${head
    .replace(/<base\b[^>]*>\s*/gi, '')
    .replace(/<title[^>]*>[\s\S]*?<\/title>/gi, '')
    .replace(/<!-- SEO:START[\s\S]*?<!-- SEO:END -->\s*/g, '')
    .replace(/<meta\b[^>]*(?:name="(?:description|robots|twitter:[^"]+)"|property="og:[^"]+")[^>]*>\s*/gi, '')
    .replace(/<link\b[^>]*(?:rel="canonical"|hreflang="[^"]+")[^>]*>\s*/gi, '')
    .replace(/<script\b[^>]*type="application\/ld\+json"[^>]*>[\s\S]*?<\/script>\s*/gi, '')}
${tags.slice(1).join('\n')}</head>`);
  // English only: bios and reviews are written in whatever the person typed, so a
  // /hi/ copy would be the same text under a Hindi URL — a duplicate, not a page.
  html = html.replace(/<html\b[^>]*>/i, '<html lang="en" data-lang="en">');
  return html.replace(/<main id="content">[\s\S]*?<\/main>/, () => body);
}

function render404(shell, base = SITE_BASE) {
  base = base.replace(/\/$/, '');
  const body = `<main id="content"><div class="page-header"><h1 class="serif">Astrologer not found</h1>
  <p>This profile is not available. The astrologer may no longer be taking consultations.</p>
  <p style="margin-top:16px;"><a href="astrologers.html" style="color:var(--gold); font-weight:700;">See all astrologers</a></p></div></main>`;
  return shell
    .replace(/<head>/i, `<head>\n<base href="${escape(`${base}/`)}">\n<meta name="robots" content="noindex, follow">`)
    .replace(/<title[^>]*>[\s\S]*?<\/title>/i, '<title>Astrologer not found | Astrowani</title>')
    .replace(/<link\b[^>]*rel="canonical"[^>]*>\s*/gi, '')
    .replace(/<main id="content">[\s\S]*?<\/main>/, () => body);
}

/** Sitemap rows: every visible astrologer's address. Throws on a read failure. */
async function listProfiles(db, base = SITE_BASE) {
  const { rows } = await loadVisible(db);
  return rows.map((r) => ({ loc: profileUrl(r, base) }));
}

function register(app, db, { siteBase = SITE_BASE, websiteRoot = path.resolve(__dirname, '../../astrowani-website') } = {}) {
  app.get('/api/web/astrologer-page', async (req, res) => {
    res.set('Cache-Control', 'no-cache, must-revalidate');
    let shell;
    try {
      shell = fs.readFileSync(path.join(websiteRoot, 'astrologers.html'), 'utf8');
      const { rows, cats } = await loadVisible(db);
      const slug = String(req.query.slug || '');
      const row = findBySlug(rows, slug);
      if (!row) return res.status(404).type('html').send(render404(shell, siteBase));
      // The name part changed (or was mistyped): one permanent address per person.
      if (profileSlug(row) !== slug) return res.redirect(301, profileUrl(row, siteBase));
      const reviews = await loadReviews(db, row.id);
      return res.status(200).type('html').send(renderProfile(shell, row, cats, reviews, { base: siteBase }));
    } catch (err) {
      console.error('[astrologer-page]', err.message);
      res.set('Retry-After', '60');
      return res.status(503).type('html').send(shell ? render404(shell, siteBase).replace('Astrologer not found', 'Profile temporarily unavailable') : '<h1>Profile temporarily unavailable</h1>');
    }
  });
}

module.exports = { register, profileSlug, profileUrl, findBySlug, renderProfile, listProfiles, loadVisible, PROFILE_COLUMNS, _resetCache: () => { cache = { at: 0, rows: null, cats: null }; } };
