# Deploying to the VPS via git — how it actually works

Practical, step-by-step reference for shipping a change to the live VPS
(`76.13.243.165`, Hostinger). For the bigger picture (RN apps needing a Play
Store release or OTA instead of this), see
[deployment-and-releases.md](deployment-and-releases.md).

## The short version

```bash
git push origin main
```

...and for backend or admin changes, that's usually the whole thing — a GitHub
Actions workflow SSHes into the VPS, pulls, rebuilds, and restarts the right
service automatically. No manual VPS step needed on a good day.

The rest of this file covers: which pushes trigger what, how to check it
actually worked, and exactly what to run by hand when it doesn't.

---

## What auto-deploys, and on what trigger

Four workflows live in `.github/workflows/`:

| File | Triggers on a push touching… | Does |
|---|---|---|
| `deploy-backend.yml` | `astrowani-backend/**` | SSHes in, `git reset --hard origin/main`, `npm install --production`, `pm2 restart astrowani-backend` |
| `deploy-admin.yml` | `astrowani-admin/**` | SSHes in, `git reset --hard origin/main`, `npm install && npm run build` **on the VPS itself**, copies `dist/` to `/var/www/astrowani/admin/dist/` |
| `ci.yml` | (see file) | Test/lint checks — doesn't touch the VPS |
| `uptime-check.yml` | scheduled | Pings the live backend, not a deploy |

Both deploy workflows use the **same path-filter trigger pattern**: a push
that touches *only* `astrowani_customer-main/` or `astrowani_vendors-main/`
triggers **neither** — those two apps have no auto-deploy at all (see
[deployment-and-releases.md](deployment-and-releases.md) for OTA/Play Store).

A push that touches files in more than one of the watched folders (e.g. a
commit spanning both `astrowani-backend/` and `astrowani-admin/`) triggers
**both** workflows, which run independently and in parallel.

`workflow_dispatch: {}` is also enabled on both — you can manually re-run
either from the GitHub Actions tab without needing a new commit, useful for
re-triggering after a transient failure (see below) without an empty push.

---

## How to verify a deploy actually landed

Don't assume success just because you pushed. Check one of these:

**Fastest — GitHub's own run list:**
```
https://github.com/astrowaniindia/Astrowani/actions/workflows/deploy-backend.yml
https://github.com/astrowaniindia/Astrowani/actions/workflows/deploy-admin.yml
```
Look for a green check next to your commit. The repo is public, so these run
logs are viewable by anyone in a normal browser — no login needed.

**From the command line** (no GitHub auth needed — the repo is public):
```bash
curl -s "https://api.github.com/repos/astrowaniindia/Astrowani/actions/workflows/deploy-backend.yml/runs?per_page=1" \
  | grep -E '"conclusion"|"head_sha"'
```
Compare the `head_sha` to your latest commit hash and check `conclusion` is
`"success"`.

**Directly on the VPS** (most reliable — proves the *actual* file state, not
just that the workflow claimed success):
```bash
cd /var/www/astrowani-monorepo/astrowani-backend   # or astrowani-admin
git log --oneline -1
```
This should match your latest local commit. If it shows an older commit, the
deploy didn't land — see the manual fallback below.

**Backend specifically** — confirm the running process, not just the files on
disk (files can update while PM2 still serves the old process if the restart
step itself failed):
```bash
pm2 describe astrowani-backend | grep -E "status|restarts|uptime"
```
A fresh `uptime` (seconds, not hours) right after your push means it actually
restarted.

---

## Manual fallback — backend

Use this immediately if the workflow failed, or if you just don't want to
wait ~1–2 minutes for the automated run.

```bash
cd /var/www/astrowani-monorepo
git fetch origin main
git reset --hard origin/main
cd astrowani-backend
npm install --production
pm2 restart astrowani-backend --update-env
```

If that backend push also touched `bg-removal-service/` (rare), repeat the
venv/pip steps from `deploy-backend.yml` — otherwise skip them, they're a
one-time setup that's already done.

## Manual fallback — admin dashboard

Two ways, pick whichever's faster in the moment:

**Option A — build on the VPS itself** (mirrors exactly what the automated
workflow does):
```bash
cd /var/www/astrowani-monorepo
git fetch origin main
git reset --hard origin/main
cd astrowani-admin
npm install
npm run build
rm -rf /var/www/astrowani/admin/dist/*
cp -r dist/* /var/www/astrowani/admin/dist/
chown -R www-data:www-data /var/www/astrowani/admin
```

**Option B — build locally, upload the finished files** (what was actually
used on 2026-08-09/10, before confirming the automated workflow already
handles this — prefer Option A or just let the workflow run unless you have a
specific reason to build locally):
```powershell
# from D:\Projects\Astrowani\astrowani-admin
npm run build
cd dist
scp -r * root@76.13.243.165:/var/www/astrowani/admin/dist/
```
No restart needed afterward — it's static files served directly by Nginx.
Hard-refresh (`Ctrl+Shift+R`) the browser tab to bust its cache.

---

## Known issue: the SSH connection itself can time out

**Symptom:** the workflow run shows `SSH and deploy` failing after ~30
seconds, and on the VPS `git log --oneline -1` still shows the *previous*
commit — meaning the deploy script never even started running.

**Root cause, as far as this was diagnosed (2026-08-10):** the raw error was
```
dial tcp <VPS_HOST>:22: i/o timeout
```
— the SSH *connection* from GitHub's runner to the VPS never completed. This
is not a git-credential issue (the repo is public, no auth is needed to
`fetch`) and not a known local block (`fail2ban` and `ufw` aren't even
installed on the VPS, so it isn't a stale ban list). It happened twice in a
row on 2026-08-09/10, both times resolved instantly by just re-running the
identical commands by hand seconds later — consistent with a transient
network blip between GitHub's infrastructure and the VPS, though this was
never confirmed with certainty (would need Hostinger's own
network/firewall-level logs, not visible from inside the VPS).

**Mitigation in place:** both `deploy-backend.yml` and `deploy-admin.yml` now
retry the *entire SSH connection attempt* (not just a command after
connecting) up to 5 times, 20 seconds apart, before giving up. This should
absorb a one-off blip automatically. If a deploy still fails after 5 genuine
connection attempts spread over ~100 seconds, that's a stronger signal of a
real, non-transient problem — check Hostinger's hPanel for any
firewall/security rule that might be blocking GitHub Actions' IP ranges,
since that's the one layer this couldn't be inspected from inside the VPS.

**If it still happens despite the retry:** just run the manual fallback
commands above — they've worked instantly every time this was hit so far.

---

## Things that will NOT auto-deploy no matter what you push

- **Anything in `astrowani_customer-main/` or `astrowani_vendors-main/`** —
  no workflow watches these paths. Ship JS-only changes via
  `npx hot-updater deploy -p android` (OTA — see
  [deployment-and-releases.md](deployment-and-releases.md)); native changes
  need a full Play Store release.
- **VPS-level config outside the repo** — Nginx site configs
  (`/etc/nginx/sites-available/...`), the backend's `.env` file, PM2's own
  process list. These live only on the VPS and are edited by hand over SSH;
  nothing in this repo's CI touches them. `vps-deployment/nginx/*.conf` in
  this repo are just *templates* for a fresh setup, not synced automatically
  to the live Nginx config.
- **Database schema/SQL files** (`astrowani-backend/sql/*.sql`) — these are
  written and committed for review/history, but nothing runs them
  automatically. They're pasted into Supabase's SQL editor by hand, every
  time, deliberately (no automated migration runner exists for this project).
