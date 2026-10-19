#!/usr/bin/env node
// astrowani-backend/scripts/backupDatabase.js
//
//   node --env-file=.env scripts/backupDatabase.js [--dry-run] [--no-prune] [--keep-local]
//
// Takes an offsite backup of the Supabase Postgres database and puts it in Cloudflare R2.
// Run by systemd every 6 hours — see vps-deployment/backups/install.sh and its README.
//
// ─────────────────────────────────────────────────────────────────────────────────────────
// WHAT THIS PROTECTS AGAINST, because it decides every trade-off below:
// losing the Supabase ACCOUNT, PROJECT, or a single table. Not an outage — a standby would
// be the answer to that, and this is not one. Supabase Pro's own daily backups cover a
// mistake inside a healthy project; they do not survive losing the project, which is why
// these go to a different company.
//
// IT NEVER BOOTS index.js, and must not be changed to. index.js starts sessionManager's
// 30-second billing worker against the LIVE database (CLAUDE.md, memory
// `local-backend-bills-production`). This script only ever reads, through pg_dump.
//
// ─────────────────────────────────────────────────────────────────────────────────────────
// THE ORDER OF OPERATIONS IS THE DESIGN. Verify the PLAINTEXT, then encrypt, then verify the
// TRANSFER:
//
//   dump → verify contents (pg_restore --list + real row counts) → sha256
//        → encrypt → upload → re-download and compare sha256 → manifest → heartbeat → prune
//
// The plan this was built from said "re-download and run pg_restore --list". That is
// impossible once the file is encrypted with a key whose private half is deliberately NOT on
// this box — and putting the private key here would defeat the encryption entirely. So
// content is proven BEFORE encryption and transfer is proven AFTER it, by hash. The one
// thing that cannot be proven unattended is that the ciphertext still decrypts; that is
// exactly what the monthly restore drill is for, and why the drill is not optional.
//
// WHY A SIZE CHECK IS NOT A VERIFICATION: a pg_dump killed part-way leaves a plausible,
// wrong-sized file behind. So the archive's table of contents is parsed and compared against
// the live schema, and the rows of several tables are counted out of the archive itself.

const { spawnSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const storage = require('../src/backupStorage');
const retention = require('../src/backupRetention');

// Schemas that hold OUR state. Everything else in this project (`graphql`, `realtime`,
// `vault`, `extensions`) is provider-managed and is recreated by Supabase on a new project —
// dumping it produces restore errors that bury the real ones.
//   public              — the 74 tables, the 10 SECURITY DEFINER money functions
//   storage             — object METADATA. The bytes are not here; see §6 of the plan.
//   supabase_migrations — migration history, so a restored project knows what it has had
const SCHEMAS = ['public', 'storage', 'supabase_migrations'];

// Counted out of the archive and compared against the live database. Money and identity
// first: these are the tables whose loss is unrecoverable.
const SENTINELS = [
  'customers',
  'astrologers',
  'wallet_transactions',
  'vendor_wallet_transactions',
  'chat_sessions',
  'chat_messages',
  'admin_wallet',
];

// Taken from the retention module rather than restated here: that module both BUILDS run
// keys and PARSES them back, and a second copy of the prefix is how the writer and the
// pruner drift apart without anything erroring.
const PREFIX = retention.RUN_PREFIX;
const HEARTBEAT_KEY = `${PREFIX}/LATEST.json`;

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const DRY_RUN = flag('dry-run');
const NO_PRUNE = flag('no-prune');
const KEEP_LOCAL = flag('keep-local');

if (flag('help') || flag('h')) {
  console.log(`
Offsite database backup → Cloudflare R2.

  --dry-run     dump, verify and encrypt, but upload nothing and prune nothing.
                Use this for the FIRST run on a new box: it exercises every step that
                can fail locally without putting anything in the bucket.
  --no-prune    upload, but never delete an old backup.
  --keep-local  leave the working directory in place afterwards (it holds the PLAINTEXT
                dump — mobiles, bank details, every chat message. Delete it yourself.)
`.trim());
  process.exit(0);
}

const warnings = [];
const log = (msg) => console.log(`[backup] ${msg}`);
const warn = (msg) => { warnings.push(msg); console.log(`[backup] WARNING: ${msg}`); };
const die = (msg) => { console.error(`[backup] FAILED: ${msg}`); process.exit(1); };

/** A connection string is a password. Never let one reach a log, a manifest or an error. */
const redact = (s) => String(s || '').replace(/:\/\/([^:@/]+):[^@]*@/, '://$1:***@');

// ── Running things ──────────────────────────────────────────────────────────────────────

/**
 * libpq settings are passed to children through the ENVIRONMENT, never argv.
 *
 * On Linux /proc/<pid>/cmdline is world-readable by default, so `pg_dump "postgres://user:
 * password@host/db"` publishes the database password to every account on the box for as long
 * as the dump runs. /proc/<pid>/environ is 0400, owner-only. That is the whole reason this
 * function exists instead of passing the URL as an argument.
 */
function parseDbUrl(problems) {
  const url = process.env.BACKUP_DATABASE_URL || '';
  if (!url) {
    problems.push('BACKUP_DATABASE_URL is not set. Supabase → Project Settings → Database → '
      + 'Connection string → URI. NOTE: db.<ref>.supabase.co is IPv6-ONLY (measured — it has no '
      + 'A record), so if this box has no working IPv6 use the SESSION pooler on port 5432. '
      + 'The transaction pooler on 6543 does NOT work with pg_dump.');
    return null;
  }
  let u;
  try {
    u = new URL(url);
  } catch {
    problems.push('BACKUP_DATABASE_URL is not a valid URL. Expected postgresql://user:password@host:5432/postgres');
    return null;
  }
  if (!/^postgres(ql)?:$/.test(u.protocol)) problems.push(`BACKUP_DATABASE_URL has protocol ${u.protocol}, expected postgresql:`);
  if (!u.hostname) problems.push('BACKUP_DATABASE_URL has no host');
  if (!u.password) problems.push('BACKUP_DATABASE_URL has no password');
  if (u.port === '6543') {
    problems.push('BACKUP_DATABASE_URL points at port 6543, the TRANSACTION pooler. pg_dump '
      + 'cannot work through it. Use the session pooler (5432) or the direct host.');
  }
  return u;
}

function pgEnvFrom(u) {
  return {
    ...process.env,
    PGHOST: u.hostname,
    PGPORT: u.port || '5432',
    PGUSER: decodeURIComponent(u.username || 'postgres'),
    PGPASSWORD: decodeURIComponent(u.password),
    PGDATABASE: decodeURIComponent((u.pathname || '/postgres').replace(/^\//, '')) || 'postgres',
    // Fail rather than hang: a systemd job that blocks on a TCP connect holds the slot and
    // reports nothing. 30s is generous for a connect to Tokyo from Malaysia.
    PGCONNECT_TIMEOUT: process.env.BACKUP_CONNECT_TIMEOUT || '30',
    // Supabase requires TLS; be explicit so a misconfigured client cannot fall back.
    PGSSLMODE: process.env.BACKUP_PGSSLMODE || 'require',
  };
}

function run(cmd, cmdArgs, { env, allowFail = false, label } = {}) {
  const res = spawnSync(cmd, cmdArgs, {
    env: env || process.env,
    encoding: 'utf8',
    maxBuffer: 512 * 1024 * 1024,
  });
  if (res.error && res.error.code === 'ENOENT') {
    if (allowFail) return { ok: false, missing: true, stdout: '', stderr: '' };
    die(`${cmd} is not installed or not on PATH${label ? ` (needed to ${label})` : ''}`);
  }
  const ok = res.status === 0;
  if (!ok && !allowFail) {
    die(`${cmd} ${cmdArgs.filter((a) => !a.startsWith('--dbname')).join(' ')} exited ${res.status}\n${redact(res.stderr || '').trim()}`);
  }
  return { ok, status: res.status, stdout: res.stdout || '', stderr: res.stderr || '' };
}

/** One scalar out of the database. */
function psqlScalar(env, sql) {
  const res = run('psql', ['-X', '-q', '-A', '-t', '-c', sql], { env, label: 'query the database' });
  return res.stdout.trim();
}

// ── Preflight ───────────────────────────────────────────────────────────────────────────
// Everything that can be known before a byte is dumped is checked here, so a misconfigured
// box fails in two seconds with a sentence that says what to fix — rather than at the upload
// step, 40 seconds in, having left a plaintext dump in /tmp.

function preflight() {
  // ── Phase 1: everything knowable from the environment alone, reported TOGETHER ──────
  // All of it at once, deliberately. Checking these one at a time means a fresh box is
  // configured over three or four runs, each ending in a different single complaint. One
  // list is one trip to the env file.
  const problems = [];
  const u = parseDbUrl(problems);

  const recipient = (process.env.BACKUP_AGE_RECIPIENT || '').trim();
  const allowPlaintext = String(process.env.BACKUP_ALLOW_PLAINTEXT || '').toLowerCase() === 'true';
  let encrypt = true;
  if (!recipient) {
    if (allowPlaintext) {
      encrypt = false;
    } else {
      problems.push('BACKUP_AGE_RECIPIENT is not set. This dump contains bank details, phone '
        + 'numbers and every chat message; it is not uploaded unencrypted. Generate a key with '
        + '`age-keygen -o key.txt`, keep the PRIVATE half in the password manager AND offline, '
        + 'and set BACKUP_AGE_RECIPIENT to the public half (age1...). To override anyway set '
        + 'BACKUP_ALLOW_PLAINTEXT=true — do not do that for the real bucket.');
    }
  } else if (!/^age1[0-9a-z]+$/.test(recipient)) {
    problems.push('BACKUP_AGE_RECIPIENT does not look like an age PUBLIC key (expected age1...). '
      + 'A private key starts AGE-SECRET-KEY- and must never be on this box — if it is here, '
      + 'encrypting the backup protects nothing.');
  }

  if (!DRY_RUN && !storage.isConfigured()) {
    problems.push(`R2 is not configured — missing ${storage.missingConfig().join(', ')}. Set them `
      + 'with the set-backend-env.yml workflow (the deploy user cannot write the root-owned .env). '
      + 'Or pass --dry-run to exercise everything except the upload.');
  }

  if (problems.length) {
    console.error(`[backup] FAILED: ${problems.length} configuration problem(s):`);
    for (const p of problems) console.error(`\n  • ${p}`);
    console.error('\n  See vps-deployment/backups/README.md');
    process.exit(1);
  }

  if (!encrypt) warn('uploading UNENCRYPTED because BACKUP_ALLOW_PLAINTEXT=true');
  const env = pgEnvFrom(u);

  // ── Phase 2: the tools, and the server ──────────────────────────────────────────────
  // pg_dump must be at least the server's major version. It REFUSES outright against a
  // newer server, and Ubuntu's default postgresql-client is older than Supabase's
  // Postgres 17. This is the single most likely reason a fresh install does nothing.
  const vres = run('pg_dump', ['--version'], { allowFail: true });
  if (vres.missing) {
    die('pg_dump is not installed. Install postgresql-client-17 from the PGDG apt repo '
      + '(client only — no server, no listening port). See vps-deployment/backups/README.md');
  }
  const clientMajor = Number((vres.stdout.match(/(\d+)\./) || [])[1] || 0);
  if (!run('psql', ['--version'], { allowFail: true }).ok) die('psql is not installed (comes with postgresql-client-17)');

  const serverVersion = psqlScalar(env, 'show server_version');
  const serverMajor = Number((serverVersion.match(/(\d+)/) || [])[1] || 0);
  if (!serverMajor) die(`could not read the server version (got ${JSON.stringify(serverVersion)})`);
  if (clientMajor < serverMajor) {
    die(`pg_dump is ${clientMajor}.x but the server is ${serverMajor}.x — pg_dump will refuse. `
      + 'Install postgresql-client-' + serverMajor + '.');
  }

  // The age binary itself — the recipient was validated in phase 1, but a configured key
  // with no binary to use it would fail after the dump, leaving plaintext in the work dir.
  if (encrypt && !run('age', ['--version'], { allowFail: true }).ok) {
    die('age is not installed — see vps-deployment/backups/README.md');
  }

  return { env, encrypt, recipient, serverVersion, clientVersion: vres.stdout.trim() };
}

// ── Dump ────────────────────────────────────────────────────────────────────────────────

function dumpAll(env, workDir) {
  const schemaArgs = SCHEMAS.flatMap((s) => ['--schema', s]);
  const artifacts = [];

  // 1. The restorable thing. -Fc is compressed and lets pg_restore do selective and parallel
  //    restores; a plain .sql file can only ever be replayed start to finish, so recovering
  //    one accidentally-dropped table would mean restoring the whole database somewhere else
  //    first. Privileges are deliberately KEPT (no --no-privileges): months of hardening live
  //    in those grants, including the 15 anon SELECTs the apps still depend on.
  const dataPath = path.join(workDir, 'data.dump');
  log(`dumping ${SCHEMAS.join(', ')} → data.dump`);
  run('pg_dump', ['--format=custom', '--compress=9', '--no-owner', ...schemaArgs, '--file', dataPath], { env });
  artifacts.push({ name: 'data.dump', file: dataPath, contentType: 'application/octet-stream' });

  // 2. Schema only, every schema, plain SQL — human-readable and diffable. This is what
  //    tells a person WHAT CHANGED when something breaks, and how the money functions and
  //    grants would be rebuilt by hand if a custom archive were ever unreadable.
  const schemaPath = path.join(workDir, 'schema.sql');
  log('dumping full schema → schema.sql');
  run('pg_dump', ['--schema-only', '--no-owner', '--file', schemaPath], { env });
  artifacts.push({ name: 'schema.sql', file: schemaPath, contentType: 'text/plain' });

  // 3. Roles. pg_dump does NOT include them, and the grants inside artifact 1 reference
  //    anon / authenticated / service_role — a restore into a target lacking those roles
  //    fails on every GRANT. --no-role-passwords because we do not want Supabase's role
  //    password hashes in a backup, and the restore target invents its own.
  const globalsPath = path.join(workDir, 'globals.sql');
  log('dumping roles → globals.sql');
  const g = run('pg_dumpall', ['--globals-only', '--no-role-passwords', '--file', globalsPath], { env, allowFail: true });
  if (!g.ok) {
    // Supabase restricts some cluster-level reads. Losing the roles file degrades the
    // restore (they get created by hand from the README) but must not lose the data dump.
    warn(`pg_dumpall --globals-only failed (${g.status}); roles will have to be created by hand at restore time: ${redact(g.stderr).trim().split('\n')[0]}`);
  } else {
    artifacts.push({ name: 'globals.sql', file: globalsPath, contentType: 'text/plain' });
  }

  for (const a of artifacts) {
    const st = fs.statSync(a.file);
    if (!st.size) die(`${a.name} is empty`);
    a.plaintextBytes = st.size;
  }
  return artifacts;
}

// ── Verify the contents, before encrypting ──────────────────────────────────────────────

/**
 * Count the data rows for one table inside the custom-format archive.
 *
 * Relies on a real property of COPY's text format: every value's newlines are escaped as
 * \n, so one row is exactly one line. That is what makes line counting between the COPY
 * header and the terminating \. an accurate row count rather than an approximation.
 */
function rowsInArchive(file, table) {
  const res = run('pg_restore', ['--data-only', '--table', table, file], { allowFail: true });
  if (!res.ok) return null;
  const lines = res.stdout.split('\n');
  const start = lines.findIndex((l) => /^COPY .* FROM stdin;$/.test(l.trim()));
  if (start === -1) return null;
  let n = 0;
  for (let i = start + 1; i < lines.length; i += 1) {
    if (lines[i] === '\\.') break;
    n += 1;
  }
  return n;
}

function verifyContents(env, dataPath) {
  const toc = run('pg_restore', ['--list', dataPath], { label: 'verify the archive' }).stdout;
  const lines = toc.split('\n');
  // ' TABLE ' also appears in ' TABLE DATA ', hence the negative lookahead.
  const tocTables = lines.filter((l) => / TABLE (?!DATA)/.test(l)).length;
  const tocFunctions = lines.filter((l) => / FUNCTION /.test(l)).length;
  const tocTableData = lines.filter((l) => / TABLE DATA /.test(l)).length;

  // Expectations come from the LIVE database, not from a number written down here. A
  // hardcoded "74 tables" is wrong the day someone adds a table, and then either fails every
  // run or, worse, is quietly lowered until it asserts nothing.
  const inList = SCHEMAS.map((s) => `'${s}'`).join(',');
  const liveTables = Number(psqlScalar(env,
    `select count(*) from information_schema.tables where table_schema in (${inList}) and table_type='BASE TABLE'`));
  const liveFunctions = Number(psqlScalar(env,
    "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'"));
  const liveSecDef = Number(psqlScalar(env,
    "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prosecdef"));

  if (!liveTables) die('the live database reports 0 tables in the dumped schemas — refusing to trust this run');
  if (tocTables < liveTables) {
    die(`archive lists ${tocTables} tables but the database has ${liveTables} in ${SCHEMAS.join(', ')} — the dump is incomplete`);
  }
  if (tocFunctions < liveFunctions) {
    die(`archive lists ${tocFunctions} functions but public has ${liveFunctions} — the dump is incomplete`);
  }
  if (!tocTableData) die('archive contains no TABLE DATA entries at all — this is a schema-only dump');

  // Row counts, out of the archive, against the live table.
  const sentinels = [];
  for (const table of SENTINELS) {
    const live = Number(psqlScalar(env, `select count(*) from public.${table}`));
    const dump = rowsInArchive(dataPath, table);
    if (dump === null) {
      warn(`could not count rows for ${table} in the archive (table missing from the dump?)`);
      sentinels.push({ table, live, dump: null, ok: false });
      continue;
    }
    // The live count is taken AFTER the snapshot, so a busy table legitimately differs by a
    // few rows. The tolerance exists for that and nothing else — it is not there to paper
    // over a half-written dump, which fails the TOC checks above long before this.
    const tolerance = Math.max(10, Math.ceil(live * 0.02));
    const ok = Math.abs(dump - live) <= tolerance && (live === 0 || dump > 0);
    if (!ok) die(`${table}: archive holds ${dump} rows, database has ${live} (tolerance ${tolerance}) — refusing this backup`);
    sentinels.push({ table, live, dump, ok });
  }

  // A business invariant worth catching at backup time: CLAUDE.md DB — admin_wallet must
  // hold exactly one row. Zero means platform revenue is going unrecorded; more than one
  // means the balance alternates between rows and neither holds the true total. This is a
  // WARNING, not a failure: a sick database still needs backing up, and refusing to take a
  // backup because the data looks wrong is precisely the wrong moment to stop.
  const adminWallet = sentinels.find((s) => s.table === 'admin_wallet');
  if (adminWallet && adminWallet.dump !== null && adminWallet.dump !== 1) {
    warn(`admin_wallet holds ${adminWallet.dump} rows, expected exactly 1 (CLAUDE.md DB) — the backup is fine, the DATABASE needs looking at`);
  }

  log(`verified: ${tocTables} tables, ${tocFunctions} functions (${liveSecDef} SECURITY DEFINER live), ${tocTableData} with data`);
  return { tocTables, tocFunctions, tocTableData, liveTables, liveFunctions, liveSecDef, sentinels };
}

// ── Encrypt, hash, upload ───────────────────────────────────────────────────────────────

const sha256 = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

function encryptArtifacts(artifacts, recipient) {
  for (const a of artifacts) {
    a.plaintextSha256 = sha256(a.file);
    const out = `${a.file}.age`;
    run('age', ['--recipient', recipient, '--output', out, a.file], { label: 'encrypt the dump' });
    const st = fs.statSync(out);
    if (!st.size) die(`encrypting ${a.name} produced an empty file`);
    // age output must not be the plaintext. A misconfigured binary that copied the input
    // through would be invisible otherwise, and we would upload bank details in the clear
    // while the log said "encrypted".
    a.uploadFile = out;
    a.uploadName = `${a.name}.age`;
    a.uploadBytes = st.size;
    a.uploadSha256 = sha256(out);
    if (a.uploadSha256 === a.plaintextSha256) die(`${a.name}.age is byte-identical to the plaintext — age did not encrypt it`);
    const magic = fs.readFileSync(out).subarray(0, 21).toString('latin1');
    if (!magic.startsWith('age-encryption.org/')) die(`${a.name}.age does not start with the age header — refusing to upload`);
  }
}

function prepareUnencrypted(artifacts) {
  for (const a of artifacts) {
    a.plaintextSha256 = sha256(a.file);
    a.uploadFile = a.file;
    a.uploadName = a.name;
    a.uploadBytes = a.plaintextBytes;
    a.uploadSha256 = a.plaintextSha256;
  }
}

async function uploadAndVerify(artifacts, runPrefix) {
  for (const a of artifacts) {
    const key = `${runPrefix}/${a.uploadName}`;
    log(`uploading ${a.uploadName} (${(a.uploadBytes / 1048576).toFixed(2)} MB)`);
    await storage.put(key, fs.readFileSync(a.uploadFile), a.contentType);

    // Transfer verification. The content was verified before encryption; this proves the
    // bytes that arrived are the bytes that left. Re-downloading costs nothing on R2 (free
    // egress) and is the only way to know the object is readable rather than merely accepted.
    const h = await storage.head(key);
    if (!h.exists) die(`${key} is not there after uploading it`);
    if (h.bytes !== a.uploadBytes) die(`${key} is ${h.bytes} bytes in R2 but ${a.uploadBytes} locally`);
    const back = await storage.getBuffer(key);
    const backHash = crypto.createHash('sha256').update(back).digest('hex');
    if (backHash !== a.uploadSha256) die(`${key} hash mismatch after round trip — upload corrupted`);
    a.key = key;
    log(`  ✓ ${a.uploadName} verified in R2`);
  }
}

// ── Prune ───────────────────────────────────────────────────────────────────────────────

async function prune(allKeys) {
  // runsFromKeys ignores anything that is not `db/<timestamp>/...`, which is what keeps the
  // fixed-key heartbeat `db/LATEST.json` out of the prunable set.
  const runs = retention.runsFromKeys(allKeys);
  const decision = retention.classify(runs);
  log(`retention: ${runs.length} run(s) in R2 — ${decision.reason}`);
  if (decision.skipped || !decision.remove.length) return { deleted: 0, kept: decision.keep.length };

  let deleted = 0;
  for (const run of decision.remove) {
    const victims = allKeys.filter((k) => k.key.startsWith(`${run.prefix}/`));
    // Belt and braces against a classifier bug deleting a run it meant to keep.
    if (decision.keep.some((k) => k.prefix === run.prefix)) die(`refusing to prune ${run.prefix}: it is also in the keep set`);
    for (const v of victims) await storage.remove(v.key);
    deleted += victims.length;
  }
  log(`pruned ${decision.remove.length} run(s), ${deleted} object(s); kept ${decision.keep.length}`);
  return { deleted, kept: decision.keep.length };
}

// ── Main ────────────────────────────────────────────────────────────────────────────────

async function main() {
  const startedAt = new Date();
  // db/2026-10-20T043000Z — built by the same module that parses it back, so the key format
  // and the prune policy cannot drift apart.
  const runPrefix = retention.runKeyFor(startedAt);

  log(`starting${DRY_RUN ? ' (DRY RUN — nothing will be uploaded)' : ''}`);
  const { env, encrypt, recipient, serverVersion, clientVersion } = preflight();
  log(`server ${serverVersion} · ${clientVersion}`);

  const workDir = fs.mkdtempSync(path.join(process.env.BACKUP_WORK_DIR || os.tmpdir(), 'astrowani-backup-'));
  // The PLAINTEXT dump lives here for a few seconds. 0700 so no other account on the box can
  // read bank details out of /tmp while the job runs.
  fs.chmodSync(workDir, 0o700);

  let manifest = null;
  try {
    const artifacts = dumpAll(env, workDir);
    const verification = verifyContents(env, artifacts[0].file);

    if (encrypt) encryptArtifacts(artifacts, recipient);
    else prepareUnencrypted(artifacts);

    const finishedAt = new Date();
    manifest = {
      manifestVersion: 1,
      runPrefix,
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      durationMs: finishedAt - startedAt,
      serverVersion,
      clientVersion,
      schemas: SCHEMAS,
      encrypted: encrypt,
      ageRecipient: encrypt ? recipient : null, // a PUBLIC key; safe to record
      artifacts: artifacts.map((a) => ({
        name: a.uploadName,
        plaintextBytes: a.plaintextBytes,
        plaintextSha256: a.plaintextSha256,
        uploadBytes: a.uploadBytes,
        uploadSha256: a.uploadSha256,
      })),
      verification,
      warnings,
    };

    if (DRY_RUN) {
      log('dry run — skipping upload and prune');
      console.log(JSON.stringify(manifest, null, 2));
      return;
    }

    await uploadAndVerify(artifacts, runPrefix);

    // The manifest is NOT encrypted, on purpose: the heartbeat check and the restore runbook
    // both have to read it without the private key, which by design is not on this box. It
    // holds sizes, hashes and row counts — no customer data, no credentials.
    await storage.put(`${runPrefix}/manifest.json`, Buffer.from(JSON.stringify(manifest, null, 2)), 'application/json');

    // Heartbeat, at a FIXED key, so "how old is the newest good backup?" is one GET and does
    // not depend on the database being alive to answer. A backup_runs table would be inside
    // the very thing whose death we are trying to report.
    await storage.put(HEARTBEAT_KEY, Buffer.from(JSON.stringify({
      ok: true,
      runPrefix,
      finishedAt: manifest.finishedAt,
      encrypted: encrypt,
      bytes: artifacts.reduce((n, a) => n + a.uploadBytes, 0),
      rows: Object.fromEntries(verification.sentinels.map((s) => [s.table, s.dump])),
      warnings,
    }, null, 2)), 'application/json');

    if (!NO_PRUNE) await prune(await storage.list(`${PREFIX}/`));
    else log('pruning skipped (--no-prune)');

    log(`done in ${((Date.now() - startedAt) / 1000).toFixed(1)}s → ${runPrefix}`);
    if (warnings.length) log(`${warnings.length} warning(s) — see above`);
  } finally {
    if (KEEP_LOCAL) log(`working directory kept at ${workDir} — it holds the PLAINTEXT dump, delete it`);
    else fs.rmSync(workDir, { recursive: true, force: true });
  }
}

main().catch((err) => {
  // Non-zero exit is what systemd's OnFailure= hangs off. Never swallow one.
  console.error(`[backup] FAILED: ${redact(err && err.stack ? err.stack : err)}`);
  process.exit(1);
});
