# Bug-scan agent — running log

State tracking for the `/bug-scan` autonomous agent (`.claude/skills/bug-scan/SKILL.md`).
Each row is one investigated or explicitly-skipped issue. Updated by the agent every run —
don't hand-edit unless correcting a stale status.

| Date | Crash signature | Source | Status | Notes |
|---|---|---|---|---|
| 2026-08-05 | `TypeError: Cannot read property 'map' of undefined` in `formatAuspiciousTime` (Sentry `REACT-NATIVE-1`) — `PanchangScreen.js` crashes because backend's `/api/free-services/panchang` never returns `auspicious_period`/`inauspicious_period` | customer | fix-merged | **PR #1 merged: https://github.com/astrowaniindia/Astrowani/pull/1** — frontend defaults both fields to `[]` before `.map()`. Backend still doesn't populate real auspicious/inauspicious period data (upstream Jyotisham field names unverified, that host not reachable from this environment) — flagged for human follow-up, still open. Duplicate PR #2 (`fix/panchang-screen-crash`, more thorough — also guards `formatPanchangData`'s unguarded array indexing) is still open pending a human call on whether to rebase/land the extra hardening or close it; PR #2 notified of #1's merge. Human fix alongside the merge (commit `7c07713`) scoped CI lint to changed-files-only (was repo-wide, false-failing every PR on pre-existing debt) and updated `.claude/skills/bug-scan/SKILL.md` to check open PRs for dedup before drafting a fix, not just this log — root cause of the duplicate-PR incident. |
