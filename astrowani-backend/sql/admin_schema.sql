-- Admin Dashboard schema — tables for the Astrowani admin web app.
--
-- WHY: Adds an `admins` table (email/password login for the admin dashboard) and
-- makes the previously-mocked customer-app content (blogs, banners, thought of the
-- day, categories) database-driven so the admin can author it. Also adds moderation
-- columns to `astrologers` (approval/suspension).
--
-- HOW TO RUN: Supabase Dashboard → SQL Editor → paste & Run.
-- Safe to re-run: uses CREATE TABLE IF NOT EXISTS / ADD COLUMN IF NOT EXISTS.

-- ── Admins ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.admins (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         text UNIQUE NOT NULL,
  password_hash text NOT NULL,            -- bcrypt hash
  name          text,
  role          text NOT NULL DEFAULT 'admin',
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- ── Categories ──────────────────────────────────────────────────────────────--
-- Consumed by customer Home carousel ({categories:[{_id,name,image}]}) and vendor
-- Registration skill list.
-- NOTE: a `categories` table may already exist (id, name) from the vendor app, in
-- which case CREATE TABLE IF NOT EXISTS is a no-op — so the ADD COLUMN statements
-- below backfill the columns the admin dashboard needs onto the existing table.
CREATE TABLE IF NOT EXISTS public.categories (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  image       text,
  sort_order  int  NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS image      text;
ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS sort_order int NOT NULL DEFAULT 0;
ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

-- ── Blogs ───────────────────────────────────────────────────────────────────--
-- Columns map to the shape the customer app already expects (see /api/blogs mapping).
CREATE TABLE IF NOT EXISTS public.blogs (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title            text NOT NULL,
  excerpt          text,
  meta_description text,
  thumbnail        text,                  -- URL or base64 data-URI
  category_id      uuid REFERENCES public.categories(id) ON DELETE SET NULL,
  title_en         text,
  content_en       text,                  -- HTML
  title_hi         text,
  content_hi       text,                  -- HTML
  is_published     boolean NOT NULL DEFAULT false,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- ── Banners ─────────────────────────────────────────────────────────────────--
-- Customer Home banner carousel ({data:[{id,title,description,imageUrl}]}).
CREATE TABLE IF NOT EXISTS public.banners (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title       text,
  description text,
  image       text,                       -- URL or base64 data-URI
  link        text,
  sort_order  int NOT NULL DEFAULT 0,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ── Thoughts (Thought of the Day) ───────────────────────────────────────────--
-- Customer Home reads the latest active one ({thoughtText:"..."}).
CREATE TABLE IF NOT EXISTS public.thoughts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  text        text NOT NULL,
  author      text,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ── Astrologer moderation columns ───────────────────────────────────────────--
ALTER TABLE public.astrologers ADD COLUMN IF NOT EXISTS approval_status text NOT NULL DEFAULT 'pending'; -- pending|approved|rejected
ALTER TABLE public.astrologers ADD COLUMN IF NOT EXISTS is_suspended boolean NOT NULL DEFAULT false;
ALTER TABLE public.astrologers ADD COLUMN IF NOT EXISTS admin_notes text;
