# Offsite database backups — operator guide

Every 6 hours the VPS dumps the Supabase Postgres database, verifies it, encrypts it and
puts it in Cloudflare R2. Written 2026-10-20 after the 2026-10-19 egress block
(CLAUDE.md **EC**). Plan: [`MD files/backup-and-restore-plan.md`](../../MD%20files/backup-and-restore-plan.md).

**What this protects against:** losing the Supabase **account**, **project**, or a single
table. **Not** an outage — that needs a standby, and this is not one. Supabase Pro's own
daily backups cover a mistake inside a healthy project; they do not survive losing the
project, which is why these go to a different company.

| | |
|---|---|
| Job | `astrowani-backend/scripts/backupDatabase.js` |
| Schedule | `astrowani-db-backup.timer` — 00:30, 06:30, 12:30, 18:30 IST, ±15 min jitter |
| Destination | R2 bucket `astrowani-db-backups`, keys `db/<ISO>Z/...` |
| Heartbeat | `db/LATEST.json` — fixed key, unencrypted, readable without the private key |
| Retention | all runs <48 h · 14 daily · 8 weekly · 12 monthly (~36 runs, <500 MB) |
| Encryption | `age`, to a public key. **The private key is not on the VPS.** |

---

## Setup

### 1. Cloudflare R2 (owner)
Create a **private** bucket `astrowani-db-backups` and an API token scoped to **that bucket
only**, with **Object Read & Write** (Read as well as Write: the job re-downloads what it
uploaded to prove the bytes arrived, and pruning lists before it deletes).

> A separate token from the OTA and call-recording ones, deliberately. This bucket holds
> every customer mobile, every astrologer's bank account and UPI id, and every chat message,
> in one file. A token that can read it must not be reachable from a token that only needs
> to serve an OTA bundle.

### 2. The encryption key (owner) — read this part twice
```bash
age-keygen -o astrowani-backup-key.txt     # run this ANYWHERE EXCEPT the VPS
```
It prints a **public key** (`age1...`) and writes the file containing the **private key**
(`AGE-SECRET-KEY-...`).

- The **public** key goes in the VPS `.env` as `BACKUP_AGE_RECIPIENT`.
- The **private** key goes in the **password manager** *and* somewhere offline (printed,
  or a USB stick in a drawer). It must **never** be on the VPS — if it were, encrypting the
  backup would protect nothing, since the R2 credentials are on that same box.

> ⚠️ **Losing the private key makes every backup permanently unreadable.** This is a real
> new way to lose everything, accepted knowingly: the alternative is shipping bank details
> and every chat message to a third party in plaintext. Store it before the first run.

The job refuses to start if `BACKUP_AGE_RECIPIENT` looks like a private key.

### 3. The connection string (owner)
Supabase → Project Settings → Database → Connection string → **URI**. Set it as
`BACKUP_DATABASE_URL`.

> **Two measured traps.** `db.fxpoustnddrgumhwdcma.supabase.co` has **no A record — it is
> IPv6-only** (checked 2026-10-20). CLAUDE.md **DN** records IPv6 as working on this VPS, so
> it should be fine; if it is not, use the **session** pooler on port **5432**. It must not be
> the **transaction** pooler on **6543** — `pg_dump` cannot work through it, and the job
> rejects that port with an explicit message rather than failing obscurely.

### 4. Write the env (owner)
Via the **`set-backend-env.yml`** GitHub Action — the local `deploy` user cannot write the
root-owned `.env`. Add to the allowlist and set:

```
BACKUP_DATABASE_URL           postgresql://postgres:<password>@db.<ref>.supabase.co:5432/postgres
BACKUP_AGE_RECIPIENT          age1...            (PUBLIC key)
R2_BACKUP_BUCKET              astrowani-db-backups
R2_BACKUP_ACCESS_KEY_ID       <scoped token id>
R2_BACKUP_SECRET_ACCESS_KEY   <scoped token secret>
```
`R2_ENDPOINT` is already set (shared with call recordings).

### 5. Install
```bash
sudo bash vps-deployment/backups/install.sh --with-deps
```
`--with-deps` adds the PGDG apt repo and installs `postgresql-client-17` (**client only** —
no server, no listening port) and `age`. Omit it if they are already there.

### 6. Prove it, in this order
```bash
cd /var/www/astrowani-monorepo/astrowani-backend
node --env-file=.env scripts/backupDatabase.js --dry-run   # dumps + verifies, uploads nothing
sudo systemctl start astrowani-db-backup.service           # a real run
journalctl -u astrowani-db-backup.service -n 60 --no-pager
```
Then **do the restore drill below.** Until it has been done once, this is not a backup.

---

## What a run actually does

```
dump ×3 → verify CONTENTS → sha256 → encrypt → upload → verify TRANSFER → manifest → heartbeat → prune
```

**Why verification is split either side of the encryption:** once the file is encrypted to a
key whose private half is deliberately not on the box, the VPS *cannot* decrypt it to check
it. So contents are proven **before** encryption and the transfer is proven **after** it, by
comparing a SHA-256 of the re-downloaded ciphertext. The one thing that cannot be proven
unattended is that the ciphertext still decrypts — which is precisely what the drill is for.

**Three artifacts per run:**

| File | What it is |
|---|---|
| `data.dump.age` | `pg_dump -Fc` of `public`, `storage`, `supabase_migrations`. The restorable thing. Compressed, and supports restoring **one table** — which a plain `.sql` file cannot |
| `schema.sql.age` | schema-only, every schema, plain SQL. Human-readable and diffable: this is what says *what changed*, and how the money functions and grants would be rebuilt by hand |
| `globals.sql.age` | roles. `pg_dump` does **not** include them, and the grants inside `data.dump` reference `anon` / `authenticated` / `service_role` |

**Contents verification — not a size check.** A `pg_dump` killed part-way leaves a plausible,
wrong-sized file. So the job:
- parses the archive's table of contents and requires **at least** as many tables and
  functions as the live database reports (expectations read from the database, never
  hardcoded — a written-down "74" is wrong the day someone adds a table);
- counts the **actual rows** of `customers`, `astrologers`, `wallet_transactions`,
  `vendor_wallet_transactions`, `chat_sessions`, `chat_messages` and `admin_wallet` out of
  the archive and compares each against the live table (small tolerance, because the live
  count is taken after the snapshot);
- checks `age` produced something that is not byte-identical to the plaintext and does start
  with the `age-encryption.org/` header — otherwise a misconfigured binary that copied the
  input through would have us uploading bank details in the clear while the log said
  "encrypted";
- **warns** (does not fail) if `admin_wallet` does not hold exactly one row — CLAUDE.md **DB**.
  A sick database still needs backing up; refusing a backup because the data looks wrong is
  exactly the wrong moment to stop.

**The database password is passed to `pg_dump` through the environment, never argv**, because
`/proc/<pid>/cmdline` is world-readable by default on Linux while `/proc/<pid>/environ` is
owner-only. It is also redacted from every log line and error.

---

## Checking on it

```bash
systemctl list-timers astrowani-db-backup.timer          # when it next runs
journalctl -u astrowani-db-backup.service -n 60          # the last run
cat /var/lib/astrowani-backup/failures.log               # failures, independent of the DB
```
Newest backup, without needing the private key — download `db/LATEST.json` from the bucket:
```json
{ "ok": true, "runPrefix": "db/2026-10-20T043000Z", "finishedAt": "...", "rows": { "customers": 4069 } }
```

> **Alert on STALENESS, not on failure.** A job that stops being *scheduled* never fails —
> it goes quiet, and quiet-and-healthy looks identical from outside. The alarm that matters
> is "newest backup is older than 8 hours", which fires either way. (Step 6 of the plan:
> surface this in the admin dashboard.)

---

## Retention, and the trap it is built around

> **A retention policy with a broken producer is a deletion policy.** An R2 lifecycle rule
> would cheerfully expire everything while the uploader had been failing for a fortnight.

So pruning happens in the job, after a verified upload, and:
1. **nothing is pruned below 8 runs**, whatever the ages say;
2. the **newest run is kept unconditionally**, outside every other rule;
3. the policy is **idempotent** — re-running it on its own kept set deletes nothing more. A
   non-idempotent policy erodes the archive slightly on every run, which looks fine right up
   until one copy is left;
4. tiers are capped by **distinct buckets, not elapsed time**, so a fortnight the job spent
   broken still leaves 14 days of restorable backups rather than none;
5. a run whose timestamp cannot be parsed is **kept**, never deleted, and does not count
   towards the floor.

Covered by `scripts/testBackupRetention.js` (68 checks, offline). It was verified to **fail**
on four deliberately introduced regressions — defeating the floor, dropping the
newest-run guarantee, pruning unparseable keys, and capping tiers by wall-clock. That drill
also found a real crash in the module, which is why it is worth repeating after any edit.

---

## The restore runbook

**Run the drill monthly.** Record the wall-clock time it takes — "we have backups" is worth
little; "we are serving customers again 40 minutes after a total loss" is the deliverable.

### Get the files
```bash
# any machine with the R2 token; endpoint/bucket as in .env
aws s3 cp --endpoint-url "$R2_ENDPOINT" "s3://astrowani-db-backups/db/<RUN>/data.dump.age" .
age --decrypt -i astrowani-backup-key.txt -o data.dump data.dump.age
pg_restore --list data.dump | head          # sanity: the TOC is readable
```

### A. One table back into the live project (the common case)
A dropped or corrupted table, everything else healthy.
```bash
pg_restore --data-only --table=<table> --dbname="$BACKUP_DATABASE_URL" data.dump
```
Take a fresh backup **first** (`systemctl start astrowani-db-backup.service`), and consider
restoring into a differently-named table to compare before overwriting anything.

### B. Everything, into a NEW Supabase project (account loss)
1. Create the project. Run `globals.sql` first, or the `GRANT`s have no roles to grant to.
2. `CREATE SCHEMA IF NOT EXISTS extensions;` then create `pgcrypto` and `uuid-ossp`
   **in that schema** — that is where they live here, and function bodies resolve against it.
3. `pg_restore --no-owner --dbname=<new> data.dump`
4. **Expected, benign errors:** anything about `supabase_vault`, `realtime`, `graphql`, or
   roles Supabase manages itself. Knowing which errors are benign is most of what this drill
   buys you — read them once now, not during an outage.
5. Repoint the backend: `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` in the VPS `.env`, then
   `pm2 restart astrowani-backend --update-env`.

> ⚠️ **The installed apps will NOT fully recover from B without a store release.** The
> Supabase URL and anon key are hardcoded in `astrowani_customer-main/src/api/SupabaseClient.js`
> and compiled into every APK, and both apps read the database directly — including the
> vendor app's incoming-call Realtime subscriptions. The backend recovers in one `.env`
> change; the apps keep dialling a project that no longer exists. Removing that coupling is
> a separate job and it is the ceiling on what any restore here can achieve. See §1 of the plan.

### C. The drill itself — restore to a throwaway Postgres and check the business
Never the production VPS, never a Supabase project that matters. Then assert:

1. `select count(*) from admin_wallet` → **exactly 1** (CLAUDE.md **DB**).
2. `customers.wallet_balance` reconciles against the sum of `wallet_transactions`; same on
   the vendor side.
3. All **10** SECURITY DEFINER functions exist **and pin `search_path`**:
   ```sql
   select proname, proconfig from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.prosecdef;
   ```
4. `process_session_billing` **runs** against a synthetic session inside a transaction you
   then **ABORT**, and splits 50/50 with the halves summing exactly to the charge.
5. The **15** `anon`/`authenticated` SELECT grants are present and **no write grant is** —
   a restore that quietly re-granted writes would undo hardening 15–17, and Supabase's own
   default privileges are known to re-open exactly that (CLAUDE.md **CT**):
   ```sql
   select grantee, privilege_type, count(*) from information_schema.role_table_grants
   where table_schema='public' and grantee in ('anon','authenticated')
   group by 1,2 order by 1,2;
   ```
6. Row counts match the manifest for that run.

---

## Known gaps

- **Storage files are not in the dump.** `pg_dump` captures `storage.objects` *metadata*, not
  bytes — 763 objects (profile photos, chat images, remedy and banner art, blog thumbnails)
  are **not** backed up. Phase 2 of the plan is a daily `app-images` → R2 sync. Call
  recordings are already in R2.
- **No automatic failover.** Nothing here reduces downtime during a Supabase *outage*.
- **The app coupling in §1** caps what restore B can achieve.
- **The dump/encrypt/upload path has not yet run anywhere.** It was written on a Windows
  machine with no `pg_dump`, `psql` or `age` installed, so only the preflight refusals and
  the retention policy are exercised by tests. **The `--dry-run` on the VPS is the first
  real test of it** — do that before relying on the timer.
