# iOS setup — vendor (astrologer) app

Read this before the first build. Full context: `MD files/ios-port-plan-2026-08-24.md`.

---

## ⚠️ ONE FILE IS MISSING AND THE BUILD WILL FAIL WITHOUT IT

`ios/AstroIndia_Astrologers/GoogleService-Info.plist` is **not in the repo** and must be added.

It is already wired into the Xcode project (file reference + Copy Bundle Resources), so you do
**not** need Xcode or a Mac to hook it up — just drop the file at that exact path and commit it.

Until it exists the build fails with `Build input file cannot be found`. That is deliberate and
preferable to the alternative: `AppDelegate.mm` calls `[FIRApp configure]`, which **crashes the
app at launch** if the config file is absent. A clear build error beats a launch crash.

### How to get it (~3 minutes, free, no Apple Developer account needed)

1. Firebase console → the existing Astrowani project → **Add app** → **iOS**.
2. iOS bundle ID: **`com.astrowaniVendor`** — must match exactly, including the capital `V`.
3. Download `GoogleService-Info.plist`.
4. Save it to `astrowani_vendors-main/ios/AstroIndia_Astrologers/GoogleService-Info.plist`.
5. Commit it, same as `android/app/google-services.json` already is. It contains no secret.

> This is a **separate Firebase iOS app** from the customer one (`com.astrowanicustomer`).
> Two bundle IDs, two `GoogleService-Info.plist` files. Do not reuse one for both.

---

## Also required before push notifications work

An **APNs authentication key** must be uploaded to Firebase or FCM will never deliver to iOS.
It is the single most commonly missed step in an iOS push setup, and it matters more for this
app than for the customer one: this is where incoming consultation requests arrive, and
CLAUDE.md already records `missed: 48` vs `rejected: 7` as the dominant accept-rate problem on
Android.

1. Apple Developer portal → Certificates, Identifiers & Profiles → **Keys** → **+**
2. Enable **Apple Push Notifications service (APNs)**, download the `.p8` (downloadable once).
3. Firebase console → Project settings → **Cloud Messaging** → the iOS app → upload the `.p8`
   with its Key ID and your Team ID.

The same `.p8` key works for both apps — it is per Apple team, not per app.

**This step does need the Apple Developer Program membership.**

---

## Building

```bash
cd astrowani_vendors-main
```

Simulator build — **no Apple account, no signing credentials** — the right first build:

```bash
npx eas-cli build --platform ios --profile ios-simulator
```

Internal device build (needs the Apple account):

```bash
npx eas-cli build --platform ios --profile preview
```

### If the first `pod install` fails

The Podfile carries an ordered runbook in its comments. Short version: try plain first, then
`USE_FRAMEWORKS=static`. `react-native-image-crop-picker` is the most likely straggler under
static frameworks — give that one `:modular_headers => true` rather than changing global
linkage. Never use dynamic frameworks; `react-native-webrtc` does not cooperate.

All of this app's `patches/` are Android-only (verified: zero `ios/` references) and the
`postinstall` patch script skips cleanly, so patches are not a factor in an iOS build failure.

---

## Differences from the customer app worth knowing

- **No `react-native-permissions`.** This app does not have that package, so its Podfile has no
  `setup_permissions!` block — adding one would abort `pod install` with a file-not-found. iOS
  prompts for mic/camera automatically on first `getUserMedia`, and the denial path is now
  handled explicitly in `EnxScreenVoice` / `EnxScreenVideo` / `GoLiveScreen`.
- **No location.** Verified — there is no `Geolocation`/`getCurrentPosition` usage in `src/`, so
  `Info.plist` deliberately carries no `NSLocationWhenInUseUsageDescription` and the privacy
  manifest declares no location collection. Do not add either "just in case"; an unused
  permission string invites App Review questions.
- **This app collects bank/payout details and records audio** (voice notes). Both are declared
  in `PrivacyInfo.xcprivacy` and must be reflected in the App Store Connect privacy answers.
- **No URL scheme / deep links.** Unlike the customer app there is no Razorpay return, so
  `AppDelegate.mm` has no `RCTLinkingManager` hooks. `otpless-react-native` is in
  `package.json` but `startOtpVerification.js` is imported by nothing — it is dead code and
  needs no iOS setup. Candidate for removal.
- **Local notifications use `@notifee/react-native`**, not `react-native-push-notification`.
  Notifee needs no AppDelegate code for basic display.

---

## What a simulator build CANNOT verify

Needs a physical device (so, after enrolment): microphone, camera, real WebRTC media, voice-note
recording, push delivery, and going live.

What it **does** verify — most of the risk: pods resolve, the app compiles, launches, logs in,
navigates, and fonts, icons, images and API calls work.

---

## Known-outstanding items

- **App icon says "India".** The source art
  (`vendor_play_store_launcher_icon.png`) has an orange "India" wordmark under the star — a
  legacy artifact of the old `AstroIndia_Astrologers` project name. The generated iOS icons
  **crop it out** (crop stops at the star's lowest pixel, y=361) because the product is now
  "Astrowani Astrologer" and shipping a stale brand name in the icon is worse than shipping
  none. If you want it kept, say so and it goes back.
- **The two apps' icons are now nearly identical** (navy + gold star), since both derive from
  the same template art. An astrologer with both installed would struggle to tell them apart.
  Worth a distinct vendor icon at some point.
- **Icon sharpness.** Source art is only 512×512, so the 1024 marketing icon is upscaled and
  visibly soft. Fine at real icon sizes; the App Store product page shows it large. Export a
  true 1024×1024 before public launch.
- **CallKit / PushKit is not implemented.** Incoming consultation requests will not ring when
  the app is backgrounded or killed. Phase 4 in the plan; must land before store submission.
