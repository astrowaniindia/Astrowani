# App Store rejection audit — customer + astrologer apps

**Date:** 2026-10-19 · **Branch:** `feat/ios-launch-prep` · Audited against Apple's live
[App Store Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)

Verdict: **not ready to submit as-is.** One finding is a live, reachable 3.1.1 violation
that would almost certainly be rejected, and three more are the kind reviewers routinely
catch. Everything else is in genuinely good shape — the iOS gating work already done
(`DIGITAL_PURCHASES_ENABLED`, `FREE_BOT_CHAT_ENABLED`, the privacy manifests, the
permission strings) covers most of what normally sinks a first submission.

---

## BLOCKER 1 — Shagun Dakshina sells gifts on iPhone, outside In-App Purchase (3.1.1)

**This is the one to fix before submitting.**

`SHAGUN_RECHARGE_ENABLED = true` in `astrowani_customer-main/src/utils/featureFlags.js`
has **no platform check** — unlike every other digital purchase in the app. After a free
11-minute call, `VoiceCallScreen.tsx:407` raises
`src/components/ShagunRechargePrompt.js`, which:

- renders tiles **from the live gift catalogue** (`/api/gifts`) — picture, name, price;
- charges ₹11–₹5100 through **`RazorpayCheckout.open()`** (line 367);
- returns **nothing to the customer** ("IT IS NOT A RECHARGE, despite the file name" —
  the file's own header);
- splits the money **50/50 with the platform** (`DAKSHINA_VENDOR_SHARE`).

So on iOS this is a paid digital good, with a platform cut, bought outside IAP. It
contradicts the app's own documented rule: `payments.js` says gifts are digital content
that Apple requires IAP for, which is exactly why gifts are hidden on iOS — and this
sheet draws the same gift catalogue through a different door.

**It is reachable right now.** Checked production `app_settings` today:
`free_call_offer.enabled = true`, `dakshina_config.enabled = true`, 8 astrologers in the
free-intro allowlist. And the pre-login campaign screen (`CampaignGiftReveal`, the
"YOU WIN · 11 minute free call" gift box) leads straight into that flow — i.e. a
reviewer who follows the app's own primary onboarding path lands on it.

**Fix:** `export const SHAGUN_RECHARGE_ENABLED = Platform.OS !== 'ios';`
`DAKSHINA_PROMPT_ENABLED` is already `false`, and `VoiceCallScreen`'s chain falls
through, so the call just ends on iPhone. One line, OTA-able.

---

## HIGH 2 — Three share paths hand an iPhone a Google Play link (2.3.10)

Guideline 2.3.10 forbids naming or linking another mobile platform. `fc0e5d74` closed
this for the rating card, but three share paths still use `PLAY_STORE_URL` with no iOS
branch:

| File | Line |
|---|---|
| `src/components/ReferralPromptHost.js` | 76–77 |
| `src/screens/drawerScreens/ReferAndEarnScreen.js` | 64 |
| `src/routes/CustomDrawerContent.js` | 88 (drawer → "Share app") |

`ReferralPromptHost` is mounted at the navigation root (`Navigation.js:803`), so it
raises itself. "Refer & Earn" and "Share app" are both one tap from the drawer — a
reviewer poking around the menu will see a `play.google.com` URL in the share sheet.

Note `src/utils/shareAstrologerProfile.js` already does this correctly (labelled
Android/iPhone lines, iOS line added only once `APP_STORE_URL` exists) — that is the
pattern to copy. Simplest fix for the three above: drop the URL on iOS until the App
Store listing exists, or route them through the same builder.

---

## HIGH 3 — No way to report or block inside a 1:1 consultation (1.2)

Guideline 1.2 requires, for apps where users contribute content: a filter, a report
mechanism, **and the ability to block abusive users**.

What exists:

- Live-stream comments: filter + report + block, both sides. ✅
- Astrologer profile: a flag icon → report modal (`AstrologerInfo.js:877`). ✅
- Astrologer side of chat: `ReportCustomerSheet` wired into `VendorChatSession.js:846`. ✅

What does **not**:

- **The customer has no report and no block inside a chat session**
  (`ChatSessionScreen.js` has neither), and **no block anywhere** for an astrologer.
  Since 2026-10-12 an astrologer can send **photographs** into that chat (`DX` in
  CLAUDE.md) — unmoderated images from one user to another, with the recipient having no
  in-context way to report them and no way to block the sender.

The asymmetry is what stands out: the astrologer can report and block the customer
mid-chat; the customer cannot. Reviewers testing a chat app look for this specifically.
Minimum fix: a ⋮ / flag in the chat header that reuses the existing `/api/reports` call,
plus a block that writes `customer_blocks` in the other direction.

---

## MEDIUM 4 — 2.1: the reviewer cannot complete a consultation on their own

`38a8ce3` set the store-reviewer astrologer to `hidden_from_customers = true`. That was
right for Play, but it means a reviewer logged into the **customer** app as 9999999999
can only call a **real** astrologer — who may not answer. Apple's single largest
rejection bucket is 2.1 App Completeness, and "I tried to start a consultation and
nothing happened" lands squarely in it.

Have a known astrologer online and instructed to accept during the review window, and
say so in the review notes with a time window and timezone. Cheaper than an appeal.

---

## MEDIUM 5 — Privacy manifest is missing two data types it collects (2.3 / 5.1)

`astrowani_customer-main/ios/AstrologyApp/PrivacyInfo.xcprivacy` is otherwise excellent
(10 data types, 4 required-reason API categories, tracking false). Two gaps, and Apple
cross-checks the manifest against the App Privacy answers:

- **`NSPrivacyCollectedDataTypeEmailAddress`** — `EmailOtpScreen` is a registered route
  (`Navigation.js:246`) and collects an email.
- **Audio** — `VoiceNotesScreen` exists on the customer side; if a customer ever records
  (rather than only plays back) voice notes, `NSPrivacyCollectedDataTypeAudioData` is
  needed. The vendor manifest already declares it.

The vendor manifest looked complete, including `NSPrivacyTracking` /
`NSPrivacyTrackingDomains`.

---

## LOW — worth knowing, unlikely to be the rejection reason

1. **The pre-login gift box promises a reward nothing has agreed to yet**
   (`CampaignGiftReveal.js`). It says "YOU WIN!" and *"aapne jeet li hai 11 minute ki
   free call"* with **no eligibility check at all** — not one call to
   `/api/free-call/offer`. After signup, four things can still refuse it:
   `free_call_offer.enabled`, the `mode: 'selected'` allowlist, `audience_rules`, and
   `offer_guard`. Told you won → signed up → didn't get it is a real 1.1.6 / 5.6 look,
   and it is the first screen a reviewer sees, before login.

   **The fix is the entitlement, not the wording** (owner, 2026-10-19: if we say "you
   win", they get the reward). `free_call_invites` already means exactly that — an
   invite bypasses `offer.enabled` (`:1329`, `:2108`, `:2152`), `audience_rules`
   (`:1239`, `:1345`, `:2168`), the brand-new-customer rule (`:1248`, `:1357`, `:2174`)
   and the WELCOME offer-guard claim (`:1046`). So a campaign signup should write an
   invite row and the promise becomes true, with the screen untouched. Two notes: write
   it off the server-side `acquisition_source` (`ad_`/`qr_`) rather than the client's
   own `queueFreeCallFromCampaign()` flag, or the app is granting itself the offer (CV's
   rule); and keep the one refusal an invite does NOT bypass (`:1045`, FREE_CALL claimed
   by an earlier deleted account on the same number — the CY exploit). An empty instant
   pool is not a broken promise: `loadOffer` falls back to `scheduled`, so the call is
   booked rather than instant.

   Earlier drafts of this item argued the copy was misleading because everyone sees it,
   and floated 5.3.2 (sweepstakes need official rules). Both were wrong: there is no
   chance element, so it is not a sweepstakes, and promotional excitement over a
   genuinely delivered reward is not something reviewers hunt for.
2. **The Wani Shop tab is a WebView of `shop.astrowani.com`** (`StoreWebView.js`,
   `Navigation.js:1226`). Content checked: gemstones, vastu items, pujas — physical goods
   and real-world services, so 3.1.3(e) permits Razorpay and Apple takes nothing.
   Host-locked to `shop.astrowani.com` + `razorpay.com`, which is the right call.
   Residual 4.2 "repackaged website" exposure is small because it is one tab in a deeply
   native app, but if a reviewer pushes back this is where.
3. **A push can deep-link to any screen** — `PushNotification.js:249` does
   `navigationRef.navigate(data.screen, params)` unvalidated, so a server-sent
   notification could drop an iPhone onto `CoinStore` (StoreKit, zero products configured
   → 2.1(b)) or `AstroReportsScreen`. `CoinStore` has a belt-and-braces platform guard
   but it is inverted for this case (it guards *non*-iOS). A reviewer won't receive such
   a push; worth an allowlist anyway.
4. **Committed `__DEV__` bypass with a "REMOVE BEFORE COMMIT" note** —
   `src/utils/appPrompts.js:50`, `fetchUpdateStatus`. Debug-only, so no store impact, but
   it is still sitting in `main`.
5. **Login wall before any browsing.** Defensible under 5.1.1(v) given the wallet and
   consultations, and a demo account is supplied — just be aware reviewers sometimes ask
   why browsing astrologers needs an account.
6. **OTA (hot-updater) on iOS.** Allowed for interpreted JS that doesn't change the app's
   purpose. The rule to keep: never ship a *feature* by OTA that review never saw.
7. **Vendor `AppUpdatePrompt.js:164`** hardcodes "Opening Play Store…". Unreachable on
   iOS (the backend returns no `storeUrl` for iOS — `appPromptRoutes.js:151`), but it is
   a literal other-platform string in the binary.
8. **4.3 (Spam) — astrology is a saturated category** and Apple names fortune telling as
   one it won't accept without "a meaningfully different experience." The owner's
   lifestyle positioning (live human consultations, not predictions) is the right answer;
   keep screenshots and description on live consultations, experts and the shop.

---

## What's already right (don't undo any of it)

- **The IAP boundary is correctly drawn and correctly documented.** `payments.js` keeps
  consultations (3.1.3(d)) and the shop (3.1.3(e)) on the rupee wallet, and routes the
  three digital paths to coins. That is the right architecture and it protects the
  largest exempt revenue line. Blocker 1 is a leak in it, not a flaw in it.
- Reports, gifts, ₹1 free services, the coin store, the gamification "coming soon" demos
  and the locked checkout option are all hidden on iOS (2.1 placeholder content).
- The free Gemini chat is off on iOS until it is labelled as AI with consent (5.1.2(i)).
- Call recording never starts on iOS, so no customer audio reaches Gemini there.
- Custom review prompts: the backend refuses iOS (`appPromptRoutes.js:237`) and
  `fetchReviewConfig` refuses again client-side (5.6.1).
- In-app account deletion in **both** apps (`Settings.js`), plus a public
  `/delete-account/` URL (5.1.1(v)).
- Permission strings in both Info.plists state what and why; ATS strict; no ad SDKs on
  iOS (`react-native.config.js` sets `ios: null` for fbsdk and Firebase Analytics), so
  "Tracking: No" is truthful and no ATT prompt is needed.
- `voip` background mode is declared **only** in the vendor app, and only because PushKit
  + CallKit are genuinely implemented in native code (`AppDelegate.mm:111` reports to
  CallKit immediately). Declaring it unused is itself a rejection.
- `ITSAppUsesNonExemptEncryption = false` in both, so no per-upload export questionnaire.

---

## Pre-submission checklist

- [ ] Gate `SHAGUN_RECHARGE_ENABLED` off on iOS — **blocker**
- [ ] Strip `PLAY_STORE_URL` from the three iOS share paths
- [ ] Add report + block inside the customer's chat session
- [ ] Add `EmailAddress` (and audio, if the customer records) to the customer privacy manifest
- [ ] Staff a live astrologer for the review window; state the window in review notes
- [ ] Make the campaign reveal's promise true: write a `free_call_invites` row for a
      campaign signup (keep the wording)
- [ ] Remove the `__DEV__` bypass in `appPrompts.js`
- [ ] Re-verify the live `app_settings` state the reviewer will actually meet
