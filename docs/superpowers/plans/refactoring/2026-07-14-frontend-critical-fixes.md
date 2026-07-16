# Plan A: Frontend Critical Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 22 TypeScript compilation errors and 5 failing frontend tests to unblock CI pipeline.

**Architecture:** Two independent issues block `tsc --noEmit`: (1) stale generated IPC types in `ipc-types.generated.ts` need regenerating from Rust kernel types, (2) a file-name casing mismatch between an import and the actual file. Additionally, 5 favicon cache tests are failing — these need root-cause investigation in the cache/retry logic.

**Tech Stack:** TypeScript 5.6, Vitest 3, React 19

## Global Constraints

- `any` type prohibited in production code; use `unknown` + type guard
- `import * as X` (star imports) prohibited
- `import { foo as bar }` (import aliases) prohibited
- No `else` — use early return
- `const` preferred over `let`
- All UI text must use i18n key lookups via `t()` or `useTranslation`
- All tests must pass before commit

---

### Task 1: Fix file-name casing mismatch

**Files:**
- Modify: `frontend/src/app/features/workspace-browser/index.ts:1`
- Rename: `frontend/src/app/features/workspace-browser/multiworkspacebrowser.tsx` → `.../MultiWorkspaceBrowser.tsx`

**Interfaces:**
- Consumes: `frontend/src/app/features/workspace-browser/index.ts` re-exports `MultiWorkspaceBrowser` from `'./MultiWorkspaceBrowser'`
- Produces: The import path matches the actual filename

- [ ] **Step 1: Rename the file to match the import casing**

Rename `multiworkspacebrowser.tsx` to `MultiWorkspaceBrowser.tsx`:

```powershell
Rename-Item -Path "E:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life\frontend\src\app\features\workspace-browser\multiworkspacebrowser.tsx" -NewName "MultiWorkspaceBrowser.tsx"
```

- [ ] **Step 2: Verify the import matches**

Confirm `index.ts` line 1 reads `export { MultiWorkspaceBrowser } from './MultiWorkspaceBrowser';`, which now correctly matches the file `MultiWorkspaceBrowser.tsx` (case-sensitive match).

- [ ] **Step 3: Run typecheck to verify the error is gone**

```powershell
cd "E:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life"
pnpm run frontend:typecheck 2>&1 | Select-String "error"
```

Expected: The `TS1261` casing error about `MultiWorkspaceBrowser` should no longer appear. (Other errors from the IPC types may remain — those are handled in Task 2.)

- [ ] **Step 4: Commit**

```powershell
git add frontend/src/app/features/workspace-browser/
git commit -m "fix: normalize MultiWorkspaceBrowser file name casing"
```

---

### Task 2: Regenerate stale IPC type definitions

**Files:**
- Modify: `frontend/src/shared/ipc-types.generated.ts` (regenerate)

**Interfaces:**
- Consumes: The Rust kernel types in `crates/adl-kernel/src/types/` define `AppPreferencePatch`, `ConfigSnapshot`, `ThemeMode`, `ModelCapability`, etc.
- Produces: Generated TypeScript declarations that export all imported types

- [ ] **Step 1: Diagnose what's missing**

Run the typecheck to see all 22 errors:

```powershell
cd "E:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life"
pnpm run frontend:typecheck 2>&1 | Select-String "error TS"
```

Errors will be like:
```
error TS2305: Module '.../ipc-types.generated.ts' has no exported member 'AppPreferencePatch'
error TS2305: Module '.../ipc-types.generated.ts' has no exported member 'ConfigSnapshot'
```

Collect all missing type names. The file uses a barrel pattern — find where types are imported and verify re-exports.

- [ ] **Step 2: Read the current generated file to understand its structure**

```powershell
Get-Content "E:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life\frontend\src\shared\ipc-types.generated.ts" -TotalCount 60
```

Check how it currently exports types — does it re-export from `@ai-digital-life/kernel`? Does it define inline types? Understanding the generation pattern is needed to fix it.

- [ ] **Step 3: Find the generation script or pattern**

Search for how `ipc-types.generated.ts` was originally generated:

```powershell
cd "E:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life"
grep -rn "ipc-types" --include="*.json" --include="*.ts" --include="*.mjs" --include="*.cfg" . | Select-String -NotMatch "node_modules" | Select-Object -First 20
```

Also check `package.json` scripts and any Tauri IPC type generation tools:

```powershell
grep -rn "generate\|ipc-types\|ts-rs\|specta\|typescript" --include="*.json" --include="*.toml" --include="*.rs" . | Select-String -NotMatch "node_modules|target" | Select-Object -First 30
```

- [ ] **Step 4: Regenerate or manually fix the missing exports**

**Option A**: If a generate script exists, run it:

```powershell
cd "E:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life"
pnpm run generate-ipc-types  # or whatever the script is
```

**Option B**: If no generation script exists, read the missing type names from step 1, then inspect each Rust source type to see if it's exported from the kernel crate, then add the missing re-exports to `ipc-types.generated.ts`.

For each missing type (e.g., `AppPreferencePatch`), verify the type exists in `crates/adl-kernel/src/types/`:

```powershell
grep -rn "AppPreferencePatch\|ConfigSnapshot\|ThemeMode\|ModelCapability" --include="*.rs" crates/adl-kernel/ | Select-Object -First 20
```

If the type exists in Rust but is not exported in the generated file, add the re-export line:

```typescript
// Add missing exports to ipc-types.generated.ts:
export type { AppPreferencePatch } from '@ai-digital-life/kernel';
export type { ConfigSnapshot } from '@ai-digital-life/kernel';
export type { ThemeMode } from '@ai-digital-life/kernel';
export type { ModelCapability } from '@ai-digital-life/kernel';
// ... repeat for all missing types
```

- [ ] **Step 5: Verify the typecheck passes**

```powershell
cd "E:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life"
pnpm run frontend:typecheck 2>&1 | Select-String "error TS"
```

Expected: Zero `error TS2305` messages (0 TypeScript errors).

- [ ] **Step 6: Run the frontend test suite to ensure nothing broke**

```powershell
cd "E:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life"
pnpm run frontend:test 2>&1 | Select-String "Tests|FAIL"
```

Expected: 527+ tests pass (the 5 previously failing tests may still fail — those are handled in Task 3).

- [ ] **Step 7: Commit**

```powershell
git add frontend/src/shared/ipc-types.generated.ts
git commit -m "fix: regenerate IPC type definitions to resolve 22 TS errors"
```

---

### Task 3: Investigate and fix 5 failing favicon cache tests

**Files:**
- Investigate: `frontend/src/app/utils/__tests__/fetchPageMeta.test.ts`
- Modify: Possibly `frontend/src/app/utils/fetchPageMeta.ts` or the test file depending on root cause

**Interfaces:**
- Consumes: The test file `fetchPageMeta.test.ts` tests favicon cache persistence. The implementation in `fetchPageMeta.ts` manages an in-memory LRU cache for favicon URLs.
- Produces: All 5 previously failing tests pass.

- [ ] **Step 1: Run the failing tests to see the actual error output**

```powershell
cd "E:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life\frontend"
npx vitest run src/app/utils/__tests__/fetchPageMeta.test.ts 2>&1 | Select-String "FAIL|×|AssertionError|expected|received"
```

Capture the full failure messages — each failing test will show expected vs actual values.

- [ ] **Step 2: Read the test file to understand what's being tested**

```powershell
Get-Content "E:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life\frontend\src\app\utils\__tests__\fetchPageMeta.test.ts"
```

Look for the 5 failing test cases. Identify what assertions they make about favicon cache behavior (e.g., TTL expiry, LRU eviction, persistence across calls, cache hit ratio tracking).

- [ ] **Step 3: Read the implementation file**

```powershell
Get-Content "E:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life\frontend\src\app\utils\fetchPageMeta.ts"
```

Identify the cache implementation (data structure, TTL logic, eviction policy). Look for recent changes that may have broken cache persistence.

Check git log for recent changes to this file:

```powershell
cd "E:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life"
git log --oneline -10 -- frontend/src/app/utils/fetchPageMeta.ts
git diff HEAD~5..HEAD -- frontend/src/app/utils/fetchPageMeta.ts
```

- [ ] **Step 4: Fix the root cause**

Based on the investigation in step 3, implement the fix. Typical issues could be:

**Scenario A — Cache TTL off-by-one**: If the tests expect entries to expire at exact boundaries, check the `CacheEntry` comparison logic. Fix the comparison:
```typescript
// Before (if line ~45):
const isExpired = (entry: CacheEntry): boolean =>
  Date.now() - entry.timestamp >= entry.ttl;

// After:
const isExpired = (entry: CacheEntry): boolean =>
  Date.now() - entry.timestamp > entry.ttl;
```

**Scenario B — LRU eviction order**: If entries are evicted in wrong order, check the eviction logic:
```typescript
// Fix eviction to remove least-recently-used first
// Ensure entries are sorted by `lastAccessed` ascending before eviction
```

**Scenario C — Mock timing**: If tests use fake timers (`vi.useFakeTimers`), ensure the implementation reads time from a source the test controls:
```typescript
// Instead of Date.now() directly, use a function that can be mocked:
export const getCacheTime = () => mockableNow ?? Date.now();
```

- [ ] **Step 5: Run the failing tests to verify they pass**

```powershell
cd "E:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life\frontend"
npx vitest run src/app/utils/__tests__/fetchPageMeta.test.ts 2>&1 | Select-String "Tests|×"
```

Expected: `Tests  5 passed (5)` — all 5 tests green.

- [ ] **Step 6: Run the full frontend test suite to confirm no regressions**

```powershell
cd "E:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life"
pnpm run frontend:test 2>&1 | Select-String "Tests"
```

Expected: `Tests  532 passed (532)` — all frontend tests passing.

- [ ] **Step 7: Run frontend lint and typecheck**

```powershell
cd "E:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life"
pnpm run frontend:typecheck
pnpm run frontend:lint
```

Expected: 0 type errors, 0 lint errors (existing warnings acceptable).

- [ ] **Step 8: Commit**

```powershell
git add frontend/src/app/utils/fetchPageMeta.ts frontend/src/app/utils/__tests__/fetchPageMeta.test.ts
git commit -m "fix: repair favicon cache persistence logic"
```
