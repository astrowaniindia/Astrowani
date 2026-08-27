# iOS setup — vendor (astrologer) app

Read this before the first build. Full context: `MD files/ios-port-plan-2026-08-24.md`.

---

## Firebase config — present, do not remove

`ios/AstroIndia_Astrologers/GoogleService-Info.plist` **is committed** (bundle id
`com.astrowaniVendor`, Firebase project `astrowani-b1845`, its own iOS app id — distinct from
the customer app's, which must never be reused here). It is wired into the Xcode project as
both a file reference and a Copy Bundle Resources entry.

It has to stay there: `AppDelegate.mm` calls `[FIRApp configure]`, so a missing config file is
a **launch crash**, not a degraded feature. The build is deliberately arranged to fail first
with `Build input file cannot be found` instead, and the CI workflow re-checks for it before
spending a macOS runner minute on the compile.

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

## CallKit / PushKit — incoming calls that ring on a killed app

This app implements PushKit + CallKit (iOS port Phase 4). It is the only way an incoming
consultation can ring an iOS app that is not running — a data-only FCM push cannot do it.
The customer app has none of this and needs none: it initiates calls, it never receives them.

### Backend env vars (VPS process env, next to the other secrets)

| Var | Notes |
|---|---|
| `APNS_KEY_ID` | Key ID of the APNs auth key (10 chars). |
| `APNS_TEAM_ID` | Apple Developer Team ID (10 chars). |
| `APNS_PRIVATE_KEY` | Contents of the `.p8`. Escaped `\n` newlines are accepted. |
| `APNS_PRIVATE_KEY_PATH` | Alternative to the above — a path to the `.p8`. |
| `APNS_VOIP_TOPIC` | Defaults to `com.astrowaniVendor.voip`. **Note the `.voip` suffix** — the plain bundle id yields a `TopicDisallowed` error that reads like a credential problem. |
| `APNS_PRODUCTION` | `true` for TestFlight/App Store builds. **Defaults to `false` (sandbox).** |

> **The `APNS_PRODUCTION` flag is the single most common cause of "VoIP push silently does
> nothing".** A development-signed build gets its PushKit token from the APNs *sandbox*; a
> TestFlight/App Store build gets it from *production*. Sending a token to the wrong host
> fails with `BadDeviceToken`. The backend logs that and clears the stored token, so if
> rings stop working right after moving to TestFlight, this flag is why.

The **same `.p8` key** works for APNs push and VoIP push, and is per Apple *team*, not per
app — so one key covers both apps. It does require the Apple Developer membership.

### Database — APPLIED 2026-08-27

`astrowani-backend/sql/astrologer_voip_token.sql` has been run against production.
`astrologers.voip_token` and `astrologers.voip_platform` both exist (confirmed via
`information_schema.columns`). The PushKit token is **not** the FCM token, which is why it
needs its own column.

So this is no longer a prerequisite. Kept here because the degradation behaviour is still
worth knowing when debugging: if the columns are ever missing, `src/voipPush.js` becomes a
logged no-op and `POST /api/vendor/voip-token` answers 503 with a message naming that file —
the ring silently stops working while everything else looks healthy. That 503 in the backend
log is the tell. The file is idempotent, so re-running it is safe.

### How it fits together

```
customer taps Call
  -> POST /api/call/initiate
       -> socket emit  (reaches a vendor with HomeScreen mounted)
       -> FCM push     (Android, and iOS while alive)
       -> VoIP push    (iOS, the ONLY thing that wakes a killed app)
            -> AppDelegate.mm pushRegistry:didReceiveIncomingPushWithPayload:
                 reports the call to CallKit IMMEDIATELY, in native code
            -> CallKit rings full-screen
            -> answer  -> src/utils/callKeep.js -> acceptRequest() -> AudioCall/VideoCall
            -> decline -> rejectRequest()
```

### Rules that must not be broken

1. **Every VoIP push must report a call to CallKit, immediately.** iOS terminates the app
   otherwise, and repeat offences revoke its VoIP privilege. That is why the report happens
   in `AppDelegate.mm` and not in JS — on a killed app the RN bridge does not exist yet.
2. **Never send a VoIP push for anything that is not a real incoming call** — notably not
   for cancellations. There is a comment on `cancel_call` in the backend's `index.js`
   explaining this; a cancel arrives over the socket instead, because a VoIP push has by
   definition already woken the app.
3. **`voip` in `UIBackgroundModes` stays only while PushKit is genuinely implemented.** An
   unused `voip` background mode is its own App Review rejection reason.
4. **CallKeep must stay off Android.** See `react-native.config.js` — its Android
   ConnectionService would merge `CALL_PHONE` / `MANAGE_OWN_CALLS` into a live Play Store
   listing. Verified excluded by inspecting the merged manifest.

## Building

```bash
cd astrowani_vendors-main
```

### Unsigned .ipa on a real iPhone — the route with no Apple account at all

This is the same route the customer app uses, and it is the one to reach for first. GitHub
Actions → **iOS unsigned IPA** → *Run workflow* → **app: `vendor`**. It builds on a macOS
runner with code signing switched off and uploads
`Astrowani-Astrologer-unsigned.ipa` as an artifact, which Sideloadly/AltStore on Windows
re-signs with a free Apple ID and installs over USB.

Read `.github/workflows/ios-unsigned-ipa.yml` before running it — the header states exactly
what such a build can and cannot prove. The short version for **this** app is unusually
important: a free-signed build has no `aps-environment` entitlement, so **FCM push, the
killed-app incoming-call ring, and the whole CallKit/PushKit path below are untestable this
way**. Since that path is this app's core loop, an unsigned .ipa proves the app *compiles,
launches and runs*, not that it rings.

If the build fails, the job uploads the full `xcodebuild.log` as a separate artifact — read
that rather than the 60-line console tail, which names the failing target but rarely the cause.

Cost: macOS runners bill at 10× on private repos, so budget roughly a dozen runs a month.

### EAS builds (need an Expo account; the device profiles need the Apple account)

Simulator build — **no Apple account, no signing credentials**:

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
- **`otpless-react-native` is excluded from iOS autolinking** in `react-native.config.js`.
  It is dead code here — `src/utils/startOtpVerification.js` is its only importer and nothing
  imports that — and linking it would make the target carry a Swift pod plus the external
  `OtplessSDK/Core` pod for no functionality. **Android is untouched**, so the shipping Play
  Store app links exactly what it links today. Removing it from `package.json` outright is the
  real fix but is an Android-affecting change, so it is left as a separate decision.
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

### Testing CallKit without a VoIP push

A VoIP push cannot be faked — `aps-environment` needs the paid membership, so a simulator or a
free-signed `.ipa` never receives one. **CallKit itself is not entitlement-gated**, though, so
`simulateIncomingCallKitCall()` in `src/utils/callKeep.js` rings it directly, using the same
payload the backend sends and the same CallKit configuration `AppDelegate.mm` passes to
`reportNewIncomingCall`. It is `__DEV__`-only and exposed on `global`, so from the JS debugger
console once the app has launched:

```js
__astrowaniSimulateCall()                                  // audio, synthetic ids
__astrowaniSimulateCall({ callType: 'video' })
__astrowaniSimulateCall({ roomId: '<real>', sessionId: '<real>' })   // real accept
```

Answering or declining runs the real `onAnswerCall` / `onEndCall` handlers, so this covers the
accept → `acceptRequest` → navigation chain, the decline → `rejectRequest` branch, the
answered-vs-hangup distinction, and the CallKit teardown. Pass ids from a genuinely pending
`call_requests` row to exercise the accept against the backend for real; with the synthetic
defaults you will instead watch the "customer already cancelled" teardown, which is worth
seeing too.

**It does not prove the app rings.** Push delivery, waking from KILLED, and the native
`reportNewIncomingCall` are the other half, and they still need the paid membership and a real
device. Do not read a green run here as the incoming-call path being verified.

What it **does** verify — most of the risk: pods resolve, the app compiles, launches, logs in,
navigates, and fonts, icons, images and API calls work.

---

## Known-outstanding items

- ~~**App icon.**~~ **FIXED 2026-08-27.** The iOS set was generated from the wrong source:
  root `vendor_play_store_launcher_icon.png`, which is the legacy navy-and-gold *AstroIndia*
  art with an "India" wordmark cropped off. That is the CUSTOMER app's palette. This app's
  Android launcher icon moved to the brown Astrowani branding
  (`#38261D` background, tan star) and iOS never followed, so the same app shipped two
  different-looking icons per platform and the two apps looked like each other instead of
  themselves.
  Regenerated from `src/assets/images/logo1.png` — the same artwork Android ships, at
  1254×1254. Framing was checked against the Android icon before committing to it (art
  occupies 88% of the canvas vs Android's 89%; background `#39271D` vs `#37261C`), so iOS and
  Android now render as the same icon.
  This also closed the old sharpness complaint: every size including the 1024 marketing icon
  is now a DOWNSCALE from 1254, not an upscale from 512. All nine files verified square, RGB
  and alpha-free — an alpha channel in an iOS app icon is an outright App Store rejection.
  **The root `vendor_play_store_launcher_icon.png` is stale art. Do not regenerate from it.**
- **CallKit / PushKit IS implemented** (see the section above) but has **never been exercised
  against Apple** — it needs the Apple Developer membership for the `.p8`, and a physical
  device. Nothing in it has been compiled. Treat the whole path as unverified until a real
  two-device test: kill the vendor app, have a customer call, and confirm the phone rings
  full-screen and answering lands in the consultation. **Update 2026-08-27: it now COMPILES**
  — EAS build `ebab0359` (ios-simulator) went green on the first attempt, so the native code
  links. Delivery is still unverified. `simulateIncomingCallKitCall()` covers everything
  after the push; see the section above.
- **CallKit's system mute/hold controls are not bridged to WebRTC.** Muting from the iOS call
  UI logs a line and does nothing to the audio track; the in-app controls remain the source of
  truth. Worth closing once the basic path is proven on a device.
