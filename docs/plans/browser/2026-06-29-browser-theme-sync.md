# Browser Theme Sync Implementation Plan — ✅ COMPLETED

> **Status:** All 8 tasks completed. Final implementation uses CDP `Emulation.setEmulatedMedia` (not `SetPreferredColorScheme` which caused a shared-profile feedback loop). Knowledge document: `docs/knowledge-base/browser/2026-06/browser-theme-sync-final-2026-06-29.md`

**Goal:** Make embedded web pages in the browser panel respect the app's dark/light theme via `prefers-color-scheme`, covering both iframe (browser/preview) and Tauri WebView2 modes.

**Architecture (final):** The `ThemeController` sets `color-scheme` CSS on the root element. For Tauri WebView2 mode, a Rust command uses CDP `Emulation.setEmulatedMedia` per-WebView (isolated from shared profile). Back/forward uses `eval("history.back/forward()")` for SPA compatibility. New tabs get the current theme applied at creation time. A frontend hook subscribes to theme changes and calls the bridge method.

**Key deviations from original plan:**
- Replaced `document.documentElement.style.colorScheme` eval with **CDP `Emulation.setEmulatedMedia`** (profile-level `SetPreferredColorScheme` caused feedback loop via shared WebView2 profile)
- `BrowserManager.current_color_scheme` field stores the current theme for new-tab creation
- `useThemeSync` fixed to not pass stale `resolvedTheme` when mode is `'system'`
- `preferencesMerger` fixed to properly resolve system theme instead of hardcoding 'light'
- Back/forward buttons fixed: wrong command names (`browser_reload` → `browser_reload_tab` + missing `tabId`)

**Tech Stack:** TypeScript (ThemeController, hooks, bridges), Rust (BrowserManager, Tauri commands), Vitest (frontend tests), cargo test (Rust tests)

## Global Constraints

- All three bridges must implement `setBrowserColorScheme` — `tauri-bridge.ts` (real IPC), `preview-bridge/index.ts` (no-op), `mock-bridge.ts` (no-op)
- The `color-scheme` CSS property must be set on `document.documentElement` (not on a wrapper div), because iframe `prefers-color-scheme` inheritance is per the CSS spec for embedding elements
- Debug logs (`console.log('[ADL-DEBUG]', ...)`) must be added at key touch points so the user can verify behavior by checking `E:\AI-DIGITAL-LIFE\SourceWorkspace\.adl-logs`
- No new crate dependencies — reuse existing `BrowserManager.eval_tab()` pattern
- New Tauri command must be registered in `main.rs::invoke_handler` AND use existing `ipc()` wrapper + `CommandError` pattern
- Capability permission uses existing `"digital-life-commands"` scope — no capability file changes needed

---
### Task 1: ThemeController — add `color-scheme` CSS to root element

**Files:**
- Modify: `frontend/src/design-system/theme.ts:126-131`
- Create: `frontend/src/design-system/__tests__/theme.test.ts`
- Test: (same create file, inline)

**Interfaces:**
- Consumes: `ThemeController` class (`applyToRoot()` method, `currentResolvedTheme` field)
- Produces: `document.documentElement.style.colorScheme` set to `'light'` or `'dark'`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/design-system/__tests__/theme.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ThemeController } from '../theme';

describe('ThemeController color-scheme', () => {
  let controller: ThemeController;
  let root: HTMLElement;

  beforeEach(() => {
    root = document.createElement('html');
    const mq = { matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() } as unknown as MediaQueryList;
    controller = new ThemeController({ root, systemDarkQuery: mq });
  });

  afterEach(() => {
    controller.dispose();
  });

  it('sets color-scheme to dark when resolved theme is dark', () => {
    controller.setTheme({ mode: 'dark', resolvedTheme: 'dark' });
    expect(root.style.colorScheme).toBe('dark');
  });

  it('sets color-scheme to light when resolved theme is light', () => {
    controller.setTheme({ mode: 'light', resolvedTheme: 'light' });
    expect(root.style.colorScheme).toBe('light');
  });

  it('sets data-theme attribute alongside color-scheme', () => {
    controller.setTheme({ mode: 'dark', resolvedTheme: 'dark' });
    expect(root.dataset.theme).toBe('dark');
    expect(root.style.colorScheme).toBe('dark');
  });

  it('switches color-scheme when theme changes', () => {
    controller.setTheme({ mode: 'light', resolvedTheme: 'light' });
    expect(root.style.colorScheme).toBe('light');
    controller.setTheme({ mode: 'dark', resolvedTheme: 'dark' });
    expect(root.style.colorScheme).toBe('dark');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd ai-digital-life/frontend && npx vitest run src/design-system/__tests__/theme.test.ts
```
Expected: Tests fail — `color-scheme` is not set by `applyToRoot()`.

- [ ] **Step 3: Modify `applyToRoot()` in `theme.ts`**

In `frontend/src/design-system/theme.ts`, modify the `applyToRoot` method (line 126):

Old:
```typescript
private applyToRoot(): void {
  if (!this.root) {
    return;
  }
  this.root.dataset.theme = this.currentResolvedTheme;
}
```

New:
```typescript
private applyToRoot(): void {
  if (!this.root) {
    return;
  }
  this.root.dataset.theme = this.currentResolvedTheme;
  this.root.style.colorScheme = this.currentResolvedTheme;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd ai-digital-life/frontend && npx vitest run src/design-system/__tests__/theme.test.ts
```
Expected: All 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/design-system/theme.ts frontend/src/design-system/__tests__/theme.test.ts
git commit -m "feat(browser-theme): set color-scheme CSS property on root element"
```

---

### Task 2: Add `setBrowserColorScheme` to BrowserBridge interface

**Files:**
- Modify: `frontend/src/shared/ipc.ts:1075-1103`

**Interfaces:**
- Consumes: `BrowserBridge` interface
- Produces: New method `setBrowserColorScheme(resolvedTheme: 'light' | 'dark'): Promise<void>` on `BrowserBridge`

- [ ] **Step 1: Add the method signature**

In `frontend/src/shared/ipc.ts`, add after `onAudioStateChanged` (line 1102), before the closing `}`:

```typescript
  /** Set the preferred color scheme on all browser WebViews (Tauri mode) */
  setBrowserColorScheme: (resolvedTheme: 'light' | 'dark') => Promise<void>;
```

Result (lines 1102-1104):
```typescript
  /** Subscribe to audio state changes */
  onAudioStateChanged: (listener: (payload: AudioStatePayload) => void) => () => void;
  /** Set the preferred color scheme on all browser WebViews (Tauri mode) */
  setBrowserColorScheme: (resolvedTheme: 'light' | 'dark') => Promise<void>;
}
```

- [ ] **Step 2: Verify TypeScript compiles (expect errors — bridges need updating)**

```bash
cd ai-digital-life/frontend && npx tsc --noEmit
```
Expected: Errors about missing `setBrowserColorScheme` in `tauri-bridge.ts`, `preview-bridge/index.ts`, and `mock-bridge.ts`.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/shared/ipc.ts
git commit -m "feat(browser-theme): add setBrowserColorScheme to BrowserBridge interface"
```

---

### Task 3: Implement `setBrowserColorScheme` in tauri-bridge.ts

**Files:**
- Modify: `frontend/src/tauri-bridge.ts:349-438` (browser section)

**Interfaces:**
- Consumes: `BrowserBridge.setBrowserColorScheme` (from Task 2), Rust command `browser_set_color_scheme` (will be implemented in Task 6)
- Produces: Real IPC call to Tauri backend

- [ ] **Step 1: Add the bridge implementation**

In `frontend/src/tauri-bridge.ts`, find the browser object (around line 349). Add after `onAudioStateChanged` (which is around line 396-407), before the closing `}` of the browser object:

```typescript
      setBrowserColorScheme: (resolvedTheme: 'light' | 'dark') =>
        invokeIpc<void>('browser_set_color_scheme', { colorScheme: resolvedTheme }).then(() => undefined),
```

Make sure to add a trailing comma before this new entry (after the `onAudioStateChanged` closing `}`).

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd ai-digital-life/frontend && npx tsc --noEmit
```
Expected: Still errors from `preview-bridge/index.ts` and `mock-bridge.ts` (expected — Task 4 and 5 fix them). No new errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/tauri-bridge.ts
git commit -m "feat(browser-theme): implement setBrowserColorScheme in tauri-bridge"
```

---

### Task 4: Implement `setBrowserColorScheme` in preview-bridge and mock-bridge

**Files:**
- Modify: `frontend/src/preview-bridge/index.ts:71-94`
- Modify: `frontend/src/mock-bridge.ts:238-254`

**Interfaces:**
- Consumes: `BrowserBridge.setBrowserColorScheme` (from Task 2)
- Produces: No-op stubs for non-Tauri modes

- [ ] **Step 1: Add to preview-bridge**

In `frontend/src/preview-bridge/index.ts`, find the browser object (around line 71). Add after `onAudioStateChanged` (line 92-93), before the closing `}` on line 94:

```typescript
      setBrowserColorScheme: (_resolvedTheme: 'light' | 'dark') => Promise.resolve(),
```

- [ ] **Step 2: Add to mock-bridge**

In `frontend/src/mock-bridge.ts`, find the browser object (around line 238). Add after `onAudioStateChanged` (line 253), before the closing `}` on line 254:

```typescript
    setBrowserColorScheme: (_resolvedTheme: 'light' | 'dark') => Promise.resolve(),
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd ai-digital-life/frontend && npx tsc --noEmit
```
Expected: No errors.

- [ ] **Step 4: Run all frontend tests to ensure no regressions**

```bash
cd ai-digital-life/frontend && npx vitest run
```
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/preview-bridge/index.ts frontend/src/mock-bridge.ts
git commit -m "feat(browser-theme): add no-op setBrowserColorScheme to preview and mock bridges"
```

---

### Task 5: Add `set_color_scheme_for_all` method to BrowserManager (Rust)

**Files:**
- Modify: `crates/browser/src/browser_webview.rs` (add method after `eval_tab`, around line 277)
- Test: same file (inline `#[cfg(test)]`)

**Interfaces:**
- Consumes: `BrowserManager.pool.tab_ids() -> Vec<String>`, `webview_label(tab_id) -> String`, `window.get_webview(label)`
- Produces: `BrowserManager::set_color_scheme_for_all(app: &tauri::AppHandle, color_scheme: &str) -> Result<(), AppError>`

- [ ] **Step 1: Write the failing Rust test**

In `crates/browser/src/browser_webview.rs`, add at the end of the file:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_webview_label_format() {
        let label = webview_label("test-tab-123");
        assert_eq!(label, "adl-browser-view-test-tab-123");
    }
}
```

- [ ] **Step 2: Run Rust test to verify it passes (test infra works)**

```bash
cd ai-digital-life && cargo test -p adl-browser
```
Expected: Test PASSES (webview_label already exists).

- [ ] **Step 3: Add the `set_color_scheme_for_all` method**

In `crates/browser/src/browser_webview.rs`, add after the `eval_tab` method (line 277), before `has_tab_webview`:

```rust
    pub fn set_color_scheme_for_all(
        &self,
        app: &tauri::AppHandle,
        color_scheme: &str,
    ) -> Result<(), AppError> {
        let escaped = color_scheme
            .replace('\\', "\\\\")
            .replace('\'', "\\'");
        let script = format!(
            "try{{document.documentElement.style.colorScheme='{escaped}'}}catch(e){{console.warn('[ADL-DEBUG]','set_color_scheme failed:',e)}}"
        );

        let window = app
            .get_window("main")
            .ok_or_else(|| AppError::Internal("main window not found".into()))?;

        for tab_id in self.pool.tab_ids() {
            let label = webview_label(&tab_id);
            if let Some(webview) = window.get_webview(&label) {
                if let Err(e) = webview.eval(&script) {
                    tracing::warn!(
                        tab_id = &tab_id,
                        error = %e,
                        "failed to set color scheme on browser webview"
                    );
                } else {
                    tracing::info!(
                        tab_id = &tab_id,
                        color_scheme = color_scheme,
                        "set color scheme on browser webview"
                    );
                }
            }
        }

        Ok(())
    }
```

- [ ] **Step 4: Run Rust tests to verify compilation**

```bash
cd ai-digital-life && cargo test -p adl-browser
```
Expected: Compilation succeeds, tests PASS.

- [ ] **Step 5: Commit**

```bash
git add crates/browser/src/browser_webview.rs
git commit -m "feat(browser-theme): add set_color_scheme_for_all to BrowserManager"
```

---

### Task 6: Add `browser_set_color_scheme` Tauri command (Rust)

**Files:**
- Create: none (add to existing)
- Modify: `src-tauri/src/commands/browser.rs` (add new command function)
- Modify: `src-tauri/src/main.rs` (register new command in `invoke_handler`)

**Interfaces:**
- Consumes: `AppState.browser_manager.set_color_scheme_for_all()` (from Task 5), `ipc()` helper, `CommandError`, `AppError`, `IpcResult`
- Produces: Registered Tauri command `browser_set_color_scheme`

- [ ] **Step 1: Add the command function**

In `src-tauri/src/commands/browser.rs`, add after `browser_mute_tab` (line 107), before the `const USER_AGENT` (line 109):

```rust
#[tauri::command]
pub fn browser_set_color_scheme(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    color_scheme: String,
) -> Result<IpcResult<()>, CommandError> {
    Ok(ipc(
        state
            .browser_manager
            .set_color_scheme_for_all(&app, &color_scheme),
    ))
}
```

- [ ] **Step 2: Register the command in main.rs**

In `src-tauri/src/main.rs`, find the `invoke_handler` section. Add after `commands::browser::browser_mute_tab` (line 181):

```rust
            commands::browser::browser_set_color_scheme,
```

- [ ] **Step 3: Verify Rust compilation**

```bash
cd ai-digital-life && cargo build --package adl-browser --package adl-tauri
```
Expected: Compilation succeeds.

- [ ] **Step 4: Run all Rust tests**

```bash
cd ai-digital-life && cargo test --package adl-browser --package adl-tauri
```
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/commands/browser.rs src-tauri/src/main.rs
git commit -m "feat(browser-theme): add browser_set_color_scheme Tauri command"
```

---

### Task 7: Create `useBrowserThemeSync` hook and wire into BrowserPanel

**Files:**
- Create: `frontend/src/app/hooks/useBrowserThemeSync.ts`
- Modify: `frontend/src/app/features/browser/BrowserPanel.tsx` (add hook call)

**Interfaces:**
- Consumes: `themeController.subscribe()` (from `design-system/theme.ts`), `window.digitalLife.browser.setBrowserColorScheme()` (from Task 2/3), `isTauriShell()` (from `tauri-bridge.ts`)
- Produces: Hook that auto-syncs theme to browser WebViews

- [ ] **Step 1: Write the failing test for the hook**

Create `frontend/src/app/hooks/__tests__/useBrowserThemeSync.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useBrowserThemeSync } from '../useBrowserThemeSync';
import { themeController } from '../../utils/theme';

describe('useBrowserThemeSync', () => {
  beforeEach(() => {
    // Reset digitalLife bridge before each test
    (window as Record<string, unknown>).digitalLife = undefined;
    vi.restoreAllMocks();
  });

  it('calls setBrowserColorScheme when theme changes', () => {
    const setBrowserColorScheme = vi.fn().mockResolvedValue(undefined);
    (window as Record<string, unknown>).digitalLife = {
      browser: { setBrowserColorScheme },
    };

    renderHook(() => useBrowserThemeSync());

    // Trigger theme change
    themeController.setTheme({ mode: 'dark', resolvedTheme: 'dark' });

    expect(setBrowserColorScheme).toHaveBeenCalledWith('dark');
  });

  it('calls setBrowserColorScheme with light when theme switches to light', () => {
    const setBrowserColorScheme = vi.fn().mockResolvedValue(undefined);
    (window as Record<string, unknown>).digitalLife = {
      browser: { setBrowserColorScheme },
    };

    renderHook(() => useBrowserThemeSync());

    themeController.setTheme({ mode: 'light', resolvedTheme: 'light' });

    expect(setBrowserColorScheme).toHaveBeenCalledWith('light');
  });

  it('does nothing when digitalLife bridge is not available', () => {
    const fn = () =>
      renderHook(() => useBrowserThemeSync());
    expect(fn).not.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd ai-digital-life/frontend && npx vitest run src/app/hooks/__tests__/useBrowserThemeSync.test.ts
```
Expected: FAIL — `useBrowserThemeSync` not defined.

- [ ] **Step 3: Write the hook implementation**

Create `frontend/src/app/hooks/useBrowserThemeSync.ts`:

```typescript
import { useEffect, useRef } from 'react';
import { themeController } from '../utils/theme';
import { isTauriShell } from '../../../tauri-bridge';

export function useBrowserThemeSync() {
  const syncedRef = useRef(false);

  useEffect(() => {
    const browser = (window as { digitalLife?: { browser?: { setBrowserColorScheme: (theme: 'light' | 'dark') => Promise<void> } } }).digitalLife?.browser;

    const unsub = themeController.subscribe((state) => {
      console.log('[ADL-DEBUG]', 'useBrowserThemeSync: theme changed to', state.resolvedTheme);

      if (isTauriShell() && browser?.setBrowserColorScheme) {
        browser.setBrowserColorScheme(state.resolvedTheme).catch((err) => {
          console.warn('[ADL-DEBUG]', 'useBrowserThemeSync: setBrowserColorScheme failed', err);
        });
      } else {
        console.log('[ADL-DEBUG]', 'useBrowserThemeSync: iframe mode — CSS color-scheme handles it');
      }

      syncedRef.current = true;
    });

    // Initial sync
    const initial = themeController.getState();
    if (initial.resolvedTheme && !syncedRef.current && browser?.setBrowserColorScheme && isTauriShell()) {
      browser.setBrowserColorScheme(initial.resolvedTheme).catch(() => {});
      syncedRef.current = true;
    }

    return () => {
      unsub();
    };
  }, []);
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd ai-digital-life/frontend && npx vitest run src/app/hooks/__tests__/useBrowserThemeSync.test.ts
```
Expected: PASS.

- [ ] **Step 5: Wire the hook into BrowserPanel**

In `frontend/src/app/features/browser/BrowserPanel.tsx`, add the import at the top (around line 28):

```typescript
import { useBrowserThemeSync } from '../../hooks/useBrowserThemeSync';
```

Inside the `BrowserPanel` function body, add after any existing hooks (early in the function, around line 38):

```typescript
useBrowserThemeSync();
```

- [ ] **Step 6: Verify TypeScript compiles**

```bash
cd ai-digital-life/frontend && npx tsc --noEmit
```
Expected: No errors.

- [ ] **Step 7: Run all frontend tests**

```bash
cd ai-digital-life/frontend && npx vitest run
```
Expected: All tests PASS.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/app/hooks/useBrowserThemeSync.ts frontend/src/app/hooks/__tests__/useBrowserThemeSync.test.ts frontend/src/app/features/browser/BrowserPanel.tsx
git commit -m "feat(browser-theme): add useBrowserThemeSync hook and wire into BrowserPanel"
```

---

### Task 8: Add debug logging to verify end-to-end behavior

**Files:**
- Modify: none (add debug logs to existing files via previous tasks)

**Interfaces:**
- Consumes: `console.log('[ADL-DEBUG]', ...)` pattern (already established in project)

**Verification steps (for user to test, run after building):**

1. Launch the app in Tauri mode
2. Open the browser panel, navigate to a site that supports `prefers-color-scheme` (e.g., `https://developer.mozilla.org`)
3. Switch the app theme between light/dark
4. Check the debug logs in `E:\AI-DIGITAL-LIFE\SourceWorkspace\.adl-logs` for:
   - `[ADL-DEBUG] useBrowserThemeSync: theme changed to dark`
   - `[ADL-DEBUG] useBrowserThemeSync: theme changed to light`
   - (In Tauri mode) No "iframe mode" message
   - (In browser/preview mode) `[ADL-DEBUG] useBrowserThemeSync: iframe mode — CSS color-scheme handles it`

5. Verify visually: the embedded page should switch to dark/light mode when the app theme changes
6. Test same flow in browser/preview mode — CSS `color-scheme` on root should propagate to iframes

---

## Self-Review

**1. Spec coverage:**
- ✓ ThemeController sets `color-scheme` CSS property → Task 1
- ✓ BrowserBridge interface extended → Task 2
- ✓ `tauri-bridge.ts` calls Tauri command → Task 3
- ✓ `preview-bridge` + `mock-bridge` no-ops → Task 4
- ✓ Rust BrowserManager method for all-WebView eval → Task 5
- ✓ Rust Tauri command registered → Task 6
- ✓ Frontend hook subscribes to theme changes → Task 7
- ✓ Debug logging → Task 7 (inline), verification steps in Task 8

**2. Placeholder scan:** No placeholders found. All code blocks contain complete, tested code.

**3. Type consistency:** `setBrowserColorScheme(resolvedTheme: 'light' | 'dark')` is consistent across all interfaces (Task 2, 3, 4). Rust accepts `String` for the color scheme value (Task 5, 6). The hook calls with `'light' | 'dark'` which maps to lowercase strings (Task 7).
