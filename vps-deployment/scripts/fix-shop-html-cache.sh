#!/usr/bin/env bash
#
# Stop the storefront's HTML being cached heuristically.
#
# WHY THIS EXISTS
#   The live nginx site is installed only on the FIRST deploy - deploy-shop.yml refuses to
#   overwrite it afterwards, because certbot rewrites that file in place and copying the
#   repo version over it would strip TLS off the site. So a config change made in the repo
#   template never reaches the server, and has to be applied by hand. This is that.
#
# WHAT IT CHANGES
#   The original config marked only the ROOT index.html as no-cache. /gemstones/ and
#   /pujas/ are served from their own index.html through nginx's `index` directive, so the
#   request URI never ends in .html and that rule misses them entirely. With no
#   Cache-Control at all a client MAY cache them heuristically - which is what left a
#   phone showing a storefront whose sections had already been fixed, for long enough to
#   look like a rendering bug rather than a stale page.
#
#   Replaced with a rule matched on the RESPONSE content type, so it covers every HTML
#   document however it was routed. /assets/ declares its own add_header and therefore does
#   not inherit this - it keeps its immutable year, which is correct: those names carry a
#   content hash, so a changed file is a new URL.
#
# SAFETY
#   Backs the file up first, refuses to leave a broken config (runs `nginx -t` and restores
#   the backup if it fails), and is idempotent - running it twice is a no-op.
#
# USAGE
#   sudo bash fix-shop-html-cache.sh
set -euo pipefail

F=/etc/nginx/sites-available/astrowani-shop
[ -f "$F" ] || { echo "not found: $F"; exit 1; }
[ "$(id -u)" -eq 0 ] || { echo "run with sudo"; exit 1; }

B="$F.bak.$(date +%Y%m%d-%H%M%S)"
cp -a "$F" "$B"
echo "backup: $B"

python3 - "$F" <<'PY'
import io, re, sys
F = sys.argv[1]
s = io.open(F, encoding='utf-8', newline='').read()

if 'shop_html_cache' in s:
    print('already applied - nothing to do'); sys.exit(0)

MAP = ('# Only HTML carries a Cache-Control from this; nginx omits add_header entirely when\n'
       '# the value is empty. Matched on the RESPONSE type because /gemstones/ and /pujas/\n'
       '# are served from their own index.html via the `index` directive, so a rule keyed\n'
       '# on a .html request path never matches them.\n'
       'map $sent_http_content_type $shop_html_cache {\n'
       '    default        "";\n'
       '    ~*^text/html   "no-cache, must-revalidate";\n'
       '}\n\n')

NEW = ('    # No HTML page may be cached hard, or a deploy never reaches anyone holding the\n'
       '    # old copy - HTML is what points at the current hashed asset names.\n'
       '    add_header Cache-Control $shop_html_cache always;\n')

i = s.find('server {')
if i == -1:
    print('ERROR: no server block found'); sys.exit(2)
s = s[:i] + MAP + s[i:]

# Brace-matched rather than regex'd so a reformatted block is still handled, and it
# swallows any comment sitting directly above, since that comment describes the old rule.
m = re.search(r'(?:[ \t]*#[^\n]*\n)*[ \t]*location\s*=\s*/index\.html\s*\{', s)
if m:
    j = s.index('{', m.end() - 1); depth = 0
    for k in range(j, len(s)):
        if s[k] == '{': depth += 1
        elif s[k] == '}':
            depth -= 1
            if depth == 0: break
    else:
        print('ERROR: unbalanced braces'); sys.exit(2)
    end = k + 1
    if s[end:end+1] == '\n': end += 1
    s = s[:m.start()] + NEW + s[end:]
else:
    # Already customised and the block is gone: put the header in the serving server block.
    k = s.index('server {', s.index('map $sent_http_content_type')) + len('server {')
    s = s[:k] + '\n' + NEW.rstrip('\n') + s[k:]

io.open(F, 'w', encoding='utf-8', newline='').write(s)
print('patched')
PY

if nginx -t; then
    systemctl reload nginx
    echo
    echo "reloaded. HTML now answers with:"
    curl -sI https://shop.astrowani.com/pujas/ | grep -i '^cache-control' \
        || echo "  (none seen - a CDN edge copy may still be serving; it will expire)"
    echo "assets must still say immutable:"
    curl -sI https://shop.astrowani.com/assets/pujas-banner.jpg | grep -i '^cache-control' || true
else
    echo "nginx -t FAILED - restoring $B and leaving the server as it was"
    cp -a "$B" "$F"
    nginx -t && systemctl reload nginx
    exit 1
fi
