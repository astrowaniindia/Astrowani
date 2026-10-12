-- Autonomous SEO blog agent (2026-10-13)
--
-- Everything the agent needs that the `blogs` table did not already have.
-- Idempotent — safe to re-run.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- 1. The two Hindi columns the admin dashboard has been SENDING SINCE 2026-08-16
--    but that were never actually created.
--
--    sql/blog_meta_description_hindi_schema.sql was written for this and never
--    applied (CLAUDE.md records excerpt_hi as "blank on every live row"; it is
--    not blank, it does not EXIST). This is not cosmetic: astrowani-admin's
--    Blogs.jsx EMPTY object always carries `excerpt_hi` and
--    `meta_description_hi`, adminRoutes.js crud('blogs') has both in its
--    `allowed` list, so every admin blog save names two non-existent columns and
--    PostgREST refuses the whole statement. Creating them fixes the admin editor
--    as a side effect, and gives the agent somewhere to put the Hindi excerpt and
--    meta description it writes.
ALTER TABLE blogs ADD COLUMN IF NOT EXISTS meta_description_hi text;
ALTER TABLE blogs ADD COLUMN IF NOT EXISTS excerpt_hi text;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Slugs.
--
--    The website links articles as blog-post.html?id=<uuid>. A UUID carries no
--    keyword and reads as machine output to both people and crawlers, and it is
--    the single cheapest on-page SEO fix available here. `slug` is nullable and
--    UNIQUE-when-present, so the five existing rows stay valid with no slug and
--    ?id= keeps working forever (aw/blog.js accepts either).
ALTER TABLE blogs ADD COLUMN IF NOT EXISTS slug text;

-- A partial unique index rather than a UNIQUE constraint: several rows may have
-- NULL (every pre-agent post), and only non-null slugs must be distinct.
CREATE UNIQUE INDEX IF NOT EXISTS blogs_slug_unique ON blogs (slug) WHERE slug IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. The agent's own ledger.
--
--    WHY A TABLE AND NOT A LOG FILE: the agent's single hardest requirement is
--    "never write the same article twice", and it runs as a short-lived cron
--    process with no memory between runs. Topic history therefore has to live
--    somewhere durable and queryable, and it has to survive a VPS redeploy
--    (which resets the checkout, taking any file-based state with it).
--
--    It records FAILED and REJECTED attempts too, not just published ones. A
--    silent agent and a broken agent look identical from the outside otherwise —
--    which is the exact failure mode CLAUDE.md records for astrologerFanout.
CREATE TABLE IF NOT EXISTS blog_agent_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  -- published | rejected | failed | skipped
  status text NOT NULL DEFAULT 'failed',
  -- the topic slug from the catalogue, so a repeat is one indexed lookup
  topic_key text,
  topic_title text,
  category_id uuid REFERENCES categories(id) ON DELETE SET NULL,
  blog_id uuid REFERENCES blogs(id) ON DELETE SET NULL,
  slug text,
  -- which provider actually answered, for diagnosing a quiet agent
  model text,
  image_source text,
  word_count integer,
  -- every gate that failed, so a prompt regression is visible without logs
  rejections jsonb NOT NULL DEFAULT '[]'::jsonb,
  error text,
  attempts integer NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS blog_agent_runs_topic_idx ON blog_agent_runs (topic_key)
  WHERE topic_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS blog_agent_runs_started_idx ON blog_agent_runs (started_at DESC);
CREATE INDEX IF NOT EXISTS blog_agent_runs_status_idx ON blog_agent_runs (status, started_at DESC);

-- Service-role only, like every other agent-owned table here (session_flags,
-- offer_claims, free_call_invites). RLS on with no policy means deny-everyone,
-- which is the correct posture and NOT one of the lints to "fix" (CLAUDE.md CT).
ALTER TABLE blog_agent_runs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON blog_agent_runs FROM anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- Verify:
--   SELECT column_name FROM information_schema.columns
--    WHERE table_name = 'blogs' AND column_name IN ('slug','excerpt_hi','meta_description_hi');
--   SELECT status, count(*) FROM blog_agent_runs GROUP BY status;
