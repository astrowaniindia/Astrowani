#!/usr/bin/env python3
"""Re-stamp /store.css and /store.js links with a content hash.

Nginx serves them with `Cache-Control: max-age=14400`, so an edit is invisible to
anyone holding a cached copy for up to four hours. The ?v= is derived from the file
contents, so a changed file gets a new URL and is picked up immediately, while an
unchanged one keeps its old URL and stays cached.

RUN THIS AFTER EVERY EDIT TO store.css OR store.js:   python stamp.py
"""
import hashlib, io, re, sys, pathlib

root = pathlib.Path(__file__).parent
pages = ['index.html', 'gemstones/index.html', 'pujas/index.html',
         'tools/index.html', 'about/index.html']
digests = {f: hashlib.md5((root / f).read_bytes()).hexdigest()[:8]
           for f in ('store.css', 'store.js')}

changed = 0
for page in pages:
    p = root / page
    s = io.open(p, encoding='utf-8', newline='').read()
    orig = s
    for asset, h in digests.items():
        s = re.sub(r'/' + re.escape(asset) + r'(\?v=[0-9a-f]+)?', '/' + asset + '?v=' + h, s)
    if s != orig:
        io.open(p, 'w', encoding='utf-8', newline='').write(s)
        changed += 1
    print('%-22s %s' % (page, 'updated' if s != orig else 'unchanged'))
print('hashes: ' + ', '.join('%s=%s' % kv for kv in digests.items()))
sys.exit(0)
