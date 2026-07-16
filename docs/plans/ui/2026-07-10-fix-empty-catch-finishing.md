# Fix Empty Catch Blocks + Finishing Workflow

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the 3 relocated empty catch blocks flagged by the final whole-branch review, then finish the `refactoring-all-findings` branch.

**Architecture:** Single-task fix — add `console.warn` to 3 empty catch blocks across 2 files per the error-handling rules (`error-handling.md`: "禁止 `try { ... } catch {}` 空 catch 块"). After the fix, run the finishing-a-development-branch workflow (detect environment → present 4 options → execute choice → cleanup).

**Tech Stack:** TypeScript 5.6, React 19, Zustand 5, Tauri 2.x

## Global Constraints

- All modifications must not break existing functionality or UI/UX
- Empty catch blocks must at minimum log `console.warn` (per `error-handling.md`)
- Use `const` not `let`; no `any`; no `else`; no import aliases
- Commit format: `fix(scope): summary` (conventional commits)
- All tests must pass before finishing

---

### Task 1: Fix Empty Catch Blocks

**Files:**
- Modify: `ai-digital-life/frontend/src/app/regions/right-panel/panels/ChangesPanel/useChangesActions.ts:66`
- Modify: `ai-digital-life/frontend/src/app/regions/WindowControls.tsx:26-28,52-54`

**Interfaces:**
- Consumes: (none — this task is independent)
- Produces: (none — no new exports)

- [ ] **Step 1: Fix `useChangesActions.ts:66` — add `console.warn` to empty catch**

Replace:
```typescript
    } catch {}
```
With:
```typescript
    } catch {
      console.warn("Failed to copy to clipboard");
    }
```

Run: `pnpm --dir frontend run lint`
Expected: 0 errors, 0 warnings related to this file.

- [ ] **Step 2: Fix `WindowControls.tsx:26-28` — replace `/* ignore */` with `console.warn`**

Replace:
```typescript
      } catch {
        /* ignore */
      }
```
With:
```typescript
      } catch {
        console.warn("Failed to sync window maximized state");
      }
```

Run: `pnpm --dir frontend run lint`
Expected: 0 errors, 0 warnings related to this file.

- [ ] **Step 3: Fix `WindowControls.tsx:52-54` — replace `/* ignore */` with `console.warn`**

Replace:
```typescript
    } catch {
      /* ignore */
    }
```
With:
```typescript
    } catch {
      console.warn("Failed to check window maximized state after maximize");
    }
```

Run: `pnpm --dir frontend run lint`
Expected: 0 errors, 0 warnings related to this file.

- [ ] **Step 4: Run lint:fix + format**

```powershell
$env:Path = "D:\Program Files\nodejs;$env:Path"
cd e:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life
pnpm --dir frontend run lint:fix
pnpm --dir frontend run format
```

Expected: No substantive changes. Verify with `git diff` that all 3 edits are intact.

- [ ] **Step 5: Run typecheck**

```powershell
$env:Path = "D:\Program Files\nodejs;$env:Path"
cd e:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life
pnpm --dir frontend run typecheck
```

Expected: Only the 4 pre-existing TS errors (workspace-browser/index.ts, StatusBar.tsx x2, StatusBarEditorInfo.tsx). No new errors.

- [ ] **Step 6: Run tests**

```powershell
$env:Path = "D:\Program Files\nodejs;$env:Path"
cd e:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life
pnpm --dir frontend run test
```

Expected: 483/483 tests pass.

- [ ] **Step 7: Commit**

```powershell
$env:Path = "D:\Program Files\nodejs;$env:Path"
cd e:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life
git add frontend/src/app/regions/right-panel/panels/ChangesPanel/useChangesActions.ts frontend/src/app/regions/WindowControls.tsx
git commit -m "fix(frontend): add console.warn to empty catch blocks
```
Expected: Clean commit, no leftover changes.

---

### Phase 2: Finish the Development Branch

After Task 1 is committed, invoke the `finishing-a-development-branch` skill:

1. **Verify tests** — already done in Step 6 (483/483 pass)
2. **Detect environment** — run `git rev-parse --git-dir` and `git rev-parse --git-common-dir`
3. **Determine base branch** — `git merge-base HEAD main`
4. **Present 4 options** — merge locally / push + PR / keep as-is / discard
5. **Execute user's choice**
6. **Cleanup workspace** (if applicable)

---

## Self-Review

### 1. Spec coverage
The final whole-branch review flagged 3 Minor findings:
- [x] `useChangesActions.ts:66` empty catch — covered by Step 1
- [x] `WindowControls.tsx:26-28` empty catch with `/* ignore */` — covered by Step 2
- [x] `WindowControls.tsx:52-54` empty catch with `/* ignore */` — covered by Step 3
- [x] Branch finishing workflow — covered by Phase 2

### 2. Placeholder scan
No TBD, TODO, or vague instructions. All code blocks are exact replacements. All commands include expected output.

### 3. Type consistency
Single task — no cross-task consistency issues.