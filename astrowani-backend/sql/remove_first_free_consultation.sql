-- Removes the "first consultation free" feature (see sql/first_free_consultation_schema.sql).
--
-- WHY: feature removed entirely from the app — no code reads or writes is_free_session
-- anymore (client-side eligibility gate, banners, and the sessionManager billing-skip
-- window are all gone). Dropping the column so nothing can silently resurrect the old
-- behavior. Safe to re-run.

ALTER TABLE public.chat_sessions DROP COLUMN IF EXISTS is_free_session;
