// ─────────────────────────────────────────────────────────────────────────────
// The orchestrator: pick a topic, write it, check it, illustrate it, publish it.
//
// Called by scripts/runBlogAgent.js, which is what cron runs. Deliberately NOT
// started from index.js: the backend is a single Node process on one core
// (CLAUDE.md DN) and an article is a slow, bursty job with a 2-minute model call
// in it. Running it in-process would put that on the same event loop that serves
// calls and chat. It is also why the agent must never be a setInterval inside the
// server — see sessionManager for what a 30-second worker in that process costs.
// ─────────────────────────────────────────────────────────────────────────────
const { createClient } = require('@supabase/supabase-js');

const configModule = require('./config');
const topics = require('./topics');
const generate = require('./generate');
const quality = require('./quality');
const images = require('./images');
const store = require('./publish');
const seo = require('./seo');

function makeClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) throw new Error('SUPABASE_URL is not set');
  if (!key) {
    // The agent writes to `blogs` and uploads to storage; the publishable key can
    // do neither since the 2026-09-23 hardening passes revoked every anon and
    // authenticated write in `public`. Failing loudly here beats a confusing
    // 42501 three steps later.
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set — the agent cannot write without it');
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

/**
 * Write one article.
 *
 * Returns a result object rather than throwing for an ordinary rejection:
 * "the model wrote something unpublishable three times" is a normal outcome for
 * an unattended agent and the caller should record it and move on, not crash.
 * A genuine fault (no key, database unreachable) does throw.
 */
async function runOnce({ db, cfg, log, dryRun = false, forcedTopic = null, state, history }) {
  const limits = cfg.limits;

  // ── Topic ────────────────────────────────────────────────────────────────
  let topic = forcedTopic;
  if (!topic) {
    const picked = topics.pickTopics(1, history.usedTopicKeys, { usedCount: history.usedTopicKeys.size });
    topic = picked[0];
  }
  if (!topic) {
    // 2,383 topics is ~2.2 years at three a day. Reaching the end is a real
    // event, not an impossible one, and it must be loud: the agent stops rather
    // than silently rewriting old subjects, which is the failure that would
    // damage the rankings it spent two years building.
    return { status: 'skipped', reason: 'TOPIC_CATALOGUE_EXHAUSTED', topic: null };
  }
  log(`topic: ${topic.title}  [${topic.key}] (${topic.source || 'forced'}, ${topic.category}) kw="${topic.keyword}"`);

  const runId = dryRun ? null : await store.openRun(db, { topic });

  try {
    // ── Related posts, for the internal link graph ─────────────────────────
    const related = state.recent
      .filter((r) => r.slug)
      .slice(0, cfg.relatedCount)
      .map((r) => ({ title: r.title, slug: r.slug }));

    // ── Write, check, retry ────────────────────────────────────────────────
    let article = null;
    let verdict = null;
    let attempts = 0;

    for (let attempt = 1; attempt <= cfg.maxAttemptsPerArticle; attempt += 1) {
      attempts = attempt;
      log(`attempt ${attempt}/${cfg.maxAttemptsPerArticle}: asking the model…`);
      // ENGLISH ONLY at this point. The Hindi pass runs after this gate passes,
      // so a rejected attempt costs one model call instead of two — and three
      // attempts cannot exceed the systemd unit's 600s TimeoutStartSec.
      const drafted = await generate.draftEnglish({
        topic,
        limits,
        related,
        recentTitles: state.recent.map((r) => r.title).filter(Boolean),
        log,
      });

      // The gate runs on the DRAFT, before an image is fetched and uploaded.
      // Ordering matters: checking after illustrating would leave an orphaned
      // object in the public bucket on every rejection, and nothing ever deletes
      // those.
      verdict = quality.check(drafted, { keyword: topic.keyword, limits, existing: state.recent, stage: 'draft' });
      log(`  stats: ${JSON.stringify(verdict.stats)}`);

      if (verdict.ok) { article = drafted; break; }
      log(`  REJECTED: ${verdict.rejections.join('; ')}`);
    }

    if (!article) {
      await store.closeRun(db, runId, {
        status: 'rejected', attempts, model: verdict?.model || null,
        rejections: verdict?.rejections || [], word_count: verdict?.stats?.wordsEn || null,
      });
      return { status: 'rejected', topic, rejections: verdict?.rejections || [], attempts };
    }

    // ── Hindi ──────────────────────────────────────────────────────────────
    // Only now, on an article that has earned it.
    log('  English accepted — translating to Hindi…');
    article = await generate.addHindi(article, { topic, limits, log });

    const hindiVerdict = quality.checkHindi(article, { limits });
    if (hindiVerdict.skipped) {
      log('  no Hindi returned — publishing English only (the apps fall back)');
    } else if (!hindiVerdict.ok) {
      // DROP the Hindi, do NOT reject the article. Hindi is best-effort and both
      // apps already fall back to English on an empty column; discarding 1,100
      // good English words over one weak translation would be the wrong trade.
      log(`  Hindi rejected (${hindiVerdict.rejections.join('; ')}) — dropping it, publishing English only`);
      article = {
        ...article, titleHi: '', metaDescriptionHi: '', excerptHi: '', contentHi: '', faqsHi: [],
      };
    } else {
      log(`  Hindi accepted: ${hindiVerdict.stats.wordsHi} words, ${hindiVerdict.stats.devanagariPct}% Devanagari`);
    }

    // ── Slug ───────────────────────────────────────────────────────────────
    const slug = seo.uniqueSlug(seo.slugify(article.titleEn), state.takenSlugs);
    state.takenSlugs.add(slug); // claim it now so two articles in one run cannot collide

    // ── Image ──────────────────────────────────────────────────────────────
    let image = { url: null, ref: null, provider: 'none', credit: null };
    if (!dryRun) {
      image = await images.acquire(db, {
        query: article.imageQuery,
        title: article.titleEn,
        avoidRefs: history.recentImageRefs,
        log: (m) => log(`  ${m}`),
      });
    } else {
      log('  [dry run] skipping image fetch and upload');
    }

    // ── Assemble the final HTML ────────────────────────────────────────────
    const publishedAt = new Date().toISOString();
    const assembled = generate.assemble(article, {
      topic, slug, imageUrl: image.url, imageAlt: article.imageAlt, related, publishedAt,
    });

    // Unsplash's licence asks for a credit; the other providers' do not. Appended
    // after assembly so it sits below the article, and after the JSON-LD so it
    // cannot land inside the script block.
    if (image.credit) assembled.contentEn += images.creditHtml(image.credit);

    // ── Re-check the ASSEMBLED article ─────────────────────────────────────
    //
    // The draft passed, but assembly is what adds the links, the CTA (which
    // mentions Astrowani twice more) and the FAQ block — so the final word count,
    // link count, brand-mention count and keyword density are all different
    // numbers from the ones that passed. Checking only the draft would mean the
    // thresholds that matter were never applied to what actually gets published.
    const finalVerdict = quality.check(assembled, { keyword: topic.keyword, limits, existing: state.recent, stage: 'final' });
    if (!finalVerdict.ok) {
      log(`  REJECTED AFTER ASSEMBLY: ${finalVerdict.rejections.join('; ')}`);
      await store.closeRun(db, runId, {
        status: 'rejected', attempts, model: article.model,
        rejections: finalVerdict.rejections.map((r) => `post-assembly ${r}`),
        word_count: finalVerdict.stats.wordsEn, image_source: image.ref,
      });
      return { status: 'rejected', topic, rejections: finalVerdict.rejections, attempts, stage: 'assembly' };
    }

    log(`  final: ${finalVerdict.stats.wordsEn} words, ${finalVerdict.stats.mentions} brand mentions, `
      + `${finalVerdict.stats.internalLinks} links, kw x${finalVerdict.stats.keywordHits} `
      + `(${finalVerdict.stats.density}%), slug "${slug}"`);

    if (dryRun) {
      await store.closeRun(db, runId, { status: 'skipped', attempts, model: article.model });
      return { status: 'dry-run', topic, slug, article: assembled, stats: finalVerdict.stats };
    }

    // ── Publish ────────────────────────────────────────────────────────────
    const catId = await store.categoryId(db, topic.category);
    if (!catId) log(`  WARNING: category "${topic.category}" not found — publishing uncategorised`);

    const inserted = await store.insertBlog(db, assembled, {
      slug, categoryId: catId, imageUrl: image.url, publish: cfg.publish,
    });

    await store.closeRun(db, runId, {
      status: 'published', attempts, model: article.model, image_source: image.ref,
      word_count: finalVerdict.stats.wordsEn, blog_id: inserted.id, slug,
      category_id: catId, rejections: [],
    });

    // Keep the in-run state current so a second article in the same invocation
    // dedups against the first — both for slugs and for near-duplicate text.
    state.recent.unshift({ id: inserted.id, title: assembled.titleEn, slug, text: seo.stripHtml(assembled.contentEn).slice(0, 6000) });
    history.usedTopicKeys.add(topic.key);
    if (image.ref) history.recentImageRefs.unshift(image.ref);

    log(`PUBLISHED ${cfg.publish ? '(live)' : '(draft)'}: ${assembled.titleEn}`);
    log(`  ${seo.postUrl(slug)}`);

    return {
      status: 'published', topic, slug, blogId: inserted.id,
      title: assembled.titleEn, stats: finalVerdict.stats,
      image: { provider: image.provider, ref: image.ref },
      published: cfg.publish,
    };
  } catch (err) {
    await store.closeRun(db, runId, { status: 'failed', error: String(err.message).slice(0, 1000) });
    throw err;
  }
}

/**
 * One scheduled invocation: write `count` articles.
 *
 * `count` defaults to the configured articlesPerRun. The daily cap is checked
 * against the ledger BEFORE anything is generated, and again between articles,
 * so a run cannot blow through it by generating first and counting after.
 */
async function run({
  count = null, dryRun = false, draft = false, topicKey = null,
  log = console.log, db: injectedDb = null, ignoreEnabled = false,
} = {}) {
  const db = injectedDb || makeClient();
  const cfg = await configModule.load(db, { log });

  if (draft) cfg.publish = false;

  if (!cfg.enabled && !ignoreEnabled) {
    log(`agent is DISABLED (app_settings.${configModule.SETTINGS_KEY}.enabled is not true) — nothing to do.`);
    log('  turn it on with: node --env-file=.env scripts/runBlogAgent.js --enable');
    return { ran: false, reason: 'disabled', results: [] };
  }

  const wanted = Math.max(1, Math.min(10, count || cfg.articlesPerRun));

  const [state, history] = await Promise.all([
    store.loadBlogState(db),
    store.loadAgentHistory(db),
  ]);
  if (history.ledgerMissing) {
    log('WARNING: blog_agent_runs does not exist — apply sql/blog_agent.sql.');
    log('  Without it the agent cannot remember which topics it has used, so it will');
    log('  start again from the top of the catalogue on every run. Refusing to publish.');
    return { ran: false, reason: 'ledger-missing', results: [] };
  }

  log(`blog agent: ${state.recent.length} recent posts known, ${history.usedTopicKeys.size} topics used, `
    + `${history.publishedToday} published today (cap ${cfg.maxPerDay})`);
  const cat = topics.catalogueSize();
  log(`catalogue: ${cat.total} topics (${cat.seeds} curated + ${cat.generated} generated), `
    + `${cat.total - history.usedTopicKeys.size} unused`);

  let forcedTopic = null;
  if (topicKey) {
    forcedTopic = topics.SEED_TOPICS.find((t) => t.key === topicKey) || null;
    if (!forcedTopic) {
      for (let i = 0; i < cat.generated && !forcedTopic; i += 1) {
        const t = topics.familyTopic(i);
        if (t && t.key === topicKey) forcedTopic = t;
      }
    }
    if (!forcedTopic) throw new Error(`--topic "${topicKey}" is not in the catalogue`);
  }

  const results = [];
  for (let i = 0; i < wanted; i += 1) {
    if (!dryRun && history.publishedToday + results.filter((r) => r.status === 'published').length >= cfg.maxPerDay) {
      log(`daily cap of ${cfg.maxPerDay} reached — stopping.`);
      results.push({ status: 'skipped', reason: 'DAILY_CAP' });
      break;
    }
    log(`\n── article ${i + 1} of ${wanted} ──`);
    try {
      results.push(await runOnce({ db, cfg, log, dryRun, forcedTopic, state, history }));
    } catch (err) {
      log(`FAILED: ${err.message}`);
      results.push({ status: 'failed', error: err.message });
    }
  }

  const published = results.filter((r) => r.status === 'published').length;
  const tally = (s) => results.filter((r) => r.status === s).length;
  // A dry run produces status 'dry-run', which belongs in this line too — the
  // first version counted only the four real outcomes, so a successful dry run
  // reported "0 published, 0 rejected, 0 failed, 0 skipped" and read as though
  // nothing had happened.
  const dryRuns = tally('dry-run');
  log(`\ndone: ${published} published, ${tally('rejected')} rejected, `
    + `${tally('failed')} failed, ${tally('skipped')} skipped`
    + (dryRuns ? `, ${dryRuns} generated but not stored (dry run)` : ''));

  return { ran: true, published, results, config: cfg };
}

module.exports = { run, runOnce, makeClient };
