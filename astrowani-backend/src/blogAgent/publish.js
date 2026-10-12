// ─────────────────────────────────────────────────────────────────────────────
// Reading the blog's current state, and writing a finished article into it.
//
// Every write goes through the service-role client, directly to `blogs` — not
// through POST /api/admin/blogs, which would need an admin JWT and would fire
// queueBlogTranslation() on a row whose Hindi is already written by Gemini, i.e.
// spend MyMemory's tiny daily quota re-translating finished text.
// ─────────────────────────────────────────────────────────────────────────────
const { stripHtml } = require('./seo');

/** IST day key. Quotas and "today" are the owner's day, not UTC's. */
function istDayKey(d = new Date()) {
  return new Date(d.getTime() + 330 * 60000).toISOString().slice(0, 10);
}

/** Start of the current IST day, as a UTC ISO string for querying. */
function istDayStartIso(d = new Date()) {
  const ist = new Date(d.getTime() + 330 * 60000);
  ist.setUTCHours(0, 0, 0, 0);
  return new Date(ist.getTime() - 330 * 60000).toISOString();
}

/** Resolve a category name to its id. Null when it does not exist. */
async function categoryId(db, name) {
  if (!name) return null;
  const { data, error } = await db.from('categories').select('id').eq('name', name).limit(1);
  if (error || !data || !data.length) return null;
  return data[0].id;
}

/**
 * What the blog already contains — the context every new article needs.
 *
 * `slug` and `content_en` are selected but the content is immediately reduced to
 * a shingle source for the duplicate check and then discarded. Selecting the full
 * bodies of 60 articles is ~500 KB over the wire; capping at `recentLimit` keeps
 * that bounded as the blog grows past a thousand posts, and the near-duplicate
 * risk is overwhelmingly against RECENT articles anyway (the model's style drifts
 * slowly, so last week's output is what this week's resembles).
 */
async function loadBlogState(db, { recentLimit = 40 } = {}) {
  const [slugsRes, recentRes] = await Promise.all([
    // Every slug ever used, so uniqueSlug cannot collide. Slug-only, so this
    // stays cheap however many posts exist.
    db.from('blogs').select('slug').not('slug', 'is', null),
    db.from('blogs').select('id, title, slug, content_en, created_at')
      .order('created_at', { ascending: false }).limit(recentLimit),
  ]);

  if (slugsRes.error) throw new Error(`could not read slugs: ${slugsRes.error.message}`);
  if (recentRes.error) throw new Error(`could not read recent blogs: ${recentRes.error.message}`);

  const takenSlugs = new Set((slugsRes.data || []).map((r) => r.slug).filter(Boolean));
  const recent = (recentRes.data || []).map((r) => ({
    id: r.id,
    title: r.title,
    slug: r.slug,
    createdAt: r.created_at,
    text: stripHtml(r.content_en || '').slice(0, 6000),
  }));

  return { takenSlugs, recent };
}

/**
 * The topic keys and image refs the agent has already used.
 *
 * Read from `blog_agent_runs` rather than from `blogs`, and this is the reason
 * the ledger exists: a run that FAILED still consumed its topic's good ideas and,
 * more importantly, a run that was REJECTED must not be retried forever on the
 * same subject. Counting only published posts would make the agent loop on a
 * topic the model cannot write well.
 *
 * Returns `{ usedTopicKeys, recentImageRefs, publishedToday }`.
 */
async function loadAgentHistory(db, { imageWindow = 30 } = {}) {
  const empty = { usedTopicKeys: new Set(), recentImageRefs: [], publishedToday: 0, ledgerMissing: false };

  const { data, error } = await db
    .from('blog_agent_runs')
    .select('topic_key, image_source, status, started_at')
    .order('started_at', { ascending: false })
    .limit(4000);

  if (error) {
    // PGRST205 is PostgREST's "table not in the schema cache", i.e. the migration
    // has not been applied. NOT 42P01 — CLAUDE.md records a branch that checked
    // only 42P01 and therefore 500ed instead of degrading. Degrade here: the agent
    // can still write an article, it just cannot dedup topics, so the caller is
    // told and decides.
    if (error.code === 'PGRST205' || error.code === '42P01') return { ...empty, ledgerMissing: true };
    throw new Error(`could not read blog_agent_runs: ${error.message}`);
  }

  const rows = data || [];
  const dayStart = istDayStartIso();
  return {
    usedTopicKeys: new Set(rows.map((r) => r.topic_key).filter(Boolean)),
    recentImageRefs: rows.slice(0, imageWindow).map((r) => r.image_source).filter(Boolean),
    publishedToday: rows.filter((r) => r.status === 'published' && r.started_at >= dayStart).length,
    ledgerMissing: false,
  };
}

/** Open a ledger row at the start of an attempt, so a crashed run still leaves a trace. */
async function openRun(db, { topic }) {
  const { data, error } = await db
    .from('blog_agent_runs')
    .insert([{ status: 'failed', topic_key: topic?.key || null, topic_title: topic?.title || null }])
    .select('id').single();
  if (error) return null; // the ledger is diagnostics; never let it stop a publish
  return data?.id || null;
}

async function closeRun(db, runId, fields) {
  if (!runId) return;
  try {
    await db.from('blog_agent_runs').update({ finished_at: new Date().toISOString(), ...fields }).eq('id', runId);
  } catch (_) { /* diagnostics only */ }
}

/**
 * Insert the article.
 *
 * COLUMN NOTES, each one load-bearing:
 *  - `title` AND `title_en` are both set to the same string. /api/blogs maps
 *    `english.title` as `b.title_en || b.title` and the admin list column reads
 *    `b.title`; filling only one leaves a blank somewhere.
 *  - `meta_description` is a real sentence here. On the existing five rows it
 *    holds a comma-separated keyword list ("numerology, Palmistry, Astrology"),
 *    which is a 2005 meta-keywords habit that Google ignored twenty years ago
 *    and which Home.js renders as the visible line under a blog card. A sentence
 *    is both better SEO and better UI.
 *  - `excerpt` is kept SHORT deliberately. aw/blog.js truncates it to 160 chars
 *    for a card because some existing rows have a whole article pasted in; a
 *    short excerpt survives that path unchanged.
 */
async function insertBlog(db, article, { slug, categoryId: catId, imageUrl, publish }) {
  const row = {
    title: article.titleEn,
    title_en: article.titleEn,
    title_hi: article.titleHi || null,
    content_en: article.contentEn,
    content_hi: article.contentHi || null,
    excerpt: article.excerpt || null,
    meta_description: article.metaDescription || null,
    thumbnail: imageUrl || null,
    category_id: catId || null,
    slug,
    is_published: !!publish,
  };

  // excerpt_hi / meta_description_hi exist only once sql/blog_agent.sql has been
  // applied. Try with them; on a missing-column error, retry without, so the
  // agent is not bricked by an unapplied migration — the same
  // drop-the-optional-group-and-retry shape insertAccountRow uses, and the reason
  // acquisition writes are a separate statement (CLAUDE.md CV).
  const withHindiExtras = {
    ...row,
    excerpt_hi: article.excerptHi || null,
    meta_description_hi: article.metaDescriptionHi || null,
  };

  let res = await db.from('blogs').insert([withHindiExtras]).select('id, slug').single();
  if (res.error && /column .* does not exist|42703|PGRST204/i.test(`${res.error.code} ${res.error.message}`)) {
    res = await db.from('blogs').insert([row]).select('id, slug').single();
  }
  if (res.error) throw new Error(`blog insert failed: ${res.error.message}`);
  return res.data;
}

module.exports = {
  loadBlogState,
  loadAgentHistory,
  categoryId,
  insertBlog,
  openRun,
  closeRun,
  istDayKey,
  istDayStartIso,
};
