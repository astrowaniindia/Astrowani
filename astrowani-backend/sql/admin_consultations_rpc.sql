-- admin_consultations_rpc.sql — 2026-11-22
--
-- WHY: the admin Consultations page loaded the newest 500 chat_sessions rows and then
-- did everything (filters, search, sort, totals) in the browser. Every period showed
-- "500 sessions" and every total was the total of those 500, not of the period
-- (90 days held 4,339 sessions). The page now asks the database for one page at a
-- time, with filters/sort/totals computed here over the WHOLE period.
--
-- Money still comes from the three ledgers (see src/consultationRoutes.js header),
-- summed per session by indexed lookups on session_id.
--
-- Also adds the astrologer history used by Astrologers Directory -> Details:
-- admin_astrologer_ledger_summary() and the p_astrologer filter below.

-- ── Indexes ──────────────────────────────────────────────────────────────────
-- chat_sessions had (vendor_id, started_at) and (caller_id, started_at) but nothing
-- for "newest sessions across everyone", which is the page's default view.
create index if not exists idx_chat_sessions_started on public.chat_sessions (started_at desc);
-- The two ledgers the page sums per session had no session_id index (admin's had one).
-- chat_messages.session_id and session_flags.session_id are TEXT, so they are compared as v.id::text.
create index if not exists idx_wallet_tx_session on public.wallet_transactions (session_id) where session_id is not null;
create index if not exists idx_vendor_wallet_tx_session on public.vendor_wallet_transactions (session_id) where session_id is not null;
create index if not exists idx_session_flags_session on public.session_flags (session_id) where session_id is not null;
-- Directory "has money" filter + astrologer withdrawals list.
create index if not exists idx_withdrawal_requests_astro on public.withdrawal_requests (astrologer_id, requested_at desc);

-- ── The page query ───────────────────────────────────────────────────────────
drop function if exists public.admin_consultations(timestamptz, text, text, text, boolean, text, text, integer, integer, uuid);

create function public.admin_consultations(
  p_since        timestamptz default null,
  p_type         text        default 'all',      -- all | chat | audio | video
  p_status       text        default 'all',      -- all | live | ended | paid | zero | flagged | connectivity
  p_search       text        default null,
  p_include_test boolean     default false,
  p_sort         text        default 'startedAt',
  p_dir          text        default 'desc',
  p_limit        integer     default 50,
  p_offset       integer     default 0,
  p_astrologer   uuid        default null
) returns jsonb
language sql
stable
set search_path = public
as $$
with base as (
  select s.id, s.call_type, s.vendor_id, s.caller_id, s.per_minute_charge,
         s.started_at, s.ended_at, s.is_active, s.is_free, s.had_connectivity_issue,
         nullif(trim(coalesce(a.first_name, '') || ' ' || coalesce(a.last_name, '')), '') as aname,
         a.id as a_id, a.phone_number as aphone,
         c.id as c_id, c.name as cname,
         case when c.mobile like 'deleted:%' then null else c.mobile end as cmobile,
         c.mobile as raw_cmobile
  from chat_sessions s
  left join astrologers a on a.id = s.vendor_id
  left join customers  c on c.id = s.caller_id
  where (p_since is null or s.started_at >= p_since)
    and (p_astrologer is null or s.vendor_id = p_astrologer)
),
-- The Apple/Play reviewer number (consultationRoutes REVIEWER_PHONE).
visible as (
  select * from base
  where p_include_test
     or not (coalesce(aphone, '') = '9999999999' or coalesce(raw_cmobile, '') = '9999999999')
),
enriched as (
  select v.*,
    case when v.call_type = 'voice' then 'audio' else coalesce(v.call_type, 'chat') end as kind,
    coalesce((select sum(w.amount) from wallet_transactions w where w.session_id = v.id and w.type = 'debit'), 0) as paid,
    coalesce((select sum(t.amount) from vendor_wallet_transactions t where t.session_id = v.id and t.type = 'credit'), 0) as earned,
    coalesce((select sum(k.amount) from admin_wallet_transactions k where k.session_id = v.id), 0) as kept,
    (select count(*) from chat_messages m where m.session_id = v.id::text) as msg_count,
    (select max(m.created_at) from chat_messages m where m.session_id = v.id::text) as last_msg_at,
    exists (select 1 from session_flags f where f.session_id = v.id::text) as flagged,
    case
      when v.ended_at is null or v.started_at is null then null
      when v.ended_at <= v.started_at then null
      when v.ended_at - v.started_at > interval '12 hours' then null   -- zombie row
      else round((extract(epoch from (v.ended_at - v.started_at)) / 60.0)::numeric, 1)
    end as dur
  from visible v
),
filtered as (
  select * from enriched e
  where (coalesce(p_type, 'all') = 'all' or e.kind = p_type)
    and (case coalesce(p_status, 'all')
           when 'live'         then e.is_active
           when 'ended'        then not coalesce(e.is_active, false)
           when 'paid'         then e.earned > 0
           when 'zero'         then e.earned <= 0
           when 'flagged'      then e.flagged
           when 'connectivity' then coalesce(e.had_connectivity_issue, false)
           else true end)
    and (coalesce(trim(p_search), '') = ''
         or position(lower(trim(p_search)) in lower(coalesce(e.aname, ''))) > 0
         or position(lower(trim(p_search)) in lower(coalesce(e.cname, ''))) > 0
         or position(trim(p_search) in coalesce(e.cmobile, '')) > 0
         or position(trim(p_search) in coalesce(e.aphone, '')) > 0)
),
ranked as (
  select f.*, row_number() over (order by
    case when p_sort = 'astrologer'       and p_dir = 'asc'  then lower(f.aname) end asc  nulls last,
    case when p_sort = 'astrologer'       and p_dir <> 'asc' then lower(f.aname) end desc nulls last,
    case when p_sort = 'customer'         and p_dir = 'asc'  then lower(f.cname) end asc  nulls last,
    case when p_sort = 'customer'         and p_dir <> 'asc' then lower(f.cname) end desc nulls last,
    case when p_sort = 'durationMinutes'  and p_dir = 'asc'  then f.dur end asc  nulls last,
    case when p_sort = 'durationMinutes'  and p_dir <> 'asc' then f.dur end desc nulls last,
    case when p_sort = 'customerPaid'     and p_dir = 'asc'  then f.paid end asc,
    case when p_sort = 'customerPaid'     and p_dir <> 'asc' then f.paid end desc,
    case when p_sort = 'astrologerEarned' and p_dir = 'asc'  then f.earned end asc,
    case when p_sort = 'astrologerEarned' and p_dir <> 'asc' then f.earned end desc,
    case when p_sort = 'platformKept'     and p_dir = 'asc'  then f.kept end asc,
    case when p_sort = 'platformKept'     and p_dir <> 'asc' then f.kept end desc,
    case when p_sort = 'messageCount'     and p_dir = 'asc'  then f.msg_count end asc,
    case when p_sort = 'messageCount'     and p_dir <> 'asc' then f.msg_count end desc,
    case when p_sort = 'startedAt'        and p_dir = 'asc'  then f.started_at end asc,
    f.started_at desc, f.id) as rn
  from filtered f
),
paged as (
  select * from ranked
  where rn > greatest(0, coalesce(p_offset, 0))
    and rn <= greatest(0, coalesce(p_offset, 0)) + greatest(1, least(coalesce(p_limit, 50), 500))
)
select jsonb_build_object(
  'total',     (select count(*) from filtered),
  'testCount', (select count(*) from base) - (select count(*) from visible),
  'summary', (select jsonb_build_object(
      'sessions', count(*),
      'minutes',  coalesce(sum(dur), 0),
      'paid',     coalesce(sum(paid), 0),
      'earned',   coalesce(sum(earned), 0),
      'kept',     coalesce(sum(kept), 0)
    ) from filtered),
  'rows', coalesce((select jsonb_agg(jsonb_build_object(
      'id', p.id,
      'type', coalesce(p.call_type, 'chat'),
      'isActive', coalesce(p.is_active, false),
      'isFree', coalesce(p.is_free, false),
      'hadConnectivityIssue', coalesce(p.had_connectivity_issue, false),
      'startedAt', p.started_at,
      'endedAt', p.ended_at,
      'durationMinutes', p.dur,
      'perMinuteCharge', coalesce(p.per_minute_charge, 0),
      'customerPaid', p.paid,
      'astrologerEarned', p.earned,
      'platformKept', p.kept,
      'messageCount', p.msg_count,
      'lastMessageAt', p.last_msg_at,
      'flagged', p.flagged,
      'astrologer', case when p.a_id is null
          then jsonb_build_object('id', p.vendor_id, 'name', 'Unknown astrologer')
          else jsonb_build_object('id', p.a_id, 'name', coalesce(p.aname, 'Astrologer'), 'phone', p.aphone) end,
      'customer', case when p.c_id is null
          then jsonb_build_object('id', p.caller_id, 'name', 'Deleted customer', 'mobile', null)
          else jsonb_build_object('id', p.c_id, 'name', coalesce(nullif(p.cname, ''), 'Customer'), 'mobile', p.cmobile) end
    ) order by p.rn) from paged p), '[]'::jsonb)
);
$$;

-- ── One astrologer's money, all time ─────────────────────────────────────────
drop function if exists public.admin_astrologer_ledger_summary(uuid);

create function public.admin_astrologer_ledger_summary(p_vendor uuid)
returns jsonb
language sql
stable
set search_path = public
as $$
select jsonb_build_object(
  'credits',          coalesce((select sum(amount) from vendor_wallet_transactions where vendor_id = p_vendor and type = 'credit'), 0),
  'fromSessions',     coalesce((select sum(amount) from vendor_wallet_transactions where vendor_id = p_vendor and type = 'credit' and session_id is not null), 0),
  'otherCredits',     coalesce((select sum(amount) from vendor_wallet_transactions where vendor_id = p_vendor and type = 'credit' and session_id is null), 0),
  'debits',           coalesce((select sum(amount) from vendor_wallet_transactions where vendor_id = p_vendor and type = 'debit'), 0),
  'transactions',     (select count(*) from vendor_wallet_transactions where vendor_id = p_vendor),
  'sessions',         (select count(*) from chat_sessions where vendor_id = p_vendor),
  'paidSessions',     (select count(distinct session_id) from vendor_wallet_transactions where vendor_id = p_vendor and type = 'credit' and session_id is not null),
  'withdrawals',      (select count(*) from withdrawal_requests where astrologer_id = p_vendor),
  'withdrawnPaid',    coalesce((select sum(amount) from withdrawal_requests where astrologer_id = p_vendor and status = 'paid'), 0),
  'withdrawPending',  coalesce((select sum(amount) from withdrawal_requests where astrologer_id = p_vendor and status in ('pending', 'approved')), 0)
);
$$;

-- Backend (service role) only. Postgres grants EXECUTE to PUBLIC by default.
revoke all on function public.admin_consultations(timestamptz, text, text, text, boolean, text, text, integer, integer, uuid) from public, anon, authenticated;
revoke all on function public.admin_astrologer_ledger_summary(uuid) from public, anon, authenticated;
grant execute on function public.admin_consultations(timestamptz, text, text, text, boolean, text, text, integer, integer, uuid) to service_role;
grant execute on function public.admin_astrologer_ledger_summary(uuid) to service_role;
