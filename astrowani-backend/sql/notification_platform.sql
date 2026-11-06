-- ─────────────────────────────────────────────────────────────────────────────
-- The notification platform.
--
-- Six new tables plus a few columns on the existing `notifications`, replacing a
-- system whose entire record of a send was "FCM accepted N messages".
--
-- Measured before writing this (2026-11-07, production): 4,857 live customers,
-- 289 holding a usable FCM token, 2,156 marked app-removed, ~2,412 with no token
-- and no recorded reason. 15,468 `notifications` rows carrying three distinct
-- types and a NULL `data` column on every single one. See
-- `MD files/Notification-System-Audit-and-Design-2026-11-07.md`.
--
-- SAFE TO RE-RUN. Everything is IF NOT EXISTS / ADD COLUMN IF NOT EXISTS, and the
-- DO $$ block at the bottom raises if the end state is not what this file claims
-- (the standing rule for any migration whose effect is otherwise invisible).
--
-- GRANTS: every new table gets RLS on and ZERO privileges for anon/authenticated.
-- That is deliberately "deny everyone" — only the backend's service-role client
-- touches these, and the 31 `rls_enabled_no_policy` lints are the correct posture,
-- not a to-do. The explicit REVOKEs are there because `supabase_admin`'s default
-- privileges still auto-grant to anon AND authenticated on new tables (subsystem
-- CT); a table created through the SQL editor is owned by `postgres`, whose
-- defaults are clean, but this file must not depend on which client applied it.
-- ─────────────────────────────────────────────────────────────────────────────

-- ═════════════════════════════════════════════════════════════════════════════
-- 1. customer_devices
--
-- The customer side has had ONE text column, `customers.fcm_token`, written by
-- whichever device logged in last — so a customer with two phones is reachable on
-- exactly one of them and which one changes without warning. The astrologer side
-- has had `vendor_devices` since 2026-09 and this mirrors it deliberately, down to
-- the column names, so the two are readable side by side.
--
-- It also records the three things nothing has ever recorded, and which are the
-- whole reason "how many people have notifications on" could not be answered:
-- whether the OS permission was granted, denied or never asked, when that was
-- decided, and which language the app is in.
--
-- `customers.fcm_token` IS STILL WRITTEN and is still the primary device. Twenty-five
-- push call sites across index.js, adminRoutes, freeCallRoutes, sessionManager,
-- supportRoutes, waitlist and ringAstrologer read that column directly. This table
-- is additive; nothing migrates off it.
-- ═════════════════════════════════════════════════════════════════════════════
create table if not exists public.customer_devices (
  id                     uuid primary key default gen_random_uuid(),
  customer_id            uuid not null references public.customers(id) on delete cascade,
  -- Stable per install. The app derives it once and keeps it in AsyncStorage, so a
  -- token refresh updates a row instead of creating one.
  device_id              text not null,
  fcm_token              text,
  platform               text check (platform in ('ios', 'android', 'unknown')),
  app_version            text,
  -- 'en' | 'hi'. Nothing in this database has ever known which language a customer
  -- reads the app in, which is why every notification has gone out in one language
  -- to everybody despite 1,198 translated strings existing.
  locale                 text,
  -- 'undetermined' — never asked, or asked and the dialog never resolved.
  -- 'granted'      — the OS will show our notifications.
  -- 'denied'       — they answered no to the dialog.
  -- 'blocked'      — granted once, later switched off in system settings. Worth
  --                  separating from 'denied': a blocked user once said yes, so the
  --                  in-app ask that wins them back is a different conversation.
  permission_status      text not null default 'undetermined'
                           check (permission_status in ('undetermined', 'granted', 'denied', 'blocked')),
  permission_asked_at    timestamptz,
  permission_decided_at  timestamptz,
  -- Set when FCM confirms the token is unregistered — the same signal that already
  -- stamps customers.app_removed_at, now kept per device so one phone being wiped
  -- does not read as the customer leaving.
  app_removed_at         timestamptz,
  app_removed_reason     text,
  last_seen_at           timestamptz not null default now(),
  created_at             timestamptz not null default now(),
  unique (customer_id, device_id)
);

create index if not exists idx_customer_devices_customer on public.customer_devices (customer_id);
create index if not exists idx_customer_devices_token on public.customer_devices (fcm_token) where fcm_token is not null;
-- The reachability question, answered by an index scan: who can we actually push to.
create index if not exists idx_customer_devices_live on public.customer_devices (customer_id)
  where fcm_token is not null and app_removed_at is null and permission_status = 'granted';
create index if not exists idx_customer_devices_permission on public.customer_devices (permission_status);

-- ═════════════════════════════════════════════════════════════════════════════
-- 2. notification_templates — saved, reusable copy.
-- Created first because campaigns and automations both reference it.
-- ═════════════════════════════════════════════════════════════════════════════
create table if not exists public.notification_templates (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  category    text not null default 'promotional',
  title       text not null,
  body        text not null,
  title_hi    text,
  body_hi     text,
  image_url   text,
  deep_link   text,
  data        jsonb not null default '{}'::jsonb,
  created_by  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ═════════════════════════════════════════════════════════════════════════════
-- 3. notification_automations
--
-- The recurring and triggered sends. Nothing like this has existed: every one of
-- the 46 sends on record was a human pressing a button, now.
--
-- `enabled` DEFAULTS TO FALSE and every automation this migration seeds is off.
-- These things send to thousands of people unattended; the same posture as the
-- blog agent, and for the same reason.
-- ═════════════════════════════════════════════════════════════════════════════
create table if not exists public.notification_automations (
  id                  uuid primary key default gen_random_uuid(),
  -- Stable slug. The engine's cooldown and the sends log both key off this, so a
  -- renamed automation keeps its history.
  key                 text not null unique,
  name                text not null,
  description         text,
  enabled             boolean not null default false,

  -- 'schedule'  — a clock trigger: every day / certain weekdays at a local time.
  -- 'condition' — evaluated on a sweep: everyone currently matching `filters`
  --               (wallet empty, 14 days silent, birthday today).
  -- 'event'     — fired by the backend at the moment something happens, with an
  --               optional delay (recharge abandoned, session ended).
  trigger_type        text not null check (trigger_type in ('schedule', 'condition', 'event')),
  schedule_time       text,            -- 'HH:MM', interpreted in `timezone`
  schedule_days       smallint[],      -- 0=Sunday … 6=Saturday. NULL = every day.
  event_name          text,
  delay_minutes       integer not null default 0,
  timezone            text not null default 'Asia/Kolkata',

  audience            text not null default 'all_customers',
  filters             jsonb not null default '{}'::jsonb,
  category            text not null default 'engagement',

  template_id         uuid references public.notification_templates(id) on delete set null,
  title               text,
  body                text,
  title_hi            text,
  body_hi             text,
  image_url           text,
  deep_link           text,
  data                jsonb not null default '{}'::jsonb,

  -- Do not re-enter the same person inside this many days. The guard that stops a
  -- condition automation ("wallet is empty") pushing the same customer every
  -- single sweep for as long as the condition holds.
  cooldown_days       integer not null default 7,
  -- Blast-radius guard. A filter written wrongly is the realistic failure here, and
  -- its cost is measured in burned list rather than in money, so it is capped.
  max_per_run         integer not null default 2000,
  respect_quiet_hours boolean not null default true,

  last_run_at         timestamptz,
  next_run_at         timestamptz,
  total_sent          integer not null default 0,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists idx_notification_automations_due on public.notification_automations (next_run_at)
  where enabled;

-- ═════════════════════════════════════════════════════════════════════════════
-- 4. notification_campaigns — the unit an admin creates and the unit we report on.
-- ═════════════════════════════════════════════════════════════════════════════
create table if not exists public.notification_campaigns (
  id                  uuid primary key default gen_random_uuid(),
  name                text,
  status              text not null default 'draft'
                        check (status in ('draft', 'scheduled', 'sending', 'sent', 'paused', 'cancelled', 'failed')),

  -- 'transactional' is NEVER suppressed — not by quiet hours, not by a frequency
  -- cap, not by a category opt-out. A chat request, a call, an order update and a
  -- support reply have to arrive. Only 'engagement' and 'promotional' are governed.
  -- Getting this backwards means a customer missing a consultation they paid for.
  category            text not null default 'promotional'
                        check (category in ('transactional', 'engagement', 'promotional')),

  audience            text not null,
  target_ids          uuid[],
  -- Rich targeting, interpreted by src/notifications/targeting.js. Everything the
  -- old page could not do: platform, wallet balance, recharge history, consultation
  -- count, days since last session, locale, state, gender, age, free-call used.
  filters             jsonb not null default '{}'::jsonb,
  -- The pre-existing acquisition-source segments, kept so nothing that worked stops.
  segments            text[],

  title               text not null,
  body                text not null,
  title_hi            text,
  body_hi             text,
  image_url           text,
  deep_link           text,
  data                jsonb not null default '{}'::jsonb,
  -- [{key, title, body, image_url, weight}] — A/B. NULL means one version.
  variants            jsonb,

  scheduled_at        timestamptz,
  timezone            text not null default 'Asia/Kolkata',
  respect_quiet_hours boolean not null default true,
  respect_frequency_cap boolean not null default true,
  -- Drop rather than deliver late. A "₹75 = ₹101 today" push arriving tomorrow is
  -- worse than no push.
  expires_at          timestamptz,

  automation_id       uuid references public.notification_automations(id) on delete set null,
  template_id         uuid references public.notification_templates(id) on delete set null,
  created_by          text,

  started_at          timestamptz,
  finished_at         timestamptz,

  -- Roll-ups, maintained by the sender. The per-recipient truth is in
  -- notification_sends; these exist so a list of 500 campaigns does not need 500
  -- aggregate queries to render.
  recipient_count     integer not null default 0,
  sent_count          integer not null default 0,
  failed_count        integer not null default 0,
  suppressed_count    integer not null default 0,
  delivered_count     integer not null default 0,
  opened_count        integer not null default 0,
  clicked_count       integer not null default 0,
  error               text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists idx_notification_campaigns_status on public.notification_campaigns (status, scheduled_at);
create index if not exists idx_notification_campaigns_created on public.notification_campaigns (created_at desc);
create index if not exists idx_notification_campaigns_automation on public.notification_campaigns (automation_id)
  where automation_id is not null;

-- ═════════════════════════════════════════════════════════════════════════════
-- 5. notification_sends
--
-- ONE ROW PER PERSON PER CAMPAIGN. This single table is what makes "did anyone see
-- it" answerable, and its absence is why 46 broadcasts cannot be scored.
--
-- Per PERSON, not per device: the push goes to every live token that person holds,
-- and `device_count` records how many. Attribution belongs to the human. It also
-- makes the unique index below possible, which is the strongest available guard
-- against the duplicate-send class of bug — and the history shows the same Diwali
-- offer going out three times in 24 hours.
--
-- customer_id/astrologer_id are ON DELETE SET NULL, not CASCADE: a campaign's
-- numbers must survive an account deletion, the same decision already taken for
-- session_flags and customer_reports.
-- ═════════════════════════════════════════════════════════════════════════════
create table if not exists public.notification_sends (
  id              uuid primary key default gen_random_uuid(),
  campaign_id     uuid not null references public.notification_campaigns(id) on delete cascade,
  customer_id     uuid references public.customers(id) on delete set null,
  astrologer_id   uuid references public.astrologers(id) on delete set null,
  device_count    integer not null default 0,
  -- Last 8 characters only. Enough to match a send against a device row when
  -- debugging; not a credential anybody can push with.
  token_tail      text,
  variant         text,

  status          text not null default 'queued'
                    check (status in ('queued', 'sent', 'failed', 'suppressed')),
  -- WHY a person did not get it: 'no_device' | 'token_dead' | 'permission_denied'
  -- | 'opted_out' | 'quiet_hours' | 'frequency_cap' | 'expired' | 'deleted_account'.
  -- Recorded rather than dropped, because otherwise a quiet system and a broken one
  -- look identical from the outside.
  suppress_reason text,
  fail_code       text,
  -- The in-app `notifications` row, so an open can be traced from either side.
  notification_id uuid,

  sent_at         timestamptz,
  delivered_at    timestamptz,
  opened_at       timestamptz,
  clicked_at      timestamptz,
  converted_at    timestamptz,
  open_count      integer not null default 0,
  created_at      timestamptz not null default now()
);

create index if not exists idx_notification_sends_campaign on public.notification_sends (campaign_id, status);
create index if not exists idx_notification_sends_customer on public.notification_sends (customer_id, created_at desc)
  where customer_id is not null;
create index if not exists idx_notification_sends_astrologer on public.notification_sends (astrologer_id, created_at desc)
  where astrologer_id is not null;
-- The duplicate-send guard. A retried or double-clicked send cannot push twice.
create unique index if not exists uq_notification_sends_campaign_customer
  on public.notification_sends (campaign_id, customer_id) where customer_id is not null;
create unique index if not exists uq_notification_sends_campaign_astrologer
  on public.notification_sends (campaign_id, astrologer_id) where astrologer_id is not null;

-- ═════════════════════════════════════════════════════════════════════════════
-- 6. notification_preferences
--
-- Today a customer who wants order updates but not offers has exactly one lever:
-- switch notifications off for the whole app — which the published research says
-- 46% of them do after 2–5 promos a week.
--
-- There is deliberately NO `transactional` column. It is not a preference.
-- ═════════════════════════════════════════════════════════════════════════════
create table if not exists public.notification_preferences (
  customer_id   uuid primary key references public.customers(id) on delete cascade,
  promotional   boolean not null default true,
  engagement    boolean not null default true,
  horoscope     boolean not null default true,
  -- Local hours, 0–23, in `timezone`. quiet_start 22 / quiet_end 8 means "nothing
  -- between 10pm and 8am". NULL on either means the platform default applies.
  quiet_start   smallint check (quiet_start between 0 and 23),
  quiet_end     smallint check (quiet_end between 0 and 23),
  timezone      text not null default 'Asia/Kolkata',
  updated_at    timestamptz not null default now()
);

-- ═════════════════════════════════════════════════════════════════════════════
-- 7. Columns on the existing `notifications`
--
-- `data` already exists and is NULL on all 15,468 rows, so no notification in the
-- in-app list has ever carried a destination — tapping one navigates nowhere.
--
-- No CHECK constraints and no NOT NULLs here on purpose: six modules already
-- insert into this table and a constraint added now would break a write path that
-- works.
-- ═════════════════════════════════════════════════════════════════════════════
alter table public.notifications add column if not exists image_url   text;
alter table public.notifications add column if not exists deep_link   text;
alter table public.notifications add column if not exists category    text;
alter table public.notifications add column if not exists campaign_id uuid;
-- `is_read` is a boolean with no timestamp, so "when did they read it" has never
-- been answerable. Kept alongside rather than replacing it: both apps read is_read.
alter table public.notifications add column if not exists read_at     timestamptz;
-- A time-limited offer should stop appearing in the list once it has expired.
alter table public.notifications add column if not exists expires_at  timestamptz;

create index if not exists idx_notifications_campaign on public.notifications (campaign_id)
  where campaign_id is not null;

-- ═════════════════════════════════════════════════════════════════════════════
-- RLS + grants
-- ═════════════════════════════════════════════════════════════════════════════
alter table public.customer_devices           enable row level security;
alter table public.notification_templates     enable row level security;
alter table public.notification_automations   enable row level security;
alter table public.notification_campaigns     enable row level security;
alter table public.notification_sends         enable row level security;
alter table public.notification_preferences   enable row level security;

revoke all on public.customer_devices         from anon, authenticated;
revoke all on public.notification_templates   from anon, authenticated;
revoke all on public.notification_automations from anon, authenticated;
revoke all on public.notification_campaigns   from anon, authenticated;
revoke all on public.notification_sends       from anon, authenticated;
revoke all on public.notification_preferences from anon, authenticated;

-- ═════════════════════════════════════════════════════════════════════════════
-- Seed the automation catalogue, ALL DISABLED.
--
-- These are the flows section 2.5 of the audit lists as missing. They are seeded
-- rather than left to be hand-typed so the copy, the filters and the cooldowns are
-- reviewable in git — and so turning one on is a switch rather than a build.
--
-- ON CONFLICT DO NOTHING: re-running must never re-enable an automation the owner
-- switched on, nor overwrite copy they edited in the admin.
-- ═════════════════════════════════════════════════════════════════════════════
insert into public.notification_automations
  (key, name, description, trigger_type, schedule_time, schedule_days, event_name, delay_minutes,
   audience, filters, category, title, body, title_hi, body_hi, deep_link, cooldown_days, max_per_run)
values
  ('weekly_horoscope', 'Weekly horoscope — Monday morning',
   'The single highest-retention recurring push in this category. Monday 9am IST.',
   'schedule', '09:00', '{1}', null, 0,
   'all_customers', '{"hasDevice":true}'::jsonb, 'engagement',
   'Your week ahead is ready ✨', 'See what the stars have planned for you this week.',
   'आपका साप्ताहिक राशिफल तैयार है ✨', 'देखिए इस हफ्ते सितारे आपके लिए क्या कहते हैं।',
   'Home', 6, 5000),

  ('birthday', 'Birthday wishes',
   'We hold dob on every customer and have never used it. 10am IST.',
   'schedule', '10:00', null, null, 0,
   'all_customers', '{"hasDevice":true,"birthdayToday":true}'::jsonb, 'engagement',
   'Happy birthday, {name} 🎉', 'A gift is waiting in your wallet. Talk to an astrologer about your year ahead.',
   'जन्मदिन मुबारक, {name} 🎉', 'आपके वॉलेट में एक तोहफ़ा है। अपने आने वाले साल के बारे में बात कीजिए।',
   'Wallet', 300, 500),

  ('wallet_empty', 'Wallet ran dry after a session',
   'Consulted at least once, balance now under 20 rupees, quiet for a day.',
   'condition', null, null, null, 0,
   'all_customers', '{"hasDevice":true,"minConsultations":1,"maxWalletBalance":20,"minDaysSinceSession":1,"maxDaysSinceSession":14}'::jsonb,
   'engagement',
   'Pick up where you left off', 'Add ₹100 and keep talking to your astrologer — your reading is still open.',
   'जहाँ छोड़ा था वहीं से शुरू कीजिए', '₹100 जोड़िए और अपने ज्योतिषी से बात जारी रखिए।',
   'Wallet', 10, 2000),

  ('onboarding_day1', 'Day 1 — signed up, never consulted',
   'Signed up yesterday and has not had a single session.',
   'condition', null, null, null, 0,
   'all_customers', '{"hasDevice":true,"maxConsultations":0,"minDaysSinceSignup":1,"maxDaysSinceSignup":1}'::jsonb,
   'engagement',
   'Your first consultation is on us 🎁', 'Your free call is still unused. Pick an astrologer and ask them anything.',
   'आपकी पहली बात हमारी तरफ़ से 🎁', 'आपकी मुफ़्त कॉल अभी बाकी है। ज्योतिषी चुनिए और कुछ भी पूछिए।',
   'Home', 3, 2000),

  ('onboarding_day3', 'Day 3 — still never consulted',
   'Three days in, no session yet. Different angle from day 1.',
   'condition', null, null, null, 0,
   'all_customers', '{"hasDevice":true,"maxConsultations":0,"minDaysSinceSignup":3,"maxDaysSinceSignup":4}'::jsonb,
   'engagement',
   'Still thinking about it?', 'Thousands ask about career, marriage and money every day. Your first 7 minutes are free.',
   'अभी सोच रहे हैं?', 'हज़ारों लोग रोज़ करियर, शादी और पैसे के सवाल पूछते हैं। आपके पहले 7 मिनट मुफ़्त हैं।',
   'Home', 3, 2000),

  ('winback_14d', 'Win-back — 14 days quiet',
   'Consulted before, nothing for a fortnight.',
   'condition', null, null, null, 0,
   'all_customers', '{"hasDevice":true,"minConsultations":1,"minDaysSinceSession":14,"maxDaysSinceSession":29}'::jsonb,
   'engagement',
   'Your astrologer remembers you', 'It has been two weeks. Something on your mind? They are online now.',
   'आपके ज्योतिषी को आप याद हैं', 'दो हफ़्ते हो गए। कुछ मन में है? वो अभी ऑनलाइन हैं।',
   'Home', 20, 2000),

  ('winback_30d', 'Win-back — 30 days quiet',
   'A month of silence. Last engagement attempt before they are treated as lapsed.',
   'condition', null, null, null, 0,
   'all_customers', '{"hasDevice":true,"minConsultations":1,"minDaysSinceSession":30,"maxDaysSinceSession":89}'::jsonb,
   'engagement',
   'We kept your chart safe 🪔', 'A month is a long time in astrology. See what has changed for you.',
   'आपकी कुंडली हमने सहेज रखी है 🪔', 'ज्योतिष में एक महीना बहुत होता है। देखिए आपके लिए क्या बदला।',
   'Home', 45, 3000),

  ('free_call_unused', 'Free call still unused',
   'Holds a live free-call invite, two days old, never booked.',
   'condition', null, null, null, 0,
   'all_customers', '{"hasDevice":true,"freeCallUnused":true,"minDaysSinceSignup":2,"maxDaysSinceSignup":9}'::jsonb,
   'engagement',
   'Your free 7-minute call is waiting', 'No payment, no card. Just pick an astrologer and talk.',
   'आपकी 7 मिनट की मुफ़्त कॉल बाकी है', 'कोई पेमेंट नहीं, कोई कार्ड नहीं। बस ज्योतिषी चुनिए और बात कीजिए।',
   'Home', 7, 2000),

  -- delay_minutes is 0 on purpose: the 30-minute wait comes from the worker's
  -- sweep window (ABANDONED_MIN_AGE_MIN), because "did they pay" can only be
  -- answered once that time has passed. Stacking both would make it an hour late.
  ('recharge_abandoned', 'Recharge abandoned',
   'Opened the wallet, closed it without paying. Detected by the worker sweep 30 minutes on.',
   'event', null, null, 'recharge_abandoned', 0,
   'all_customers', '{"hasDevice":true}'::jsonb, 'engagement',
   'Something go wrong with the payment?', 'Your recharge did not go through. Tap to try again — it takes 20 seconds.',
   'पेमेंट में कुछ दिक्कत हुई?', 'आपका रिचार्ज पूरा नहीं हुआ। दोबारा कोशिश कीजिए — 20 सेकंड लगेंगे।',
   'Wallet', 2, 2000),

  ('astrologer_viewed', 'Viewed a profile and left',
   'Opened an astrologer profile, started nothing. Fires two hours later.',
   'event', null, null, 'astrologer_profile_abandoned', 120,
   'all_customers', '{"hasDevice":true}'::jsonb, 'engagement',
   'They are still online', 'The astrologer you were looking at is free right now.',
   'वो अभी भी ऑनलाइन हैं', 'जिन ज्योतिषी को आप देख रहे थे, वो अभी फ़्री हैं।',
   'Home', 3, 2000)
on conflict (key) do nothing;

-- ═════════════════════════════════════════════════════════════════════════════
-- Backfill customer_devices from the single-column world.
--
-- Every customer currently holding an fcm_token gets one device row, so the new
-- reachability reporting is not empty on day one and a campaign written before the
-- apps ship an update still has somewhere to send.
--
-- device_id 'legacy' marks it as inferred rather than reported. permission_status
-- is 'granted' because a token cannot exist without the permission having been
-- granted at the time it was issued — that is a fact about the token, not a guess.
-- The app overwrites the row with its real device_id on first launch.
-- ═════════════════════════════════════════════════════════════════════════════
insert into public.customer_devices (customer_id, device_id, fcm_token, platform, permission_status, permission_decided_at, last_seen_at)
select c.id, 'legacy', c.fcm_token, coalesce(c.platform, 'unknown'), 'granted', c.created_at, now()
from public.customers c
where c.fcm_token is not null
  and c.mobile not like 'deleted:%'
on conflict (customer_id, device_id) do nothing;

-- ═════════════════════════════════════════════════════════════════════════════
-- Self-verifying tail. Raises if the end state is not what this file claims — the
-- standing rule for a migration whose effect is otherwise invisible.
-- ═════════════════════════════════════════════════════════════════════════════
do $$
declare
  missing text;
  n_auto  integer;
  n_dev   integer;
  n_grant integer;
begin
  select string_agg(t, ', ') into missing
  from (values
    ('customer_devices'), ('notification_templates'), ('notification_automations'),
    ('notification_campaigns'), ('notification_sends'), ('notification_preferences')
  ) as v(t)
  where not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = v.t
  );
  if missing is not null then
    raise exception 'notification_platform: tables missing after apply: %', missing;
  end if;

  select string_agg(c, ', ') into missing
  from (values ('image_url'), ('deep_link'), ('category'), ('campaign_id'), ('read_at'), ('expires_at')) as v(c)
  where not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'notifications' and column_name = v.c
  );
  if missing is not null then
    raise exception 'notification_platform: notifications columns missing: %', missing;
  end if;

  select count(*) into n_auto from public.notification_automations;
  if n_auto < 10 then
    raise exception 'notification_platform: expected at least 10 seeded automations, found %', n_auto;
  end if;
  if exists (select 1 from public.notification_automations where key like 'winback%' and enabled) then
    raise exception 'notification_platform: a seeded automation is ENABLED — it must ship off';
  end if;

  select count(*) into n_dev from public.customer_devices;
  select count(*) into n_grant from public.customer_devices where permission_status = 'granted';
  raise notice 'notification_platform: ok — % automations seeded (all off), % device rows backfilled (% granted)',
    n_auto, n_dev, n_grant;

  -- anon/authenticated must hold nothing on any of the six.
  select count(*) into n_grant
  from information_schema.role_table_grants
  where table_schema = 'public'
    and grantee in ('anon', 'authenticated')
    and table_name in ('customer_devices', 'notification_templates', 'notification_automations',
                       'notification_campaigns', 'notification_sends', 'notification_preferences');
  if n_grant > 0 then
    raise exception 'notification_platform: anon/authenticated hold % privilege(s) on the new tables', n_grant;
  end if;
end $$;
