-- customers.fcm_token was referenced everywhere in the backend (OTP verify, admin push
-- broadcast, session-manager call notifications) but the column never actually existed on
-- the customers table (astrologers already has it). Every insert that included fcm_token
-- (i.e. every OTP verify for a brand-new customer) was silently failing with PGRST204
-- ("Could not find the 'fcm_token' column"), so new signups never got a real customer row.
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS fcm_token text;
