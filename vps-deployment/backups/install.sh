#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Install the offsite database backup schedule on the VPS. Idempotent — safe to re-run.
#
#   sudo bash vps-deployment/backups/install.sh
#
# WHAT IT INSTALLS
#  - astrowani-db-backup.service        — one backup run (oneshot)
#  - astrowani-db-backup.timer          — every 6 hours, IST, jittered
#  - astrowani-db-backup-failed.service — OnFailure handler; records the failure where
#                                         it can be found without the database
#
# It does NOT install postgresql-client or age; pass --with-deps for that (see below), or
# install them yourself. It does not write any secret — those go in the backend .env via
# the set-backend-env.yml GitHub Action, because the local deploy user cannot write that
# root-owned file.
#
# WHY SYSTEMD TIMERS AND NOT CRON — same reasons as the blog agent, and one more that
# matters more here:
#  - `Persistent=true` runs a slot missed while the box was down. Cron silently skips it,
#    and a reboot during the 04:30 slot would mean no backup that night with nothing
#    anywhere saying so.
#  - `OnFailure=` can react. A failed backup that nobody hears about is the same as no
#    backup at all, except that it feels safe.
#  - `systemctl status` / `journalctl -u` give the exit code and full log of the last
#    attempt. Cron gives a mail nobody reads.
#
# WHY EVERY 6 HOURS: what we would lose in a gap is wallet_transactions,
# vendor_wallet_transactions and chat_sessions — money. A 24-hour worst case on money is
# not acceptable; 6 hours is. The database is 42 MB and compresses to roughly a tenth of
# that, so four runs a day is a rounding error against the 10 GB free tier.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

REPO_DIR="${REPO_DIR:-/var/www/astrowani-monorepo}"
BACKEND_DIR="$REPO_DIR/astrowani-backend"
NODE_BIN="${NODE_BIN:-$(command -v node)}"
RUN_USER="${RUN_USER:-root}"
STATE_DIR="/var/lib/astrowani-backup"
WITH_DEPS=0
[ "${1:-}" = "--with-deps" ] && WITH_DEPS=1

if [ "$(id -u)" -ne 0 ]; then
  echo "ERROR: run with sudo — this writes unit files under /etc/systemd/system." >&2
  exit 1
fi
if [ ! -d "$BACKEND_DIR" ]; then
  echo "ERROR: $BACKEND_DIR not found. Set REPO_DIR= if the checkout is elsewhere." >&2
  exit 1
fi
if [ ! -f "$BACKEND_DIR/.env" ]; then
  echo "ERROR: $BACKEND_DIR/.env not found. The job reads BACKUP_DATABASE_URL," >&2
  echo "       BACKUP_AGE_RECIPIENT and the R2_BACKUP_* keys from it." >&2
  exit 1
fi
if [ -z "$NODE_BIN" ]; then
  echo "ERROR: node not found on PATH. Set NODE_BIN=/path/to/node." >&2
  exit 1
fi

echo "repo:  $REPO_DIR"
echo "node:  $NODE_BIN ($($NODE_BIN --version))"
echo "user:  $RUN_USER"

# ── Dependencies (opt-in) ───────────────────────────────────────────────────
# pg_dump must be at least the SERVER's major version — Supabase runs Postgres 17 and
# Ubuntu's default postgresql-client is older, in which case pg_dump refuses outright.
# This installs the CLIENT only: no server, no listening port, no new attack surface.
if [ "$WITH_DEPS" -eq 1 ]; then
  echo
  echo "installing postgresql-client-17 and age ..."
  install -d -m 0755 /usr/share/postgresql-common/pgdg
  curl -fsSL -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc \
    https://www.postgresql.org/media/keys/ACCC4CF8.asc
  echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] \
http://apt.postgresql.org/pub/repos/apt $(. /etc/os-release && echo "$VERSION_CODENAME")-pgdg main" \
    > /etc/apt/sources.list.d/pgdg.list
  apt-get update -qq
  apt-get install -y --no-install-recommends postgresql-client-17 age
fi

for tool in pg_dump psql age; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    echo "WARNING: $tool is not on PATH — the job will refuse to run. Re-run with --with-deps." >&2
  fi
done
if command -v pg_dump >/dev/null 2>&1; then echo "pg_dump: $(pg_dump --version)"; fi

install -d -m 0750 "$STATE_DIR"

# ── The failure handler ─────────────────────────────────────────────────────
# Writes the failure somewhere that does NOT depend on the database being alive. A
# backup_runs table would be inside the very thing whose death we are trying to report,
# which is the circular dependency this whole subsystem exists to avoid.
cat > /etc/systemd/system/astrowani-db-backup-failed.service <<UNIT
[Unit]
Description=Astrowani database backup — record a failure

[Service]
Type=oneshot
ExecStart=/bin/sh -c 'date -Is >> $STATE_DIR/failures.log; \
journalctl -u astrowani-db-backup.service -n 40 --no-pager >> $STATE_DIR/failures.log; \
echo "---" >> $STATE_DIR/failures.log'
UNIT

# ── The service ─────────────────────────────────────────────────────────────
cat > /etc/systemd/system/astrowani-db-backup.service <<UNIT
[Unit]
Description=Astrowani offsite database backup → Cloudflare R2
Documentation=file://$REPO_DIR/vps-deployment/backups/README.md
# The job's first act is a TCP connect to Supabase. Starting before the network is
# genuinely usable would record a real failure for a box that was merely still booting.
After=network-online.target
Wants=network-online.target
OnFailure=astrowani-db-backup-failed.service

[Service]
Type=oneshot
User=$RUN_USER
WorkingDirectory=$BACKEND_DIR
# --env-file is how every other scheduled job here is run, and it keeps the secrets in the
# root-owned .env rather than in a systemd unit, which is world-readable.
ExecStart=$NODE_BIN --env-file=$BACKEND_DIR/.env $BACKEND_DIR/scripts/backupDatabase.js
# A dump of 42 MB takes seconds; this ceiling is for a slow or flapping link to Tokyo, not
# for a slow dump. The process exits on its own when it finishes, so a generous limit costs
# nothing, while being killed mid-upload leaves a partial object that the next run's
# verification would have to notice.
TimeoutStartSec=1800
# The backend shares this single core and serves live calls and chat (CLAUDE.md DN). A
# backup must ALWAYS lose that contest — a consultation dropping because a backup was
# running would be a self-inflicted outage.
Nice=15
IOSchedulingClass=idle
CPUSchedulingPolicy=batch
# The PLAINTEXT dump — mobiles, bank details, every chat message — lives in a temp dir for
# a few seconds. PrivateTmp gives the unit its own /tmp that systemd destroys on exit, so a
# crash between dumping and cleanup cannot leave it readable on the box.
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
NoNewPrivileges=true
ReadWritePaths=$STATE_DIR
StandardOutput=journal
StandardError=journal
UNIT

# ── The timer ───────────────────────────────────────────────────────────────
# IST is named explicitly. Writing this in UTC is how a schedule ends up five and a half
# hours out after somebody edits it a year from now.
cat > /etc/systemd/system/astrowani-db-backup.timer <<UNIT
[Unit]
Description=Astrowani offsite database backup — every 6 hours (IST)

[Timer]
OnCalendar=*-*-* 00,06,12,18:30:00
Timezone=Asia/Kolkata
# Run a slot missed while the box was down rather than skipping it.
Persistent=true
# Up to 15 minutes of jitter, so the four runs are not pinned to the exact instant that
# every other cron-shaped thing on the internet also fires.
RandomizedDelaySec=900
Unit=astrowani-db-backup.service

[Install]
WantedBy=timers.target
UNIT

systemctl daemon-reload
systemctl enable --now astrowani-db-backup.timer

echo
echo "installed. Next runs:"
systemctl list-timers astrowani-db-backup.timer --no-pager || true
cat <<'NEXT'

─────────────────────────────────────────────────────────────────────────────
BEFORE TRUSTING THIS, in order:

  1. Dry run — dumps, verifies and encrypts, uploads NOTHING:
       cd /var/www/astrowani-monorepo/astrowani-backend
       node --env-file=.env scripts/backupDatabase.js --dry-run

  2. A real run, by hand, and read the output:
       sudo systemctl start astrowani-db-backup.service
       journalctl -u astrowani-db-backup.service -n 60 --no-pager

  3. THE RESTORE DRILL. Until it has been done once, this is not a backup.
     See "The restore runbook" in vps-deployment/backups/README.md.
─────────────────────────────────────────────────────────────────────────────
NEXT
