# Project State

**Last updated:** 2026-07-24
**Authoritative deep docs:** `CLAUDE.md` (living architecture) + `memory/MEMORY.md` (per-feature notes).

## Monorepo (4 sub-projects)
- `astrowani-backend/` — Node/Express + Socket.io (:4500), Supabase, billing RPC.
- `astrowani_customer-main/` — React Native customer app.
- `astrowani_vendors-main/` — React Native vendor/astrologer app.
- `astrowani-admin/` — React + Vite **admin dashboard** (web only, :5173).

## Current focus
Testing fixed incoming call overlay and audio coordination on emulator.

## Current Phase
Emulator Verification & Testing

## Work Completed (This Session)
- Built persistent incoming-call overlay using `SYSTEM_ALERT_WINDOW` in `RingingCallService.kt` with Accept/Reject buttons.
- Added native bridge methods (`checkOverlayPermission`, `requestOverlayPermission`, `getPendingOverlayAction`) in `RingingServiceModule.kt` and `MainActivity.kt`.
- Created in-app `OverlayPermissionModal.js` component with Astrowani theme.
- Fixed Bug 1: Modified `RingingCallService.kt` so the **Reject** button no longer launches `MainActivity`.
- Fixed Bug 2: Unified ringtone authority to eliminate doubled ringtone when app is backgrounded in recent apps.
- Fixed temporal declaration order issue in `HomeScreen.js`.
- Fixed phone keyboard flicker/blur on `Login.js` by wrapping the screen in `KeyboardAvoidingView` and `ScrollView` with `keyboardShouldPersistTaps="handled"`.
- Verified and tested on `emulator-5554`.
- Generated updated Standalone Release APK (`Astrowani_Vendor.apk`, 110.7 MB).
- Incremented vendor app version to `versionCode 32`, `versionName "6.7"`, configured production signing (`my-upload-key.keystore`), and successfully compiled signed Google Play Store **Android App Bundle** at native build path: `astrowani_vendors-main\android\app\build\outputs\bundle\release\app-release.aab`.
- Incremented customer app version to `versionCode 50`, `versionName "24.2"`, configured production signing (`astrowani-release-key.keystore`), and successfully compiled signed Google Play Store **Android App Bundle** at native build path: `astrowani_customer-main\android\app\build\outputs\bundle\release\app-release.aab`.

## Next Recommended Action
1. User uploads vendor app `app-release.aab` (`versionCode 32`) and customer app `app-release.aab` (`versionCode 50`) to Google Play Console.

## Open Issues
- None.

## Blockers
- None.

---
**CLAUDE.md is the living architecture doc; this file is the high-level snapshot.**
