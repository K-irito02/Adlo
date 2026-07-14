---
name: root-cause-resolution
description: Root-cause-first bug fixing: solution design, log-driven verification, post-fix cleanup. Invoke AFTER systematic-debugging or when deciding how to fix a confirmed bug.
---

# Root Cause Resolution

## Overview

This skill governs the **solution phase** of debugging — from the moment `systematic-debugging` concludes, through solution design, verification, and post-fix cleanup.

**Core principle:** Root cause fix first. Preventive measures only when root cause is genuinely unfixable. Every solution must be proven real and effective.

**Phases:** 0 (Prerequisites) → 1 (Path) → 2 (Fix) → 3 (Verification) → 4 (Cleanup)

---

## Phase 0: Confirm Prerequisites

Before proceeding, verify ALL of the following:

1. **`systematic-debugging` has completed** — You have a documented root cause hypothesis OR a documented conclusion that root cause is unfindable
2. **Problem is understood** — You can describe the symptom, trigger conditions, and affected components
3. **Scope is clear** — Single problem or multiple independent problems (list them as `[A, B, C...]`)

If any prerequisite is missing, return to `systematic-debugging`. Do NOT proceed.

**Multiple problems?** Track them as a list: `[Problem A: description, Problem B: description, ...]`. Each problem gets its own fix path, its own verification, and its own Phase 4 sub-agent(s).

---

## Phase 1: Determine the Path

### Path A: Root Cause Identified

**Criteria (ALL must be met):**
- You can explain the exact mechanism causing the problem
- You can trace the data/control flow from trigger to symptom
- Changing the identified cause would fix the issue without side effects

→ Proceed to Phase 2A (Direct Fix).

### Path B: Root Cause NOT Identified

**Only conclude "no root cause" when ALL of these are true:**
- You have exhausted all investigation techniques (full call stack, component boundaries, git history, consistent reproduction)
- The issue is confirmed environmental (OS-level, hardware, external service with no workaround) OR a known limitation of a third-party dependency with no upgrade path
- You have documented exactly what you investigated and why each path dead-ended

**If you haven't met the above:** Return to `systematic-debugging`. Do NOT proceed to Path B prematurely.

→ Proceed to Phase 2B (Preventive Measures).

---

## Phase 2A: Direct Fix (Root Cause Known)

1. **Design the fix** — Address the root cause at its source, not downstream
2. **Check for siblings** — Are there other places in the codebase with the same root cause pattern? Fix them together
3. **Add verification logging** — Add logs at the fix point to confirm the fix works. See [Logging Guidelines](#logging-guidelines) for format and location.
4. **Run regression check** — If the project has existing tests covering the affected area, run them now to catch regressions before user testing
5. **Proceed to Phase 3**

---

## Phase 2B: Preventive Measures (No Root Cause)

### Step 1: Design Candidate Solutions

For each candidate, evaluate against this framework:

| Dimension | Questions to Answer |
|-----------|-------------------|
| **Coverage** | What scenarios does it handle? What does it miss? |
| **Complexity** | How much code? New dependencies? New concepts? |
| **Side-effect risk** | What else could break? Performance impact? |
| **Maintainability** | Will future developers understand it? Easy to debug? |
| **False positive risk** | Could it block legitimate behavior? |
| **Reversibility** | How easy to undo if it causes problems? |

### Step 2: Present Options to User

When multiple viable solutions exist, use `AskUserQuestion`:

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
5. **Combine with your own knowledge** — adapt to the project context, don't blindly copy

**Research query templates:**
```
"[technology/library] [problem description] best practice"
"How does [similar product] handle [problem scenario]"
"[error message or symptom] solution site:github.com"
```

### Step 4: Implement and Proceed

Once a solution is chosen (by user or via research), implement it and proceed to Phase 3.

---

## Phase 3: Verification

### Step 1: Add Verification Logging

If not already added in Phase 2A, add diagnostic logs at key points. See [Logging Guidelines](#logging-guidelines) for format and location.

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

After user confirms testing is complete, read the log files from the project's log directory (see [Logging Guidelines](#logging-guidelines) for path).

**Use the right tools** — `.adl-logs/` is in `.gitignore`, so `Glob`/`Grep`/`SearchCodebase` will silently skip it:

| Tool | Safe? | Notes |
|------|-------|-------|
| `LS` with absolute path | Yes | Lists directory directly, bypasses `.gitignore` |
| `Read` with absolute path | Yes | Reads file directly, bypasses `.gitignore` |
| `RunCommand` | Yes | Shell commands don't respect `.gitignore` |
| `Glob` / `Grep` / `SearchCodebase` | **No** | These respect `.gitignore` and will miss log files |

**Procedure:**
1. Use `LS` to list all files in the log directory
2. Use `Read` with absolute paths to read the most recent log files
3. Check for:
   - **Expected log entries** — confirming the fix is active
   - **Error entries** — indicating the fix failed or encountered edge cases
   - **Missing entries** — suggesting the fix code path wasn't reached
   - **Unexpected patterns** — anything that doesn't match the hypothesis

**If log directory is empty or doesn't exist:** The logging code path was never reached — this is itself a diagnostic signal. Re-examine the fix to ensure logging is placed correctly.

### Step 4: Handle Results

| Result | Action |
|--------|--------|
| Logs confirm fix works, user confirms problem resolved | → Phase 4 (see [Trigger Detection](#trigger-detection)) |
| Logs show fix partially works but has gaps | Identify gaps, return to Phase 2A/2B to refine |
| Logs show fix didn't work at all | Re-examine: is it the solution, the code, the approach, or the architecture? |
| Fix introduces a regression (new bug or test failure) | Revert or adjust the fix; re-evaluate side effects |
| User says "问题还是没有解决" | Go to [Iteration on Failure](#iteration-on-failure) |

### Iteration on Failure

When the user reports the problem persists after testing:

1. **Re-examine the solution** — Was the hypothesis wrong? Did the fix address a symptom, not the cause?
2. **Re-examine the code** — Is the implementation correct? Are there edge cases?
3. **Re-examine the approach** — Is the technical strategy sound? Are there fundamental conflicts?
4. **Re-examine the architecture** — Is this a systemic issue that can't be fixed at the component level?
5. **If still stuck** — Go to external research (Phase 2B, Step 3)

**After 3 failed iteration cycles, STOP.** Escalate to the user with:
- What was tried in each cycle
- What was learned
- What architectural questions remain

Do NOT attempt a 4th cycle without explicit user direction.

### Trigger Detection

The trigger for Phase 4 is any user message indicating the problem is resolved. You MUST actively detect these patterns:

| Language | Examples |
|----------|----------|
| Chinese | "问题已解决", "已解决", "搞定了", "没问题了", "可以了", "好了", "解决了" |
| English | "it's fixed", "problem resolved", "solved", "done", "works now", "resolved", "fixed" |

**Rule:** When you see any trigger phrase after Phase 3, immediately proceed to Phase 4. Do NOT ask "should I clean up?" or similar confirmations.

**Ambiguous triggers:** If the message could mean something else (e.g., "好了" might mean "stop"), ask once: "确认问题已解决，可以开始清理了吗？" Then proceed on confirmation.

---

## Phase 4: Post-Resolution Cleanup

### Step 0: Identify Problem List

- **Single problem:** Proceed with 1 sub-agent per step below
- **Multiple independent problems:** Dispatch N parallel sub-agents per step, one per problem

Maintain a list like `[A: description, B: description, C: description]` throughout Phase 4.

### Sub-Agent Workflow: Report-Only Loop

**CRITICAL — Sub-agents NEVER modify code.** Their sole job is to produce structured reports. All code changes are made by the main agent.

Every sub-agent dispatch follows this cycle:

```
Sub-agent (read-only report)
       │
       ▼
Main agent verifies report
 (reasonable? truthful? feasible?)
       │
       ├─ Report rejected ──→ re-dispatch or clarify
       │
       └─ Report accepted
              │
              ▼
       Main agent implements fixes
              │
              ▼
       Sub-agent re-checks (same scope)
              │
              ├─ Issues remain ──→ back to Main agent implements
              │
              └─ No issues ──→ proceed
```

**Rules:**

| Rule | Description |
|------|-------------|
| Subagent type | Always use `subagent_type: "search"` for report-only sub-agents |
| No code modification | Sub-agents MUST NOT write, edit, or delete any file, nor run any command that modifies the codebase |
| Mandatory re-check | After each main-agent implementation cycle, sub-agents MUST re-run their full analysis |
| Report verification | Main agent MUST review sub-agent reports for reasonableness, truthfulness, and feasibility before implementing any fix |
| No skipping | Main agent MUST NOT skip the re-check cycle or declare success without sub-agent confirmation |
| Per-problem loop | Each problem runs its own independent loop with its own sub-agent |
| Termination | Loop ends only when the sub-agent reports "no issues found" |
| Max 3 cycles | After 3 full loops (report → implement → re-check → still issues), escalate to user |

### Step 1: Root Cause Verification (Per-Problem Report Loop)

**Only proceed for problems that passed Phase 3 verification.**

For EACH problem, dispatch a read-only sub-agent (`subagent_type: "search"`) with these instructions:

```
Analyze the changes made to fix [PROBLEM_DESCRIPTION]. Determine:
1. Was the true root cause identified and fixed? Or was a symptom addressed?
2. Is the fix at the correct layer of the architecture?
3. Are there any remaining gaps or edge cases?

Review the git diff of all changed files relevant to this problem. If the fix addresses
a symptom rather than the root cause, explain why and what the actual root cause appears to be.

CRITICAL: Do NOT modify any files. Produce a structured report only.
```

**Loop execution:**
1. Dispatch sub-agent(s) → wait for all reports
2. Verify each report (reasonableness, truthfulness, feasibility); reject unreliable findings
3. If verified reports identify issues → implement deeper fixes
4. Re-dispatch same sub-agent(s) for re-check
5. If all sub-agents report "no issues" → proceed to Step 2
6. If issues remain after 3 cycles → escalate (see below)

**Escalation:** "Problem [N] was fixed at the symptom level, not the root cause. The root cause appears to be [explanation]. Do you want to continue investigating?" Only proceed to Step 2 for problems where root cause is confirmed.

### Step 2: Dead Code and Redundancy Removal (Per-Problem Report Loop)

**Only proceed for problems where Step 1 confirmed root cause was fixed.**

For EACH such problem, dispatch a read-only sub-agent (`subagent_type: "search"`) with these instructions:

```
Review all changes made for [PROBLEM_DESCRIPTION]. Identify and report:

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

CRITICAL: Do NOT modify any files. Produce a structured report only.
```

**Loop execution:**
1. Dispatch sub-agent(s) → wait for all reports
2. Verify each report; discard unreliable recommendations
3. Apply verified removals
4. Re-dispatch same sub-agent(s) for re-check
5. If all sub-agents report "no issues found" → proceed to Step 3
6. If issues remain after 3 cycles → escalate to user

### Step 3: Final Validation

After all cleanup is complete:

1. **Run the project's end-of-work acceptance flow** — Follow the procedure defined in `mandatory-testing.md`:
   - Run ESLint/Prettier/Clippy/rustfmt checks
   - Run type checking
   - Run the relevant test suite
2. **Verify all fixes still work** — For each problem, confirm the fix is intact after cleanup
3. **Mark the task complete**

---

## Logging Guidelines

### Log Directory

The project's debug log directory is listed in `.gitignore`. Use `LS` + `Read` with absolute paths to access it, never `Glob`/`Grep`/`SearchCodebase`.

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

- **Always include context** — component, function, and relevant IDs/values
- **Log before and after** critical operations, not just after
- **Log error paths** — don't only log the happy path
- **Log assumptions** — if the fix assumes something (e.g., "file exists"), log when that assumption is violated
- **Remove or demote** diagnostic logs after the fix is confirmed (Phase 4, Step 2)

---

## Decision Tree (Quick Reference)

```
Problem identified
    │
    ├─ Phase 0: Confirm prerequisites (systematic-debugging done? problem understood?)
    │
    ├─ Single problem ──────→ Proceed through Phases 1-4
    │
    ├─ Multiple problems ───→ Track as [A, B, C...]; each gets own path
    │
    ├─ Root cause found? ──── Yes ──→ Phase 2A: Direct Fix
    │                                    │
    │                                    └─→ Phase 3: Logs, user tests, log analysis
    │                                            │
    │                                            ├─ Fixed? (trigger detected)
    │                                            │   └─→ Phase 4: Cleanup (per-problem sub-agents)
    │                                            │         ├─ Step 1: Root cause verification
    │                                            │         ├─ Step 2: Dead code removal
    │                                            │         └─ Step 3: Final validation
    │                                            │
    │                                            └─ Not fixed? ───→ Iterate (max 3 cycles)
    │                                                   │
    │                                                   └─ Regression? ──→ Revert/adjust fix
    │
    └─ Root cause found? ──── No ────→ Phase 2B: Design preventive measures
                                            │
                                            ├─ Single clear solution? ──→ Implement → Phase 3
                                            ├─ Multiple solutions? ──────→ Present options → Implement → Phase 3
                                            └─ No good solutions? ───────→ External research → Implement → Phase 3
```

---

## Red Flags

Stop and re-evaluate if you find yourself:

- **Adding a preventive measure without exhausting root cause investigation** — Return to `systematic-debugging`
- **Proposing a fix without understanding why it works** — You're guessing, not engineering
- **Adding multiple defensive checks "just in case"** — Each has a cost; only add what's proven necessary
- **Skipping log analysis after user testing** — You're blind without evidence
- **Removing code without understanding why it was added** — That "redundant" check might cover a subtle edge case
- **Iterating past 3 cycles without architectural discussion** — The problem is likely systemic
- **Using `Glob`/`Grep`/`SearchCodebase` to read `.gitignore`-protected log directories** — Use `LS` + `Read` instead
- **Concluding "no logs exist" after using the wrong tool** — Verify with `LS` before drawing conclusions
- **User confirms "问题已解决" but you do NOT proceed to Phase 4** — Trigger detection is mandatory
- **Dispatching a single sub-agent for multiple independent problems** — Each problem gets its own sub-agent
- **Sub-agent modifying code** — Sub-agents are read-only, always use `subagent_type: "search"`
- **Skipping the re-check cycle after main agent implementation** — The loop is mandatory
- **Declaring success without sub-agent confirmation** — Wait for "no issues found" report
- **Skipping Phase 0 prerequisite check** — Confirm `systematic-debugging` has completed before proceeding
- **Ignoring a regression introduced by the fix** — Revert or adjust immediately

---

## Related Skills

- **`systematic-debugging`** — Phase 1: Root cause investigation. Use BEFORE this skill.
- **`verification-before-completion`** — Verify fixes before claiming success.
- **`test-driven-development`** — Create failing tests before fixing.