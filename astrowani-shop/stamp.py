#!/usr/bin/env python3
"""Sync the shell copies and re-stamp /store.css and /store.js with a content hash.

RUN THIS AFTER EVERY EDIT TO index.html, store.css OR store.js:   python stamp.py

Two jobs:

1. SHELL COPIES. index.html is the whole site - every path is served this one document
   and the router in store.js decides what it means (see the comment at the top of
   index.html). gemstones/index.html and pujas/index.html exist only so those two real
   directories keep resolving for anyone holding an old bookmark or a search result, and
   they must stay byte-identical to index.html or those visitors get a stale shell. They
   are COPIES, not sources: edit index.html and run this.

   Why keep them at all rather than deleting the directories and letting try_files fall
   through? Because the deploy workflow copies files in and only prunes assets/ - a
   deleted page directory would keep serving its old contents on the VPS forever.

2. CACHE STAMPS. Nginx serves .css/.js with `Cache-Control: max-age=14400`, so an edit is
   invisible to anyone holding a cached copy for up to four hours. The ?v= is derived from
   the file contents, so a changed file gets a new URL and is picked up immediately, while
   an unchanged one keeps its old URL and stays cached.
"""
import hashlib, io, re, sys, pathlib

root = pathlib.Path(__file__).parent
SHELL = 'index.html'
COPIES = ['gemstones/index.html', 'pujas/index.html']

shell_src = io.open(root / SHELL, encoding='utf-8', newline='').read()
for rel in COPIES:
    p = root / rel
    p.parent.mkdir(parents=True, exist_ok=True)
    existing = io.open(p, encoding='utf-8', newline='').read() if p.exists() else None
    if existing != shell_src:
        io.open(p, 'w', encoding='utf-8', newline='').write(shell_src)
        print('%-22s copied from %s' % (rel, SHELL))
    else:
        print('%-22s already in sync' % rel)

digests = {f: hashlib.md5((root / f).read_bytes()).hexdigest()[:8]
           for f in ('store.css', 'store.js')}

for page in [SHELL] + COPIES:
    p = root / page
    s = io.open(p, encoding='utf-8', newline='').read()
    orig = s
    for asset, h in digests.items():
        s = re.sub(r'/' + re.escape(asset) + r'(\?v=[0-9a-f]+)?', '/' + asset + '?v=' + h, s)
    if s != orig:
        io.open(p, 'w', encoding='utf-8', newline='').write(s)
    print('%-22s %s' % (page, 'stamped' if s != orig else 'unchanged'))

print('hashes: ' + ', '.join('%s=%s' % kv for kv in digests.items()))
sys.exit(0)
