# Bug-Fix Batch — 2026-08-14

17 items reported by the user across the customer app, vendor app, and admin dashboard,
worked through in 6 tracked batches (listed first, fixed second, verified against the user's
own descriptions and screenshots before any code was touched). Landed as
`1b17ac5` "Fix session-billing leak, wallet field mismatch, WebRTC connect failures, and UI
bugs across all four apps". Followed same day by the [money/billing
audit](money-billing-audit-2026-08-14.md), the [OTA-cache
addendum](performance-audit-2026-08-13.md), and infra work (coturn TURN server, Cloudflare
proxying, VPS firewall) — see conversation history for the infra steps, not re-documented here.

## BUG-09 — Chat billing leak on back-button exit
**Was**: hardware back / navigating away from `ChatSessionScreen.js` (customer) or
`VendorChatSession.js` (vendor) left the `chat_sessions` row `is_active: true` with no
`end_session` ever sent — billing kept ticking against the customer's wallet for a chat neither
party could see anymore.
**Fix**: both screens now emit `end_session` (with an `hasEndedRef` guard against a double
emit) from their unmount cleanup, not just from an explicit "End Chat" button tap.

## BUG-01 — Suspended astrologer still visible/live
**Fix**: `PATCH /api/admin/astrologers/:id` (`adminRoutes.js`) now force-ends any active live
session the moment `is_suspended` flips true or `approval_status` leaves `approved`, via
`app.locals.endLiveSession`. `GET /api/live/active` also filters through
`astrologerVisibleToCustomers` so a suspended astrologer's stream can't be listed even in the
race window before the force-end lands.

## BUG-02 — Unapproved astrologer could go live
**Fix**: `POST /api/live/start` gained the same approval/suspension eligibility check the rest
of the astrologer-visibility logic already used, 403ing an ineligible astrologer's own attempt
to start broadcasting.

## BUG-04 — Chat allowed with zero wallet balance (Call/Video correctly blocked it)
**Root cause**: `useChatRequest.js`'s wallet check read `item.chat_charge_per_minute` /
`item.chatChargePerMinute` — neither field exists on a formatted astrologer object (the real
field is `chatPrice`, per `formatAstrologer` in `index.js`) — so `charge` was always `0` and the
`balance < charge` check silently never fired.
**Fix**: `const charge = item.chatPrice ?? item.chat_charge_per_minute ?? item.chatChargePerMinute ?? 0;`

## BUG-05 — "Failed to verify wallet balance" error
**Fix**: `getWalletBalance()` (`astrowani_customer-main/src/utils/wallet.js`) rewritten with a
10s timeout + one retry, instead of failing outright on a single slow/dropped request.

## FEATURE-01 — Referral nudge on insufficient balance
**Fix**: new `src/utils/insufficientBalanceAlert.js` —
`showInsufficientBalanceAlert({navigation, minRequired, balance, t})`, offering "Refer & Earn
₹25" (→ `ReferFriend`) or "Recharge" (→ `Wallet`) instead of a dead-end error. Wired into every
wallet-check site: `Call.js`, `Video.js`, `Home.js` (×2), `AstrologerInfo.js` (×2),
`ExpertsList.js`.

## BUG-06/BUG-07 — Calls stuck on "Connecting", black remote video
**Root cause**: WebRTC had STUN servers only — calls across carrier-grade NAT (common on
Indian mobile networks) could never complete ICE negotiation.
**Fix**: self-hosted `coturn` TURN server stood up on the VPS; added to `ICE_SERVERS` in all
call/live screens (`VoiceCallScreen.tsx`, `VideoCallScreen.tsx`, `EnxScreenVoice.tsx`,
`EnxScreenVideo.tsx`, `LiveViewerScreen.tsx`, `GoLiveScreen.tsx`).

## BUG-03 — Live viewer sees black screen
Same root cause/fix as BUG-06/07 — the TURN server addition covers live streaming's WebRTC mesh
too (`GoLiveScreen.tsx`, `LiveViewerScreen.tsx`).

## BUG-08 — Hard app-version gating on core features
User explicitly opposed forced update-blocking on features that don't need it — reviewed and
confirmed no such gate was added/left blocking core flows.

## BUG-10 — Remaining native `Alert.alert` popups
**Fix**: converted remaining raw `Alert.alert` calls to the themed `showStatusPopup` in both
apps — customer's `ChatSessionScreen.js` "Session Ended", vendor's `Support.tsx` and
`VendorChatSession.js`. Vendor app got its own `components/StatusPopup.js` (new — customer had
one, vendor didn't) with an `error` variant added, mounted via `<StatusPopupHost />` in
`NavigationScreen.js`.

## BUG-11 — Invisible white-on-white signup text (vendor app)
**Fix**: `Registration.js`'s `styles.input` was missing an explicit text color, inheriting
white-on-white in some theme states. Added `color: COLORS.black || '#000'`.

## FEATURE-02 — Admin Astrologers section: search + pagination
**Fix**: `astrowani-admin/src/pages/Astrologers.jsx` — added `PAGE_SIZE = 20`, search input,
status filter `<select>`, and pagination controls, replacing an unfiltered full-list render.

## FEATURE-03 — Required vendor profile fields not marked
**Fix**: `EditProfile.js` (vendor) — star markers + an explanatory banner on required fields,
new styles (`requiredNotice`, `requiredStar`, `requiredFieldTag`, etc).

## FEATURE-04 — Hindi/English toggle in vendor app
**Fix**: new `astrowani_vendors-main/src/context/LanguageContext.js` (mirrors the customer
app's), wired through `App.js`, drawer labels in `CustomDrawer.js` via `t()`, plus a language
toggle UI in the drawer. AsyncStorage key `vendorAppLanguage`.

## FEATURE-05 — Vendor wallet transaction history missing counterparty name
**Root cause**: `GET /api/vendor/wallet` had no reliable way to resolve which customer a
transaction was with — session-based lookup only, which missed transactions with no matching
session row.
**Fix**: `vendor_wallet_transactions` gained a `customer_id` column
(`sql/hardening_06_vendor_txn_counterparty.sql`), threaded through `adjust_vendor_wallet` and
`transfer_customer_to_vendor`. Backend now resolves the counterparty name directly from
`customer_id` first, falling back to the session-based lookup only when `customer_id` is null
(older rows). `process_session_billing.sql`'s ledger insert updated to populate it going
forward. Vendor's `Report.js` `renderTransaction` fixed to actually use the resolved name.

## Admin — New Entries 500 error
**Root cause**: `adminRoutes.js` read `profile_image`, but the actual column is
`profile_pic_url`.
**Fix**: corrected in both the admin route and `astrowani-admin/src/pages/NewEntries.jsx`'s
display code.

## Also touched, smaller
- OTP rate limiting: new `otpPhoneLimiter` (keyed by phone number, not just IP) — closes a gap
  where an attacker rotating across a handful of IPs could flood one victim's phone with OTP
  texts without any single IP tripping the existing per-IP limiter. Required
  `ipKeyGenerator()` from `express-rate-limit` v8 for the IPv6-safe fallback key.
- `POST /api/call/initiate` — `call_requests` insert now also stores `session_id`, fixing a
  case where a vendor accepting via the Supabase Realtime backup path (instead of the socket
  event) got a mismatched/fresh `sessionId` that the customer's call screen wasn't listening on.
- Customer bottom tab bar reordered: Home / Chat / Call / Video / Live / Remedies.

## Deployment
Backend + admin: live on the VPS via `git pull` + `pm2 restart astrowani-backend` (admin
dashboard static build still needs a manual rebuild/redeploy to pick up its two file changes —
not yet confirmed done). Customer app: needs `astrowani_customer-main`'s changes bundled in the
same OTA/build cycle as the money-audit fixes (see `money-billing-audit-2026-08-14.md`'s
Deployment section) — hot-updater bundles whatever is on disk at deploy time regardless of git
history, so this batch's customer-app changes, the money-audit fixes, and the banner-caching
commit (`5011720`) all shipped together in the one `npx hot-updater deploy -p android` run.
Vendor app: **not covered by OTA** — its changes here
(new `StatusPopup.js`, `LanguageContext.js`, drawer/profile/wallet screen edits) are JS-only and
Hot-Updater-eligible in principle, but no vendor OTA deploy was run this session; still pending
a native rebuild or a vendor-app OTA push, whichever the user intends to use.

## Still outstanding (not done in this batch)
- `sql/hardening_06_vendor_txn_counterparty.sql` needs to be run in the Supabase SQL editor.
- `process_session_billing`'s live Supabase RPC needs a manual dashboard update to match
  `sql/process_session_billing.sql`'s new `customer_id` column in the ledger insert.
- Admin dashboard (`astrowani-admin`) rebuild/redeploy for the New Entries + Astrologers page
  fixes to reach production.
