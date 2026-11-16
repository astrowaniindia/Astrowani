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
# 45 minutes, so a run can try another topic when one is rejected and make up a
# missed slot. The agent stops itself 5 minutes earlier (the env below), so this
# limit is never what ends a run.
TimeoutStartSec=2700
Environment=BLOG_AGENT_RUN_BUDGET_SECONDS=2400
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
  local name="$1" when="$2" count="$3" window="$4"
  # Validate with systemd itself before writing anything: an expression it cannot
  # parse would otherwise be installed and simply never fire.
  if ! systemd-analyze calendar "$when Asia/Kolkata" >/dev/null 2>&1; then
    echo "ERROR: systemd cannot parse the calendar \"$when Asia/Kolkata\"" >&2
    exit 1
  fi
  cat > "/etc/systemd/system/astrowani-blog-$name.timer" <<UNIT
[Unit]
Description=Astrowani blog agent — $name slot (random time in the $window s after $when IST)

[Timer]
# The timezone goes INSIDE the calendar expression. A separate "Timezone=" line
# is not a [Timer] setting: systemd ignored it and read every time as UTC, so
# until 2026-11-17 each slot fired 5.5 hours late (06:00 "IST" ran at 11:30 IST).
OnCalendar=$when Asia/Kolkata
# Run a slot missed while the box was down, rather than skipping the day.
Persistent=true
# A RANDOM time inside the window, re-drawn every day (owner, 2026-11-17: no
# fixed publishing times). systemd picks a new delay each time the timer elapses
# unless FixedRandomDelay=yes, which is deliberately not set.
RandomizedDelaySec=$window
Unit=astrowani-blog-agent@$count.service

[Install]
WantedBy=timers.target
UNIT
  INSTALLED_TIMERS+=("astrowani-blog-$name.timer")
  echo "  wrote astrowani-blog-$name.timer ($when IST + up to ${window}s, count $count)"
}
INSTALLED_TIMERS=()

systemctl daemon-reload

# Three articles a day at RANDOM times (owner, 2026-11-17), one per window. The
# windows do not overlap and are 2 hours apart, so the three never land close
# together; each run publishes at most ONE. Window = start + RandomizedDelaySec:
#   morning   06:00-10:00   (14400 s)
#   midday    12:00-16:00   (14400 s)
#   evening   18:00-21:30   (12600 s)
install_timer morning   "*-*-* 06:00:00" 1 14400
install_timer midday    "*-*-* 12:00:00" 1 14400
install_timer evening   "*-*-* 18:00:00" 1 12600
# Catch-up, 22:45-23:15: writes one ONLY if the day is still short of its three,
# and finishes before midnight IST (the day boundary). On a normal day it does
# nothing.
install_timer catchup   "*-*-* 22:45:00" 0 1800

# daemon-reload AFTER every unit file is written, then restart each timer. Enabling
# a timer whose file changed without a reload keeps the OLD schedule, so re-running
# this to change the times used to do nothing.
systemctl daemon-reload
for t in "${INSTALLED_TIMERS[@]}"; do
  systemctl enable "$t" >/dev/null 2>&1 || true
  systemctl restart "$t"
done
echo "  timers active (times shown in the server's zone; NEXT is the first run):"
systemctl list-timers 'astrowani-blog-*' --no-pager || true
echo "  the same, in IST:"
for t in "${INSTALLED_TIMERS[@]}"; do
  next=$(systemctl show "$t" -p NextElapseUSecRealtime --value 2>/dev/null)
  [ -n "$next" ] && echo "    $t -> $(TZ=Asia/Kolkata date -d "$next" '+%a %Y-%m-%d %H:%M IST' 2>/dev/null || echo "$next")"
done

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
