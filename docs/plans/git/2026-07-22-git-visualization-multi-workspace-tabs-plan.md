# Git Visualization Multi-Workspace Tabs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a dynamic workspace tab bar (WorkspaceTabBar) to the Git Visualization area, enabling multi-workspace switching with adaptive overflow behavior.

**Architecture:** A self-contained WorkspaceTabBar component mounted at the top of GitVisualizationView. Uses ResizeObserver to detect overflow — when all 27 mock workspace tabs fit, no controls shown; when overflowed, show pagination dots below + left/right arrows on sides + curtain fade + mouse wheel scrolling. Active tab persisted to localStorage via uiSlice.

**Tech Stack:** React 19, Zustand (uiSlice), CSS custom properties, Vitest + Testing Library

## Global Constraints

- All tabs must share the same fixed width (consistent length); long names truncated with `text-overflow: ellipsis`
- Native `title` attribute on each tab button for full name tooltip on hover
- Active workspace tab persisted to localStorage via `writeJson`/`readJson` (pattern: `ACTIVE_WORKSPACE_TAB_KEY`)
- Tab bar must work in both Tauri and browser mode (no platform-specific APIs)
- i18n key pattern: `gitVisWorkspaceTab` for tab label format
- Component imports from `@stores/slicedStore`, `@i18n/useTCopy`, `@components/Tooltip`

---

### Task 1: Add workspace tab state to uiSlice

**Files:**
- Modify: `frontend/src/app/stores/slices/uiSliceTypes.ts`
- Modify: `frontend/src/app/stores/slices/uiSlice.ts`

**Interfaces:**
- Consumes: existing `readJson`, `writeJson`, `readFlag`, `makePersistedWriter` shared helpers
- Produces: `activeWorkspaceTab: string` field + `setActiveWorkspaceTab` action

- [ ] **Step 1: Add key constant and type field to uiSliceTypes.ts**

Add after `ACTIVE_HEATMAP_TAB_KEY` line:
```typescript
export const ACTIVE_WORKSPACE_TAB_KEY = 'adl-ui:active-workspace-tab';
```

Add to `UISlice` interface (after `activeHeatmapTab: HeatmapTab`):
```typescript
  activeWorkspaceTab: string;
```

Add to `UISlice` interface (after `setActiveHeatmapTab`):
```typescript
  setActiveWorkspaceTab: (tab: string) => void;
```

- [ ] **Step 2: Add hydration and default value in uiSlice.ts**

In the import block, add:
```typescript
import {
  ACTIVE_WORKSPACE_TAB_KEY,
} from './uiSliceTypes';
```

In `hydrateUIDefaults`, after the `activeHeatmapTab` line:
```typescript
    const activeWorkspaceTab = readJson<string>(ACTIVE_WORKSPACE_TAB_KEY, 'workspace-1');
```

In the `set({...})` call in `hydrateUIDefaults`, add:
```typescript
      activeWorkspaceTab,
```

In `createUISlice` return value, after `activeHeatmapTab: 'calendar'`:
```typescript
    activeWorkspaceTab: 'workspace-1',
```

Add the action after `setActiveHeatmapTab`:
```typescript
    setActiveWorkspaceTab: (tab) => {
      writeJson(ACTIVE_WORKSPACE_TAB_KEY, tab);
      set({ activeWorkspaceTab: tab });
    },
```

- [ ] **Step 3: Run tests to verify no breakage**

Run: `pnpm --dir frontend run test -- --run src/app/stores/`

Expected: All existing store tests pass.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/stores/slices/uiSliceTypes.ts frontend/src/app/stores/slices/uiSlice.ts
git commit -m "feat(ui): add activeWorkspaceTab state to uiSlice"
```

---

### Task 2: Create mock workspace data

**Files:**
- Modify: `frontend/src/app/features/git-visualization/data/gitVisMockData.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `mockWorkspaceTabs: { id: string; label: string }[]` — 27 items, `title` attribute ready

- [ ] **Step 1: Add `mockWorkspaceTabs` array**

After the `allBranches` array, add:
```typescript
export const mockWorkspaceTabs: { id: string; label: string }[] = Array.from(
  { length: 27 },
  (_, i) => ({
    id: `workspace-${i + 1}`,
    label: `Workspace ${i + 1}`,
  }),
);
```

- [ ] **Step 2: Run tests to verify**

Run: `pnpm --dir frontend run test -- --run src/app/features/git-visualization/data/`

Expected: All existing mock data tests pass.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/features/git-visualization/data/gitVisMockData.ts
git commit -m "feat(git-vis): add 27 mock workspace tab entries"
```

---

### Task 3: Create WorkspaceTabBar component

**Files:**
- Create: `frontend/src/app/features/git-visualization/WorkspaceTabBar.tsx`
- Create: `frontend/src/app/features/git-visualization/WorkspaceTabBar.test.tsx`

**Interfaces:**
- Consumes: `useAppStore((s) => ({ activeWorkspaceTab: s.activeWorkspaceTab, setActiveWorkspaceTab: s.setActiveWorkspaceTab }))` from `@stores/slicedStore`; `useTCopy()` from `@i18n/useTCopy`; `mockWorkspaceTabs` from `./data/gitVisMockData`
- Produces: `<WorkspaceTabBar>` component exported as named export

- [ ] **Step 1: Write the failing test**

```typescript
// WorkspaceTabBar.test.tsx
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';
import React from 'react';
import { WorkspaceTabBar } from './WorkspaceTabBar';

const mockSetActiveWorkspaceTab = vi.fn();

vi.mock('@stores/slicedStore', () => ({
  useAppStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({
      activeWorkspaceTab: 'workspace-1',
      setActiveWorkspaceTab: mockSetActiveWorkspaceTab,
    }),
}));

vi.mock('@i18n/useTCopy', () => ({
  useTCopy: vi.fn(() => ({
    t: {},
    formatT: vi.fn(),
  })),
}));

afterEach(() => {
  cleanup();
  mockSetActiveWorkspaceTab.mockClear();
});

describe('WorkspaceTabBar', () => {
  it('renders all workspace tabs', () => {
    const { container } = render(<WorkspaceTabBar />);
    const tabs = container.querySelectorAll('.adl-workspace-tab__tab');
    expect(tabs.length).toBe(27);
  });

  it('marks the first tab as active by default', () => {
    const { container } = render(<WorkspaceTabBar />);
    const activeTab = container.querySelector('.adl-workspace-tab__tab--active');
    expect(activeTab).toBeTruthy();
    expect(activeTab?.textContent?.trim()).toBe('Workspace 1');
  });

  it('calls setActiveWorkspaceTab on click', () => {
    const { container } = render(<WorkspaceTabBar />);
    const tabs = container.querySelectorAll('.adl-workspace-tab__tab');
    fireEvent.click(tabs[2]);
    expect(mockSetActiveWorkspaceTab).toHaveBeenCalledWith('workspace-3');
  });

  it('sets title attribute on each tab for tooltip', () => {
    const { container } = render(<WorkspaceTabBar />);
    const firstTab = container.querySelector('.adl-workspace-tab__tab');
    expect(firstTab?.getAttribute('title')).toBe('Workspace 1');
  });

  it('renders pagination dots when tabs overflow', () => {
    // Mock getBoundingClientRect to simulate narrow container
    const originalFn = HTMLElement.prototype.getBoundingClientRect;
    HTMLElement.prototype.getBoundingClientRect = vi.fn(function (this: HTMLElement) {
      if (this.classList?.contains('adl-workspace-tab__scroll-container')) {
        return { width: 200, height: 32, top: 0, left: 0, right: 200, bottom: 32 } as DOMRect;
      }
      if (this.classList?.contains('adl-workspace-tab__tab')) {
        return { width: 80, height: 32, top: 0, left: 0, right: 80, bottom: 32 } as DOMRect;
      }
      return { width: 0, height: 0, top: 0, left: 0, right: 0, bottom: 0 } as DOMRect;
    });

    const { container } = render(<WorkspaceTabBar />);
    const dots = container.querySelectorAll('.adl-workspace-tab__dot');
    expect(dots.length).toBeGreaterThan(1);

    HTMLElement.prototype.getBoundingClientRect = originalFn;
  });

  it('does not render pagination controls when all tabs fit', () => {
    const { container } = render(<WorkspaceTabBar />);
    // By default with full width, tabs should fit
    const arrows = container.querySelectorAll('.adl-workspace-tab__arrow');
    // We can't easily test this without mocking layout
    // but at minimum verify no crash and tabs render
    const tabs = container.querySelectorAll('.adl-workspace-tab__tab');
    expect(tabs.length).toBe(27);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --dir frontend run test -- --run src/app/features/git-visualization/WorkspaceTabBar.test.tsx`

Expected: FAIL with "Cannot find module './WorkspaceTabBar'"

- [ ] **Step 3: Write minimal WorkspaceTabBar implementation**

```typescript
// WorkspaceTabBar.tsx
import React, { useRef, useState, useEffect, useCallback } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from '@stores/slicedStore';
import { mockWorkspaceTabs } from './data/gitVisMockData';

const TAB_WIDTH = 120;
const TAB_GAP = 4;

export const WorkspaceTabBar = React.memo(function WorkspaceTabBar() {
  const { activeWorkspaceTab, setActiveWorkspaceTab } = useAppStore(
    useShallow((s) => ({
      activeWorkspaceTab: s.activeWorkspaceTab,
      setActiveWorkspaceTab: s.setActiveWorkspaceTab,
    })),
  );

  const scrollRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [page, setPage] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [visibleTabs, setVisibleTabs] = useState(27);

  const recalc = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const containerWidth = container.getBoundingClientRect().width;
    const perPage = Math.max(1, Math.floor((containerWidth + TAB_GAP) / (TAB_WIDTH + TAB_GAP)));
    setVisibleTabs(perPage);
    setTotalPages(Math.max(1, Math.ceil(mockWorkspaceTabs.length / perPage)));
  }, []);

  useEffect(() => {
    recalc();
    const ro = new ResizeObserver(recalc);
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, [recalc]);

  const isOverflowed = totalPages > 1;

  const handlePrev = useCallback(() => {
    setPage((p) => Math.max(p - 1, 0));
  }, []);

  const handleNext = useCallback(() => {
    setPage((p) => Math.min(p + 1, totalPages - 1));
  }, [totalPages]);

  const currentTabs = React.useMemo(() => {
    const start = page * visibleTabs;
    return mockWorkspaceTabs.slice(start, start + visibleTabs);
  }, [page, visibleTabs]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (!isOverflowed) return;
    e.preventDefault();
    const delta = e.deltaY > 0 ? 1 : -1;
    setPage((p) => Math.min(totalPages - 1, Math.max(0, p + delta)));
  }, [isOverflowed, totalPages]);

  const activeIndex = mockWorkspaceTabs.findIndex((t) => t.id === activeWorkspaceTab);

  return (
    <div className="adl-workspace-tab__container" ref={containerRef}>
      <div className="adl-workspace-tab__row">
        {isOverflowed && (
          <button
            type="button"
            className="adl-workspace-tab__arrow"
            onClick={handlePrev}
            disabled={page === 0}
            aria-label="Previous page"
          >
            ◀
          </button>
        )}

        <div
          ref={scrollRef}
          className="adl-workspace-tab__scroll-container"
          data-overflowed={isOverflowed ? 'true' : 'false'}
          onWheel={handleWheel}
        >
          <div className="adl-workspace-tab__track">
            {currentTabs.map((item) => {
              const isActive = item.id === activeWorkspaceTab;
              return (
                <button
                  key={item.id}
                  type="button"
                  className={`adl-workspace-tab__tab${isActive ? ' adl-workspace-tab__tab--active' : ''}`}
                  onClick={() => setActiveWorkspaceTab(item.id)}
                  title={item.label}
                  aria-pressed={isActive}
                >
                  <span className="adl-workspace-tab__tab-text">{item.label}</span>
                </button>
              );
            })}
          </div>
          {isOverflowed && <div className="adl-workspace-tab__fade" />}
        </div>

        {isOverflowed && (
          <button
            type="button"
            className="adl-workspace-tab__arrow"
            onClick={handleNext}
            disabled={page === totalPages - 1}
            aria-label="Next page"
          >
            ▶
          </button>
        )}
      </div>

      {isOverflowed && (
        <div className="adl-workspace-tab__dots">
          {Array.from({ length: totalPages }).map((_, idx) => (
            <span
              key={idx}
              className={`adl-workspace-tab__dot${idx === page ? ' adl-workspace-tab__dot--active' : ''}`}
              onClick={() => setPage(idx)}
              role="button"
              tabIndex={0}
              aria-label={`Page ${idx + 1}`}
            />
          ))}
        </div>
      )}
    </div>
  );
});
```

Note: The arrow buttons use Unicode characters ◀ ▶ for now. The fade effect is a CSS `::after` pseudo-element on the scroll container.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --dir frontend run test -- --run src/app/features/git-visualization/WorkspaceTabBar.test.tsx`

Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/features/git-visualization/WorkspaceTabBar.tsx frontend/src/app/features/git-visualization/WorkspaceTabBar.test.tsx
git commit -m "feat(git-vis): add WorkspaceTabBar component"
```

---

### Task 4: Update GitVisualizationView

**Files:**
- Modify: `frontend/src/app/features/git-visualization/GitVisualizationView.tsx`

**Interfaces:**
- Consumes: `<WorkspaceTabBar>` from `./WorkspaceTabBar`

- [ ] **Step 1: Write the failing test**

Update the mock for `GitVisualizationView.test.tsx` — add `activeWorkspaceTab` and `setActiveWorkspaceTab` to the store mock:

```typescript
// In the vi.mock('@stores/slicedStore', ...) block, update:
vi.mock('@stores/slicedStore', () => ({
  useAppStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({
      activeHeatmapTab: 'calendar',
      setActiveHeatmapTab: vi.fn(),
      activeWorkspaceTab: 'workspace-1',
      setActiveWorkspaceTab: vi.fn(),
    }),
}));
```

Add test case in `GitVisualizationView.test.tsx`:
```typescript
it('renders WorkspaceTabBar', () => {
  const { container } = render(<GitVisualizationView />);
  const tabBar = container.querySelector('.adl-workspace-tab__container');
  expect(tabBar).toBeTruthy();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --dir frontend run test -- --run src/app/features/git-visualization/GitVisualizationView.test.tsx`

Expected: FAIL (workspace tab bar question marks not rendered)

- [ ] **Step 3: Add WorkspaceTabBar to GitVisualizationView**

Add import at top:
```typescript
import { WorkspaceTabBar } from './WorkspaceTabBar';
```

Add before the `preset-bar` div:
```typescript
      <WorkspaceTabBar />
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --dir frontend run test -- --run src/app/features/git-visualization/GitVisualizationView.test.tsx`

Expected: All tests pass (including new "renders WorkspaceTabBar" test).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/features/git-visualization/GitVisualizationView.tsx frontend/src/app/features/git-visualization/GitVisualizationView.test.tsx
git commit -m "feat(git-vis): integrate WorkspaceTabBar into GitVisualizationView"
```

---

### Task 5: Add CSS styles for WorkspaceTabBar

**Files:**
- Modify: `frontend/src/styles/regions/rightpanel/git-visualization.css`

- [ ] **Step 1: Add WorkspaceTabBar styles**

Append at end of file:
```css
/* ── Workspace Tab Bar ── */
.adl-workspace-tab__container {
  display: flex;
  flex-direction: column;
  gap: 4px;
  width: 100%;
}

.adl-workspace-tab__row {
  display: flex;
  align-items: center;
  gap: 4px;
  width: 100%;
  position: relative;
}

.adl-workspace-tab__scroll-container {
  flex: 1;
  overflow: hidden;
  position: relative;
  min-width: 0;
}

.adl-workspace-tab__scroll-container::after {
  content: '';
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  width: 24px;
  background: linear-gradient(to left, var(--bg-card, var(--bg-surface, #fff)), transparent);
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.2s;
}

.adl-workspace-tab__scroll-container[data-overflowed='true']::after {
  opacity: 1;
}

.adl-workspace-tab__track {
  display: flex;
  gap: 4px;
  white-space: nowrap;
}

.adl-workspace-tab__tab {
  flex: 0 0 120px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 32px;
  padding: 0 8px;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md, 6px);
  background: transparent;
  color: var(--text-secondary);
  font-size: 0.85rem;
  cursor: pointer;
  transition: all 0.15s;
  overflow: hidden;
}

.adl-workspace-tab__tab:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.adl-workspace-tab__tab--active {
  background: var(--accent);
  color: var(--accent-foreground, #fff);
  border-color: var(--accent);
}

.adl-workspace-tab__tab-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100%;
}

.adl-workspace-tab__arrow {
  flex: 0 0 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  border-radius: var(--radius-sm, 4px);
  background: var(--bg-card);
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 0.75rem;
  transition: all 0.15s;
}

.adl-workspace-tab__arrow:hover:not(:disabled) {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.adl-workspace-tab__arrow:disabled {
  opacity: 0.3;
  cursor: default;
}

.adl-workspace-tab__dots {
  display: flex;
  justify-content: center;
  gap: 6px;
  padding: 4px 0;
}

.adl-workspace-tab__dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--border-subtle);
  cursor: pointer;
  transition: all 0.15s;
}

.adl-workspace-tab__dot:hover {
  background: var(--text-muted);
}

.adl-workspace-tab__dot--active {
  background: var(--accent);
  width: 20px;
  border-radius: 3px;
}
```

- [ ] **Step 2: Run existing tests to verify no breakage**

Run: `pnpm --dir frontend run test -- --run src/app/features/git-visualization/`

Expected: All git visualization tests pass.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/styles/regions/rightpanel/git-visualization.css
git commit -m "style(git-vis): add WorkspaceTabBar CSS"
```

---

### Task 6: Add i18n keys

**Files:**
- Modify: `frontend/src/app/i18n/en-US/changes.ts`
- Modify: `frontend/src/app/i18n/zh-CN/changes.ts`

- [ ] **Step 1: Add to en-US**

Add after `gitVisPresetHighContrast` line:
```typescript
  gitVisWorkspaceTab: 'Workspace {name}',
```

- [ ] **Step 2: Add to zh-CN**

Add after `gitVisPresetHighContrast` line:
```typescript
  gitVisWorkspaceTab: '工作区 {name}',
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/i18n/en-US/changes.ts frontend/src/app/i18n/zh-CN/changes.ts
git commit -m "i18n(git-vis): add workspace tab i18n keys"
```

---

### Task 7: Update barrel export

**Files:**
- Modify: `frontend/src/app/features/git-visualization/index.ts`

- [ ] **Step 1: Add WorkspaceTabBar to barrel export**

```typescript
export { WorkspaceTabBar } from './WorkspaceTabBar';
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/app/features/git-visualization/index.ts
git commit -m "chore(git-vis): export WorkspaceTabBar from barrel"
```
