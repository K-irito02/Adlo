# 中心标签宿主 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把「中心」改造为多标签宿主，让浏览器 WebView 与终端视图可在右侧面板与中心之间双向移动，dsh 统一为普通浏览器标签。

**Architecture:** 新增 `centerTabsSlice` 承载中心标签顺序与活动项；既有浏览器/终端标签增加排他的 `location` 字段；浏览器 WebView 池提升为模块级单例，配合 `useBrowserViewHost` 为面板与中心两个宿主各自驱动活动标签的 bounds/lifecycle/visibility。

**Tech Stack:** React 19 + TypeScript + Zustand（切片合并）+ Tauri 2.x / WebView2 + xterm.js；测试用 Vitest + @testing-library/react。

**Spec:** `docs/superpowers/specs/2026-10-01-center-tab-host-design.md`

## Global Constraints

- 开发分支：本地 `main`；提交信息用 Conventional Commits（`feat(center): ...`）。
- UI 文案必须走 i18n key（`frontend/src/app/i18n/zh-CN/*` 与 `en-US/*` 同步），禁止硬编码任何展示文本。
- 双端一致：功能在 Tauri 桌面与浏览器模式行为一致；实现策略可分别走原生 WebView / iframe。
- 未发布阶段：禁止数据格式兼容/旧版本迁移代码、禁止向后兼容重导出。
- 设计约束：颜色只用 CSS 变量 `var(--…)`；图标为 SVG 继承 `currentColor`；禁止 emoji。
- 破坏性操作（关闭/清空/删除）不得作用于 `location === 'center'` 的标签。
- 质量门：`cd frontend && npx eslint . && npx tsc --noEmit`；Rust 改动后 `cargo clippy --workspace --all-targets -- -D warnings`。
- 测试：先写失败测试（红），再实现（绿）；前端 `pnpm --dir frontend run test`。

---

## File Structure（新增/修改总览）

**新增（store）**
- `frontend/src/app/stores/slices/centerTabsSlice.ts` — 中心标签状态与 reducer。
- `frontend/src/app/stores/slices/centerTabsTypes.ts` — `CenterTabState` / `CenterTabKind` / 工具。
- `frontend/src/app/stores/actions/centerActions.ts` — 跨切片移动编排。

**新增（feature）**
- `frontend/src/app/features/center/index.ts`
- `frontend/src/app/features/center/CenterLauncherPage.tsx`
- `frontend/src/app/features/center/CenterBrowserView.tsx`
- `frontend/src/app/features/center/CenterTerminalView.tsx`
- `frontend/src/app/features/center/useTerminalView.ts`
- `frontend/src/app/features/browser/browserPoolSingleton.ts`（共享池）
- `frontend/src/app/features/browser/useBrowserViewHost.ts`

**新增（region）**
- `frontend/src/app/regions/CenterTabStrip.tsx`（标题栏标签条）

**修改（store）**
- `stores/slices/browserTypes.ts`、`browserTabsSlice.ts`、`browserSlice.ts`
- `stores/slices/terminalSliceTypes.ts`、`terminalSlice.ts`
- `stores/StoreState.ts`、`stores/slicedStore.ts`
- `stores/persisted/registry.ts`、`parsers.ts`、`prune.ts`
- `stores/actions/dshActions.ts`（关闭联动）

**修改（region/feature）**
- `regions/CenterPane.tsx`、`regions/TitleBar.tsx`
- `features/browser/`：`useBrowserWebView.ts`、`useWebViewBounds.ts`、`useBrowserPool.ts`、`useWebViewLifecycle.ts`、`useBrowserSuspendScheduler.ts`、`BrowserPanel.tsx`、`BrowserToolbar.tsx`、`BrowserContentArea.tsx`、`BrowserShell.tsx`、`useBrowserMenus.ts`、`BrowserContextMenu.tsx`、`BrowserOpenTabFlatListItem.tsx`、`browser-landing/BrowserLandingPage.tsx`、`browser-tree/*`
- `features/terminal/`：`TerminalTabBar.tsx`、`useTerminalContextMenu.ts`、`TerminalContextMenu.tsx`
- `features/workspace-terminal/WorkspaceTerminalEntry.tsx`
- `features/dsh/`：`DshHostRegion.tsx`、`WelcomePage.tsx`、`useDshWebViewBounds.ts`、`useDshWebViewVisibility.ts`、`CloseDshDialog.tsx`

**修改（Rust）**
- `src-tauri/src/commands/browser.rs`、`src-tauri/src/main.rs`

**修改（i18n）**
- `i18n/zh-CN/*`、`i18n/en-US/*`

---

## Milestone A — 数据模型与移动语义

### Task 1: 标签位置字段与面板过滤选择器

**Files:**
- Modify: `frontend/src/app/stores/slices/browserTypes.ts`（`BrowserTabState` 加 `location?`、`isDsh?`）
- Modify: `frontend/src/app/stores/slices/terminalSliceTypes.ts`（`TerminalTabState` 加 `location?`）
- Modify: `frontend/src/app/stores/persisted/registry.ts:149-150,214-237`（校验器放开可选 `location`）
- Test: `frontend/src/app/stores/slices/__tests__/tabLocation.test.ts`

**Interfaces:**
- Produces: `type TabLocation = 'panel' | 'center'`（在两处 types 文件中各定义并导出）；`isPanelTab(tab: { location?: TabLocation }): boolean`（`location !== 'center'`）。

- [ ] **Step 1: 写失败测试**

```ts
// frontend/src/app/stores/slices/__tests__/tabLocation.test.ts
import { describe, it, expect } from 'vitest';
import { isPanelTab } from '../tabLocation';

describe('isPanelTab', () => {
  it('缺省 location 视为面板标签', () => {
    expect(isPanelTab({})).toBe(true);
  });
  it("location='panel' 视为面板标签", () => {
    expect(isPanelTab({ location: 'panel' })).toBe(true);
  });
  it("location='center' 不视为面板标签", () => {
    expect(isPanelTab({ location: 'center' })).toBe(false);
  });
});
```

- [ ] **Step 2: 运行验证失败**

Run: `pnpm --dir frontend run test -- tabLocation`
Expected: FAIL（找不到模块 `../tabLocation`）

- [ ] **Step 3: 实现**

新建 `frontend/src/app/stores/slices/tabLocation.ts`：

```ts
export type TabLocation = 'panel' | 'center';

/** 标签是否位于右侧面板（缺省即面板）。中心标签为 `'center'`。 */
export function isPanelTab(tab: { location?: TabLocation }): boolean {
  return tab.location !== 'center';
}
```

在 `browserTypes.ts` 的 `BrowserTabState` 增加：

```ts
import type { TabLocation } from './tabLocation';
// ...
  /** 所属宿主；缺省（undefined）等同 'panel'。中心标签为 'center'。 */
  location?: TabLocation;
  /** dsh 承载标签（关闭时联动停止 dsh 进程）。 */
  isDsh?: boolean;
```

在 `terminalSliceTypes.ts` 的 `TerminalTabState` 增加：

```ts
import type { TabLocation } from './tabLocation';
// ...
  location?: TabLocation;
```

`registry.ts` 校验器增加可选字段校验（不改既有必填判定）：

```ts
export const isBrowserTab = (item: Record<string, unknown>): boolean => {
  if (typeof item.id !== 'string' || typeof item.title !== 'string' || typeof item.url !== 'string') {
    return false;
  }
  if (item.location !== undefined && item.location !== 'panel' && item.location !== 'center') {
    return false;
  }
  if (item.isDsh !== undefined && typeof item.isDsh !== 'boolean') {
    return false;
  }
  return true;
};
```

`isTerminalTabState` 末尾追加：

```ts
  if (item.location !== undefined && item.location !== 'panel' && item.location !== 'center') {
    return false;
  }
```

- [ ] **Step 4: 运行验证通过**

Run: `pnpm --dir frontend run test -- tabLocation && cd frontend && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add frontend/src/app/stores/slices/tabLocation.ts frontend/src/app/stores/slices/browserTypes.ts frontend/src/app/stores/slices/terminalSliceTypes.ts frontend/src/app/stores/persisted/registry.ts frontend/src/app/stores/slices/__tests__/tabLocation.test.ts
git commit -m "feat(center): add tab location field and panel filter"
```

---

### Task 2: centerTabsSlice

**Files:**
- Create: `frontend/src/app/stores/slices/centerTabsTypes.ts`
- Create: `frontend/src/app/stores/slices/centerTabsSlice.ts`
- Modify: `frontend/src/app/stores/StoreState.ts`（合并 `CenterTabsSlice`）
- Modify: `frontend/src/app/stores/slicedStore.ts`（挂载切片）
- Test: `frontend/src/app/stores/slices/__tests__/centerTabsSlice.test.ts`

**Interfaces:**
- Consumes: `createUiId`（`stores/shared`）、`persist`（`stores/persisted/persist`）。
- Produces: `CenterTabKind`、`CenterTabState`、`CenterTabsSlice`；字段 `centerTabs`、`centerActiveTabId`；动作 `centerAddTab`、`centerSelectTab`、`centerRemoveTab`、`centerReorderTabs`、`centerSetActiveTab`。

- [ ] **Step 1: 写失败测试**

```ts
// frontend/src/app/stores/slices/__tests__/centerTabsSlice.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { useAppStore } from '@stores/slicedStore';

const reset = () => useAppStore.setState({ centerTabs: [], centerActiveTabId: '' });

describe('centerTabsSlice', () => {
  beforeEach(reset);

  it('追加标签并激活', () => {
    const id = useAppStore.getState().centerAddTab('launcher', null);
    const s = useAppStore.getState();
    expect(s.centerTabs).toHaveLength(1);
    expect(s.centerTabs[0]).toMatchObject({ id, kind: 'launcher', refId: null });
    expect(s.centerActiveTabId).toBe(id);
  });

  it('select 切换活动标签', () => {
    const a = useAppStore.getState().centerAddTab('launcher', null);
    const b = useAppStore.getState().centerAddTab('browser', 'btab-1');
    useAppStore.getState().centerSelectTab(a);
    expect(useAppStore.getState().centerActiveTabId).toBe(a);
    useAppStore.getState().centerSelectTab(b);
    expect(useAppStore.getState().centerActiveTabId).toBe(b);
  });

  it('移除活动标签后激活最后一个', () => {
    const a = useAppStore.getState().centerAddTab('launcher', null);
    const b = useAppStore.getState().centerAddTab('browser', 'btab-1');
    useAppStore.getState().centerRemoveTab(b);
    expect(useAppStore.getState().centerActiveTabId).toBe(a);
    useAppStore.getState().centerRemoveTab(a);
    expect(useAppStore.getState().centerActiveTabId).toBe('');
  });
});
```

- [ ] **Step 2: 运行验证失败**

Run: `pnpm --dir frontend run test -- centerTabsSlice`
Expected: FAIL（`centerAddTab` 不是函数）

- [ ] **Step 3: 实现**

`centerTabsTypes.ts`：

```ts
export type CenterTabKind = 'launcher' | 'browser' | 'terminal';

export interface CenterTabState {
  id: string;
  kind: CenterTabKind;
  /** browser: browserTabs.id；terminal: terminalTabs.id 或 null（选择器）；launcher: null */
  refId: string | null;
  createdAt: number;
}
```

`centerTabsSlice.ts`：

```ts
import type { StoreState } from '../StoreState';
import { createUiId } from '../shared';
import { persist } from '../persisted/persist';
import type { CenterTabKind, CenterTabState } from './centerTabsTypes';

export type { CenterTabKind, CenterTabState } from './centerTabsTypes';

export interface CenterTabsSlice {
  centerTabs: CenterTabState[];
  centerActiveTabId: string;

  centerAddTab: (kind: CenterTabKind, refId: string | null) => string;
  centerSelectTab: (centerTabId: string) => void;
  centerRemoveTab: (centerTabId: string) => void;
  centerReorderTabs: (newOrder: CenterTabState[]) => void;
}

export const createCenterTabsSlice = (
  set: (partial: Partial<StoreState> | ((state: StoreState) => Partial<StoreState>)) => void,
): CenterTabsSlice => ({
  centerTabs: [],
  centerActiveTabId: '',

  centerAddTab: (kind, refId) => {
    const id = createUiId('center');
    set((state) => {
      const tab: CenterTabState = { id, kind, refId, createdAt: Date.now() };
      const next = [...state.centerTabs, tab];
      persist('adl:center.tabs', next);
      persist('adl:center.activeTabId', id);
      return { centerTabs: next, centerActiveTabId: id };
    });
    return id;
  },

  centerSelectTab: (centerTabId) => {
    persist('adl:center.activeTabId', centerTabId);
    set({ centerActiveTabId: centerTabId });
  },

  centerRemoveTab: (centerTabId) => {
    set((state) => {
      const next = state.centerTabs.filter((t) => t.id !== centerTabId);
      const activeStillExists = next.some((t) => t.id === state.centerActiveTabId);
      const nextActive = activeStillExists
        ? state.centerActiveTabId
        : (next[next.length - 1]?.id ?? '');
      persist('adl:center.tabs', next);
      persist('adl:center.activeTabId', nextActive);
      return { centerTabs: next, centerActiveTabId: nextActive };
    });
  },

  centerReorderTabs: (newOrder) => {
    persist('adl:center.tabs', newOrder);
    set({ centerTabs: newOrder });
  },
});
```

在 `StoreState.ts` 定义 `export interface StoreState extends ... CenterTabsSlice`；在 `slicedStore.ts` 的 `create` 合并里加入 `...createCenterTabsSlice(set)`。

- [ ] **Step 4: 运行验证通过**

Run: `pnpm --dir frontend run test -- centerTabsSlice && cd frontend && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add frontend/src/app/stores/slices/centerTabsTypes.ts frontend/src/app/stores/slices/centerTabsSlice.ts frontend/src/app/stores/StoreState.ts frontend/src/app/stores/slicedStore.ts frontend/src/app/stores/slices/__tests__/centerTabsSlice.test.ts
git commit -m "feat(center): add center tabs slice"
```

---

### Task 3: 移动编排 action 与活动标签重夹

**Files:**
- Create: `frontend/src/app/stores/actions/centerActions.ts`
- Modify: `frontend/src/app/stores/StoreState.ts`（声明动作签名）
- Test: `frontend/src/app/stores/actions/__tests__/centerActions.test.ts`

**Interfaces:**
- Consumes: Task 2 的 `centerAddTab` / `centerRemoveTab` / `centerSelectTab`；`browserUpdateTab` / `browserSetLocation`；`terminalUpdateTab` / `terminalSetLocation`。
- Produces: `centerShowBrowserTab(browserTabId)`、`centerShowTerminalTab(terminalTabId)`、`centerReturnToPanel(centerTabId)`、`clampPanelActiveTab()`。

- [ ] **Step 1: 写失败测试**

```ts
// frontend/src/app/stores/actions/__tests__/centerActions.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { useAppStore } from '@stores/slicedStore';

describe('centerActions', () => {
  beforeEach(() => {
    useAppStore.setState({ centerTabs: [], centerActiveTabId: '', browserTabs: [], browserActiveTabId: '' });
  });

  it('centerShowBrowserTab 移动标签到中心并重夹面板活动标签', () => {
    useAppStore.getState().browserOpenTab('https://a.test', 'A');
    useAppStore.getState().browserOpenTab('https://b.test', 'B');
    const first = useAppStore.getState().browserTabs[0].id;
    useAppStore.getState().browserSelectTab(first);
    useAppStore.getState().centerShowBrowserTab(first);

    const s = useAppStore.getState();
    expect(s.browserTabsById[first].location).toBe('center');
    expect(s.centerTabs.some((t) => t.kind === 'browser' && t.refId === first)).toBe(true);
    expect(s.browserActiveTabId).not.toBe(first);
  });

  it('centerReturnToPanel 把标签移回面板', () => {
    useAppStore.getState().browserOpenTab('https://a.test', 'A');
    const id = useAppStore.getState().browserTabs[0].id;
    useAppStore.getState().centerShowBrowserTab(id);
    const centerTab = useAppStore.getState().centerTabs.find((t) => t.refId === id)!;
    useAppStore.getState().centerReturnToPanel(centerTab.id);

    const s = useAppStore.getState();
    expect(s.browserTabsById[id].location).toBe('panel');
    expect(s.centerTabs).toHaveLength(0);
    expect(s.browserActiveTabId).toBe(id);
  });
});
```

- [ ] **Step 2: 运行验证失败**

Run: `pnpm --dir frontend run test -- centerActions`
Expected: FAIL（`centerShowBrowserTab` 不是函数）

- [ ] **Step 3: 实现**

先在 `browserTabsSlice` 与 `terminalSlice` 增加薄 setter（只写字段 + 持久化），签名：

```ts
browserSetLocation: (tabId: string, location: 'panel' | 'center') => void;
terminalSetLocation: (tabId: string, location: 'panel' | 'center') => void;
```

`centerActions.ts`：

```ts
import type { StoreApi } from 'zustand';
import type { StoreState } from '../StoreState';
import type { TabLocation } from '../slices/tabLocation';

export function createCenterActions(set: StoreApi<StoreState>['setState'], get: () => StoreState) {
  const clampPanelActiveTab = () => {
    const s = get();
    const panelBrowserTabs = s.browserTabs.filter((t) => t.location !== 'center');
    if (!panelBrowserTabs.some((t) => t.id === s.browserActiveTabId)) {
      set({ browserActiveTabId: panelBrowserTabs[panelBrowserTabs.length - 1]?.id ?? '' });
    }
    const panelTerminalTabs = s.terminalTabs.filter((t) => t.location !== 'center');
    if (!panelTerminalTabs.some((t) => t.id === s.terminalActiveTabId)) {
      set({ terminalActiveTabId: panelTerminalTabs[panelTerminalTabs.length - 1]?.id ?? '' });
    }
  };

  return {
    clampPanelActiveTab,

    centerShowBrowserTab: (browserTabId: string) => {
      get().browserSetLocation(browserTabId, 'center');
      get().centerAddTab('browser', browserTabId);
      clampPanelActiveTab();
    },

    centerShowTerminalTab: (terminalTabId: string) => {
      get().terminalSetLocation(terminalTabId, 'center');
      get().centerAddTab('terminal', terminalTabId);
      clampPanelActiveTab();
    },

    centerReturnToPanel: (centerTabId: string) => {
      const tab = get().centerTabs.find((t) => t.id === centerTabId);
      if (!tab) {
        return;
      }
      if (tab.kind === 'browser' && tab.refId) {
        get().browserSetLocation(tab.refId, 'panel');
        get().browserSelectTab(tab.refId);
      } else if (tab.kind === 'terminal' && tab.refId) {
        get().terminalSetLocation(tab.refId, 'panel');
        get().terminalSelectTab(tab.refId);
      }
      get().centerRemoveTab(centerTabId);
    },
  };
}
```

`browserSetLocation` / `terminalSetLocation` 需使用 `persist` 写回并在 set 中更新 `browserTabsById` / `terminalTabsById`（照抄该切片既有 setter 的排序+持久化模式）。

在 `slicedStore.ts` 合并 `...createCenterActions(set, get)`；`StoreState.ts` 声明三个动作与 `clampPanelActiveTab`、`TabLocation` 相关字段。

- [ ] **Step 4: 运行验证通过**

Run: `pnpm --dir frontend run test -- centerActions && cd frontend && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add frontend/src/app/stores/actions/centerActions.ts frontend/src/app/stores/StoreState.ts frontend/src/app/stores/slicedStore.ts frontend/src/app/stores/slices/browserTabsSlice.ts frontend/src/app/stores/slices/terminalSlice.ts frontend/src/app/stores/actions/__tests__/centerActions.test.ts
git commit -m "feat(center): add move-to-center orchestration"
```

---

### Task 4: 破坏性操作跳过中心标签 + dsh 关闭联动停进程

**Files:**
- Modify: `frontend/src/app/stores/slices/browserTabsSlice.ts`（`browserCloseTab` / `browserCloseAllTabs` 跳过 `center`；关闭 `isDsh` 标签时触发停进程）
- Modify: `frontend/src/app/stores/slices/terminalSlice.ts`（`terminalCloseTab` / `terminalCloseAllTabs` 跳过 `center`）
- Modify: `frontend/src/app/features/browser/useBrowserTabs.ts`（`handleCloseTab` / `handleCloseAllTabs` 过滤）
- Modify: `frontend/src/app/features/browser/browserTreeUtils.ts` 或树关闭回调（关闭全部子标签时过滤）
- Test: `frontend/src/app/stores/slices/__tests__/closeSkipsCenter.test.ts`

**Interfaces:**
- Consumes: Task 1 的 `location`；`dsh.close(false)`（见 Task 15，本任务先以 `useAppStore.getState().closeDsh(false)` 调用）。

- [ ] **Step 1: 写失败测试**

```ts
// frontend/src/app/stores/slices/__tests__/closeSkipsCenter.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { useAppStore } from '@stores/slicedStore';

describe('破坏性操作跳过中心标签', () => {
  beforeEach(() => useAppStore.setState({ browserTabs: [], browserActiveTabId: '', centerTabs: [], centerActiveTabId: '' }));

  it('browserCloseAllTabs 不关闭中心标签', () => {
    useAppStore.getState().browserOpenTab('https://a.test', 'A');
    useAppStore.getState().browserOpenTab('https://b.test', 'B');
    const [a, b] = useAppStore.getState().browserTabs.map((t) => t.id);
    useAppStore.getState().browserSetLocation(a, 'center');
    useAppStore.getState().browserCloseAllTabs();
    const s = useAppStore.getState();
    expect(s.browserTabs.some((t) => t.id === a)).toBe(true);
    expect(s.browserTabs.some((t) => t.id === b)).toBe(false);
  });
});
```

- [ ] **Step 2: 运行验证失败**

Run: `pnpm --dir frontend run test -- closeSkipsCenter`
Expected: FAIL（中心标签被一并关闭）

- [ ] **Step 3: 实现**

`browserTabsSlice.ts`：
- `browserCloseTab(tabId)` 若目标是 `location==='center'` 则直接返回（防御；正常入口经由 `centerRemoveTab`）。
- `browserCloseAllTabs(workspaceId?)` 过滤改为 `t.location !== 'center' && (workspaceId ? t.workspaceId === workspaceId : true)` 的补集删除。

```ts
browserCloseAllTabs: (workspaceId) => {
  set((state) => {
    const kept = state.browserTabs.filter((tab) => {
      if (tab.location === 'center') return true; // 中心标签不受面板清空影响
      if (workspaceId) return tab.workspaceId !== workspaceId;
      return false; // 全局清空：移除所有面板标签
    });
    const nextActive = kept.some((t) => t.id === state.browserActiveTabId)
      ? state.browserActiveTabId
      : (kept[kept.length - 1]?.id ?? '');
    persist('adl:browser.tabs', kept);
    persist('adl:browser.activeTabId', nextActive);
    return { browserTabs: kept, browserTabsById: buildTabsById(kept), browserActiveTabId: nextActive };
  });
  applyTabPrune();
},
```

`terminalSlice.ts` 同理改 `terminalCloseAllTabs`（`location==='center'` 保留）；`terminalCloseTab` 对 center 目标直接返回。

`useBrowserTabs.ts` 的 `handleCloseTab`：若 `tab.isDsh`，先 `void useAppStore.getState().closeDsh(false)`（彻底退出）。`handleCloseAllTabs`：只对面板标签调用 `removeSiteMetaIfUnreferenced`，并对其中的 `isDsh` 标签联动停进程。

树「删除该目录下全部标签 / 移除工作区」回调：候选集合先 `filter(t => t.location !== 'center')`。

- [ ] **Step 4: 运行验证通过**

Run: `pnpm --dir frontend run test -- closeSkipsCenter && cd frontend && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add frontend/src/app/stores/slices/browserTabsSlice.ts frontend/src/app/stores/slices/terminalSlice.ts frontend/src/app/features/browser/useBrowserTabs.ts frontend/src/app/stores/slices/__tests__/closeSkipsCenter.test.ts
git commit -m "fix(center): panel destructive ops skip center-located tabs"
```

---

### Task 5: 中心标签持久化与水合剪枝

**Files:**
- Modify: `frontend/src/app/stores/persisted/registry.ts`（新增 `adl:center.tabs` / `adl:center.activeTabId`）
- Modify: `frontend/src/app/stores/persisted/prune.ts`（`pruneCenterTabs`）
- Modify: `frontend/src/app/stores/persisted/pruneWiring.ts`（`applyTabPrune` 串接）
- Test: `frontend/src/app/stores/persisted/__tests__/centerPersist.test.ts`

**Interfaces:**
- Consumes: `defineEntry`、`readObjectArray`、`readString`、`PruneCtx.tabIds`。
- Produces: 持久键 `adl:center.tabs`（字段 `centerTabs`）、`adl:center.activeTabId`（字段 `centerActiveTabId`）；`pruneCenterTabs(value, ctx)`。

- [ ] **Step 1: 写失败测试**

```ts
// frontend/src/app/stores/persisted/__tests__/centerPersist.test.ts
import { describe, it, expect } from 'vitest';
import { pruneCenterTabs } from '../prune';

describe('pruneCenterTabs', () => {
  const ctx = { workspaceIds: new Set<string>(), loadedDirPaths: new Map(), tabIds: new Set(['t1']) };
  it('保留 refId 存在或为 null 的标签', () => {
    const value = [
      { id: 'c1', kind: 'launcher', refId: null, createdAt: 1 },
      { id: 'c2', kind: 'browser', refId: 't1', createdAt: 2 },
    ] as const;
    const r = pruneCenterTabs([...value], ctx);
    expect(r.value).toHaveLength(2);
    expect(r.changed).toBe(false);
  });
  it('剪掉 refId 悬空标签', () => {
    const r = pruneCenterTabs([{ id: 'c2', kind: 'browser', refId: 'gone', createdAt: 2 }], ctx);
    expect(r.value).toHaveLength(0);
    expect(r.changed).toBe(true);
  });
});
```

- [ ] **Step 2: 运行验证失败**

Run: `pnpm --dir frontend run test -- centerPersist`
Expected: FAIL（`pruneCenterTabs` 未导出）

- [ ] **Step 3: 实现**

`prune.ts` 增加：

```ts
export function pruneCenterTabs(
  value: CenterTabState[],
  ctx: PruneCtx,
): { value: CenterTabState[]; changed: boolean } {
  const next = value.filter((tab) => tab.refId === null || ctx.tabIds.has(tab.refId));
  return { value: next, changed: next.length !== value.length };
}
```

`registry.ts` 增加：

```ts
'adl:center.tabs': defineEntry<CenterTabState[]>({
  key: 'adl:center.tabs',
  field: 'centerTabs',
  fallback: [],
  scope: 'global',
  read: readObjectArray<CenterTabState>(isCenterTab),
  prune: pruneCenterTabs,
}),
'adl:center.activeTabId': defineEntry<string>({
  key: 'adl:center.activeTabId',
  field: 'centerActiveTabId',
  fallback: '',
  scope: 'global',
  read: readString,
}),
```

其中 `isCenterTab` 校验 `kind` 属于三者之一、`refId` 为 string 或 null、`createdAt` 为 number。

`prune.ts` 的 `PruneCtx.tabIds` 需包含两类标签 id（检查 `pruneWiring.ts` 现有构造，把 `browserTabs` 与 `terminalTabs` 的 id 一并并入 `tabIds`）。

水合后自动 launcher：在 `pruneWiring.ts` 的 `applyTabPrune()` 末尾，若 `centerTabs` 为空则调用 `centerAddTab('launcher', null)`。

- [ ] **Step 4: 运行验证通过**

Run: `pnpm --dir frontend run test -- centerPersist && cd frontend && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add frontend/src/app/stores/persisted/registry.ts frontend/src/app/stores/persisted/prune.ts frontend/src/app/stores/persisted/pruneWiring.ts frontend/src/app/stores/persisted/__tests__/centerPersist.test.ts
git commit -m "feat(center): persist center tabs and prune dangling refs"
```

---

## Milestone B — 双宿主 WebView 管理器

### Task 6: 共享 WebView 池单例

**Files:**
- Create: `frontend/src/app/features/browser/browserPoolSingleton.ts`
- Modify: `frontend/src/app/features/browser/useBrowserPool.ts`（改为委托单例，保持返回签名不变）
- Test: `frontend/src/app/features/browser/browserPoolSingleton.test.ts`

**Interfaces:**
- Produces: `browserPool`（`isTabInPool` / `createForTab` / `activateTab` / `navigateTab` / `destroyTab` / `subscribe` / `getVersion`），供两个宿主共享。

- [ ] **Step 1: 写失败测试**

```ts
// frontend/src/app/features/browser/browserPoolSingleton.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { browserPool } from './browserPoolSingleton';

describe('browserPool (singleton)', () => {
  beforeEach(() => browserPool.reset());

  it('共享成员：创建后两个读取者都能看到', async () => {
    vi.stubGlobal('window', { digitalLife: { isTauri: false, browser: undefined } });
    await browserPool.createForTab('t1', 'https://a.test');
    expect(browserPool.isTabInPool('t1')).toBe(true);
  });
});
```

- [ ] **Step 2: 运行验证失败**

Run: `pnpm --dir frontend run test -- browserPoolSingleton`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现**

把 `useBrowserPool` 内部的 `poolSetRef` / `insertionOrderRef` / `creatingRef` / 版本号提升为模块级变量，导出命令式 API；`useBrowserPool` 改为 `useSyncExternalStore(browserPool.subscribe, browserPool.getVersion)` 包裹并返回同样的键。Rust 路径保持：`createForTab` 调 `window.digitalLife?.browser?.createForTab`，成功后 `useAppStore.getState().bumpSiblingWebviewNonce()`。

- [ ] **Step 4: 运行验证通过**

Run: `pnpm --dir frontend run test -- browserPool useBrowserPool && cd frontend && npx tsc --noEmit`
Expected: PASS（既有 `useBrowserPool.test.ts` 亦须通过）

- [ ] **Step 5: 提交**

```bash
git add frontend/src/app/features/browser/browserPoolSingleton.ts frontend/src/app/features/browser/useBrowserPool.ts frontend/src/app/features/browser/browserPoolSingleton.test.ts
git commit -m "refactor(browser): lift webview pool to shared singleton"
```

---

### Task 7: per-host 驱动 `useBrowserViewHost`

**Files:**
- Create: `frontend/src/app/features/browser/useBrowserViewHost.ts`
- Modify: `frontend/src/app/features/browser/useWebViewBounds.ts`（容器/内容元素参数化）
- Modify: `frontend/src/app/features/browser/useWebViewLifecycle.ts`（支持 unmount 隐藏）
- Modify: `frontend/src/app/features/browser/useBrowserWebView.ts`（面板宿主改用 `useBrowserViewHost`）
- Test: `frontend/src/app/features/browser/useBrowserViewHost.test.ts`

**Interfaces:**
- Consumes: Task 6 的 `browserPool`。
- Produces: `useBrowserViewHost({ hostId: 'panel' | 'center', activeTab, isVisible, overlayActive })` 返回 `{ containerRef, updateBounds }`；`hostId` 用于区分两宿主的 ref 与隐藏逻辑。

- [ ] **Step 1: 写失败测试**

```ts
// frontend/src/app/features/browser/useBrowserViewHost.test.ts
import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

vi.mock('@shared/env', () => ({ isTauriShell: () => false }));

describe('useBrowserViewHost', () => {
  it('非 Tauri 下返回稳定 containerRef', async () => {
    const { useBrowserViewHost } = await import('./useBrowserViewHost');
    const { result } = renderHook(() =>
      useBrowserViewHost({ hostId: 'center', activeTab: undefined, isVisible: true, overlayActive: false }),
    );
    expect(result.current.containerRef).toBeDefined();
  });
});
```

- [ ] **Step 2: 运行验证失败**

Run: `pnpm --dir frontend run test -- useBrowserViewHost`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现**

`useWebViewBounds` 增加可选 `hostId`，并保留容器自身 ref；`useWebViewLifecycle` 增加 `hostId`，`prevActiveTabIdRef` 由 hook 实例持有（天然 per-host），并在 effect cleanup 中把当前活动 tab 的 bounds 移到 `HIDDEN_WEBVIEW_OFFSCREEN_COORD`。`useBrowserViewHost` 组合三者并接收共享 `browserPool`。

- [ ] **Step 4: 运行验证通过**

Run: `pnpm --dir frontend npm -- run test -- useBrowserViewHost useBrowserWebView && cd frontend && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add frontend/src/app/features/browser/useBrowserViewHost.ts frontend/src/app/features/browser/useWebViewBounds.ts frontend/src/app/features/browser/useWebViewLifecycle.ts frontend/src/app/features/browser/useBrowserWebView.ts frontend/src/app/features/browser/useBrowserViewHost.test.ts
git commit -m "refactor(browser): add per-host webview view driver"
```

---

### Task 8: overlay 共享信号 + 参数化浏览器视图组件

**Files:**
- Modify: `frontend/src/app/features/browser/useBrowserSuspendScheduler.ts`（保护两宿主活动标签 + dsh 标签）
- Modify: `frontend/src/app/features/browser/BrowserToolbar.tsx`、`BrowserContentArea.tsx`、`BrowserShell.tsx`（参数化，供中心复用）
- Test: `frontend/src/app/features/browser/__tests__/suspendProtectsCenter.test.ts`

**Interfaces:**
- Consumes: `browserActiveTabId`、`centerActiveTabId`、`centerTabs`。
- Produces: 参数化 `BrowserShell`（props 增加 `hostId` 与可选 `hidePanelOnlyControls`）。

- [ ] **Step 1: 写失败测试**

```ts
// frontend/src/app/features/browser/__tests__/suspendProtectsCenter.test.ts
import { describe, it, expect } from 'vitest';
import { computeSuspendedTabIds } from '../useBrowserSuspendScheduler';

describe('computeSuspendedTabIds', () => {
  it('不挂起中心活动标签与 dsh 标签', () => {
    const ids = computeSuspendedTabIds({
      allTabIds: ['a', 'b', 'c'],
      panelActiveId: 'a',
      centerActiveId: 'b',
      dshTabId: 'c',
      maxLive: 1,
    });
    expect(ids).toHaveLength(0);
  });
});
```

- [ ] **Step 2: 运行验证失败**

Run: `pnpm --dir frontend run test -- suspendProtectsCenter`
Expected: FAIL（`computeSuspendedTabIds` 未导出）

- [ ] **Step 3: 实现**

把挂起决策从 hook 内联逻辑抽为纯函数 `computeSuspendedTabIds(input)`，从候选集中排除 `panelActiveId` / `centerActiveId` / `dshTabId`；`BrowserShell` 增加 `hostId` 与 `hidePanelOnlyControls`（中心宿主隐藏导航树/关闭全部），`BrowserToolbar` / `BrowserContentArea` 接受 `activeTab` 与 `hostId` 由父级注入。

- [ ] **Step 4: 运行验证通过**

Run: `pnpm --dir frontend run test -- suspendProtectsCenter BrowserShell BrowserToolbar && cd frontend && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add frontend/src/app/features/browser/useBrowserSuspendScheduler.ts frontend/src/app/features/browser/BrowserToolbar.tsx frontend/src/app/features/browser/BrowserContentArea.tsx frontend/src/app/features/browser/BrowserShell.tsx frontend/src/app/features/browser/__tests__/suspendProtectsCenter.test.ts
git commit -m "refactor(browser): parameterize browser views and protect center webviews"
```

---

## Milestone C — 中心视图

### Task 9: CenterPane 调度器 + CenterLauncherPage

**Files:**
- Modify: `frontend/src/app/regions/CenterPane.tsx`
- Create: `frontend/src/app/features/center/CenterLauncherPage.tsx`
- Create: `frontend/src/app/features/center/index.ts`
- Modify: `frontend/src/app/features/dsh/WelcomePage.tsx`（拆出版本管理卡片供 launcher 复用）
- Test: `frontend/src/app/features/center/__tests__/CenterLauncherPage.test.tsx`

**Interfaces:**
- Consumes: `centerTabs` / `centerActiveTabId` / `centerAddTab`；`openDsh`；`useAppStore.setState` 就地转换。
- Produces: `CenterLauncherPage` 渲染三个入口按钮；「打开 dsh」按钮 aria-label = `t.centerLauncherOpenDsh`。

- [ ] **Step 1: 写失败测试**

```tsx
// frontend/src/app/features/center/__tests__/CenterLauncherPage.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CenterLauncherPage } from '../CenterLauncherPage';

describe('CenterLauncherPage', () => {
  it('渲染三个入口', () => {
    render(<CenterLauncherPage centerTabId="c1" />);
    expect(screen.getByRole('button', { name: /dsh/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /浏览器/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /终端/ })).toBeTruthy();
  });
});
```

- [ ] **Step 2: 运行验证失败**

Run: `pnpm --dir frontend run test -- CenterLauncherPage`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现**

`CenterPane.tsx`：

```tsx
const CenterPane = React.memo(function CenterPane() {
  const { t } = useTCopy();
  const centerTabs = useAppStore((s) => s.centerTabs);
  const activeId = useAppStore((s) => s.centerActiveTabId);
  const active = centerTabs.find((tab) => tab.id === activeId) ?? centerTabs[0];
  return (
    <section className="adl-center" aria-label={t.centerTitle}>
      {!active ? null : active.kind === 'launcher' ? (
        <CenterLauncherPage centerTabId={active.id} />
      ) : active.kind === 'browser' ? (
        <CenterBrowserView centerTabId={active.id} browserTabId={active.refId ?? ''} />
      ) : (
        <CenterTerminalView centerTabId={active.id} terminalTabId={active.refId} />
      )}
    </section>
  );
});
```

`CenterLauncherPage` 三入口：分别 `openDsh()` 后 `centerAddTab`/就地替换为 browser 标签、`browserOpenTab()`（location center）、`centerAddTab('terminal', null)`；并在下方渲染从 `WelcomePage` 拆出的 dsh 版本管理卡片。

- [ ] **Step 4: 运行验证通过**

Run: `pnpm --dir frontend run test -- CenterLauncherPage CenterPane && cd frontend && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add frontend/src/app/regions/CenterPane.tsx frontend/src/app/features/center/CenterLauncherPage.tsx frontend/src/app/features/center/index.ts frontend/src/app/features/dsh/WelcomePage.tsx frontend/src/app/features/center/__tests__/CenterLauncherPage.test.tsx
git commit -m "feat(center): add center pane dispatcher and launcher page"
```

---

### Task 10: CenterBrowserView

**Files:**
- Create: `frontend/src/app/features/center/CenterBrowserView.tsx`
- Test: `frontend/src/app/features/center/__tests__/CenterBrowserView.test.tsx`

**Interfaces:**
- Consumes: Task 7 `useBrowserViewHost({ hostId: 'center', … })`；参数化 `BrowserToolbar` / `BrowserContentArea`（Task 8）。
- Produces: `CenterBrowserView({ centerTabId, browserTabId })`。

- [ ] **Step 1: 写失败测试**

```tsx
// frontend/src/app/features/center/__tests__/CenterBrowserView.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CenterBrowserView } from '../CenterBrowserView';

describe('CenterBrowserView', () => {
  it('渲染地址栏', () => {
    render(<CenterBrowserView centerTabId="c1" browserTabId="" />);
    expect(screen.getByRole('textbox')).toBeTruthy();
  });
});
```

- [ ] **Step 2: 运行验证失败**

Run: `pnpm --dir frontend run test -- CenterBrowserView`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现**

`CenterBrowserView` 订阅 `browserTabsById[browserTabId]`，渲染参数化 `BrowserToolbar`（前进/后退/刷新/地址栏/复制链接/收藏/搜索引擎/下载/更多操作）+ `BrowserContentArea`（空 URL → `BrowserLandingPage`；否则 iframe/原生宿主）。`useBrowserViewHost` 的 `containerRef` 绑到内容区。落地页 `onOpenUrl` 改为新建中心浏览器标签（`centerShowBrowserTab` 前先 `browserOpenTab(url, title, undefined, undefined)` 再 move）。

- [ ] **Step 4: 运行验证通过**

Run: `pnpm --dir frontend npm -- run test -- CenterBrowserView && cd frontend && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add frontend/src/app/features/center/CenterBrowserView.tsx frontend/src/app/features/center/__tests__/CenterBrowserView.test.tsx
git commit -m "feat(center): add center browser view"
```

---

### Task 11: useTerminalView 抽取 + CenterTerminalView + 终端选择器

**Files:**
- Create: `frontend/src/app/features/center/useTerminalView.ts`
- Create: `frontend/src/app/features/center/CenterTerminalView.tsx`
- Test: `frontend/src/app/features/center/__tests__/CenterTerminalView.test.tsx`

**Interfaces:**
- Consumes: `useTerminalPtyLifecycle`、`TerminalHistoryList`、`XtermTerminal`、`TerminalRegionActions`、`terminalViewPrefs`、`terminalRegionCollapse`。
- Produces: `useTerminalView(tab: TerminalTabState | undefined)` 返回 `{ xtermRef, historySegments, viewPrefs, handlers… }`；`CenterTerminalView({ centerTabId, terminalTabId })`。

- [ ] **Step 1: 写失败测试**

```tsx
// frontend/src/app/features/center/__tests__/CenterTerminalView.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CenterTerminalView } from '../CenterTerminalView';

describe('CenterTerminalView', () => {
  it('refId=null 时渲染终端选择器', () => {
    render(<CenterTerminalView centerTabId="c1" terminalTabId={null} />);
    expect(screen.getByRole('button', { name: /终端/i })).toBeTruthy();
  });
});
```

- [ ] **Step 2: 运行验证失败**

Run: `pnpm --dir frontend npm -- run test -- CenterTerminalView`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现**

`useTerminalView` 从 `useTerminalPanel` 抽出与导航/全局关闭无关的部分（xterm ref、history、view prefs、region collapse、data/resize、单双列/区域交换/菜单动作）。`CenterTerminalView`：`terminalTabId === null` 时渲染选择器（profile 列表 + 工作区子菜单，默认工作区 `''` 即 `__independent__`），选定后 `terminalCreateTab(profile, workspaceId)` 并对新标签 `terminalSetLocation(newId, 'center')` 且回填中心标签 `refId`；否则渲染工具栏（单双列/区域交换/菜单）+ 内容区。

- [ ] **Step 4: 运行验证通过**

Run: `pnpm --dir frontend npm -- run test -- CenterTerminalView useTerminalView && cd frontend && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add frontend/src/app/features/center/useTerminalView.ts frontend/src/app/features/center/CenterTerminalView.tsx frontend/src/app/features/center/__tests__/CenterTerminalView.test.tsx
git commit -m "feat(center): add center terminal view and terminal view hook"
```

---

## Milestone D — 标题栏与入口

### Task 12: 标题栏中心标签条 + 新建标签按钮

**Files:**
- Create: `frontend/src/app/regions/CenterTabStrip.tsx`
- Modify: `frontend/src/app/regions/TitleBar.tsx`
- Test: `frontend/src/app/regions/CenterTabStrip.test.tsx`

**Interfaces:**
- Consumes: `centerTabs` / `centerActiveTabId` / `centerSelectTab` / `centerRemoveTab` / `centerReturnToPanel` / `centerAddTab`；`browserCloseTab`、终端完整关闭、dsh 停进程。
- Produces: `CenterTabStrip`；标题栏 `+` 按钮 aria-label = `t.centerNewTab`。

- [ ] **Step 1: 写失败测试**

```tsx
// frontend/src/app/regions/CenterTabStrip.test.tsx
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CenterTabStrip } from './CenterTabStrip';
import { useAppStore } from '@stores/slicedStore';

describe('CenterTabStrip', () => {
  beforeEach(() => useAppStore.setState({ centerTabs: [], centerActiveTabId: '' }));

  it('渲染标签并支持切换', () => {
    const a = useAppStore.getState().centerAddTab('launcher', null);
    const b = useAppStore.getState().centerAddTab('launcher', null);
    render(<CenterTabStrip />);
    fireEvent.click(screen.getAllByRole('tab')[0]);
    expect(useAppStore.getState().centerActiveTabId).toBe(a);
    fireEvent.click(screen.getAllByRole('tab')[1]);
    expect(useAppStore.getState().centerActiveTabId).toBe(b);
  });
});
```

- [ ] **Step 2: 运行验证失败**

Run: `pnpm --dir frontend npm -- run test -- CenterTabStrip`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现**

`CenterTabStrip` 渲染 `centerTabs`（`role="tab"`），标签点击 `centerSelectTab`；悬停显示「关闭」（launcher → `centerRemoveTab`；browser → `browserCloseTab` 后 `centerRemoveTab`，`isDsh` 时联动停进程；terminal → 完整关闭后 `centerRemoveTab`）与「在浏览器/终端面板显示」（`centerReturnToPanel`）。容器保留 `data-tauri-drag-region`，标签按钮不设该属性；溢出区 `overflow: hidden`，`onWheel` 把 `deltaY` 累加到 `scrollLeft`。`+` 固定在右侧，点击 `centerAddTab('launcher', null)`。标题栏把 `CenterTabStrip` 插入中部，并保留两侧空白可拖拽。

- [ ] **Step 4: 运行验证通过**

Run: `pnpm --dir frontend npm -- run test -- CenterTabStrip TitleBar && cd frontend && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add frontend/src/app/regions/CenterTabStrip.tsx frontend/src/app/regions/TitleBar.tsx frontend/src/app/regions/CenterTabStrip.test.tsx
git commit -m "feat(center): add title bar center tab strip"
```

---

### Task 13: 浏览器面板「在中心显示」入口

**Files:**
- Modify: `frontend/src/app/features/browser-tree/BrowserTreeEntryMenu.tsx`（entry 菜单 + tab 右键菜单各加一项）
- Modify: `frontend/src/app/features/browser/BrowserOpenTabFlatListItem.tsx`（新增右键菜单）
- Modify: `frontend/src/app/features/browser/browser-landing/BrowserLandingPage.tsx`（快捷站点/端口右键加一项）
- Modify: `frontend/src/app/features/browser/useBrowserMenus.ts` 或新增 `useOpenInCenterAction.ts`
- Test: `frontend/src/app/features/browser/__tests__/openInCenter.test.tsx`

**Interfaces:**
- Consumes: `centerShowBrowserTab`、`browserOpenTab`。
- Produces: `useOpenInCenterAction()` 返回 `{ openUrlInCenter(url, title?, workspaceId?), moveTabToCenter(tabId) }`。

- [ ] **Step 1: 写失败测试**

```tsx
// frontend/src/app/features/browser/__tests__/openInCenter.test.tsx
import { describe, it, expect, beforeEach } from 'vitest';
import { useAppStore } from '@stores/slicedStore';

describe('openUrlInCenter', () => {
  beforeEach(() => useAppStore.setState({ browserTabs: [], browserActiveTabId: '', centerTabs: [], centerActiveTabId: '' }));
  it('以该 URL 新建中心浏览器标签', () => {
    const { openUrlInCenter } = require('../useOpenInCenterAction');
    openUrlInCenter('https://x.test', 'X');
    const s = useAppStore.getState();
    expect(s.centerTabs.some((t) => t.kind === 'browser')).toBe(true);
  });
});
```

- [ ] **Step 2: 运行验证失败**

Run: `pnpm --dir frontend npm -- run test -- openInCenter`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现**

`useOpenInCenterAction`：
- `openUrlInCenter(url, title?, workspaceId?)` = `browserOpenTab(url, title, workspaceId)` 后取新标签 id 并 `centerShowBrowserTab(id)`。
- `moveTabToCenter(tabId)` = `centerShowBrowserTab(tabId)`。

在 `BrowserTreeEntryMenu` 的 `entryMenuItems` 与 `tabContextMenu`（书签/历史）插入「在中心显示」（新 `t.centerTabShowInCenter`）；`BrowserOpenTabFlatListItem` 加 `onContextMenu` 打开含该动作的菜单；`BrowserLandingPage` 的 `shortcutContextMenuItems` / `portContextMenuItems` 各插一项。

- [ ] **Step 4: 运行验证通过**

Run: `pnpm --dir frontend npm -- run test -- openInCenter BrowserTreeEntryMenu BrowserLandingPage && cd frontend && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add frontend/src/app/features/browser/useOpenInCenterAction.ts frontend/src/app/features/browser-tree/BrowserTreeEntryMenu.tsx frontend/src/app/features/browser/BrowserOpenTabFlatListItem.tsx frontend/src/app/features/browser/browser-landing/BrowserLandingPage.tsx frontend/src/app/features/browser/__tests__/openInCenter.test.tsx
git commit -m "feat(browser): add open-in-center entry points"
```

---

### Task 14: 终端面板「在中心显示」入口

**Files:**
- Modify: `frontend/src/app/features/workspace-terminal/WorkspaceTerminalEntry.tsx`（接上 `onContextMenu`）
- Modify: `frontend/src/app/features/terminal/useTerminalContextMenu.ts`（加 `handleOpenInCenterFromMenu`）
- Modify: `frontend/src/app/features/terminal/TerminalContextMenu.tsx`（加菜单项）
- Test: `frontend/src/app/features/terminal/__tests__/terminalOpenInCenter.test.tsx`

**Interfaces:**
- Consumes: `centerShowTerminalTab`。
- Produces: `useTerminalContextMenu` 返回值增加 `handleOpenInCenterFromMenu: () => void`。

- [ ] **Step 1: 写失败测试**

```tsx
// frontend/src/app/features/terminal/__tests__/terminalOpenInCenter.test.tsx
import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useTerminalContextMenu } from '../useTerminalContextMenu';
import { useAppStore } from '@stores/slicedStore';

describe('useTerminalContextMenu.openInCenter', () => {
  beforeEach(() => useAppStore.setState({ centerTabs: [], centerActiveTabId: '' }));
  it('把标签移到中心', () => {
    const tabs = [{ id: 'tt1' } as never];
    const { result } = renderHook(() =>
      useTerminalContextMenu(tabs, () => {}, () => {}, () => {}),
    );
    act(() => result.current.setContextMenu({ open: true, x: 0, y: 0, tabId: 'tt1', isPinned: false }));
    act(() => result.current.handleOpenInCenterFromMenu());
    expect(useAppStore.getState().centerTabs.some((t) => t.refId === 'tt1')).toBe(true);
  });
});
```

- [ ] **Step 2: 运行验证失败**

Run: `pnpm --dir frontend npm -- run test -- terminalOpenInCenter`
Expected: FAIL（`handleOpenInCenterFromMenu` 未定义）

- [ ] **Step 3: 实现**

`useTerminalContextMenu` 增加 `handleOpenInCenterFromMenu`（读 `contextMenu.tabId` → `centerShowTerminalTab(tabId)` → 关菜单）。`TerminalContextMenu` 增加「在中心显示」项。`WorkspaceTerminalEntry` 把 `TerminalContextMenu` 与 `useTerminalContextMenu` 接入：`TerminalTabBar` 的 `onContextMenu` 不再是空实现。

- [ ] **Step 4: 运行验证通过**

Run: `pnpm --dir frontend npm -- run test -- terminalOpenInCenter TerminalContextMenu && cd frontend && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add frontend/src/app/features/workspace-terminal/WorkspaceTerminalEntry.tsx frontend/src/app/features/terminal/useTerminalContextMenu.ts frontend/src/app/features/terminal/TerminalContextMenu.tsx frontend/src/app/features/terminal/__tests__/terminalOpenInCenter.test.tsx
git commit -m "feat(terminal): add open-in-center entry point"
```

---

## Milestone E — dsh 统一与收尾

### Task 15: dsh 统一为普通浏览器标签 + 退役专属视图

**Files:**
- Modify: `frontend/src/app/stores/actions/dshActions.ts`（`openDsh` 改为拉起进程后创建浏览器标签）
- Delete/Retire: `frontend/src/app/features/dsh/useDshWebViewBounds.ts`、`useDshWebViewVisibility.ts`、`DshHostRegion.tsx`、`CloseDshDialog.tsx`
- Modify: `frontend/src/app/regions/CenterPane.tsx`（移除 CloseDshDialog）
- Modify: `frontend/src/app/features/dsh/WelcomePage.tsx`（版本管理卡片迁入 launcher）
- Modify: `src-tauri/src/commands/browser.rs`（移除 `browser_create_dsh_view` / `browser_destroy_dsh_view` / `browser_set_dsh_bounds` / `DSH_VIEW_LABEL` / `destroy_dsh_webview`）
- Modify: `src-tauri/src/main.rs`（反注册上述命令）
- Test: `frontend/src/app/stores/actions/__tests__/dshActions.test.ts`（更新）

**Interfaces:**
- Consumes: `centerShowBrowserTab`、`browserOpenTab`。
- Produces: `openDsh()` 成功后返回 `{ url, freedPort }`，并创建一个 `isDsh=true` 的中心浏览器标签。

- [ ] **Step 1: 写失败测试**

更新 `dshActions.test.ts`，新增断言：`openDsh` 成功创建一个 `isDsh` 的中心浏览器标签：

```ts
it('openDsh 创建 isDsh 中心浏览器标签', async () => {
  const store = useAppStore;
  store.setState({ browserTabs: [], browserActiveTabId: '', centerTabs: [], centerActiveTabId: '' });
  await store.getState().openDsh();
  const s = store.getState();
  const dshTab = s.browserTabs.find((t) => t.isDsh);
  expect(dshTab?.location).toBe('center');
  expect(s.centerTabs.some((t) => t.kind === 'browser' && t.refId === dshTab?.id)).toBe(true);
});
```

- [ ] **Step 2: 运行验证失败**

Run: `pnpm --dir frontend npm -- run test -- dshActions`
Expected: FAIL

- [ ] **Step 3: 实现**

`openDsh`：`window.digitalLife.dsh.open()` 成功后 `bumpSiblingWebviewNonce()`，随后 `browserOpenTab(data.url ?? '', 'dsh')` 取新 id → `browserUpdateTab(id, { isDsh: true })` → `centerShowBrowserTab(id)`。移除对 `setDshBounds` 的使用。删除 dsh 专属 hook/组件与 Rust 命令；`main.rs` 的 `invoke_handler` 去掉三项。关闭 dsh 标签走 Task 4 的停进程联动。

- [ ] **Step 4: 运行验证通过**

Run: `pnpm --dir frontend npm -- run test -- dshActions && cd frontend && npx tsc --noEmit && cd .. && cargo clippy --workspace --all-targets -- -D warnings`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add -A
git commit -m "refactor(dsh): host dsh as a normal browser tab"
```

---

### Task 16: i18n 补齐、双端集成验证与质量门

**Files:**
- Modify: `frontend/src/app/i18n/zh-CN/center.ts`（新增）、`en-US/center.ts`（新增）
- Modify: i18n 索引（合并新域）
- Test: `frontend/src/app/i18n/__tests__/centerCopyParity.test.ts`

**Interfaces:**
- Consumes: 前序任务引用的所有 `t.*` key。
- Produces: `centerTitle`、`centerTabShowInCenter`、`centerTabShowInBrowserPanel`、`centerTabShowInTerminalPanel`、`centerNewTab`、`centerLauncherOpenDsh`、`centerLauncherOpenBrowser`、`centerLauncherOpenTerminal`。

- [ ] **Step 1: 写失败测试**

```ts
// frontend/src/app/i18n/__tests__/centerCopyParity.test.ts
import { describe, it, expect } from 'vitest';
import { zhCN } from '../zh-CN';
import { enUS } from '../en-US';

const KEYS = ['centerTitle', 'centerTabShowInCenter', 'centerTabShowInBrowserPanel', 'centerTabShowInTerminalPanel', 'centerNewTab', 'centerLauncherOpenDsh', 'centerLauncherOpenBrowser', 'centerLauncherOpenTerminal'] as const;

describe('center i18n parity', () => {
  it('两端均有非空文案', () => {
    for (const k of KEYS) {
      expect(zhCN[k]?.length).toBeGreaterThan(0);
      expect(enUS[k]?.length).toBeGreaterThan(0);
    }
  });
});
```

- [ ] **Step 2: 运行验证失败**

Run: `pnpm --dir frontend npm -- run test -- centerCopyParity`
Expected: FAIL（key 缺失）

- [ ] **Step 3: 实现**

新增两份 `center.ts` 域并合并进 i18n 索引；补齐前序任务引用的 key，删除临时硬编码。

- [ ] **Step 4: 双端集成验证**

Run: `pnpm --dir frontend run lint && pnpm --dir frontend run test && cd .. && cargo clippy --workspace --all-targets -- -D warnings`
手动（Tauri）：验证两宿主同屏 WebView bounds/z-order、浮层出现时两侧隐藏、dsh 面板↔中心往返复用、面板清空不影响中心标签。
手动（浏览器模式）：双 iframe 栈、同一组交互。

- [ ] **Step 5: 提交**

```bash
git add -A
git commit -m "feat(center): i18n copy and finalize center tab host"
```

---

## Self-Review 记录

- **Spec 覆盖**：§4→Task 1-2；§5→Task 3-4；§6→Task 6-8；§7→Task 9-11；§8→Task 12；§9→Task 13-14；§10→Task 15；§11→Task 5；§12→Task 16；§14/15→Task 16 与各任务测试。
- **占位符扫描**：无 TBD/TODO；每个代码步骤均给真实代码或精确签名与行为。
- **类型一致**：`CenterTabState` / `centerAddTab` / `centerActiveTabId` / `centerShowBrowserTab` / `browserSetLocation` / `terminalSetLocation` / `centerReturnToPanel` / `isPanelTab` 在各任务间拼写一致。
- **拆解说明**：本计划为一个功能的顺序里程碑（A→E），每个任务独立可测；执行需按序（后续任务依赖前序接口）。

