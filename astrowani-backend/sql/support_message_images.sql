-- Photos in support conversations (2026-11-14).
--
-- A customer saying "money was deducted" with a screenshot of the bank SMS, or an
-- astrologer showing the error on their payout screen, is the fastest support
-- conversation there is — and neither app nor the admin could send one.
--
-- Same shape as sql/chat_image_messages.sql: `body` stays NOT NULL and
-- human-readable ("📷 Photo" / "📷 <caption>"), so the admin list preview, the
-- alert emails, the reply push and every installed build that predates this all
-- show something sensible rather than a blank. The pixels live in the public
-- `app-images` bucket under support-images/, written by the backend only.
--
-- No grants: anon / authenticated stay at zero privileges (hardening_15/17).

alter table public.support_messages
  add column if not exists image_url    text,
  add column if not exists image_width  integer,
  add column if not exists image_height integer;

do $$
begin
  alter table public.support_messages
    add constraint support_messages_image_dims_chk
    check (
      (image_url is null and image_width is null and image_height is null)
      or (image_url is not null and image_width > 0 and image_height > 0)
    );
exception when duplicate_object then null;
end $$;

-- Self-verifying tail: fail loudly rather than leave a half-applied migration.
do $$
begin
  if (select count(*) from information_schema.columns
      where table_schema = 'public' and table_name = 'support_messages'
        and column_name in ('image_url', 'image_width', 'image_height')) <> 3 then
    raise exception 'support_messages image columns missing';
  end if;
  if exists (select 1 from information_schema.role_table_grants
             where table_schema = 'public' and table_name = 'support_messages'
               and grantee in ('anon', 'authenticated')
               and privilege_type in ('INSERT', 'UPDATE', 'DELETE')) then
    raise exception 'support_messages is writable by anon/authenticated';
  end if;
end $$;

-- Allows sender = 'note' (internal notes). The notes UI was built and then REMOVED the
-- same day to keep the inbox simple for a one-admin team; nothing writes 'note' today.
-- The customer thread and the bot history still exclude it, so adding notes back
-- later cannot leak one to a customer.
alter table public.support_messages drop constraint if exists support_messages_sender_check;
alter table public.support_messages add constraint support_messages_sender_check
  check (sender = any (array['user', 'agent', 'human', 'system', 'note']));
