# Production Safety & Monitoring

What's actually watching this app in production, added 2026-08-05, and what's still a manual
step for a human. See also: [bug-scan-agent.md](bug-scan-agent.md) (crash/error triage),
[recurring-bugs-playbook.md](recurring-bugs-playbook.md) (bug patterns, including the
JWT_SECRET issue below).

## ✅ JWT_SECRET — resolved 2026-08-08

Was confirmed live on `backend.astrowani.com` running on the **hardcoded default** JWT secret
(`astrowani-backend/index.js`), letting anyone reading this repo forge a valid login token for
any customer or astrologer UUID. See [recurring-bugs-playbook.md #7](recurring-bugs-playbook.md#7-hardcoded-default-secret-used-as-a-fallback-processenvx--hardcoded-value)
for how this was found and the general pattern.

**Fixed**: a strong random secret was generated and set directly on the VPS via SSH, the
backend restarted, and the boot-time guard (refuses to start on the old hardcoded value or
anything under 32 chars) confirmed active. Every previously-logged-in customer/astrologer was
signed out as an expected side effect (also invalidates any already-forged tokens).

## Liveness / uptime monitoring

- `GET /health` on the backend (`astrowani-backend/index.js`) — cheap, unauthenticated,
  no DB round-trip (so a slow/failing Supabase doesn't look identical to "the VPS is down").
- `.github/workflows/uptime-check.yml` pings it every 15 minutes from GitHub's infra
  (independent of the VPS, so a dead VPS can't also silence its own monitor). A failing run
  shows up in the repo's Actions tab; GitHub also emails failures by default unless Actions
  notifications are turned off for this repo — worth confirming that's actually on.
- **What this does NOT replace**: Sentry, which only sees errors *while the process is
  alive*. This catches the case where the whole process/VPS is down and Sentry sees nothing.

## Backend errors → Sentry

- `astrowani-backend/src/sentry.js` + `@sentry/node` (installed 2026-08-05) — every error that
  already goes through `errorLogger.js`'s `logError()` (Express errors, uncaught exceptions,
  unhandled rejections, and now wallet-reconciliation findings below) also reports to Sentry.
- **Action needed**: set `SENTRY_DSN` in the backend's env vars (from the `astrowani-backend`
  project in the Sentry dashboard → Settings → Client Keys). Until then this is a silent no-op
  — nothing breaks, but backend errors still only live in the local log file, which wipes on
  every process restart.
- Once set, update `.claude/skills/bug-scan/SKILL.md` section 1 to also pull from the
  `astrowani-backend` Sentry project the same way it already pulls the two app projects.

## Wallet/billing reconciliation

- `sessionManager.js` → `checkWalletHealth()`, runs on startup and hourly. **Detection-only —
  it never touches wallet_balance or session rows itself**; every finding goes through
  `logError()` (file log + Sentry, once wired above) for a human to act on by hand.
- Checks: any customer/astrologer with a negative `wallet_balance` (should never happen — the
  billing RPC is supposed to stop before that), and any `chat_sessions` row still
  `is_active=true` with `next_billing_at` more than 5 minutes overdue (the 30s billing poll
  should never let a session drift that far — if this fires, something broke in the poll
  itself, not just one customer's bill).
- This exists because the bug-scan agent only sees crashes/errors — it structurally can't
  catch a silent financial correctness bug like "billing ran but charged the wrong amount and
  nothing threw." This is the closest thing to a safety net for that category right now; it's
  intentionally narrow, not a full ledger audit.

## CI on pull requests

- `.github/workflows/ci.yml` runs on every PR (including ones the bug-scan agent opens):
  backend gets a syntax check on every `.js` file, both RN apps get `npm run lint` +
  `tsc --noEmit`.
- **Deliberately does not build either Android app** — a real `gradlew assembleDebug` needs
  the Android SDK/NDK toolchain in CI and would make this slow/expensive for what's meant to
  be a fast sanity gate, not a release-candidate build.

## Manual dashboard steps — not doable from this session

These need the user's own login to a third-party dashboard; there's no API path available to
do them from here (the Sentry token in use is deliberately read-only and correctly gets a
`403` if you try to use it for this — confirmed 2026-08-05).

- **Instant Sentry alerts** (Slack/Telegram/etc. for high-severity issues instead of waiting
  for a daily digest email): Sentry dashboard → Alerts → Create Alert Rule → pick a severity
  threshold → add a Slack/notification action. Needs an org member with write access to
  Sentry, not just the bug-scan agent's read-only token.
- **Supabase backups**: still open — see [database-hardening-deferred-decisions.md](database-hardening-deferred-decisions.md#todo-2--supabase-backups--point-in-time-recovery).
