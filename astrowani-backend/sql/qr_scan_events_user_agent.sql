-- Diagnostic columns on qr_scan_events: the browser signature and client-hint platform of each
-- scan, so an odd scan can be explained from its own row. APPLIED 2026-09-25. Idempotent.
alter table public.qr_scan_events add column if not exists user_agent text;
alter table public.qr_scan_events add column if not exists platform_hint text;
revoke all on public.qr_scan_events from anon, authenticated;
