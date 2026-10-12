// ─────────────────────────────────────────────────────────────────────────────
// The gate.
//
// Nothing reads these articles before they are public, so this file is the only
// thing standing between a bad generation and the live site. It is written to be
// boring and mechanical: every rule is a measurable property of the HTML, and a
// failure names the rule so a prompt regression shows up in the ledger instead of
// in Search Console two months later.
//
// FAILURE DIRECTION: reject. Unlike src/audience.js (which fails open because a
// wrongly-withheld offer costs a customer) a wrongly-published article costs
// something that is expensive to undo — Google indexes it, and a thin or
// off-brand page drags on the pages that were ranking. Skipping a slot costs one
// article out of a thousand a year.
// ─────────────────────────────────────────────────────────────────────────────
const { stripHtml, wordCount, phraseCount, keywordDensity } = require('./seo');

/**
 * THE HARD BAN, and the one rule in this file that is not about SEO.
 *
 * Astrowani already had to reword seven Wani Shop items for the App Store
 * (CLAUDE.md fc964c0: "will revoke death if critical condition in hospital",
 * "cure severe illnesses", fertility and pregnancy promises). A blog is not a
 * safer place to make those claims than a product page — it is a worse one,
 * because it is indexed, quotable and published without review. These patterns
 * reject the article outright; they are never "fixed up" and republished,
 * because a model that produced one is likely to have produced more around it.
 */
const BANNED_PATTERNS = [
  // Medical and mortality claims
  /\bcures?\b[^.]{0,40}\b(cancer|disease|illness|diabetes|covid|tumour|tumor|infection)\b/i,
  /\b(cure|heal|treat)s?\s+(cancer|diabetes|infertility|covid|tuberculosis|hiv|aids)\b/i,
  /\b(guarantee[ds]?|surely|definitely|100%)\b[^.]{0,50}\b(cure|recovery|heal|pregnan|conceive|child)\b/i,
  /\b(revoke|prevent|avoid|escape|defeat)\s+(death|dying)\b/i,
  /\b(instead\s+of|replace|no\s+need\s+(?:for|of))\s+(medicine|medical|doctor|treatment|chemotherapy|surgery)\b/i,
  /\bstop\s+(taking\s+)?(your\s+)?(medicine|medication|treatment)\b/i,
  // Fertility / pregnancy promises
  /\b(guaranteed|assured|certain)\s+(pregnancy|conception|son|male\s+child)\b/i,
  /\b(get|give)\s+you\s+a\s+(son|male\s+child)\b/i,
  // Financial guarantees
  /\b(guaranteed|assured|certain|100%)\s+(wealth|riches|profit|returns?|lottery|jackpot)\b/i,
  /\bwill\s+(definitely|surely|certainly)\s+(become\s+)?(rich|crorepati|millionaire)\b/i,
  // Fear-selling and black magic, both off-brand and both a Play policy risk
  /\b(black\s+magic|vashikaran|kala\s+jadu)\b/i,
  /\b(curse|doom|disaster)\s+will\s+(befall|strike|destroy)\b/i,
  // Caste, religion and gender discrimination
  /\b(low|high)\s+caste\b/i,
  /\b(inauspicious|unlucky)\s+to\s+(have|bear)\s+a\s+(girl|daughter|female)\b/i,
];

/**
 * Model scaffolding that must never reach a reader. These do not reject — they
 * are evidence the generation was interrupted or the prompt leaked, so the
 * article is retried rather than published with "[insert conclusion here]" in it.
 */
const SCAFFOLD_PATTERNS = [
  /\[(?:insert|add|your|placeholder|todo|tbd)[^\]]*\]/i,
  /\b(?:lorem ipsum|TODO:|FIXME:)/i,
  /\bas an AI\b/i,
  /\bI (?:cannot|can't) (?:write|generate|provide)\b/i,
  /\bhere(?:'s| is) (?:the|your) (?:article|blog post|requested)\b/i,
  /\{\{\s*\w+\s*\}\}/,            // an unfilled template placeholder
  /\bword count\b\s*[:=]/i,
];

/**
 * The thresholds. Exposed so the CLI can print them and the config can override
 * them, rather than being buried as literals inside the checks.
 */
const DEFAULT_LIMITS = {
  minWordsEn: 700,
  maxWordsEn: 3000,
  minWordsHi: 400,          // Hindi says the same thing in fewer, longer words
  minH2: 3,
  minFaqs: 2,
  minAstrowaniMentions: 4,
  maxAstrowaniMentions: 14, // past this it reads as an advert, not an article
  minInternalLinks: 3,
  maxKeywordDensity: 3.2,   // percent; above ~3% reads as stuffing
  minKeywordHits: 2,
  titleMaxChars: 70,        // Google truncates the <title> around here
  metaMinChars: 70,
  metaMaxChars: 165,
  excerptMinChars: 60,
  excerptMaxChars: 320,
  maxSimilarityToExisting: 0.72,
};

/**
 * Cheap near-duplicate detection: Jaccard overlap of 4-word shingles.
 *
 * Used against the titles and openings of existing posts. The topic catalogue
 * already prevents repeating a SUBJECT; this catches the other thing — two
 * different subjects written in such a formulaic way that the pages are
 * substantially the same text. That is the failure mode that makes a 1,000-post
 * auto-blog worthless, and it cannot be caught by looking at one article alone.
 */
function shingles(text, n = 4) {
  const words = stripHtml(text).toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
  const out = new Set();
  for (let i = 0; i + n <= words.length; i += 1) out.add(words.slice(i, i + n).join(' '));
  return out;
}

function similarity(a, b) {
  const A = a instanceof Set ? a : shingles(a);
  const B = b instanceof Set ? b : shingles(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  const [small, large] = A.size <= B.size ? [A, B] : [B, A];
  for (const s of small) if (large.has(s)) inter += 1;
  return inter / (A.size + B.size - inter);
}

/**
 * Check one generated article.
 *
 * `stage` is 'draft' (straight from the model) or 'final' (after generate.assemble
 * has added the links, FAQ block, CTA and JSON-LD).
 *
 * THE STAGES MUST DIFFER, and getting this wrong is not theoretical — the first
 * version of this file checked the link count on the draft, while the prompt
 * explicitly forbids the model from writing any <a> tags. Every article was
 * therefore rejected on TOO_FEW_LINKS and the agent could never have published
 * anything at all. The links are added by code AFTER the draft passes, so the
 * draft is checked for what the model is responsible for, and the final article
 * is checked for everything.
 *
 * Returns `{ ok, rejections, stats }`. ALL failing rules are collected rather
 * than short-circuiting on the first: a retry is only useful if the prompt can
 * be told everything that was wrong, and the ledger is only useful if it records
 * the whole picture.
 */
function check(article, { keyword, limits = {}, existing = [], stage = 'final' } = {}) {
  const L = { ...DEFAULT_LIMITS, ...limits };
  const rejections = [];
  const fail = (code, detail) => rejections.push(detail ? `${code}: ${detail}` : code);

  const contentEn = article?.contentEn || '';
  const contentHi = article?.contentHi || '';
  const titleEn = String(article?.titleEn || '').trim();
  const titleHi = String(article?.titleHi || '').trim();
  const meta = String(article?.metaDescription || '').trim();
  const excerpt = String(article?.excerpt || '').trim();

  const wordsEn = wordCount(contentEn);
  const wordsHi = wordCount(contentHi);
  const h2Count = (contentEn.match(/<h2[\s>]/gi) || []).length;
  const mentions = phraseCount(contentEn, 'Astrowani');
  const internalLinks = (contentEn.match(/<a\s[^>]*href=/gi) || []).length;
  const density = keyword ? keywordDensity(contentEn, keyword) : 0;
  const keywordHits = keyword ? phraseCount(contentEn, keyword) : 0;

  // ── Structure ─────────────────────────────────────────────────────────────
  if (!titleEn) fail('TITLE_MISSING');
  else if (titleEn.length > L.titleMaxChars) fail('TITLE_TOO_LONG', `${titleEn.length} > ${L.titleMaxChars} chars`);
  if (!titleHi) fail('TITLE_HI_MISSING');

  if (wordsEn < L.minWordsEn) fail('TOO_SHORT_EN', `${wordsEn} words < ${L.minWordsEn}`);
  if (wordsEn > L.maxWordsEn) fail('TOO_LONG_EN', `${wordsEn} words > ${L.maxWordsEn}`);
  if (wordsHi < L.minWordsHi) fail('TOO_SHORT_HI', `${wordsHi} words < ${L.minWordsHi}`);
  if (h2Count < L.minH2) fail('TOO_FEW_H2', `${h2Count} < ${L.minH2}`);

  // An <h1> inside the body would compete with the page's own <h1>, which
  // blog-post.html renders from the title. Two h1s on a page is a classic
  // self-inflicted on-page error.
  if (/<h1[\s>]/i.test(contentEn)) fail('H1_IN_BODY');

  if ((article?.faqs || []).filter((f) => f && f.question && f.answer).length < L.minFaqs) {
    fail('TOO_FEW_FAQS', `< ${L.minFaqs}`);
  }

  // ── Metadata ──────────────────────────────────────────────────────────────
  if (meta.length < L.metaMinChars || meta.length > L.metaMaxChars) {
    fail('META_LENGTH', `${meta.length} chars, want ${L.metaMinChars}-${L.metaMaxChars}`);
  }
  if (excerpt.length < L.excerptMinChars || excerpt.length > L.excerptMaxChars) {
    fail('EXCERPT_LENGTH', `${excerpt.length} chars, want ${L.excerptMinChars}-${L.excerptMaxChars}`);
  }

  // ── Brand ─────────────────────────────────────────────────────────────────
  // The owner's actual requirement: Astrowani named several times, not once.
  if (mentions < L.minAstrowaniMentions) fail('TOO_FEW_BRAND_MENTIONS', `${mentions} < ${L.minAstrowaniMentions}`);
  if (mentions > L.maxAstrowaniMentions) fail('TOO_MANY_BRAND_MENTIONS', `${mentions} > ${L.maxAstrowaniMentions}`);
  // Spelling matters more than it looks. "Astro Wani" and "Astrovani" are
  // DIFFERENT TOKENS to a search engine, so mentions split across them are
  // mentions thrown away — the one mistake that undoes brand-term ranking.
  //
  // Casing is NOT checked here on purpose. "AstroWani" and "astrowani" are the
  // same token to a search engine, so rejecting a finished article over a capital
  // W would discard good work for no SEO gain. generate.normaliseBrand() fixes
  // the casing silently instead, which is safe because it changes no meaning.
  const brandVariants = [
    ...(contentEn.match(/\bastro[\s_-]+wan[iy]\w*/gi) || []),          // separated: "Astro Wani"
    ...(contentEn.match(/\bastro[\s_-]?(?:vani|wany|wanee|wane|wahni)\b/gi) || []), // wrong letters
  ];
  if (brandVariants.length) fail('BRAND_MISSPELT', [...new Set(brandVariants)].join(', '));

  // ── On-page SEO ───────────────────────────────────────────────────────────
  // Links are the publishing system's job, not the model's — see the stage note
  // on this function. A draft is EXPECTED to have none.
  if (stage === 'final' && internalLinks < L.minInternalLinks) {
    fail('TOO_FEW_LINKS', `${internalLinks} < ${L.minInternalLinks}`);
  }
  if (stage === 'draft' && internalLinks > 0) {
    // The prompt forbids them, so any <a> here means the sanitiser let one
    // through — which would mean a model-invented URL reaching a reader.
    fail('MODEL_WROTE_LINKS', `${internalLinks} anchor(s) survived sanitisation`);
  }
  if (keyword) {
    if (keywordHits < L.minKeywordHits) fail('KEYWORD_MISSING', `"${keyword}" appears ${keywordHits}x`);
    if (density > L.maxKeywordDensity) fail('KEYWORD_STUFFED', `${density.toFixed(2)}% > ${L.maxKeywordDensity}%`);
    // The keyword should appear early — in the first 120 words — because that is
    // where both a reader and a snippet generator look for the subject.
    const opening = stripHtml(contentEn).split(/\s+/).slice(0, 120).join(' ');
    if (!phraseCount(opening, keyword)) fail('KEYWORD_NOT_IN_OPENING');
  }

  // ── Content safety ────────────────────────────────────────────────────────
  const plainEn = stripHtml(contentEn);
  const plainHi = stripHtml(contentHi);
  for (const re of BANNED_PATTERNS) {
    const hit = re.exec(plainEn) || re.exec(plainHi) || re.exec(titleEn);
    if (hit) fail('BANNED_CLAIM', `"${String(hit[0]).slice(0, 60)}"`);
  }
  for (const re of SCAFFOLD_PATTERNS) {
    const hit = re.exec(plainEn) || re.exec(plainHi) || re.exec(titleEn) || re.exec(titleHi);
    if (hit) fail('SCAFFOLD_LEAKED', `"${String(hit[0]).slice(0, 60)}"`);
  }

  // Hindi must actually be Hindi. A model under load will happily return the
  // English text again for `contentHi`, and nothing downstream would notice —
  // the app's Hindi toggle would just show English, which is the exact bug
  // autoTranslate.js was written to fix.
  const devanagari = (plainHi.match(/[ऀ-ॿ]/g) || []).length;
  if (plainHi.length && devanagari / plainHi.length < 0.25) {
    fail('HINDI_NOT_HINDI', `${((devanagari / plainHi.length) * 100).toFixed(0)}% Devanagari`);
  }

  // ── Near-duplicate of something already published ─────────────────────────
  let maxSim = 0;
  let simAgainst = null;
  const mine = shingles(contentEn);
  for (const prev of existing || []) {
    const text = prev?.text || prev?.contentEn || '';
    if (!text) continue;
    const s = similarity(mine, shingles(text));
    if (s > maxSim) { maxSim = s; simAgainst = prev.title || prev.slug || 'an existing post'; }
  }
  if (maxSim > L.maxSimilarityToExisting) {
    fail('NEAR_DUPLICATE', `${(maxSim * 100).toFixed(0)}% overlap with "${simAgainst}"`);
  }

  return {
    ok: rejections.length === 0,
    rejections,
    stats: {
      wordsEn, wordsHi, h2Count, mentions, internalLinks,
      keywordHits, density: Number(density.toFixed(2)),
      metaChars: meta.length, excerptChars: excerpt.length,
      maxSimilarity: Number(maxSim.toFixed(3)),
    },
  };
}

module.exports = {
  check,
  similarity,
  shingles,
  DEFAULT_LIMITS,
  BANNED_PATTERNS,
  SCAFFOLD_PATTERNS,
};
