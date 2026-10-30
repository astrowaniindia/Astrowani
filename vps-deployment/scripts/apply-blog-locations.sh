#!/usr/bin/env bash
#
# Merge the three server-rendered blog locations into the LIVE shop nginx config.
#
#   sudo bash apply-blog-locations.sh /path/to/blog-locations.conf
#
# WHY A MERGE AND NOT A COPY. The shop's nginx file is hand-maintained on the
# server: Certbot rewrote it in place to add the TLS block and the port-80
# redirect, and deploy-shop.yml installs it on first deploy only. Copying the
# repo's mirror over it would strip the certificate — and on 2026-10-29 would
# also have silently undone the /test-site/ 404 fix, putting every missing URL
# back to answering 200 with index.html. So this adds three locations and
# changes nothing else.
#
# It is idempotent: a second run detects the locations and exits 0.
#
# SAFETY. The file is copied to a timestamped backup first, the change is gated
# on `nginx -t`, and a failed test restores the backup and reloads nothing — so
# the worst outcome is that three URLs keep behaving exactly as they do now.
#
# NOTE you cannot verify the result with curl from the VPS: the server block
# includes snippets/astrowani-cloudflare-only.conf, so 127.0.0.1 is not an
# allowed source and a local request is dropped. Verify from outside the box.

set -euo pipefail

BLOCK="${1:?usage: apply-blog-locations.sh <blog-locations.conf>}"
CONF="${CONF:-/etc/nginx/sites-available/astrowani-shop}"
MARKER='    location / {'

[ -f "$CONF" ] || { echo "FATAL: $CONF does not exist"; exit 1; }
[ -f "$BLOCK" ] || { echo "FATAL: $BLOCK does not exist"; exit 1; }

if grep -q 'location = /test-site/blog-post.html' "$CONF"; then
  echo "already applied — the blog locations are present, leaving $CONF alone"
  nginx -t
  exit 0
fi

command -v python3 >/dev/null || { echo "FATAL: python3 not found"; exit 1; }

BACKUP="$CONF.bak-$(date +%Y%m%d-%H%M%S)"
cp -a "$CONF" "$BACKUP"
echo "backed up to $BACKUP"

# Spliced in BEFORE `location / {`, which must appear exactly once — the port-80
# server Certbot added is a bare `return 404` with no locations of its own. If
# that ever stops being true the splice refuses rather than guessing.
python3 - "$CONF" "$BLOCK" "$MARKER" <<'PY'
import sys
conf_path, block_path, marker = sys.argv[1], sys.argv[2], sys.argv[3]
conf = open(conf_path, encoding='utf-8').read()
block = open(block_path, encoding='utf-8').read()
found = conf.count(marker)
if found != 1:
    sys.exit('FATAL: expected exactly one %r, found %d' % (marker, found))
i = conf.index(marker)
open(conf_path, 'w', encoding='utf-8').write(conf[:i] + block + conf[i:])
print('spliced the blog locations in before "location / {"')
PY

if nginx -t; then
  systemctl reload nginx
  echo "applied and reloaded:"
  grep -n 'location = /test-site/blog' "$CONF"
else
  echo "nginx -t FAILED — restoring $BACKUP and reloading nothing"
  cp -a "$BACKUP" "$CONF"
  nginx -t
  exit 1
fi
