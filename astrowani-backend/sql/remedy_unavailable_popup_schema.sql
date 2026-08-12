-- "We're not there yet" popup shown when a customer taps Place Order on a
-- remedy (remedies fulfillment isn't live — see RemedyShop.js's placeOrder,
-- which deliberately never calls POST /api/orders or touches the wallet).
-- Admin-editable title + message so the wording can change without a JS
-- release — same app_settings key/value pattern as live_aarti_youtube_url /
-- banner_interval_seconds. {item} in the message is replaced by the
-- customer app with the actual remedy's title at render time.
-- Run in Supabase SQL editor. Safe to re-run.

INSERT INTO public.app_settings (key, value)
SELECT 'remedy_unavailable_title', 'We''re not there yet'
WHERE NOT EXISTS (SELECT 1 FROM public.app_settings WHERE key = 'remedy_unavailable_title');

INSERT INTO public.app_settings (key, value)
SELECT 'remedy_unavailable_message',
  'We''re not currently delivering {item} to your location. Your wallet has not been charged — nothing has been deducted.'
WHERE NOT EXISTS (SELECT 1 FROM public.app_settings WHERE key = 'remedy_unavailable_message');
