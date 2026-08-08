# Backend Endpoint Authorization Audit — 2026-08-08

> **Update, same day**: after the authorization pass below, the audit series' actual goal was
> clarified — the point of both the database hardening pass and this one is that the app
> behaves the *same* whether 10 or 1000 people are using it at once, not authorization
> correctness as an end in itself (see `memory/audit_program_goal.md`). A second,
> concurrency/load-scaling-focused pass followed; its findings and fixes are in the new
> section near the end of this file.

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

## Part 2 — Concurrency / load-scaling audit (same day)

Explicitly scoped around "does this get worse specifically as concurrent users scale up,"
not general code quality. One issue in this family was already found and fixed earlier this
project — see `astrowani-backend/src/astrologerFanout.js`'s own header comment: four customer
screens each held an unfiltered `{event:'*', table:'astrologers'}` Supabase Realtime
subscription and refetched the full astrologer list on any change, which scaled Realtime
connections as *users × screens* and refetch storms as *users × astrologer activity* —
Supabase's free tier caps concurrent Realtime connections at 200 and messages at 100/s, so
at 1,000 users this was exceeded before anyone touched a toggle. That fix (single backend
subscription → coalesced `astrologers_changed` socket broadcast → debounced + jittered client
refetch, backed by the existing 10s TTL/single-flight list cache) was already live in
`Home.js`, `Chat.js`, `Video.js`, and `Call.js`. **`CategoryAstrologers.js` was missed** —
still had the old direct, unfiltered subscription. Migrated to the shared
`useAstrologerListSync` hook, closing the last gap.

### Fixed

**1. `sessionManager.js`'s 30-second billing poll — serial N+1 loop, dead per-session query,
no re-entrancy guard.** This is the one finding in this pass that threatens *correctness*
under load, not just latency — the function that moves real money every 30 seconds.
- `checkActiveSessions()` processed each due session with `await` inside a `for` loop —
  cost scaled linearly with concurrently-active paid sessions. At low traffic, invisible; at
  hundreds of simultaneous active calls/chats, one tick's wall-clock time stretches out.
- Each iteration also did a second, completely unused round-trip: fetched the customer's
  `wallet_balance` into `session.customers`, which nothing downstream ever read. Deleted.
- The `setInterval` driving this never checked whether the previous tick had finished — a
  tick running long (more likely exactly when it matters, under load) could overlap the next
  one processing the same sessions concurrently.
- **Fix**: dropped the dead customer fetch; due sessions are now billed concurrently via
  `Promise.all` (safe because `process_session_billing`'s own row-level `FOR UPDATE` lock
  makes concurrent calls for *different* sessions independent — see
  `sql/process_session_billing.sql`); added an `isCheckingSessions` guard so an overrunning
  tick skips the next one instead of double-processing.
- Verified with `scripts/testCheckActiveSessionsFix.js` (14/14): three concurrent due
  sessions each billed exactly once, a free-session-window session correctly skipped and
  rescheduled without an RPC call, and an immediate re-run confirmed no double-billing.

**2. Unbounded in-memory `pdfCache` in `astroRoutes.js`.** Held full generated-PDF byte
buffers with only a 5-minute TTL sweep and no cap on how many could accumulate in between —
unlike `src/ttlCache.js`, which caps `maxEntries` on every insert. Memory held scaled
linearly with paid-report purchase rate in any given window, no ceiling. Added the same
`maxEntries`-on-insert discipline (200 entries, oldest evicted first via `Map`'s natural
insertion-order iteration).

### Confirmed, not fixed — lower urgency

- **`notifyMissed` / `markStaleRequestsMissed`** (same 30s poll as the billing fix, smaller
  magnitude) — sequential `await sendPush()`/`checkAstrologerBusy()` per row instead of
  batched. `notificationRoutes.js` already has the batching pattern for FCM
  (`CHUNK_SIZE = 500`) that this doesn't reuse. Worth doing in the same pass as #1 above, but
  bounded by stale-request count rather than active-session count, so lower priority.
- **Global 10MB JSON body limit applies to every route**, not just image/audio uploads —
  parsing a large body and base64-decoding it are synchronous, so they block the single
  Node process's event loop for every other concurrent request while running. No
  endpoint-specific tighter limit exists. Matters more as concurrent upload traffic grows.
- **`GET /vendor/performance` has no date range** — pulls a vendor's entire lifetime
  call/chat/session history every time. Grows with total historical data regardless of
  concurrency, and compounds if many vendors check it around the same time.
- **Admin broadcast (`notificationRoutes.js`) fans out one `io.to(id).emit()` per recipient**
  in an unchunked `forEach` — scales with total registered users, not concurrent connections,
  and is only triggered by a rare admin action. Low urgency, but the FCM send two lines below
  it is already chunked; the socket fan-out isn't.
- **Backend runs as a single pm2 process, no cluster mode.** Correct tradeoff today — the
  in-memory singletons this codebase relies on (`ttlCache.js`, `astrologerFanout.js`'s single
  subscription, `sessionManager`'s poll state) would need a shared store (Redis) to be safe
  under multiple processes, and that's a bigger architecture change than anything in this
  pass. Flagged as the actual ceiling on vertical throughput once everything above is fixed —
  a single process is still bound by one CPU core.

### Verified already fine (not just assumed)

- No other N+1 patterns in `index.js`'s list/read endpoints — `formatAstrologer`,
  `buildCategoryMap`, `buildBusyMap` are all properly batched regardless of astrologer count.
- `ttlCache.js` — `maxEntries` eviction genuinely runs on every `set()`, single-flight
  coalescing genuinely dedupes concurrent cache misses. No gap between intent and code.
- No per-request Supabase client construction anywhere audited — every module builds its
  client once at load time.
- Every other socket emit in `index.js`/`sessionManager.js` targets a specific room
  (`io.to(id)`), not a broadcast to all connected sockets — `astrologerFanout.js`'s
  (necessarily) broadcast event is the only one, and it carries no payload beyond a change
  count by design.
- Rate limiters (`httpHardening.js`) use the default in-memory store, which self-prunes per
  window and is appropriate for a single process.

## Part 3 — Realtime connection-count capacity (same day, after user clarified plan tier)

The concurrency audit above was itself missing the single biggest capacity number: **how
many direct Supabase Realtime connections does one active device actually hold**, and how
that multiplies across concurrent users against Supabase's free-tier 200-connection cap.
Confirmed with the user: **the project is on the free tier**, so this is an active constraint,
not a hypothetical.

**Inventory**: 16 files in the customer app and 7 in the vendor app open direct
`supabase.channel(...)` Realtime subscriptions. All of them are correctly row/user-filtered
(no data-leak concern) except four low-frequency admin-content tables (`blogs`,
`live_sessions`, `remedy_items` — intentionally not migrated, cheap/rare writes). No screen
shared a connection with another the way `useAstrologerListSync` already consolidated the
astrologer list — every screen opened its own.

**Per-device estimate** (realistic navigation, not a worst-case "every screen open at once"):
customer ≈ 2–4 concurrent connections, occasionally 5 during an accept-wait window; vendor ≈
2–3, occasionally 4. Blended average ≈ 3 per device.

**Capacity math**: `200 ÷ 3 ≈ 65–70 concurrent users` before the free-tier cap is hit — even
at an optimistic 2 per device, only ≈100. **1,000 concurrent users would exceed the Realtime
connection cap at roughly 1/10th to 1/15th of that target.**

### User decision

Presented three options (migrate the highest-impact channels to the backend relay pattern,
upgrade the Supabase plan, or just document it as a known limit). **User chose to migrate to
the backend relay pattern** — same no-cost architecture already proven for the astrologer
list, extended to the connections that matter most.

### Fixed: notification badges (the always-on connections)

The `CustomHeader.js` notification badge in both apps is mounted on nearly every screen, so
it was effectively an **always-on Realtime connection for every single logged-in user, not
just one screen's worth** — the single highest-impact target in the whole inventory.
`NotificationScreen.js` (customer) / `Notification.js` (vendor) each additionally opened a
**second, fully duplicate** subscription on the same table while open.

Investigated whether these actually need a Supabase Realtime subscription at all, and found
they don't: `notifications` has exactly **one writer** across the whole codebase —
`astrowani-backend/src/notificationRoutes.js`'s admin send route — which already does
`io.to(recipientId).emit('new_notification', ...)` synchronously right after the insert
(pre-existing code, written for a live in-app toast). The backend already knows the moment a
notification is created; there was never a need for a client-side Realtime subscription to
"discover" it, unlike the astrologers table (many writers, hence `astrologerFanout.js`
holding one server-side subscription and relaying it). No backend change was needed at all —
only removing the redundant client-side subscriptions.

**Fix, mirrored in both apps**:
- New `useSharedSocket.js` (customer: `src/hooks/`, vendor: `src/utils/` — matching each
  app's existing convention) — a single ref-counted Socket.io connection shared by every
  hook that needs live backend signals, so a second consumer doesn't open a second physical
  socket. `useAstrologerListSync.js` (customer) refactored to use this shared module instead
  of its own private copy of the same acquire/release logic — behavior unchanged.
- New `useNotificationBadgeSync.js` (both apps) — joins the user's own socket room
  (`join_room`, the same room `new_notification` is already emitted to) and listens for that
  event, debounce-free since it's a single per-user event, not a table-wide broadcast.
- `CustomHeader.js` (both apps): direct `supabase.channel(...)` subscription on `notifications`
  removed entirely, replaced with `useNotificationBadgeSync`.
- `NotificationScreen.js` (customer) / `Notification.js` (vendor): same replacement, and the
  duplicate-with-the-header subscription is gone — one shared socket now covers both.
- Verified: `node --check` was unreliable for JSX files in this environment (confirmed via a
  controlled test — an isolated JSX snippet correctly failed, but the same content in-place
  in the full file inconsistently reported success; not trusted for this pass). Verified
  instead with `npx eslint` against each app's real Babel-based config: **0 errors** on every
  changed file. The one pre-existing `react-hooks/exhaustive-deps` error in `GoLiveScreen.tsx`
  was confirmed present in the commit *before* today's changes (diffed against `HEAD~2`) —
  not introduced by this pass.

**Impact**: removes one always-on Realtime connection per logged-in device in both apps,
taking the blended average from ≈3 down to ≈2 per device — capacity improves from ≈65–70 to
≈100 concurrent users before the free-tier cap. A real improvement, but **not sufficient
alone to reach 1,000 concurrent users** — see below.

### Confirmed, not fixed — the remaining gap to reach 1,000 users

Migrating the always-on notification badge was the single highest-impact, lowest-risk item.
What's left is lower-impact-per-item (screen-scoped, not always-on) or carries a real
reliability trade-off:

- **Vendor `HomeScreen.js`'s incoming call/chat request listener** — deliberately NOT
  touched. This subscribes to `call_requests`/`chat_requests` INSERT+UPDATE and is the
  backup path for detecting a new incoming request if the primary `incoming_call` socket
  event is missed (app backgrounded/killed, socket reconnect race) — the exact reliability
  pattern documented throughout this codebase's call-cancellation-sync history. It's the
  single most consequential channel for revenue (a missed incoming call is lost business),
  so removing it needs a deliberate reliability review, not a capacity-driven removal under
  time pressure. Flagged for a dedicated pass, not done here.
- **Screen-scoped chat/session channels** (`ChatSessionScreen.js`, `PersonToPersonChat.js`,
  `VendorChatSession.js`, `MySessionScreen.js`, `FavoriteScreen.js`, `SessionHistory.js`,
  `MissedSessions.js`, etc.) — each only open while that specific screen is focused, so they
  contribute less to steady-state peak concurrency than an always-on connection, but still
  add up. Not migrated in this pass; a candidate for a follow-up once the always-on ones are
  fully addressed.
- **Transient waiting-for-accept channels** (`useChatRequest.js`, `ExpertsList.js`,
  `AstrologerInfo.js`, `Video.js`, `Call.js`, `Home.js`) — self-limiting (only open for a few
  seconds while waiting on a call/chat request), lowest priority of everything in the
  inventory.
- **Bottom line**: reaching 1,000 concurrent users on the free Realtime tier is not realistic
  even with every remaining screen-scoped channel migrated, given how many genuinely-live
  per-session connections (active chat/call screens) are inherent to the product. Getting to
  1,000 will very likely need the paid Supabase Realtime tier's higher connection ceiling
  *in addition to* this migration work, not instead of it — the migration reduces waste, the
  plan upgrade raises the ceiling itself. Worth revisiting the "upgrade the plan" option
  before any real user-acquisition push, even after all client-side migration work is done.

## What this pass did not cover

- Dependency vulnerability audit (`npm audit` flagged "15 vulnerabilities, 8 high" during an
  install earlier — not examined in this pass).
- App-side (React Native) code beyond the two call sites this pass had to touch to close the
  live/start-end and session-accept exploits.
- WebRTC/media-layer security (ICE/TURN credentials, SDP handling) — out of scope, this was
  strictly the HTTP/socket authorization surface.
- VPS/infra-level hardening (firewall rules, SSH config, `pm2`/systemd process isolation).
