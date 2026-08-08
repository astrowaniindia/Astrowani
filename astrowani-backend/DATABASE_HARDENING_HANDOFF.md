# Astrowani database hardening — handoff

**Read this whole document before touching anything.** It is written for a fresh
Claude session with zero prior context on this project. It is self-contained:
you should not need to ask the user anything to understand the current state,
though you will need their credentials and decisions to *act* on some of it.

---

## 1. What Astrowani is

A live consultation marketplace (astrology, but the shape is generic: two-sided
marketplace + per-minute billing + wallets). Three apps, one Supabase Postgres
database, one Node/Express backend:

| Directory | What it is |
|---|---|
| `astrowani-backend/` | Node/Express REST API + Socket.io, deployed on a Hostinger VPS at `https://backend.astrowani.com` |
| `astrowani_customer-main/` | React Native customer app |
| `astrowani_vendors-main/` | React Native astrologer/vendor app |
| `astrowani-admin/` | React + Vite admin dashboard (served by the backend at `/admin`) |

Money flow: a customer wallet is debited per minute of a chat/call/video
session; the astrologer's wallet is credited the same amount. A Postgres RPC
function called `process_session_billing` does this, invoked every 30 seconds
by a polling loop in `astrowani-backend/src/sessionManager.js`.

**Database**: Supabase (hosted Postgres + PostgREST + Realtime). Both apps
connect to Supabase *directly* for many reads/writes (not exclusively through
the backend) using a public "anon"/"publishable" key that ships inside the
compiled APKs. The backend also connects to Supabase, normally using the
service-role key (full access, bypasses Row Level Security).

**Auth**: the apps do **not** use Supabase Auth. They authenticate against the
Express backend's own `/api/*` endpoints, which issue a custom JWT signed with
an env var called `JWT_SECRET`. This detail matters enormously for everything
below — see §3.

---

## 2. Why this document exists

On 2026-08-07 a full audit of the live database was performed (introspecting
the real Supabase project via its REST API, probing it with the public app
key, reconciling the two money ledgers against stored balances, timing the
hot endpoint). It scored **3/10**. Full findings:
`memory/database_audit_20260807.md` in this repo's Claude memory, and an
HTML report was published as a Claude Artifact (URL not portable to a fresh
session — re-derive findings from this doc and the code instead of chasing
that link).

**The one fact to hold onto:** every table created *with a SQL schema file* in
`astrowani-backend/sql/` (e.g. `wallet_recharges`, `reviews`, `favorites`,
`astrologer_waitlist`) is well built — foreign keys, CHECK constraints, UNIQUE
idempotency guards, RLS enabled. Every table created *ad-hoc in the Supabase
dashboard* at the very start of the project — `customers`, `astrologers`,
`chat_sessions`, `chat_requests`, `call_requests`, `chat_messages`,
`wallet_transactions`, `vendor_wallet_transactions` — has **none** of that, and
those eight tables carry all the money and all the session state. This is not
a knowledge gap in the team; it's a "never went back and retrofitted the older
tables" gap. Bring old tables up to the standard the new ones already meet.

Since the audit, a first round of fixes was implemented and verified (see §5).
**This document exists so that work can continue in a fresh session with no
memory of the above**, and so the user can hand it to a different Claude
account/session and get the same continuity.

---

## 3. The five critical findings (verified against production, 2026-08-07)

### 3.1 RLS is off on the core tables — the public app key can rewrite any wallet balance
Row Level Security is disabled on `customers`, `astrologers`, `chat_sessions`,
`call_requests`, and others. The publishable/anon key baked into both APKs
(`sb_publishable_iLfw8Co1PiXDyYJZvzCRKw_5hQBKn_O` at time of writing — treat as
public, it is meant to be extractable from any APK) can, with **no login at
all**:
- `SELECT *` from `customers` (name, mobile, email, DOB, birth time,
  birthplace, wallet balance) and `astrologers` (including
  `bank_account_number`, `bank_ifsc`, `upi_id`)
- `SELECT *` from `chat_messages` — every private consultation transcript
- `INSERT`/`UPDATE` on `customers`, `astrologers`, `chat_sessions`,
  `call_requests` — meaning `wallet_balance` and `*_charge_per_minute` are
  directly writable by anyone

This was proven by inserting throwaway rows with the anon key and then
deleting them — do **not** repeat that against production without extreme
care; there is a safer non-destructive verification path in §6.1.

### 3.2 RLS cannot simply be "turned on"
Because the apps authenticate via a custom JWT and not Supabase Auth,
`auth.uid()` inside any RLS policy is always `NULL`. There is no ownership
policy expressible today ("this customer may read their own row") — the
database genuinely cannot tell who is asking. Flipping RLS on right now would
not secure anything; it would just break every direct-from-app Supabase query
simultaneously. The fix path that actually works with the current auth model
is **column-level `GRANT`/`REVOKE` on the `anon` Postgres role** — this is
what `sql/hardening_02_access_control.sql` does (written, not yet applied —
see §6).

### 3.3 Production's `JWT_SECRET` was the value hardcoded in the source and in this repo's docs
The old code had `const JWT_SECRET = process.env.JWT_SECRET ||
'super_secret_astrowani_key_123'` in six files, and that exact string was also
printed in `CLAUDE.md` and other docs. **The live production value matched
it.** Anyone with repo access could mint a valid token for any customer, any
astrologer, or the admin dashboard (which can adjust wallets and approve
withdrawals). This has been fixed in code (§5) but **the live secret still
needs rotating by the user** — see §7.

### 3.4 Zombie sessions silently lock an astrologer out of all future work
`chat_sessions.is_active = true` combined with `next_billing_at = NULL` is
invisible to the billing poll (`sessionManager.checkActiveSessions` only
selects rows where `next_billing_at <= now()`), so such a row never bills and
never terminates. But `src/busyStatus.js` treats any `is_active = true` row as
"this astrologer is busy" — so the astrologer is locked out of receiving any
new chat/call/video request, indefinitely, with zero errors or logs. One
astrologer had two such rows dating back 50 days at audit time.

**Rule going forward: any code path that sets `chat_sessions.is_active = true`
must set `next_billing_at` in the same write.** No exceptions.

### 3.5 Every wallet mutation was a non-atomic read-modify-write
The pattern everywhere (before the fix in §5) was: `SELECT wallet_balance` →
add/subtract in JavaScript → `UPDATE wallet_balance` — then a *separate*
`INSERT` into the ledger table (`wallet_transactions` /
`vendor_wallet_transactions`). Two statements, no transaction. Consequences,
both observed in production data:
- **Lost updates**: two concurrent requests read the same balance, both write
  based on the stale value, one movement of money vanishes.
- **Torn writes**: if the process dies between the `UPDATE` and the `INSERT`,
  money moves with no ledger entry, or the reverse.

The 2026-08-07 audit found **₹5,865 of drift across 3 accounts** — real
production money that no longer reconciles against its transaction history.
This is now fixed at the code layer for every money-moving endpoint (§5.1),
though the ledger drift that already exists has **not** been corrected/backed
out — that requires a judgment call from the user about how to true up those
specific accounts, not a code change.

### Other, lower-severity findings from the same audit
- **Zero indexes** beyond primary keys on all 8 "old" hot tables. Fixed in
  code for the biggest offender (`/api/astrologers`, see §5.2) plus a full
  index migration is written and waiting in
  `sql/hardening_01_core_tables.sql` (not yet applied).
- **Unfiltered Realtime fan-out**: four customer screens each held their own
  Supabase Realtime subscription to the *entire* `astrologers` table with no
  filter, and refetched the whole list on any row change anywhere. At scale
  this amplifies catastrophically (N users × M astrologer-activity = huge
  request volume) and could exceed Supabase's free-tier Realtime connection
  cap. **Fixed** — see §5.3.
- **No rate limiting, no security headers, no compression, fully open
  CORS.** **Fixed** — see §5.4.
- **`process_session_billing`, the function that actually moves money every
  minute, existed only inside the Supabase dashboard** — not in the repo, no
  version control, unreviewable, unrecoverable if lost or accidentally
  dropped. **Still unresolved** — see §5.5 and §7.

---

## 4. Two structural constraints, worth internalizing before writing more SQL or code

1. **No Supabase Auth ⇒ no row-level ownership policies.** Every access-control
   fix in this codebase either goes through the backend (which holds the
   service-role key and is the trust boundary) or uses coarse column-level
   `GRANT`/`REVOKE` on `anon`. Do not attempt per-row RLS policies unless the
   auth model changes first (see the "decisions needed" list in §7 — this is
   one of them).
2. **The apps write to Supabase directly in many places, not exclusively
   through the backend API.** Any access-control tightening must be checked
   against what each app's client code actually calls — grep
   `astrowani_customer-main/src` and `astrowani_vendors-main/src` for
   `supabase.from(` before revoking any privilege, or you will break the app
   silently (Realtime/PostgREST errors show up in the RN console, not in any
   backend log).

---

## 5. Work already completed (do not redo — verify then build on top)

All of this was implemented, then tested against either a locally-booted copy
of the backend (pointed at the *real* Supabase project but with its own
background jobs disabled — see `DISABLE_SESSION_MANAGER` below) or throwaway
rows that were created and deleted within the same test run. Nothing here
should have touched real user data. **If you are auditing this claim, the
right move is to re-run the test scripts in `scripts/`, not to take this
document's word for it.**

### 5.1 Atomic wallet mutations (`src/wallet.js` + `sql/hardening_03_atomic_wallet.sql`)
- New Postgres functions `adjust_customer_wallet`, `adjust_vendor_wallet`,
  `transfer_customer_to_vendor` do the balance change and the ledger `INSERT`
  in one transaction, with the sufficiency check inside the `UPDATE`'s `WHERE`
  clause (so concurrent calls cannot race past it). They support an
  `idempotency_key` so a retried/duplicated call is a safe no-op — new
  columns `wallet_transactions.idempotency_key` /
  `vendor_wallet_transactions.idempotency_key` back this.
- **SQL file is written but NOT YET applied to the live database** — see §7.
  Until it is, `src/wallet.js` transparently falls back to the old
  read-modify-write path (with a console warning) so the API keeps working
  either way. Idempotency in the fallback path only works if the
  `idempotency_key` columns already exist; otherwise it warns loudly instead
  of silently pretending to be safe.
- All nine money-moving call sites in the codebase were rewired to go through
  this module: wallet recharge credit, gift send (customer→astrologer
  transfer), withdrawal hold, withdrawal-rejected refund, admin wallet
  adjustment, paid astro-report purchase, referral reward. One dead,
  unauthenticated-adjacent endpoint (`POST /api/wallet/deduct-and-credit`,
  never called by either app, found via grep) was deleted outright rather than
  fixed — it had no legitimate caller and its own bugs (see the tombstone
  comment left in `index.js` where it used to be).
- Test: `npm run test:wallet` (`scripts/testWallet.js`) — creates a throwaway
  customer + astrologer, exercises credit/debit/overdraft-refusal/transfer/
  idempotency, deletes everything. **23/24 assertions pass on this database
  today; the 1 failure is the idempotency-replay check, which can only fully
  pass once `hardening_03_atomic_wallet.sql` is applied** (see §7). This is
  expected and by design, not a bug to chase.

### 5.2 `/api/astrologers` rewritten: pushed filters into SQL + TTL cache + column projection
- Was `SELECT *` on the whole table, filtered in Node. Now filters
  `approval_status`, `is_suspended`, `experience` in SQL, and selects only the
  columns the response actually needs (previously leaked `admin_notes`, bank
  details, etc. into every list response even though the frontend ignored
  them — not exploitable via this endpoint since it returns to the caller who
  already has broader Supabase access, but wasteful and sloppy).
- New `src/ttlCache.js`: generic in-process TTL cache with single-flight
  de-duplication (concurrent cache misses for the same key share one upstream
  call instead of each hitting the DB). 10-second TTL on the astrologer list.
  Safe because staleness cannot cause an incorrect call — `/api/call/initiate`
  re-checks busy state server-side regardless of what the list said.
- Verified byte-for-byte equivalent output against the live production
  endpoint (ignoring the positional `_id` index and live `isBusy`/`busySince`,
  which legitimately differ between two calls seconds apart). Cold-call
  latency dropped from ~700–2000ms to ~700–2000ms (unchanged — the query
  itself, not caching, is what's saving time on a cold call) down to
  single-digit ms on a warm cache; 300 simultaneous cold requests now cost
  exactly ONE upstream DB round trip.

### 5.3 Astrologer-list Realtime fan-out consolidated (`src/astrologerFanout.js` + `hooks/useAstrologerListSync.js`)
- The **backend** now holds exactly one Supabase Realtime subscription on the
  `astrologers` table (started at server boot), coalesces bursts of changes
  over a 3-second window, invalidates its own list cache, and rebroadcasts a
  bare `astrologers_changed` signal over the Socket.io connection every app
  already maintains for calls/chat.
- The **customer app**'s four screens (Home, Chat, Video, Talk-To-Experts)
  each used to open their *own* Supabase Realtime subscription to the entire
  table with no filter. All four were replaced with the new
  `useAstrologerListSync` hook, which listens for that one socket signal,
  debounces + jitters the resulting refetch (so N clients don't all hit the
  API in the same millisecond), and shares one socket connection across
  however many screens use the hook simultaneously (reference-counted).
  Refresh-on-screen-focus is unchanged and remains the correctness backstop
  if the socket ever drops.
- Test: `npm run test:fanout` (`scripts/testFanout.js`) — boots the backend,
  connects 25 fake Socket.io clients, mutates a throwaway astrologer row three
  times in quick succession via Supabase, asserts all 25 clients receive
  exactly ONE coalesced event each (not three), then deletes the throwaway
  row. 7/7 assertions pass.
- **Not yet done on the vendor app side**: the vendor app's own screens
  (`HomeScreen.js` etc.) were not audited/converted in this pass — the
  originating problem (Supabase's connection/message-rate limits) is about
  total concurrent subscriptions system-wide, and the customer app was the
  dominant source (4 subscriptions × every customer, vs. vendor app's smaller
  user base). Worth doing the same conversion on the vendor app for
  completeness — see §8.

### 5.4 HTTP hardening (`src/httpHardening.js`)
- Added `helmet` (security headers — CSP left off because the backend also
  serves the admin dashboard's built JS bundle from `/admin` and a default CSP
  would break it; other headers like `X-Content-Type-Options`,
  `X-Frame-Options` are on), `compression` (gzip), and a CORS allowlist driven
  by a `CORS_ORIGINS` env var (comma-separated; if unset, behavior is
  unchanged/open with a startup warning, so deploying this cannot silently
  break the admin dashboard before someone configures it).
- Rate limiting via `express-rate-limit`, applied selectively:
  - **OTP request** (`/api/users/mobile-otp-request`): 6 requests / 15 min per
    IP. This is the one that actually costs real money per attempt (SMS via
    EnableX) — the most urgent of all the hardening items, since an
    unthrottled OTP endpoint is a direct, uncapped SMS bill for anyone who
    finds it.
  - **Auth-ish endpoints** (OTP verify, admin login): 30 / 15 min.
  - **Money/session-creating endpoints** (`/api/call/initiate`, wallet
    create-order, wallet verify-payment, vendor withdrawal, gift send): 40 /
    15 min.
  - **Everything else**: a general 240/min-per-IP ceiling, well above any
    legitimate app traffic pattern, that exists purely to blunt a scraper or a
    runaway retry loop. Socket.io's own polling and `/health` are exempted so
    they never count against it.
- Test: `npm run test:hardening` (`scripts/testHardening.js`) — boots the
  backend and asserts the security headers are present, gzip kicks in, the
  CORS allowlist behaves correctly for allowed/disallowed/no-origin requests,
  and — critically — that the 7th OTP request in a 15-minute window actually
  gets a 429 with a real deliberately-empty body (no live SMS sent during the
  test). 12/12 assertions pass.

### 5.5 Billing RPC — verified, not yet exported
`process_session_billing` still lives *only* inside the Supabase dashboard.
Could not export it without direct SQL-editor access (a Claude session has no
credential for that), but built `scripts/verifyBillingRpc.js`, which runs the
*real* deployed function against a throwaway customer/astrologer/session and
asserts the contract the rest of the codebase depends on: debits the right
amount, credits the astrologer + earnings counters, advances
`next_billing_at` by ~60s, refuses (returns falsy, charges nothing) when the
customer can't afford the next minute, never drives a balance negative, and
does not double-bill a minute that isn't due yet. **All 12 assertions
currently pass** — the deployed function is behaviorally correct as far as
this test can tell. It is still an unacceptable single point of failure
because it cannot be code-reviewed, diffed, or restored if lost. Exporting and
committing it is still open — needs a human with SQL editor access (see §7).

### Files added/modified this pass (for orientation, not exhaustive line diffs)
```
NEW   astrowani-backend/src/wallet.js
NEW   astrowani-backend/src/ttlCache.js
NEW   astrowani-backend/src/astrologerFanout.js
NEW   astrowani-backend/src/httpHardening.js
NEW   astrowani-backend/sql/hardening_03_atomic_wallet.sql
NEW   astrowani-backend/scripts/testWallet.js
NEW   astrowani-backend/scripts/testFanout.js
NEW   astrowani-backend/scripts/testHardening.js
NEW   astrowani-backend/scripts/verifyBillingRpc.js
MOD   astrowani-backend/index.js                  (wired all of the above in; removed dead /api/wallet/deduct-and-credit; JWT_SECRET boot guard; service-role-by-default client)
MOD   astrowani-backend/src/adminRoutes.js         (wallet ops routed through src/wallet.js; admin login rate-limited)
MOD   astrowani-backend/src/astroRoutes.js         (report-purchase debit routed through src/wallet.js)
MOD   astrowani-backend/src/sessionManager.js      (referral reward routed through src/wallet.js)
MOD   astrowani-backend/src/notificationRoutes.js  (JWT_SECRET fallback removed)
MOD   astrowani-backend/src/uploadRoutes.js        (JWT_SECRET fallback removed)
MOD   astrowani-backend/package.json               (new deps: express-rate-limit, helmet, compression; new npm test scripts)
NEW   astrowani_customer-main/src/hooks/useAstrologerListSync.js
MOD   astrowani_customer-main/src/screens/Home/Home.js     (Realtime sub -> hook)
MOD   astrowani_customer-main/src/screens/chat/Chat.js     (Realtime sub -> hook)
MOD   astrowani_customer-main/src/screens/Video/Video.js   (Realtime sub -> hook)
MOD   astrowani_customer-main/src/screens/Call/Call.js     (Realtime sub -> hook)
```
Also from an earlier pass the same day (before this hardening work started):
`JWT_SECRET` hardcoded fallback removed from all files that had it; backend's
main Supabase client switched from the anon key to the service-role key (this
was a *prerequisite* for §3.2's fix — using the anon key in the backend itself
meant any privilege revoked from `anon` would also break the backend);
`vps-deployment/scripts/deploy.sh` no longer writes a hardcoded weak secret
into a fresh `.env` template (generates a random one instead);
`scripts/dbHealthCheck.js` — a read-only script that checks for stuck
sessions, ledger drift, orphaned references, negative balances, stale pending
requests, unfinalized sessions, and public-key exposure; exits non-zero on any
critical finding so it can be scheduled/alerted on. Run: `npm run health`.

---

## 6. How to verify the current state yourself (read-only, safe)

```bash
cd astrowani-backend
npm run health              # scripts/dbHealthCheck.js — read-only, exits 1 on critical findings
npm test                    # runs wallet, billing, fanout, hardening test suites in sequence
```

### 6.1 Non-destructive way to re-check the anon-key exposure (§3.1) without inserting rows
```bash
node -e "
const U=process.env.SUPABASE_URL, A='sb_publishable_iLfw8Co1PiXDyYJZvzCRKw_5hQBKn_O';
fetch(U+'/rest/v1/customers?select=id&limit=1',{headers:{apikey:A,Authorization:'Bearer '+A}})
  .then(r=>console.log('customers readable by anon:', r.status===200));
"
```
`SUPABASE_URL` needs to be in the environment (it's in `astrowani-backend/.env`,
gitignored — ask the user, do not guess or invent one).

### 6.2 Every test/verification script writes and deletes its own throwaway rows
None of `scripts/testWallet.js`, `scripts/testFanout.js`,
`scripts/verifyBillingRpc.js` touch real customer/astrologer accounts — each
creates a uniquely-tagged (`{name}-{Date.now()}`) row, exercises it, then
deletes it in a `finally` block. If you write new verification scripts,
follow this pattern; never test money logic against a real account.

### 6.3 `DISABLE_SESSION_MANAGER=1`
Booting a local instance of the backend against the *real* production
Supabase credentials (which is what you want, since there's no staging
environment) will, if left default, start `sessionManager`'s background
loops — which **write to the live database**:
`checkEarningsResets()` zeroes `today_earnings` on every astrologer on a
schedule, and `markStaleRequestsMissed()` flips pending requests to
`'missed'`. Setting `DISABLE_SESSION_MANAGER=1` in the environment when
booting a local/test instance turns those loops off while leaving the HTTP API
(and the read-only Realtime fan-out subscription, which is safe) running.
**Never set this in the actual production deployment.**

---

## 7. What only the user can decide or provide — ask before proceeding on these

1. **Rotate `JWT_SECRET` on the production VPS.** The code now refuses to boot
   without a strong secret (guards against the exact known-weak value), but
   the *actual* production value has not been changed — that requires SSH/VPS
   access this session does not have. Generate with:
   `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`,
   set it in the VPS's env (wherever `SUPABASE_SERVICE_ROLE_KEY` etc. already
   live), restart the process. This signs every existing user out (30-day
   tokens) — expected, not a bug.

2. **Run the three hardening SQL files** in the Supabase SQL editor, in this
   order, reading each file's own section comments first (they're written to
   be run section-by-section, not blindly):
   - `sql/hardening_01_core_tables.sql` — indexes, foreign keys, CHECK
     constraints, uuid type conversion for currently-`text` id columns, an
     audit section to run first that reports what will be affected.
   - `sql/hardening_02_access_control.sql` — the `GRANT`/`REVOKE` lockdown of
     the `anon` role (§3.1/§3.2's actual fix). **Read it fully before
     running** — it will change what both apps can and cannot do directly
     against Supabase, and needs to be checked against current app behavior
     first (see §4, constraint 2).
   - `sql/hardening_03_atomic_wallet.sql` — the new wallet functions +
     `idempotency_key` columns (§5.1). Safe to run any time; the backend
     already tolerates its absence.

3. **Export and commit `process_session_billing`.** Run this in the Supabase
   SQL editor and save the output as `sql/process_session_billing.sql`:
   ```sql
   SELECT pg_get_functiondef(p.oid)
     FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'process_session_billing';
   ```

4. **What to do about the existing ₹5,865 ledger drift** (§3.5) — the fix in
   §5.1 stops *new* drift from accumulating; it does not correct the 3
   accounts already affected. That's a business decision (true up the
   accounts? investigate further first? write it off?), not something to
   silently "fix" with a script.

5. **Auth model decision** (referenced in §4): stay on the custom-JWT model
   forever (in which case column-level GRANT/REVOKE is the permanent access
   control strategy, not a stopgap), or migrate to Supabase Auth at some point
   (which would unlock real per-row RLS policies but is a significant
   undertaking touching both apps' login flows). No urgency to decide this
   week, but it should be a deliberate choice, not a default.

6. **Vendor app's own Realtime subscriptions** — not audited/converted in this
   pass (§5.3's "not yet done" note). Worth doing the same
   fan-out-consolidation treatment there.

7. **Supabase plan tier** — unknown at time of writing. If on the Free tier,
   there is no point-in-time recovery, meaning §3.1's exposure (anyone with
   the anon key could currently `DELETE` rows, though this document has not
   verified DELETE privileges specifically) has no undo. Worth confirming and
   upgrading if not already on a plan with backups/PITR, independent of
   everything else in this document.

---

## 8. Suggested next steps, roughly in priority order

1. Get the user to rotate `JWT_SECRET` in production (§7.1) — this is the
   cheapest, highest-leverage fix and blocks nothing else.
2. Walk through `sql/hardening_02_access_control.sql` with the user, section
   by section, checking each REVOKE against what the apps currently do (grep
   both app codebases for the affected tables/columns first).
3. Apply `hardening_01` and `hardening_03` (lower risk, less app-behavior
   coupling than `hardening_02`).
4. Export `process_session_billing` (§7.3) the next time someone has SQL
   editor access — takes 30 seconds once someone remembers to do it.
5. Decide what to do about the existing ledger drift (§7.4).
6. Convert the vendor app's Realtime subscriptions the same way the customer
   app's were (§7.6).
7. Re-run `npm run health` after each of the above and confirm the finding
   count drops.

---

## 9. A note on how to work in this codebase, generally

- **Prefer test-then-ship over ship-then-hope.** Every fix above shipped with
  its own throwaway-data test script in `scripts/`, run against the real
  Supabase project (there is no staging environment), and none of it was
  reported as done until those tests passed. Continue that pattern — it's
  what caught, for example, the fact that `formatAstrologer` reads a
  `profile_image` column on `astrologers` that doesn't actually exist (a
  pre-existing latent bug, unrelated to this work, left alone rather than
  scope-crept into a fix).
- **This repo has an internal Claude memory system** (referenced at the top —
  `memory/database_audit_20260807.md` and others) that a session with access
  to this specific Claude account can read for even more detail than fits
  here. A fresh account/session (which is apparently the situation this
  document is being written for) won't have that — this document is meant to
  be the substitute.
- **`CLAUDE.md` at the repo root** has a large "Data-layer audit 2026-08-07"
  section near the end that overlaps substantially with this document (it was
  written first, as a permanent project-memory note). If both exist when you
  read this, `CLAUDE.md` is the more likely to have drifted further from
  current reality since it's meant to accumulate indefinitely; this document
  is a point-in-time snapshot. Cross-check them against each other and
  against the actual code before trusting either blindly.
