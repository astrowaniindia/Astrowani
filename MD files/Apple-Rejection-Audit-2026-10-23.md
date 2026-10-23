# App Store readiness — re-verification against the live code and live database

**Date:** 2026-10-23 · Re-checks every finding in
[`Apple-Rejection-Audit-2026-10-19.md`](Apple-Rejection-Audit-2026-10-19.md) against `main`
as it stands today, plus the production `app_settings` a reviewer would actually meet.

**Verdict: nearly there. ONE code-level finding and ONE database finding still stand, and
both are the kind that get caught.** Everything else from the 19th has been fixed, and two
of the fixes were verified in the live DB rather than in the diff.

---

## STILL OPEN

### 1. ~~The customer cannot report or block inside a chat (1.2)~~ — BUILT 2026-10-23

**RESOLVED the same day this audit was written.** A ⋮ in the chat header opens
`ChatModerationSheet`: six reasons, an optional note, report-and-block, or block alone.
Blocking writes the new `astrologer_blocks` table through `POST /api/astrologers/block`,
and the three contact paths in `index.js` now ask `isContactBlocked`, which checks BOTH
directions — so a customer-side block actually stops calls and chats rather than being
recorded and ignored. Verified 26/26 over real HTTP against the live database, and the
suite was confirmed to FAIL when the both-directions check was removed. The text below is
what was found before the fix, kept for the record.

Unchanged since the 19th, and verified again today: `ChatSessionScreen.js` imports no
report and no block component, and **`customer_blocks` has no customer-side writer
anywhere in the customer app** (`grep -rln "customer_blocks|blockAstrologer|/api/blocks"
src/` returns nothing).

Guideline 1.2 asks for three things where users contribute content — a filter, a way to
report, and **a way to block abusive users**. What exists:

| Surface | Report | Block |
|---|---|---|
| Live-stream comments | yes | yes (`LiveReportSheet`, `onBlock`) |
| Astrologer profile | yes (flag → modal) | **no** |
| Astrologer's side of a chat | yes (`ReportCustomerSheet`) | yes |
| **Customer's side of a chat** | **no** | **no** |

**The asymmetry is the problem.** The astrologer can report and block the customer
mid-chat; the customer can do neither — and since 2026-10-12 the astrologer can send
**photographs** into that chat (CLAUDE.md DX). That is unmoderated image content from one
user to another, with the recipient having no in-context way to report it and no way to
block the sender at all. A reviewer testing a 1:1 chat app looks for exactly this.

Minimum fix: a ⋮ or flag in the chat header reusing the existing `/api/reports` call, plus
a block writing `customer_blocks` in the other direction.

### 2. ~~The reviewer astrologer account is SUSPENDED (2.1)~~ — CLEARED 2026-10-23

`astrologers` row `1f70210e-6234-4f49-a764-13e851968e1e` ("Play Store Reviewer"):
`approval_status = approved`, `hidden_from_customers = true` — both intended — but
**`is_suspended = true`**. A reviewer signing into the **astrologer app** with
9999999999 / 123456 hits the suspended path instead of the dashboard. That fails the
astrologer app on its own, on the most basic check a reviewer makes.

**Cleared 2026-10-23**: `is_suspended = false`. Checked first that this does NOT put the
account back in front of customers — it is not among the 10 ids in
`free_intro_call_visibility.allowedAstrologerIds` (mode `selected`), so it cannot enter the
instant free-call pool, and `hidden_from_customers` is still `true`, so it stays out of every
listing. The other 11 suspended astrologers were not touched.

### 3. 2.1 completeness — can the reviewer actually complete a consultation?

Measured today. The free-intro instant pool (opted in AND on the `mode: 'selected'`
allowlist) is three astrologers: **Astro Shalu** (offline), **Play Store Reviewer**
(offline, and suspended per above), **Sachin Tiwari** (online). So at this moment exactly
one person could answer.

`free_call_offer.enabledPlatforms.ios = true`, so an iPhone reviewer WILL be offered the
free call. If nobody answers, that reads as "I tried to start a consultation and nothing
happened" — Apple's single largest rejection bucket. **Staff a known astrologer for the
review window and state the window, with timezone, in the review notes.**

### 4. ~~The free-call offer is branded "Play Store Reviewer (QA test)"~~ — RENAMED, but see below

`free_call_offer.astrologerName` is literally **"Play Store Reviewer (QA test)"**, with
`assignedAstrologerId` pointing at the suspended reviewer account. In `instant` mode that
name is not the primary surface — but `instantPoolAstrologerIds` is empty, and per
CLAUDE.md **DV** an empty effective pool degrades instant → `scheduled`, which is the mode
that shows exactly this name and photo. A customer, or a reviewer, being told
"Play Store Reviewer (QA test)" will call them is a bad look that costs nothing to fix.

**Renamed 2026-10-23** to **"Our Expert Astrologer"**, which matches the body text the
screen already shows ("Our astrologer will call you directly").

> **STILL OPEN, and it is the half that actually matters: `assignedAstrologerId` is
> UNCHANGED and still points at the reviewer account** (`1f70210e-…`), with
> `assignmentMode: "single"`. While `mode` is `instant` nothing routes through it. But an
> empty effective instant pool degrades instant → `scheduled` (CLAUDE.md **DV**), and in
> that mode a real customer's booked free call is assigned to an account that is hidden
> from customers and that nobody monitors. **Renaming the label did not fix that** — it
> only stopped the label being embarrassing. Point it at a real astrologer who has agreed
> to take booked free calls; that is a product decision, not a cleanup.

### 5. Low, worth doing, won't be the rejection reason

- `src/utils/appPrompts.js:51` still has the committed `if (__DEV__) return null;` under a
  "REMOVE BEFORE COMMIT" comment. Dev-only, no store impact.
- `PushNotification.js:249` still does `navigationRef.navigate(data.screen, params)`
  unvalidated — a server-sent push could drop an iPhone onto `CoinStore` (StoreKit with
  zero products → 2.1(b)). A reviewer will not receive such a push; an allowlist is still
  cheap.
- The website `<title>` still reads **"Exprienced"** — now visible on the delete-account
  page, which is a URL Apple opens.

---

## FIXED SINCE THE 19TH — verified today, do not undo

| # | Finding on the 19th | State today |
|---|---|---|
| BLOCKER 1 | Shagun Dakshina sold gifts outside IAP on iOS (3.1.1) | **`SHAGUN_RECHARGE_ENABLED = false`** flat — stronger than the platform gate that was proposed. `DAKSHINA_PROMPT_ENABLED` also `false`; `VoiceCallScreen`'s chain falls through to Home. |
| HIGH 2 | Three share paths handed an iPhone a Play Store link (2.3.10) | **Fixed via `src/utils/storeLinks.js`** — `ReferralPromptHost`, `ReferAndEarnScreen` and `CustomDrawerContent` all import `shareDownloadUrl`, which returns `''` on iOS until `APP_STORE_URL` exists. `RateAstrowaniPrompt` guards iOS at line 189, before its `PLAY_STORE_URL` call. |
| MEDIUM 5 | Privacy manifest missing EmailAddress | **`NSPrivacyCollectedDataTypeEmailAddress` is present.** No `AudioData` entry, and the manifest carries a deliberate comment saying so — a decision, not an oversight. |
| LOW 1 | Pre-login gift box promised a reward nothing had agreed to | **Fixed as an entitlement, not wording** — `src/welcomePromise.js` `grantOnSignup()` writes a `free_call_invites` row on the create branch (CLAUDE.md **EF**, 37/37 verified). The app's copy and the DB now agree at **7 minutes**. |
| — | Apps would have built as iPhone + iPad | **`TARGETED_DEVICE_FAMILY = "1"`** set explicitly in both `.pbxproj` on 2026-10-23 (commit `33b065d1`), keeping review off the iPad where the touch bug lives. |
| 5.1.1(v) | `astrowani.com/delete-account/` was 404 | **LIVE** — loaded in a browser today; both apps' in-app flows, the email fallback, and the retention explanation are all there. |
| LOW 7 | Vendor hardcoded "Opening Play Store…" | Unreachable on iOS: `appPrompts.js:55` returns `null` for iOS and the backend refuses iOS at `appPromptRoutes.js:151`. `RateAppPrompt` picks `prompt.rateAppStore` on iOS. |

Also still true and still right: digital purchases, gifts, reports, ₹1 services and the
coin store all hidden on iOS; free Gemini chat off on iOS (5.1.2(i)); call recording never
starts on iOS; custom review prompts refused on iOS by both ends (5.6.1); `voip` background
mode declared only in the vendor app, where PushKit + CallKit are genuinely implemented;
`ITSAppUsesNonExemptEncryption = false` in both; no ad SDKs on iOS, so "Tracking: No" is
truthful and no ATT prompt is needed.

---

## Note for CLAUDE.md: section EI is now STALE

EI says the 7-minute free call is "CODE ONLY, NOT LIVE" and that production is still 11.
**Production is on 7** — `durationMinutes: 7`, `headerText: "Your first 7-minute call is
on us"` — and the app's hardcoded copy (`Login.js` `FREE_CALL_MINUTES = 7`, the
`campaignGift.*` strings) matches. The mismatch EI warned about did not happen.

---

## Before submitting

- [x] Report + block inside the customer's chat session — **done 2026-10-23**, 26/26 verified
- [x] Clear `is_suspended` on the reviewer astrologer — **done 2026-10-23**
- [x] Change `free_call_offer.astrologerName` off "Play Store Reviewer (QA test)" — **done
      2026-10-23**, now "Our Expert Astrologer"
- [x] **Point `free_call_offer.assignedAstrologerId` at a real astrologer** — **done
      2026-10-23**: Dilip Sharma (`f36f19e8-…`), approved and not suspended. Only this one
      field was changed; mode, duration, payouts and the pools were re-read unchanged. Note
      his `free_intro_call_enabled` is false, which governs the INSTANT pool only, so this
      makes him the fallback for BOOKED free calls and nothing else.
- [ ] Staff a live astrologer for the review window; put the window + timezone in the notes
- [ ] Re-read the reviewer rows on the day of submission — they have been wrong three times
- [ ] Screenshots (iPhone 6.9") and the App Store Connect records (CO Phase 6)
