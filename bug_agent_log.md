# Bug-scan agent — running log

State tracking for the `/bug-scan` autonomous agent (`.claude/skills/bug-scan/SKILL.md`).
Each row is one investigated or explicitly-skipped issue. Updated by the agent every run —
don't hand-edit unless correcting a stale status.

| Date | Crash signature | Source | Status | Notes |
|---|---|---|---|---|
| 2026-08-05 | `TypeError: Cannot read property 'map' of undefined` in `formatAuspiciousTime` (Sentry `REACT-NATIVE-1`) — `PanchangScreen.js` crashes because backend's `/api/free-services/panchang` never returns `auspicious_period`/`inauspicious_period` | customer | fixed-pending-review | PR #1: https://github.com/astrowaniindia/Astrowani/pull/1 — frontend defaults both fields to `[]` before `.map()`. Backend still doesn't populate real auspicious/inauspicious period data (upstream Jyotisham field names unverified, that host not reachable from this environment) — flagged in PR for human follow-up. |
