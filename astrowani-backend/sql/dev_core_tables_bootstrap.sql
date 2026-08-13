-- LOCAL DEV ONLY — reconstructed structure of the core ad-hoc tables (the
-- ones with no sql/*.sql schema file per the 2026-08-07 data-layer audit),
-- built from a read-only column-name/type sample of production
-- (scripts/introspectCoreTables.js). Not a perfect match (constraints, exact
-- types, and indexes from the real tables aren't captured by sampling), but
-- good enough to develop/test against locally without ever touching real data.
-- Do NOT run this against production — it's for astrowani_dev only.

CREATE TABLE IF NOT EXISTS customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now(),
  name text,
  gender text,
  dob date,
  time_of_birth text,
  place_of_birth text,
  mobile text,
  email text,
  profile_image text,
  wallet_balance numeric DEFAULT 0,
  state text,
  marital_status text,
  hand_image text,
  fcm_token text,
  referral_code text
);

CREATE TABLE IF NOT EXISTS astrologers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now(),
  first_name text,
  last_name text,
  email text,
  phone_number text,
  gender text,
  date_of_birth date,
  experience numeric,
  languages jsonb,
  specialties jsonb,
  fcm_token text,
  profile_pic_url text,
  total_earnings numeric DEFAULT 0,
  today_earnings numeric DEFAULT 0,
  call_charge_per_minute numeric DEFAULT 0,
  chat_charge_per_minute numeric DEFAULT 0,
  video_charge_per_minute numeric DEFAULT 0,
  is_call_enabled boolean DEFAULT false,
  is_chat_enabled boolean DEFAULT false,
  is_video_call_enabled boolean DEFAULT false,
  is_available boolean DEFAULT false,
  video_price numeric,
  audio_price numeric,
  chat_price numeric,
  wallet_balance numeric DEFAULT 0,
  approval_status text DEFAULT 'pending',
  is_suspended boolean DEFAULT false,
  admin_notes text,
  is_live boolean DEFAULT false,
  average_rating numeric,
  total_reviews numeric DEFAULT 0,
  is_online boolean DEFAULT true,
  bio text,
  bank_account_holder text,
  bank_account_number text,
  bank_ifsc text,
  bank_name text,
  upi_id text
);

CREATE TABLE IF NOT EXISTS chat_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid,
  vendor_id uuid REFERENCES astrologers(id),
  caller_id uuid REFERENCES customers(id),
  per_minute_charge numeric,
  started_at timestamptz DEFAULT now(),
  ended_at timestamptz,
  call_type text,
  room_id text,
  call_request_id text,
  is_active boolean DEFAULT true,
  next_billing_at timestamptz
);

CREATE TABLE IF NOT EXISTS chat_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  caller_id uuid REFERENCES customers(id),
  receiver_id uuid REFERENCES astrologers(id),
  status text DEFAULT 'pending',
  request_type text,
  caller_name text,
  created_at timestamptz DEFAULT now(),
  responded_at timestamptz
);

CREATE TABLE IF NOT EXISTS call_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid REFERENCES customers(id),
  astrologer_id uuid REFERENCES astrologers(id),
  customer_name text,
  call_type text,
  status text DEFAULT 'pending',
  created_at timestamptz DEFAULT now(),
  room_id text,
  room_token text,
  session_id text,
  responded_at timestamptz
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid,
  session_id uuid REFERENCES chat_sessions(id),
  sender_id uuid,
  receiver_id uuid,
  message text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS wallet_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES customers(id),
  type text,
  amount numeric,
  description text,
  session_id uuid,
  request_id text,
  created_at timestamptz DEFAULT now(),
  idempotency_key text UNIQUE
);

CREATE TABLE IF NOT EXISTS vendor_wallet_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id uuid REFERENCES astrologers(id),
  type text,
  amount numeric,
  description text,
  session_id uuid,
  request_id uuid,
  created_at timestamptz DEFAULT now(),
  idempotency_key text UNIQUE
);
