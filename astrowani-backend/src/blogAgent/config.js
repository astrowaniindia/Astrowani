// ─────────────────────────────────────────────────────────────────────────────
// Runtime configuration, read from `app_settings.blog_agent_config`.
//
// Same pattern as freeChatAi / freeCallRoutes / analyticsSince: a JSON blob in
// app_settings, merged over code defaults.
//
// AND THE SAME TRAP, which CLAUDE.md records twice (DR: the free-call duration,
// DU: the Dakshina amounts) — editing DEFAULTS here changes nothing in
// production once a row exists, because the row wins. If a value needs changing
// on the live site, change the ROW. The defaults exist so a fresh database
// behaves sensibly, not as the place to tune a running agent.
// ─────────────────────────────────────────────────────────────────────────────
const { DEFAULT_LIMITS } = require('./quality');

const SETTINGS_KEY = 'blog_agent_config';

const DEFAULTS = {
  // The master switch. OFF by default: installing this code must not start
  // publishing to a live site on the next cron tick. It is turned on
  // deliberately, once.
  enabled: false,

  // Articles per invocation. The scheduler calls the agent three times a day
  // with count 1, rather than once with count 3, so a provider outage costs one
  // article instead of the whole day — and so the three posts carry different
  // timestamps, which a blog published by people would.
  articlesPerRun: 1,

  // Publish straight away, or leave as a draft for the admin to flip.
  publish: true,

  // How many times to re-ask the model when the quality gate rejects an article.
  // Two retries, then the slot is skipped: a third attempt on a prompt the model
  // is failing is rarely the one that works, and the ledger makes the pattern
  // visible so the prompt can be fixed.
  maxAttemptsPerArticle: 3,

  // Hard ceiling per calendar day (IST), counted from the ledger. The guard
  // against a misconfigured cron, a hung run restarted by hand, or two overlapping
  // schedules quietly publishing twenty articles overnight.
  maxPerDay: 4,

  // Recent posts linked from each new article, for the internal link graph.
  relatedCount: 3,

  limits: { ...DEFAULT_LIMITS },
};

/** Clamp a number into a range, falling back to the default on anything odd. */
function num(v, def, min, max) {
  const n = Number(v);
  if (!Number.isFinite(n)) return def;
  return Math.min(max, Math.max(min, n));
}

function bool(v, def) {
  if (v === true || v === 'true') return true;
  if (v === false || v === 'false') return false;
  return def;
}

/**
 * Load and normalise. Never throws: a malformed blob falls back to defaults with
 * a warning, because the alternative is a cron job that dies on a typo somebody
 * made in the admin dashboard.
 *
 * It does NOT fail open on `enabled`, though — a config that cannot be read
 * leaves the agent off. This is the opposite choice from src/audience.js and for
 * the opposite reason: there, failing open withholds nothing from a customer;
 * here, failing open publishes to a live website with nobody watching.
 */
async function load(db, { log = () => {} } = {}) {
  let parsed = {};
  try {
    const { data, error } = await db
      .from('app_settings').select('value').eq('key', SETTINGS_KEY).limit(1);
    if (error) throw error;
    if (data && data.length && data[0].value) {
      parsed = typeof data[0].value === 'string' ? JSON.parse(data[0].value) : (data[0].value || {});
    }
  } catch (err) {
    log(`WARNING: could not read ${SETTINGS_KEY} (${err.message}) — agent stays disabled`);
    return { ...DEFAULTS, enabled: false, configError: err.message };
  }

  const merged = { ...DEFAULTS, ...parsed };
  merged.enabled = bool(parsed.enabled, DEFAULTS.enabled);
  merged.publish = bool(parsed.publish, DEFAULTS.publish);
  merged.articlesPerRun = num(parsed.articlesPerRun, DEFAULTS.articlesPerRun, 1, 10);
  merged.maxAttemptsPerArticle = num(parsed.maxAttemptsPerArticle, DEFAULTS.maxAttemptsPerArticle, 1, 5);
  merged.maxPerDay = num(parsed.maxPerDay, DEFAULTS.maxPerDay, 1, 20);
  merged.relatedCount = num(parsed.relatedCount, DEFAULTS.relatedCount, 0, 6);
  // Only the limits actually named are overridden, so adding a new threshold to
  // DEFAULT_LIMITS does not require touching the live row.
  merged.limits = { ...DEFAULT_LIMITS, ...(parsed.limits && typeof parsed.limits === 'object' ? parsed.limits : {}) };

  return merged;
}

/**
 * The stored row EXACTLY as written, with no defaults merged in.
 *
 * WHY THIS EXISTS, and it is not a convenience. `--enable` used to write back the
 * whole MERGED config, which froze every code default into the database at the
 * moment it ran. The consequence was silent and total: raising minFaqs from 2 to 5
 * in the code changed nothing, because the row still said 2 — so the agent
 * published an article with 2 FAQs while the gate believed it was enforcing 5.
 *
 * Any writer must therefore start from THIS, change only what it means to change,
 * and persist nothing it was not asked to persist. A default that is written down
 * stops being a default.
 */
async function loadRaw(db) {
  try {
    const { data, error } = await db
      .from('app_settings').select('value').eq('key', SETTINGS_KEY).limit(1);
    if (error) throw error;
    if (!data || !data.length || !data[0].value) return {};
    return (typeof data[0].value === 'string' ? JSON.parse(data[0].value) : data[0].value) || {};
  } catch (_) {
    return {};
  }
}

module.exports = { load, loadRaw, DEFAULTS, SETTINGS_KEY };
