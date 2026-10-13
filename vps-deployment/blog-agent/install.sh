#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Install the blog agent's schedule on the VPS. Idempotent — safe to re-run.
#
#   sudo bash vps-deployment/blog-agent/install.sh
#
# WHAT IT INSTALLS: three systemd timers, firing at 03:30, 09:30 and 17:30 IST,
# each writing ONE article.
#
# WHY SYSTEMD TIMERS AND NOT CRON
#  - `OnCalendar` understands the timezone, so the schedule is written in IST and
#    stays correct without anyone converting to UTC.
#  - `Persistent=true` runs a missed slot after a reboot. Cron silently skips it,
#    and a VPS that reboots at 03:00 would quietly publish two articles that day
#    for months before anyone noticed.
#  - The run is a unit, so `systemctl status` and `journalctl -u` give the exit
#    code and the full log of the last attempt. Cron gives a mail nobody reads.
#  - `OnFailure` can notify. The agent exits non-zero when a scheduled run
#    publishes nothing, which is the signal that matters.
#
# WHY THREE TIMERS AND NOT ONE RUN OF THREE ARTICLES
#  - A provider outage at 03:30 costs one article, not the day's three.
#  - The three posts get genuinely different `created_at` values, so the blog
#    looks like it is written by people through the day rather than dumped at
#    once. The listing is ordered by created_at, so it also means the featured
#    post changes three times a day.
#  - Each run is a separate process that exits, so a hung model call cannot hold
#    memory for hours.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

REPO_DIR="${REPO_DIR:-/var/www/astrowani-monorepo}"
BACKEND_DIR="$REPO_DIR/astrowani-backend"
NODE_BIN="${NODE_BIN:-$(command -v node)}"
RUN_USER="${RUN_USER:-root}"

if [ ! -d "$BACKEND_DIR" ]; then
  echo "ERROR: $BACKEND_DIR not found. Set REPO_DIR= if the checkout is elsewhere." >&2
  exit 1
fi
if [ ! -f "$BACKEND_DIR/.env" ]; then
  echo "ERROR: $BACKEND_DIR/.env not found. The agent needs SUPABASE_SERVICE_ROLE_KEY and a GEMINI key." >&2
  exit 1
fi
if [ -z "$NODE_BIN" ]; then
  echo "ERROR: node not found on PATH. Set NODE_BIN=/path/to/node." >&2
  exit 1
fi

echo "repo:    $REPO_DIR"
echo "node:    $NODE_BIN ($($NODE_BIN --version))"
echo "user:    $RUN_USER"

# ── The service ─────────────────────────────────────────────────────────────
# Templated on the article count so a different schedule needs no new unit.
cat > /etc/systemd/system/astrowani-blog-agent@.service <<UNIT
[Unit]
Description=Astrowani blog agent — write %i article(s)
Documentation=file://$REPO_DIR/vps-deployment/blog-agent/README.md
# Do not start before the network is genuinely usable: the agent's first act is
# a Supabase call, and a run that fires during boot would otherwise fail and be
# recorded in the ledger as a real failure.
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
User=$RUN_USER
WorkingDirectory=$BACKEND_DIR
# --env-file is how every other script here is run, and it keeps the secrets in
# the root-owned .env rather than in a systemd unit that is world-readable.
ExecStart=$NODE_BIN --env-file=$BACKEND_DIR/.env $BACKEND_DIR/scripts/runBlogAgent.js --count %i
# MEASURED 2026-10-13, which is why this is 20 minutes and not 10. A healthy run
# is ~105s (English 41s + Hindi 64s on gemini-3.5-flash-lite). But the chain walks
# past the full flash models first, and on the free tier those are routinely
# saturated — usually failing fast with a 503, sometimes timing out at the 120s
# the client allows. Worst case is 3 English attempts plus the Hindi pass, each
# having waited out a flash timeout, which lands around 660s and would have been
# killed under the original 600s. The process exits on its own when it finishes,
# so a generous ceiling costs nothing; being killed mid-retry costs the slot and
# looks like a hang rather than a rejection.
TimeoutStartSec=1200
# Nice + IOSchedulingClass: the backend shares this single core (CLAUDE.md DN)
# and serves live calls and chat. The agent must always lose that contest.
Nice=10
IOSchedulingClass=idle
StandardOutput=journal
StandardError=journal
UNIT

# ── The timers ──────────────────────────────────────────────────────────────
# IST is named explicitly. Writing these in UTC is how a schedule ends up five
# and a half hours out after somebody edits it a year from now.
install_timer() {
  local name="$1" when="$2" count="$3"
  cat > "/etc/systemd/system/astrowani-blog-$name.timer" <<UNIT
[Unit]
Description=Astrowani blog agent — $name slot ($when IST)

[Timer]
OnCalendar=$when
Timezone=Asia/Kolkata
# Run a slot missed while the box was down, rather than skipping the day.
Persistent=true
# Up to 20 minutes of jitter. Three posts landing at exactly :30:00 every day is
# a machine signature; it also spreads the load off a fixed instant.
RandomizedDelaySec=1200
Unit=astrowani-blog-agent@$count.service

[Install]
WantedBy=timers.target
UNIT
  systemctl enable --now "astrowani-blog-$name.timer"
  echo "  installed astrowani-blog-$name.timer ($when IST, $count article)"
}

systemctl daemon-reload

install_timer morning   "*-*-* 03:30:00" 1
install_timer midday    "*-*-* 09:30:00" 1
install_timer evening   "*-*-* 17:30:00" 1

echo
echo "Installed. The agent is still DISABLED in the database — these timers will"
echo "run and do nothing until you turn it on:"
echo
echo "  cd $BACKEND_DIR"
echo "  node --env-file=.env scripts/runBlogAgent.js --status"
echo "  node --env-file=.env scripts/runBlogAgent.js --dry-run     # writes nothing"
echo "  node --env-file=.env scripts/runBlogAgent.js --enable"
echo
echo "Then watch it:"
echo "  systemctl list-timers 'astrowani-blog-*'"
echo "  journalctl -u 'astrowani-blog-agent@*' -n 100 --no-pager"
