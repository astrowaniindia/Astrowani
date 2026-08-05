# Bug-Scan Agent (automated Sentry/error monitoring)

**What this is:** an automated Claude Code routine that watches for crashes and errors across
the whole app — backend, customer app, vendor app — root-causes real ones, and opens a GitHub
PR with a fix for a human to review. It never merges anything or ships anything itself.

See also: [recurring-bugs-playbook.md](recurring-bugs-playbook.md) (the patterns it should
recognize), [deployment-and-releases.md](deployment-and-releases.md) (how a fix it finds
actually reaches users after you merge its PR).

## Where it lives

- **Schedule**: a Claude Code cloud routine named **"Astrowani bug-scan (every 8h)"**, runs
  3×/day (~6am / 2pm / 10pm IST). Was originally once/day at 11am — changed to every 8h on
  2026-08-05 because a crash that happened at 4:43pm sat unnoticed until the next day's 11am
  run. Can be triggered manually any time from the routine's page on claude.ai, or by asking
  Claude Code to trigger it.
- **Instructions**: `.claude/skills/bug-scan/SKILL.md` in this repo — this is the actual
  "job description" the agent follows every run (what to pull, how to triage, how to draft a
  fix, hard constraints). Update that file, not this one, if you want to change its behavior.

## What it checks, each run

1. **Backend errors** — `GET /api/bug-agent/errors` on the live backend (a log of Express
   errors, uncaught exceptions, unhandled rejections). This log **resets whenever the backend
   process restarts** — it's not a durable history.
2. **App crashes (Sentry)** — both RN apps report crashes to Sentry (org `astrowani`, projects
   `react-native` = customer app, `astrowani-vendor` = vendor app). The agent pulls
   unresolved issues from the last 24 hours via Sentry's API.

Both API calls use **read-only, narrowly-scoped tokens** (not your admin login) — one for the
backend endpoint, one for Sentry. Neither can touch wallet/billing data or write anything.
They live embedded in the routine's own config on claude.ai, not in this repo.

## What it does with what it finds

- Skips anything it's already logged (see `bug_agent_log.md` at the repo root — its running
  ledger of what it has investigated and the status).
- Reads the actual crashing code path and traces back to the real root cause — not just a
  surface patch.
- Opens a PR on a `fix/<description>` branch with: the crash signature, root cause, the fix,
  and a test plan.
- If it can't verify something confidently (e.g. an undocumented third-party API's field
  names), it says so in the PR instead of guessing.
- **Never** merges its own PR, never deploys, never touches secrets/env vars/CI config, and
  puts a loud "⚠️ Money-affecting change" warning at the top of any PR touching
  wallet/billing/session-finalization code.

## Real example (first live test — 2026-08-05)

A user got a Sentry email: `TypeError: Cannot read property 'map' of undefined` in the
Panchang free-service screen. Manually triggering the agent produced
[PR #1](https://github.com/astrowaniindia/Astrowani/pull/1): it traced the crash to the
backend's `/api/free-services/panchang` response silently omitting the
`auspicious_period`/`inauspicious_period` fields the frontend expected, shipped a defensive
frontend fix, and explicitly flagged that fixing the backend's response shape needs a human
to check the third-party Jyotisham API docs first (network-sandboxed, couldn't verify it
directly). This is the reference example of "working as intended."

## How to check on it

- New PRs: look for open PRs prefixed `fix/` on the repo.
- Status of everything it's looked at: `bug_agent_log.md` at the repo root.
- To run it right now instead of waiting for the schedule: trigger it manually (ask Claude
  Code, or use the routine's page on claude.ai).
