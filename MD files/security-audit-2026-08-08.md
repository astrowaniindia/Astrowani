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

## Part 4 — Active chat message/typing delivery (same day, continuing the connection-count work)

Continuing the "migrate the highest-impact remaining screen-scoped channels" work after the
user said to keep going. The active-chat screens (`ChatSessionScreen.js` customer,
`VendorChatSession.js` vendor) were the next clear target: unlike the transient
waiting-for-accept channels, a paid chat session can run many minutes, so each one held a
Supabase Realtime connection open for as long as the conversation lasted — real
connection-*time*, not just connection-count, contributing to the free-tier cap.

**Why no Realtime subscription was structurally needed here either**: `POST
/api/chat/message` (added in the STEP 3 hardening pass) is the only writer of
`chat_messages` for both of these screens — the legacy `PersonToPersonChat.js` path was
deliberately left untouched (see below). The backend already knows the instant a message is
created; it just hadn't been relaying it anywhere. Both screens already hold a Socket.io
connection and already `join_session(sessionId)` for the existing `signal_connection`/
`session_ended` events — the exact room needed already existed.

**Fix**:
- `POST /api/chat/message` (`index.js`) now does `io.to(sessionId).emit('new_chat_message',
  data)` right after the insert succeeds.
- New `chat_typing` socket handler — a plain passthrough (`socket.to(sessionId).emit(...)`,
  deliberately excluding the sender) replacing the typing indicator that previously used a
  Supabase Realtime **broadcast** channel (not `postgres_changes`, but still a Realtime
  connection). Using `socket.to()` instead of `io.to()` also fixes a latent bug in the old
  implementation: the Supabase broadcast channel was configured `{broadcast: {self: true}}`
  with no sender field in the payload, so each side could receive an echo of **their own**
  typing event and misattribute it to the other party. Not something worth a separate fix on
  its own, but free to correct while replacing the transport.
- Both screens: the `supabase.channel('chat_session_<id>', ...)` subscription (which handled
  both message delivery and the typing broadcast) is gone entirely — replaced with
  `socketRef.current.on('new_chat_message', ...)` / `.on('chat_typing', ...)` on the socket
  connection each screen already had.
- Verified end-to-end with `scripts/testChatSocketRelay.js` (9/9) using real socket.io-client
  connections against a locally-run server (backed by the production database): a message
  sent by one real throwaway account is received by the other party over the socket with
  correct content and sender, the typing relay correctly reaches the other party and
  correctly does NOT echo back to the sender (confirming the bug-fix above), and the
  underlying `chat_messages` rows are still persisted correctly.
- Two pre-existing `eslint react-hooks/exhaustive-deps` errors were found in both files
  during verification — confirmed via diff against the pre-change commit that both predate
  this change entirely (same errors, unrelated to the lines touched here).

**Not touched**: `PersonToPersonChat.js` — this screen showed signs of being stale
independent of the Realtime question (it POSTs to `/api/sessions`/`PUT /api/sessions/:id`,
endpoints that don't obviously exist in the current `index.js`, and its Call button still
navigates to `EnxJoinScreen`, documented elsewhere in this codebase as dead code). Migrating
its Realtime usage without first confirming the screen's underlying session flow even works
today would be fixing a symptom on code that may already be broken by a different cause —
flagged for its own investigation rather than touched under this pass's time budget.

## What this pass did not cover

- Dependency vulnerability audit (`npm audit` flagged "15 vulnerabilities, 8 high" during an
  install earlier — not examined in this pass).
- App-side (React Native) code beyond the two call sites this pass had to touch to close the
  live/start-end and session-accept exploits.
- WebRTC/media-layer security (ICE/TURN credentials, SDP handling) — out of scope, this was
  strictly the HTTP/socket authorization surface.
- VPS/infra-level hardening (firewall rules, SSH config, `pm2`/systemd process isolation).

---

## Part 5 — Follow-up pass (same day, later): remaining flagged items closed

Done autonomously in one sitting, each verified with a dedicated regression script run
against a locally-run server backed by the production database (throwaway rows only,
cleaned up in `finally`), then the FULL suite re-run after every subsequent change to catch
cross-fix regressions. All 6 scripts, 53 assertions, passed clean at the end of the pass.

### 1. Un-ledgered admin astrologer wallet route
`PATCH /api/admin/astrologers/:id` accepted a raw `wallet_balance` overwrite with no ledger
entry — the same class of bug already fixed for the customer wallet route, just missed on
the astrologer side. Removed `wallet_balance` from the PATCH allow-list; added
`POST /api/admin/astrologers/:id/wallet` using `wallet.adjustVendorWallet` (ledgered,
`countEarnings:false` since a correction isn't real income), mirroring the existing customer
route exactly. Added an "Adjust wallet" button + modal to the admin dashboard's Astrologers
page (was previously only on the Customers page) so the admin-editable-balance feature the
user explicitly wants (correcting disputed sessions after manual review) still works, just
through the ledgered path.

### 2. Socket-level auth gap — join_room(userId) impersonation
The single biggest structural gap flagged throughout this whole audit: join_room trusted
the client-supplied id with zero verification. Anyone who obtained/guessed a customer or
astrologer UUID (visible in API responses, deep links, etc.) could join that user's personal
room and silently receive their incoming_call/call_accepted/session_ended/new_notification/
new_chat_message events.

Fix: join_room now resolves the real identity from a JWT sent in the socket's connection
auth handshake (same verification path as HTTP — jwt.verify + phone-based UUID
reconciliation for customer tokens) and joins that resolved id's room, ignoring whatever id
the client claims. Required threading an auth token into every io(SOCKET_URL, ...)
connection site in both apps (10 in the customer app, 6 in the vendor app, plus both shared
useSharedSocket.js hooks) — mechanical but broad; each site already had the token available
nearby (or one AsyncStorage.getItem('token') away). HomeScreen.js (vendor)'s socket setup
became async (fetches the token before connecting), so initRequestListener now waits up to
5s for socketRef.current to land before emitting join_room.

Verified with scripts/testJoinRoomAuthFix.js against the real incoming_call production
code path (not a synthetic event): a legit astrologer with a valid token still receives it;
a socket with no token, and a socket holding a real-but-unrelated customer's token claiming
the astrologer's id, both receive nothing. 4/4.

### 3. Chat/session room-membership injection
join_session(sessionId) had the same zero-check problem, and /api/chat/message never
verified the authenticated sender was actually caller_id or vendor_id on the target
session — any logged-in user could inject a message into (and live-broadcast to) a session
between two other people by guessing/enumerating its id.

Fix: join_session now requires the same verified identity as join_room AND checks that
identity is a real participant on the chat_sessions row before joining; /api/chat/message
does the identical ownership check before inserting, returning 403 otherwise. This closes
both the injection (HTTP) and the eavesdrop (socket) sides of the same bug. Required adding
auth tokens to EnxScreenVoice.tsx/EnxScreenVideo.tsx (vendor call screens) too, since they
call join_session and previously had no token on their socket at all.

Verified with scripts/testChatRoomMembershipFix.js: an attacker with a real account cannot
POST a message into a session they're not part of (403, nothing persisted), cannot eavesdrop
via join_session on that session's live messages, while the two real participants are
unaffected. 6/6. The existing testChatSocketRelay.js was updated to attach tokens to its
test sockets (previously untested against this new requirement) and re-verified 9/9.

### 4. Three unauthenticated push-notification endpoints
notify-chat-message, notify-chat-request, and notify-chat-cancelled had no auth at all —
anyone could POST an arbitrary customerId/vendorId plus fabricated message/caller-name text
and trigger a real push notification under a spoofed identity, or falsely dismiss a real
pending request's notification. Fixed by requiring a valid JWT on each
(resolveVendorIdFromReq / resolveCustomerFromReq, the same helpers already used elsewhere in
this file) and deriving the identity fields (astrologerId / callerId / callerName) from the
resolved token instead of the request body. Updated all client call sites
(useChatRequest.js x2, VendorChatSession.js x1) to attach the token. Verified with
scripts/testPushEndpointAuthFix.js: no token or a garbage token gives 401 on all three; a
valid token gives 200. 9/9.

### 5. Dependency audit (npm audit)
Backend: 15 to 6 (all 8 highs eliminated via non-breaking npm audit fix; the remaining 6
moderate are a uuid bounds-check issue only reachable through firebase-admin's Google Cloud
Storage dependency chain, and fixing it needs --force to firebase-admin 10.3.0, a breaking
downgrade — left alone since push notifications already have their own "not configured"
degrade path). Admin dashboard: 6 to 4 (nanoid/postcss fixed; esbuild-to-vite-8 and
react-router-to-v7 both need major bumps, deferred). Customer app: 41 to 15, vendor app: 44
to 19 (both drops entirely from non-breaking transitive bumps; package.json direct
dependencies unchanged in both, confirmed via diff; metro/react-native versions still
correctly paired afterward — the remaining vulnerabilities in both apps are exclusively in
the Metro/React Native CLI toolchain itself, which would require replacing react-native's
own pinned version to fix, far too risky to force blind). Full backend regression suite (67
assertions across 7 scripts) re-run clean after the backend dependency bump; RN CLI responds
and Metro version pairing confirmed correct for both apps, but a full native build/bundle
was not run (no live device available this pass).

### 6. PersonToPersonChat.js — investigated, found to be a LIVE bug, not just dead code
This was flagged as "possibly already broken." It's worse than that: handCreateSession
POSTs to /api/sessions, which does not exist anywhere in index.js (confirmed via grep) —
every use of this screen would fail immediately. And it was NOT dead code: Home.js's Chat
button (on every astrologer carousel card on the Home screen — one of the most prominent
surfaces in the app) navigated straight to it, meaning this specific Chat entry point has
been silently broken for real users. ChatIntakeForm.js (the only other screen that
navigated to it) was itself confirmed unreachable — no navigation call to it exists
anywhere.

Fix: Home.js's Chat button now uses the same useChatRequest shared hook every other working
Chat entry point already uses (Chat.js, ExpertsList.js, AstrologerInfo.js, SearchScreen.js)
— profile gate, availability check, wallet check, real /api/chat/initiate call, push
fallback, and the RequestingPopup UI, all already proven. Both PersonToPersonChat.js and
ChatIntakeForm.js were then deleted along with their route registrations in Navigation.js,
since nothing reaches either anymore. Verified the replacement end-to-end against the real
/api/chat/initiate endpoint on the local test server (200, real requestId + callerId
returned) and via eslint (no new errors, warning count dropped since the replacement is
simpler than the code it replaced).

### Deliberately left for later (per explicit user direction)
- No database backups on the Supabase free tier.
- Real load testing (all capacity estimates remain estimates, never empirically measured).
- Real-RLS-via-Supabase-Auth vs. the current column-GRANT approach.
- Remaining screen-scoped Realtime channels (MySessionScreen.js, FavoriteScreen.js,
  SessionHistory.js, MissedSessions.js) and the vendor HomeScreen.js incoming-call Realtime
  backup (kept deliberately — reliability backup, not pure waste).
- Vendor Chating/Chat.js legacy path — not investigated this pass.
