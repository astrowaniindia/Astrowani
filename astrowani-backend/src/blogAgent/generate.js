// ─────────────────────────────────────────────────────────────────────────────
// Writing one article.
//
// Two stages, kept separate on purpose:
//
//   1. THE MODEL writes prose, in both languages, as structured JSON. It is
//      asked for text and headings only.
//   2. THIS FILE assembles the HTML — the internal links, the CTA, the FAQ
//      section, the JSON-LD graph, the related-posts block.
//
// Stage 2 is not delegated to the model because every one of those elements must
// be exactly right to be worth anything: a hallucinated internal URL is a 404, a
// malformed JSON-LD block is ignored by Google, and an invented Play Store link
// is a dead CTA. The model is good at the paragraphs and unreliable at the
// plumbing, so it only writes the paragraphs.
// ─────────────────────────────────────────────────────────────────────────────
const { generate: callGemini, parseJson } = require('./gemini');
const seo = require('./seo');

/**
 * The voice. Lifted from decisions already recorded in CLAUDE.md rather than
 * invented here:
 *  - LIFESTYLE, NOT FORTUNE-TELLING (subsystem CN, the App Store positioning).
 *    No "predict your future", no "lucky numbers will make you rich".
 *  - No health, fertility or money guarantees (fc964c0 reworded seven shop items
 *    for exactly this). quality.js enforces it; the prompt states it so the model
 *    rarely produces one in the first place.
 *  - Astrowani is spelled one way. Brand mentions split across "Astro Wani" and
 *    "Astrovani" are wasted.
 */
const SYSTEM = `You are the senior editor of the Astrowani blog. Astrowani is an Indian
astrology platform where people reach verified human astrologers by chat, call and video.

HOW YOU WRITE
- Plain, warm, concrete English that an Indian reader of any background follows easily.
  Short sentences. No purple prose, no "dear reader", no emoji.
- You explain traditional Vedic astrology, numerology, palmistry, Vastu and tarot as a
  practising astrologer would: what the classical texts say, what it tends to mean in a
  real life, and what someone can actually do about it.
- Indian readers search in Hinglish. Use the words they use - kundali, dosh, dasha,
  mangal, shani, muhurat, mulank - and gloss them in English the first time.
- Specific beats vague. Name the house, the planet, the lord, the remedy, the day of the
  week. "Saturn teaches patience" is filler; "Saturn in the 7th delays marriage rather
  than denying it, and the delay usually breaks after the Saturn antardasha" is an article.

POSITIONING - THIS IS A LIFESTYLE PUBLICATION, NOT A FORTUNE-TELLING ONE
- Astrology here is guidance, self-understanding and tradition. Never "we will predict
  your future" or "this will definitely happen".
- Always frame a reading as a tendency, not a certainty, and say that a real chart needs a
  real astrologer.

ABSOLUTE PROHIBITIONS - an article breaking any of these is discarded
- No medical claims of any kind. Never say anything cures, heals or treats an illness, and
  never suggest anyone delay or replace medical treatment.
- No guarantees about pregnancy, childbirth, the sex of a child, wealth, lottery or exam
  results.
- No black magic, vashikaran, curses or fear-selling. Nothing that frightens a reader into
  buying.
- Nothing about caste, and nothing that treats a daughter as less fortunate than a son.
- Never claim a specific astrologer, price or offer exists on Astrowani. Refer to
  "verified astrologers on Astrowani" in general terms only.

THE BRAND
- The platform is "Astrowani" - one word, capital A, no space. Never "Astro Wani",
  "AstroWani" or "Astrovani".
- Mention Astrowani naturally where it genuinely fits: where a reader would want a real
  astrologer to look at their own chart. Woven into a sentence, never bolted on.`;

/**
 * The per-article instruction.
 *
 * `related` are recent posts, passed in ONLY so the model can refer to them in
 * prose ("as we covered when looking at X"). The actual anchors are added in
 * stage 2 — the model is never given a URL to reproduce, because it will
 * eventually reproduce one wrong.
 */
function buildPrompt({ topic, limits, related, recentTitles }) {
  const minWords = limits.minWordsEn + 150; // ask above the floor so a short answer still passes
  const links = seo.linksForCategory(topic.category, 4);

  return `Write one complete blog article for the Astrowani blog.

SUBJECT: ${topic.title}
${topic.angle ? `ANGLE: ${topic.angle}` : ''}
CATEGORY: ${topic.category}
PRIMARY SEARCH KEYWORD: "${topic.keyword}"

KEYWORD RULES - this article has to be findable
- Use the exact phrase "${topic.keyword}" in the title, in the first 80 words, and in at
  least one <h2> heading.
- Use it ${limits.minKeywordHits + 2} to 6 times across the whole article and NO more. Stuffing it reads as
  spam and is rejected. Use natural variations the rest of the time.

LENGTH AND SHAPE
- English body: ${minWords}-${limits.maxWordsEn - 400} words of real substance. No padding to hit a number.
- ${limits.minH2 + 1} to 6 <h2> sections with specific, useful headings. Use <h3> for sub-points.
- Open with 2-3 sentences that answer the question immediately - do not warm up. Someone
  who reads only the first paragraph should already have the answer.
- Include at least one <ul> list of practical points, and where it fits a short <table>
  (for example a planet, its day, and its remedy).
- Mention Astrowani ${limits.minAstrowaniMentions} to 7 times, woven into sentences.

HTML RULES - obeyed exactly
- Body is HTML using ONLY: <p> <h2> <h3> <ul> <ol> <li> <strong> <em> <blockquote>
  <table> <thead> <tbody> <tr> <th> <td>
- NO <h1>, NO <a> links, NO <img>, NO <script>, NO inline style attributes, NO classes.
  Links and images are added afterwards by the publishing system - do not write any.
- No markdown. No code fences. HTML tags only.

HINDI
- Write a full Hindi version in Devanagari script, not a transliteration and not a
  word-for-word translation - rewrite it the way a Hindi-speaking astrologer would say it.
  Keep the same headings and structure. At least ${limits.minWordsHi + 100} words.
- Common English terms Hindi readers already use (chat, call, video, app, Astrowani) stay
  in their usual form.

${recentTitles && recentTitles.length ? `ALREADY PUBLISHED - do not retread these, and do not reuse their opening lines or structure:
${recentTitles.slice(0, 20).map((t) => `- ${t}`).join('\n')}
` : ''}
${related && related.length ? `You may refer in passing to these recent Astrowani articles by name (the system adds the links):
${related.map((r) => `- ${r.title}`).join('\n')}
` : ''}
THE READER WILL ALSO BE OFFERED THESE PAGES at the end, so do not write your own closing
call to action - the system appends one:
${links.map((l) => `- ${l.anchor}`).join('\n')}

Return ONLY a JSON object, no prose around it, with exactly these keys:
{
  "titleEn": "under ${limits.titleMaxChars} characters, contains the keyword, written to be clicked",
  "titleHi": "the Hindi title in Devanagari",
  "metaDescription": "${limits.metaMinChars}-${limits.metaMaxChars - 10} characters, contains the keyword, reads as a promise of the answer",
  "metaDescriptionHi": "the same in Hindi, same length range",
  "excerpt": "90-200 characters, the one-line teaser used on blog cards",
  "excerptHi": "the same in Hindi",
  "imageQuery": "2-4 ENGLISH words to search a stock photo library for a photograph that suits this article. Concrete and photographable - 'temple oil lamp', 'indian bride hands', 'night sky stars'. Never abstract, never a named deity or a chart diagram.",
  "imageAlt": "a plain description of that image for alt text, containing the keyword if it reads naturally",
  "contentEn": "the full English body as HTML",
  "contentHi": "the full Hindi body as HTML",
  "faqs": [
    { "question": "a question people really ask about this", "answer": "2-4 sentences, plain text, no HTML" }
  ],
  "faqsHi": [
    { "question": "the same question in Hindi", "answer": "the answer in Hindi, plain text" }
  ]
}
Give ${limits.minFaqs + 1} to 4 FAQs. The first FAQ should be the single most common question on this subject.`;
}

/**
 * Tags we allow through from the model. Anything else is unwrapped (its text is
 * kept, the tag is dropped).
 *
 * This is a WHITELIST, not a blacklist, and that direction is the point: the
 * model is a third party writing markup that goes into a page and into the app's
 * react-native-render-html. A blacklist of "script, iframe, onclick" is a list of
 * the attacks thought of today. The prompt asks for 15 tags; anything else is a
 * mistake or worse, either way it should not survive.
 */
const ALLOWED_TAGS = new Set([
  'p', 'h2', 'h3', 'h4', 'ul', 'ol', 'li', 'strong', 'em', 'b', 'i',
  'blockquote', 'br', 'table', 'thead', 'tbody', 'tr', 'th', 'td',
]);

/**
 * Strip the model's HTML down to the whitelist and remove every attribute.
 *
 * Dropping ALL attributes is what makes this safe without parsing: no href, no
 * src, no style, no on* handler can survive, so there is nothing to sanitise
 * individually. The links and images this article needs are added afterwards by
 * code that knows the real URLs.
 */
function sanitiseHtml(html) {
  let s = String(html || '');

  // Whole dangerous elements, content included.
  s = s.replace(/<(script|style|iframe|object|embed|form|svg|math|noscript)[\s\S]*?<\/\1\s*>/gi, '');
  s = s.replace(/<(script|style|iframe|object|embed|form|svg|math|noscript)\b[^>]*\/?>/gi, '');
  // Comments can hide a conditional-comment payload and are never wanted here.
  s = s.replace(/<!--[\s\S]*?-->/g, '');

  // Every remaining tag: keep it only if whitelisted, and always without attributes.
  s = s.replace(/<\/?([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>/g, (match, tag) => {
    const name = tag.toLowerCase();
    if (!ALLOWED_TAGS.has(name)) return ' ';
    const closing = /^<\//.test(match);
    if (closing) return `</${name}>`;
    if (name === 'br') return '<br>';
    return `<${name}>`;
  });

  // A model occasionally returns markdown fences or ### headings despite being
  // told not to. Not an error worth discarding an article over, so repair it.
  s = s.replace(/```[a-z]*\n?/gi, '');
  s = s.replace(/^#{2,6}\s*(.+)$/gm, '<h3>$1</h3>');

  return s.replace(/\s+/g, ' ').replace(/>\s+</g, '><').trim();
}

/**
 * Fix the brand's CASING, and only its casing.
 *
 * "AstroWani" and "ASTROWANI" are the same token to a search engine as
 * "Astrowani", so these are a house-style problem rather than an SEO one — and
 * rejecting a finished 1,400-word article over a capital W would be throwing away
 * good work. They are corrected here instead, which is safe because it changes no
 * meaning and no word boundary.
 *
 * It deliberately does NOT touch "Astro Wani" or "Astrovani". Those are genuinely
 * different tokens, and a model producing one has misunderstood something; the
 * quality gate rejects them so the prompt gets another go rather than having the
 * mistake papered over.
 */
function normaliseBrand(s) {
  return String(s || '')
    .replace(/\bAstroWani\b/g, 'Astrowani')
    .replace(/\bASTROWANI\b/g, 'Astrowani')
    .replace(/\bastrowani\b/g, 'Astrowani');
}

function pickString(v, fallback = '') {
  return typeof v === 'string' ? v.trim() : fallback;
}

function normaliseFaqs(v) {
  if (!Array.isArray(v)) return [];
  return v
    .map((f) => ({
      question: seo.stripHtml(pickString(f?.question)).slice(0, 220),
      answer: seo.stripHtml(pickString(f?.answer)).slice(0, 900),
    }))
    .filter((f) => f.question && f.answer)
    .slice(0, 6);
}

/**
 * Ask the model, and normalise whatever comes back into a fixed shape.
 *
 * No quality judgement here — that is quality.js, called by the orchestrator,
 * because a check that lives inside the generator cannot be run against a
 * fixture in a test.
 */
async function draft({ topic, limits, related = [], recentTitles = [], log = () => {} }) {
  const { text, model, tier } = await callGemini({
    system: SYSTEM,
    prompt: buildPrompt({ topic, limits, related, recentTitles }),
    json: true,
    temperature: 0.9,       // these are 1,000 articles on adjacent subjects; sameness is the risk
    maxOutputTokens: 16384, // two full languages plus FAQs in one reply
    log,
  });

  const raw = parseJson(text);

  const clean = (v, max) => normaliseBrand(seo.stripHtml(pickString(v))).slice(0, max);

  return {
    model: `${model} (${tier})`,
    titleEn: clean(raw.titleEn, 200),
    titleHi: clean(raw.titleHi, 200),
    metaDescription: clean(raw.metaDescription, 400),
    metaDescriptionHi: clean(raw.metaDescriptionHi, 400),
    excerpt: clean(raw.excerpt, 600),
    excerptHi: clean(raw.excerptHi, 600),
    imageQuery: seo.stripHtml(pickString(raw.imageQuery)).slice(0, 120),
    imageAlt: clean(raw.imageAlt, 220),
    contentEn: normaliseBrand(sanitiseHtml(raw.contentEn)),
    contentHi: normaliseBrand(sanitiseHtml(raw.contentHi)),
    faqs: normaliseFaqs(raw.faqs),
    faqsHi: normaliseFaqs(raw.faqsHi),
  };
}

/**
 * Insert internal links into the body prose.
 *
 * Links the FIRST occurrence of a target's anchor phrase, or failing that the
 * first mention of "Astrowani" in a later paragraph. First-occurrence-only is
 * deliberate: the same phrase linked five times to the same URL dilutes the
 * anchor signal and reads like an affiliate page.
 *
 * Anchors are only placed inside <p> text, never inside a heading — a linked
 * heading looks broken on both the website and in the app.
 */
function weaveInternalLinks(html, category, { max = 3 } = {}) {
  let out = String(html || '');
  let placed = 0;
  const targets = seo.linksForCategory(category, 6);

  for (const t of targets) {
    if (placed >= max) break;
    const phrases = [t.anchor, t.anchor.replace(/ on Astrowani$/, ''), t.anchor.replace(/^Astrowani /, '')]
      .map((p) => p.trim()).filter(Boolean);

    let done = false;
    for (const phrase of phrases) {
      if (done) break;
      const esc = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      // (?![^<]*>) keeps the match out of a tag's attributes; the <a> guard stops
      // a nested anchor, which is invalid HTML and renders unpredictably.
      const re = new RegExp(`(?<!<a[^>]*>)\\b(${esc})\\b(?![^<]*>)(?![^<]*</a>)`, 'i');
      if (!re.test(out)) continue;
      out = out.replace(re, `<a href="${seo.escAttr(t.url)}">$1</a>`);
      placed += 1;
      done = true;
    }
  }

  // Fall back to linking a plain "Astrowani" mention, so the minimum-links gate
  // is satisfiable even when the model used none of the anchor phrases.
  if (placed < max) {
    const fallback = seo.linksForCategory(category, max)[placed] || seo.LINK_TARGETS.astrologers;
    const re = /(?<!<a[^>]*>)\b(Astrowani)\b(?![^<]*>)(?![^<]*<\/a>)/;
    if (re.test(out)) {
      out = out.replace(re, `<a href="${seo.escAttr(fallback.url)}">$1</a>`);
      placed += 1;
    }
  }

  return { html: out, linksPlaced: placed };
}

/**
 * Stage 2: turn a draft into the exact HTML that goes in the database.
 *
 * ORDER MATTERS. Links are woven into the prose BEFORE the FAQ, CTA and
 * related-posts blocks are appended, so the automatic anchors land in the
 * article's own sentences rather than in the boilerplate at the bottom — which
 * is where every low-effort auto-blog puts them, and where they are worth least.
 */
function assemble(draftArticle, { topic, slug, imageUrl, imageAlt, related = [], publishedAt } = {}) {
  const category = topic.category;

  const woven = weaveInternalLinks(draftArticle.contentEn, category, { max: 3 });
  const wovenHi = weaveInternalLinks(draftArticle.contentHi, category, { max: 2 });

  const contentEn = [
    woven.html,
    seo.faqHtml(draftArticle.faqs),
    seo.relatedLinksHtml(related),
    seo.ctaHtml(category),
    seo.jsonLd({
      title: draftArticle.titleEn,
      description: draftArticle.metaDescription,
      slug,
      imageUrl,
      imageAlt,
      faqs: draftArticle.faqs,
      category,
      publishedAt,
      keyword: topic.keyword,
    }),
  ].filter(Boolean).join('');

  // The Hindi body carries NO JSON-LD. One page serves both languages from the
  // same URL (style.css's .lang-en/.lang-hi rule), so emitting a second @graph
  // would put two Article nodes for one page on the page — which Google treats
  // as conflicting markup rather than as two languages.
  const contentHi = [
    wovenHi.html,
    seo.faqHtml(draftArticle.faqsHi.length ? draftArticle.faqsHi : draftArticle.faqs, { heading: 'Aksar pooche jaane wale sawal' }),
    seo.relatedLinksHtml(related, { heading: 'Astrowani par aage padhiye' }),
    seo.ctaHtml(category, { hindi: true }),
  ].filter(Boolean).join('');

  return { ...draftArticle, contentEn, contentHi, linksPlaced: woven.linksPlaced };
}

module.exports = {
  draft,
  assemble,
  sanitiseHtml,
  normaliseBrand,
  weaveInternalLinks,
  buildPrompt,
  normaliseFaqs,
  ALLOWED_TAGS,
  SYSTEM,
};
