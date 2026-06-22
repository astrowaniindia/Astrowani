-- Astrologer approval — grandfather existing accounts.
--
-- WHY: `approval_status` (added in admin_schema.sql) defaults to 'pending', so when the
-- customer app starts filtering on it, every astrologer that existed before this feature
-- would vanish. This backfills all current rows to 'approved' so the live app keeps working.
-- NEW signups insert approval_status='pending' (see vendor Registration.js) and go through
-- the admin "New Entries" → Accept flow.
--
-- Run ONCE in the Supabase SQL editor, right after the feature ships. Safe to re-run.

UPDATE public.astrologers
SET approval_status = 'approved'
WHERE approval_status IS NULL OR approval_status <> 'approved';
