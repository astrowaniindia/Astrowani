-- Astrowani Store product catalog — a NEW, isolated table.
--
-- Deliberately NOT remedy_items. The existing Remedies Shop (remedy_items) already
-- powers a live customer-facing screen with real checkout/payment/commission logic
-- (see remedy_commerce_schema.sql etc.) — this table has no customer-facing consumer
-- at all yet. It exists purely so "Astrowani Store" in the admin dashboard has
-- somewhere of its own to keep products, completely separate from that live data.
-- Wire a customer-facing screen to it later if/when that's actually wanted.
--
-- Idempotent: safe to run more than once.

create extension if not exists pgcrypto;

create table if not exists store_products (
  id uuid primary key default gen_random_uuid(),
  category text not null check (category in ('gemstone', 'rudraksha', 'bracelet-mala', 'yantra', 'pooja')),
  name text not null,
  description text,
  -- Purpose tags (wealth/love/career/health/protection/marriage) — free-form jsonb array
  -- of strings rather than a join table; this catalog is small and admin-curated, not
  -- something that needs relational tag queries.
  tags jsonb not null default '[]'::jsonb,
  benefits jsonb not null default '[]'::jsonb,
  price numeric not null default 0 check (price >= 0),
  mrp numeric check (mrp is null or mrp >= 0),
  unit_label text,
  image text,
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_store_products_category on store_products (category, sort_order);

-- RLS on, no policies. The backend's admin routes use the service-role client, which
-- bypasses RLS entirely, so this doesn't block the admin dashboard. What it DOES do is
-- make sure the publishable/anon key (shipped in both mobile apps) cannot read or write
-- this table — the same lesson learned the hard way on the older core tables audited in
-- database_audit_20260807 (RLS OFF there let the anon key touch wallet balances). Add a
-- public-read policy here later, deliberately, if a customer-facing screen is ever built.
alter table store_products enable row level security;
