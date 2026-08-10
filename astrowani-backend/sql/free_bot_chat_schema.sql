-- Free 5-minute scripted "bot chat" welcome offer for new customers.
-- One credit ever per customer — enforced by this column being non-null
-- (conditional UPDATE ... WHERE free_bot_chat_credited_at IS NULL in the
-- backend route), same idempotency-by-flag pattern as other one-time bonuses.
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS free_bot_chat_credited_at timestamptz;
