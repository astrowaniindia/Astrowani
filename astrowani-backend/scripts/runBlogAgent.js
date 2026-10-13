#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// The blog agent's entry point. This is what cron runs on the VPS.
//
//   node --env-file=.env scripts/runBlogAgent.js                 one article
//   node --env-file=.env scripts/runBlogAgent.js --count 3        three
//   node --env-file=.env scripts/runBlogAgent.js --dry-run        write, check, print, store NOTHING
//   node --env-file=.env scripts/runBlogAgent.js --draft          publish as is_published=false
//   node --env-file=.env scripts/runBlogAgent.js --topic mangal-dosh
//   node --env-file=.env scripts/runBlogAgent.js --status         what it has done lately
//   node --env-file=.env scripts/runBlogAgent.js --enable         turn the agent on
//   node --env-file=.env scripts/runBlogAgent.js --disable        turn it off
//
// SAFE TO RUN FROM A DEV MACHINE — unlike index.js, which must never be booted
// locally because sessionManager immediately starts billing real customers
// against the production database (CLAUDE.md, and the `local-backend-bills-
// production` memory). This script starts no workers and no server; it does one
// job and exits. --dry-run writes nothing at all.
// ─────────────────────────────────────────────────────────────────────────────
const agent = require('../src/blogAgent');
const configModule = require('../src/blogAgent/config');
const topicsModule = require('../src/blogAgent/topics');
const { geminiKeys } = require('../src/blogAgent/gemini');

function parseArgs(argv) {
  const out = { count: null, dryRun: false, draft: false, topic: null, status: false, enable: null, quiet: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--count' || a === '-n') out.count = parseInt(argv[++i], 10);
    else if (a === '--dry-run' || a === '--dry') out.dryRun = true;
    else if (a === '--draft') out.draft = true;
    else if (a === '--topic') out.topic = argv[++i];
    else if (a === '--status') out.status = true;
    else if (a === '--enable') out.enable = true;
    else if (a === '--disable') out.enable = false;
    else if (a === '--quiet' || a === '-q') out.quiet = true;
    else if (a === '--help' || a === '-h') out.help = true;
    else if (a.startsWith('--count=')) out.count = parseInt(a.slice(8), 10);
    else if (a.startsWith('--topic=')) out.topic = a.slice(8);
  }
  return out;
}

// Timestamped lines, because this runs from cron and its output lands in a log
// file read long after the fact. A bare message there is nearly useless.
function makeLog(quiet) {
  return (...args) => {
    if (quiet) return;
    const t = new Date().toISOString().replace('T', ' ').slice(0, 19);
    console.log(`[${t}] ${args.join(' ')}`);
  };
}

async function showStatus(db, log) {
  const cfg = await configModule.load(db, { log: () => {} });
  const cat = topicsModule.catalogueSize();

  log('── configuration ──');
  log(`  enabled           ${cfg.enabled ? 'YES' : 'no'}`);
  log(`  publish live      ${cfg.publish ? 'YES' : 'no (drafts)'}`);
  log(`  articles per run  ${cfg.articlesPerRun}`);
  log(`  daily cap         ${cfg.maxPerDay}`);
  log(`  attempts/article  ${cfg.maxAttemptsPerArticle}`);
  if (cfg.configError) log(`  CONFIG ERROR      ${cfg.configError}`);

  log('── providers ──');
  const keys = geminiKeys();
  log(`  gemini keys       ${keys.length ? keys.map((k) => k.tier).join(', ') : 'NONE — the agent cannot write'}`);
  const img = ['PEXELS_API_KEY', 'PIXABAY_API_KEY', 'UNSPLASH_ACCESS_KEY'].filter((k) => process.env[k]);
  log(`  image providers   ${img.length ? img.join(', ') : 'none set — will generate branded images locally'}`);
  log(`  site base url     ${require('../src/blogAgent/seo').SITE_BASE}`);

  log('── catalogue ──');
  const { data: runs, error } = await db
    .from('blog_agent_runs')
    .select('started_at, status, topic_title, slug, word_count, image_source, rejections, error')
    .order('started_at', { ascending: false })
    .limit(15);

  if (error) {
    log(`  (blog_agent_runs unreadable: ${error.message})`);
    log(`  topics            ${cat.total} total (${cat.seeds} curated + ${cat.generated} generated)`);
    return;
  }

  const history = await require('../src/blogAgent/publish').loadAgentHistory(db);
  log(`  topics            ${cat.total} total, ${history.usedTopicKeys.size} used, `
    + `${cat.total - history.usedTopicKeys.size} left (~${Math.floor((cat.total - history.usedTopicKeys.size) / 3)} days at 3/day)`);
  log(`  published today   ${history.publishedToday} of ${cfg.maxPerDay}`);

  log('── last 15 runs ──');
  if (!runs.length) log('  (none yet)');
  for (const r of runs) {
    const when = String(r.started_at).replace('T', ' ').slice(0, 16);
    const detail = r.status === 'published'
      ? `${r.word_count || '?'}w  ${r.slug || ''}  [${r.image_source || 'no image'}]`
      : (r.error || (r.rejections || []).join('; ') || '');
    log(`  ${when}  ${String(r.status).padEnd(9)} ${r.topic_title || '?'}${detail ? `  — ${detail}` : ''}`);
  }
}

async function setEnabled(db, value, log) {
  // THE RAW ROW, NOT THE MERGED CONFIG. Writing back the merged object froze every
  // code default into the database — after which raising a threshold in the code
  // changed nothing, because the stored row still held the old value. That is how
  // the agent came to publish an article with 2 FAQs while the code said 5.
  //
  // So: start from what is actually stored, flip one flag, and persist nothing
  // else. Anything absent here keeps following the code defaults, which is what a
  // default is for.
  const current = await configModule.loadRaw(db);
  const next = { ...current, enabled: value };
  delete next.configError;

  // Upsert on `key`. app_settings stores `value` as a JSON STRING everywhere
  // else in this codebase (freeChatAi, analyticsSince, free_call_offer), so it
  // is stringified here too — writing a JSON object where every other reader
  // expects a string would break those readers' JSON.parse.
  const { error } = await db
    .from('app_settings')
    .upsert([{ key: configModule.SETTINGS_KEY, value: JSON.stringify(next) }], { onConflict: 'key' });
  if (error) throw new Error(`could not write ${configModule.SETTINGS_KEY}: ${error.message}`);

  log(`blog agent is now ${value ? 'ENABLED' : 'DISABLED'}.`);
  if (value) {
    // Report the RESOLVED config (row over code defaults), not `next` — `next` is
    // deliberately sparse now, so most of its fields are undefined.
    const resolved = await configModule.load(db, { log: () => {} });
    log(`  publish mode: ${resolved.publish ? 'LIVE' : 'drafts'}; ${resolved.articlesPerRun} article(s) per run; cap ${resolved.maxPerDay}/day`);
    log(`  thresholds: ${resolved.limits.minWordsEn}+ words, exactly ${resolved.limits.minFaqs} FAQs, ${resolved.limits.minAstrowaniMentions}+ brand mentions`);
    log('  the cron schedule decides when it actually runs — see vps-deployment/blog-agent/README.md');
  }
}

function usage() {
  console.log(`Astrowani blog agent

  node --env-file=.env scripts/runBlogAgent.js [options]

  --count N, -n N   articles to write this invocation (default: config)
  --dry-run         generate and check, print the result, store NOTHING
  --draft           publish with is_published = false
  --topic KEY       force a specific catalogue topic (e.g. mangal-dosh)
  --status          show configuration, provider keys and recent runs
  --enable          turn the agent on
  --disable         turn the agent off
  --quiet, -q       no progress output
  --help, -h        this
`);
}

(async () => {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) { usage(); process.exit(0); }

  const log = makeLog(args.quiet);

  try {
    if (args.status || args.enable !== null) {
      const db = agent.makeClient();
      if (args.enable !== null) await setEnabled(db, args.enable, log);
      if (args.status) await showStatus(db, log);
      process.exit(0);
    }

    const result = await agent.run({
      count: args.count,
      dryRun: args.dryRun,
      draft: args.draft,
      topicKey: args.topic,
      // --dry-run and --topic are explicit operator actions, so they are allowed
      // to run while the agent is switched off. That is what makes testing on the
      // VPS possible before turning it on for real.
      ignoreEnabled: args.dryRun || !!args.topic,
      log,
    });

    if (args.dryRun) {
      for (const r of result.results) {
        if (r.status !== 'dry-run') continue;
        console.log('\n════════════════════════════════════════════════════════');
        console.log(`TITLE (en): ${r.article.titleEn}`);
        console.log(`TITLE (hi): ${r.article.titleHi}`);
        console.log(`SLUG:       ${r.slug}`);
        console.log(`META:       ${r.article.metaDescription}`);
        console.log(`EXCERPT:    ${r.article.excerpt}`);
        console.log(`IMAGE Q:    ${r.article.imageQuery}  |  ALT: ${r.article.imageAlt}`);
        console.log(`STATS:      ${JSON.stringify(r.stats)}`);
        console.log('──────────────── content_en ────────────────');
        console.log(r.article.contentEn);
        console.log('──────────────── content_hi ────────────────');
        console.log(r.article.contentHi);
      }
    }

    // A non-zero exit when a scheduled run published nothing, so cron's MAILTO
    // or a systemd OnFailure actually reports it. A run that was never meant to
    // publish (dry run, disabled, explicit --topic) exits 0.
    const expectedToPublish = result.ran && !args.dryRun;
    process.exit(expectedToPublish && !result.published ? 1 : 0);
  } catch (err) {
    console.error(`[blog-agent] FATAL: ${err.message}`);
    if (process.env.BLOG_AGENT_DEBUG) console.error(err.stack);
    process.exit(2);
  }
})();
