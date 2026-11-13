-- Support: "who is waiting on us" + team alerting (2026-11-14).
--
-- WHY. Measured on production 2026-11-14: 74 conversations had been handed to
-- "a person" and never received a single human reply (the oldest from
-- 2026-09-04), and the ones that were answered waited ~40 hours. Nothing told the
-- team a conversation was waiting — the admin page polled, and only while someone
-- had it open. And once a person HAD replied, a customer writing back left no
-- trace at all: the status stayed 'human' and nothing distinguished "they are
-- waiting on us" from "we are waiting on them".
--
--   awaiting_reply_since  set when the person writes and it is our turn to answer
--                         (escalation, a message into a human-owned thread, a
--                         reopen). Cleared by a human reply or by resolving.
--                         NOT NULL = waiting on us. This is the queue.
--   team_alerted_at       last immediate alert email for this conversation, so a
--                         customer sending five messages in a row is one email.
--   overdue_alerted_at    the overdue reminder for the CURRENT wait. Compared
--                         against awaiting_reply_since so each wait reminds once.
--
-- No grants: anon/authenticated stay at zero; only the backend (service role)
-- touches these tables.

alter table public.support_conversations
  add column if not exists awaiting_reply_since timestamptz,
  add column if not exists team_alerted_at      timestamptz,
  add column if not exists overdue_alerted_at   timestamptz;

create index if not exists support_conversations_awaiting_reply_idx
  on public.support_conversations (awaiting_reply_since)
  where awaiting_reply_since is not null;

-- Backfill 1: escalated and never answered by a person.
update public.support_conversations
   set awaiting_reply_since = coalesce(escalated_at, created_at)
 where status = 'awaiting_human'
   and first_human_response_at is null
   and awaiting_reply_since is null;

-- Backfill 2: a person replied, then the customer wrote again and nobody answered.
update public.support_conversations c
   set awaiting_reply_since = x.last_user_at
  from (
    select m.conversation_id,
           max(m.created_at) filter (where m.sender = 'user')  as last_user_at,
           max(m.created_at) filter (where m.sender = 'human') as last_human_at
      from public.support_messages m
     group by m.conversation_id
  ) x
 where x.conversation_id = c.id
   and c.status in ('human', 'awaiting_human')
   and c.awaiting_reply_since is null
   and x.last_user_at is not null
   and (x.last_human_at is null or x.last_user_at > x.last_human_at);

do $$
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'support_conversations'
       and column_name = 'awaiting_reply_since'
  ) then
    raise exception 'support_alerts.sql: awaiting_reply_since was not created';
  end if;
end $$;
