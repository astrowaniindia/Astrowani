# Bug-scan agent — running log

State tracking for the `/bug-scan` autonomous agent (`.claude/skills/bug-scan/SKILL.md`).
Each row is one investigated or explicitly-skipped issue. Updated by the agent every run —
don't hand-edit unless correcting a stale status.

| Date | Crash signature | Source | Status | Notes |
|---|---|---|---|---|
| 2026-08-05 | `TypeError: Cannot read property 'map' of undefined` in `formatAuspiciousTime` (PanchangScreen.js), Sentry `react-native` project, 2 occurrences | customer | fixed-pending-review | Third-party Panchang API omits `auspicious_period`/`inauspicious_period` (and possibly `nakshatra`/`tithi`/`karana`/`yoga`) for some date/location queries; `panchangData` guard only checked truthiness, not nested fields. Not money-affecting. PR: fix/panchang-screen-crash (see PR link once opened). |
