# Offsite database backups → Cloudflare R2, and a restore we have actually tested

Written 2026-10-20, after the 2026-10-19 Supabase egress block (CLAUDE.md **EC**).
**This is a plan. Nothing in it is built yet.**

The goal is narrow and worth stating, because it is NOT the same as "survive an outage":
**if the Supabase account, project or a single table is lost, we can get the business back.**
That is the one failure class where no amount of uptime engineering helps and where the loss
is permanent. Supabase Pro's daily backups cover a mistake *inside* a healthy project; they
do not cover losing the project.

---

## 0. What we are protecting — measured 2026-10-20, not estimated

| | |
|---|---|
| Postgres | **17.6.1.127** (engine 17, GA) |
| Database size | **42 MB** |
| `public` schema | **74 tables**, 26 functions (**10 SECURITY DEFINER**), 2 sequences, 1 user trigger |
| Other schemas holding our state | `storage`, `supabase_migrations` |
| `auth.users` | **0** — we use our own JWT, so there is nothing in `auth` to lose |
| `anon`/`authenticated` grants in `public` | **15** (all SELECT; the rest were revoked in hardening 15–17) |
| Extensions | `pgcrypto`, `uuid-ossp`, `pg_stat_statements` (in schema `extensions`), `supabase_vault`, `plpgsql` |
| Storage | **763 objects across 3 buckets** — **NOT in a pg_dump** (see §6) |

Largest tables: `free_bot_chat_messages` (9,084 rows), `customers` (4,069), `chat_messages`
(3,117), `wallet_transactions` (2,280), `vendor_wallet_transactions` (2,247), `chat_sessions`
(1,333).

42 MB is the entire point. This is a small, cheap problem that has simply never been done.

---

## 1. THE FINDING THAT CHANGES THE SHAPE OF THIS PLAN

A restore is only as good as the app's ability to reach the restored database. Measured today:

```
astrowani_customer-main/src/api/SupabaseClient.js
  const SUPABASE_URL = 'https://fxpoustnddrgumhwdcma.supabase.co';
  const SUPABASE_ANON_KEY = 'sb_publishable_...';
```

**That URL is compiled into every installed APK, and both apps read the database directly**
(customer: 23 files, 16 Realtime subscriptions; vendor: `call_requests`, `chat_requests`,
`chat_sessions`, `notifications`, `astrologers`, plus 4 Realtime subscriptions on
`HomeScreen.js` — the incoming-call path).

So there are two restore destinations with very different outcomes:

| Restore into | Backend | Installed apps |
|---|---|---|
| **The same project** (dropped table, bad migration, bad data) | ✅ instant, the `.env` is already right | ✅ unaffected |
| **A NEW project** (account loss, project deleted) | ✅ one `.env` change + `pm2 restart` | ❌ **partially broken until a store release** — astrologer lists, vendor incoming-call Realtime and the other direct reads keep dialling a project that no longer exists |

**Therefore: backups fix "we lost the data." They do not fix "we lost the account." Only
removing the direct app→Supabase coupling fixes that.** Build the backups first — they are
cheap and they cap the worst case at *recoverable* — but do not file this as "disaster
recovery solved." It is half of it.

---

## 2. Design decisions, and why

### Where: Cloudflare R2
Already in use (OTA bundles, call recordings), free egress, 10 GB free, and
`astrowani-backend/src/objectStorage.js` already speaks S3/SigV4 via `aws4fetch` — **no new
npm dependency**. New private bucket `astrowani-db-backups`, and a **token scoped to that
bucket only**, following the rule already written into `objectStorage.js`: a leak of the OTA
or recordings token must not expose the backups. Env names matching the existing convention:
`R2_BACKUP_BUCKET`, `R2_BACKUP_ACCESS_KEY_ID`, `R2_BACKUP_SECRET_ACCESS_KEY`, reusing
`R2_ENDPOINT`. Written via **`set-backend-env.yml`** — the local `deploy` user cannot write
the root-owned `.env`.

> **R2 is a different company from Supabase, and that is the whole value.** A backup inside
> the same provider as the thing it protects does not protect against losing that provider.

### Where NOT: the VPS
A copy on the VPS is fine as a convenience and worthless as a backup — the VPS is already the
single point of failure for backend + Socket.io + coturn + OTP + billing (CLAUDE.md **DN**,
with a ~13 h outage precedent). Keep one local copy for fast restores, treat R2 as the real one.

### Frequency: every 6 hours
Worst-case data loss (RPO) of 6 hours. Chosen because what we would lose is
`wallet_transactions`, `vendor_wallet_transactions` and `chat_sessions` — money — and a
24-hour RPO on money is not acceptable. 42 MB compresses to roughly 8–12 MB, so 4 runs/day is
~40 MB/day. Low-traffic IST slots, **jittered**, as the blog-agent timers already are.

### Format: three artifacts per run, not one

| Artifact | Command shape | Why separate |
|---|---|---|
| **Data + schema** | `pg_dump -Fc --schema=public --schema=storage --schema=supabase_migrations` | The restorable thing. `-Fc` is compressed and lets `pg_restore` do selective and parallel restores — a plain `.sql` file cannot restore one table |
| **Schema only, plain SQL** | `pg_dump -s` (all schemas) | Human-readable and `git diff`-able. This is what tells us *what changed* when something breaks, and how we would rebuild the 10 SECURITY DEFINER money functions and the 15 grants by hand if a custom archive were ever unreadable |
| **Roles / globals** | `pg_dumpall --globals-only --no-role-passwords` | `pg_dump` does not include roles. The grants inside the dump reference `anon`, `authenticated`, `service_role` — a restore into a target lacking them fails (§4) |

Privileges are deliberately **kept** (`--no-privileges` is NOT used). Months of hardening work
lives in those grants; a restore that silently dropped them would also drop the 15 SELECTs the
apps still depend on, and we would be debugging a dead app instead of reading a plan.

### Encryption: client-side, before upload
The dump contains mobiles, wallet balances, **astrologer bank accounts and UPI ids**, and every
chat message. R2 encrypts at rest, but our R2 credentials sit on the same VPS as the dump — so
server-side encryption protects us from Cloudflare employees and from nobody else.

Encrypt with **`age`** (one small static binary; one public key on the VPS, nothing secret on
the box). A leaked VPS *and* a leaked R2 token still yields unreadable files.

> ⚠️ **The private key now becomes a thing that can destroy the backups.** It goes into the
> password manager **and** offline, before the first encrypted upload. A lost key means every
> backup is noise. This risk is accepted knowingly — the alternative is shipping bank details
> and chat logs to a third party in plaintext.

### Retention: 14 daily · 8 weekly · 12 monthly
≈ 34 archives ≈ **under 500 MB**, comfortable inside the 10 GB free tier alongside the 261 MB
of OTA bundles. Monthlies matter for the slow disasters — a corruption or bad migration noticed
six weeks later.

> ⚠️ **A retention policy with a broken producer is a deletion policy.** An R2 lifecycle rule
> would cheerfully expire everything while the uploader had been failing for a fortnight. So
> pruning happens **in the script, after a verified upload, never below a floor** (refuse to
> prune if fewer than N verified archives exist). Same instinct as the OTA bundle prune in
> **EC**: prune by reference and proof, never by age alone.

---

## 3. Connecting — two measured traps

**Trap 1: `pg_dump` must be version ≥ 17.** The server is 17.6; Ubuntu's default
`postgresql-client` is older and `pg_dump` **refuses outright** against a newer server. Fix is
the PGDG apt repo and `postgresql-client-17` — **client only**, no server, no listening port,
no new attack surface. *Step 0 of the build is to check what the VPS actually has.*

**Trap 2: the direct database host is IPv6-only.** Measured today:

```
db.fxpoustnddrgumhwdcma.supabase.co   A    → (none)
                                      AAAA → 2406:da14:311:1500:...
```

There is **no A record**. CLAUDE.md **DN** records IPv6 as working on the VPS, so this will
probably just work — but if it does not, the fallback is the **Session Pooler** (IPv4, port
5432). It must be the *session* pooler: **`pg_dump` does not work through the transaction-mode
pooler on 6543.** A dump that fails only when IPv6 is flaky, at 04:00, is exactly the failure
nobody notices.

**Prerequisite from the owner:** the **Postgres password** (Supabase → Project Settings →
Database). The service-role key is an API key and cannot do this; it also cannot run DDL
(memory `local-backend-bills-production`).

**Useful property observed during the 2026-10-19 block:** the direct Postgres port kept
answering while the REST gateway returned 402 — so backups would have continued through a
restriction. Good to know; not something to design around.

---

## 4. The restore drill — the part that makes this a backup instead of a file

> An untested dump is not a backup. It is a 10 MB file with a reassuring name.

### Tier 1 — every single run, automatic (seconds)
After upload, re-download and run **`pg_restore --list`**. This parses the archive's table of
contents and fails on a truncated or corrupt file. It catches the common silent failure: a
`pg_dump` killed partway still leaves a plausible, wrong-sized file behind. Then assert the
archive lists **74 tables** and **26 functions**, plus expected row counts for a handful of
sentinel tables. **A size check alone would pass on a dump missing half the database.**

### Tier 2 — monthly, a human, a real restore into a real Postgres (~30 min)
Restore the newest archive into a throwaway Postgres 17 and verify the business, not the file.

**Where:** this machine has **no Docker, no psql, no pg_dump** (checked 2026-10-20). So either
install PostgreSQL 17 for Windows locally (which also gives us a matching client, useful
anyway), or use a free throwaway Postgres elsewhere. Either way: **never the production VPS,
never a Supabase project that matters.**

**The restore into plain Postgres WILL fail without a prelude, and that is the most valuable
thing this drill teaches.** It needs, first:
- the roles the grants reference — `anon`, `authenticated`, `service_role`, `supabase_admin`
  (from the globals artifact);
- `CREATE SCHEMA extensions`, plus `pgcrypto` and `uuid-ossp` **in that schema**, because that
  is where they live here and function bodies resolve against it;
- `supabase_vault` and the `realtime`/`graphql` schemas do **not** exist outside Supabase —
  those are expected failures, and the drill's job is to know exactly which errors are benign.

**What the drill asserts — business facts, not "no errors":**
1. `admin_wallet` holds **exactly one row** (CLAUDE.md **DB**: zero means platform revenue goes
   unrecorded; more than one means the balance alternates between rows).
2. Wallet arithmetic reconciles: `customers.wallet_balance` against the sum of
   `wallet_transactions`, and the same on the vendor side.
3. All **10 SECURITY DEFINER** functions exist **and pin `search_path`**.
4. `process_session_billing` **runs** against a synthetic session inside a transaction that is
   then **aborted**, and splits 50/50 with the halves summing exactly to the charge.
5. The **15** `anon`/`authenticated` SELECT grants are present and **no write grant is** — a
   restore that quietly re-granted writes would undo hardening 15–17, and Supabase's own
   default privileges are known to re-open exactly that (**CT**).
6. Row counts match the source within the window.

**Record the wall-clock time of the drill.** "We have backups" is worth little; "we are serving
customers again 40 minutes after a total loss" is the actual deliverable, and the only way to
know that number is to have done it once.

---

## 5. Knowing it ran — the circular-dependency trap

A `backup_runs` table inside the database being backed up cannot record that the database is
unreachable. So:

- **systemd `OnFailure=`** → an alert. The blog-agent units already establish the pattern
  (`vps-deployment/blog-agent/install.sh`), including `Persistent=true` so a slot missed across
  a reboot still runs, and `Nice` / `IOSchedulingClass=idle` so the job always loses the
  contest for the single core against live calls and chat.
- **A heartbeat marker object in R2** written on success; the backend exposes **"age of newest
  verified backup"** and the admin dashboard shows it. R2 is outside the failure domain, so
  this answers correctly even when Postgres is dead.
- **Alert on staleness, not on failure.** A job that stops being scheduled never fails — it
  just goes quiet, and quiet-and-healthy looks identical from outside. The alarm must be
  "newest backup older than 8 hours," which fires either way. (Same lesson as
  `astrologerFanout`'s 5-minute relayed/skipped line.)

While we are here: **Supabase usage alerts at 50/75/90%**. That — not backups — is what would
have prevented 2026-10-19.

---

## 6. Storage files are not in the dump (763 objects)

`pg_dump` captures `storage.objects` **metadata**, not bytes. After a database-only restore,
every row would point at files that no longer exist — profile photos, chat images, remedy and
banner art, blog thumbnails.

Separate, lower-priority leg: a **daily incremental sync of the `app-images` bucket to R2**
(skip unchanged keys by size/etag), **unencrypted** — it is already a *public* bucket, so
encrypting it protects nothing and would only break the sync's ability to compare. Call
recordings are already in R2. Deliberately **phase 2**: losing images is visible and
embarrassing, losing `wallet_transactions` is unrecoverable.

---

## 7. Build order

| | Step | Effort |
|---|---|---|
| 1 | Owner: create the R2 bucket + scoped token; fetch the Postgres password; generate and **safely store** the `age` key | 20 min, owner |
| 2 | Check the VPS: `pg_dump` version, IPv6 reachability to the DB host | 10 min |
| 3 | `postgresql-client-17` + `age` on the VPS | 10 min |
| 4 | The backup script: dump × 3 → verify (`pg_restore --list` + counts) → encrypt → upload → prune with a floor | half a day |
| 5 | systemd service + 6-hourly jittered timer + `OnFailure`, modelled on the blog-agent install | 1–2 h |
| 6 | Heartbeat object + "last backup age" in admin | 2 h |
| 7 | **Tier-2 restore drill, done once, by hand, timed, and written up here** | half a day |
| 8 | Supabase usage alerts at 50/75/90% | 30 min |
| 9 | *Phase 2:* `app-images` → R2 daily sync | half a day |

Steps 1–7 are the real deliverable. **Step 7 is not optional** — until it has been done once,
we do not have backups, we have hope. Everything here is free.

---

## 8. Explicitly out of scope
- Surviving a Supabase **outage** (class B) — that needs the warm standby, which needs the app
  decoupling first.
- Automatic failover. Nothing free gets there without a human in the loop.
- Fixing the hardcoded Supabase URL in installed APKs — §1. It is the ceiling on what any
  restore can achieve, and it is a separate job.
