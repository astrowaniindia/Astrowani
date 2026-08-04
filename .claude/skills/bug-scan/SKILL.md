---
name: bug-scan
description: Autonomous crash/bug scanning and fix-drafting pass over the Astrowani monorepo. Invoke on a schedule (daily cron) or manually via /bug-scan. Reads new backend errors and app crashes since the last run, root-causes genuinely new issues against CLAUDE.md's documented invariants, and drafts fixes on a branch + PR for human review. Never merges, never deploys, never touches money-affecting code without an explicit warning.
---

# Astrowani bug-scanning agent

You are running an autonomous pass over the **Astrowani** monorepo — a production system
handling real money (customer wallet debits, per-minute call/chat billing, vendor earnings,
wallet gifts). Treat anything touching billing, wallet balances, or session finalization
(`doEndCall`, `terminateSession`, `process_session_billing`) as high-risk — extra caution
required there.

Four sub-projects: `astrowani-backend/` (Node/Express+Socket.io), `astrowani_customer-main/`
and `astrowani_vendors-main/` (React Native, Play Store), `astrowani-admin/` (React/Vite, web).

Read `CLAUDE.md` at the repo root before touching anything — it documents the architecture,
call flows, and a long list of previously-fixed bugs (stale JWT ids, Realtime channel name
collisions, `session_ended` handling, ENX/WebRTC state machine, etc.). Many new-looking
crashes are regressions of patterns already documented there. Don't re-fix a bug in a way
that contradicts a documented invariant without flagging it explicitly.

## 1. Pull new crash/error signal since the last run

**Backend errors** — real, live today:
```
GET https://backend.astrowani.com/api/bug-agent/errors?limit=500
Authorization: Bearer $BUG_AGENT_TOKEN
```
Returns the tail of `astrowani-backend/src/errorLogger.js`'s JSON-line log (Express errors,
uncaught exceptions, unhandled rejections), newest first. `$BUG_AGENT_TOKEN` must be present
in this agent's environment — if it's missing or the endpoint 503s, say so plainly and skip
backend-error triage for this run rather than guessing. **Never** use the full admin login
for this — that credential can reach wallet/billing writes and this agent must not hold it.
The backend runs on a Hostinger VPS (behind `backend.astrowani.com`) under whatever process
manager keeps it running there (e.g. PM2/systemd) — if that process restarts, the file-based
log resets, so this only ever covers "since the last process restart." Don't treat a short
log as "no errors happened" without checking process uptime.

**Customer & vendor app crashes (Sentry)** — both apps init `@sentry/react-native` in
`src/utils/CrashReporting.js` (customer + vendor each have their own Sentry project; the
vendor app's `ErrorBoundary.js` also reports caught render errors here). Pull new issues via
Sentry's REST API, org slug `astrowani`:
```
GET https://sentry.io/api/0/projects/astrowani/react-native/issues/?statsPeriod=24h&query=is:unresolved
GET https://sentry.io/api/0/projects/astrowani/astrowani-vendor/issues/?statsPeriod=24h&query=is:unresolved
Authorization: Bearer $SENTRY_AUTH_TOKEN
```
(`react-native` = customer app project, `astrowani-vendor` = vendor app project.) This token
is scoped read-only (`Issue & Event: Read`, `Project: Read` only — an Internal Integration
named "bug-scan-agent (read-only)" in the Sentry org, not a personal token) — same
least-privilege reasoning as `BUG_AGENT_TOKEN` below. Each issue in the response has a
`title`, `culprit`, `count` (occurrences), `firstSeen`/`lastSeen`, and a `permalink` — open
the permalink in triage notes so a human can see the full stack trace/breadcrumbs without you
needing to fetch the full event payload separately. If `$SENTRY_AUTH_TOKEN` is missing, say so
plainly and skip app-crash triage for this run rather than guessing from source.

Firebase Crashlytics was the original plan for app crash reporting but was replaced with
Sentry specifically because Crashlytics has no free programmatic read API (needs a paid
Blaze plan + BigQuery export); Sentry's free tier includes full API read access. Don't
re-add Crashlytics or suggest it as a fix for anything — it's fully removed from both apps.

If neither source above yields anything usable (e.g. `BUG_AGENT_TOKEN` and
`SENTRY_AUTH_TOKEN` are both missing), your job this run is to report that plainly and stop —
do not re-read the whole codebase hunting for bugs with no signal.

## 2. Triage each new crash/error

- Deduplicate against `bug_agent_log.md` (repo root) — your running log of everything you've
  already investigated. Skip anything already listed as `investigating` / `fixed-pending-review`
  / `skipped`.
- Rank by frequency × severity.
- Skip clear third-party-library issues with no workaround, or known noise. Note what you
  skipped and why in the report and the log.

## 3. Root-cause each surviving issue

- Read the actual crashing code path, not just the top stack frame — trace back to *why* the
  precondition was violated.
- Cross-check against CLAUDE.md's "Known Bugs Fixed" history and documented invariants (e.g.
  Realtime channel names must be unique per mount; `session_ended` must always call
  `doEndCall()`; ENX PiP container must stay a plain `View`).
- Confirm the fix addresses the actual cause, not just the symptom.

## 4. Draft the fix — never ship it automatically

- New branch: `fix/<short-description>`.
- Commit message: what broke, why, what changed.
- Open a PR (`gh pr create`) with: crash signature, root cause, the fix, and a test plan a
  human can run. If PR creation isn't available in this environment, leave the branch pushed
  and write the same summary in your final report instead.
- **Never** merge to `main`, trigger a Play Store release, or touch production config/secrets
  (env vars, API keys, CI/CD config).
- If the fix touches wallet balances, billing RPCs, `chat_sessions`, session finalization, or
  any payment/gift flow: put **"⚠️ Money-affecting change — review carefully"** at the very
  top of the PR description. Don't soften this. Prefer the smallest possible diff in that code.
- If you're not confident in the root cause, say so — do not guess and ship a fix that "might"
  work.

## 5. State tracking — `bug_agent_log.md` (repo root)

Table with columns: `Date | Crash signature | Source (backend/customer/vendor) | Status
(investigating / fixed-pending-review / fix-merged / skipped) | Notes (PR link or skip
reason)`. Append a row per issue you act on or explicitly skip. At the start of each run,
also re-check any `fixed-pending-review` rows: has that PR been merged or closed? Update the
row accordingly (`gh pr view <n>`).

## 6. End-of-run report

Short summary: new issues seen, how many investigated, how many PRs opened, how many skipped
and why, and anything needing a human decision (ambiguous root cause, conflicting fixes,
money-affecting change, missing `BUG_AGENT_TOKEN` / `SENTRY_AUTH_TOKEN`). Never silently drop
something — always report what you didn't get to and why.

## Hard constraints — never violate

- No autonomous deploys to Play Store, app stores, or production infra.
- No merging PRs yourself.
- No modifying secrets, API keys, environment variables, or CI/CD pipeline configuration.
- No destructive git operations (force-push, hard reset, branch deletion) on shared branches.
- No touching billing/wallet logic without the explicit money-affecting warning above, and
  prefer the smallest possible diff there.
- Every run is incremental — only process what's new since the last run (per `bug_agent_log.md`
  and the errors endpoint), never the entire history again.
