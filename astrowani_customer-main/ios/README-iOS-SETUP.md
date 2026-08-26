# iOS setup — customer app

Read this before the first build. Full context: `MD files/ios-port-plan-2026-08-24.md`.

---

## Firebase config — present, do not remove

`ios/AstrologyApp/GoogleService-Info.plist` **is committed** (bundle id
`com.astrowanicustomer`, Firebase project `astrowani-b1845`, its own iOS app id — distinct
from the vendor app's, which must never be reused here). It is wired into the Xcode project as
both a file reference and a Copy Bundle Resources entry, mirroring how
`android/app/google-services.json` is already committed — the file contains no secret.

It has to stay there: `AppDelegate.mm` calls `[FIRApp configure]`, so a missing config file is
a **launch crash**, not a degraded feature. The build is deliberately arranged to fail first
with `Build input file cannot be found` instead, and the CI workflow re-checks for it before
spending a macOS runner minute on the compile.

---

## Also required before push notifications work

An **APNs authentication key** must be uploaded to Firebase, or FCM will never deliver to iOS.
This is the single most commonly missed step in an iOS push setup.

1. Apple Developer portal → Certificates, Identifiers & Profiles → **Keys** → **+**
2. Enable **Apple Push Notifications service (APNs)**, download the `.p8` (you can only
   download it once — keep it safe).
3. Firebase console → Project settings → **Cloud Messaging** → iOS app → upload the `.p8`,
   with its Key ID and your Team ID.

**This step does need the Apple Developer Program membership.**

---

## Building

```bash
cd astrowani_customer-main
```

Simulator build — **needs no Apple account and no signing credentials**, so it works while
enrolment is still processing. This is the right first build:

```bash
npx eas-cli build --platform ios --profile ios-simulator
```

Internal device build (needs the Apple account):

```bash
npx eas-cli build --platform ios --profile preview
```

Store build:

```bash
npx eas-cli build --platform ios --profile production
```

### If the first `pod install` fails

The Podfile carries an ordered troubleshooting runbook in its comments. Short version: this
app links `react-native-webrtc` + `@react-native-firebase/*` + `react-native-razorpay` +
`react-native-fast-image`, which commonly disagree about framework linkage. Try plain first,
then `USE_FRAMEWORKS=static`. Do not reach for dynamic frameworks — WebRTC does not cooperate.

---

## What a simulator build CANNOT verify

The simulator has no real hardware, so these still need a physical device (i.e. they wait for
enrolment):

- microphone and camera
- actual WebRTC audio/video media
- push notification delivery
- Razorpay checkout

What it **does** verify, which is most of the risk: that the pods resolve, the app compiles,
launches, logs in, navigates, and that fonts, icons, images, layout and API calls all work.

---

## Known-outstanding items

- **App icon quality.** The generated icons are correct in format (opaque, no alpha — an
  alpha channel is itself an App Store rejection) but the 1024 marketing icon is upscaled
  from a 512 source and is visibly soft. Export a true 1024×1024 from the original design and
  replace `Images.xcassets/AppIcon.appiconset/icon-1024.png` before public launch.
- **CallKit / PushKit is deliberately absent, and that is not a gap.** It lives only in the
  vendor app, because only that app *receives* calls — this one initiates them and never has
  an incoming consultation to ring. (Phase 4 of the port plan settled this; see
  `astrowani_vendors-main/ios/README-iOS-SETUP.md` for the implementation.) Do not add
  PushKit here: `voip` in `UIBackgroundModes` without a real PushKit implementation is its
  own App Review rejection reason. Ordinary FCM push still works and still needs the APNs
  key above.
- **The vendor app is now at parity**, so this is no longer the next thing to do.
  `astrowani_vendors-main/ios/` has the same configuration — its own
  `GoogleService-Info.plist` (`com.astrowaniVendor`), the same Podfile linkage fixes, icons,
  privacy manifest and shared scheme — plus CallKit/PushKit, which only it needs. See
  `astrowani_vendors-main/ios/README-iOS-SETUP.md`. It has never been compiled on iOS,
  though, so expect a compile-fix loop there of the kind recorded in this app's `ios/Podfile`.
