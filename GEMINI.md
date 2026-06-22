# Astrowani Project Instructions

## Mandatory Verification Workflow

All engineering tasks MUST follow this rigorous verification cycle. Failure to provide empirical evidence for any step will result in an immediate halt.

### 1. Pre-Modification Verification Phase
Before writing a single line of code, you MUST verify the following using the available tools:

- **Assumptions:** Explicitly list and prove every technical assumption (e.g., "Component X receives prop Y").
- **Routes:** Confirm the existence and exact name of navigation targets in the routing configuration.
- **APIs:** Verify endpoint URLs, expected payloads, and response structures in the backend/API definitions.
- **Database Schema:** Confirm table names, column names, and data types in the database client or migration files.
- **Imports:** Verify the file path and export/import names for any library or internal module.
- **Navigation Targets:** Confirm that the destination screen or component exists and is correctly registered in the navigation stack.

**If evidence cannot be found or verified for any item, mark it as:**
`UNVERIFIED ASSUMPTION`
**And STOP immediately. Do not proceed with the implementation.**

### 2. Implementation Phase
- Use surgical edits (`replace` tool) whenever possible.
- Adhere strictly to the project's established styling, naming conventions, and architectural patterns.

### 3. Post-Modification Validation Phase
Immediately after any code modification, you MUST:

- **Run Validation Checks:** Execute relevant tests, linting, or type-checking commands to ensure system integrity.
- **Verify Behavior:** Confirm that the change achieves the intended goal without regressions.
- **Produce Implementation Verification Report:** Create or update `IMPLEMENTATION_VERIFICATION_REPORT.md` documenting the changes and the validation results.

## Implementation Verification Report Template
The report MUST include:
1. **Target File:** Path to the modified file.
2. **Verification Evidence:** Proof that pre-modification checks were successful.
3. **Change Summary:** Concise description of the modification.
4. **Validation Results:** Evidence of successful testing/linting/behavioral check.

---

## Project State Management

At the end of every significant session:

1. Update `PROJECT_STATE.md`
2. Record:
   - Work completed
   - Files modified
   - Validation reports completed
   - Current architecture decisions
   - Current phase
   - Next recommended action
   - Open issues
   - Blockers

3. Remove outdated information.
4. Keep `PROJECT_STATE.md` concise and current.

Before starting any new task:

1. Read `PROJECT_STATE.md`
2. Verify the current phase
3. Continue from the recorded state

`PROJECT_STATE.md` is the authoritative project memory.

---

## Token Efficiency Rule

Before reading files or initiating scans:

1. **Check `PROJECT_STATE.md` first.** This is the primary source of truth.
2. **Read `PROJECT_STATE.md` ONLY** at the start of new sessions/chats to establish context.
3. **Do not re-read previously verified reports** or historical documents unless `PROJECT_STATE.md` explicitly references them as required for the current task.
4. **Do not re-scan the entire repository.** Avoid broad globbing or directory listings if the target files are already known or listed in `PROJECT_STATE.md`.
5. **Only inspect files directly related** to the current phase or task.
6. **Reuse previously verified findings** documented in previous turns or reports whenever possible.
7. **Constraint:** If a task requires inspecting more than 5 files, you MUST provide a brief explanation of why before proceeding.

**Goal:** Minimize token consumption while preserving verification quality and continuing strictly from the current phase.

