# 终端多窗口改造 · 批次 B（多窗口数据模型 + PTY per-pane + 增加/关闭窗口）实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让「一个终端标签」容纳多个独立 PTY 的终端窗口（窗格），在两处工具栏提供「增加终端」与每个窗口的「关闭窗口」按钮；批次 B 用单列（纵向平铺）呈现，布局引擎留待批次 C。

**Architecture:** `TerminalTabState` 由「单会话」升级为「窗格数组」（`panes: TerminalPane[]` + `activePaneId`）；PTY 运行时身份从 `tab` 升级为 `{ tabId, paneId, sessionId }`；视图渲染一个 `TerminalPaneGrid`（B 阶段为纵向 flex 平铺），每个 `TerminalPaneView` 自持 xterm 引用与动作叠加层。

**Tech Stack:** React 19 + Vite + Zustand + TypeScript + xterm.js（前端）；Tauri 2.x + Rust PTY（既有）。

**Spec:** `docs/superpowers/specs/2026-10-07-terminal-multipane-design.md`（§5 数据模型、§8 窗格动作、§13 批次 B）

## Global Constraints

- 未发布产品：禁止数据格式兼容 / 旧版本迁移代码；旧标签数据（无 `panes`）由校验器整体拒绝并回退空，不做迁移。
- 双端一致：Tauri 与浏览器 preview 行为一致；两处宿主（`TerminalPanel` 右面板、`CenterTerminalView` 中心）功能一致。
- 可见文案必须走 i18n（`zh-CN` / `en-US` 双份）。
- 图标为独立组件（不内联）、继承 `currentColor`、禁止 emoji。
- 每个窗格是**独立 PTY 会话**，数量无上限。
- 完成后必须通过：`pnpm --dir frontend run lint`、`npx tsc --noEmit`、`cargo clippy --workspace --all-targets -- -D warnings`、`cargo test --workspace`、`pnpm --dir frontend run test`。
- 每步运行命令验证；每个 Task 结束提交一次。

## 与 Spec 的偏差（controller 裁定，已记录）

- **Ruling B-1：`TerminalPane` 增加 `status: 'idle' | 'running' | 'terminated'` 字段**（spec §5.1 未列）。理由：PTY 创建失败 / 会话结束需要按窗格标记，标签级 `status` 已删除，无逐窗格状态则无法显示「shell 未找到」提示。成本：多一个字段。
- **Ruling B-2：每个窗格增加「关闭窗口」按钮**（用户明确确认）。关闭最后一个窗格 = 关闭整个标签。
- **Ruling B-3：工具栏菜单（复制/粘贴/清除/杀死）作用于「活动窗格」**；为支持多窗格，复制/清除改用 `terminalXtermPool` 按 sessionId 访问，而非单一 `xtermRef`。
- **Ruling B-4：批次 B 的窗格布局为纵向单列平铺**（`flex-direction: column`），均分/自由布局由批次 C 引入。

---

## 文件结构

**新增（前端）**
- `frontend/src/app/components/terminal/TerminalPaneGrid.tsx`（窗格容器 + 最大化态 + 单列平铺）
- `frontend/src/app/components/terminal/TerminalPaneView.tsx`（单窗格：XtermTerminal + 动作叠加层）
- `frontend/src/app/components/terminal/TerminalPaneActions.tsx`（关闭/清空/最大化·还原；由 `TerminalRegionActions.tsx` 演进）
- `frontend/src/app/icons/terminal-pane.tsx`（`IconAddTerminal`；批次 C 再补另两个）

**修改（前端）**
- `stores/slices/terminalSliceTypes.ts`、`stores/slices/terminalSlice.ts`
- `stores/persisted/registry.ts`（`isTerminalTabState` 校验器）
- `features/terminal/terminalPtyRuntime.ts`（per-pane 化）
- `features/terminal/useTerminalPtyLifecycle.ts`、`useTerminalTabActions.ts`、`useTerminalPanel.ts`、`useTerminalMenus.ts`、`useTerminalShellManagement.ts`
- `features/center/useTerminalView.ts`、`features/center/CenterTerminalView.tsx`
- `features/terminal/TerminalPanel.tsx`
- `features/terminal/terminalXtermPool.ts`（若需按 sessionId 暴露 selection/clear，见 B3）
- `styles/regions/rightpanel/terminal-panel.css`
- `i18n/zh-CN/terminal.ts`、`i18n/en-US/terminal.ts`
- `stores/selectors.ts`（若引用 tab.sessionId/status，见 B1）

**删除（前端）**
- `frontend/src/app/components/terminal/TerminalRegionActions.tsx`（由 `TerminalPaneActions.tsx` 取代）

---

## Task B1: 数据模型 + store 动作 + 校验器

**Files:**
- Modify: `ai-digital-life/frontend/src/app/stores/slices/terminalSliceTypes.ts`
- Modify: `ai-digital-life/frontend/src/app/stores/slices/terminalSlice.ts`
- Modify: `ai-digital-life/frontend/src/app/stores/persisted/registry.ts`（`isTerminalTabState`）
- Modify: `ai-digital-life/frontend/src/app/stores/selectors.ts`（如引用 tab.sessionId/status）
- Test: `ai-digital-life/frontend/src/app/stores/slices/__tests__/terminalSlice.test.ts`、`__tests__/terminalSliceTypes.test.ts`、`__tests__/terminalPersistence.test.ts`

**Interfaces:**
- Produces（供 B2–B4 使用）:
```ts
export interface TerminalPane {
  id: string;                 // createUiId('pane')
  sessionId?: string;
  profile: TerminalProfile;
  status: 'idle' | 'running' | 'terminated';   // Ruling B-1
  label?: string;             // ≤1 字符（批次 D 用）
  colorIndex: number;         // 0-based，创建时分配
}
export interface TerminalTabState {
  id: string; workspaceId: string; title: string;
  profile: TerminalProfile;   // 本标签「新建窗格」的默认 shell
  panes: TerminalPane[];
  activePaneId?: string;
  isPinned: boolean; pinnedAt?: number; sortOrder: number;
  location?: TabLocation;
}
export function createTerminalPane(profile: TerminalProfile, colorIndex: number): TerminalPane;
export function readTerminalPane(raw: unknown): TerminalPane | undefined;
export function readTerminalPanes(raw: unknown): TerminalPane[] | undefined;
export function activePaneOf(tab: TerminalTabState): TerminalPane | undefined;
export function tabStatusOf(tab: TerminalTabState): 'idle' | 'running' | 'terminated';
export function nextPaneColorIndex(panes: TerminalPane[]): number;
```
- store 动作（`TerminalSlice` 新增）:
```ts
terminalAddPane: (tabId: string, profile?: TerminalProfile) => string;   // 返回新 paneId
terminalRemovePane: (tabId: string, paneId: string) => void;             // 最后一个不删（UI 改走关标签）
terminalUpdatePane: (tabId: string, paneId: string, patch: Partial<Omit<TerminalPane, 'id'>>) => void;
terminalSetActivePane: (tabId: string, paneId: string) => void;
terminalReorderPanes: (tabId: string, orderedIds: string[]) => void;
terminalSwapPanes: (tabId: string, a: string, b: string) => void;
```

- [ ] **Step 1: 写失败测试（store 动作）**

在 `terminalSlice.test.ts` 增加：

```ts
it('terminalCreateTab creates a tab with exactly one pane', () => {
  const id = useAppStore.getState().terminalCreateTab('powershell');
  const tab = useAppStore.getState().terminalTabsById[id];
  expect(tab.panes).toHaveLength(1);
  expect(tab.panes[0].profile).toBe('powershell');
  expect(tab.panes[0].status).toBe('idle');
  expect(tab.activePaneId).toBe(tab.panes[0].id);
});

it('terminalAddPane appends an independent pane and activates it', () => {
  const id = useAppStore.getState().terminalCreateTab('powershell');
  const paneId = useAppStore.getState().terminalAddPane(id, 'bash');
  const tab = useAppStore.getState().terminalTabsById[id];
  expect(tab.panes).toHaveLength(2);
  expect(tab.panes[1].id).toBe(paneId);
  expect(tab.panes[1].profile).toBe('bash');
  expect(tab.activePaneId).toBe(paneId);
});

it('terminalRemovePane removes a pane but keeps the last one', () => {
  const id = useAppStore.getState().terminalCreateTab('powershell');
  const only = useAppStore.getState().terminalTabsById[id].panes[0].id;
  useAppStore.getState().terminalRemovePane(id, only);
  expect(useAppStore.getState().terminalTabsById[id].panes).toHaveLength(1);
  const second = useAppStore.getState().terminalAddPane(id);
  useAppStore.getState().terminalRemovePane(id, second);
  expect(useAppStore.getState().terminalTabsById[id].panes).toHaveLength(1);
});

it('terminalReorderPanes and terminalSwapPanes reorder by id', () => {
  const id = useAppStore.getState().terminalCreateTab('powershell');
  const a = useAppStore.getState().terminalTabsById[id].panes[0].id;
  const b = useAppStore.getState().terminalAddPane(id);
  useAppStore.getState().terminalReorderPanes(id, [b, a]);
  expect(useAppStore.getState().terminalTabsById[id].panes.map((p) => p.id)).toEqual([b, a]);
  useAppStore.getState().terminalSwapPanes(id, a, b);
  expect(useAppStore.getState().terminalTabsById[id].panes.map((p) => p.id)).toEqual([a, b]);
});

it('terminalUpdatePane patches only the target pane', () => {
  const id = useAppStore.getState().terminalCreateTab('powershell');
  const paneId = useAppStore.getState().terminalTabsById[id].panes[0].id;
  useAppStore.getState().terminalUpdatePane(id, paneId, { sessionId: 's1', status: 'running' });
  const pane = useAppStore.getState().terminalTabsById[id].panes[0];
  expect(pane.sessionId).toBe('s1');
  expect(pane.status).toBe('running');
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd ai-digital-life/frontend && npx vitest run src/app/stores/slices/__tests__/terminalSlice.test.ts`
Expected: FAIL（`terminalAddPane` 不存在 / `panes` 未定义）。

- [ ] **Step 3: 改 `terminalSliceTypes.ts`**

- 新增 `TerminalPane` 接口与上述导出函数；`createTerminalPane`：
```ts
export function createTerminalPane(profile: TerminalProfile, colorIndex: number): TerminalPane {
  return { id: createUiId('pane'), profile, status: 'idle', colorIndex };
}
```
（`createUiId` 从 `../shared` 导入；注意与 `terminalSlice.ts` 的导入方向一致，避免循环依赖 —— 若 `../shared` 会引入循环，改为在 `terminalSlice.ts` 内生成 id 并把 `createTerminalPane` 放在该文件。实现时以 `tsc` 为准。）
- `readTerminalPane` / `readTerminalPanes`：逐项校验（`id` string、`profile` 合法、`status` 白名单、`colorIndex` number、可选 `sessionId`/`label` string）；任一非法 → 该项拒绝。
- `activePaneOf(tab)`：`tab.panes.find(p => p.id === tab.activePaneId) ?? tab.panes[0]`。
- `tabStatusOf(tab)`：`panes.length === 0 ? 'idle' : panes.every(p => p.status === 'terminated') ? 'terminated' : panes.some(p => p.status === 'running') ? 'running' : 'idle'`。
- `nextPaneColorIndex(panes)`：返回 0..N 中第一个未被占用的下标，全占用则返回 `panes.length`。
- `TerminalTabState`：删除 `sessionId`、`status`；新增 `panes: TerminalPane[]`、`activePaneId?: string`。

- [ ] **Step 4: 改 `terminalSlice.ts`**

- `terminalCreateTab`：`panes: [createTerminalPane(finalProfile, 0)]`，`activePaneId` 指向它。
- 新增 `terminalAddPane/Remove/Update/SetActive/Reorder/Swap`，每次变更后 `persist('adl:terminal.tabs', nextTabs)` 并重建 `terminalTabsById`。
- `terminalUpdateActiveTab`/`terminalUpdateTab` 的 patch 类型改为 `Partial<Omit<TerminalTabState, 'id' | 'location' | 'panes'>>`（不允许经此改 panes）。
- `terminalReorderTabs`、`terminalCloseTab`、`terminalCloseAllTabs`、`terminalSetLocation`、`terminalTogglePin` 保持，但需携带 `panes`/`activePaneId`（它们用展开拷贝，天然保留）。

- [ ] **Step 5: 改 `registry.ts` 校验器**

`isTerminalTabState`：删除 `item.status` 白名单检查；新增 `panes` 必须为合法数组（`readTerminalPanes(item.panes)` 非空）、`activePaneId` 若存在须为 string。**注意**：旧的 `readObjectArray<TerminalTabState>(isTerminalTabState)` 语义不变（整项拒绝）。

- [ ] **Step 6: 修 `selectors.ts` 与其它编译点**

Run: `cd ai-digital-life/frontend && npx tsc --noEmit`，逐一修正引用 `tab.sessionId` / `tab.status` 的编译点（B2–B4 会大改；本步只需让 tsc 通过或明确留给后续 Task 的错误清单）。**B1 结束时应只剩 B2–B4 目标文件的错误**。

- [ ] **Step 7: 运行测试**

Run: `cd ai-digital-life/frontend && npx vitest run src/app/stores/slices src/app/stores/persisted`
Expected: 新增用例 PASS；旧用例中引用 `sessionId`/`status` 的按新模型改写。

- [ ] **Step 8: Commit**

```bash
git add ai-digital-life/frontend/src/app/stores
git commit -m "feat(terminal): add per-tab pane model and store actions"
```

---

## Task B2: PTY 运行时 per-pane 化

**Files:**
- Modify: `ai-digital-life/frontend/src/app/features/terminal/terminalPtyRuntime.ts`
- Test: `ai-digital-life/frontend/src/app/features/terminal/__tests__/terminalPtyRuntimeSingleton.test.ts`

**Interfaces:**
- Consumes: B1（`TerminalPane`、`terminalUpdatePane` 等）
- Produces（供 B3 使用）:
```ts
interface PaneRef { tabId: string; paneId: string; sessionId?: string }
activatePane(tabId: string, paneId: string): Promise<void>;
handleCreatePane(tabId: string, profile?: TerminalProfile): Promise<void>;
handleClosePane(tabId: string, paneId: string): void;
handleXtermData(pane: PaneRef | undefined, data: string): void;
handleXtermResize(pane: PaneRef | undefined, cols: number, rows: number): void;
handleKillPane(pane: PaneRef | undefined): void;
// 保留：handleCreateTab/handleSelectTab/handleCloseTab/handleCloseAllTabs/ensureStarted/isCreatedSession/hasLiveSession
```

- [ ] **Step 1: 写失败测试**

在 `terminalPtyRuntimeSingleton.test.ts` 增加：
```ts
it('handleCreatePane adds a pane and creates its PTY', async () => {
  const tabId = useAppStore.getState().terminalCreateTab('powershell');
  await terminalPtyRuntime.handleCreatePane(tabId, 'bash');
  const tab = useAppStore.getState().terminalTabsById[tabId];
  expect(tab.panes).toHaveLength(2);
  expect(tab.panes[1].sessionId).toBeTruthy();
});

it('handleClosePane kills only that pane; last pane closes the tab', async () => {
  const tabId = useAppStore.getState().terminalCreateTab('powershell');
  const paneId = useAppStore.getState().terminalAddPane(tabId, 'bash');
  terminalPtyRuntime.handleClosePane(tabId, paneId);
  expect(useAppStore.getState().terminalTabsById[tabId].panes).toHaveLength(1);
  const only = useAppStore.getState().terminalTabsById[tabId].panes[0].id;
  terminalPtyRuntime.handleClosePane(tabId, only);
  expect(useAppStore.getState().terminalTabsById[tabId]).toBeUndefined();
});
```

- [ ] **Step 2: 运行确认失败**

Run: `cd ai-digital-life/frontend && npx vitest run src/app/features/terminal/__tests__/terminalPtyRuntimeSingleton.test.ts`
Expected: FAIL。

- [ ] **Step 3: 身份升级**

- 新增 `PaneRef`；`pendingInput`/`activating` 由 `Map<tabId,…>` 改为 `Map<paneId,…>`。
- `attachSession(tabId, paneId, profile, workspaceId, opts)`：容器查找改为按 paneId：
```ts
export function findPaneCanvas(paneId: string): Element | null {
  return document.querySelector(`[data-pane-id="${CSS.escape(paneId)}"] .adl-terminal-canvas`);
}
```
（保留旧 `findTerminalCanvasForHost` 删除；B4 在窗格容器上加 `data-pane-id`。）
- 创建成功/失败改用 `terminalUpdatePane(tabId, paneId, { sessionId, status })`；孤儿回收判定改为「tab 或 pane 已不存在」。
- `activatePane(tabId, paneId)`：读 `tab.panes.find(p=>p.id===paneId)`；已存活 → fit/focus；否则 `attachSession`。

- [ ] **Step 4: 增删窗格与关闭**

- `handleCreatePane(tabId, profile?)`：`const paneId = store.terminalAddPane(tabId, profile)`，然后 `await attachSession(tabId, paneId, profile ?? tab.profile, tab.workspaceId)`。
- `handleClosePane(tabId, paneId)`：读 tab；若 `tab.panes.length === 1` → `handleCloseTab(tabId)`；否则 kill 该 pane session、`terminalXtermPool.release`、清 `liveSessionIds/ptyDims/createdSessionIds/oscCarry/pendingInput`，再 `store.terminalRemovePane(tabId, paneId)`（并在移除的是活动窗格时重设 activePaneId —— store 内做）。
- `handleCloseTab`/`handleCloseAllTabs`：遍历 `tab.panes` 逐个 kill+release（不再读 `tab.sessionId`）。

- [ ] **Step 5: 输出订阅与目录**

- `event.terminated`：按 sessionId 找到 `{tabId, paneId}`（遍历 tabs/panes），`terminalUpdatePane(tabId, paneId, { status: 'terminated' })`。
- OSC 9;9：owner 查找改为遍历 panes 找 sessionId；`tabCwds` 仍按 **tabId** 持久化（保持现有键 `adl:terminal.cwdByTab`）。

- [ ] **Step 6: 运行测试 + tsc**

Run: `cd ai-digital-life/frontend && npx vitest run src/app/features/terminal/__tests__/terminalPtyRuntimeSingleton.test.ts && npx tsc --noEmit`
Expected: 新增用例 PASS；tsc 剩余错误应仅在 B3/B4 目标文件。

- [ ] **Step 7: Commit**

```bash
git add ai-digital-life/frontend/src/app/features/terminal/terminalPtyRuntime.ts ai-digital-life/frontend/src/app/features/terminal/__tests__/terminalPtyRuntimeSingleton.test.ts
git commit -m "refactor(terminal): make pty runtime pane-scoped"
```

---

## Task B3: Hooks 与菜单改为按窗格

**Files:**
- Modify: `ai-digital-life/frontend/src/app/features/terminal/useTerminalPtyLifecycle.ts`
- Modify: `ai-digital-life/frontend/src/app/features/terminal/useTerminalTabActions.ts`
- Modify: `ai-digital-life/frontend/src/app/features/terminal/useTerminalMenus.ts`
- Modify: `ai-digital-life/frontend/src/app/features/terminal/useTerminalShellManagement.ts`
- Modify: `ai-digital-life/frontend/src/app/features/terminal/useTerminalPanel.ts`
- Modify: `ai-digital-life/frontend/src/app/features/center/useTerminalView.ts`
- Test: 相关 hook 测试（`TerminalShellSelector.test.tsx`、`TerminalContextMenu.test.tsx` 等按需）

**Interfaces:**
- Consumes: B1、B2
- Produces:
  - `useTerminalPtyLifecycle` 返回：`handleXtermData(pane, data)`、`handleXtermResize(pane, cols, rows)`、`handleKillPane(pane)`、`handleCreatePane`、`handleClosePane`、`handleCreateTab`、`handleSelectTab`、`handleCloseTab`、`handleCloseAllTabs`、`paneRefs` 不再需要（复制/清除走 pool）。
  - `useTerminalPanel.terminalState` 增 `panes: TerminalPane[]`、`activePane?: TerminalPane`；`terminalActions` 增 `handleAddPane: () => void`、`handleClosePane: (paneId) => void`。
  - `useTerminalView` 同构（中心）。
  - 菜单动作作用于活动窗格（Ruling B-3）：`useTerminalMenus` 接收 `activePane`，复制/清除用 `terminalXtermPool`。

- [ ] **Step 1: `useTerminalPtyLifecycle` 改造**

- 入参 `activeTab` 保留；启动激活 effect 改为：遍历 `activeTab.panes`，对每个「未创建会话」的 pane 调 `activatePane(tabId, pane.id)`。
- 暴露 B2 的 per-pane 句柄；`handleXtermData(paneId)` 由调用方（窗格组件）传自己的 paneId。

- [ ] **Step 2: `useTerminalMenus` 复制/清除走 pool（Ruling B-3）**

- 新增入参 `activePane: TerminalPane | undefined`。
- `handleCopy`：`const sel = activePane?.sessionId ? terminalXtermPool.get(activePane.sessionId)?.terminal.getSelection() : ''`。
- `handleClear`：`terminalXtermPool.get(activePane.sessionId)?.terminal.clear()`（+ 滚到底）。
- `handlePaste`：`activePane?.sessionId`。
- `handleKill`：`handleKillPane({ tabId, paneId: activePane.id, sessionId: activePane.sessionId })`。
- 删除 `xtermRef` 入参（若其它处仍需 ref 则保留，但清除/复制不再用它）。

- [ ] **Step 3: `useTerminalPanel` / `useTerminalView` 暴露窗格**

- 派生 `panes = activeTab?.panes ?? []`、`activePane = activeTab ? activePaneOf(activeTab) : undefined`。
- `handleAddPane = () => handleCreatePane(activeTab.id)`；`handleClosePane = (paneId) => handleClosePane(activeTab.id, paneId)`。
- 移除单一 `handleClear`/`handleKill` 的「标签级」用法（改为菜单内部按活动窗格）。

- [ ] **Step 4: tsc + 定向测试**

Run: `cd ai-digital-life/frontend && npx tsc --noEmit`
Expected: 仅剩 B4（两处视图 + 组件）错误。

- [ ] **Step 5: Commit**

```bash
git add ai-digital-life/frontend/src/app/features/terminal ai-digital-life/frontend/src/app/features/center/useTerminalView.ts
git commit -m "refactor(terminal): pane-scoped hooks and menus"
```

---

## Task B4: 窗格渲染 + 动作叠加层 + 「增加终端」按钮 + i18n

**Files:**
- Create: `ai-digital-life/frontend/src/app/components/terminal/TerminalPaneGrid.tsx`
- Create: `ai-digital-life/frontend/src/app/components/terminal/TerminalPaneView.tsx`
- Create: `ai-digital-life/frontend/src/app/components/terminal/TerminalPaneActions.tsx`
- Create: `ai-digital-life/frontend/src/app/icons/terminal-pane.tsx`
- Delete: `ai-digital-life/frontend/src/app/components/terminal/TerminalRegionActions.tsx`
- Modify: `ai-digital-life/frontend/src/app/features/terminal/TerminalPanel.tsx`
- Modify: `ai-digital-life/frontend/src/app/features/center/CenterTerminalView.tsx`
- Modify: `ai-digital-life/frontend/src/app/icons/index.ts`
- Modify: `ai-digital-life/frontend/src/styles/regions/rightpanel/terminal-panel.css`
- Modify: `ai-digital-life/frontend/src/app/i18n/zh-CN/terminal.ts`、`en-US/terminal.ts`
- Test: `ai-digital-life/frontend/src/app/components/terminal/__tests__/TerminalPaneActions.test.tsx`、`ai-digital-life/frontend/src/app/features/center/__tests__/CenterTerminalView.test.tsx`

**Interfaces:**
- Consumes: B1–B3
- Produces:
```tsx
// TerminalPaneActions.tsx
export interface TerminalPaneActionsProps {
  onClose: () => void;
  onClear: () => void;
  isMaximized: boolean;
  onToggleMaximize: () => void;
  titles: { close: string; clear: string; maximize: string; restore: string };
  alwaysVisible?: boolean;
}
```
- `TerminalPaneGrid` props：`panes`、`activePaneId`、`onActivate(paneId)`、`onClose(paneId)`、`renderPane(pane) => ReactNode`（或直接内联 XtermTerminal + 运行时回调）。

- [ ] **Step 1: 图标 `IconAddTerminal`**

`icons/terminal-pane.tsx`（用户提供的 256 viewBox 方形加号，用 `makeFilledStroked('0 0 256 256', 4, <path .../>)`，`currentColor`）：
```tsx
import { makeFilledStroked } from './helper';
export const IconAddTerminal = makeFilledStroked(
  '0 0 256 256',
  4,
  <path d="M208,36H48A12,12,0,0,0,36,48V208a12,12,0,0,0,12,12H208a12,12,0,0,0,12-12V48A12,12,0,0,0,208,36Zm4,172a4,4,0,0,1-4,4H48a4,4,0,0,1-4-4V48a4,4,0,0,1,4-4H208a4,4,0,0,1,4,4Zm-40-80a4,4,0,0,1-4,4H132v36a4,4,0,0,1-8,0V132H88a4,4,0,0,1,0-8h36V88a4,4,0,0,1,8,0v36h36A4,4,0,0,1,172,128Z" />,
);
```
并在 `icons/index.ts` 导出。

- [ ] **Step 2: `TerminalPaneActions.tsx`（由 `TerminalRegionActions` 演进）**

按钮顺序：`清空内容` · `最大化/还原` · `关闭窗口`（关闭最右，`adl-terminal-region-actions__btn--danger`，hover 变红，复用项目 danger-hover 风格）。`aria-label` 用 `titles.*`；`title` 用同文案。

- [ ] **Step 3: `TerminalPaneView.tsx`**

```tsx
interface TerminalPaneViewProps {
  pane: TerminalPane;
  isActive: boolean;
  isMaximized: boolean;
  onActivate: () => void;
  onClose: () => void;
  onToggleMaximize: () => void;
  onData: (data: string) => void;
  onResize: (cols: number, rows: number) => void;
  titles: { clear: string; maximize: string; restore: string; close: string };
}
```
- 自持 `xtermRef`（`XtermTerminalHandle`）；`onClear = () => xtermRef.current?.clear()`。
- 外层 `div.adl-terminal-live` 带 `data-pane-id={pane.id}` 与 `onPointerDown={onActivate}`。
- 内：`<XtermTerminal ref={xtermRef} sessionId={pane.sessionId ?? null} className="adl-terminal-canvas" onData={onData} onResize={onResize} />` + `<TerminalPaneActions .../>`。
- `pane.status === 'terminated' && !pane.sessionId` 时渲染 `.adl-terminal-error-note`。

- [ ] **Step 4: `TerminalPaneGrid.tsx`**

- props：`panes`、`activePaneId`、`maximizedPaneId`、`onActivate`、`onClose`、`onToggleMaximize`、`renderPane`。
- 容器 `.adl-terminal-pane-grid`（B 阶段 `display:flex; flex-direction:column`）；每窗格包一层 `.adl-terminal-pane`，`flex:1 1 0`；最大化时只渲染该窗格（`isMaximized`）。

- [ ] **Step 5: 两处视图接线**

`TerminalPanel.tsx` 主区替换为：
```tsx
{hasActiveTab ? (
  <TerminalPaneGrid
    panes={activeTab.panes}
    activePaneId={activeTab.activePaneId}
    maximizedPaneId={maximizedPaneId}
    onActivate={(paneId) => terminalActions.handleSelectPane(paneId)}
    onClose={(paneId) => terminalActions.handleClosePane(paneId)}
    onToggleMaximize={(paneId) => setMaximizedPaneId((cur) => (cur === paneId ? null : paneId))}
    renderPane={(pane) => (
      <TerminalPaneView
        pane={pane}
        isActive={pane.id === activeTab.activePaneId}
        isMaximized={maximizedPaneId === pane.id}
        onActivate={() => terminalActions.handleSelectPane(pane.id)}
        onClose={() => terminalActions.handleClosePane(pane.id)}
        onToggleMaximize={() => setMaximizedPaneId((cur) => (cur === pane.id ? null : pane.id))}
        onData={(data) => terminalActions.handleXtermData(pane.id, data)}
        onResize={(c, r) => terminalActions.handleXtermResize(pane.id, c, r)}
        titles={{ clear: t.terminalPaneClearLabel, maximize: t.terminalPaneMaximize, restore: t.terminalPaneRestore, close: t.terminalPaneClose }}
      />
    )}
  />
) : null}
```
（`maximizedPaneId` 为 `useState<string | null>(null)` 本地态，切标签/增删窗格时复位。）
工具栏右侧加「增加终端」按钮：
```tsx
<TooltipSimple content={t.terminalAddPane} placement="top">
  <button type="button" className="adl-tool-context__iconbtn"
    onClick={() => terminalActions.handleAddPane()} aria-label={t.terminalAddPane}>
    <IconAddTerminal size={14} decorative />
  </button>
</TooltipSimple>
```
`CenterTerminalView.tsx` 同构（用 `view.*`）。

- [ ] **Step 6: i18n 键**

`zh-CN/terminal.ts` 增：`terminalAddPane: '增加终端'`、`terminalPaneClose: '关闭窗口'`、`terminalPaneClearLabel: '清空内容'`、`terminalPaneClearTitle: '清空该终端窗口当前显示的内容（等同 clear 命令）'`、`terminalPaneMaximize: '最大化'`、`terminalPaneRestore: '还原'`。并把 `terminalLiveClearTitle` 文案改为「清空内容」或删除（由 `terminalPaneClearTitle` 取代；若删除需同步删除所有引用）。`en-US` 对应补全。

- [ ] **Step 7: CSS**

`terminal-panel.css`：新增 `.adl-terminal-pane-grid`（flex column）、`.adl-terminal-pane`（flex:1 1 0; min-height 0; position: relative; 分隔线）、`.adl-terminal-region-actions__btn--danger:hover`（红色）。保留 `.adl-terminal-live`/`.adl-terminal-canvas`/`.adl-terminal-error-note`。

- [ ] **Step 8: 更新测试 + tsc**

- 删除 `TerminalRegionActions.test.tsx`；新增 `TerminalPaneActions.test.tsx`（断言三按钮、aria/title、回调、danger 类）。
- `CenterTerminalView.test.tsx`：断言工具栏含「增加终端」、主区含一个 `.adl-terminal-pane`。
- Run: `cd ai-digital-life/frontend && npx tsc --noEmit`（必须干净）+ 定向 vitest。

- [ ] **Step 9: Commit**

```bash
git add -A ai-digital-life/frontend/src/app/components/terminal ai-digital-life/frontend/src/app/features ai-digital-life/frontend/src/app/icons ai-digital-life/frontend/src/app/i18n ai-digital-life/frontend/src/styles
git commit -m "feat(terminal): render multiple panes with add/close pane actions"
```

---

## Task B5: 全量验收

**Files:** 无新增（收尾）。

- [ ] **Step 1: 残留检查**

Run: `git grep -n -E "tab\.sessionId|tab\.status|TerminalRegionActions" -- ai-digital-life/frontend/src`
Expected: 无生产代码命中（测试除外，按新契约改写）。

- [ ] **Step 2: 前端质量门**

Run: `cd ai-digital-life/frontend && npx eslint . && npx tsc --noEmit`
Run: `pnpm --dir ai-digital-life/frontend run test`
Expected: 0 error；测试全绿。

- [ ] **Step 3: Rust 质量门**

Run: `cargo clippy --workspace --all-targets -- -D warnings && cargo test --workspace`
Expected: 0 warning；全绿。

- [ ] **Step 4: 双端手动核对（浏览器 preview）**

启动浏览器预览（见 `run-project-surfaces` 技能），打开终端面板：点「增加终端」两次 → 出现 3 个纵向窗格，各自独立 shell；点某窗格「关闭窗口」→ 该窗格消失、其余保留；关闭最后一个 → 整个标签关闭；复制/粘贴/清除作用于当前聚焦窗格。中心终端标签同样验证。

- [ ] **Step 5: Commit**

```bash
git add -A ai-digital-life
git commit -m "chore(terminal): finalize batch B multi-pane"
```

---

## Self-Review

- **Spec 覆盖**：§5.1 窗格模型 → B1；§5.1 的 `terminalAddPane/Remove/Update/Reorder/Swap/SetActive` → B1；PTY per-pane → B2；§8 每窗格动作（清空/最大化）→ B4；「增加终端」→ B4；§13 批次 B「单列平铺」→ B4。用户新增「关闭窗口」→ B4。✅
- **占位符扫描**：无 TBD；关键步骤给出代码与确切文件/键名。✅
- **类型一致性**：`TerminalPane`/`PaneRef`/`TerminalPaneActionsProps` 在 B1/B2/B4 定义并在后续引用一致。✅
- **已知风险**：`createTerminalPane` 的 `createUiId` 导入可能引入循环依赖（B1 Step 3 已注明以 tsc 为准）；两处宿主重复接线（B4）需保持一致。
