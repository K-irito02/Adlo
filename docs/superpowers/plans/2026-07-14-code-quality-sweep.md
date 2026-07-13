# Plan D: Code Quality Sweep Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Clean up 10 medium-to-low severity code quality findings across frontend and backend: debug artifacts, hardcoded i18n strings, unwrap() calls, coding style violations, empty stubs, and unsafe type assertions.

**Architecture:** Each task is independent and touches separate files. Order by risk: remove debug artifacts first (user-facing noise), then fix i18n (user-facing correctness), then unwrap() conversions (code safety), then style violations (consistency), then stub cleanup (hygiene).

**Tech Stack:** TypeScript 5.6, React 19, Rust 2021, ESLint 9 flat config

## Global Constraints

- `any` type prohibited in production code; use `unknown` + type guard
- `import * as X` (star imports) prohibited
- `import { foo as bar }` (import aliases) prohibited
- No `else` — use early return
- `const` preferred over `let`
- All UI text must use i18n key lookups via `t()` or `useTranslation`
- Rust: `unwrap()` prohibited in production (test code exempted)
- All tests must pass before commit
- Clippy: `cargo clippy --workspace --all-targets` must pass with 0 warnings

---

### Task 1: Remove `[BOOT-TIMING]` console.log artifacts from production code

**Files:**
- Modify: `frontend/src/app/stores/actions/generalActions.ts` — lines 24, 26, 28, 30, 85, 133, 195

**Interfaces:**
- Consumes: `generalActions.ts` bootstrap function with 6 `console.log('[BOOT-TIMING]...')` calls
- Produces: Clean bootstrap function with no debug console.log output

- [ ] **Step 1: Read lines 20-200 of generalActions.ts**

```powershell
Get-Content "E:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life\frontend\src\app\stores\actions\generalActions.ts" -TotalCount 200 | Select-Object -Skip 19
```

Locate all 6 `console.log('[BOOT-TIMING]` calls. They appear at lines:
- Line 24: `console.log('[BOOT-TIMING] bootstrap start');`
- Line 26: `console.log('[BOOT-TIMING] phase2 complete at...');`
- Line 28: `console.log('[BOOT-TIMING] appReady set at...');`
- Line 30: `console.log('[BOOT-TIMING] appReady done at...');`
- Line 85: `console.log('[BOOT-TIMING] phase1 complete at...');`
- Line ~133: `console.log('[BOOT-TIMING] git status loaded at...');`

- [ ] **Step 2: Remove all 6 BOOT-TIMING console.log calls**

For each occurrence, delete the entire `console.log(...)` line.

In the `completeStartup` closure (lines 25-32), remove lines 26, 28, 30 so the function becomes:

```typescript
const completeStartup = () => {
  setTimeout(() => {
    set({ appReady: true });
  }, 0);
};
```

Remove line 24 (`console.log('[BOOT-TIMING] bootstrap start')`).

Remove line 85 (`console.log('[BOOT-TIMING] phase1 complete at...')`).

Remove line 133 (`console.log('[BOOT-TIMING] git status loaded at...')`).

Also check if `ts` (the `performance.now()` timestamp variable) is still used after removing timing logs. If `ts` becomes unused, remove it too:

```typescript
// Before line 22-23:
const requestSeq = workspaceRequestSeq;
const ts = performance.now();

// After:
const requestSeq = workspaceRequestSeq;
```

If `ts` is still used elsewhere in the function, keep it.

- [ ] **Step 3: Run frontend lint**

```powershell
cd "E:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life"
pnpm run frontend:lint 2>&1 | Select-String "warning|error"
```

Expected: 0 errors, 0 new warnings.

- [ ] **Step 4: Run frontend tests**

```powershell
cd "E:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life"
pnpm run frontend:test 2>&1 | Select-String "Tests|FAIL"
```

Expected: All tests pass.

- [ ] **Step 5: Commit**

```powershell
git add frontend/src/app/stores/actions/generalActions.ts
git commit -m "chore: remove [BOOT-TIMING] debug console.log artifacts"
```

---

### Task 2: Fix 3 hardcoded i18n strings in MessageBlocks.tsx

**Files:**
- Modify: `frontend/src/app/features/conversation/MessageBlocks.tsx` — lines 58, 70, 81

**Interfaces:**
- Consumes: `CopyDict` type from `@i18n/types`, `t: CopyDict` prop available in parent
- Produces: Three i18n key lookups replacing hardcoded strings

- [ ] **Step 1: Read the i18n dictionaries to find existing keys**

```powershell
grep -rn '"patch"\|"tool"\|"validation"' --include="*.ts" frontend/src/app/i18n/en-US/ | Select-Object -First 10
grep -rn '"patch"\|"tool"\|"validation"' --include="*.ts" frontend/src/app/i18n/zh-CN/ | Select-Object -First 10
```

Check if keys like `patch`, `tool`, `validation` already exist in the i18n dictionaries.

- [ ] **Step 2: If keys don't exist, add them to both locale files**

Find the appropriate i18n domain file (likely a conversation-related file):

```powershell
Get-ChildItem "E:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life\frontend\src\app\i18n\en-US\" | Select-Object Name
```

If `conversation.ts` exists, add keys there. Otherwise add to the most relevant domain file:

```typescript
// In frontend/src/app/i18n/en-US/conversation.ts (or relevant file):
export const conversation = {
  // ... existing keys ...
  patch: 'Patch',
  tool: 'Tool',
  validation: 'Validation',
} as const;
```

```typescript
// In frontend/src/app/i18n/zh-CN/conversation.ts:
export const conversation = {
  // ... existing keys ...
  patch: '补丁',
  tool: '工具',
  validation: '验证',
} as const;
```

- [ ] **Step 3: Update MessageBlocks.tsx to use i18n key lookups**

In the `renderPatchSummaryBlock` function (line 55-65), change:

```tsx
<h4>Patch</h4>
```

to use the `t` function. But wait — `renderPatchSummaryBlock` does NOT accept a `t: CopyDict` parameter currently. Check the function signature:

```typescript
function renderPatchSummaryBlock(block: PatchSummaryConversationBlock): React.ReactElement {
```

It takes only `block`. We need to either:
- (a) Add `t` as a parameter
- (b) Use a hook if available inside a component context

Option A — Add `t` parameter to all three render functions:

```typescript
function renderPatchSummaryBlock(
  block: PatchSummaryConversationBlock,
  t: CopyDict
): React.ReactElement {
```

Then find the caller of `renderPatchSummaryBlock` and add the `t` argument.

```powershell
grep -n "renderPatchSummaryBlock\|renderToolCallBlock\|renderValidationResultBlock" "E:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life\frontend\src\app\features\conversation\MessageBlocks.tsx"
```

Update each function to accept and use `t`:

```typescript
function renderPatchSummaryBlock(
  block: PatchSummaryConversationBlock,
  t: CopyDict
): React.ReactElement {
  return (
    <section key={block.id} className="adl-block adl-block--patch">
      <h4>{t.patch}</h4>
      <p>{block.summary}</p>
      <p>
        {block.fileCount} files / {block.hunkCount} hunks
      </p>
    </section>
  );
}

function renderToolCallBlock(
  block: ToolCallConversationBlock,
  t: CopyDict
): React.ReactElement {
  return (
    <section key={block.id} className="adl-block adl-block--tool">
      <h4>{t.tool}</h4>
      <p>{block.toolName}</p>
      <p>{block.summary}</p>
      <span className="adl-pill adl-pill--muted">{block.status}</span>
    </section>
  );
}

function renderValidationResultBlock(
  block: ValidationResultConversationBlock,
  t: CopyDict
): React.ReactElement {
  return (
    <section key={block.id} className="adl-block adl-block--validation">
      <h4>{t.validation}</h4>
      <p>{block.summary}</p>
      <span className="adl-pill adl-pill--muted">{block.status}</span>
      {block.diagnostics.length > 0 ? (
        <ul>
          {block.diagnostics.map((diagnostic) => (
            <li key={diagnostic.id}>
              <strong>{diagnostic.source}</strong>
              <span>{diagnostic.path ? ` ${diagnostic.path}` : ''}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
```

- [ ] **Step 4: Update callers of these functions to pass `t`**

Find where these render functions are called (likely in a switch/match inside a `renderMessageBlock` parent function). Update each call:

```typescript
// Before:
case 'patch-summary':
  return renderPatchSummaryBlock(block);
case 'tool-call':
  return renderToolCallBlock(block);
case 'validation-result':
  return renderValidationResultBlock(block);

// After:
case 'patch-summary':
  return renderPatchSummaryBlock(block, t);
case 'tool-call':
  return renderToolCallBlock(block, t);
case 'validation-result':
  return renderValidationResultBlock(block, t);
```

- [ ] **Step 5: Run frontend lint**

```powershell
cd "E:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life"
pnpm run frontend:lint 2>&1 | Select-String "warning|error"
```

Expected: 0 errors, 0 new warnings.

- [ ] **Step 6: Run frontend tests**

```powershell
cd "E:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life"
pnpm run frontend:test 2>&1 | Select-String "Tests|FAIL"
```

Expected: All tests pass.

- [ ] **Step 7: Commit**

```powershell
git add frontend/src/app/features/conversation/MessageBlocks.tsx frontend/src/app/i18n/
git commit -m "fix: replace hardcoded labels with i18n key lookups"
```

---

### Task 3: Convert production `unwrap()` calls to `?` operator

**Files:**
- Modify: `crates/agent-runtime/src/plugins/hooks.rs:32` — test-only (no change needed)
- Modify: `crates/agent-runtime/src/tools/registry.rs:338` — `let tool = tool.unwrap()`
- Modify: `src-tauri/src/commands/agent.rs:396,406` — in `#[cfg(test)]` (no change needed)
- Modify: `src-tauri/src/commands/task.rs:495` — in `#[cfg(test)]` (no change needed)

Wait — looking at the actual code again from our earlier read:
- `hooks.rs:32` — the `unwrap()` is inside `#[cfg(test)]`, so no change needed
- `agent.rs:396,406` — also inside `#[cfg(test)]`
- `task.rs:495` — also inside `#[cfg(test)]`
- `registry.rs:338` — need to check if it's in production or test code

Let me check which ones are actually in production code vs test code.

- [ ] **Step 1: Verify which unwrap() calls are actually in production code**

```powershell
cd "E:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life"
grep -n "unwrap()" crates/agent-runtime/src/tools/registry.rs | Select-Object -First 10
grep -n "unwrap()" crates/agent-runtime/src/plugins/hooks.rs | Select-Object -First 5
grep -n "unwrap()" src-tauri/src/commands/agent.rs | Select-Object -First 10
grep -n "unwrap()" src-tauri/src/commands/task.rs | Select-Object -First 10
```

For each occurrence, check if it's inside a `#[cfg(test)]` block or not. Only fix production-code unwraps.

- [ ] **Step 2: Fix each production unwrap**

**For `crates/agent-runtime/src/tools/registry.rs:338`** (if in production code):

Read the context to understand what `tool` is and why it's an `Option`:

```rust
// Likely pattern:
let tool = self.tools.get(name)?;  // use ? instead of .unwrap()
// or if tool is a Result:
let tool = tool?;  // propagate the error
```

**For any other production unwraps** found in step 1: replace `✓.unwrap()` with `✓?` (return `Result`) or `✓.unwrap_or_default()` as appropriate.

- [ ] **Step 3: Run full workspace clippy**

```powershell
cd "E:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life"
cargo clippy --workspace --all-targets 2>&1 | Select-String "warning|error"
```

Expected: 0 warnings, 0 errors.

- [ ] **Step 4: Run full workspace tests**

```powershell
cd "E:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life"
cargo test --workspace 2>&1 | Select-String "test result|FAILED"
```

Expected: `test result: ok. 488 passed; 0 failed`

- [ ] **Step 5: Commit**

```powershell
git add crates/agent-runtime/src/tools/registry.rs
git commit -m "fix: replace production unwrap() with ? operator"
```

---

### Task 4: Fix star import violations

**Files:**
- Modify: `frontend/src/app/features/browser/BrowserNavModeSwitch.tsx:2`
- Modify: `frontend/src/app/features/git-visualization/echartsSetup.ts:1`

**Interfaces:**
- Consumes: `@radix-ui/react-switch` exports `Root` and `Thumb`, `echarts/core` exports chart components
- Produces: Named imports replacing `import * as`

- [ ] **Step 1: Fix BrowserNavModeSwitch.tsx star import**

Current code:
```typescript
import * as SwitchPrimitives from '@radix-ui/react-switch';
```

Check what `SwitchPrimitives` members are used:
- Line 31: `SwitchPrimitives.Root`
- Line 49: `SwitchPrimitives.Thumb`

Convert to named imports:
```typescript
import { Root as SwitchRoot, Thumb as SwitchThumb } from '@radix-ui/react-switch';
```

Wait — import aliases (`import { foo as bar }`) are also banned per AGENTS.md! So we need a different approach. Since both `Root` and `Thumb` are generic names, we need to use them without aliasing but differentiate at use site.

Option A: Import directly and use qualified names via module:
```typescript
import { Root, Thumb } from '@radix-ui/react-switch';
```
Then use `<Root>` and `<Thumb>` directly in JSX. These are already specific enough in context (they're inside `BrowserNavModeSwitch`).

But looking at the JSX code, they use `asChild` prop. The `Root` and `Thumb` names might conflict with other imports — need to verify:

```powershell
grep -n "import" "E:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life\frontend\src\app\features\browser\BrowserNavModeSwitch.tsx"
```

Only `React` and `motion` are imported. `Root` and `Thumb` won't conflict. Fix:

```typescript
import { Root as SwitchRoot, Thumb as SwitchThumb } from '@radix-ui/react-switch';
```

Actually wait, aliasing is also banned. Let me check if there's a way around this. Looking at the actual usage:

```tsx
<SwitchPrimitives.Root ...>
  <SwitchPrimitives.Thumb .../>
</SwitchPrimitives.Root>
```

Hmm, `Root` and `Thumb` are very generic. Using them directly in JSX could cause confusion. But the AGENTS.md says no star imports AND no import aliases. 

Best approach: Rename the local reference to use d115e4093d3d4c5e8e2b1f0a7c6b8d9e unique names that incorporate the package context:

```typescript
// Use a namespace-style import but only for this Radix package:
import { Root as SwitchRoot, Thumb as SwitchThumb } from '@radix-ui/react-switch';
```

Use `<SwitchRoot>` and `<SwitchThumb>` in the JSX.

Since the lint rules say no import aliases but `Root` → `SwitchRoot` is clearly for disambiguation in a component context, this is a reasonable compromise. However, to strictly follow the rule, we could make a local wrapper:

Create a local file that re-exports with qualified names:

Actually, the simplest strict compliance: use the names directly, they're not ambiguous in this file:

```typescript
import { Root, Thumb } from '@radix-ui/react-switch';
```

Then use `<Root ...>` and `<Thumb ...>` directly. Within the `BrowserNavModeSwitch` component, these names are not ambiguous.

- [ ] **Step 2: Fix echartsSetup.ts star import**

Current code:
```typescript
import * as echarts from 'echarts/core';
```

Check what `echarts` is used for:
- Line 19: `echarts.use([...])` — to register components

The `echarts` variable is used only as a namespace to call `.use()`. For tree-shaking ECharts, the recommended pattern is already correct (importing specific chart types and components), but the star import of the core package is necessary for the `.use()` API which is a side-effect registration.

For strict compliance, we can import the `init` function directly and use the package's side-effect registration:

```typescript
import { use, init } from 'echarts/core';
import { GraphChart, HeatmapChart, BarChart, LineChart, TreemapChart, SankeyChart } from 'echarts/charts';
import { CalendarComponent, VisualMapComponent, TooltipComponent, LegendComponent, GridComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';

use([
  GraphChart,
  HeatmapChart,
  BarChart,
  LineChart,
  TreemapChart,
  SankeyChart,
  CalendarComponent,
  VisualMapComponent,
  TooltipComponent,
  LegendComponent,
  GridComponent,
  CanvasRenderer,
]);
```

Then at the call site where `echarts.init(...)` was used, replace with `init(...)`.

- [ ] **Step 3: Run frontend lint and typecheck**

```powershell
cd "E:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life"
pnpm run frontend:lint
pnpm run frontend:typecheck
```

Expected: 0 errors, 0 new warnings.

- [ ] **Step 4: Run frontend tests**

```powershell
cd "E:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life"
pnpm run frontend:test 2>&1 | Select-String "Tests|FAIL"
```

Expected: All tests pass.

- [ ] **Step 5: Commit**

```powershell
git add frontend/src/app/features/browser/BrowserNavModeSwitch.tsx frontend/src/app/features/git-visualization/echartsSetup.ts
git commit -m "fix: replace star imports with named imports"
```

---

### Task 5: Fix import alias violations

**Files:**
- Modify: `frontend/src/app/features/browser/ExternalLinkError.tsx:4`
- Modify: `frontend/src/app/stores/conversationUtils.ts:3`

**Interfaces:**
- Consumes: `@tauri-apps/plugin-shell` (Tauri), `../i18n/getAppCopy` (local)
- Produces: No-rename imports — call functions by their original names

- [ ] **Step 1: Fix ExternalLinkError.tsx**

Current code:
```typescript
import { open as shellOpen } from '@tauri-apps/plugin-shell';
```

Check how `shellOpen` is used:
```typescript
shellOpen(url).catch(() => {});
```

Solution: Import as `open` and rename at call site or use a wrapper:
```typescript
import { open } from '@tauri-apps/plugin-shell';
```

Then at the call site:
```typescript
// Keep the name distinct by calling through an aliased local:
const handleExternalOpen = useCallback(() => {
  const url = activeTabUrl ?? 'about:blank';
  if (isTauriShell()) {
    open(url).catch(() => {});
  } else {
    // ...
  }
}, [activeTabUrl]);
```

The function name `open` is already descriptive enough in the context of `handleExternalOpen`. No alias needed.

- [ ] **Step 2: Fix conversationUtils.ts**

Current code:
```typescript
import { getAppCopy as getAppCopyFromI18n } from '../i18n/getAppCopy';
```

Check how `getAppCopyFromI18n` is used later in the file:

```powershell
grep -n "getAppCopyFromI18n" "E:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life\frontend\src\app\stores\conversationUtils.ts"
```

If it's only used once or twice, either import as `getAppCopy` (original name) and inline it:

```typescript
import { getAppCopy } from '../i18n/getAppCopy';
```

Or if the alias was needed to avoid a name collision, check if there's another `getAppCopy` in scope. If not, drop the alias:

```typescript
import { getAppCopy } from '../i18n/getAppCopy';
```

- [ ] **Step 3: Run frontend lint and typecheck**

```powershell
cd "E:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life"
pnpm run frontend:lint
pnpm run frontend:typecheck
```

Expected: 0 errors, 0 new warnings.

- [ ] **Step 4: Run frontend tests**

```powershell
cd "E:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life"
pnpm run frontend:test 2>&1 | Select-String "Tests|FAIL"
```

Expected: All tests pass.

- [ ] **Step 5: Commit**

```powershell
git add frontend/src/app/features/browser/ExternalLinkError.tsx frontend/src/app/stores/conversationUtils.ts
git commit -m "fix: remove import aliases per style guide"
```

---

### Task 6: Delete 4 empty selector stub files

**Files:**
- Delete: `frontend/src/app/stores/changesSelectors.ts`
- Delete: `frontend/src/app/stores/ciSelectors.ts`
- Delete: `frontend/src/app/stores/communicateSelectors.ts`
- Delete: `frontend/src/app/stores/filesSelectors.ts`

**Interfaces:**
- Consumes: These files are imported somewhere (need to find and remove imports)
- Produces: Clean filesystem with no stub files

- [ ] **Step 1: Find all imports of the stub files**

```powershell
cd "E:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life"
grep -rn "changesSelectors\|ciSelectors\|communicateSelectors\|filesSelectors" --include="*.ts" --include="*.tsx" frontend/src/ | Select-String -NotMatch "node_modules"
```

- [ ] **Step 2: Remove each import found in step 1**

For each file that imports a stub selector, remove the import line. If the imported symbol is no longer used in the file, the TypeScript compiler will flag it — run typecheck to catch any remaining references.

```powershell
cd "E:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life"
pnpm run frontend:typecheck 2>&1 | Select-String "error"
```

Fix any compilation errors by removing stale references.

- [ ] **Step 3: Delete the 4 stub files**

```powershell
Remove-Item "E:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life\frontend\src\app\stores\changesSelectors.ts"
Remove-Item "E:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life\frontend\src\app\stores\ciSelectors.ts"
Remove-Item "E:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life\frontend\src\app\stores\communicateSelectors.ts"
Remove-Item "E:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life\frontend\src\app\stores\filesSelectors.ts"
```

- [ ] **Step 4: Run typecheck to confirm no remaining references**

```powershell
cd "E:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life"
pnpm run frontend:typecheck 2>&1 | Select-String "error"
```

Expected: 0 errors.

- [ ] **Step 5: Run frontend tests**

```powershell
cd "E:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life"
pnpm run frontend:test 2>&1 | Select-String "Tests|FAIL"
```

Expected: All tests pass.

- [ ] **Step 6: Commit**

```powershell
git add -A
git commit -m "chore: delete empty selector stub files"
```

---

### Task 7: Fix unsafe window type assertion in preview-bridge

**Files:**
- Create: `frontend/src/types/global.d.ts` — type augmentation for window
- Modify: `frontend/src/preview-bridge/index.ts:35` — replace `as unknown as` with typed access

**Interfaces:**
- Consumes: `BrowserAudioMonitor` type
- Produces: Properly typed window augmentation

- [ ] **Step 1: Create a type declaration file for the window augmentation**

```powershell
New-Item -ItemType File -Path "E:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life\frontend\src\types\global.d.ts"
```

Add the declaration:
```typescript
import type { BrowserAudioMonitor } from '../app/features/browser/useBrowserAudioMonitor';

declare global {
  interface Window {
    __adlAudioMonitor?: BrowserAudioMonitor;
  }
}

export {};
```

- [ ] **Step 2: Update the preview-bridge/index.ts line 35**

Current code:
```typescript
(window as unknown as Record<string, unknown>)['__adlAudioMonitor'] = audioMonitor;
```

Replace with:
```typescript
window.__adlAudioMonitor = audioMonitor;
```

- [ ] **Step 3: Run frontend typecheck and lint**

```powershell
cd "E:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life"
pnpm run frontend:typecheck
pnpm run frontend:lint
```

Expected: 0 errors, 0 new warnings.

- [ ] **Step 4: Run frontend tests**

```powershell
cd "E:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life"
pnpm run frontend:test 2>&1 | Select-String "Tests|FAIL"
```

Expected: All tests pass.

- [ ] **Step 5: Commit**

```powershell
git add frontend/src/types/global.d.ts frontend/src/preview-bridge/index.ts
git commit -m "fix: replace unsafe window type assertion with proper declaration"
```
