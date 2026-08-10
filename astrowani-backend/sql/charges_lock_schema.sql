-- Locks an astrologer's own ability to edit their chat/call/video charges
-- after the first time they save them via the vendor app (EditProfile.js).
-- NULL = never set yet, editable. Non-null = locked; only the admin
-- dashboard (PATCH /api/admin/astrologers/:id, unrestricted) or an explicit
-- admin unlock (POST /api/admin/astrologers/:id/unlock-charges, which sets
-- this back to NULL) can change charges from here on.
ALTER TABLE public.astrologers ADD COLUMN IF NOT EXISTS charges_locked_at timestamptz;
