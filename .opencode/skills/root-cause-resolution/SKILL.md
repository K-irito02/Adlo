---
name: root-cause-resolution
description: Problem resolution from root cause to cleanup. Root cause first, prevention second, with log-driven verification, web research fallback, and post-fix dead code removal. Invoke after systematic-debugging investigation or when deciding how to fix a confirmed bug.
---

# Root Cause Resolution

## Overview

This skill governs the **solution phase** of debugging — from the moment root cause investigation (handled by `systematic-debugging`) concludes, through solution design, verification, and post-fix cleanup.

**Core principle:** Root cause fix first. Preventive measures only when root cause is genuinely unfixable. Every solution must be proven real and effective.

**Relationship with `systematic-debugging`:** That skill covers Phase 1 (investigation). This skill covers Phases 2-5 (solution → verification → cleanup). Use `systematic-debugging` first to find the root cause, then switch to this skill for the resolution.

---

## Phase 1: Determine the Path

After root cause investigation is complete, you fall into one of two paths:

### Path A: Root Cause Identified

**Criteria (ALL must be met):**
- You can explain the exact mechanism causing the problem
- You can trace the data/control flow from trigger to symptom
- Changing the identified cause would fix the issue without side effects

**Action:** Proceed to Phase 2A (Direct Fix).

### Path B: Root Cause NOT Identified

**This is a high bar. Only conclude "no root cause" when:**
- You have exhausted all investigation techniques (traced full call stack, checked all component boundaries, reviewed git history, reproduced consistently)
- The issue is confirmed environmental (OS-level, hardware, external service with no workaround)
- The issue is a known limitation of a third-party dependency with no upgrade path
- You have documented exactly what you investigated and why each path dead-ended

**If you haven't met the above:** Return to `systematic-debugging` Phase 1. Do NOT proceed to Path B prematurely.

**Action:** Proceed to Phase 2B (Preventive Measures).

---

## Phase 2A: Direct Fix (Root Cause Known)

1. **Design the fix** — Address the root cause at its source, not downstream
2. **Check for siblings** — Are there other places in the codebase with the same root cause pattern? Fix them together
3. **Add verification logging** — Add logs at the fix point to confirm the fix works (see [Logging Guidelines](#logging-guidelines))
4. **Proceed to Phase 3**

---

## Phase 2B: Preventive Measures (No Root Cause)

### Step 1: Design Candidate Solutions

For each candidate solution, evaluate against this structured framework:

| Dimension | Questions to Answer |
|-----------|-------------------|
| **Coverage** | What scenarios does it handle? What does it miss? |
| **Complexity** | How much code? New dependencies? New concepts? |
| **Side-effect risk** | What else could break? Performance impact? |
| **Maintainability** | Will future developers understand it? Easy to debug? |
| **False positive risk** | Could it block legitimate behavior? |
| **Reversibility** | How easy to undo if it causes problems? |

### Step 2: Present Options to User

When multiple viable solutions exist, present them using `AskUserQuestion`:

- List each option with a short label
- In the description, summarize: what it does, pros, cons, and your recommendation
- Mark the recommended option with "(Recommended)"
- Wait for user decision before implementing

### Step 3: External Research (When All Options Are Weak)

If no candidate solution is clearly viable:

1. **Search the web** (`WebSearch`) for how similar products handle the same problem
2. **Check official documentation** of relevant libraries/frameworks
3. **Search community discussions** (GitHub issues, Stack Overflow, forums)
4. **Evaluate external solutions** against the same framework above
5. **Combine with your own knowledge** — don't blindly copy; adapt to the project context

**Research query template:**
```
"[technology/library] [problem description] best practice"
"How does [similar product] handle [problem scenario]"
"[error message or symptom] solution site:github.com"
```

---

## Phase 3: Verification

### Step 1: Add Verification Logging

Add diagnostic logs at key points. See [Logging Guidelines](#logging-guidelines) for format and location.

**What to log:**
- Entry/exit of the fix point with relevant state
- Before/after values if the fix transforms data
- Error paths (what happens when the fix encounters unexpected input)
- Any assumptions the fix makes (log when they're violated)

### Step 2: User Testing

1. Tell the user what to test and what to look for
2. Wait for the user to confirm testing is complete
3. **Do NOT** preemptively declare success

### Step 3: Log Analysis

After user confirms testing is complete, read the log files from `E:\AI-DIGITAL-LIFE\SourceWorkspace\.adl-logs`.

**CRITICAL — Use the right tools (see [Gitignore Bypass](#gitignore-bypass-for-log-access)):**

| Tool | Safe? | Notes |
|------|-------|-------|
| `LS` with absolute path | Yes | Lists directory directly, bypasses `.gitignore` |
| `Read` with absolute path | Yes | Reads file directly, bypasses `.gitignore` |
| `RunCommand` (`dir`, `Get-ChildItem`) | Yes | Shell commands don't respect `.gitignore` |
| `Glob` / `Grep` / `SearchCodebase` | **No** | These respect `.gitignore` and will miss log files |

**Procedure:**
1. Use `LS` to list all files in `E:\AI-DIGITAL-LIFE\SourceWorkspace\.adl-logs`
2. Use `Read` with absolute paths to read the most recent log files
3. Check for:
   - **Expected log entries** — confirming the fix is active
   - **Error entries** — indicating the fix failed or encountered edge cases
   - **Missing entries** — suggesting the fix code path wasn't reached
   - **Unexpected patterns** — anything that doesn't match the hypothesis

**If no log files are found:** The `.gitignore` is likely the cause. Verify with `LS` (not `Glob`). If `LS` also shows empty, the logging code path was never reached — this is itself a diagnostic signal.

### Step 4: Handle Results

| Result | Action |
|--------|--------|
| Logs confirm fix works, user confirms problem resolved | Proceed to Phase 4 (user says "问题已解决" or equivalent) |
| Logs show fix partially works but has gaps | Identify gaps, return to Phase 2A/2B to refine |
| Logs show fix didn't work at all | Re-examine: is it the solution, the code, the technical approach, or the architecture? |
| User says "问题还是没有解决" | Go to [Iteration on Failure](#iteration-on-failure) |

### Iteration on Failure

When the user reports the problem persists after testing:

1. **Re-examine the solution** — Was the hypothesis wrong? Did the fix address a symptom, not the cause?
2. **Re-examine the code** — Is the implementation correct? Are there edge cases?
3. **Re-examine the approach** — Is the technical strategy sound? Are there fundamental conflicts?
4. **Re-examine the architecture** — Is this a systemic issue that can't be fixed at the component level?
5. **If still stuck** — Go to external research (Phase 2B, Step 3)

**Critical rule:** After 3 failed iteration cycles, STOP and escalate to the user with a summary of what was tried, what was learned, and what architectural questions remain. Do NOT attempt a 4th cycle without explicit user direction.

---

## Phase 4: Post-Resolution Cleanup

**Trigger:** User confirms "问题已解决" (problem resolved).

### Step 1: Root Cause Verification (Sub-agent 1)

Dispatch a `general_purpose_task` sub-agent with these instructions:

```
Analyze the changes made to fix [problem description]. Determine:
1. Was the true root cause identified and fixed? Or was a symptom addressed?
2. Is the fix at the correct layer of the architecture?
3. Are there any remaining gaps or edge cases?

Review the git diff of all changed files. If the fix addresses a symptom rather than
the root cause, explain why and what the actual root cause appears to be.
```

**Main agent's role:** Review the sub-agent's findings. If the root cause was truly fixed, proceed to Step 2. If not, tell the user: "The fix addressed a symptom, not the root cause. The root cause appears to be [explanation]. Do you want to continue investigating the root cause?"

### Step 2: Dead Code and Redundancy Removal (Sub-agent 2)

**Only proceed if Step 1 confirmed root cause was fixed.**

Dispatch a `general_purpose_task` sub-agent with these instructions:

```
Review all changes made for [problem description]. Identify and report:

1. DEAD CODE — code that is now unreachable (unused imports, functions, variables, 
   conditional branches that can never execute)
2. REDUNDANT CHECKS — multiple guards for the same condition, duplicate validation
3. UNNECESSARY PREVENTIVE MEASURES — defensive code added during debugging that is 
   no longer needed now that the root cause is fixed
4. DIAGNOSTIC LOGS — debug/trace logs added during investigation that should be 
   removed or demoted to trace level

For each item, specify: file path, line numbers, what to remove, and why it's safe to remove.

DO NOT flag:
- Error handling that serves a legitimate purpose
- Validation at system boundaries (user input, external APIs)
- Logging at warn/error level that aids production debugging
- Defensive code that protects against external failures (not the fixed bug)
```

**Main agent's role:** Review the sub-agent's findings. Verify each recommendation is safe before applying. Remove confirmed dead code/redundancy. Then re-run tests to confirm nothing is broken.

### Step 3: Final Validation

After cleanup:
1. Run the relevant test suite to confirm no regressions
2. Verify the fix still works after cleanup
3. Mark the task complete

---

## Logging Guidelines

### Log Directory

All debug logs go to: `E:\AI-DIGITAL-LIFE\SourceWorkspace\.adl-logs`

> **IMPORTANT — `.gitignore` awareness:** `.adl-logs/` is listed in `.gitignore`. Many IDE agent tools (`Glob`, `Grep`, `SearchCodebase`) respect `.gitignore` and will silently skip files in this directory. This is the most common reason agents fail to read log files. See [Gitignore Bypass](#gitignore-bypass-for-log-access) below for the correct approach.

### Log Format

```
[Timestamp] [Level] [Component::Function] Message — key=value, key=value
```

Example:
```
[2026-07-14T15:30:00.123Z] [DEBUG] [WorkspaceStore::openWorkspace] Entering — path="E:/test", workspaceId="abc-123"
[2026-07-14T15:30:00.456Z] [DEBUG] [WorkspaceStore::openWorkspace] Git status fetched — isRepo=true, branch="main"
[2026-07-14T15:30:00.789Z] [ERROR] [WorkspaceStore::openWorkspace] Failed to load — error="ENOENT: no such file", path="E:/test/.git"
```

### Log Level Usage

| Level | When to Use |
|-------|------------|
| `DEBUG` | Tracing fix execution, verifying code path reached |
| `INFO` | State transitions, successful operations |
| `WARN` | Expected but unusual conditions (edge cases hit) |
| `ERROR` | Unexpected failures, exceptions |

### Logging Rules

- **Always include context** — which component, function, and relevant IDs/values
- **Log before and after** critical operations, not just after
- **Log error paths** — don't only log the happy path
- **Log assumptions** — if the fix assumes something (e.g., "file exists"), log when that assumption is violated
- **Remove or demote** diagnostic logs after the fix is confirmed (Phase 4, Step 2)

### Gitignore Bypass for Log Access

`.adl-logs/` is in `.gitignore` to prevent debug logs from being committed. This means tools that respect `.gitignore` (`Glob`, `Grep`, `SearchCodebase`) will **silently skip** log files — the agent will see nothing and may incorrectly conclude no logs exist.

**Correct approach (always use these):**

```
# 1. List log files — use LS, not Glob
LS(path="E:\AI-DIGITAL-LIFE\SourceWorkspace\.adl-logs")

# 2. Read log files — use Read with absolute path, not Grep
Read(file_path="E:\AI-DIGITAL-LIFE\SourceWorkspace\.adl-logs\debug-logs.txt")

# 3. Fallback — use RunCommand if LS/Read unavailable
RunCommand: Get-ChildItem "E:\AI-DIGITAL-LIFE\SourceWorkspace\.adl-logs" | Sort-Object LastWriteTime -Descending
```

**Wrong approach (will silently fail):**
```
# DO NOT USE — these respect .gitignore and will return empty results:
Glob(pattern=".adl-logs/*")
Grep(pattern="ERROR", path=".adl-logs/")
SearchCodebase(information_request="...", target_directories=[".adl-logs"])
```

**Self-check:** After listing the log directory, if you got 0 results, ask yourself: "Did I use `LS` or `Glob`?" If `Glob` — redo with `LS`. If `LS` also returned empty — the logs truly don't exist, which is a diagnostic signal (the logging code path was never reached).

---

## Decision Tree (Quick Reference)

```
Problem identified
    │
    ├─ Root cause found? ──── Yes ──→ Phase 2A: Direct Fix
    │                                    │
    │                                    └─→ Phase 3: Add logs, user tests
    │                                            │
    │                                            ├─ Fixed? ── Yes ──→ Phase 4: Cleanup
    │                                            └─ Fixed? ── No ───→ Iterate (max 3 cycles)
    │
    └─ Root cause found? ──── No ────→ Phase 2B: Design preventive measures
                                            │
                                            ├─ Single clear solution? ──→ Implement
                                            ├─ Multiple solutions? ──────→ Present options to user
                                            └─ No good solutions? ───────→ External research
                                                     │
                                                     └─→ Phase 3: Add logs, user tests
                                                             │
                                                             ├─ Fixed? ── Yes ──→ Phase 4: Cleanup
                                                             └─ Fixed? ── No ───→ Iterate (max 3 cycles)
```

---

## Red Flags

Stop and re-evaluate if you find yourself:

- **Adding a preventive measure without exhausting root cause investigation** — Return to `systematic-debugging` Phase 1
- **Proposing a fix without understanding why it works** — You're guessing, not engineering
- **Adding multiple defensive checks "just in case"** — Each one has a cost; only add what's proven necessary
- **Skipping log analysis after user testing** — You're blind without evidence
- **Removing code without understanding why it was added** — That "redundant" check might be covering a subtle edge case
- **Iterating past 3 cycles without architectural discussion** — The problem is likely systemic
- **Using `Glob`/`Grep`/`SearchCodebase` to read `.adl-logs/`** — These respect `.gitignore` and will return empty. Use `LS` + `Read` instead.
- **Concluding "no logs exist" after using the wrong tool** — Verify with `LS` before drawing conclusions.

---

## Related Skills

- **`systematic-debugging`** — Phase 1: Root cause investigation. Use BEFORE this skill.
- **`verification-before-completion`** — Verify fixes before claiming success.
- **`test-driven-development`** — Create failing tests before fixing.