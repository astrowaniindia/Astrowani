# Deployment & Releases — how a fix actually reaches users

Merging a PR is **not the same thing** as a fix reaching a real phone or the live backend.
The two halves of this app ship very differently. This file explains both, plus what
changes once OTA updates are added.

See also: [bug-scan-agent.md](bug-scan-agent.md) (opens PRs, never ships them),
[recurring-bugs-playbook.md](recurring-bugs-playbook.md),
[vps-git-deploy-guide.md](vps-git-deploy-guide.md) (step-by-step — how to verify a deploy
landed, the exact manual fallback commands, and a known SSH-connection flakiness issue and
its mitigation).

## Backend (`astrowani-backend/`) — auto-deploys on merge

`.github/workflows/deploy-backend.yml` runs automatically whenever `main` changes **and**
the change touches something under `astrowani-backend/**`:

1. SSHes into the Hostinger VPS (as of 2026-08-10, retries the connection itself up to 5
   times — see [vps-git-deploy-guide.md](vps-git-deploy-guide.md) for why).
2. `git fetch origin main && git reset --hard origin/main`.
3. `npm install --production`.
4. `pm2 restart astrowani-backend --update-env`.

So: **merge a backend PR → it's live within a minute or two.** No separate deploy step.
(There's also `.github/workflows/deploy-admin.yml` for the admin dashboard — same idea,
different target: it builds on the VPS itself and copies the output to Nginx's static dir.)

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

## OTA updates for JS-only fixes — fully set up and verified working (2026-08-05, confirmed live 2026-08-10)

**Hot Updater** (self-hosted, Supabase-backed) is wired into both apps' code and the one-time
setup (`hot-updater init` per app — Supabase storage bucket + DB table + Edge Function) is
done; both apps' `index.js` point at a real Edge Function URL, not a placeholder.

- `@hot-updater/react-native` (runtime) + `hot-updater` (CLI, devDependency) installed in
  both `astrowani_customer-main/` and `astrowani_vendors-main/`.
- Android: both apps' `MainApplication.kt` serve `HotUpdater.getJSBundleFile(...)` as the JS
  bundle (falls back to the bundle baked into the APK if no OTA update has been downloaded
  yet).
- JS: both apps' `index.js` wrap the root component in `HotUpdater.wrap({ baseURL, ... })`
  before registering it.

**To ship a JS-only fix**, from the changed app's directory:
```bash
NODE_OPTIONS="--max-old-space-size=8192" npx hot-updater deploy -p android
```
The extra heap is not optional in practice — a plain `npx hot-updater deploy -p android` ran
out of memory mid-bundle on this project's size on 2026-08-10; the larger heap fixed it on the
first retry. Also give it real time to finish (5–10 minutes, mostly the Hermes bundle build) —
don't wrap it in a short shell `timeout`, a premature kill mid-build looks like a different,
unrelated failure (a killed Metro/jest worker process).

**Confirmed working end-to-end on 2026-08-10**: both `astrowani_customer-main` (targeting
installed version `24.x`) and `astrowani_vendors-main` (targeting `6.5.x`) deployed
successfully — build → Hermes compile → Supabase upload → DB record, each returning a real
deployment ID. A signup-flow fix (missing photo-picker modal + a backend OTP bug) shipped this
way and was verified working in a running app afterward.

- **Native changes** (new native module, permissions, Gradle/manifest edits, new native
  library) still require the full build-and-Play-Store-release process above — OTA cannot
  touch native code, only the JS bundle.
- **`updateStrategy: 'appVersion'`** means an OTA update only reaches devices already running
  a matching installed app version — it does not reach users on an older version who haven't
  updated via the Play Store at least once since Hot Updater was added.
