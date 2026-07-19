-- Packaged life reports (career/marriage/health/finance) — reuses the existing Remedies
-- Shop e-commerce pattern (remedy_items + orders) with a new item type, 'life_report',
-- rather than a parallel table. The one thing physical remedies don't need: digital
-- delivery of the finished report content once an astrologer/admin prepares it.
-- No RLS — matches orders, written by the app's anon/service client.
-- Run in Supabase SQL editor. Safe to re-run.

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS report_content text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS delivered_at timestamptz;
