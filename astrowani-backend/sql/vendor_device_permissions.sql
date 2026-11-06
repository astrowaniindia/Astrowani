-- ─────────────────────────────────────────────────────────────────────────────
-- The astrologer side of the notification platform.
--
-- `vendor_devices` has recorded WHICH devices an astrologer is signed in on since
-- 2026-09, with platform and app version — but not whether any of them is allowed
-- to show a notification. On the customer side that gap was a marketing problem.
-- Here it is an EARNINGS problem: an astrologer who is online, available and
-- unreachable by push misses every consultation request that arrives while the app
-- is backgrounded, and neither they nor the admin has any way to know.
--
-- Same four states and the same column names as `customer_devices`, deliberately,
-- so the two tables read side by side and one reach query can be written twice
-- rather than reasoned about twice.
--
-- Safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.vendor_devices add column if not exists permission_status text
  not null default 'undetermined';
alter table public.vendor_devices add column if not exists permission_asked_at timestamptz;
alter table public.vendor_devices add column if not exists permission_decided_at timestamptz;
alter table public.vendor_devices add column if not exists locale text;
alter table public.vendor_devices add column if not exists app_removed_at timestamptz;
alter table public.vendor_devices add column if not exists app_removed_reason text;

-- Added separately and tolerantly: `vendor_devices` is live and a CHECK that
-- rejected an existing row would take the migration down with it. Every row starts
-- at the default, so there is nothing to violate — but this file must not depend on
-- that still being true the next time it runs.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'vendor_devices_permission_status_check'
  ) then
    alter table public.vendor_devices
      add constraint vendor_devices_permission_status_check
      check (permission_status in ('undetermined', 'granted', 'denied', 'blocked'));
  end if;
end $$;

-- "Who can we actually ring" as an index scan.
create index if not exists idx_vendor_devices_live on public.vendor_devices (astrologer_id)
  where fcm_token is not null and app_removed_at is null and permission_status = 'granted';
create index if not exists idx_vendor_devices_permission on public.vendor_devices (permission_status);

-- ─────────────────────────────────────────────────────────────────────────────
-- BACKFILL, and it is a different judgement from the customer one.
--
-- On the customer side a token's existence proved the permission had been granted
-- when it was issued, so every token-holding customer was backfilled as 'granted'.
-- The same is true here — but `vendor_devices` rows are also created by a LOGIN
-- that could not obtain a token at all (registerDevice deliberately writes the row
-- and leaves fcm_token null; see its comment). Those rows prove nothing about the
-- permission, so they stay 'undetermined' rather than being guessed either way.
--
-- Guessing 'granted' would report an astrologer as reachable who is not, which on
-- this side of the app means telling an admin that somebody can take consultations
-- when they cannot. Guessing 'denied' would invent a refusal nobody made.
-- ─────────────────────────────────────────────────────────────────────────────
update public.vendor_devices
set permission_status = 'granted',
    permission_decided_at = coalesce(permission_decided_at, created_at)
where fcm_token is not null
  and permission_status = 'undetermined';

-- ─────────────────────────────────────────────────────────────────────────────
-- notification_astrologer_reach_summary()
--
-- `unreachable_online` is the row that matters and the reason this function exists
-- rather than a pair of counts: an astrologer who has a service toggle on but no
-- device that can receive a push is losing money every hour, silently. It is the
-- operational half of what the customer-side reach panel does for marketing.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.notification_astrologer_reach_summary()
returns table (
  live_astrologers    integer,
  reachable           integer,
  granted_no_token    integer,
  denied              integer,
  blocked             integer,
  undetermined        integer,
  app_removed         integer,
  never_registered    integer,
  ios_reachable       integer,
  android_reachable   integer,
  available_now       integer,
  unreachable_online  integer
)
language sql
stable
set search_path = public, pg_temp
as $$
with live as (
  select a.id,
         -- "Open for business": any service switched on, not suspended, not hidden.
         -- Mirrors the service-toggle table in CLAUDE.md rather than inventing a
         -- second definition of availability.
         (coalesce(a.is_chat_enabled, false)
           or coalesce(a.is_call_enabled, false)
           or coalesce(a.is_video_call_enabled, false)
           or coalesce(a.is_available, false)) as open_for_business
  from astrologers a
  where coalesce(a.phone_number, '') not like 'deleted:%'
    and coalesce(a.is_suspended, false) = false
),
best as (
  select d.astrologer_id,
         bool_or(d.fcm_token is not null and d.app_removed_at is null and d.permission_status = 'granted') as reachable,
         bool_or(d.permission_status = 'granted') as any_granted,
         bool_or(d.permission_status = 'denied')  as any_denied,
         bool_or(d.permission_status = 'blocked') as any_blocked,
         bool_or(d.app_removed_at is not null)    as any_removed,
         bool_or(d.platform = 'ios'     and d.fcm_token is not null and d.app_removed_at is null and d.permission_status = 'granted') as ios_ok,
         bool_or(d.platform = 'android' and d.fcm_token is not null and d.app_removed_at is null and d.permission_status = 'granted') as android_ok
  from vendor_devices d
  group by 1
)
select
  count(*)::int,
  count(*) filter (where b.reachable)::int,
  count(*) filter (where b.any_granted and not coalesce(b.reachable, false) and not coalesce(b.any_removed, false))::int,
  count(*) filter (where b.any_denied  and not coalesce(b.any_granted, false))::int,
  count(*) filter (where b.any_blocked and not coalesce(b.reachable, false))::int,
  count(*) filter (where b.astrologer_id is not null and not coalesce(b.any_granted, false) and not coalesce(b.any_denied, false) and not coalesce(b.any_blocked, false))::int,
  count(*) filter (where coalesce(b.any_removed, false) and not coalesce(b.reachable, false))::int,
  count(*) filter (where b.astrologer_id is null)::int,
  count(*) filter (where b.ios_ok)::int,
  count(*) filter (where b.android_ok)::int,
  count(*) filter (where l.open_for_business)::int,
  count(*) filter (where l.open_for_business and not coalesce(b.reachable, false))::int
from live l
left join best b on b.astrologer_id = l.id
$$;

-- The names behind `unreachable_online`, because a count an admin cannot act on is
-- not worth showing. Capped, and ordered worst-first by how long they have been
-- signed in without a usable token.
create or replace function public.notification_astrologers_unreachable(p_limit integer default 50)
returns table (
  astrologer_id uuid,
  name          text,
  phone_number  text,
  services      text,
  device_count  integer,
  permission    text,
  last_seen_at  timestamptz
)
language sql
stable
set search_path = public, pg_temp
as $$
select a.id,
       trim(coalesce(a.first_name, '') || ' ' || coalesce(a.last_name, '')),
       a.phone_number,
       concat_ws(', ',
         case when coalesce(a.is_chat_enabled, false)       then 'chat'  end,
         case when coalesce(a.is_call_enabled, false)       then 'call'  end,
         case when coalesce(a.is_video_call_enabled, false) then 'video' end,
         case when coalesce(a.is_available, false)          then 'live'  end),
       (select count(*)::int from vendor_devices d where d.astrologer_id = a.id),
       -- The BEST state any of their devices is in. 'none' means the app has never
       -- reported a device at all, which is a different problem from a refusal.
       coalesce((
         select case
           when bool_or(d.permission_status = 'granted') then 'granted'
           when bool_or(d.permission_status = 'blocked') then 'blocked'
           when bool_or(d.permission_status = 'denied')  then 'denied'
           else 'undetermined' end
         from vendor_devices d where d.astrologer_id = a.id
         -- `having count(*) > 0` is what makes 'none' reachable. Without it the
         -- aggregate returns one row of NULLs over the empty set, the CASE falls
         -- through to its `else`, and an astrologer who has NEVER reported a device
         -- reads as 'undetermined' — which an admin would act on by asking about
         -- their phone settings, when the answer is "open the app".
         having count(*) > 0
       ), 'none'),
       (select max(d.last_seen_at) from vendor_devices d where d.astrologer_id = a.id)
from astrologers a
where coalesce(a.phone_number, '') not like 'deleted:%'
  and coalesce(a.is_suspended, false) = false
  and (coalesce(a.is_chat_enabled, false) or coalesce(a.is_call_enabled, false)
       or coalesce(a.is_video_call_enabled, false) or coalesce(a.is_available, false))
  and not exists (
    select 1 from vendor_devices d
    where d.astrologer_id = a.id
      and d.fcm_token is not null
      and d.app_removed_at is null
      and d.permission_status = 'granted'
  )
order by (select max(d.last_seen_at) from vendor_devices d where d.astrologer_id = a.id) desc nulls last
limit greatest(1, least(500, p_limit))
$$;

revoke all on function public.notification_astrologer_reach_summary() from anon, authenticated;
revoke all on function public.notification_astrologers_unreachable(integer) from anon, authenticated;
grant execute on function public.notification_astrologer_reach_summary() to service_role;
grant execute on function public.notification_astrologers_unreachable(integer) to service_role;

do $$
declare missing text; n integer; m integer;
begin
  select string_agg(c, ', ') into missing
  from (values ('permission_status'), ('permission_asked_at'), ('permission_decided_at'),
               ('locale'), ('app_removed_at'), ('app_removed_reason')) as v(c)
  where not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'vendor_devices' and column_name = v.c
  );
  if missing is not null then
    raise exception 'vendor_device_permissions: columns missing after apply: %', missing;
  end if;

  select live_astrologers, reachable into n, m from public.notification_astrologer_reach_summary();
  if n = 0 then
    raise exception 'notification_astrologer_reach_summary: reported 0 live astrologers';
  end if;
  raise notice 'vendor_device_permissions: ok — % live astrologers, % reachable', n, m;

  -- A positive control for the unreachable listing: it must be able to return rows
  -- at all. A function that always returned nothing would otherwise look like good
  -- news.
  select count(*) into n from public.notification_astrologers_unreachable(500);
  raise notice 'vendor_device_permissions: % available astrologers cannot be reached by push', n;
end $$;
