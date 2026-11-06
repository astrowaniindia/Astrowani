-- ─────────────────────────────────────────────────────────────────────────────
-- notification_audience(p_filters) + notification_reach_summary()
--
-- WHY THIS IS SQL AND NOT JAVASCRIPT. Targeting needs per-customer aggregates —
-- how many consultations, how long since the last one, how many paid recharges,
-- how many live devices — and PostgREST cannot GROUP BY. The alternative was
-- pulling chat_sessions and wallet_recharges into Node and aggregating there,
-- which means transferring a six-figure row count across the Malaysia↔Tokyo hop
-- on every audience preview. The admin page previews on every keystroke.
--
-- IT IS SECURITY INVOKER, NOT DEFINER, on purpose. The only caller is the backend
-- on the service-role client, which already reads every one of these tables, so a
-- DEFINER wrapper would add privilege for nothing — and every DEFINER function in
-- this database is a thing that has to be audited. `search_path` is pinned anyway.
--
-- NO STRING INTERPOLATION ANYWHERE. Every filter is a jsonb lookup compared in
-- plain SQL, so a value an admin types cannot change which rows come back — the
-- `.or()`/`.in()` filter-tree lesson from 2026-10-02, applied to a path where the
-- blast radius is "this notification goes to the wrong 4,000 people".
--
-- Each filter is NULL-TOLERANT: an absent key means "do not filter on this".
-- That is what makes `{}` mean everybody, and it is why a half-written filter
-- widens the audience rather than narrowing it to nobody. Combined with
-- max_per_run on automations, the failure direction is bounded.
--
-- Safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.notification_audience(p_filters jsonb default '{}'::jsonb)
returns table (
  customer_id         uuid,
  name                text,
  locale              text,
  platform            text,
  device_count        integer,
  wallet_balance      numeric,
  consultations       integer,
  days_since_session  integer,
  days_since_signup   integer,
  recharges           integer,
  acquisition_source  text,
  acquisition_raw     text
)
language sql
stable
set search_path = public, pg_temp
as $$
with dev as (
  -- "Live" is all three conditions together: a token exists, the install has not
  -- been seen to die, and the OS permission is granted. Any one of them alone
  -- over-reports reach, which is how a broadcast came to claim 4,849 recipients
  -- while 289 phones could receive it.
  select d.customer_id,
         count(*)::int as device_count,
         -- `(col is null)` FIRST, then newest. `nulls last` would apply to the
         -- ORDER BY key (last_seen_at) and not to the column being aggregated, so
         -- a customer's newest device winning with a NULL locale erased a locale an
         -- older device had reported correctly — caught by
         -- scripts/notificationPlatformCheck.js, which asserted that a Hindi reader
         -- gets the Hindi copy and got the English one.
         (array_agg(d.locale      order by (d.locale      is null), d.last_seen_at desc))[1] as locale,
         (array_agg(d.platform    order by (d.platform    is null), d.last_seen_at desc))[1] as platform,
         (array_agg(d.app_version order by (d.app_version is null), d.last_seen_at desc))[1] as app_version
  from customer_devices d
  where d.fcm_token is not null
    and d.app_removed_at is null
    and d.permission_status = 'granted'
  group by 1
),
sess as (
  select s.caller_id as customer_id, count(*)::int as consultations, max(s.started_at) as last_session
  from chat_sessions s
  where s.caller_id is not null
  group by 1
),
rech as (
  -- Paid only. A created-but-abandoned order is not a recharge, and counting it
  -- would put every abandoned-checkout customer in the "has paid before" segment.
  select r.customer_id, count(*)::int as recharges
  from wallet_recharges r
  where r.status = 'paid'
  group by 1
)
select
  c.id,
  c.name,
  dev.locale,
  dev.platform,
  coalesce(dev.device_count, 0),
  c.wallet_balance,
  coalesce(sess.consultations, 0),
  case when sess.last_session is null then null
       else (extract(epoch from (now() - sess.last_session)) / 86400)::int end,
  (extract(epoch from (now() - c.created_at)) / 86400)::int,
  coalesce(rech.recharges, 0),
  c.acquisition_source,
  c.acquisition_raw
from customers c
left join dev  on dev.customer_id  = c.id
left join sess on sess.customer_id = c.id
left join rech on rech.customer_id = c.id
where c.mobile not like 'deleted:%'

  -- reachability
  and (not coalesce((p_filters->>'hasDevice')::boolean, false) or coalesce(dev.device_count, 0) > 0)
  and (p_filters->>'platform'   is null or dev.platform = p_filters->>'platform')
  -- An absent locale reads as English: that is what the app defaults to, and
  -- treating "unknown" as neither language would make a Hindi/English split drop
  -- everyone who has not yet reported one.
  and (p_filters->>'locale'     is null or coalesce(dev.locale, 'en') = p_filters->>'locale')
  and (p_filters->>'appVersion' is null or dev.app_version = p_filters->>'appVersion')

  -- money
  and (p_filters->>'minWalletBalance' is null or coalesce(c.wallet_balance, 0) >= (p_filters->>'minWalletBalance')::numeric)
  and (p_filters->>'maxWalletBalance' is null or coalesce(c.wallet_balance, 0) <= (p_filters->>'maxWalletBalance')::numeric)
  and (p_filters->>'minRecharges'     is null or coalesce(rech.recharges, 0)   >= (p_filters->>'minRecharges')::int)
  and (p_filters->>'maxRecharges'     is null or coalesce(rech.recharges, 0)   <= (p_filters->>'maxRecharges')::int)

  -- behaviour
  and (p_filters->>'minConsultations' is null or coalesce(sess.consultations, 0) >= (p_filters->>'minConsultations')::int)
  and (p_filters->>'maxConsultations' is null or coalesce(sess.consultations, 0) <= (p_filters->>'maxConsultations')::int)

  -- Recency windows REQUIRE a session to exist. Someone who has never consulted is
  -- not "999 days since their last session" — they have no last session, and
  -- folding them in would put every never-consulted customer into every win-back.
  and (p_filters->>'minDaysSinceSession' is null
       or (sess.last_session is not null and sess.last_session <= now() - make_interval(days => (p_filters->>'minDaysSinceSession')::int)))
  and (p_filters->>'maxDaysSinceSession' is null
       or (sess.last_session is not null and sess.last_session >  now() - make_interval(days => (p_filters->>'maxDaysSinceSession')::int + 1)))

  -- Signup age, inclusive on both ends: min 1 / max 1 means "exactly one day old".
  and (p_filters->>'minDaysSinceSignup' is null or c.created_at <= now() - make_interval(days => (p_filters->>'minDaysSinceSignup')::int))
  and (p_filters->>'maxDaysSinceSignup' is null or c.created_at >  now() - make_interval(days => (p_filters->>'maxDaysSinceSignup')::int + 1))

  -- profile
  and (p_filters->>'gender' is null or c.gender = p_filters->>'gender')
  and (p_filters->>'state'  is null or c.state  = p_filters->>'state')
  and (p_filters->>'minAge' is null or (c.dob is not null and extract(year from age(c.dob)) >= (p_filters->>'minAge')::int))
  and (p_filters->>'maxAge' is null or (c.dob is not null and extract(year from age(c.dob)) <= (p_filters->>'maxAge')::int))

  -- Birthday in IST, not UTC. At 23:30 IST the UTC date is still yesterday, so a
  -- UTC comparison sends a day late to everyone born on the 1st of a month.
  and (not coalesce((p_filters->>'birthdayToday')::boolean, false)
       or (c.dob is not null
           and to_char(c.dob, 'MM-DD') = to_char((now() at time zone 'Asia/Kolkata')::date, 'MM-DD')))

  -- Holds a live free-call invite and has never booked one.
  and (not coalesce((p_filters->>'freeCallUnused')::boolean, false)
       or (exists (select 1 from free_call_invites i where i.customer_id = c.id and i.expires_at > now())
           and not exists (select 1 from free_call_bookings b
                           where b.customer_id = c.id and coalesce(b.status, '') <> 'cancelled')))

-- DETERMINISTIC, because the caller PAGES this (see targeting.resolveAudience).
-- PostgREST caps a response body at `db-max-rows`, measured at 1000 against this
-- project, and a set-returning function is no exception — the comment in
-- targeting.js used to claim it was, which is how an audience of 4,858 customers
-- silently became 1,000. Without a stable order, paging that cap can miss or
-- repeat rows, which is worse than truncating.
order by c.id
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- The reachability panel. One row, so the admin can see at a glance the thing
-- nobody could see before: of everyone on the books, who can actually be reached,
-- and for the rest, WHY not.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.notification_reach_summary()
returns table (
  live_customers       integer,
  reachable            integer,
  granted_no_token     integer,
  denied               integer,
  blocked              integer,
  undetermined         integer,
  app_removed          integer,
  never_registered     integer,
  ios_reachable        integer,
  android_reachable    integer,
  hindi_reachable      integer
)
language sql
stable
set search_path = public, pg_temp
as $$
with live as (
  select c.id from customers c where c.mobile not like 'deleted:%'
),
-- One row per customer, collapsing their devices to the BEST state any of them is
-- in. "Best" matters: a customer with a working phone and a wiped tablet is
-- reachable, and reporting them as removed would understate reach exactly as
-- badly as the old single-column world overstated it.
best as (
  select d.customer_id,
         bool_or(d.fcm_token is not null and d.app_removed_at is null and d.permission_status = 'granted') as reachable,
         bool_or(d.permission_status = 'granted') as any_granted,
         bool_or(d.permission_status = 'denied')  as any_denied,
         bool_or(d.permission_status = 'blocked') as any_blocked,
         bool_or(d.app_removed_at is not null)    as any_removed,
         bool_or(d.platform = 'ios'     and d.fcm_token is not null and d.app_removed_at is null and d.permission_status = 'granted') as ios_ok,
         bool_or(d.platform = 'android' and d.fcm_token is not null and d.app_removed_at is null and d.permission_status = 'granted') as android_ok,
         bool_or(d.locale = 'hi'        and d.fcm_token is not null and d.app_removed_at is null and d.permission_status = 'granted') as hindi_ok
  from customer_devices d
  group by 1
)
select
  count(*)::int,
  count(*) filter (where b.reachable)::int,
  -- Permission granted but no usable token: the iOS APNs race, or a token that
  -- never synced. A real and previously invisible bucket.
  count(*) filter (where b.any_granted and not coalesce(b.reachable, false) and not coalesce(b.any_removed, false))::int,
  count(*) filter (where b.any_denied  and not coalesce(b.any_granted, false))::int,
  count(*) filter (where b.any_blocked and not coalesce(b.reachable, false))::int,
  count(*) filter (where b.customer_id is not null and not coalesce(b.any_granted, false) and not coalesce(b.any_denied, false) and not coalesce(b.any_blocked, false))::int,
  count(*) filter (where coalesce(b.any_removed, false) and not coalesce(b.reachable, false))::int,
  -- No device row at all. The app has never reported anything for this customer,
  -- which today is most of them and shrinks every time one opens a current build.
  count(*) filter (where b.customer_id is null)::int,
  count(*) filter (where b.ios_ok)::int,
  count(*) filter (where b.android_ok)::int,
  count(*) filter (where b.hindi_ok)::int
from live l
left join best b on b.customer_id = l.id
$$;

revoke all on function public.notification_audience(jsonb) from anon, authenticated;
revoke all on function public.notification_reach_summary() from anon, authenticated;
grant execute on function public.notification_audience(jsonb) to service_role;
grant execute on function public.notification_reach_summary() to service_role;

do $$
declare n integer;
begin
  select count(*) into n from public.notification_audience('{}'::jsonb);
  if n = 0 then
    raise exception 'notification_audience: empty audience for {} — it must mean everybody';
  end if;
  raise notice 'notification_audience: % customers match {}', n;

  -- A positive control for the filter logic itself: an impossible filter must
  -- return nothing. Without this, a function that ignored p_filters entirely
  -- would pass the check above.
  select count(*) into n from public.notification_audience('{"minConsultations":999999}'::jsonb);
  if n <> 0 then
    raise exception 'notification_audience: impossible filter returned % rows — filters are being ignored', n;
  end if;

  select live_customers into n from public.notification_reach_summary();
  if n = 0 then raise exception 'notification_reach_summary: reported 0 live customers'; end if;
  raise notice 'notification_reach_summary: ok, % live customers', n;
end $$;
