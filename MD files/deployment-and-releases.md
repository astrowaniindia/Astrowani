# Deployment & Releases — how a fix actually reaches users

Merging a PR is **not the same thing** as a fix reaching a real phone or the live backend.
The two halves of this app ship very differently. This file explains both, plus what
changes once OTA updates are added.

See also: [bug-scan-agent.md](bug-scan-agent.md) (opens PRs, never ships them),
[recurring-bugs-playbook.md](recurring-bugs-playbook.md),
[vps-git-deploy-guide.md](vps-git-deploy-guide.md) (step-by-step — how to verify a deploy
landed, the exact manual fallback commands, and a known SSH-connection flakiness issue and
its mitigation).

---

## What's live where — FOUR LISTINGS, one backend, one admin

Astrowani is **two apps over four store listings**, not four apps. One backend, one
database, one admin dashboard; the store is a distribution channel, not a product. Nobody
forks a codebase per store, and nothing below should ever become a second dashboard.

Platform differences live in exactly three places and nowhere else:

1. **Named flags in code** — `astrowani_customer-main/src/utils/featureFlags.js` and
   `utils/payments.js`. Each one says *which Apple guideline* forces it. Never write
   `Platform.OS === 'ios'` inside a screen; scattered checks are how parity drift becomes
   invisible.
2. **Money** — Android pays with Razorpay, iOS with coins via Apple IAP
   (`PAYS_WITH_COINS`). Same wallet, same ledger, same 50/50 split.
3. **Store metadata** — listing text, screenshots, review notes, data-safety answers.
   Outside the repo; one checklist per listing (CLAUDE.md **CO** for Apple, **CP** for Play).

### The ledger

**Keep this table current on every store upload and every OTA.** It is the answer to "why
has this customer not got the fix yet", and without it that has to be reconstructed from
CLAUDE.md prose.

| Listing | Store version | Build | Newest enabled OTA bundle | As of |
|---|---|---|---|---|
| Customer × Play Store | `24.1` | versionCode **63** | `01a14a24-1851-70cb-b1ee-c7f61792a5a0` (target `24.1.x`) | 2026-10-19 |
| Customer × App Store | `24.1` (`MARKETING_VERSION`) | `CURRENT_PROJECT_VERSION` **4** — **WAITING_FOR_REVIEW**, manual release | `01a179a7-4727-7002-98ba-926f446ad410` (target `24.1`) | 2026-10-29 |
| Vendor × Play Store | `6.6` | versionCode **35** | `01a13240-f2d1-7e15-a631-1d729f5f7266` (target `6.6.x`) | 2026-10-19 |
| Vendor × App Store | `6.6` (`MARKETING_VERSION`) | `CURRENT_PROJECT_VERSION` **3** — **WAITING_FOR_REVIEW**, manual release | `01a183fe-8297-75f8-8526-e3fb5cde4f65` (target `6.6`) | 2026-10-29 |

Both iOS rows already have OTA bundles because `deployOta.js` publishes for both platforms
regardless of whether a build is on the App Store. They reach TestFlight and sideloaded
builds; they reach nobody else until the listings go live.

**Note the target-version asymmetry — it is the tooling's convention, not a mistake.**
Android bundles target `24.1.x` / `6.6.x`, iOS bundles target `24.1` / `6.6`.

### Reading the live state back

The ledger is a cache. The database is the truth:

```sql
SELECT target_app_version, platform, count(*) AS enabled_bundles, max(id::text) AS newest
FROM bundles WHERE enabled = true
GROUP BY target_app_version, platform ORDER BY target_app_version, platform;
```

Build numbers come from `android/app/build.gradle` (`versionCode` / `versionName`) and, for
iOS, `ios/*.xcodeproj/project.pbxproj` (`MARKETING_VERSION` / `CURRENT_PROJECT_VERSION`).

**`versionName` must not change between store builds** — `24.1` for customer, `6.6` for
vendor — or OTA bundles stop matching the installed app. Only `versionCode` goes up.

**Older targets stay enabled on purpose.** `24.0*` and `6.5*` bundles are still live
because installed builds on those versions exist; disabling them removes the only channel
that can still fix those phones. Prune R2 **by reference**, never by bucket (CLAUDE.md
**EC**).

### Telling the two platforms apart in the data

`customers.platform` (current) and `customers.signup_platform` (set once, at account
creation) — `astrowani-backend/sql/customer_platform.sql`, applied 2026-10-19. Written at
login from the `devicePlatform` field both apps send. Surfaced as the **Platform** filter
and column on admin → Customers, with both columns in the CSV export.

Null reads as **"Unknown"** and means *not recorded yet* — every customer who signed up
before this shipped, and anyone on a build predating it. It shrinks as customers log in.
It is **not** a third platform, and it is **not** the same as `acquisition_source` being
null (which is normal and permanent for every iPhone, since the Play Install Referrer has
no iOS equivalent).

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
NODE_OPTIONS="--max-old-space-size=8192 --require ./scripts/ota-ws-polyfill.js" \
  npx hot-updater deploy -p android
```

Both `NODE_OPTIONS` flags are load-bearing:

- **`--max-old-space-size=8192`** — a plain `npx hot-updater deploy -p android` ran out of
  memory mid-bundle on this project's size on 2026-08-10; the larger heap fixed it on the
  first retry.
- **`--require ./scripts/ota-ws-polyfill.js`** (added 2026-08-21, present in BOTH apps) —
  without it the deploy fails on **Node 20** at the upload step with a misleading error:

  ```
  📦 Uploading to Storage (Android • supabaseStorage)
  ■ fetch failed
  ■ Failed to upload bundle to storage
  ```

  This is **not** a network problem, and chasing it as one wastes a lot of time — the Hermes
  build succeeds first, so it looks specifically like the upload is broken. The real cause is
  that `@hot-updater/supabase` builds its storage client with `@supabase/supabase-js`'s
  `createClient()`, which constructs a Realtime client at import time and needs a **global
  `WebSocket`** — native only from Node 22. On Node 20 `createClient()` throws
  `"Node.js 20 detected without native WebSocket support"`, and hot-updater surfaces that as
  `fetch failed`.

  Diagnosed by eliminating every other layer: Supabase reachable (200), bucket present,
  service-role key valid, and the identical 5 MB `bundle.zip` uploading in ~4s via both raw
  `fetch` and the plugin's own supabase-js code path. The only difference was the global.
  Drop the flag once this project moves to Node 22+.

Also give it real time to finish (5–10 minutes, mostly the Hermes bundle build) — don't wrap
it in a short shell `timeout`, a premature kill mid-build looks like a different, unrelated
failure (a killed Metro/jest worker process).

**Confirmed working end-to-end on 2026-08-10**: both `astrowani_customer-main` (targeting
installed version `24.x`) and `astrowani_vendors-main` (targeting `6.5.x`) deployed
successfully — build → Hermes compile → Supabase upload → DB record, each returning a real
deployment ID. A signup-flow fix (missing photo-picker modal + a backend OTP bug) shipped this
way and was verified working in a running app afterward.

**Shipped again 2026-08-21** — `astrowani_customer-main`, deployment
`01a0245f-b41e-7f9c-8792-c2890b56391a`, targeting `24.0.x`, carrying the remedies
cart/checkout flow and its UI pass. Verified in the `bundles` table as the newest row with
`enabled: true`. Note what could NOT go this way in that release: the delivery-address
"Use my current location" button needs `ACCESS_FINE_LOCATION` in the manifest, which is a
native change — see the OTA limitation below.

- **Native changes** (new native module, permissions, Gradle/manifest edits, new native
  library) still require the full build-and-Play-Store-release process above — OTA cannot
  touch native code, only the JS bundle.
- **`updateStrategy: 'appVersion'`** means an OTA update only reaches devices already running
  a matching installed app version — it does not reach users on an older version who haven't
  updated via the Play Store at least once since Hot Updater was added.
