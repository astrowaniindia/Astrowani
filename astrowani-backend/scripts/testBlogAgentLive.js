#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// End-to-end verification against the LIVE database and storage bucket, with
// the language model stubbed.
//
//   node --env-file=.env scripts/testBlogAgentLive.js
//
// WHY THE MODEL IS STUBBED AND EVERYTHING ELSE IS REAL: the Gemini keys live
// only in the VPS .env (CLAUDE.md), so a real generation cannot run from a dev
// machine. Everything AFTER the model, though — the image pipeline, the storage
// upload, the slug uniqueness check against real rows, the insert, the ledger,
// the degraded-column retry — is exactly the part where a wrong column name or a
// bad bucket path fails silently. That is what this exercises.
//
// SAFETY, and these are not optional:
//  * index.js is NEVER booted. It starts sessionManager, which bills real
//    customers against this same database (CLAUDE.md; `local-backend-bills-
//    production` memory). This script starts no server and no workers.
//  * The article is published as a DRAFT (is_published = false), so it cannot
//    appear on the website or in the app even for the seconds it exists —
//    GET /api/blogs filters on is_published, which this suite asserts.
//  * Teardown deletes the blog row, the ledger rows and the storage object, then
//    ASSERTS they are gone. A test that leaves rows in production is worse than
//    no test.
// ─────────────────────────────────────────────────────────────────────────────

// The stub has to be installed BEFORE generate.js is first required, because
// that module destructures `generate` out of gemini.js at require time — patching
// the export afterwards would leave the original bound.
const geminiMod = require('../src/blogAgent/gemini');

let modelCalls = 0;
let nextReply = null;
// The stub answers BOTH passes. generate.draftEnglish() asks for the English
// keys and generate.addHindi() asks for the Hindi ones; returning the whole
// fixture to both is harmless, because each pass reads only the keys it wants.
geminiMod.generate = async () => {
  modelCalls += 1;
  if (!nextReply) throw new Error('stub: no reply queued');
  return { text: JSON.stringify(nextReply), model: 'stub-model', tier: 'stub' };
};

const { createClient } = require('@supabase/supabase-js');
const agent = require('../src/blogAgent');
const images = require('../src/blogAgent/images');
const store = require('../src/blogAgent/publish');
const seo = require('../src/blogAgent/seo');
const quality = require('../src/blogAgent/quality');
const sharp = require('sharp');

let pass = 0; let fail = 0;
const failures = [];
const ok = (name, cond, detail) => {
  if (cond) { pass += 1; console.log(`  PASS  ${name}`); } else {
    fail += 1; failures.push(name); console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
};
const eq = (name, a, b) => ok(name, a === b, `got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`);
const section = (t) => console.log(`\n── ${t} ──`);

// A marker that makes every artefact this suite creates findable and deletable,
// even if the process dies halfway through.
const MARK = `zzz-agent-selftest-${Date.now()}`;

function fixtureReply(titleSuffix = '') {
  const para = ('Mangal dosh is read from the position of Mars in the birth chart, and the classical '
    + 'texts treat it as a matter of degree rather than a verdict. Where Mars sits, which house it '
    + 'rules and whether a benefic planet aspects it all change the reading, which is why two '
    + 'astrologers can look at one kundali and stress different things without either being wrong. '
    + 'In practice the placement tends to delay rather than prevent, and the delay commonly breaks '
    + 'once the relevant antardasha has closed. ').repeat(3);
  const paraHi = ('मंगल दोष कुंडली में मंगल की स्थिति से देखा जाता है और शास्त्र इसे निर्णय के बजाय '
    + 'मात्रा का विषय मानते हैं। मंगल किस भाव में है, किसका स्वामी है और कोई शुभ ग्रह उसे देख रहा है '
    + 'या नहीं — ये सब पाठ बदल देते हैं। व्यवहार में यह विवाह को रोकता नहीं, टालता है। Astrowani पर '
    + 'verified ज्योतिषी ऐसी कुंडली रोज़ देखते हैं और सीधा उत्तर देते हैं। ').repeat(5);

  return {
    titleEn: `Mangal Dosh in the Kundali${titleSuffix}`,
    titleHi: `कुंडली में मंगल दोष${titleSuffix}`,
    metaDescription: 'Mangal dosh explained plainly — what it means in your kundali, how serious it '
      + 'really is, when it cancels out, and which remedies astrologers actually use.',
    metaDescriptionHi: 'मंगल दोष क्या है, कुंडली में इसका असर कितना होता है, कब यह स्वतः समाप्त हो '
      + 'जाता है और ज्योतिषी कौन से उपाय बताते हैं — सरल भाषा में पूरी जानकारी यहाँ पढ़िए।',
    excerpt: 'Mangal dosh is more common and less frightening than it sounds. Here is what it really '
      + 'means in a kundali, and when it cancels out on its own.',
    excerptHi: 'मंगल दोष जितना डरावना लगता है उतना है नहीं। जानिए कुंडली में इसका असली अर्थ।',
    imageQuery: 'brass temple oil lamp',
    imageAlt: 'A brass oil lamp burning in a temple, used in mangal dosh remedies',
    contentEn: `<p>If you have been told your kundali carries mangal dosh, the useful first fact is that `
      + `it is common, and Astrowani astrologers read charts like yours every day. ${para}</p>`
      + `<h2>What mangal dosh actually means</h2><p>${para}</p>`
      + `<h2>When it cancels out</h2><p>${para}</p>`
      + `<ul><li>Check which house Mars occupies.</li><li>Look for a cancelling aspect.</li>`
      + `<li>Ask a verified astrologer on Astrowani to read the chart itself.</li></ul>`
      + `<h2>Remedies traditionally advised</h2><p>${para}</p>`
      + `<p>Astrowani keeps verified astrologers available by chat and call, and an Astrowani `
      + `consultation against your own birth details beats any general rule.</p>`,
    contentHi: `${paraHi}<h2>मंगल दोष का अर्थ</h2><p>${paraHi}</p>`,
    faqs: [
      { question: 'Is mangal dosh really a problem for marriage?', answer: 'It usually delays rather than denies. The house Mars occupies matters more than the label.' },
      { question: 'Can mangal dosh cancel out by itself?', answer: 'Yes. Several classical cancellations exist, including when both charts carry it.' },
      { question: 'Which remedies are advised?', answer: 'Tuesday fasting and specific daan are common. The remedy should match the chart.' },
    ],
    faqsHi: [
      { question: 'क्या मंगल दोष विवाह में बाधा है?', answer: 'यह आमतौर पर विवाह को टालता है, रोकता नहीं।' },
      { question: 'क्या यह स्वयं समाप्त हो सकता है?', answer: 'हाँ, कई शास्त्रीय स्थितियों में यह स्वतः समाप्त माना जाता है।' },
    ],
  };
}

const created = { blogIds: [], runIds: [], objects: [] };

(async () => {
  const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  try {
    // ═══════════════════════════════════════════════════════════════════════
    section('schema — sql/blog_agent.sql must be applied');
    // ═══════════════════════════════════════════════════════════════════════
    const probe = await db.from('blogs').select('id, slug, excerpt_hi, meta_description_hi').limit(1);
    ok('blogs has slug, excerpt_hi and meta_description_hi', !probe.error, probe.error?.message);
    const ledgerProbe = await db.from('blog_agent_runs').select('id').limit(1);
    ok('blog_agent_runs is readable by the service role', !ledgerProbe.error, ledgerProbe.error?.message);
    if (probe.error || ledgerProbe.error) throw new Error('schema not ready — apply sql/blog_agent.sql first');

    // ═══════════════════════════════════════════════════════════════════════
    section('the admin blog editor was BROKEN before this migration');
    // ═══════════════════════════════════════════════════════════════════════
    // astrowani-admin's Blogs.jsx always sends excerpt_hi and meta_description_hi
    // (they are in its EMPTY object) and adminRoutes.js crud('blogs') has both in
    // `allowed` — but the columns did not exist, so PostgREST refused the whole
    // statement and EVERY admin blog save failed. This asserts the exact payload
    // shape the admin sends now succeeds.
    const adminShaped = {
      title: `${MARK} admin-shaped`,
      excerpt: 'x', excerpt_hi: 'y', meta_description: 'z', meta_description_hi: 'w',
      thumbnail: '', category_id: null, title_en: 'a', content_en: '<p>b</p>',
      title_hi: 'c', content_hi: '<p>d</p>', is_published: false,
    };
    const adminIns = await db.from('blogs').insert([adminShaped]).select('id').single();
    ok('an admin-shaped save (with both Hindi columns) now succeeds', !adminIns.error, adminIns.error?.message);
    if (adminIns.data?.id) created.blogIds.push(adminIns.data.id);

    // ═══════════════════════════════════════════════════════════════════════
    section('reading the blog\'s current state');
    // ═══════════════════════════════════════════════════════════════════════
    const state = await store.loadBlogState(db);
    ok(`loadBlogState returned ${state.recent.length} recent posts`, state.recent.length > 0);
    ok('takenSlugs is a Set', state.takenSlugs instanceof Set);
    ok('recent posts carry text for the duplicate check', state.recent.some((r) => r.text && r.text.length > 50));
    const history = await store.loadAgentHistory(db);
    ok('loadAgentHistory does not report the ledger missing', history.ledgerMissing === false);
    ok('usedTopicKeys is a Set', history.usedTopicKeys instanceof Set);

    // The real five posts have no slug; uniqueSlug must still work against them.
    const freshSlug = seo.uniqueSlug(seo.slugify('Mangal Dosh in the Kundali'), state.takenSlugs);
    ok(`a slug is available for a new article ("${freshSlug}")`, !!freshSlug && !state.takenSlugs.has(freshSlug));

    // ═══════════════════════════════════════════════════════════════════════
    section('the image pipeline, against the real storage bucket');
    // ═══════════════════════════════════════════════════════════════════════
    // No PEXELS/PIXABAY/UNSPLASH key is set here, so this exercises the no-key
    // fallback — the path that guarantees an article always has a thumbnail.
    const gen = await images.generatedImage('Mangal Dosh in the Kundali', 'brass temple oil lamp');
    const genMeta = await sharp(gen.buffer).metadata();
    eq('the generated image is the right width', genMeta.width, images.OUT_WIDTH);
    eq('the generated image is the right height', genMeta.height, images.OUT_HEIGHT);
    eq('it is a JPEG', genMeta.format, 'jpeg');
    ok(`text rendering support on this machine: ${await images.canRenderText()}`, true);
    // Deterministic from the title, so a re-run reproduces the same picture.
    const gen2 = await images.generatedImage('Mangal Dosh in the Kundali', 'brass temple oil lamp');
    ok('the generated image is deterministic for the same input', gen.buffer.equals(gen2.buffer));
    const gen3 = await images.generatedImage('Vastu for the Kitchen', 'kitchen window');
    ok('a different article produces a different image', !gen.buffer.equals(gen3.buffer));

    const uploaded = await images.upload(db, gen.buffer);
    created.objects.push(uploaded.objectName);
    ok('upload returned a public URL', /^https:\/\/.+\/app-images\/blogs\/.+\.jpg$/.test(uploaded.url), uploaded.url);
    // Assert on what a BROWSER receives, not on what the SDK returned.
    const headRes = await fetch(uploaded.url);
    eq('the uploaded image is publicly fetchable', headRes.status, 200);
    eq('it is served as a JPEG', headRes.headers.get('content-type'), 'image/jpeg');
    const fetched = Buffer.from(await headRes.arrayBuffer());
    ok('the bytes served match the bytes uploaded', fetched.equals(gen.buffer),
      `${fetched.length} vs ${gen.buffer.length}`);

    // EXIF must not survive: a stock photo can carry camera and GPS metadata.
    const withExif = await sharp({ create: { width: 1600, height: 900, channels: 3, background: '#334' } })
      .withMetadata({ exif: { IFD0: { Copyright: 'test-exif-marker' } } }).jpeg().toBuffer();
    ok('the fixture really has EXIF to begin with (control)',
      !!(await sharp(withExif).metadata()).exif);
    // fetchAndNormalise takes a URL, so round-trip through the bucket to test it.
    const exifUp = await images.upload(db, withExif);
    created.objects.push(exifUp.objectName);
    const normalised = await images.fetchAndNormalise(exifUp.url);
    const nMeta = await sharp(normalised).metadata();
    ok('a downloaded photo is cropped to 1200x675', nMeta.width === 1200 && nMeta.height === 675,
      `${nMeta.width}x${nMeta.height}`);
    ok('EXIF is stripped from the stored image', !nMeta.exif);

    // ═══════════════════════════════════════════════════════════════════════
    section('a full runOnce — stubbed model, everything else real');
    // ═══════════════════════════════════════════════════════════════════════
    nextReply = fixtureReply(` ${MARK}`);
    const cfg = {
      limits: quality.DEFAULT_LIMITS,
      maxAttemptsPerArticle: 2,
      relatedCount: 3,
      publish: false, // DRAFT — must never be publicly visible
      maxPerDay: 99,
    };
    const lines = [];
    const result = await agent.runOnce({
      db, cfg, log: (m) => lines.push(m), dryRun: false,
      forcedTopic: { key: `${MARK}-topic`, title: 'Mangal Dosh', keyword: 'mangal dosh', category: 'Marriage' },
      state, history,
    });

    eq('runOnce published', result.status, 'published');
    // TWO calls for an accepted article: the English pass, then the Hindi pass. The
// Hindi pass runs only because the English was accepted — see below for the
// rejected case, which must cost ONE.
eq('the model was called twice: English then Hindi', modelCalls, 2);
    if (result.blogId) created.blogIds.push(result.blogId);
    ok(`slug is "${result.slug}"`, /^mangal-dosh-in-the-kundali/.test(result.slug), result.slug);
    ok('the article is reported as a draft', result.published === false);

    // ── What actually landed in the row ────────────────────────────────────
    const row = (await db.from('blogs').select('*').eq('id', result.blogId).single()).data;
    ok('the row exists', !!row);
    eq('is_published is false (draft)', row.is_published, false);
    eq('title and title_en agree', row.title, row.title_en);
    ok('title_hi is Devanagari', /[ऀ-ॿ]/.test(row.title_hi || ''), row.title_hi);
    ok('content_hi is Devanagari', /[ऀ-ॿ]/.test(row.content_hi || ''));
    eq('slug was stored', row.slug, result.slug);
    ok('category_id resolved to the Marriage category', !!row.category_id);
    ok('excerpt_hi was stored (the new column)', !!row.excerpt_hi, String(row.excerpt_hi));
    ok('meta_description_hi was stored', !!row.meta_description_hi);
    // The five pre-existing rows put a 2005-style keyword list in this column
    // ("numerology, Palmistry, Astrology, Prediction, Solution, Remedies") and
    // Home.js renders it as the visible line under a blog card. A sentence is
    // both better SEO and better UI.
    //
    // "has fewer than N commas" was the first version of this check and it was
    // WRONG — a good sentence happily carries three. What distinguishes a list is
    // that its comma-separated fragments are one or two words each, so measure
    // that instead.
    const avgWordsPerClause = (s) => {
      const parts = String(s || '').split(',').map((p) => p.trim()).filter(Boolean);
      if (!parts.length) return 0;
      return parts.reduce((n, p) => n + p.split(/\s+/).length, 0) / parts.length;
    };
    ok('meta_description reads as a SENTENCE, not a keyword list',
      avgWordsPerClause(row.meta_description) > 3 && row.meta_description.length > 70,
      `avg ${avgWordsPerClause(row.meta_description).toFixed(1)} words/clause: ${row.meta_description}`);
    // The control: the real value from an existing row must be classified as a list.
    ok('  (control: the legacy keyword-list style IS detected as a list)',
      avgWordsPerClause('numerology, Palmistry, Astrology, Prediction, Solution, Remedies') <= 3);
    ok('thumbnail points at the storage bucket',
      /\/app-images\/blogs\/.+\.jpg$/.test(row.thumbnail || ''), row.thumbnail);
    if (row.thumbnail) {
      const m = /\/app-images\/(blogs\/[^?]+)$/.exec(row.thumbnail);
      if (m) created.objects.push(m[1]);
      const imgRes = await fetch(row.thumbnail);
      eq('the thumbnail is publicly fetchable', imgRes.status, 200);
      const tMeta = await sharp(Buffer.from(await imgRes.arrayBuffer())).metadata();
      ok('the thumbnail is 1200x675', tMeta.width === 1200 && tMeta.height === 675, `${tMeta.width}x${tMeta.height}`);
    }

    // ── The SEO payload a crawler would read ───────────────────────────────
    section('the published HTML, as a crawler and the app receive it');
    const html = row.content_en;
    ok('no model-written links survive — every href is ours',
      (html.match(/href="([^"]*)"/g) || []).every((h) => h.includes(seo.SITE_BASE) || h.includes('play.google.com')),
      (html.match(/href="([^"]*)"/g) || []).join(' '));
    const hrefs = [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
    ok(`${hrefs.length} links in the body`, hrefs.length >= 3);
    ok('no link is relative', hrefs.every((h) => /^https?:\/\//.test(h)), hrefs.join(' '));
    ok('no anchor is left unclosed',
      (html.match(/<a\b/gi) || []).length === (html.match(/<\/a>/gi) || []).length);
    ok('no <h1> competes with the page heading', !/<h1/i.test(html));
    ok('no inline style or class attribute', !/\s(style|class)=/i.test(html));
    const ldMatch = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html);
    ok('JSON-LD is present', !!ldMatch);
    if (ldMatch) {
      let parsed = null;
      try { parsed = JSON.parse(ldMatch[1]); } catch (e) { /* asserted next */ }
      ok('JSON-LD parses', !!parsed);
      if (parsed) {
        const article = parsed['@graph'].find((n) => n['@type'] === 'Article');
        eq('the Article url matches the slug', article.mainEntityOfPage['@id'], seo.postUrl(result.slug));
        ok('the Article image is the stored thumbnail', article.image[0] === row.thumbnail, article.image[0]);
        ok('an FAQPage node is present', parsed['@graph'].some((n) => n['@type'] === 'FAQPage'));
      }
    }
    // The app ignores <script> (BlogScreen.js ignoredDomTags), so the JSON-LD
    // must not be the only place the FAQ text exists.
    ok('the FAQ text is also visible prose, not only JSON-LD',
      html.includes('Frequently asked questions') && html.includes('Is mangal dosh really a problem'));
    ok('the Hindi body has no JSON-LD (one URL, one @graph)', !/ld\+json/.test(row.content_hi));

    // ── The ledger ─────────────────────────────────────────────────────────
    section('the ledger');
    const runRow = (await db.from('blog_agent_runs').select('*').eq('blog_id', result.blogId).single()).data;
    ok('a ledger row was written', !!runRow);
    if (runRow) {
      created.runIds.push(runRow.id);
      eq('status is published', runRow.status, 'published');
      eq('topic_key was recorded', runRow.topic_key, `${MARK}-topic`);
      eq('the slug was recorded', runRow.slug, result.slug);
      ok('the model is recorded', /stub-model/.test(runRow.model || ''), runRow.model);
      ok('the image source is recorded', !!runRow.image_source, runRow.image_source);
      ok('a word count is recorded', runRow.word_count > 700, String(runRow.word_count));
      ok('finished_at was set', !!runRow.finished_at);
      ok('rejections is empty for a published article', JSON.stringify(runRow.rejections) === '[]');
    }

    // ── A draft must be invisible to the public API ────────────────────────
    section('a draft is invisible to the website and the app');
    const pubRes = await fetch('https://backend.astrowani.com/api/blogs?limit=50&page=1');
    const pubJson = await pubRes.json();
    eq('GET /api/blogs answers 200', pubRes.status, 200);
    ok('the draft does NOT appear in the public list',
      !pubJson.data.some((b) => b._id === result.blogId), 'draft leaked to the public API');
    // Positive control: the endpoint really is returning posts, so the check above
    // is not passing merely because the list was empty.
    ok(`  (control: the endpoint returned ${pubJson.data.length} published posts)`, pubJson.data.length > 0);

    // ── A rejection must be recorded, not published ────────────────────────
    section('a rejected generation publishes nothing');
    const before = (await db.from('blogs').select('id', { count: 'exact', head: true })).count;
    nextReply = { ...fixtureReply(' bad'), contentEn: '<p>Far too short to publish.</p>' };
    const rejState = await store.loadBlogState(db);
    const rejHistory = await store.loadAgentHistory(db);
    const callsBeforeReject = modelCalls; // BEFORE the run — see the cost assertion below
    const rejResult = await agent.runOnce({
      db, cfg: { ...cfg, maxAttemptsPerArticle: 2 }, log: () => {}, dryRun: false,
      forcedTopic: { key: `${MARK}-reject`, title: 'Bad', keyword: 'mangal dosh', category: 'Marriage' },
      state: rejState, history: rejHistory,
    });
    eq('runOnce reports rejected', rejResult.status, 'rejected');
    ok('it says WHY', (rejResult.rejections || []).some((r) => r.startsWith('TOO_SHORT_EN')), JSON.stringify(rejResult.rejections));
    const after = (await db.from('blogs').select('id', { count: 'exact', head: true })).count;
    eq('no blog row was created', after, before);
    const rejLedger = (await db.from('blog_agent_runs').select('*').eq('topic_key', `${MARK}-reject`)).data || [];
    eq('the rejection IS recorded in the ledger', rejLedger.length, 1);
    for (const r of rejLedger) created.runIds.push(r.id);
    if (rejLedger[0]) {
      eq('  with status rejected', rejLedger[0].status, 'rejected');
      ok('  and the reasons stored', JSON.stringify(rejLedger[0].rejections).includes('TOO_SHORT_EN'),
        JSON.stringify(rejLedger[0].rejections));
      eq('  and both attempts counted', rejLedger[0].attempts, 2);
      // THE COST OF A REJECTION: one call per attempt, not two. Running the Hindi
      // pass before the gate meant every discarded article paid for a translation
      // — and three attempts x two calls x up to 130s each exceeds the 600s
      // TimeoutStartSec of the systemd unit, so the unit would have been killed
      // mid-retry and looked like a hang rather than a rejection.
      //
      // The count is taken BEFORE the run. An earlier version of this assertion
      // captured it after, which made it arithmetically always true — a dead test
      // that looked like a passing one.
      eq('  2 rejected attempts cost 2 model calls, not 4 (no Hindi on a reject)',
        modelCalls - callsBeforeReject, 2);
      ok('  and no blog_id', !rejLedger[0].blog_id);
    }
    // No orphaned image: the gate runs BEFORE the image is fetched, so a
    // rejection must not have left an object in the public bucket.
    ok('a rejected article uploaded no image', !rejLedger[0] || !rejLedger[0].image_source,
      String(rejLedger[0]?.image_source));

    // ── The disabled switch ────────────────────────────────────────────────
    section('the master switch');
    const callsBeforeDisabled = modelCalls; // BEFORE, so the check can actually fail
    const disabled = await agent.run({ db, log: () => {}, count: 1 });
    eq('run() does nothing while the agent is disabled', disabled.ran, false);
    eq('  and says why', disabled.reason, 'disabled');
    eq('  and the model was not called at all', modelCalls - callsBeforeDisabled, 0);

    // ═══════════════════════════════════════════════════════════════════════
    section('teardown');
    // ═══════════════════════════════════════════════════════════════════════
  } catch (err) {
    fail += 1; failures.push('SUITE ERROR');
    console.log(`\n  FAIL  suite threw — ${err.message}`);
    if (process.env.BLOG_AGENT_DEBUG) console.log(err.stack);
  } finally {
    const db2 = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    for (const id of created.runIds) await db2.from('blog_agent_runs').delete().eq('id', id);
    // Catch any ledger row the suite created but did not capture an id for.
    await db2.from('blog_agent_runs').delete().like('topic_key', `${MARK}%`);
    for (const id of created.blogIds) await db2.from('blogs').delete().eq('id', id);
    await db2.from('blogs').delete().like('title', `${MARK}%`);
    let removeError = null;
    if (created.objects.length) {
      const rm = await db2.storage.from(images.BUCKET).remove(created.objects);
      removeError = rm.error ? rm.error.message : null;
    }
    ok('teardown: storage remove reported no error', !removeError, removeError);

    // ASSERT the teardown worked. "I called delete" is not the same as "it is gone".
    const leftBlogs = (await db2.from('blogs').select('id').or(`title.like.${MARK}%,slug.like.%${MARK}%`)).data || [];
    const leftRuns = (await db2.from('blog_agent_runs').select('id').like('topic_key', `${MARK}%`)).data || [];
    const leftSelfTest = (await db2.from('blogs').select('id, title').ilike('title', '%agent-selftest%')).data || [];
    eq('teardown: 0 test blogs remain', leftBlogs.length, 0);
    eq('teardown: 0 ledger rows remain', leftRuns.length, 0);
    eq('teardown: 0 self-test blogs of any vintage remain', leftSelfTest.length, 0);
    // Checked with the storage API, NOT by fetching the public URL. A deleted
    // object keeps answering 200 from Supabase's CDN edge for a while, so a URL
    // probe reports a leak that is not there — which is exactly what it did on
    // the first run of this suite. `list` reads the bucket itself.
    const names = created.objects.map((o) => o.replace(`${images.FOLDER}/`, ''));
    const listed = await db2.storage.from(images.BUCKET).list(images.FOLDER, { limit: 1000, search: MARK });
    const stillThere = [];
    for (const n of names) {
      const r = await db2.storage.from(images.BUCKET).list(images.FOLDER, { limit: 1, search: n });
      if (!r.error && (r.data || []).some((f) => f.name === n)) stillThere.push(n);
    }
    eq(`teardown: all ${created.objects.length} storage objects are gone`, stillThere.length, 0);
    ok('  (checked via the storage API, not the CDN-cached public URL)', !listed.error, listed.error?.message);

    console.log(`\n${'═'.repeat(60)}`);
    console.log(`${pass} passed, ${fail} failed`);
    if (fail) { console.log('\nfailing:'); for (const f of failures) console.log(`  - ${f}`); }
    process.exit(fail ? 1 : 0);
  }
})();
