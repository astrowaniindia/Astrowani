# Money/Billing Audit & Fix Pass — 2026-08-14

Full audit of every money-moving path in the monorepo: call/chat per-minute billing,
wallet recharge, vendor withdrawals, gifts, admin wallet adjustments, referral credits, and
the client-side wallet/balance trust boundary. Three parallel deep-research passes, each
scoped to a different slice of the money surface, followed by fixes for everything that came
back real (not just theoretical). No formal severity-ranked artifact was published for this
one — findings and dispositions are recorded directly below.

## Critical — fixed

### 1. `signal_connection` socket event let a session dodge billing indefinitely
**Was**: `socket.on('signal_connection', ...)` (`astrowani-backend/index.js`) accepted any
`sessionId` from any connected socket with **no participant check at all** — unlike
`join_session`, which verifies the caller is actually `caller_id`/`vendor_id` on the row.
`sessionManager.activateSession()` (`src/sessionManager.js`) was also **not idempotent**: every
call unconditionally reset `next_billing_at` to `now + 60s`, regardless of whether the session
was already active.

**Exploit**: a customer (or vendor) who knows their own `sessionId` could re-emit
`signal_connection` every ~30s, forever. The 30s billing poll only picks up sessions where
`next_billing_at &lt;= now`, so a perpetually-refreshed `next_billing_at` was never selected —
`process_session_billing` never ran. Result: unlimited free calls/chats, customer never
charged, astrologer never credited, and the astrologer stayed marked busy the entire time,
blocking real paying customers.

**Fix**:
- `index.js`: `signal_connection` now requires the same verified-participant check as
  `join_session` (JWT → real Supabase id → must be `caller_id` or `vendor_id` on the session).
- `sessionManager.js`: `activateSession()`'s update now also matches `is_active: false` in its
  `WHERE` clause — a true one-shot. The first signal activates billing normally; every replay
  after that matches zero rows and is a no-op, so `next_billing_at` can never be pushed forward
  again.

## Medium — fixed

### 2. Gift idempotency key wasn't actually idempotent
**Was**: `idempotencyKey: \`gift:${customer.id}:${giftId}:${Date.now()}\`` (`index.js`,
`POST /api/gift/send`) — embedding a timestamp makes every call unique by construction,
directly contradicting `wallet.js`'s own doc comment ("derived from the thing being paid for
... never a random value"). A double-tap or network-layer retry of the same "send gift" action
generated a fresh key each time and was charged twice — customer over-debited, astrologer
over-credited, platform's cut double-recorded.

**Fix**: `useGiftSender.js` (customer app) now generates one `clientRequestId` per tap, sent
with the request and reused across any retry of that same tap. Backend uses it directly as the
idempotency key when present; falls back to a 5-second time bucket (not a raw timestamp) for
any not-yet-updated app install still calling the old shape.

### 3. `POST /api/call/end` had no authorization check
**Was**: any request with a guessed/leaked `sessionId` could terminate someone else's active,
still-billing session early — no JWT check, no participant verification.

**Fix**: now resolves the caller via `resolveCustomerFromReq`/`resolveVendorIdFromReq` and
requires a match against the session's `caller_id` or `vendor_id` before terminating. Confirmed
all 4 real call-end call sites (customer voice/video, vendor voice/video) already send the JWT
— no client changes needed for this one.

## Low — mitigated, not fully closed

### 4. Self-referral farming across multiple accounts
Nothing ties a referral-code redemption to a real distinct person — one person can sign up
several accounts under different phone numbers and refer each into existence from one "main"
account, farming the ₹25 reward repeatedly. A real fix needs device-fingerprint collection this
codebase doesn't have anywhere yet. **Mitigated, not solved**: added a 5-rewards-per-24h cap
per referrer in `sessionManager.js`'s `maybeRewardReferral()`, bounding the blast radius without
new schema. Revisit if referral abuse is ever observed in the data.

### 5. No per-customer concurrency gate
`checkAstrologerBusy` (`busyStatus.js`) only ever gated the astrologer side — nothing stopped
one customer from opening concurrent sessions with two different astrologers against a single
wallet. Not a fund leak on its own (`process_session_billing` row-locks the customer row per
billing tick, so whichever session bills second just fails cleanly once funds run out), but a
real fairness/availability gap: an astrologer could be mid-paid-session when the customer's
balance silently drains from an unrelated second session, with no warning.

**Fix**: new `checkCustomerBusy()` in `busyStatus.js`, wired into both `POST /api/call/initiate`
and `POST /api/chat/initiate` — blocks a second concurrent session with a 409 +
`selfBusy: true`. Customer app's chat popup updated to show the correct "you're already busy"
message instead of always saying "astrologer is busy" (`useChatRequest.js`,
`LanguageContext.js` — new `alerts.selfBusy` / `status.youAreBusyTitle` keys, EN+HI). **Known
gap**: the 5-6 call/video entry points (`Call.js`, `Video.js`, `Home.js`, `AstrologerInfo.js`,
`ExpertsList.js`, `ReusableList.js`) still show the generic astrologer-busy wording in this rare
edge case — the blocking behavior works everywhere via the backend gate, only the copy is
imprecise outside the chat path.

## Confirmed solid — no fix needed

- **Wallet recharge**: Razorpay signature HMAC-verified server-side before any credit; amount
  comes from the server-created `wallet_recharges` order row, never the client; atomic
  status-claim + idempotency key tied to the real payment id. Textbook-correct.
- **Vendor withdrawals**: balance held immediately on request (not deferred to admin approval),
  race-safe via the RPC's own `WHERE wallet_balance + amount &gt;= 0` check, not just an
  advisory pre-check.
- **Admin wallet adjustments**: all three admin wallet-touching routes (astrologer correction,
  customer correction, withdrawal-reject refund) go through the ledgered `wallet.js` helpers;
  the generic admin CRUD factory explicitly excludes `wallet_balance` from its allowed-columns
  list to force this.
- **`per_minute_charge` provenance**: always derived server-side from the astrologer's own rate
  columns at `POST /api/session/accept` time, keyed correctly per call type (chat/call/video) —
  never trusted from a client-supplied value.
- **Core billing RPC** (`process_session_billing.sql`): single transaction, `FOR UPDATE` locks
  on both session and customer rows, `GREATEST(next_billing_at, NOW())` guards against
  double-billing on overlap, correctly terminates a session cleanly when balance runs out
  mid-call.

## One structural risk noted, not new

`DATABASE_HARDENING_HANDOFF.md` lists `hardening_03_atomic_wallet.sql` (the migration all of
the above atomicity/idempotency guarantees depend on) as **written but not confirmed applied**
in production. If it hasn't actually run, every wallet mutation silently falls back to the old
non-atomic read-modify-write path in `wallet.js`, which explicitly logs a warning that a
replayed call **will** apply twice. This isn't a new finding — worth re-confirming via
`node --env-file=.env scripts/dbHealthCheck.js` or checking server logs for the
`[wallet] ... falling back to the old read-modify-write path` warning next time someone is in
the Supabase SQL editor.

## Deployment

- Backend fixes (items 1, 3, 4, 5's server half): live via `pm2 restart astrowani-backend` on
  the VPS, same day.
- Customer app fixes (items 2, 5's client half): shipped via Hot Updater OTA, deployment id
  `019fff00-3934-7343-86e9-2bc37835bb35`, channel `production`, target app version
  `&gt;=24.0.0 &lt;24.1.0-0`. Reaches installed devices in that version range on next
  launch/foreground check — see `deployment-and-releases.md` for the general OTA process.
- Vendor app: untouched by this pass — every fix here was either backend-shared code or
  customer-app-only. Vendor-side money paths (withdrawals, session-accept charge derivation,
  call/chat-end) were in scope for the audit and came back clean; no vendor OTA needed.
