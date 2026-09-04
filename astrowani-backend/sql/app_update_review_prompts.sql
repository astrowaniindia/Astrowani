-- ─────────────────────────────────────────────────────────────────────────────
-- In-app "please update" and "please rate us on Play Store" prompts.
--
-- Both live as ONE JSON blob each in the existing app_settings key/value table
-- (same pattern as free_call_offer / session_intro_banner) so the admin can edit
-- every field from astrowani-admin -> App Prompts without a schema change and
-- without a new settings endpoint — the generic PATCH /api/admin/settings already
-- stores arbitrary keys.
--
-- Run in the Supabase SQL editor. Idempotent (ON CONFLICT DO NOTHING), so re-running
-- never clobbers values an admin has since edited.
--
-- NOTE on defaults: the update config is seeded with the versions that are live at
-- the time of writing (customer 24.1 / build 33, vendor 6.6 / build as shipped) and
-- `enabled: false`. That is deliberate — seeding it enabled with a latestVersion
-- equal to what is already installed is harmless, but seeding a WRONG version would
-- pop "please update" at every user for a build that does not exist on the Play
-- Store yet. Set the real numbers on the admin page, then tick "Enabled".
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO public.app_settings (key, value) VALUES (
  'app_update_config',
  '{
    "enabled": false,
    "remindAfterHours": 24,
    "apps": {
      "customer": {
        "latestVersion": "24.1",
        "latestBuild": 33,
        "minSupportedVersion": "0",
        "minSupportedBuild": 0,
        "storeUrl": "https://play.google.com/store/apps/details?id=com.astrowanicustomer",
        "title": "A new version is available",
        "message": "Update Astrowani to get the latest features, faster calls and important fixes.",
        "titleHi": "नया अपडेट उपलब्ध है",
        "messageHi": "नई सुविधाओं और ज़रूरी सुधारों के लिए Astrowani को अपडेट करें।"
      },
      "vendor": {
        "latestVersion": "6.6",
        "latestBuild": 0,
        "minSupportedVersion": "0",
        "minSupportedBuild": 0,
        "storeUrl": "https://play.google.com/store/apps/details?id=com.astrowaniVendor",
        "title": "A new version is available",
        "message": "Update the Astrowani Astrologer app to keep receiving calls and chats reliably.",
        "titleHi": "नया अपडेट उपलब्ध है",
        "messageHi": "कॉल और चैट सही तरह पाने के लिए Astrowani Astrologer ऐप अपडेट करें।"
      }
    }
  }'
) ON CONFLICT (key) DO NOTHING;

INSERT INTO public.app_settings (key, value) VALUES (
  'app_review_prompt_config',
  '{
    "enabled": true,
    "minAppOpens": 4,
    "minDaysSinceInstall": 2,
    "remindAfterDays": 30,
    "askAfterGoodRating": true,
    "title": "Enjoying Astrowani?",
    "message": "A quick rating on the Play Store helps other people find us. It takes less than a minute.",
    "titleHi": "Astrowani पसंद आया?",
    "messageHi": "Play Store पर एक छोटी सी रेटिंग से और लोग हम तक पहुँच पाते हैं। एक मिनट से भी कम लगेगा।",
    "storeUrls": {
      "customer": "https://play.google.com/store/apps/details?id=com.astrowanicustomer",
      "vendor": "https://play.google.com/store/apps/details?id=com.astrowaniVendor"
    }
  }'
) ON CONFLICT (key) DO NOTHING;

SELECT key, left(value, 60) AS value_preview
FROM public.app_settings
WHERE key IN ('app_update_config', 'app_review_prompt_config');
