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
 * EXACT-MATCH KEYWORD PHRASES JAMMED INTO PROSE. The SEO audit found
 * "through an astrologer online india" in a published article: a search query
 * pasted in where a sentence should be. It reads as machine filler to a human
 * and as keyword stuffing to Google, which is the opposite of what the keyword
 * was for. The fix is a sentence that happens to contain the words, so the
 * mangled word order is what gets rejected, not the topic.
 */
const AWKWARD_KEYWORD_PATTERNS = [
  // "...astrologer online india...", and the same shape for every service noun.
  new RegExp('\\b(?:astrologer|astrology|kundli|horoscope|tarot|vastu|numerology|palmistry)\\s+online\\s+india\\b', 'i'),
  new RegExp('\\bonline\\s+(?:astrologer|astrology|kundli|horoscope|tarot|vastu|numerology|palmistry)\\s+india\\b', 'i'),
  // A superlative about ourselves, which is both unprovable and off-brand.
  new RegExp('\\b(?:best|top|no\\.?\\s?1|number\\s+one)\\s+astrologer\\s+(?:in|of)\\s+india\\b', 'i'),
];

/**
 * APPEALS TO CLASSICAL AUTHORITY WITH NOTHING NAMED. "Ancient texts say" is
 * unverifiable by a reader and was one of the audit's specific findings about
 * the sampled article. The rule is deliberately blunt: if an article wants to
 * lean on a classical source it must name one, so the vague form is rejected
 * rather than scored. Traditions genuinely disagree here, and naming the text
 * is what lets a reader see which one is being followed.
 */
const VAGUE_SOURCE_PATTERNS = [
  new RegExp('\\b(?:ancient|classical|old|sacred)\\s+(?:texts?|scriptures?|literature|books?|writings?)\\s+(?:say|says|state|states|mention|mentions|tell|tells|suggest|suggests|describe|describes)\\b', 'i'),
  new RegExp('\\baccording\\s+to\\s+(?:the\\s+)?(?:ancient|classical|sacred)\\s+(?:texts?|scriptures?|literature|writings?)\\b', 'i'),
  new RegExp('\\bit\\s+is\\s+(?:said|believed|written)\\s+in\\s+(?:the\\s+)?(?:ancient|classical|old)\\s+(?:texts?|scriptures?)\\b', 'i'),
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
  // EXACTLY this many FAQs, at the end of every article. The owner's requirement
  // (2026-10-13), and an exact count rather than a minimum: Google's FAQPage rich
  // result wants a consistent block, and "sometimes 3, sometimes 6" reads as
  // unedited output.
  minFaqs: 5,
  // How many of the article's assigned secondary keywords must actually appear.
  minSecondaryKeywords: 3,
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
function check(article, opts = {}) {
  const { keyword, limits = {}, existing = [], stage = 'final' } = opts;
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

  if (wordsEn < L.minWordsEn) fail('TOO_SHORT_EN', `${wordsEn} words < ${L.minWordsEn}`);
  if (wordsEn > L.maxWordsEn) fail('TOO_LONG_EN', `${wordsEn} words > ${L.maxWordsEn}`);
  if (h2Count < L.minH2) fail('TOO_FEW_H2', `${h2Count} < ${L.minH2}`);

  // HINDI IS NOT CHECKED HERE, IN EITHER STAGE, AND THAT IS DELIBERATE.
  //
  // A draft is English-only by construction — generate.addHindi() runs only after
  // this gate passes, so that a rejected attempt does not pay for a translation
  // of an article about to be discarded (three attempts x two calls x 130s would
  // also blow the systemd unit's 600s budget).
  //
  // And at the FINAL stage, bad Hindi must not reject a good English article:
  // Hindi is best-effort, and both apps already fall back to English when the
  // column is empty. The orchestrator therefore calls checkHindi() separately and
  // DROPS the Hindi rather than failing the article. Folding these back in here
  // would mean one weak translation discarded 1,100 good English words.
  void titleHi; void wordsHi; // measured for `stats`, judged by checkHindi()

  // An <h1> inside the body would compete with the page's own <h1>, which
  // blog-post.html renders from the title. Two h1s on a page is a classic
  // self-inflicted on-page error.
  if (/<h1[\s>]/i.test(contentEn)) fail('H1_IN_BODY');

  const faqCount = (article?.faqs || []).filter((f) => f && f.question && f.answer).length;
  if (faqCount !== L.minFaqs) fail('WRONG_FAQ_COUNT', `${faqCount}, want exactly ${L.minFaqs}`);
  // Duplicated questions would satisfy the count while giving the reader nothing,
  // and a FAQPage block with repeated `name` values is invalid structured data.
  const qs = (article?.faqs || []).map((f) => String(f?.question || '').trim().toLowerCase()).filter(Boolean);
  if (qs.length !== new Set(qs).size) fail('DUPLICATE_FAQ_QUESTIONS');

  // ── Metadata ──────────────────────────────────────────────────────────────
  if (meta.length < L.metaMinChars || meta.length > L.metaMaxChars) {
    fail('META_LENGTH', `${meta.length} chars, want ${L.metaMinChars}-${L.metaMaxChars}`);
  }
  if (excerpt.length < L.excerptMinChars || excerpt.length > L.excerptMaxChars) {
    fail('EXCERPT_LENGTH', `${excerpt.length} chars, want ${L.excerptMinChars}-${L.excerptMaxChars}`);
  }

  // ── Brand ─────────────────────────────────────────────────────────────────
  // The owner's actual requirement: Astrowani named several times per article,
  // not once. It is the FINAL article that has to satisfy that.
  //
  // The draft floor is lower than the final one, for the same reason the link
  // check is skipped on a draft: generate.assemble() appends the CTA, which names
  // Astrowani two or three more times. Holding the draft to the final number
  // rejects articles that would have passed once assembled — measured against the
  // real API on 2026-10-13, three generations in a row came back with exactly 3
  // mentions and were discarded, when assembly would have taken them to 5-6.
  const mentionFloor = stage === 'draft'
    ? Math.max(1, L.minAstrowaniMentions - 2)
    : L.minAstrowaniMentions;
  if (mentions < mentionFloor) fail('TOO_FEW_BRAND_MENTIONS', `${mentions} < ${mentionFloor} (${stage})`);
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

  // ── Keyword breadth ───────────────────────────────────────────────────────
  //
  // THE DEFECT THIS EXISTS FOR: the first two published articles used one keyword
  // each and identical anchor text, so the whole blog taught a search engine the
  // same handful of phrases. `secondaryKeywords` are assigned per article from a
  // 455-phrase bank; this checks that some of them genuinely landed rather than
  // being ignored by the model.
  const secondary = Array.isArray(opts.secondaryKeywords) ? opts.secondaryKeywords : [];
  let secondaryHits = 0;
  const secondaryFound = [];
  for (const k of secondary) {
    if (phraseCount(contentEn, k)) { secondaryHits += 1; secondaryFound.push(k); }
  }
  // CHECKED AT BOTH STAGES, and the draft stage is the one that matters: assembly
  // adds no keywords, so a shortfall here is entirely the model's output — which
  // means it is RETRYABLE. Checking only at the final stage (as the first version
  // did) threw away a finished article, complete with a downloaded and uploaded
  // photograph, instead of simply asking the model again.
  if (secondary.length && secondaryHits < L.minSecondaryKeywords) {
    fail('TOO_FEW_SECONDARY_KEYWORDS', `${secondaryHits} of ${secondary.length} used, want ${L.minSecondaryKeywords}`);
  }

  // Anchor text must not be a carbon copy of the last few posts. Checked at the
  // final stage only, since anchors are added by assembly.
  const anchors = [...contentEn.matchAll(/<a\s[^>]*>([^<]{2,80})<\/a>/gi)].map((m) => m[1].trim().toLowerCase());
  const distinctAnchors = new Set(anchors);
  if (stage === 'final' && anchors.length >= 3) {
    const prevAnchorSets = (opts.recentAnchorSets || []);
    for (const prev of prevAnchorSets) {
      const prevSet = new Set((prev || []).map((a) => String(a).trim().toLowerCase()));
      if (!prevSet.size) continue;
      let shared = 0;
      for (const a of distinctAnchors) if (prevSet.has(a)) shared += 1;
      // Some overlap is fine and expected ("Astrowani" will recur). An IDENTICAL
      // anchor set is the failure — that is what the first two posts had.
      if (shared === distinctAnchors.size && shared === prevSet.size) {
        fail('ANCHOR_SET_IDENTICAL_TO_RECENT', `${shared} anchors, all shared`);
        break;
      }
    }
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
  for (const re of AWKWARD_KEYWORD_PATTERNS) {
    const hit = re.exec(plainEn) || re.exec(titleEn);
    if (hit) fail('KEYWORD_STUFFED', `"${String(hit[0]).slice(0, 60)}"`);
  }
  for (const re of VAGUE_SOURCE_PATTERNS) {
    const hit = re.exec(plainEn);
    if (hit) fail('VAGUE_SOURCE', `"${String(hit[0]).slice(0, 60)}"`);
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
      faqCount, secondaryHits, secondaryFound, distinctAnchors: distinctAnchors.size,
      maxSimilarity: Number(maxSim.toFixed(3)),
    },
  };
}

/**
 * Judge the Hindi half on its own.
 *
 * SEPARATE FROM check() BECAUSE THE CONSEQUENCE IS DIFFERENT. A failure here
 * means "drop the Hindi and publish the English", not "discard the article" — the
 * Hindi columns are allowed to be empty and both apps fall back to English, which
 * is the pre-existing behaviour. Rejecting 1,100 good English words over one weak
 * translation would be the wrong trade.
 *
 * `{ ok: true, skipped: true }` when there is no Hindi at all, so a caller cannot
 * confuse "no Hindi was produced" with "the Hindi is bad".
 */
function checkHindi(article, { limits = {} } = {}) {
  const L = { ...DEFAULT_LIMITS, ...limits };
  const rejections = [];
  const contentHi = article?.contentHi || '';
  const plainHi = stripHtml(contentHi);

  if (!plainHi) return { ok: true, skipped: true, rejections: [], stats: { wordsHi: 0, devanagariPct: 0 } };

  const wordsHi = wordCount(contentHi);
  const devanagari = (plainHi.match(/[ऀ-ॿ]/g) || []).length;
  const pct = (devanagari / plainHi.length) * 100;

  if (!String(article.titleHi || '').trim()) rejections.push('TITLE_HI_MISSING');
  if (wordsHi < L.minWordsHi) rejections.push(`TOO_SHORT_HI: ${wordsHi} words < ${L.minWordsHi}`);

  // A model under load will happily return the ENGLISH text again for contentHi,
  // and nothing downstream would notice — the app's Hindi toggle would simply
  // show English, which is the exact bug src/autoTranslate.js exists to fix.
  // Transliterated Hindi in Latin script fails this too, and should: it is not
  // what a Hindi reader expects and it ranks for nothing.
  if (pct < 25) rejections.push(`HINDI_NOT_HINDI: ${pct.toFixed(0)}% Devanagari`);

  for (const re of BANNED_PATTERNS) {
    const hit = re.exec(plainHi);
    if (hit) rejections.push(`BANNED_CLAIM: "${String(hit[0]).slice(0, 60)}"`);
  }
  for (const re of SCAFFOLD_PATTERNS) {
    const hit = re.exec(plainHi) || re.exec(article.titleHi || '');
    if (hit) rejections.push(`SCAFFOLD_LEAKED: "${String(hit[0]).slice(0, 60)}"`);
  }

  return {
    ok: rejections.length === 0,
    skipped: false,
    rejections,
    stats: { wordsHi, devanagariPct: Number(pct.toFixed(1)) },
  };
}

module.exports = {
  check,
  checkHindi,
  similarity,
  shingles,
  DEFAULT_LIMITS,
  BANNED_PATTERNS,
  SCAFFOLD_PATTERNS,
  AWKWARD_KEYWORD_PATTERNS,
  VAGUE_SOURCE_PATTERNS,
};
