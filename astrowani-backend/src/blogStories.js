/**
 * One Web Story per blog article, for Google Discover (CLAUDE.md EU).
 *
 *   /stories/<slug>      English   (nginx -> /api/blogs/story-page?slug=)
 *   /hi/stories/<slug>   Hindi     (nginx -> /api/blogs/story-page?lang=hi&slug=)
 *
 * RENDERED ON REQUEST from the article itself, not stored. That is what makes it
 * "made automatically when an article is published": the moment a post is
 * published its story exists, an edit to the article shows up in the story, and
 * there is no second copy of anything to keep in step. The blog agent and the
 * admin save only have to tell IndexNow the story URL as well.
 *
 * THE SLIDES ARE THE ARTICLE'S OWN SECTIONS: each <h2> the writer produced, with
 * the opening of its first paragraph. What is NOT a section, and is skipped:
 *   - the FAQ (`<h2 class="aw-faq-title">`);
 *   - the blocks the blog agent assembles after the body — "read next" (a list
 *     of links, no paragraph) and the closing call to action (one paragraph).
 *     The rule that catches both is "a real section has at least TWO
 *     paragraphs": the model is told to write 2-4 under every heading
 *     (blogAgent/generate.js), the assembled blocks have zero or one. The known
 *     headings (blogAgent/keywords.js) are skipped as well, belt and braces.
 *
 * An article with fewer than MIN_SECTIONS such sections gets NO story (404,
 * noindex) — a cover and a "read the article" slide is not a story, and a thin
 * story is worse than none. Today that leaves out the five pre-agent posts,
 * which are one undivided block of text. The sitemap and the article page use
 * hasStory() / storySections(), so they can never point at a story that 404s.
 */
const imageUrl = require('./imageUrl');
const { renderStory } = require('./webStory');
const { SITE_BASE } = require('./blogAgent/seo');
const kw = require('./blogAgent/keywords');

const MIN_SECTIONS = 3;
const MAX_SECTIONS = 6;
const SNIPPET = 230;

const SKIP_HEADINGS = new Set([
  ...kw.CTA_EN.map((c) => c.heading), ...kw.CTA_HI.map((c) => c.heading),
  ...kw.FAQ_HEADINGS_EN, ...kw.FAQ_HEADINGS_HI,
  ...kw.RELATED_HEADINGS_EN, ...kw.RELATED_HEADINGS_HI,
].map((h) => h.toLowerCase()));

const plain = (s) => String(s || '')
  .replace(/<[^>]*>/g, ' ')
  .replace(/&(amp|lt|gt|quot|apos|nbsp|#39);/g, (_, n) => ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" }[n]))
  .replace(/\s+/g, ' ')
  .trim();

/** The opening of a paragraph: whole sentences up to SNIPPET characters. */
function snippet(text) {
  const sentences = text.split(/(?<=[.!?।])\s+/);
  let out = '';
  for (const s of sentences) {
    if (!out) { out = s; continue; }
    if ((out + ' ' + s).length > SNIPPET) break;
    out += ' ' + s;
  }
  if (out.length > SNIPPET + 40) {
    out = out.slice(0, SNIPPET).replace(/\s+\S*$/, '') + '…';
  }
  return out;
}

/** The article's own sections, as [{ heading, text }]. Pure. */
function storySections(html) {
  const parts = String(html || '').split(/(<h2\b[^>]*>[\s\S]*?<\/h2>)/i);
  const out = [];
  for (let i = 1; i < parts.length; i += 2) {
    const tag = parts[i];
    if (/class="[^"]*aw-faq-title/.test(tag)) continue;
    const heading = plain(tag);
    if (!heading || SKIP_HEADINGS.has(heading.toLowerCase())) continue;
    const body = parts[i + 1] || '';
    const paragraphs = (body.match(/<p\b[^>]*>[\s\S]*?<\/p>/gi) || []).map(plain).filter((p) => p.length >= 40);
    if (paragraphs.length < 2) continue;
    out.push({ heading, text: snippet(paragraphs[0]) });
    if (out.length >= MAX_SECTIONS) break;
  }
  return out;
}

const hasStory = (html) => storySections(html).length >= MIN_SECTIONS;

function storyUrl(slug, base = SITE_BASE, hi = false) {
  return `${base}/${hi ? 'hi/' : ''}stories/${encodeURIComponent(slug)}`;
}

/**
 * The story poster: the article's own photograph, cropped to 3:4 by the storage
 * render endpoint — or the stock cover when the thumbnail is not a stored image
 * (the pre-agent posts hold data: URIs, which cannot be a poster URL).
 */
function posterFor(thumbnail, base) {
  if (typeof thumbnail === 'string' && thumbnail.includes(imageUrl.OBJECT_PREFIX) && !thumbnail.includes('?')) {
    return `${thumbnail.replace(imageUrl.OBJECT_PREFIX, imageUrl.RENDER_PREFIX)}?width=960&height=1280&resize=cover&quality=75`;
  }
  return `${base}/assets/stories/blog.jpg`;
}

function fmtDate(value, hi) {
  try {
    return new Date(value).toLocaleDateString(hi ? 'hi-IN' : 'en-IN', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' });
  } catch (_) {
    return '';
  }
}

function describe(row, hi) {
  const meta = plain(hi ? row.meta_description_hi : row.meta_description);
  const clauses = meta.split(',').filter(Boolean);
  const avg = clauses.reduce((n, c) => n + c.trim().split(/\s+/).length, 0) / (clauses.length || 1);
  if (meta.length >= 50 && avg > 3) return meta;
  return plain(hi ? row.excerpt_hi || row.content_hi : row.excerpt || row.content_en).slice(0, 160);
}

const COPY = {
  en: {
    eyebrow: 'Astrowani blog',
    readEyebrow: 'Keep reading', readTitle: 'Read the full article', readCta: 'Read the article',
    ctaEyebrow: 'Your own chart', ctaTitle: 'Talk to a verified astrologer',
    ctaText: 'Everything here is the general rule. An astrologer can tell you how it applies to your own birth chart.',
    ctaButton: 'Talk to an astrologer',
  },
  hi: {
    eyebrow: 'Astrowani ब्लॉग',
    readEyebrow: 'आगे पढ़ें', readTitle: 'पूरा लेख पढ़ें', readCta: 'लेख पढ़ें',
    ctaEyebrow: 'आपकी अपनी कुंडली', ctaTitle: 'सत्यापित ज्योतिषी से बात करें',
    ctaText: 'यहाँ सामान्य नियम बताया गया है। एक ज्योतिषी बता सकते हैं कि यह आपकी अपनी जन्म कुंडली पर कैसे लागू होता है।',
    ctaButton: 'ज्योतिषी से बात करें',
  },
};

const hasHindi = (row) => !!(row.title_hi && row.content_hi && hasStory(row.content_hi));

/** The story page for one published article row, or null if it has no story. */
function buildBlogStory(row, { base = SITE_BASE, hi = false } = {}) {
  base = base.replace(/\/$/, '');
  const content = hi ? row.content_hi : row.content_en;
  const sections = storySections(content);
  if (!row.slug || sections.length < MIN_SECTIONS) return null;
  const c = COPY[hi ? 'hi' : 'en'];
  const title = plain(hi ? row.title_hi : row.title_en || row.title);
  const poster = posterFor(row.thumbnail, base);
  const article = `${base}/${hi ? 'hi/' : ''}blog/${encodeURIComponent(row.slug)}`;
  const translated = !!(row.title_en || row.title) && hasHindi(row);
  return renderStory({
    lang: hi ? 'hi' : 'en',
    siteBase: base,
    title,
    headTitle: `${title} | Astrowani Story`,
    description: describe(row, hi),
    canonical: storyUrl(row.slug, base, hi),
    alternates: translated
      ? [['en-IN', storyUrl(row.slug, base, false)], ['hi-IN', storyUrl(row.slug, base, true)], ['x-default', storyUrl(row.slug, base, false)]]
      : [],
    poster,
    logo: `${base}/assets/logo-240.jpg`,
    wheel: `${base}/assets/zodiac-wheel.png`,
    datePublished: row.created_at,
    dateModified: row.updated_at || row.created_at,
    pages: [
      { kind: 'cover', id: 'cover', image: poster, eyebrow: c.eyebrow, title, sub: fmtDate(row.created_at, hi) },
      ...sections.map((s, i) => ({ id: `s${i + 1}`, eyebrow: `${i + 1} / ${sections.length}`, title: s.heading, text: s.text })),
      { id: 'read', eyebrow: c.readEyebrow, title: c.readTitle, text: describe(row, hi), href: article, cta: c.readCta },
      { id: 'consult', eyebrow: c.ctaEyebrow, title: c.ctaTitle, text: c.ctaText, href: `${base}/${hi ? 'hi/' : ''}consult.html?mode=chat`, cta: c.ctaButton, brand: 'Astrowani' },
    ],
  });
}

const NOT_FOUND = '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="robots" content="noindex, follow"><title>Story not found | Astrowani</title></head><body><h1>Story not found</h1><p><a href="../blog.html">Astrowani blog</a></p></body></html>';

const COLUMNS = 'id, slug, title, title_en, title_hi, content_en, content_hi, excerpt, excerpt_hi, meta_description, meta_description_hi, thumbnail, created_at, updated_at';

function register(app, db, { siteBase = SITE_BASE } = {}) {
  app.get('/api/blogs/story-page', async (req, res) => {
    const hi = req.query.lang === 'hi';
    const slug = typeof req.query.slug === 'string' ? req.query.slug : '';
    res.set('Cache-Control', 'no-cache, must-revalidate');
    if (!/^[a-z0-9-]{1,250}$/.test(slug)) return res.status(404).type('html').send(NOT_FOUND);
    try {
      const { data: row, error } = await db.from('blogs').select(COLUMNS)
        .eq('is_published', true).eq('slug', slug).maybeSingle();
      if (error) throw error;
      if (!row) return res.status(404).type('html').send(NOT_FOUND);
      if (hi && !hasHindi(row)) {
        // Same rule as the article page: no Hindi, go to the English one.
        return hasStory(row.content_en)
          ? res.redirect(302, storyUrl(slug, siteBase, false))
          : res.status(404).type('html').send(NOT_FOUND);
      }
      const html = buildBlogStory(row, { base: siteBase, hi });
      return html ? res.status(200).type('html').send(html) : res.status(404).type('html').send(NOT_FOUND);
    } catch (err) {
      console.error('[blog-story]', err.message);
      res.set('Retry-After', '60');
      return res.status(503).type('html').send('<!doctype html><html><head><meta charset="utf-8"><title>Temporarily unavailable</title></head><body><h1>Please try again shortly.</h1></body></html>');
    }
  });
}

/**
 * Published slugs that have a story, for the sitemap: [{ slug, hasHindi, lastmod }].
 *
 * WHY THE MEMO. Deciding "has a story" needs the article BODY, and selecting
 * every body on every sitemap refresh grows without limit at three articles a
 * day — cached egress is exactly what put this project over its Supabase quota
 * (CLAUDE.md EC). So the cheap columns are read every time, and a body is read
 * only for an article that is new or whose updated_at moved since this process
 * last looked. Candidates are pre-filtered on "<h2" in SQL as well.
 */
const verdicts = new Map(); // slug -> { stamp, en, hi }

async function listStories(db) {
  const { data, error } = await db.from('blogs')
    .select('slug, created_at, updated_at')
    .eq('is_published', true).not('slug', 'is', null)
    .ilike('content_en', '%<h2%')
    .order('created_at', { ascending: false }).limit(2000);
  if (error) throw error;
  const rows = data || [];
  const stamp = (r) => String(r.updated_at || r.created_at);
  const stale = rows.filter((r) => !verdicts.has(r.slug) || verdicts.get(r.slug).stamp !== stamp(r)).map((r) => r.slug);
  // 150 per .in() list — the size this project settled on after a 414 (CLAUDE.md ER4).
  for (let i = 0; i < stale.length; i += 150) {
    const { data: bodies, error: bErr } = await db.from('blogs')
      .select('slug, title_hi, content_en, content_hi, created_at, updated_at')
      .in('slug', stale.slice(i, i + 150));
    if (bErr) throw bErr;
    for (const b of bodies || []) verdicts.set(b.slug, { stamp: stamp(b), en: hasStory(b.content_en), hi: hasHindi(b) });
  }
  return rows.filter((r) => verdicts.get(r.slug)?.en).map((r) => ({
    slug: r.slug,
    hasHindi: !!verdicts.get(r.slug).hi,
    lastmod: new Date(r.updated_at || r.created_at).toISOString(),
  }));
}

module.exports = { register, buildBlogStory, storySections, hasStory, hasHindi, storyUrl, listStories, MIN_SECTIONS };
