#!/usr/bin/env bash
#
# Raises the two connection ceilings that cap concurrent users well below what
# the hardware can serve. Idempotent — safe to re-run.
#
#   sudo bash vps-deployment/scripts/apply-scaling-limits.sh
#
# WHY (measured 2026-10-01)
#
# 1. nginx was running Ubuntu defaults: worker_connections 768. Every websocket
#    costs TWO of those (browser/app -> nginx, and nginx -> node:4500), so the
#    practical ceiling was roughly (workers x 768) / 2 concurrent app sockets.
#    On a 2-core box that is ~750 connected users — reached long before CPU,
#    RAM or the database are anywhere near their limits.
#
# 2. The Node process inherits the default open-file limit (commonly 1024).
#    Each socket is a file descriptor, so the backend cannot hold much past
#    ~1000 sockets regardless of what nginx allows. When it hits the wall the
#    failure is EMFILE ("too many open files") — which surfaces as random
#    connection refusals, not as an obvious capacity error.
#
# Neither of these costs anything to raise; they are just defaults nobody
# changed. RAM per idle websocket is tens of KB, so 10k sockets is a few
# hundred MB — the box had ~4.6GB free at idle.
#
# WHAT THIS DOES NOT DO
# It does not add CPU. The backend is still ONE Node process on ONE core
# (pm2 fork mode). Raising these limits lets you reach the CPU ceiling instead
# of being stopped early by an arbitrary one. Going beyond that needs pm2
# cluster mode, which REQUIRES a Socket.io Redis adapter first — without it,
# two workers cannot see each other's rooms and calls/chat break. Do not
# enable cluster mode as a quick win.

set -euo pipefail

NGINX_CONF=/etc/nginx/nginx.conf
BACKUP_SUFFIX=".bak.$(date +%Y%m%d%H%M%S)"

if [[ $EUID -ne 0 ]]; then
  echo "Run with sudo." >&2
  exit 1
fi

echo "==> 1/3 nginx worker limits"
if [[ ! -f "$NGINX_CONF" ]]; then
  echo "    $NGINX_CONF not found — skipping nginx tuning." >&2
else
  cp -a "$NGINX_CONF" "${NGINX_CONF}${BACKUP_SUFFIX}"
  echo "    backup: ${NGINX_CONF}${BACKUP_SUFFIX}"

  # worker_rlimit_nofile lives in the MAIN context (not events{}), and must be
  # at least worker_connections. Without it nginx itself hits the FD wall.
  if grep -qE '^\s*worker_rlimit_nofile' "$NGINX_CONF"; then
    sed -i -E 's/^\s*worker_rlimit_nofile.*/worker_rlimit_nofile 65535;/' "$NGINX_CONF"
    echo "    worker_rlimit_nofile -> 65535 (updated)"
  else
    # Insert after the worker_processes line so it stays in the main context.
    sed -i -E '0,/^\s*worker_processes.*/s//&\nworker_rlimit_nofile 65535;/' "$NGINX_CONF"
    echo "    worker_rlimit_nofile -> 65535 (added)"
  fi

  # worker_connections ONLY works inside events{} — it cannot be set from a
  # site config or a conf.d include, which is why this edits the main file.
  if grep -qE '^\s*worker_connections' "$NGINX_CONF"; then
    sed -i -E 's/^(\s*)worker_connections.*/\1worker_connections 16384;/' "$NGINX_CONF"
    echo "    worker_connections -> 16384 (updated)"
  else
    sed -i -E '0,/^\s*events\s*\{/s//&\n    worker_connections 16384;/' "$NGINX_CONF"
    echo "    worker_connections -> 16384 (added)"
  fi

  if nginx -t; then
    systemctl reload nginx
    echo "    nginx config OK, reloaded"
  else
    echo "    !! nginx config test FAILED — restoring backup" >&2
    cp -a "${NGINX_CONF}${BACKUP_SUFFIX}" "$NGINX_CONF"
    nginx -t && systemctl reload nginx
    exit 1
  fi
fi

echo "==> 2/3 system-wide open-file limits"
LIMITS_FILE=/etc/security/limits.d/90-astrowani.conf
cat > "$LIMITS_FILE" <<'EOF'
# Raised for the Astrowani backend: every websocket is a file descriptor.
* soft nofile 65535
* hard nofile 65535
root soft nofile 65535
root hard nofile 65535
EOF
echo "    wrote $LIMITS_FILE"

echo "==> 3/3 PM2 process limits"
# PM2 under systemd inherits the unit's LimitNOFILE, NOT limits.conf — a
# systemd service ignores /etc/security/limits.d entirely. Both are needed:
# limits.conf covers login shells, the drop-in covers the daemon.
PM2_UNIT="$(systemctl list-units --type=service --no-legend 2>/dev/null | grep -oE '^pm2-[^ ]+\.service' | head -1 || true)"
if [[ -n "$PM2_UNIT" ]]; then
  DROPIN_DIR="/etc/systemd/system/${PM2_UNIT}.d"
  mkdir -p "$DROPIN_DIR"
  cat > "${DROPIN_DIR}/limits.conf" <<'EOF'
[Service]
LimitNOFILE=65535
EOF
  systemctl daemon-reload
  echo "    wrote ${DROPIN_DIR}/limits.conf for $PM2_UNIT"
  echo "    NOTE: run 'systemctl restart $PM2_UNIT' (or 'pm2 kill && pm2 resurrect')"
  echo "          to make the new limit take effect — a reload is NOT enough."
else
  echo "    No pm2-*.service unit found. If PM2 was started by hand, raise the"
  echo "    limit in its shell before starting: ulimit -n 65535 && pm2 resurrect"
fi

echo
echo "Done. Verify after restarting the backend process:"
echo "  cat /proc/\$(pgrep -f 'node.*index.js' | head -1)/limits | grep 'open files'"
echo "  nginx -T 2>/dev/null | grep -E 'worker_connections|worker_rlimit_nofile'"
