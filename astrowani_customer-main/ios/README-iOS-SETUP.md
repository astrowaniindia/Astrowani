# iOS setup — customer app

Read this before the first build. Full context: `MD files/ios-port-plan-2026-08-24.md`.

---

## ⚠️ ONE FILE IS MISSING AND THE BUILD WILL FAIL WITHOUT IT

`ios/AstrologyApp/GoogleService-Info.plist` is **not in the repo** and must be added.

It is already wired into the Xcode project (file reference + Copy Bundle Resources), so you
do **not** need Xcode or a Mac to hook it up — just drop the file at that exact path and
commit it.

Until it exists, the build fails with `Build input file cannot be found:
.../AstrologyApp/GoogleService-Info.plist`. That is deliberate and preferable to the
alternative: `AppDelegate.mm` calls `[FIRApp configure]`, which **crashes the app at launch**
if the config file is absent. A clear build error beats a launch crash.

### How to get it (~3 minutes, free, no Apple Developer account needed)

1. Firebase console → the existing Astrowani project → **Add app** → **iOS**.
2. iOS bundle ID: **`com.astrowanicustomer`** — must match exactly.
3. Download `GoogleService-Info.plist`.
4. Save it to `astrowani_customer-main/ios/AstrologyApp/GoogleService-Info.plist`.
5. Commit it. This mirrors how `android/app/google-services.json` is already committed —
   the file contains no secret.

> Registering the iOS app in Firebase needs **no Apple Developer membership**. Only *delivering*
> a push does (see the APNs key step below). So this is not blocked on enrolment.

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
- **CallKit / PushKit is not implemented.** Incoming calls will not ring when the app is
  backgrounded or killed. This is Phase 4 in the plan and must land before store submission.
- **The vendor app has only its `Info.plist` done.** Everything else here still needs
  repeating for `astrowani_vendors-main`, deliberately sequenced after this app builds.
