#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// Bring already-published articles up to the current FAQ rules.
//
//   node --experimental-websocket --env-file=.env scripts/normaliseBlogFaqs.js --dry-run
//   node --experimental-websocket --env-file=.env scripts/normaliseBlogFaqs.js
//   node --experimental-websocket --env-file=.env scripts/normaliseBlogFaqs.js --slug <slug>
//
// WHY THIS EXISTS. The FAQ rules changed twice after articles were already live:
// exactly 5 questions (was 2-4), a constant recognisable heading (was rotated),
// and the block moved to the END of the article (was buried above the related
// posts and the CTA). Articles published before those changes are inconsistent
// with everything published after, which is visible to any reader who opens two
// of them — so they are migrated rather than left as a ragged edge.
//
// IT REWRITES ONLY THE FAQ SECTION AND THE JSON-LD. The article's prose, its
// internal links, its image, its slug and its Hindi body are untouched, because
// changing a live URL or re-rolling good prose to fix a heading would be a far
// bigger intervention than the problem warrants.
//
// SAFE TO RE-RUN: an article already carrying 5 FAQs under the right heading in
// the right place is skipped, so this is idempotent.
// ─────────────────────────────────────────────────────────────────────────────
const { createClient } = require('@supabase/supabase-js');
const { generate: callGemini, parseJson } = require('../src/blogAgent/gemini');
const quality = require('../src/blogAgent/quality');
const seo = require('../src/blogAgent/seo');
const { normaliseFaqs } = require('../src/blogAgent/generate');

const WANT = quality.DEFAULT_LIMITS.minFaqs;
const FAQ_HEADING = 'Frequently asked questions';
const FAQ_HEADING_HI = 'Aksar pooche jaane wale sawal';

/** Every heading the FAQ block has ever been published under. */
const KNOWN_FAQ_HEADINGS = [
  FAQ_HEADING, 'Common questions about this', 'Questions people ask most',
  'Your questions, answered', 'Quick answers to common doubts',
];
const KNOWN_FAQ_HEADINGS_HI = [
  FAQ_HEADING_HI, 'Isse juday aam sawaal', 'Logon ke sabse aam sawaal', 'Aapke sawaal, hamare jawab',
];

const esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Cut the existing FAQ block out of an article body.
 *
 * The block runs from its <h2> up to the next <h2> or the end. Returns the body
 * without it plus the questions it held, so nothing already written is thrown
 * away — the model is asked only for the shortfall.
 */
function extractFaqBlock(html, headings) {
  for (const h of headings) {
    const re = new RegExp(`<h2>${esc(h)}</h2>([\\s\\S]*?)(?=<h2>|<script|$)`, 'i');
    const m = re.exec(html);
    if (!m) continue;
    const inner = m[1];
    const faqs = [];
    // Two formats have been published: the original <h3>question</h3><p>answer</p>
    // and the current <details><summary>…</summary><p>…</p> accordion. Both are
    // read, so this migrates one to the other and is safe to re-run.
    const accordionRe = /<details[^>]*>\s*<summary>([\s\S]*?)<\/summary>\s*<p>([\s\S]*?)<\/p>\s*<\/details>/gi;
    const headingRe = /<h3>([\s\S]*?)<\/h3>\s*<p>([\s\S]*?)<\/p>/gi;
    for (const re of [accordionRe, headingRe]) {
      let pm;
      while ((pm = re.exec(inner)) !== null) {
        faqs.push({ question: seo.stripHtml(pm[1]).trim(), answer: seo.stripHtml(pm[2]).trim() });
      }
      if (faqs.length) break;
    }
    return { html: html.replace(m[0], ''), faqs, heading: h };
  }
  return { html, faqs: [], heading: null };
}

/** Ask the model for enough extra questions to reach WANT, avoiding the existing ones. */
async function topUpFaqs({ title, bodyText, existing, hindi, log }) {
  const need = WANT - existing.length;
  if (need <= 0) return existing.slice(0, WANT);

  const prompt = `Below is a published Astrowani article. Write ${need} more frequently-asked question(s)
for it${hindi ? ', in Hindi (Devanagari script)' : ''}.

${existing.length ? `It ALREADY has these questions — do not repeat or rephrase them:
${existing.map((f, i) => `${i + 1}. ${f.question}`).join('\n')}
` : ''}
Each new question must be one a real reader would actually type, answerable from the article,
and distinct from the ones above. Answers: 2-4 sentences of plain text, no HTML, genuinely
useful rather than a restatement of the article.

TITLE: ${title}

ARTICLE:
${bodyText.slice(0, 6000)}

Return ONLY JSON:
{ "faqs": [ { "question": "...", "answer": "..." } ] }`;

  const res = await callGemini({ prompt, json: true, temperature: 0.8, maxOutputTokens: 4096, log });
  const added = normaliseFaqs(parseJson(res.text)?.faqs);
  const seen = new Set(existing.map((f) => f.question.toLowerCase()));
  const merged = [...existing];
  for (const f of added) {
    if (merged.length >= WANT) break;
    if (seen.has(f.question.toLowerCase())) continue;
    seen.add(f.question.toLowerCase());
    merged.push(f);
  }
  return merged.slice(0, WANT);
}

(async () => {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const onlySlug = args.includes('--slug') ? args[args.indexOf('--slug') + 1] : null;
  const log = (...a) => console.log('  ' + a.join(' '));

  const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  let q = db.from('blogs').select('id, slug, title, content_en, content_hi').not('slug', 'is', null);
  if (onlySlug) q = q.eq('slug', onlySlug);
  const { data, error } = await q.order('created_at', { ascending: true });
  if (error) throw new Error(error.message);

  console.log(`${data.length} agent article(s) to check — target: exactly ${WANT} FAQs, `
    + `heading "${FAQ_HEADING}", block LAST\n`);

  let changed = 0;
  for (const b of data) {
    console.log(`${b.title}`);
    const en = extractFaqBlock(b.content_en || '', KNOWN_FAQ_HEADINGS);
    const hi = extractFaqBlock(b.content_hi || '', KNOWN_FAQ_HEADINGS_HI);

    // Already correct? Right count, right heading, already the last section, AND
    // already an accordion. The <h2> now carries a class, so the regex must allow
    // attributes — matching only `<h2>` silently found nothing and made every
    // article look like it was in the wrong place.
    const lastH2 = [...String(b.content_en).matchAll(/<h2[^>]*>([^<]+)<\/h2>/g)].map((m) => m[1]).pop();
    const isAccordion = /<details class="aw-faq">/.test(b.content_en || '');
    if (en.faqs.length === WANT && en.heading === FAQ_HEADING && lastH2 === FAQ_HEADING && isAccordion) {
      console.log(`  already correct (${WANT} FAQs, accordion, last section) — skipping\n`);
      continue;
    }
    console.log(`  found ${en.faqs.length} EN / ${hi.faqs.length} HI FAQs under "${en.heading || 'no heading'}"`);

    const faqsEn = await topUpFaqs({
      title: b.title, bodyText: seo.stripHtml(en.html), existing: en.faqs, hindi: false, log,
    });
    let faqsHi = hi.faqs;
    if (b.content_hi) {
      faqsHi = await topUpFaqs({
        title: b.title, bodyText: seo.stripHtml(hi.html), existing: hi.faqs, hindi: true, log,
      });
    }
    console.log(`  now ${faqsEn.length} EN / ${faqsHi.length} HI`);

    // Rebuild: body without its old FAQ block, JSON-LD stripped and re-emitted
    // (its FAQPage node must match the questions actually on the page), then the
    // FAQ block appended LAST.
    const credit = (/<p class="aw-photo-credit">[\s\S]*?<\/p>/.exec(en.html) || [''])[0];
    let bodyEn = en.html.replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/gi, '');
    if (credit) bodyEn = bodyEn.replace(credit, '');

    const nextEn = bodyEn
      + seo.faqHtml(faqsEn, { heading: FAQ_HEADING })
      + seo.jsonLd({
        title: b.title, description: '', slug: b.slug, faqs: faqsEn,
      })
      + credit;
    const nextHi = b.content_hi
      ? hi.html + seo.faqHtml(faqsHi.length ? faqsHi : faqsEn, { heading: FAQ_HEADING_HI })
      : b.content_hi;

    if (dryRun) {
      console.log('  [dry run] not saved');
      console.log(`  questions: ${faqsEn.map((f) => f.question).join(' | ')}\n`);
      continue;
    }
    const { error: upErr } = await db.from('blogs')
      .update({ content_en: nextEn, content_hi: nextHi, updated_at: new Date().toISOString() })
      .eq('id', b.id);
    if (upErr) { console.log(`  FAILED: ${upErr.message}\n`); continue; }
    changed += 1;
    console.log('  saved\n');
  }

  console.log(`done: ${changed} article(s) updated${dryRun ? ' (dry run — nothing saved)' : ''}`);
  process.exit(0);
})().catch((e) => { console.error('FATAL:', e.message); process.exit(2); });
