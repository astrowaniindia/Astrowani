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

command -v python3 >/dev/null || { echo "FATAL: python3 not found"; exit 1; }

# PER-LOCATION, NOT ALL-OR-NOTHING. The block file grows over time (the clean
# /blog/<slug> routes were added on 2026-11-16, after the first three were
# live). The old check — "is blog-post.html present? then exit" — would have
# reported "already applied" and silently skipped every later addition. Now
# each `location ... {` stanza in the block (with the comment lines directly
# above it) is added only if that exact location line is not already in the
# live file. Exit 3 from the splice means there was nothing to add.
BACKUP="$CONF.bak-$(date +%Y%m%d-%H%M%S)"
cp -a "$CONF" "$BACKUP"

# Spliced in BEFORE `location / {`, which must appear exactly once — the port-80
# server Certbot added is a bare `return 404` with no locations of its own. If
# that ever stops being true the splice refuses rather than guessing.
set +e
python3 - "$CONF" "$BLOCK" "$MARKER" <<'PY'
import sys
conf_path, block_path, marker = sys.argv[1], sys.argv[2], sys.argv[3]
conf = open(conf_path, encoding='utf-8').read()
lines = open(block_path, encoding='utf-8').read().split('\n')

stanzas, pending, cur = [], [], None
for line in lines:
    if cur is None:
        if line.startswith('    location '):
            cur = {'head': line.strip(), 'lines': pending + [line]}
            pending = []
        elif line.strip().startswith('#'):
            pending.append(line)
        else:
            pending = []
    else:
        cur['lines'].append(line)
        if line == '    }':
            stanzas.append(cur)
            cur = None
if cur is not None:
    sys.exit('FATAL: unterminated location in %s: %s' % (block_path, cur['head']))

present = {l.strip() for l in conf.split('\n')}
missing = [s for s in stanzas if s['head'] not in present]
if not missing:
    print('already applied — all %d blog locations are present' % len(stanzas))
    sys.exit(3)
found = conf.count(marker)
if found != 1:
    sys.exit('FATAL: expected exactly one %r, found %d' % (marker, found))
add = '\n'.join('\n'.join(s['lines']) for s in missing) + '\n\n'
i = conf.index(marker)
open(conf_path, 'w', encoding='utf-8').write(conf[:i] + add + conf[i:])
for s in missing:
    print('added: ' + s['head'])
PY
rc=$?
set -e
if [ "$rc" -eq 3 ]; then
  rm -f "$BACKUP"
  nginx -t
  exit 0
fi
[ "$rc" -eq 0 ] || { echo "splice failed — restoring $BACKUP"; cp -a "$BACKUP" "$CONF"; exit 1; }
echo "backed up to $BACKUP"

if nginx -t; then
  systemctl reload nginx
  echo "applied and reloaded:"
  grep -n 'location .*/test-site/\(hi/\)\?blog' "$CONF"
else
  echo "nginx -t FAILED — restoring $BACKUP and reloading nothing"
  cp -a "$BACKUP" "$CONF"
  nginx -t
  exit 1
fi
