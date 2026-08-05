# Deployment & Releases — how a fix actually reaches users

Merging a PR is **not the same thing** as a fix reaching a real phone or the live backend.
The two halves of this app ship very differently. This file explains both, plus what
changes once OTA updates are added.

See also: [bug-scan-agent.md](bug-scan-agent.md) (opens PRs, never ships them),
[recurring-bugs-playbook.md](recurring-bugs-playbook.md).

## Backend (`astrowani-backend/`) — auto-deploys on merge

`.github/workflows/deploy-backend.yml` runs automatically whenever `main` changes **and**
the change touches something under `astrowani-backend/**`:

1. SSHes into the Hostinger VPS.
2. `git fetch origin main && git reset --hard origin/main`.
3. `npm install --production`.
4. `pm2 restart astrowani-backend --update-env`.

So: **merge a backend PR → it's live within a minute or two.** No separate deploy step.
(There's also `.github/workflows/deploy-admin.yml` for the admin dashboard — same idea,
different target.)

## Customer & Vendor apps (React Native) — merge is NOT enough

Neither app has an auto-deploy pipeline. A merged PR only updates the source code in the
repo — it changes **nothing** on a phone that already has the app installed, because RN apps
ship as a compiled bundle baked into the APK at build time.

**Current process to actually ship a fix**, for both `astrowani_customer-main/` and
`astrowani_vendors-main/`:

1. Bump `versionCode` and `versionName` in `android/app/build.gradle`.
2. Build a release AAB.
3. Upload it to the Google Play Console and publish a release.
4. Play Store review + staged rollout before every user gets it.

(Example of this being done: the Android 16 / API 36 target-SDK compliance bump, versionCode
22→24 customer / 13→15 vendor.)

This means a JS-only bug fix — even a trivial 2-line one — currently takes a full store
release cycle to actually reach users, same as a major feature.

## OTA updates for JS-only fixes — code wired, one setup step left (2026-08-05)

**Hot Updater** (self-hosted, Supabase-backed) is now wired into both apps' code:
- `@hot-updater/react-native` (runtime) + `hot-updater` (CLI, devDependency) installed in
  both `astrowani_customer-main/` and `astrowani_vendors-main/`.
- Android: both apps' `MainApplication.kt` now serve `HotUpdater.getJSBundleFile(...)` as the
  JS bundle (falls back to the bundle baked into the APK if no OTA update has been
  downloaded yet).
- JS: both apps' `index.js` wrap the root component in `HotUpdater.wrap({ baseURL, ... })`
  before registering it.

**What's still a manual, one-time step** (needs your Supabase login — not something this
session can do):
1. `npx -y supabase login` (from either app's directory).
2. `npx hot-updater init` — pick "Bare/React Native CLI" as the build system and **Supabase**
   as the provider. This creates the storage bucket + database table in your existing
   Supabase project, deploys a Supabase Edge Function that serves the update-check endpoint,
   and writes `hot-updater.config.ts` + `.env.hotupdater` (the latter holds your Supabase
   service role key — already added to `.gitignore`, **never commit it**).
3. The init step prints the Edge Function URL
   (`https://<project-ref>.supabase.co/functions/v1/update-server`). Replace the placeholder
   string `'REPLACE_ME_AFTER_HOT_UPDATER_INIT'` in both apps' `index.js` with that URL.
4. Repeat steps 2–3 for the **other** app (each app needs its own bucket/table — run `init`
   separately in each directory, or point both at the same provider project with distinct
   bucket names — your call).
5. To ship a JS-only fix from then on: `npx hot-updater deploy -p android` from the changed
   app's directory, instead of a full versionCode bump + Play Store release.

- **Native changes** (new native module, permissions, Gradle/manifest edits, new native
  library) still require the full build-and-Play-Store-release process above — OTA cannot
  touch native code, only the JS bundle.
- **Not yet tested end-to-end** — the native `MainApplication.kt` edits haven't been verified
  against a real Gradle build in this session (Android builds hit tooling friction earlier
  today unrelated to this change). Do a real build + install after finishing the setup steps
  above, before relying on this for a production fix.
