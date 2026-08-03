# Refactoring Task 19 + Final Review + Finishing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the final implementation task (19) of the 2026-07-10 refactoring effort — auditing `react-hooks/exhaustive-deps` eslint-disable directives in the browser and git-visualization features — then run the whole-branch review and finish the development branch.

**Architecture:** Task 19 is frontend-only, touching 5 files across `browser` and `git-visualization` features: 3 directives need explanatory comments (mount-only effects), 1 directive is misplaced inside a cleanup function and must be removed, and 1 block-level disable hides a real bug (missing `t` dependency in `AddManualPortDialog`'s `handleConfirm`). After Task 19, the controller dispatches a final whole-branch reviewer covering all 19 tasks (`90f3f063..HEAD`), then uses `superpowers:finishing-a-development-branch` to merge or create a PR.

**Tech Stack:** React 19 / Vite 8 / TypeScript 5.6 / ESLint 9 (with `eslint-plugin-react-hooks`) / Vitest 3 / pnpm 11

## Global Constraints

- **No `any` type**: Use precise types, `unknown`, and type guards (project rule `dev-rules.md`)
- **No `else`**: Use early-return pattern (project rule `dev-rules.md`)
- **Node.js PATH**: Run `$env:Path = "D:\Program Files\nodejs;$env:Path"` before any `pnpm`/`npm` command
- **PowerShell heredoc**: Use `@'...'@` here-strings for multi-line commit messages (NOT bash `$(cat <<'EOF')`)
- **Acceptance flow**: After all code changes, run the mandatory testing flow (ESLint + Prettier + typecheck + tests for frontend)
- **Pre-existing errors**: 4 TS errors (workspace-browser/index.ts, StatusBar.tsx, StatusBarEditorInfo.tsx) and 2 Rust test failures (adl-model-gateway) are pre-existing and unrelated — do NOT fix them in this plan
- **Pre-existing uncommitted changes**: ~15 files in the working tree (App.tsx, gitSlice.ts, etc.) are uncommitted from prior work — do NOT stage or commit them; only stage the files this plan specifies
- **ESLint inline comment syntax**: Explanatory comments on `eslint-disable-next-line` use `--` as the separator: `// eslint-disable-next-line rule-name -- explanation`

---

## Prerequisite: Task 18 Review

> Task 18 (document `#[allow(dead_code)]` suppressions) is implemented at commit `aa301c43` but its reviewer was not yet dispatched. The review package is already generated at `.superpowers/sdd/review-fcb19414..aa301c43.diff`.

- [ ] **Step 0: Dispatch Task 18 reviewer**

Dispatch a task reviewer subagent with:
- **BRIEF_FILE**: `.superpowers/sdd/task-18-brief.md`
- **REPORT_FILE**: `.superpowers/sdd/task-18-report.md`
- **BASE_SHA**: `fcb19414`
- **HEAD_SHA**: `aa301c43`
- **DIFF_FILE**: `.superpowers/sdd/review-fcb19414..aa301c43.diff`

Expected: Spec ✅, Quality Approved. Task 18 is a documentation-only change (2 inline comments added to `#[allow(dead_code)]` attributes) — low risk.

- [ ] **Step 0a: Update progress ledger**

After approval, update `.superpowers/sdd/progress.md`:
- Task 18 row: status `✅ Complete`, commits `fcb19414..aa301c43`, review `Clean — Spec ✅, Quality Approved`

Only proceed to Task 19 after Task 18 review is approved.

---

## File Structure

### Files to Modify (Task 19)

| File | Line(s) | Change |
|------|---------|--------|
| `ai-digital-life/frontend/src/app/features/git-visualization/hooks/useECharts.ts` | 33 | Add `-- mount-only: ...` comment to eslint-disable |
| `ai-digital-life/frontend/src/app/features/browser/useBrowserPageMeta.ts` | 274 | Add `-- mount-only: ...` comment to eslint-disable |
| `ai-digital-life/frontend/src/app/features/browser/useBrowserUrlChange.ts` | 312 | Remove misplaced eslint-disable directive (inside cleanup, not deps array) |
| `ai-digital-life/frontend/src/app/features/browser/browser-landing/AddManualPortDialog.tsx` | 28, 40, 41 | Remove `/* eslint-disable */` + `/* eslint-enable */` block; add `t` to deps array |
| `ai-digital-life/frontend/src/app/features/browser/browser-landing/LocalPortSection.tsx` | 99 | Add `-- mount-only: ...` comment to eslint-disable |

### Files NOT Modified (Task 19)

| File | Reason |
|------|--------|
| `ai-digital-life/frontend/src/app/features/browser/SafeIframe.tsx` | Line 93 — already has a 2-line comment (lines 91-92) explaining the suppression. No change needed. |

### Files to Create

None.

---

## Task 19: Audit react-hooks/exhaustive-deps eslint-disable directives

> **Context:** 6 `eslint-disable` directives for `react-hooks/exhaustive-deps` exist in the browser and git-visualization features. Audit found:
> - 1 already documented (`SafeIframe.tsx:93`) — no change
> - 1 misplaced directive (`useBrowserUrlChange.ts:312`) — remove
> - 1 hiding a real bug (`AddManualPortDialog.tsx:28`) — fix missing `t` dep, remove directive
> - 3 undocumented mount-only effects (`useECharts.ts:33`, `useBrowserPageMeta.ts:274`, `LocalPortSection.tsx:99`) — add comments

**Files:**
- Modify: `ai-digital-life/frontend/src/app/features/git-visualization/hooks/useECharts.ts` (line 33)
- Modify: `ai-digital-life/frontend/src/app/features/browser/useBrowserPageMeta.ts` (line 274)
- Modify: `ai-digital-life/frontend/src/app/features/browser/useBrowserUrlChange.ts` (line 312)
- Modify: `ai-digital-life/frontend/src/app/features/browser/browser-landing/AddManualPortDialog.tsx` (lines 28, 40, 41)
- Modify: `ai-digital-life/frontend/src/app/features/browser/browser-landing/LocalPortSection.tsx` (line 99)
- No change: `ai-digital-life/frontend/src/app/features/browser/SafeIframe.tsx` (line 93 — already documented)

**Interfaces:**
- Consumes: nothing
- Produces: documented suppressions + 1 bug fix (AddManualPortDialog `t` dependency)

- [ ] **Step 1: Add comment to useECharts.ts line 33**

Read `ai-digital-life/frontend/src/app/features/git-visualization/hooks/useECharts.ts` lines 30-35.

Current state (lines 32-34):
```typescript
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
```

This is a mount-only effect: it initializes the ECharts instance, sets the initial option, and attaches a `ResizeObserver`. The `option` parameter is intentionally excluded because option updates are handled by a separate effect below (lines 36-38: `useEffect(() => { chartRef.current?.setOption(option, true); }, [option])`). Adding `option` to this effect's deps would tear down and recreate the chart on every option change.

Change line 33 from:
```typescript
    // eslint-disable-next-line react-hooks/exhaustive-deps
```
To:
```typescript
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only: init chart + ResizeObserver once; option updates handled by the effect below
```

- [ ] **Step 2: Add comment to useBrowserPageMeta.ts line 274**

Read `ai-digital-life/frontend/src/app/features/browser/useBrowserPageMeta.ts` lines 270-277.

Current state (lines 273-276):
```typescript
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );
```

This is the `handlePageMeta` `useCallback` (line 189). It reads the latest state via `useAppStore.getState()` (line 196) and refs (`pendingNavigationsRef`, `processedMetaRef`) rather than closure-captured values. Adding the store actions or refs as deps would recreate the callback on every state change, breaking the subscription identity that consumers depend on (the callback is passed to `browser.onUrlChanged` and meta-changed event handlers which compare callback identity).

Change line 274 from:
```typescript
    // eslint-disable-next-line react-hooks/exhaustive-deps
```
To:
```typescript
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only: handler reads latest state via refs and useAppStore.getState(); adding deps would recreate the callback and break the subscription
```

- [ ] **Step 3: Remove misplaced directive in useBrowserUrlChange.ts line 312**

Read `ai-digital-life/frontend/src/app/features/browser/useBrowserUrlChange.ts` lines 308-318.

Current state (lines 310-317):
```typescript
    return () => {
      unsubUrl();
      // eslint-disable-next-line react-hooks/exhaustive-deps
      for (const timer of fallbackTimeoutsRef.current.values()) {
        clearTimeout(timer);
      }
      fallbackTimeoutsRef.current.clear();
    };
```

The directive on line 312 is inside the cleanup function of the `useEffect` (line 170), positioned before a `for` loop — not before a deps array. The `react-hooks/exhaustive-deps` rule only applies to hooks' dependency arrays, so this directive is ineffective and misleading. Remove it.

Change lines 310-317 from:
```typescript
    return () => {
      unsubUrl();
      // eslint-disable-next-line react-hooks/exhaustive-deps
      for (const timer of fallbackTimeoutsRef.current.values()) {
        clearTimeout(timer);
      }
      fallbackTimeoutsRef.current.clear();
    };
```
To:
```typescript
    return () => {
      unsubUrl();
      for (const timer of fallbackTimeoutsRef.current.values()) {
        clearTimeout(timer);
      }
      fallbackTimeoutsRef.current.clear();
    };
```

- [ ] **Step 4: Fix missing `t` dependency in AddManualPortDialog.tsx**

Read `ai-digital-life/frontend/src/app/features/browser/browser-landing/AddManualPortDialog.tsx` lines 26-42.

Current state (lines 28-41):
```typescript
  /* eslint-disable react-hooks/exhaustive-deps */
  const handleConfirm = useCallback(() => {
    const trimmedPort = port.trim();
    if (!trimmedPort) {
      return;
    }
    const num = Number.parseInt(trimmedPort, 10);
    if (Number.isNaN(num) || num < 1 || num > 65535) {
      setError(t.browserAddPortInvalid || 'Invalid port number (1-65535)');
      return;
    }
    onConfirm(num, label.trim() || undefined);
  }, [port, label, onConfirm]);
  /* eslint-enable react-hooks/exhaustive-deps */
```

**The bug:** `handleConfirm` uses `t.browserAddPortInvalid` (line 36) but `t` is not in the deps array `[port, label, onConfirm]`. The block-level `/* eslint-disable */` (line 28) suppresses the warning that would have caught this. When the user switches language, `t` changes reference but `handleConfirm` is NOT recreated — so the error message stays in the old language until `port` or `label` changes.

**The fix:** Add `t` to the deps array and remove the disable/enable block. `t` is `Record<string, string>` (line 6: `t: Record<string, string>` in `AddManualPortDialogProps`). When the language changes, `t` gets a new object reference, `handleConfirm` recreates, and `handleKeyDown` (which depends on `handleConfirm`) also updates. This is correct behavior.

Change lines 28-41 from:
```typescript
  /* eslint-disable react-hooks/exhaustive-deps */
  const handleConfirm = useCallback(() => {
    const trimmedPort = port.trim();
    if (!trimmedPort) {
      return;
    }
    const num = Number.parseInt(trimmedPort, 10);
    if (Number.isNaN(num) || num < 1 || num > 65535) {
      setError(t.browserAddPortInvalid || 'Invalid port number (1-65535)');
      return;
    }
    onConfirm(num, label.trim() || undefined);
  }, [port, label, onConfirm]);
  /* eslint-enable react-hooks/exhaustive-deps */
```
To:
```typescript
  const handleConfirm = useCallback(() => {
    const trimmedPort = port.trim();
    if (!trimmedPort) {
      return;
    }
    const num = Number.parseInt(trimmedPort, 10);
    if (Number.isNaN(num) || num < 1 || num > 65535) {
      setError(t.browserAddPortInvalid || 'Invalid port number (1-65535)');
      return;
    }
    onConfirm(num, label.trim() || undefined);
  }, [port, label, onConfirm, t]);
```

- [ ] **Step 5: Add comment to LocalPortSection.tsx line 99**

Read `ai-digital-life/frontend/src/app/features/browser/browser-landing/LocalPortSection.tsx` lines 95-101.

Current state (lines 95-100):
```typescript
  useEffect(() => {
    if (browserLocalPorts.length === 0) {
      scanPorts();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
```

This is a mount-only effect that triggers the initial port scan when `browserLocalPorts` is empty. `scanPorts` is a `useCallback` (line 48) with deps `[browserLocalPorts, browserSetLocalPorts, browserSetPortScanning]` — it reads the latest `browserLocalPorts` from closure. Adding `scanPorts` or `browserLocalPorts` to this effect's deps would re-trigger the scan whenever ports change, which is not desired (the scan should only run once on mount; subsequent scans are triggered by the user clicking the refresh button).

Change line 99 from:
```typescript
    // eslint-disable-next-line react-hooks/exhaustive-deps
```
To:
```typescript
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only: initial port scan; scanPorts is stable via useCallback and reads latest state from stores
```

- [ ] **Step 6: Run lint to verify no new warnings**

```powershell
$env:Path = "D:\Program Files\nodejs;$env:Path"
cd e:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life\frontend
pnpm run lint 2>&1 | Select-String "exhaustive-deps|error|warning" | Select-Object -First 20
```

Expected: No `react-hooks/exhaustive-deps` warnings for the 5 modified files. The `SafeIframe.tsx` directive (unchanged) should also produce no warning since it already has the suppression.

If any `exhaustive-deps` warning appears for `AddManualPortDialog.tsx`, verify that `t` was added to the deps array on the correct line — the fix should have resolved it.

- [ ] **Step 7: Run typecheck**

```powershell
pnpm run typecheck 2>&1 | Select-String "error TS" | Select-Object -First 10
```

Expected: Only the 4 pre-existing errors (workspace-browser/index.ts, StatusBar.tsx, StatusBarEditorInfo.tsx). No new errors from the AddManualPortDialog dep fix — `t` is already typed as `Record<string, string>` in the props interface.

- [ ] **Step 8: Run format and lint:fix**

```powershell
pnpm run lint:fix
pnpm run format
```

Expected: ESLint auto-fixes any style issues; Prettier formats the files. If `lint:fix` modifies any of the 5 target files, re-read them to confirm the changes are only formatting (not reverting the substantive edits).

- [ ] **Step 9: Run tests**

```powershell
pnpm run test 2>&1 | Select-Object -Last 15
```

Expected: All tests pass (483 tests). The `t` dependency addition is a correctness fix — `handleConfirm` now recreates when `t` changes (language switch), which is the correct behavior. No existing test should break since the callback's runtime behavior is unchanged for a given `t` value.

- [ ] **Step 10: Commit**

```powershell
cd e:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life
git add frontend/src/app/features/git-visualization/hooks/useECharts.ts frontend/src/app/features/browser/useBrowserPageMeta.ts frontend/src/app/features/browser/useBrowserUrlChange.ts frontend/src/app/features/browser/browser-landing/AddManualPortDialog.tsx frontend/src/app/features/browser/browser-landing/LocalPortSection.tsx
$msg = @'
chore(frontend): audit react-hooks/exhaustive-deps suppressions

Documents 3 intentional mount-only-effect suppressions (useECharts,
useBrowserPageMeta, LocalPortSection). Removes 1 misplaced directive
in useBrowserUrlChange cleanup. Fixes 1 real bug in AddManualPortDialog:
handleConfirm used t.browserAddPortInvalid without t in deps array,
hidden by a block-level eslint-disable. SafeIframe already documented.
'@
git commit -m $msg
```

---

## Phase 2: Final Whole-Branch Review

> After Task 19 is committed and its task review is approved, dispatch the final whole-branch reviewer covering all 19 tasks. This is a broad review, not a task-scoped gate — it looks for cross-task conflicts, accumulated tech debt, and merge-readiness.

**Prerequisite:** Task 19 task review must be approved (dispatch Task 19 reviewer after the commit, same as Tasks 15-18).

- [ ] **Step 1: Update progress ledger**

Update `.superpowers/sdd/progress.md`:
- Task 19 row: status `✅ Complete`, commits `aa301c43..<Task19-commit-SHA>`, review `Clean — Spec ✅, Quality Approved`

- [ ] **Step 2: Generate final review package**

Generate a review package covering the entire branch (from merge-base to HEAD):

```powershell
cd e:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life
$out = "e:\AI-DIGITAL-LIFE\SourceWorkspace\.superpowers\sdd\review-final-90f3f063..HEAD.diff"
$head = git rev-parse --short HEAD
"# Review package: 90f3f063..$head`n" | Out-File -FilePath $out -Encoding utf8
"`n## Commits`n" | Out-File -FilePath $out -Append -Encoding utf8
git log --oneline 90f3f063..HEAD | Out-File -FilePath $out -Append -Encoding utf8
"`n## Files changed`n" | Out-File -FilePath $out -Append -Encoding utf8
git diff --stat 90f3f063..HEAD | Out-File -FilePath $out -Append -Encoding utf8
"`n## Diff`n" | Out-File -FilePath $out -Append -Encoding utf8
git diff -U10 90f3f063..HEAD | Out-File -FilePath $out -Append -Encoding utf8
Write-Output "wrote $out"
```

Note: The full-branch diff will be large (19 tasks across frontend + Rust). The reviewer reads it as one file.

- [ ] **Step 3: Dispatch final whole-branch reviewer**

Dispatch a final code reviewer subagent (use `superpowers:requesting-code-review` skill's `code-reviewer.md` template) with:
- **DIFF_FILE**: `.superpowers/sdd/review-final-90f3f063..HEAD.diff`
- **BASE_SHA**: `90f3f063` (merge-base / branch start)
- **HEAD_SHA**: current HEAD
- **Scope**: All 19 tasks (Tasks 1-19)
- **Model**: Most capable available model (this is an architecture/judgment task per SDD skill Model Selection)

The reviewer should focus on:
- Cross-task conflicts (e.g., Task 9/10's `captureTypedError` migration interacting with Task 3/4's bridge splits)
- Accumulated tech debt (Minor findings recorded in the progress ledger across tasks)
- Merge-readiness (does the branch cleanly merge back to main?)
- Any spec gaps that task-scoped reviews couldn't verify (⚠️ items)

- [ ] **Step 4: Handle final review findings**

If the final review returns findings:
- **Critical/Important**: Dispatch ONE fix subagent with the complete findings list (not one fixer per finding — per SDD skill, per-finding fixers each rebuild context and re-run suites, costing more than all tasks combined)
- **Minor**: Record in progress ledger; triage which must be fixed before merge
- **plan-mandated findings**: Present to the user with the plan text and ask which governs

After fixes, re-dispatch the final reviewer with the updated review package (regenerate from the same base to new HEAD).

---

## Phase 3: Finish the Development Branch

> After the final review is approved (or all findings are resolved), use the `superpowers:finishing-a-development-branch` skill to decide how to integrate the work.

- [ ] **Step 1: Run final acceptance flow**

Run the full mandatory testing flow one last time to confirm everything is green:

### Frontend

```powershell
$env:Path = "D:\Program Files\nodejs;$env:Path"
cd e:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life
pnpm --dir frontend run lint:fix
pnpm --dir frontend run format
pnpm --dir frontend run typecheck
pnpm --dir frontend run test
```

Expected:
- ESLint: 0 errors (pre-existing warnings may remain)
- Prettier: formats applied
- Typecheck: only 4 pre-existing errors (workspace-browser/index.ts, StatusBar.tsx ×2, StatusBarEditorInfo.tsx)
- Tests: 483 passing

### Rust

```powershell
$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"
cd e:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life
cargo fmt --all
cargo clippy --workspace --all-targets --fix -- -D warnings
cargo check --workspace
cargo test --workspace
```

Expected:
- rustfmt: formats applied
- clippy: 0 warnings
- check: 0 errors
- tests: all pass except 2 pre-existing failures in `adl-model-gateway` (environmental — Clash proxy intercepting fake-key API calls)

- [ ] **Step 2: Invoke finishing-a-development-branch skill**

Invoke `Skill: finishing-a-development-branch`. This skill will present structured options for integrating the work:
- Merge to main
- Create a pull request
- Cleanup (delete branch, etc.)

The skill will guide the decision based on:
- Branch state (all tests passing, review approved)
- Remote tracking status
- User preference

- [ ] **Step 3: Update progress ledger (final)**

After the branch is merged or a PR is created, update `.superpowers/sdd/progress.md` with a final summary:
- All 19 tasks marked `✅ Complete`
- Final review status
- Merge/PR link

---

## Final Acceptance

The plan is complete when:
1. Task 19 is implemented, committed, and task-reviewed (Spec ✅, Quality Approved)
2. Final whole-branch review is dispatched and all Critical/Important findings are resolved
3. Mandatory testing flow passes (frontend: 483 tests + lint + typecheck; Rust: all tests + clippy + check)
4. `superpowers:finishing-a-development-branch` has been invoked and the branch is merged or a PR is created

---

## Self-Review

**1. Spec coverage:**
- Task 19 (exhaustive-deps audit): ✅ Steps 1-5 cover all 5 files needing changes (useECharts, useBrowserPageMeta, useBrowserUrlChange, AddManualPortDialog, LocalPortSection). SafeIframe (no change) is documented in the task header and File Structure table.
- Final review: ✅ Phase 2 covers review package generation, reviewer dispatch, and findings handling.
- Finishing: ✅ Phase 3 covers final acceptance flow and finishing-a-development-branch skill invocation.

**2. Placeholder scan:**
- No "TBD", "TODO", "implement later" found
- All code blocks contain actual code (verified against current file contents)
- All commands are complete with expected output
- The `<Task19-commit-SHA>` placeholder in Phase 2 Step 1 is intentional — it's filled at runtime after Task 19 commits

**3. Type consistency:**
- `handleConfirm` deps array gains `t` (type `Record<string, string>` from `AddManualPortDialogProps` line 6) — consistent with existing usage on line 36 (`t.browserAddPortInvalid`)
- All eslint-disable comments use `--` separator before explanation (standard ESLint inline comment syntax)
- The `for` loop in useBrowserUrlChange cleanup is unchanged — only the directive line is removed

**4. Pre-existing issues respected:**
- 4 TS errors explicitly called out as pre-existing (do not fix)
- 2 Rust test failures in adl-model-gateway explicitly called out as environmental (do not fix)
- ~15 pre-existing uncommitted changes in working tree (App.tsx, gitSlice.ts, etc.) — commit step explicitly stages only the 5 Task 19 files

**5. Verification against current file state (read on 2026-07-10):**
- `useECharts.ts:33` — confirmed `// eslint-disable-next-line react-hooks/exhaustive-deps` before `}, []);` on line 34
- `useBrowserPageMeta.ts:274` — confirmed directive before `[]` on line 275 (inside `handlePageMeta` useCallback)
- `useBrowserUrlChange.ts:312` — confirmed directive inside cleanup function before `for` loop (misplaced)
- `AddManualPortDialog.tsx:28-41` — confirmed `/* eslint-disable */` block; line 36 uses `t.browserAddPortInvalid`; line 40 deps `[port, label, onConfirm]` missing `t`
- `LocalPortSection.tsx:99` — confirmed directive before `}, []);` on line 100
- `SafeIframe.tsx:91-93` — confirmed 2-line comment already exists explaining the suppression
