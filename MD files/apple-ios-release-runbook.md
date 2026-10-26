# Uploading an iOS build to Apple — runbook

Every step needed to get an Astrowani build from this repo into App Store Connect, in order,
with the traps that cost us five failed builds on 2026-10-23 written where they bite.

**Read this before any iOS build.** The background and the "why" live in CLAUDE.md **EK**;
this file is the procedure.

---

## 0. The one rule

> **A build that COMPILES is not a build Apple ACCEPTS.**

Build 1 compiled, signed, uploaded — and Apple refused it twenty minutes later over the SDK
version. **Always run the verification in §4 before §5.** Thirty seconds against a
twenty-minute round trip.

---

## 1. Facts you will need

| | Value |
|---|---|
| Apple Team ID | `U49M3S8V97` (account type: **Individual**, seller name "Ansh Sharma") |
| Customer bundle ID | `com.astrowanicustomer` |
| Astrologer bundle ID | `com.astrowaniVendor` |
| Customer App Store ID | `6826113999` (in `eas.json` as `submit.production.ios.ascAppId`) |
| Astrologer App Store ID | *not created yet — see §6* |
| APNs key | `49V28JX3XB`, file at `D:\secrets\AuthKey_49V28JX3XB.p8` |
| EAS account | `anshsharma825` |
| Build image | `macos-sequoia-15.6-xcode-26.0` — **pinned, see §2** |
| Reviewer login | mobile `9999999999`, OTP `123456` |

Versions never change between builds: customer **24.1**, astrologer **6.6**. Only the build
number goes up (see §3).

---

## 2. Before you build — three settings that must not drift

**`eas.json` → `build.production.ios.image` must be a PINNED version**, currently
`macos-sequoia-15.6-xcode-26.0`.

- `"latest"` is **not** a stable target. On 2026-10-23 it resolved to Xcode 27.1, and React
  Native 0.77 cannot build on it. A floating alias means the toolchain moves under a release
  that has not changed a line of app code.
- The pin cannot go DOWN either: Apple rejects anything built below the iOS 26 SDK
  (ITMS-90725). **Apple's floor and React Native's ceiling now overlap**, which is why §2.1
  exists.
- Xcode 27 images additionally require the UIKit scene life cycle. Stay on 26.x until
  React Native is upgraded.

**2.1 — `ios/Podfile` `post_install` carries two hooks in BOTH apps. Do not remove either.**

1. **fmt consteval patch.** Forces `FMT_USE_CONSTEVAL` to 0 in the fmt pod, because RN 0.77
   does not compile on Xcode 26 without it.
   - **A `-DFMT_USE_CONSTEVAL=0` compiler flag DOES NOT WORK.** RN pins fmt **11.0.2** via
     `RCT-Folly`, where the macro is set by an unguarded `#if/#elif` chain that overwrites
     anything passed with `-D`. The `#ifdef` guard arrived in fmt 12.1.0, which RN has not
     adopted.
   - The hook **RAISES** if it finds nothing to patch. That is deliberate: the documented
     failure mode of this workaround is that the pattern stops matching, the hook silently
     does nothing, and the identical error returns fifteen minutes later looking new.
   - **Delete the whole block when React Native ships fmt >= 12.1.0.**
2. **Deployment-target bump.** Raises every pod target to 15.1. CocoaPods-generated privacy
   manifests and resource bundles inherit each pod's ancient minimum (9.0/12.0/13.0); Xcode 26
   treats that as an error, at the very end of the build.

**2.2 — `TARGETED_DEVICE_FAMILY = "1"`** in both `.pbxproj` files. iPhone only. Removing it
does not "add iPad support" — it reverts to Xcode's universal default, which forces iPad
screenshots at submission and lets Apple review on an iPad, where the Home-cards touch bug
(memory `ios_home_touch_investigation`) is still unresolved.

---

## 3. Bump the build number

`CURRENT_PROJECT_VERSION` in the app's `.pbxproj` must be **higher than every number already
uploaded**, accepted or not. A refused upload still spends its number.

- Customer: currently **2**.
- Astrologer: currently **1**, never uploaded.

`MARKETING_VERSION` (24.1 / 6.6) stays put — OTA bundles are matched on it.

---

## 4. Build, then VERIFY

```bash
cd astrowani_customer-main          # or astrowani_vendors-main
eas build --platform ios --profile production --non-interactive
```

`--non-interactive` works once credentials exist on EAS. **The astrologer app's FIRST build
must be interactive** (drop the flag): it has no App ID or provisioning profile yet, so EAS
has to sign in to Apple and create them. Answer `Y`, then the 6-digit code — choose **SMS**,
and note the code arrives on the phone, not the iPad.

When it finishes, download the `.ipa` from the artifact URL and check **four things**:

```bash
unzip -o -q build.ipa "Payload/*.app/Info.plist" "Payload/*.app/embedded.mobileprovision"
```

| Field | Must be | Why |
|---|---|---|
| `DTSDKName` | `iphoneos26.x` | **ITMS-90725.** Anything lower is refused after upload. |
| `CFBundleVersion` | higher than the last upload | Apple refuses a repeat. |
| `UIDeviceFamily` | `[1]` | iPhone only (§2.2). |
| `aps-environment` (in the profile) | `production` | `development` means push works on a dev build and goes **silent** in TestFlight. |

Also sanity-check: no `ProvisionedDevices` key in the profile (its presence means an ad-hoc
build, not App Store).

> **NOT EVERY APPLE EMAIL IS A REJECTION, and the first line tells you which it is.**
> ITMS-90725 ("must be built with the iOS 26 SDK") refused the delivery outright — that
> build never existed as far as Apple is concerned. ITMS-90683 ("Missing purpose
> string") opens with **"Although delivery was successful"**: the build IS in TestFlight
> and usable, and Apple only asks you to correct it in the NEXT delivery. Read that first
> line before rebuilding anything.
>
> Seen on 24.1(2): `NSLocationAlwaysAndWhenInUseUsageDescription` was required because
> react-native-permissions' LocationWhenInUse handler REFERENCES the always-on API, even
> though the app never calls it. Apple scans statically and cannot tell a reference from
> a call — its own wording is "While your app might not use these APIs, a purpose string
> is still required." Write the string truthfully (ours says location is never used in
> the background); a string promising background tracking would contradict the App
> Privacy answers and turn a warning into a 5.1.1 problem.

---

## 5. Submit

```bash
eas submit --platform ios --latest --non-interactive
```

Needs `submit.production.ios.ascAppId` in `eas.json`, or it fails immediately with
*"Set ascAppId in the submit profile"*. The customer app has it; **the astrologer app will
need its own once §6 is done.**

Apple then processes for 5–30 minutes and emails you. Build appears under
**App Store Connect → your app → TestFlight**.

---

## 6. Creating a new App Store Connect record

**App Store Connect → Apps → ＋ → New App**

- **Platforms:** iOS only
- **Name:** must be unique across the whole App Store; editable until first submission
- **Primary Language:** English (U.K.) — there is no English (India)
- **Bundle ID:** see the trap below
- **SKU:** internal only, never shown, not editable later
- **User Access:** Full Access

> **THE BUNDLE ID TRAP.** `developer.apple.com → Identifiers` holds three entries:
>
> | Name | Identifier | |
> |---|---|---|
> | `anshsharma825astrologyapp 02c01f…` | `com.astrowanicustomer` | ✅ real, EAS-made |
> | `Astrowani` | `com.astrowanicustomer.U49M3S8V97` | ❌ team ID pasted in |
> | `Astrowani Astrologer` | `com.astrowaniVendor.U49M3S8V97` | ❌ same mistake |
>
> **The tidy-looking names are the broken ones.** Always pick by IDENTIFIER. A record tied to
> a malformed App ID will never match any build, and the error does not point here.
>
> **The astrologer app has no usable `com.astrowaniVendor` App ID yet.** EAS registers it
> during that app's first build, so **build first, then create the record.**

---

## 7. Then the listing (not needed to upload a build)

Category **Lifestyle**, age rating **18+**, privacy policy + support URLs, App Privacy
answers, **Tracking: No** (no ad SDKs on iOS), price Free, and **untick China for the
astrologer app** — it uses CallKit, which Apple does not permit on that storefront.

**App Review Information:** sign-in required **Yes**, demo `9999999999` / `123456`, and the
review notes already written in CLAUDE.md **CN** (a different one per app).

Screenshots: iPhone **6.9"**, 1320×2868. Live consultations, experts, chat, shop — **not**
reports, horoscopes, gifts or free services (all hidden on iOS, and off-positioning).

**Re-read the reviewer accounts against the live database on the day you submit.** They have
been wrong three times: the customer row has been renamed by testing, and the astrologer row
was found `is_suspended = true` on 2026-10-23.

---

## 8. Quick failure lookup

| Symptom | Cause | Fix |
|---|---|---|
| `iTunes service key is empty` at Apple sign-in (before any 2FA prompt) | outdated eas-cli | `npm install -g eas-cli` |
| `AppTransaction has no member 'appTransactionID'` | SDK older than iOS 18.4 | image pin too low |
| `IPHONEOS_DEPLOYMENT_TARGET ... 9.0 ... supported is 15.0 to …` | pod resource bundles | §2.1 hook 2 |
| `call to consteval function 'fmt::…'` | Xcode 26 + fmt 11.0.2 | §2.1 hook 1 |
| **ITMS-90725** email after a successful upload | built below the iOS 26 SDK | §2 pin, then §4 |
| `Set ascAppId in the submit profile` | missing `submit.production.ios.ascAppId` | §5 |
| `no matching bundle ID` | record tied to a malformed App ID | §6 trap |
| **ITMS-90683** missing purpose string (a WARNING — delivery still succeeded) | an SDK REFERENCES a sensitive API the app never calls | add the key to Info.plist, ship it in the next build |
