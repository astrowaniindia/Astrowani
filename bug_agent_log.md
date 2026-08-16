# Bug-scan agent — running log

State tracking for the `/bug-scan` autonomous agent (`.claude/skills/bug-scan/SKILL.md`).
One row per crash signature (not per run) — carrying the latest verified status. Updated by
the agent every run; don't hand-edit unless correcting a stale status.

> **Consolidated 2026-08-16.** Rows from six unmerged `docs/bug-scan-log-*` branches (which
> each edited this file against the same base and so conflicted with each other) were folded
> in here and those branches deleted. Statuses below were re-verified against `main` at that
> time, not copied forward from the branches. See "Process notes" at the bottom.

| Date first seen | Crash signature | Source | Status | Notes |
|---|---|---|---|---|
| 2026-08-05 | `TypeError: Cannot read property 'map' of undefined` in `formatAuspiciousTime` (Sentry `REACT-NATIVE-1`, https://astrowani.sentry.io/issues/7653834455/) — `PanchangScreen.js` crashed because the backend's `/api/free-services/panchang` never returns `auspicious_period`/`inauspicious_period` | customer | fix-merged | PR #1 (https://github.com/astrowaniindia/Astrowani/pull/1) merged 2026-08-05T17:45:30Z — defaults both fields to `[]` before `.map()`. Duplicate PR #2 (`fix/panchang-screen-crash`) was closed unmerged, but its extra hardening is on `main` anyway (verified 2026-08-16: `PanchangScreen.js:342`/`:352` have `Array.isArray` guards, and `formatPanchangData`'s `nakshatra[0]`/`tithi[0]`/`karana[0]`/`yoga[0]` indexing is optional-chained) — landed via a manual cherry-pick outside the PR flow. **Still open, unrelated to the crash**: the backend does not populate real auspicious/inauspicious period data (upstream Jyotisham field names never verified — that host isn't reachable from the agent's environment). Human follow-up if that data is wanted. |
| 2026-08-06 | `Error: [messaging/unknown] ... TOO_MANY_REGISTRATIONS` from an unguarded `messaging().getToken()` in vendor `Registration.js` (Sentry `ASTROWANI-VENDOR-1`, https://astrowani.sentry.io/issues/7655529254/) | vendor | fix-merged | Occurrences grew 5 → 7 (last seen 2026-08-12T11:28). PR #4 (`fix/vendor-fcm-registration-crash`) was deleted unmerged during the 2026-08-16 PR cleanup, but its fix was then applied directly to `main` the same day: `Registration.js` now calls the shared `getFCMToken()` from `utils/Firebase.js` (reads the AsyncStorage cache first, only asks Firebase when there's no token, and catches its own errors) instead of a local unguarded `messaging().getToken()` whose rejected promise crashed the screen once a device hit the registration cap. The `RNFB_SILENCE_MODULAR_DEPRECATION_WARNINGS` flag moved with it to `utils/Firebase.js` module scope, where it now covers every `messaging()` call in that file rather than one call site. |
| 2026-08-07 | `TypeError: undefined is not a function` inside `TabBar` (Sentry `REACT-NATIVE-2`, https://astrowani.sentry.io/issues/7659581920/) — tree is `MySessionsScreen` → `MaterialTopTabNavigator`/`TabView` → `TabBarTop` → `TabBar` | customer | fix-merged | **Was already fixed on `main` before the agent's last four runs, which all recorded it as "investigating".** Commit `da7a820` (2026-08-08) replaced `@react-navigation/material-top-tabs` in `MySessionScreen.js` with a hand-built tab bar — `SESSION_TABS` + a horizontal `ScrollView` of `TouchableOpacity`s, same 4 tabs and the same `SessionList` data logic, minus the swipe-between-tabs gesture. The comment at `MySessionScreen.js:254-259` records that the crash was reproduced live on a device with logcat, and that this screen was the only user of that library in either app. 5 events, all 22:19–23:42 UTC on 2026-08-07 (`LAVA LXX505`, Android 14, `com.astrowanicustomer@24.0+26`), none since — consistent with the fix. The agent missed it because it only checked whether a *PR* existed for the signature, never whether `main` had changed. |
| 2026-08-08 | `NullPointerException` on `ReactShadowNode.addChildAt` via `UIImplementation.setChildren` (Sentry `REACT-NATIVE-3`, https://astrowani.sentry.io/issues/7662521488/) | customer | skipped | Single event (2026-08-08T23:56:11Z), none since. Stack is 100% native/framework frames with zero in-app JS frames — no application line to fix. Tagged `environment: development` + `isSideLoaded: true`, i.e. a sideloaded dev build, not a confirmed production install. Breadcrumbs show a `VirtualizedList ... slow to update` warning during a burst of `/api/wallet` polling plus two overlapping socket.io polling transports — consistent with the known RN old-architecture bridge race (shadow node committed against after its view was torn down). No clean app-level workaround; touching list rendering app-wide on one unreproduced event risked a worse regression. Act only if it recurs on a non-`development` event. |
| 2026-08-10 | `RuntimeException`/`Fragment$InstantiationException` on `ScreenStackFragment` restore after Android kills and restores the process (Sentry `REACT-NATIVE-4` customer, https://astrowani.sentry.io/issues/7662591468/ — `ASTROWANI-VENDOR-2` vendor, https://astrowani.sentry.io/issues/7668770253/) | customer + vendor | fix-merged | Fixed on `main` by commit `422131a` (2026-08-13) — both apps' `MainActivity.kt` call `super.onCreate(null)`, landed outside the bug-scan PR flow. Verified 2026-08-16: customer `MainActivity.kt:30` has it (alongside the splash-screen `installSplashScreen()` work). PR #6 (`fix/screenstack-fragment-restore-crash`) was therefore redundant and conflicted with `main` on the same lines — branch deleted 2026-08-16 without merging. |
| 2026-08-11 | `IllegalStateException`/`ClassCastException: ReactHorizontalScrollView cannot be cast to ReactViewGroup` in `ReactClippingViewManager.getChildCount` (Sentry `REACT-NATIVE-5`, https://astrowani.sentry.io/issues/7665434814/) — Home carousel / marquee | customer | fix-merged | First fixed by `1c9863b` (2026-08-11), then **regressed** by `f01662e` and `b2aff4b` (both 2026-08-13), which set `removeClippedSubviews` back to `true` after shrinking `LOOP_COUNT` / the duplicated array — on the mistaken reasoning that a smaller buffer made clipping safe. It doesn't: the crash is in the clipping/reattachment path for a horizontal list nested in a vertical ScrollView driven by programmatic `scrollToOffset()`, and is independent of item count. Re-fixed and merged to `main` 2026-08-16 (merge `c258402`, from PR #10 `fix/reinstate-removeclippedsubviews-crash-fix`): `AnimatedAstrologerMarquee.js` and `Home.js` both back to `false`, each with an inline comment explaining why, to stop a third flip-flop. Buffer-size/perf work from those two commits left intact. Superseded PR #8 branch deleted. |
| 2026-08-14 | `ReferenceError: Property 'selectedLanguage' doesn't exist` (`ASTROWANI-VENDOR-3`) + `TypeError: Cannot read property 'language' of undefined` (`ASTROWANI-VENDOR-4`) — both in vendor `CustomHeader.js` | vendor | not a bug | All 3 events tagged `environment: development`, one emulator (`sdk_gphone16k_x86_64`), one user, within 45 seconds (13:39:01–13:39:46 UTC). Root-caused via `git log -S`: commit `696d74d` ("Wire up the vendor app's Hindi/English toggle for real", 13:41:25 UTC) removed `CustomHeader.js`'s local `selectedLanguage` state in favour of `React.useContext(LanguageContext)` — landing ~2 minutes *after* the last crash. This is a Metro Fast-Refresh artifact on the developer's own emulator mid-edit, not a production issue. Current `CustomHeader.js:27` uses the context correctly and `App.js` wraps `NavigationScreen` in `LanguageProvider`. No PR needed. |
| 2026-08-15 | `SMS not delivered: failed` / `SMPP session not connected` — backend `errorLogger` entry, source `enablex-sms`, job `6a807d17a0948e8855139829`, 14:52 UTC | backend | skipped | Single occurrence, one phone number. This is the delivery-verification path (`verifyEnxDelivery`) added by commit `31cc15a` working as designed — it polls EnableX ~20s after an accepted send and logs a failure if the carrier didn't deliver. `SMPP session not connected` is EnableX's carrier-side SMPP link dropping: infrastructure on their end, no in-repo code path to fix. One event for one number can't distinguish a carrier blip from a systemic gateway problem. Act only if it recurs across multiple numbers/carriers — that would point at EnableX account health, not app code. |

## Process notes

**The routine is paused as of 2026-08-16.** Do not re-enable it without fixing these three
failure modes, all of which it exhibited repeatedly:

1. **Dedup only checks this log on `main`.** A fix sitting in an unmerged PR doesn't stop the
   next run re-investigating the same Sentry issue and opening a second PR. This produced the
   #1/#2 Panchang duplicate and the #8/#10 clipping duplicate. Dedup must also check open PR
   titles and branch names. (`SKILL.md` was updated toward this in commit `7c07713`, but the
   duplicates kept happening afterward — treat it as unfixed.)
2. **It opens a PR just to update this log.** Six `docs/bug-scan-log-*` branches accumulated,
   each editing the same lines against the same base, so they conflicted with each other and
   none could be merged without hand-resolution. Four consecutive runs (08-08, 08-10, 08-13,
   08-15) noticed the pileup and each responded by adding a *seventh* edit describing it.
   Log updates should ride along with a fix PR, or be committed directly — not opened as
   standalone PRs.
3. **It arms an hourly cloud check-in per open PR, which re-arms itself indefinitely.** Dozens
   of `send_later` triggers were babysitting PRs #10/#11/#12 every 60 minutes with nothing to
   report. The last live one (`trig_01E7R2fCZEKiffiHEyGEPYKC`) was disabled 2026-08-16.

A last run fired at 2026-08-16 00:39 UTC, minutes before the routine was paused, and pushed a
`docs/bug-scan-log-2026-08-16` branch performing this same consolidation — arrived at
independently, in yet another standalone docs PR, while the real one was already committed to
`main`. Its Sentry issue links were salvaged into the rows above; the branch was deleted. It
is the cleanest single illustration of failure modes 1 and 2 together.

**Also worth noting:** several of its PRs went stale, and one row stayed "investigating" for
four runs, because the fix had landed on `main` through normal work — the ScreenStack fix
arrived with the splash-screen change, the Panchang hardening via a cherry-pick, the TabBar
crash via the database-hardening commit `da7a820`. Any future run must verify the *code on
`main`* for each signature, not just whether one of its own PRs is still open.

## Symbolication (fixed 2026-08-16)

Source-map upload is now wired for both apps: `android/app/build.gradle` applies
`@sentry/react-native`'s `sentry.gradle`, configured by `android/sentry.properties`
(org + project only — no secret, safe to commit). The auth token comes from the
`SENTRY_AUTH_TOKEN` env var at build time; without it the upload step is skipped and the
build still succeeds, so nobody's local build breaks.

**To get symbolicated stack traces you must set that variable when building a release:**

```
export SENTRY_AUTH_TOKEN=<token>   # scope: project:releases only
cd android && ./gradlew assembleRelease
```

Create the token at https://astrowani.sentry.io/settings/auth-tokens/. Until a release is
built with it set, crashes will keep resolving to `index.android.bundle` line 1 — which is
what blocked root-causing `REACT-NATIVE-2`, `-3` and `-5` from stack traces alone (all three
had to be diagnosed by reading source and git history instead).
