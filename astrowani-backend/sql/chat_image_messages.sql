-- ─────────────────────────────────────────────────────────────────────────────
-- Image messages in a consultation chat (customer <-> astrologer, both apps and
-- the website). Adds four columns to chat_messages; changes nothing that exists.
--
-- Apply via the Supabase SQL editor. Idempotent — safe to re-run.
--
-- WHY `message` IS STILL FILLED IN FOR AN IMAGE
--
--   `message` is NOT NULL, and far more things read it than will ever know about
--   `message_type`: the push-notification body the other person sees on their lock
--   screen, the admin off-platform-contact proof view, the session transcript an
--   admin reads during a dispute, and — for a while — every INSTALLED app build
--   that predates the OTA carrying this feature. So an image row stores the photo
--   emoji plus the caption (or just the emoji) in `message`, and every one of those
--   readers degrades to something sensible with no change at all. A NULL, or a raw
--   storage URL dumped in there, would have shown an old build a blank bubble or a
--   line of URL text.
--
-- GRANTS: deliberately none. `anon` and `authenticated` hold zero privileges
-- anywhere in public as of the 2026-09-23/30 hardening passes, and chat_messages
-- is read by the apps through GET /api/chat/messages on the service role. New
-- columns must not re-open that; they inherit the table's (empty) grants.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.chat_messages
  add column if not exists message_type text not null default 'text',
  add column if not exists image_url    text,
  add column if not exists image_width  integer,
  add column if not exists image_height integer;

-- A closed set, so an unknown value can never reach a renderer that has no case
-- for it. Widen this deliberately if a third kind of message is ever added.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'chat_messages_message_type_chk'
  ) then
    alter table public.chat_messages
      add constraint chat_messages_message_type_chk
      check (message_type in ('text', 'image'));
  end if;
end $$;

-- An image row without a URL is not a renderable message, and a text row carrying
-- one is a sign something wrote the wrong shape. Checked here rather than only in
-- the backend because this table has three writers (both apps' endpoint, and the
-- website through the same endpoint) and will outlive any of them.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'chat_messages_image_url_chk'
  ) then
    alter table public.chat_messages
      add constraint chat_messages_image_url_chk
      check (
        (message_type = 'image' and image_url is not null)
        or (message_type <> 'image' and image_url is null)
      );
  end if;
end $$;

-- Self-verifying tail: a migration that reports success while having changed
-- nothing is the failure mode this project has been bitten by (see the index-swap
-- note in CLAUDE.md's standing rules).
do $$
declare
  n_cols int;
begin
  select count(*) into n_cols
  from information_schema.columns
  where table_schema = 'public' and table_name = 'chat_messages'
    and column_name in ('message_type', 'image_url', 'image_width', 'image_height');
  if n_cols <> 4 then
    raise exception 'chat_image_messages.sql did not take effect: % of 4 columns present', n_cols;
  end if;
  raise notice 'chat_messages image columns present (4/4)';
end $$;
