-- ============================================================================
-- QR poster funnel: scans and installs-that-opened, to sit beside signups
-- ============================================================================
-- Until now the QR page started at SIGNUP: a scan happens inside a phone's camera and an
-- install that never signs up leaves no row, so both were invisible. Two new event
-- streams close that gap:
--
--   qr_scan_events     one row per hit on  GET /q/<qr_source>  — the short link the
--                      poster now encodes. It logs the hit, then redirects to the Play
--                      Store link with the same referrer, so the person notices nothing.
--   qr_install_events  one row per INSTALL that opened the app (first launch, before any
--                      login), reported by the app with the Play install referrer.
--
-- Reading them together with customers.acquisition_source gives the funnel:
--   scans -> installs opened -> signups -> paying customers.
-- (Installs that never open the app remain visible only in Play Console.)
--
-- ACCESS: both tables are service-role only. RLS is on with no policy, and every grant
-- to anon/authenticated is revoked explicitly — the Supabase project template grants
-- them on every new table (see hardening_15).
--
-- PRIVACY: visitor_hash is sha256(ip | user-agent | server secret), never the raw IP. It
-- exists only so "unique scanners" can be counted; it cannot be reversed to an address.
--
-- Idempotent.
-- ============================================================================

create table if not exists public.qr_scan_events (
  id           bigserial primary key,
  source       text        not null,
  visitor_hash text,
  is_android   boolean,
  created_at   timestamptz not null default now()
);
create index if not exists qr_scan_events_source_idx on public.qr_scan_events (source, created_at desc);

create table if not exists public.qr_install_events (
  install_id text primary key,             -- random id the app makes once; makes retries idempotent
  source     text        not null,
  raw        text,
  opened_at  timestamptz not null default now()
);
create index if not exists qr_install_events_source_idx on public.qr_install_events (source);

alter table public.qr_scan_events    enable row level security;
alter table public.qr_install_events enable row level security;
revoke all on public.qr_scan_events    from anon, authenticated;
revoke all on public.qr_install_events from anon, authenticated;
revoke all on sequence public.qr_scan_events_id_seq from anon, authenticated;

-- One row per source: total scans, distinct scanners, installs that opened the app.
-- Done in SQL because PostgREST cannot GROUP BY, and paging every scan row into Node just
-- to count them would get slower with every poster scanned.
create or replace function public.qr_funnel_counts()
returns table (source text, scans bigint, unique_scans bigint, installs bigint)
language sql
security definer
set search_path = public
as $$
  select s.source,
         coalesce(sc.scans, 0)        as scans,
         coalesce(sc.unique_scans, 0) as unique_scans,
         coalesce(ins.installs, 0)    as installs
  from (
    select source from public.qr_scan_events
    union
    select source from public.qr_install_events
  ) s
  left join (
    select source, count(*) as scans, count(distinct visitor_hash) as unique_scans
    from public.qr_scan_events group by source
  ) sc on sc.source = s.source
  left join (
    select source, count(*) as installs
    from public.qr_install_events group by source
  ) ins on ins.source = s.source
$$;

revoke execute on function public.qr_funnel_counts() from public, anon, authenticated;
grant  execute on function public.qr_funnel_counts() to service_role;

-- Self-check: raise (rather than leave a quietly-open table) if the lock-down did not take.
do $$
declare bad int;
begin
  select count(*) into bad
  from information_schema.role_table_grants
  where table_schema = 'public'
    and table_name in ('qr_scan_events', 'qr_install_events')
    and grantee in ('anon', 'authenticated');
  if bad > 0 then
    raise exception 'qr_funnel_events: % grant(s) to anon/authenticated survived on the QR event tables', bad;
  end if;
  if has_function_privilege('anon', 'public.qr_funnel_counts()', 'execute') then
    raise exception 'qr_funnel_events: anon can still execute qr_funnel_counts()';
  end if;
end $$;
