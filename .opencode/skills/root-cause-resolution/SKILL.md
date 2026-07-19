---
name: root-cause-resolution
description: Systematic root cause investigation before any fix. Invoke when encountering bugs, test failures, or unexpected behavior — MUST complete Phase 0 investigation before proposing fixes.
---

# Root Cause Resolution

## Overview

Random fixes waste time and create new bugs. Quick patches mask underlying issues.

**Core principle:** ALWAYS find root cause before attempting fixes. Symptom fixes are failure.

**Phases:** 0 (Investigation) → 1 (Path) → 2 (Fix) → 3 (Verification) → 4 (Cleanup)

**Violating the letter of this process is violating the spirit of debugging.**

## The Iron Law

```
NO FIXES WITHOUT ROOT CAUSE INVESTIGATION FIRST
```

---

## Phase 0: Root Cause Investigation

BEFORE attempting ANY fix, complete ALL of the following steps.

### Step 1: Read Error Messages Carefully
- Read stack traces completely — note line numbers, file paths, error codes
- Don't skip past errors or warnings
- Error messages often contain the exact solution

### Step 2: Reproduce Consistently
- Can you trigger it reliably? What are the exact steps?
- If not reproducible:
  - Add instrumentation at suspected trigger points (see [Root Cause Tracing](#root-cause-tracing))
  - Check if the issue is environment-specific (OS, Node version, config differences)
  - Review logs from the project's debug log files (`debug-logs.txt` in Tauri mode, `debug-logs-browser.txt` in browser mode)
  - Do NOT guess — gather more data until you can reproduce or isolate the trigger

### Step 3: Check Recent Changes
- Git diff, recent commits — what changed that could cause this?
- New dependencies, config changes, environmental differences

### Step 4: Gather Evidence in Multi-Component Systems

When the system has multiple components (API → service → database, CI → build → signing), add diagnostic instrumentation BEFORE proposing fixes:

For EACH component boundary:
- Log what data enters and exits the component
- Verify environment/config propagation
- Check state at each layer

Run once to gather evidence showing WHERE it breaks, THEN analyze to identify the failing component, THEN investigate that component.

### Step 5: Trace Data Flow

When the error is deep in the call stack, trace backward to find the original trigger:
- Where does the bad value originate?
- What called this with the bad value?
- Keep tracing up until you find the source
- Fix at source, not at symptom

See [Root Cause Tracing](#root-cause-tracing) for the complete technique.

### Step 6: Pattern Analysis
- Find working examples — what works that's similar to what's broken?
- Compare against references — read reference implementations completely
- Identify differences — list every difference between working and broken, however small
- Understand dependencies — what other components, config, environment does this need?

### Step 7: Hypothesis and Testing (Scientific Method)
1. Form a single hypothesis: "I think X is the root cause because Y" — be specific
2. Test minimally — make the SMALLEST possible change, one variable at a time
3. Verify before continuing — if it worked, proceed. If not, form a NEW hypothesis. DON'T add more fixes on top.

**When you don't know:** Say "I don't understand X." Research more. Don't pretend to know.

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

**If you haven't met the above:** Return to Phase 0. Do NOT proceed to Path B prematurely.

→ Proceed to Phase 2B (Preventive Measures).

---

## Phase 2A: Direct Fix (Root Cause Known)

1. **Create a failing test case** — Simplest possible reproduction. Automated test if possible; one-off test script if no framework.
2. **Design the fix** — Address the root cause at its source, not downstream. ONE change at a time. No "while I'm here" improvements.
3. **Check for siblings** — Are there other places in the codebase with the same root cause pattern? Fix them together.
4. **Add verification logging** — See [Logging Guidelines](#logging-guidelines) for format and location.
5. **Proceed to Phase 3**

**If fix doesn't work:**
- 1st-2nd failure → Return to Phase 0, re-analyze with new information
- **3rd+ failure → STOP.** Question the architecture (see [When 3+ Fixes Failed](#when-3-fixes-failed-question-architecture))

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
1. Search the web (`WebSearch`) for how similar products handle the same problem
2. Check official documentation of relevant libraries/frameworks
3. Search community discussions (GitHub issues, Stack Overflow, forums)
4. Evaluate external solutions against the same framework above
5. Combine with your own knowledge — adapt to the project context, don't blindly copy

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
3. Do NOT preemptively declare success

### Step 3: Log Analysis

After user confirms testing is complete, read the log files from the project's log directory (`.adl-logs/` — see [Logging Guidelines](#logging-guidelines)).

**Use the right tools** — `.adl-logs/` is in `.gitignore`, so `Glob`/`Grep`/`SearchCodebase` will silently skip it:

| Tool | Safe? | Notes |
|------|-------|-------|
| `LS` with absolute path | Yes | Lists directory directly, bypasses `.gitignore` |
| `Read` with absolute path | Yes | Reads file directly, bypasses `.gitignore` |
| `RunCommand` | Yes | Shell commands don't respect `.gitignore` |
| `Glob` / `Grep` / `SearchCodebase` | **No** | These respect `.gitignore` and will miss log files |

**Also check the project's runtime debug logs:**
- Tauri mode: `debug-logs.txt` (project root)
- Browser mode: `debug-logs-browser.txt` (project root)
- These can be exported via the UI's "Copy Debug Logs" button or `__exportDebugLogs()` in console

**Procedure:**
1. Use `LS` to list all files in the log directory (`.adl-logs/`)
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

### When 3+ Fixes Failed: Question Architecture

**Pattern indicating architectural problem:**
- Each fix reveals new shared state/coupling/problem in a different place
- Fixes require "massive refactoring" to implement
- Each fix creates new symptoms elsewhere

**STOP and question fundamentals:**
- Is this pattern fundamentally sound?
- Are we "sticking with it through sheer inertia"?
- Should we refactor architecture vs. continue fixing symptoms?

**Discuss with your human partner before attempting more fixes.** This is NOT a failed hypothesis — this is a wrong architecture.

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
| Deadlock prevention | If the same issue persists after 3 full loops (report → implement → re-check → same issue), escalate to user |

### Step 1: Root Cause Verification (Per-Problem Report Loop)

**Only proceed for problems that passed Phase 3 verification.**

For EACH problem, dispatch a read-only sub-agent (`subagent_type: "search"`) with these instructions:

```
Analyze the changes made to fix [PROBLEM_DESCRIPTION]. Perform a comprehensive review:

**1. Root Cause & Correctness:**
- Was the true root cause identified and fixed? Or was a symptom addressed?
- Are there any remaining gaps or edge cases?
- Is the fix complete (handles all trigger conditions, not just the observed case)?

**2. Technical Approach & Design Quality:**
- Is the chosen solution appropriate? Are there simpler or more robust alternatives?
- Code-level design: naming, function responsibility, readability, SOLID principles
- Module-level design: coupling, cohesion, interface design, dependency direction
- Architecture-level design: is the fix at the correct layer? Does it maintain architectural consistency?

**3. Side Effects & Safety:**
- Could this fix introduce regressions or new bugs?
- Are there performance implications?
- Does it affect other components or shared state?

Review the git diff of all changed files relevant to this problem.

CRITICAL: Do NOT modify any files. Produce a structured report only. For each issue found, include severity (critical/high/medium/low) and suggested fix.
```

**Loop execution:**
1. Dispatch sub-agent(s) → wait for all reports
2. Verify each report (reasonableness, truthfulness, feasibility); reject unreliable findings
3. If verified reports identify issues → implement deeper fixes
4. Re-dispatch same sub-agent(s) for re-check
5. If all sub-agents report "no issues" → proceed to Step 2
6. If the same issue persists after 3 cycles → escalate (see below)

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
6. If the same issue persists after 3 cycles → escalate to user

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

The project's debug log directory is `.adl-logs/` (listed in `.gitignore`). Use `LS` + `Read` with absolute paths to access it, never `Glob`/`Grep`/`SearchCodebase`.

Additionally, the project writes runtime debug logs to the project root:
- `debug-logs.txt` — Tauri desktop mode
- `debug-logs-browser.txt` — browser preview mode

These can be exported via the UI's "Copy Debug Logs" button or `__exportDebugLogs()` in the browser console.

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

## Root Cause Tracing

Bugs often manifest deep in the call stack. Fixing where the error appears treats a symptom.

**Core principle:** Trace backward through the call chain until you find the original trigger, then fix at the source.

### The Tracing Process

#### 1. Observe the Symptom
```
Error: git init failed in ~/project/packages/core
```

#### 2. Find Immediate Cause
What code directly causes this? The final function in the call stack.

#### 3. Ask: What Called This?
Trace one level up — who passed the arguments? What called the failing function?

#### 4. Keep Tracing Up
Continue tracing backward. Look for where the bad value entered the chain.

#### 5. Find Original Trigger
The source is where the wrong value was first introduced. Fix AT this point, not at the symptom.

### Adding Stack Traces

When you can't trace manually, add instrumentation:
```typescript
const stack = new Error().stack;
console.error('DEBUG operation:', { directory, cwd, stack });
```

**Critical:** Use `console.error()` in tests (logger may be suppressed). Run and capture:
```powershell
pnpm test 2>&1 | Select-String 'DEBUG operation'
```

### Stack Trace Tips
- **In tests:** Use `console.error()` not logger — logger may be suppressed
- **Before operation:** Log before the dangerous operation, not after it fails
- **Include context:** Directory, cwd, environment variables, timestamps
- **Capture stack:** `new Error().stack` shows complete call chain

**NEVER fix just where the error appears.** Trace back to find the original trigger.

---

## Decision Tree (Quick Reference)

```
Bug / unexpected behavior
    │
    ├─ Phase 0: Root Cause Investigation (7 steps)
    │     ├─ Errors read? Reproduced? Changes checked?
    │     ├─ Evidence gathered? Data traced?
    │     ├─ Pattern analyzed? Hypothesis tested?
    │     │
    │     └─ Root cause confirmed? ──── Yes ──→ Phase 1 → Phase 2A → Phase 3
    │                                    No
    │                                    │
    │                                    └─ Exhausted all techniques?
    │                                          │
    │                                          ├─ No ──→ Return to Phase 0
    │                                          │
    │                                          └─ Yes ──→ Phase 1 → Phase 2B → Phase 3
    │
    ├─ Phase 3 → Fixed? (trigger detected)
    │     │
    │     ├─ Yes ──→ Phase 4 (per-problem sub-agents)
    │     │             ├─ Step 1: Root cause verification
    │     │             ├─ Step 2: Dead code removal
    │     │             └─ Step 3: Final validation
    │     │
    │     └─ No ──→ Iterate (max 3 cycles)
    │                  │
    │                  └─ 3+ failures ──→ Question architecture
    │
    └─ Phase 2A/B → Regression? ──→ Revert/adjust fix
```

---

## Red Flags

Stop and re-evaluate if you find yourself:

- **"Quick fix for now, investigate later"** — First fix sets the pattern. Do it right from the start.
- **"Just try changing X and see if it works"** — Guessing, not engineering. Return to Phase 0.
- **"I don't fully understand but this might work"** — STOP. Understand before fixing.
- **Adding multiple changes at once** — Can't isolate what worked. One variable at a time.
- **Skipping verification logging** — You're blind without evidence.
- **Skipping the failing test first** — Untested fixes don't stick. Write the test first.
- **Proposing solutions before tracing data flow** — You don't know the root cause.
- **"One more fix attempt" (after 2+ failures)** — 3+ failures = architectural problem.
- **Each fix reveals a new problem in a different place** — Pattern indicating systemic issue.
- **Adding preventive measures without exhausting root cause investigation** — Return to Phase 0.
- **Iterating past 3 cycles on the same issue without escalation** — Escalate to user.
- **Using `Glob`/`Grep`/`SearchCodebase` to read `.gitignore`-protected log directories** — Use `LS` + `Read`.
- **Concluding "no logs exist" after using the wrong tool** — Verify with `LS` first.
- **User confirms "问题已解决" but you do NOT proceed to Phase 4** — Trigger detection is mandatory.
- **Skipping the re-check cycle after main agent implementation** — The loop is mandatory.
- **Sub-agent modifying code** — Always use `subagent_type: "search"`, read-only. Correct the behavior immediately; do NOT return to Phase 0 for this.

**Any of the above (except the last) means: STOP. Return to Phase 0.**

---

## Common Rationalizations

| Excuse | Reality |
|--------|---------|
| "Issue is simple, don't need process" | Simple issues have root causes too. Process is fast for simple bugs. |
| "Emergency, no time for process" | Systematic debugging is FASTER than guess-and-check thrashing. |
| "Just try this first, then investigate" | First fix sets the pattern. Do it right from the start. |
| "I'll write test after confirming fix works" | Untested fixes don't stick. Test first proves it. |
| "Multiple fixes at once saves time" | Can't isolate what worked. Causes new bugs. |
| "I see the problem, let me fix it" | Seeing symptoms ≠ understanding root cause. |
| "One more fix attempt" (after 2+ failures) | 3+ failures = architectural problem. Question pattern, don't fix again. |
| "No logs exist" (without checking with `LS` + `Read`) | Verify with `LS` first, then `Read` with absolute path before drawing conclusions. |
| "Sub-agent modifying code is faster" | Sub-agents produce reports. Main agent implements. No exceptions. |

---

## Quick Reference

| Phase | Key Activities | Success Criteria |
|-------|---------------|------------------|
| **0. Investigation** | Read errors, reproduce, check changes, gather evidence, trace data, pattern analysis, hypothesis testing | Understand WHAT and WHY |
| **1. Path** | Determine if root cause is known or not | Clear path chosen (A or B) |
| **2A. Direct Fix** | Failing test, design fix, check siblings, add logging | Fix addresses root cause |
| **2B. Preventive** | Design solutions, present options, external research | Solution chosen and implemented |
| **3. Verification** | Logging, user testing, log analysis | Problem confirmed resolved |
| **4. Cleanup** | Root cause verification, dead code removal, final validation | Clean, verified, complete |

---

## Related Skills

- **`verification-before-completion`** — Verify fixes before claiming success.
- **`test-driven-development`** — Create failing tests before fixing.
- **`using-superpowers`** — Entry point for skill system.