-- Pin search_path on the last two functions without one (Supabase advisor
-- function_search_path_mutable, 2026-11-14). APPLIED 2026-11-14.
-- Neither is SECURITY DEFINER, so this is hygiene rather than a live hole: an unpinned
-- search_path lets a role that can create objects in an earlier schema shadow the
-- tables these functions reference.
ALTER FUNCTION public.astrologer_review_stats(uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.free_call_bookings_touch_updated_at() SET search_path = public, pg_temp;
