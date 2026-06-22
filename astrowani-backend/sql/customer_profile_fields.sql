-- Customer profile fields.
--
-- WHY: The profile screen collects more than the customers table stored. These columns
-- let all customer-entered profile data persist (and an astrologer receive it during a
-- chat). `time_of_birth`, `place_of_birth`, `gender`, `dob`, `profile_image` already exist
-- from registration; this adds the rest. Run in Supabase SQL editor. Safe to re-run.

ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS gender         text;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS dob            date;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS time_of_birth  text;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS place_of_birth text;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS state          text;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS marital_status text;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS profile_image  text;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS hand_image     text;
