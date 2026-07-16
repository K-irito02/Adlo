# Theme Unified Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unify theme resolution into a single source of truth — `ThemeController` + a `useResolvedTheme()` React hook — eliminating the fragmented `matchMedia` resolution logic and stale `appInfo.config.resolvedTheme` values.

**Architecture:** Two new modules bridge the gap between the already-correct `ThemeController` (pure TS singleton, drives DOM `data-theme`) and React consumers that previously read the stale `appInfo.config.resolvedTheme`. A shared pure `resolveCurrentTheme()` function DRY-s up all remaining resolution points, while the `useResolvedTheme()` hook subscribes React components to live `ThemeController` state.

**Tech Stack:** TypeScript, React 19, Zustand, Vitest, @testing-library/react v16

## Global Constraints

- No changes to Rust backend (out of scope for frontend-only fix)
- All CSS variable / DOM `data-theme` behavior preserved (ThemeController unchanged)
- TypeScript strict, ESLint flat config
- All existing tests must continue to pass
- `@testing-library/react` v16.3.2 available for hook tests

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `frontend/src/shared/resolveTheme.ts` | **Create** | Shared `resolveCurrentTheme(themeMode)` wrapping `design-system`'s `resolveThemeMode` + `matchMedia` |
| `frontend/src/shared/__tests__/resolveTheme.test.ts` | **Create** | Unit tests for `resolveCurrentTheme` |
| `frontend/src/shared/preferencesMerger.ts` | **Modify** | Replace inline `matchMedia` with `resolveCurrentTheme()` |
| `frontend/src/app/stores/actions/generalActions.ts` | **Modify** | Replace inline `matchMedia` with `resolveCurrentTheme()` in both `bootstrap` and `updatePreferences` |
| `frontend/src/app/hooks/useThemeSync.ts` | **Modify** | Simplify — remove duplicate resolution, only pass `mode` to `themeController` |
| `frontend/src/app/hooks/useResolvedTheme.ts` | **Create** | React hook subscribing to `themeController` |
| `frontend/src/app/hooks/__tests__/useResolvedTheme.test.tsx` | **Create** | Hook tests with mocked `themeController` |
| `frontend/src/app/regions/right-panel/panels/FilesPanel.tsx` | **Modify** | Replace `appInfo.config.resolvedTheme` read with `useResolvedTheme()` |
| `frontend/src/app/regions/right-panel/panels/DiffEditorSection.tsx` | **Modify** | Replace `appInfo.config.resolvedTheme` read with `useResolvedTheme()` |
| `frontend/src/app/regions/right-panel/panels/PatchReviewSection.tsx` | **Modify** | Replace `appInfo.config.resolvedTheme` read with `useResolvedTheme()` |

---

### Task 1: Create `resolveCurrentTheme()` shared function

**Files:**
- Create: `frontend/src/shared/resolveTheme.ts`
- Create: `frontend/src/shared/__tests__/resolveTheme.test.ts`

**Interfaces:**
- Consumes: `resolveThemeMode` from `../../design-system/theme`
- Produces: `export function resolveCurrentTheme(themeMode: ThemeMode): ResolvedTheme`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/shared/__tests__/resolveTheme.test.ts`:

```typescript
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { resolveCurrentTheme } from '../resolveTheme';

describe('resolveCurrentTheme', () => {
  let matchMediaSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    matchMediaSpy = vi.spyOn(window, 'matchMedia');
  });

  afterEach(() => {
    matchMediaSpy.mockRestore();
  });

  it('returns "dark" when themeMode is "dark" regardless of system preference', () => {
    matchMediaSpy.mockReturnValue({ matches: false } as MediaQueryList);
    expect(resolveCurrentTheme('dark')).toBe('dark');

    matchMediaSpy.mockReturnValue({ matches: true } as MediaQueryList);
    expect(resolveCurrentTheme('dark')).toBe('dark');
  });

  it('returns "light" when themeMode is "light" regardless of system preference', () => {
    matchMediaSpy.mockReturnValue({ matches: true } as MediaQueryList);
    expect(resolveCurrentTheme('light')).toBe('light');

    matchMediaSpy.mockReturnValue({ matches: false } as MediaQueryList);
    expect(resolveCurrentTheme('light')).toBe('light');
  });

  it('returns "dark" when themeMode is "system" and system prefers dark', () => {
    matchMediaSpy.mockReturnValue({ matches: true } as MediaQueryList);
    expect(resolveCurrentTheme('system')).toBe('dark');
  });

  it('returns "light" when themeMode is "system" and system prefers light', () => {
    matchMediaSpy.mockReturnValue({ matches: false } as MediaQueryList);
    expect(resolveCurrentTheme('system')).toBe('light');
  });

  it('returns "light" when themeMode is "system" and matchMedia is unavailable', () => {
    matchMediaSpy.mockReturnValue(undefined as unknown as MediaQueryList);
    expect(resolveCurrentTheme('system')).toBe('light');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/shared/__tests__/resolveTheme.test.ts`
Expected: FAIL with module not found

- [ ] **Step 3: Create the implementation**

Create `frontend/src/shared/resolveTheme.ts`:

```typescript
import { resolveThemeMode, type ThemeMode } from '../design-system/theme';

export function resolveCurrentTheme(themeMode: ThemeMode): 'light' | 'dark' {
  if (themeMode !== 'system') {
    return themeMode;
  }
  const prefersDark =
    typeof window !== 'undefined' &&
    (window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false);
  return resolveThemeMode(themeMode, prefersDark);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/shared/__tests__/resolveTheme.test.ts`
Expected: 5 PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/shared/resolveTheme.ts frontend/src/shared/__tests__/resolveTheme.test.ts
git commit -m "feat: add resolveCurrentTheme shared function for unified theme resolution"
```

---

### Task 2: Update `preferencesMerger.ts` to use shared resolution

**Files:**
- Modify: `frontend/src/shared/preferencesMerger.ts:16-31`

**Interfaces:**
- Consumes: `resolveCurrentTheme` from `./resolveTheme`
- Produces: unchanged public API — `applyPreferencePatch()` still returns `ConfigSnapshot`

- [ ] **Step 1: Replace inline matchMedia logic**

In `frontend/src/shared/preferencesMerger.ts`, add import:

```typescript
import { resolveCurrentTheme } from './resolveTheme';
```

Replace lines 16-31 with:

```typescript
  if (patch.themeMode) {
    nextConfig.themeMode = patch.themeMode;
    nextConfig.resolvedTheme = resolveCurrentTheme(patch.themeMode);
  } else if (nextConfig.themeMode === 'system') {
    nextConfig.resolvedTheme = resolveCurrentTheme('system');
  }
```

- [ ] **Step 2: Run existing tests to verify no regression**

Run: `cd frontend && npx vitest run --related src/shared/preferencesMerger.ts`
Expected: no test failures (if no test file exists, verify with `npx tsc --noEmit`)

- [ ] **Step 3: Run TypeScript check**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add frontend/src/shared/preferencesMerger.ts
git commit -m "refactor: use resolveCurrentTheme in preferencesMerger for DRY theme resolution"
```

---

### Task 3: Update `generalActions.ts` to use shared resolution

**Files:**
- Modify: `frontend/src/app/stores/actions/generalActions.ts:42-46, 199-214`

**Interfaces:**
- Consumes: `resolveCurrentTheme` from `../../../shared/resolveTheme`
- Produces: unchanged — `bootstrap()` and `updatePreferences()` still work identically

- [ ] **Step 1: Replace bootstrap fix**

In `frontend/src/app/stores/actions/generalActions.ts`, add import near other shared imports:

```typescript
import { resolveCurrentTheme } from '../../../shared/resolveTheme';
```

Replace lines 42-46 (the current fix block):

```typescript
      // Fix stale resolvedTheme from Rust backend (hardcodes Theme::Light for system mode)
      if (appInfoResult.data.config.themeMode === 'system') {
        appInfoResult.data.config.resolvedTheme =
          (window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false) ? 'dark' : 'light';
      }
```

with:

```typescript
      // Fix stale resolvedTheme from Rust backend (hardcodes Theme::Light for system mode)
      appInfoResult.data.config.resolvedTheme = resolveCurrentTheme(
        appInfoResult.data.config.themeMode
      );
```

- [ ] **Step 2: Replace updatePreferences fix**

Replace lines 199-214:

```typescript
      const responseMode = result.data.config.themeMode;
      const responseResolved =
        responseMode === 'system'
          ? (window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false)
            ? 'dark'
            : 'light'
          : result.data.config.resolvedTheme;
      themeController.setTheme({
        mode: responseMode,
        resolvedTheme: responseResolved,
      });
      themeController.hydrate();
      // result.data from Rust backend has stale resolvedTheme for system mode
      // (build_app_info hardcodes Theme::Light for ThemeMode::System).
      // Fix it here so panels reading appInfo.config.resolvedTheme get the correct value.
      result.data.config.resolvedTheme = responseResolved;
```

with:

```typescript
      const responseMode = result.data.config.themeMode;
      themeController.setTheme({ mode: responseMode });
      themeController.hydrate();
      // result.data from Rust backend has stale resolvedTheme for system mode
      // (build_app_info hardcodes Theme::Light for ThemeMode::System).
      // Fix it here for store consistency.
      result.data.config.resolvedTheme = resolveCurrentTheme(responseMode);
```

- [ ] **Step 3: Run lint and typecheck**

Run: `cd frontend && npx eslint src/app/stores/actions/generalActions.ts && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/stores/actions/generalActions.ts
git commit -m "refactor: use resolveCurrentTheme in generalActions, simplify themeController.setTheme call"
```

---

### Task 4: Simplify `useThemeSync.ts`

**Files:**
- Modify: `frontend/src/app/hooks/useThemeSync.ts`

**Interfaces:**
- Consumes: `themeController` from `../utils/theme`
- Produces: unchanged public API — `useThemeSync(appInfo)` still manages theme on appInfo load

- [ ] **Step 1: Remove duplicate matchMedia logic, simplify setTheme call**

Replace the entire file content:

```typescript
import { useEffect } from 'react';
import type { AppInfo } from '@ai-digital-life/kernel';
import { themeController } from '../utils/theme';

export function useThemeSync(appInfo: AppInfo | undefined) {
  useEffect(() => {
    if (!appInfo) {
      return;
    }

    themeController.setTheme({ mode: appInfo.config.themeMode });
    themeController.hydrate();
  }, [appInfo, appInfo?.config.themeMode]);
}
```

Note: `appInfo` is kept in the dependency array because we need the `if (!appInfo) return;` guard to re-execute when `appInfo` transitions from `undefined` to defined.

- [ ] **Step 2: Run lint and typecheck**

Run: `cd frontend && npx eslint src/app/hooks/useThemeSync.ts && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/hooks/useThemeSync.ts
git commit -m "refactor: simplify useThemeSync, delegate resolution to ThemeController.setTheme"
```

---

### Task 5: Create `useResolvedTheme()` React hook

**Files:**
- Create: `frontend/src/app/hooks/useResolvedTheme.ts`
- Create: `frontend/src/app/hooks/__tests__/useResolvedTheme.test.tsx`

**Interfaces:**
- Consumes: `themeController` singleton from `../utils/theme`
- Produces: `export function useResolvedTheme(): 'light' | 'dark'`

- [ ] **Step 1: Write the failing hook test**

Create `frontend/src/app/hooks/__tests__/useResolvedTheme.test.tsx`:

```typescript
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { ResolvedTheme } from '../../design-system/theme';
import { useResolvedTheme } from '../useResolvedTheme';

let mockResolvedTheme: ResolvedTheme = 'dark';
let mockListeners = new Set<(state: { resolvedTheme: ResolvedTheme }) => void>();

vi.mock('../utils/theme', () => ({
  themeController: {
    getState: () => ({ resolvedTheme: mockResolvedTheme }),
    subscribe: (listener: (state: { resolvedTheme: ResolvedTheme }) => void) => {
      mockListeners.add(listener);
      return () => mockListeners.delete(listener);
    },
  },
}));

describe('useResolvedTheme', () => {
  beforeEach(() => {
    mockResolvedTheme = 'dark';
    mockListeners = new Set();
  });

  it('returns current resolved theme from themeController', () => {
    const { result } = renderHook(() => useResolvedTheme());
    expect(result.current).toBe('dark');
  });

  it('returns "light" when themeController has light resolved', () => {
    mockResolvedTheme = 'light';
    const { result } = renderHook(() => useResolvedTheme());
    expect(result.current).toBe('light');
  });

  it('re-renders when themeController emits a change', () => {
    const { result } = renderHook(() => useResolvedTheme());
    expect(result.current).toBe('dark');

    act(() => {
      mockResolvedTheme = 'light';
      for (const l of mockListeners) {
        l({ resolvedTheme: 'light' });
      }
    });

    expect(result.current).toBe('light');
  });

  it('unsubscribes on unmount', () => {
    const { unmount } = renderHook(() => useResolvedTheme());
    expect(mockListeners.size).toBe(1);

    unmount();
    expect(mockListeners.size).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/app/hooks/__tests__/useResolvedTheme.test.tsx`
Expected: FAIL with module not found

- [ ] **Step 3: Create the hook implementation**

Create `frontend/src/app/hooks/useResolvedTheme.ts`:

```typescript
import { useEffect, useState } from 'react';
import type { ResolvedTheme } from '../design-system/theme';
import { themeController } from '../utils/theme';

export function useResolvedTheme(): ResolvedTheme {
  const [theme, setTheme] = useState<ResolvedTheme>(
    () => themeController.getState().resolvedTheme
  );

  useEffect(() => {
    return themeController.subscribe((state) => {
      setTheme(state.resolvedTheme);
    });
  }, []);

  return theme;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/app/hooks/__tests__/useResolvedTheme.test.tsx`
Expected: 4 PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/hooks/useResolvedTheme.ts frontend/src/app/hooks/__tests__/useResolvedTheme.test.tsx
git commit -m "feat: add useResolvedTheme hook subscribing to ThemeController"
```

---

### Task 6: Update `FilesPanel.tsx` consumer

**Files:**
- Modify: `frontend/src/app/regions/right-panel/panels/FilesPanel.tsx:238`

**Interfaces:**
- Consumes: `useResolvedTheme` from `../../../hooks/useResolvedTheme`
- Produces: `resolvedTheme` variable now reactive to OS theme changes

- [ ] **Step 1: Replace stale appInfo.config.resolvedTheme read**

In `frontend/src/app/regions/right-panel/panels/FilesPanel.tsx`, add import:

```typescript
import { useResolvedTheme } from '../../../hooks/useResolvedTheme';
```

Replace line 238:

```typescript
  const resolvedTheme = appInfo?.config?.resolvedTheme === 'dark' ? 'dark' : 'light';
```

with:

```typescript
  const resolvedTheme = useResolvedTheme();
```

- [ ] **Step 2: Run lint and typecheck**

Run: `cd frontend && npx eslint src/app/regions/right-panel/panels/FilesPanel.tsx && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/regions/right-panel/panels/FilesPanel.tsx
git commit -m "refactor: FilesPanel uses useResolvedTheme hook instead of appInfo.config.resolvedTheme"
```

---

### Task 7: Update `DiffEditorSection.tsx` consumer

**Files:**
- Modify: `frontend/src/app/regions/right-panel/panels/DiffEditorSection.tsx:77-78`

**Interfaces:**
- Consumes: `useResolvedTheme` from `../../../hooks/useResolvedTheme`

- [ ] **Step 1: Replace stale appInfo.config.resolvedTheme read**

In `frontend/src/app/regions/right-panel/panels/DiffEditorSection.tsx`, add import:

```typescript
import { useResolvedTheme } from '../../../hooks/useResolvedTheme';
```

Replace lines 77-78:

```typescript
  const changePreviewTheme =
    appInfo?.config.resolvedTheme === 'dark' ? ('dark' as const) : ('light' as const);
```

with:

```typescript
  const changePreviewTheme = useResolvedTheme();
```

- [ ] **Step 2: Run lint and typecheck**

Run: `cd frontend && npx eslint src/app/regions/right-panel/panels/DiffEditorSection.tsx && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/regions/right-panel/panels/DiffEditorSection.tsx
git commit -m "refactor: DiffEditorSection uses useResolvedTheme hook instead of appInfo.config.resolvedTheme"
```

---

### Task 8: Update `PatchReviewSection.tsx` consumer

**Files:**
- Modify: `frontend/src/app/regions/right-panel/panels/PatchReviewSection.tsx:104-105`

**Interfaces:**
- Consumes: `useResolvedTheme` from `../../../hooks/useResolvedTheme`

- [ ] **Step 1: Replace stale appInfo.config.resolvedTheme read**

In `frontend/src/app/regions/right-panel/panels/PatchReviewSection.tsx`, add import:

```typescript
import { useResolvedTheme } from '../../../hooks/useResolvedTheme';
```

Replace lines 104-105:

```typescript
  const changePreviewTheme =
    appInfo?.config.resolvedTheme === 'dark' ? ('dark' as const) : ('light' as const);
```

with:

```typescript
  const changePreviewTheme = useResolvedTheme();
```

- [ ] **Step 2: Run lint and typecheck**

Run: `cd frontend && npx eslint src/app/regions/right-panel/panels/PatchReviewSection.tsx && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/regions/right-panel/panels/PatchReviewSection.tsx
git commit -m "refactor: PatchReviewSection uses useResolvedTheme hook instead of appInfo.config.resolvedTheme"
```

---

### Task 9: Full verification

**Files:**
- (none modified, read-only checks)

- [ ] **Step 1: Run full TypeScript check**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 2: Run full ESLint check**

Run: `cd frontend && npx eslint src/app src/shared/src/design-system --ext .ts,.tsx 2>&1 | Select-Object -Last 5`

Alternatively (focused scope):
Run: `cd frontend && npx eslint src/app/hooks/useResolvedTheme.ts src/app/hooks/useThemeSync.ts src/shared/resolveTheme.ts src/shared/preferencesMerger.ts src/app/stores/actions/generalActions.ts src/app/regions/right-panel/panels/FilesPanel.tsx src/app/regions/right-panel/panels/DiffEditorSection.tsx src/app/regions/right-panel/panels/PatchReviewSection.tsx`
Expected: no errors, no warnings

- [ ] **Step 3: Run all affected tests**

Run: `cd frontend && npx vitest run src/shared/__tests__/resolveTheme.test.ts src/app/hooks/__tests__/useResolvedTheme.test.tsx src/design-system/__tests__/theme.test.ts`
Expected: all PASS

- [ ] **Step 4: Review diff for correctness**

Run: `git diff HEAD~8..HEAD --stat`
Expected: ~10 files changed, only the expected modifications

Run: `git log --oneline -9`
Expected: 1 commit per task, clean history

- [ ] **Step 5: Final commit (if needed)**

Only if verification reveals issues that need fixing.
