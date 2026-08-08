# Backend Endpoint Authorization Audit — 2026-08-08

Full pass over every HTTP route and socket handler in `astrowani-backend` (`index.js` +
`src/adminRoutes.js`, `astroRoutes.js`, `notificationRoutes.js`, `freeServicesRoutes.js`,
`uploadRoutes.js`, `postHogRoutes.js`, `bugAgentRoutes.js`), plus the supporting modules that
don't register routes but sit on the money path (`wallet.js`, `razorpay.js`,
`sessionManager.js`, `busyStatus.js`, `waitlist.js`, `astrologerFanout.js`,
`httpHardening.js`, `ttlCache.js`). Follows directly from the 2026-08-07/08 database
hardening pass — see [database_audit_20260807.md](../memory/database_audit_20260807.md) and
[database-hardening-deferred-decisions.md](database-hardening-deferred-decisions.md).

## Fixed same day (critical — do not re-introduce)

### 1. Wallet-theft IDOR in `POST /api/session/accept` / `/api/session/reject`
**Was**: `resolveSessionRequestId()` trusted `req.requestId`/`req.roomId` as sufficient proof
on their own — no check that the resolved request row actually belonged to the astrologer
making the call. Worse, if neither was supplied, the function returned `null` and the "was
this cancelled?" guard was skipped entirely — a session got created anyway, with
`caller_id` taken straight from the client-supplied `callerId`.

**Exploit**: any authenticated vendor could `POST /api/session/accept` with
`{callerId: <any real customer UUID>, callType:'call'}`, get back a `sessionId`, emit
`signal_connection` over the socket (also unauthenticated), and `sessionManager`'s 30s
billing poll would deduct that customer's wallet every ~60s and credit the attacker — with
no real call and no interaction from the victim.

A second variant: even with a real, owned pending request, the code trusted the client's
`callerId` field for the session row rather than the request row's own caller column — an
attacker with one legitimate incoming request could still swap in an arbitrary victim's id.

**Fix** (`index.js`, `resolveOwnedRequestRow()` replacing `resolveSessionRequestId` /
`resolvePendingChatRequestId` / `findLatestSessionRequestStatus`):
- Every lookup path (explicit `requestId`, `roomId` for calls, `callerId` for chats) now also
  filters by the calling astrologer's own id (`astrologer_id` / `receiver_id`).
- No owned row found → refuse (`ok:false, reason:'not_found'`). There is no longer a "no
  request, but proceed anyway" branch.
- The session's real caller is read from the resolved row's own column
  (`call_requests.customer_id` / `chat_requests.caller_id`), never from the client-supplied
  `callerId` body field.
- Confirmed safe against the legitimate flow: both `/api/call/initiate` and
  `/api/chat/initiate` insert the request row and return its id *before* the vendor is
  notified by any channel (socket, push, or Realtime), so a real pending row always exists
  by the time accept/reject is called for a genuine request.
- Verified with `scripts/testSessionAcceptSecurityFix.js` (14/14) — three distinct exploit
  attempts blocked, legitimate accept/reject unaffected — plus the pre-existing
  `scripts/testSessionAccept.js` (17/17) as a regression check.

### 2. Zero-auth `POST /api/live/start` / `POST /api/live/:id/end`
**Was**: `astrologerId` came straight from the request body with no auth at all — anyone
could start (or repeatedly restart) a "live" broadcast impersonating any astrologer, or
force-end anyone's broadcast (the target `sessionId` is handed out by the public
`GET /api/live/active`).

**Fix**: both routes now require the vendor's own JWT (`resolveVendorIdFromReq`).
`/api/live/start` ignores any client-supplied `astrologerId` and uses the JWT's own id.
`/api/live/:id/end` additionally checks the session's `astrologer_id` matches the caller
before ending it (403 otherwise). Admin force-stop (`adminRoutes.js` →
`app.locals.endLiveSession`) bypasses this HTTP route entirely and is unaffected.
Vendor app (`GoLiveScreen.tsx`) updated to send its JWT on all three call sites (start, end,
unmount-cleanup end) — it was using a bare `axios` instance with no auth header at all.
Verified with `scripts/testLiveAuthFix.js` (11/11).

### 3. `activateSession` could resurrect an already-terminated session
**Was**: the `signal_connection` socket handler (itself unauthenticated) calls
`sessionManager.activateSession(sessionId)`, which updated `is_active`/`next_billing_at` by
id alone — no check the session hadn't already ended. A stray or deliberately replayed
`signal_connection` for a finished session (real hangup, insufficient-balance termination,
admin force-end) would restart the 60s billing clock — silently re-billing a customer for a
call that isn't happening. A vendor who ever had one real session with a customer could
replay this indefinitely against that same customer.

**Fix**: `activateSession` now only activates a session with `ended_at IS NULL`; a replay
against an ended session is a no-op (logged, returns `false`). Verified with
`scripts/testActivateSessionFix.js` (7/7).

**Also fixed in passing**: a `ReferenceError` in the reject handler (leftover variable name
from the ownership refactor) that made `/api/session/reject` throw and return a 500 *after*
the DB update had already succeeded — cosmetic (the reject itself worked) but would have
shown a false failure to the vendor app. Caught by the regression test suite before deploy.

## Confirmed, not yet fixed — lower severity, needs a decision

These are real but each requires either a product-behavior call or non-trivial socket-auth
work, not a one-line fix — tracked here rather than fixed reflexively.

- **`POST /api/chat/message` doesn't check room membership.** Sender identity is correctly
  locked to the JWT (can't be spoofed), but `roomId`/`sessionId`/`receiverId` are taken as-is
  — a logged-in user can insert a message into a `room_id` they're not actually part of.
  Realtime would then deliver it to whoever is subscribed. Fix requires checking the sender
  is one of the two real parties on the referenced `chat_sessions`/`chat_requests` row.
- **Three `/api/push/notify-chat-*` endpoints have no auth**, and `callerName`/`message`
  text is attacker-controlled — spam/phishing vector (push a fake "incoming request" or
  chat-message notification to any customer/vendor device, cosmetically labeled with a real
  name). Low money-risk, real trust/spam risk.
- **`POST /api/call/end` has no auth.** Anyone who learns a live `sessionId` can terminate
  it. Mitigated by the id being an unguessable UUID not exposed by any public endpoint
  (unlike the live-session case above, which we did fix), but still a state-mutating route
  with zero authentication.
- **Socket layer has no connection-level auth at all** (`io.on('connection')`,
  `socket.on('join_room', userId)` — any client can join any personal room by guessing/
  supplying any id, receiving that user's `call_accepted`/`session_ended`/`incoming_call`
  events). Closing this properly means adding JWT verification to the socket handshake
  (`io.use(...)`) — a bigger, more invasive change than anything else in this pass, flagged
  for a deliberate decision rather than done under time pressure.
- **`requireAdmin` (adminRoutes.js) never re-checks the `admins` table** — verifies JWT
  signature + `role==='admin'` claim, but a token for a since-removed/disabled admin account
  keeps working until natural 7-day expiry. No revocation path exists today.
- **`PATCH /api/admin/astrologers/:id` allows a direct, un-ledgered `wallet_balance`
  overwrite** — properly admin-gated, but bypasses `wallet.js`'s atomic/ledgered helpers, so
  it can reintroduce the exact ledger-drift problem the 2026-08-07 pass fixed. Every other
  admin money-path (`customers/:id/wallet`) already uses the ledgered helper; this one
  column should be removed from the generic `allowed` list and routed through the same
  helper instead.
- **Hardcoded fallback Supabase publishable key** repeated in `adminRoutes.js`,
  `notificationRoutes.js`, `uploadRoutes.js` (`SUPABASE_SERVICE_ROLE_KEY || '<publishable
  key>'`) — not a leaked secret (the key is meant to be public), but a silent-degradation
  footgun: if the service-role env var is ever unset in a deploy, these routes keep running
  on anon privileges instead of failing loudly, unlike the `JWT_SECRET` boot guard this
  project already has precedent for.
- **Non-constant-time token comparison in `bugAgentRoutes.js`** (`token !== expected`) —
  should use `crypto.timingSafeEqual` on fixed-length buffers. Low real-world severity
  (network jitter usually swamps a timing side-channel here) but cheap to fix correctly.
- **Read-modify-write race in the new astro-report `admin_wallet` credit**
  (`astroRoutes.js`, `POST /api/astro/:key`) — same non-atomic-money-write class the 2026-08-07
  audit already fixed everywhere else; this path is newer code that didn't get the same
  treatment.
- **`wallet.js`'s legacy (non-RPC) fallback path** has two related gaps if the atomic SQL
  functions from `sql/hardening_03_atomic_wallet.sql` are ever not installed: (a)
  `transferCustomerToVendor`'s fallback debits the customer and credits the vendor as two
  independent calls — if the credit throws after the debit succeeds, money vanishes with no
  compensating refund; (b) the idempotency-key replay guard is check-then-act (SELECT, then
  separate INSERT) with no unique constraint enforced from JS, so two concurrent calls with
  the same key can both apply. Confirm the atomic RPCs are actually installed and used in
  production (`hardening_03` was applied earlier in this hardening effort) — if so this is a
  dead code path, not a live risk; worth a one-line log/metric if the fallback is ever hit at
  all, so it's visible instead of silent.
- **CORS is still wide open by default** — `httpHardening.js`'s `buildCors()` only restricts
  origins if `CORS_ORIGINS` is set in the environment; unset, it's `cors()` with zero
  restriction. The code is ready; whether it's actually locked down depends on that VPS env
  var being set — confirm directly on the VPS rather than assuming from the code.
- **Referral-reward race** (`sessionManager.js`, `maybeRewardReferral`) — check-then-act on
  `referrals.status='pending'`; two near-simultaneous `terminateSession` calls for the same
  customer's first session (e.g. the billing poll's insufficient-balance path racing a
  client's own `POST /api/call/end`) could theoretically both see `pending` before either
  flips it. Low-value target (a one-time referral bonus, not the main wallet), and the actual
  credit is idempotency-keyed once the atomic RPC path is confirmed live (see above).

## Audited and confirmed clean

- **`adminRoutes.js`** (33 routes) — every route, including all four CRUD verbs for every
  `crud()`-backed table, correctly gated by `requireAdmin`. No exceptions found.
- **`astroRoutes.js`** — customer-facing paid astrology-report purchase flow; customer
  identity always resolved server-side from the JWT, never trusted from a client-supplied id.
  The one unauthenticated route (`GET /api/astro/pdf-file/:id`) is deliberately so, protected
  by an unguessable UUID + 10-minute TTL — narrow, acknowledged exposure window, not a bug.
- **`notificationRoutes.js`**, **`postHogRoutes.js`** — all routes correctly `requireAdmin`
  (postHogRoutes' four analytics routes all verified individually, not just the first).
- **`bugAgentRoutes.js`** — correctly gated by a separate `BUG_AGENT_TOKEN` (not the admin
  JWT), fails closed (503) if unset, 401s on mismatch. Only gap is the timing-safety note
  above.
- **`uploadRoutes.js`** — gated by `requireAnyAuth`; filename derivation verified safe
  against path traversal (mime-type regex excludes `/`, folder name separately scrubbed to
  `[a-z0-9_-]`). No size/rate cap on upload payload — a cost/abuse concern, not an
  identity-confusion bug.
- **`freeServicesRoutes.js`** — all 7 routes intentionally public (stateless astrology
  calculations from public inputs, proxied to a fixed external host, not user-controlled —
  no SSRF surface).
- **`razorpay.js`** — HMAC signature verified via `crypto.timingSafeEqual` before any wallet
  credit; verification confirmed to run strictly before `wallet.adjustCustomerWallet` in
  `index.js`; idempotent on `razorpay_payment_id`.
- **`httpHardening.js` rate limits** — OTP 6/15min, auth 30/15min, write 40/15min, general
  240/60s — all finite, all confirmed actually wired onto the relevant routes (not just
  defined and unused).
- **`busyStatus.js`, `waitlist.js`, `astrologerFanout.js`, `ttlCache.js`** — no bugs found;
  fail-open/fail-safe choices are deliberate and documented.
- **`sessionManager.js`'s `checkWalletHealth` / `markStaleRequestsMissed`** — genuinely
  detection-only, never mutate `wallet_balance` or active session state themselves.

## What this pass did not cover

- Dependency vulnerability audit (`npm audit` flagged "15 vulnerabilities, 8 high" during an
  install earlier — not examined in this pass).
- App-side (React Native) code beyond the two call sites this pass had to touch to close the
  live/start-end and session-accept exploits.
- WebRTC/media-layer security (ICE/TURN credentials, SDP handling) — out of scope, this was
  strictly the HTTP/socket authorization surface.
- VPS/infra-level hardening (firewall rules, SSH config, `pm2`/systemd process isolation).
