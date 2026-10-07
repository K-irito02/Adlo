# 终端多窗口改造 · 批次 C（布局引擎）实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为多窗格终端引入布局引擎：工具栏「均分 / 自由」分段选择器、「恢复自动布局」按钮、均分网格 + 比例拖拽、自由像素拖拽、以及窗格过小时的「卷帘门式裁剪 + 项目自定义滚动条」。

**Architecture:** 新增按标签持久化的 `TerminalPaneLayout`（`mode` + `colFractions`/`rowFractions` + `rects`）与纯函数布局数学；`TerminalPaneGrid` 按 `mode` 渲染 CSS Grid（equal）或绝对定位（free）；外层包裹 overflow 容器 + 自定义滚动条实现卷帘门裁剪。B 阶段已有的 `TerminalPaneView`/`TerminalPaneActions` 不变。

**Tech Stack:** React 19 + Zustand + TypeScript；CSS Grid / 绝对定位；`@stores/persisted` 微型存储模式。

**Spec:** `docs/superpowers/specs/2026-10-07-terminal-multipane-design.md`（§5.2 布局模型、§6 布局引擎、§7 工具栏、§13 批次 C）

## Global Constraints

- 未发布产品：禁止数据格式兼容 / 旧版本迁移代码。
- 双端一致：两处宿主共用同一布局 Hook 与网格组件。
- 可见文案走 i18n（zh-CN / en-US 双份）。
- 图标独立组件、`currentColor`、禁止 emoji。
- 卷帘门裁剪必须用**项目自定义滚动条**（非浏览器原生）。
- 完成后必须通过：`pnpm --dir frontend run lint`、`npx tsc --noEmit`、`cargo clippy --workspace --all-targets -- -D warnings`、`cargo test --workspace`、`pnpm --dir frontend run test`。

## 与 Spec 的偏差 / 纳入的遗留项

- **Ruling C-1：批次 C 同时纳入 B 阶段遗留的两个代码 minor**：(a) `handleKillPane` 对齐 `teardownPane`（释放 xterm 池与 `createdSessionIds`）；(b) 修正 `terminalPtyRuntime.ts` 中「attachSession 可能被 handleCreateTab/handleCreatePane 直接调用」的过时注释。
- **Ruling C-2：网格排布为「按行主序填充的 `cols×rows` 网格」**，`cols = ceil(sqrt(n))`、`rows = ceil(n/cols)`；不足最后一行留空。比例拖拽调整相邻列/行轨道（总和守恒）。
- **Ruling C-3：自由模式采用归一化 rect（0..1）**，随容器缩放等比映射；拖拽边缘/角改 `w/h`、拖拽体改 `x/y`，各边设最小像素。
- **Ruling C-4：`IconCustomLayout` 在 C 阶段一并加入 `icons`**（按钮与卡片在批次 D 使用），避免重复改 `icons/index.ts`。

---

## 文件结构

**新增**
- `frontend/src/app/features/terminal/terminalPaneLayout.ts`（模型 + 纯函数 + 微型存储）
- `frontend/src/app/features/terminal/useTerminalPaneLayout.ts`（按标签加载/保存 + 拖拽）
- `frontend/src/app/icons/terminal-pane.tsx`（补 `IconAutoLayout`、`IconCustomLayout`；`IconAddTerminal` 已存在）
- 测试：`__tests__/terminalPaneLayout.test.ts`、`__tests__/useTerminalPaneLayout.test.ts`（或组件级）

**修改**
- `stores/persisted/registry.ts`（新增 `adl:terminal.paneLayout` 条目）
- `stores/persisted/pruneWiring.ts`（按标签剪枝 `paneLayout`）
- `components/terminal/TerminalPaneGrid.tsx`（equal/free 渲染 + 边界线 + overflow 容器）
- `components/terminal/TerminalPaneView.tsx`（`.is-maximized`/`.is-active` 样式；拖拽手柄由 grid 注入）
- `features/terminal/TerminalPanel.tsx`、`features/center/CenterTerminalView.tsx`（工具栏分段 + 恢复按钮 + 布局接线）
- `features/terminal/terminalPtyRuntime.ts`（C-1）
- `styles/regions/rightpanel/terminal-panel.css`（grid/absolute/dividers/scrollbars/min-size）
- `i18n/zh-CN/terminal.ts`、`en-US/terminal.ts`

---

## Task C1: 布局模型 + 纯函数 + 微型存储 + 剪枝

**Files:**
- Create: `ai-digital-life/frontend/src/app/features/terminal/terminalPaneLayout.ts`
- Modify: `ai-digital-life/frontend/src/app/stores/persisted/registry.ts`
- Modify: `ai-digital-life/frontend/src/app/stores/persisted/pruneWiring.ts`
- Test: `ai-digital-life/frontend/src/app/features/terminal/__tests__/terminalPaneLayout.test.ts`

**Interfaces:**
```ts
export const TERMINAL_PANE_LAYOUT_KEY = 'adl:terminal.paneLayout';
export type PaneLayoutMode = 'equal' | 'free';
export interface PaneRect { x: number; y: number; w: number; h: number }
export interface TerminalPaneLayout {
  mode: PaneLayoutMode;
  colFractions: number[];
  rowFractions: number[];
  rects: Record<string, PaneRect>;
}
export const MIN_PANE_W = 200;
export const MIN_PANE_H = 120;
export function computeGrid(n: number): { cols: number; rows: number };
export function equalFractions(count: number): number[];
export function defaultPaneLayout(n: number): TerminalPaneLayout;
export function normalizePaneLayout(raw: unknown, n: number): TerminalPaneLayout;
export function normalizePaneLayoutMap(raw: unknown): Record<string, TerminalPaneLayout>;
export function autoRectForIndex(index: number, n: number): PaneRect;
export function fractionToPx(fraction: number, total: number): number;
export function resizeFractions(
  fractions: number[],
  index: number,
  delta: number,
  minPx: number,
  totalPx: number,
): number[];
export const terminalPaneLayoutStore: {
  loadForTab(tabId: string | undefined): TerminalPaneLayout | undefined;
  saveForTab(tabId: string, layout: TerminalPaneLayout): void;
  loadAll(): Record<string, TerminalPaneLayout>;
  saveAll(map: Record<string, TerminalPaneLayout>): void;
  apply(value: Record<string, TerminalPaneLayout>): void;
};
```

- [ ] **Step 1: 写失败测试（纯函数）**

`terminalPaneLayout.test.ts`：
```ts
it('computeGrid balances panes', () => {
  expect(computeGrid(1)).toEqual({ cols: 1, rows: 1 });
  expect(computeGrid(2)).toEqual({ cols: 2, rows: 1 });
  expect(computeGrid(3)).toEqual({ cols: 2, rows: 2 });
  expect(computeGrid(4)).toEqual({ cols: 2, rows: 2 });
  expect(computeGrid(5)).toEqual({ cols: 3, rows: 2 });
});
it('equalFractions sums to 1', () => {
  expect(equalFractions(4)).toEqual([0.25, 0.25, 0.25, 0.25]);
});
it('normalizePaneLayout repairs fraction length and mode', () => {
  const l = normalizePaneLayout({ mode: 'bogus', colFractions: [1], rowFractions: [] }, 4);
  expect(l.mode).toBe('equal');
  expect(l.colFractions).toHaveLength(2);
  expect(l.rowFractions).toHaveLength(2);
});
it('resizeFractions preserves total and clamps to minPx', () => {
  const out = resizeFractions([0.5, 0.5], 0, 0.1, 50, 400);
  expect(out[0] + out[1]).toBeCloseTo(1);
  expect(out[0]).toBeGreaterThan(0.5);
  const clamped = resizeFractions([0.2, 0.8], 0, -0.5, 100, 400);
  expect(clamped[0] * 400).toBeGreaterThanOrEqual(100 - 0.001);
});
it('autoRectForIndex tiles the grid', () => {
  expect(autoRectForIndex(0, 4)).toEqual({ x: 0, y: 0, w: 0.5, h: 0.5 });
  expect(autoRectForIndex(3, 4)).toEqual({ x: 0.5, y: 0.5, w: 0.5, h: 0.5 });
});
```

- [ ] **Step 2: 运行确认失败** — `npx vitest run src/app/features/terminal/__tests__/terminalPaneLayout.test.ts` → FAIL。

- [ ] **Step 3: 实现纯函数与存储**

- `computeGrid(n)`：`cols = Math.max(1, Math.ceil(Math.sqrt(n)))`，`rows = Math.ceil(n / cols)`。
- `equalFractions(count)`：`Array(count).fill(1 / count)`（count=0 → `[]`）。
- `defaultPaneLayout(n)`：`{ mode: 'equal', colFractions: equalFractions(computeGrid(n).cols), rowFractions: equalFractions(computeGrid(n).rows), rects: {} }`。
- `normalizePaneLayout(raw, n)`：mode 白名单（否则 `'equal'`）；`colFractions`/`rowFractions` 长度须等于 `computeGrid(n)` 的 cols/rows 且均为正有限数，否则用 `equalFractions(...)`；`rects` 逐项校验（4 个有限数 0..1），非法项丢弃。
- `normalizePaneLayoutMap(raw)`：外层非普通对象 → `undefined`；每值经 `normalizePaneLayout(value, <该值可用 pane 数>)`——**注意**：`normalizePaneLayout` 需要 n，而 map 归一化时不知道各标签的 pane 数；故 map 级只做「形状校验 + 原样保留 fractions/rects」，长度修复延后到 `useTerminalPaneLayout` 按实际 pane 数调用 `normalizePaneLayout`。实现：`normalizePaneLayoutMap` 校验 mode/rects 形状，fractions 仅要求为非负有限数数组（长度不在此处修）。
- `autoRectForIndex(index, n)`：按 `computeGrid(n)` 的 cols/rows，第 index 个的 `{x,y,w,h}`（归一化）。
- `resizeFractions(fractions, index, delta, minPx, totalPx)`：`next[index]+=delta; next[index+1]-=delta`；若任一侧 < `minPx/totalPx`，按边界回退；返回新数组，总和守恒。
- `fractionToPx`。
- 存储：仿旧 `terminalViewPrefsStore`（模块级缓存 + `readJson` + `persist` 唯一写通道 + `apply`）。

- [ ] **Step 4: registry + pruneWiring**

`registry.ts` 新增（乙类，apply 交回模块缓存）：
```ts
'adl:terminal.paneLayout': defineEntry<Record<string, TerminalPaneLayout>>({
  key: 'adl:terminal.paneLayout',
  apply: (value) => terminalPaneLayoutStore.apply(value),
  fallback: {},
  scope: 'byTabId',
  read: normalizePaneLayoutMap,
}),
```
`pruneWiring.ts`：在 `applyTabPrune` 中按 `pruneByTabId` 剪枝 `terminalPaneLayoutStore`（与 `cwdByTab` 并列）。

- [ ] **Step 5: 测试 + commit**

Run: `npx vitest run src/app/features/terminal/__tests__/terminalPaneLayout.test.ts src/app/stores/persisted` + `npx tsc --noEmit`。
```bash
git add ai-digital-life/frontend/src/app/features/terminal/terminalPaneLayout.ts ai-digital-life/frontend/src/app/features/terminal/__tests__/terminalPaneLayout.test.ts ai-digital-life/frontend/src/app/stores/persisted
git commit -m "feat(terminal): add pane layout model and persistence"
```

---

## Task C2: 布局 Hook（按标签加载/保存 + 拖拽）

**Files:**
- Create: `ai-digital-life/frontend/src/app/features/terminal/useTerminalPaneLayout.ts`
- Test: `ai-digital-life/frontend/src/app/features/terminal/__tests__/useTerminalPaneLayout.test.ts`

**Interfaces:**
```ts
interface UseTerminalPaneLayoutParams {
  containerRef: React.RefObject<HTMLDivElement | null>;
  activeTabId: string | undefined;
  paneCount: number;
}
interface UseTerminalPaneLayoutReturn {
  layout: TerminalPaneLayout;
  setMode: (mode: PaneLayoutMode) => void;
  resetAuto: () => void;
  handleColDividerPointerDown: (colIndex: number, e: React.PointerEvent) => void;
  handleRowDividerPointerDown: (rowIndex: number, e: React.PointerEvent) => void;
  handleFreeDragPointerDown: (
    paneId: string,
    edge: 'move' | 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw',
    e: React.PointerEvent,
  ) => void;
}
```

- [ ] **Step 1: 写失败测试**

断言：切换 tab 读取该 tab 布局；`paneCount` 变化时 fractions 长度按 `computeGrid` 修复、缺 rect 用 `autoRectForIndex` 补齐；`resetAuto()` 回到 `defaultPaneLayout(paneCount)`；`setMode` 持久化。

- [ ] **Step 2: 实现**

- state `layout`；effect 依赖 `[activeTabId, paneCount]`：`const stored = terminalPaneLayoutStore.loadForTab(activeTabId); setLayout(stored ? repair(stored, paneCount) : defaultPaneLayout(paneCount))`。
- `repair` = `normalizePaneLayout(stored, paneCount)` + 补齐 `rects` 缺失项为 `autoRectForIndex`。
- `commit(next)`：`setLayout(next)` + `terminalPaneLayoutStore.saveForTab(tabId, next)`。
- 拖拽：复用 B 阶段的分界线拖拽手法（`setPointerCapture` + rAF 节流 + 拖拽期写 CSS 变量 + 松手提交）。列拖拽用 `resizeFractions(layout.colFractions, colIndex, delta, MIN_PANE_W, rect.width)`；行同理用 `MIN_PANE_H`。自由拖拽按 edge 更新 `rects[paneId]`（归一化，最小像素夹取）。

- [ ] **Step 3: 测试 + commit**

```bash
git add ai-digital-life/frontend/src/app/features/terminal/useTerminalPaneLayout.ts ai-digital-life/frontend/src/app/features/terminal/__tests__/useTerminalPaneLayout.test.ts
git commit -m "feat(terminal): add per-tab pane layout hook with drag"
```

---

## Task C3: 网格渲染（equal 比例 / free 自由 / 卷帘门裁剪）

**Files:**
- Modify: `ai-digital-life/frontend/src/app/components/terminal/TerminalPaneGrid.tsx`
- Modify: `ai-digital-life/frontend/src/styles/regions/rightpanel/terminal-panel.css`
- Test: `ai-digital-life/frontend/src/app/components/terminal/__tests__/TerminalPaneGrid.test.tsx`

**Interfaces:**
```tsx
interface TerminalPaneGridProps {
  panes: TerminalPane[];
  activePaneId?: string;
  maximizedPaneId: string | null;
  layout: TerminalPaneLayout;
  onColDividerPointerDown: (colIndex: number, e: React.PointerEvent) => void;
  onRowDividerPointerDown: (rowIndex: number, e: React.PointerEvent) => void;
  onFreeDragPointerDown: (paneId: string, edge: FreeDragEdge, e: React.PointerEvent) => void;
  renderPane: (pane: TerminalPane) => ReactNode;
}
```

- [ ] **Step 1: 写失败测试**

断言：equal 模式下渲染 `.adl-terminal-pane-grid.is-equal` 且 `grid-template-columns` 由 fractions 派生；free 模式渲染 `.is-free` 且每窗格有内联 `left/top/width/height`；`maximizedPaneId` 时只渲染该窗格；列/行边界线数量 = cols-1 / rows-1（不足最后一行不渲染多余边界）。

- [ ] **Step 2: 实现**

- 外层 `.adl-terminal-pane-grid-scroll`（`overflow:auto`，项目自定义滚动条类）；内层 `.adl-terminal-pane-grid` 设 `min-width: MIN_PANE_W*cols; min-height: MIN_PANE_H*rows`。
- equal：`display:grid; grid-template-columns: fractions.map(f=>`${f}fr`).join(' '); grid-template-rows: ...`；窗格按行主序填充；列边界线绝对定位在列缝隙、行边界线在行缝隙（`onPointerDown` 调对应 handler）。
- free：`position:relative`；窗格 `position:absolute`，`left/top/width/height` 由 `rect * containerSize` 计算（用 ResizeObserver 记录容器尺寸）；窗格四边/四角渲染拖拽手柄（`onFreeDragPointerDown`）。
- `maximizedPaneId`：只渲染该窗格（`.is-maximized`）。
- 卷帘门裁剪：由内层 `min-width/min-height` + 外层 overflow 实现（视口过小时内容不压缩、裁剪并可滚动查看）。

- [ ] **Step 3: CSS + 测试 + commit**

新增/调整 `.adl-terminal-pane-grid-scroll`、`.adl-terminal-pane-grid.is-equal/.is-free`、`.adl-terminal-pane`（`min-width/height`）、边界线、自由拖拽手柄、`.is-maximized`/`.is-active` 样式；自定义滚动条复用项目既有类。
```bash
git add ai-digital-life/frontend/src/app/components/terminal/TerminalPaneGrid.tsx ai-digital-life/frontend/src/styles/regions/rightpanel/terminal-panel.css ai-digital-life/frontend/src/app/components/terminal/__tests__/TerminalPaneGrid.test.tsx
git commit -m "feat(terminal): pane grid with equal/free layout and curtain clipping"
```

---

## Task C4: 工具栏分段（均分/自由）+ 恢复自动布局 + 图标 + i18n + C-1

**Files:**
- Modify: `ai-digital-life/frontend/src/app/icons/terminal-pane.tsx`、`icons/index.ts`
- Modify: `ai-digital-life/frontend/src/app/features/terminal/TerminalPanel.tsx`
- Modify: `ai-digital-life/frontend/src/app/features/center/CenterTerminalView.tsx`
- Modify: `ai-digital-life/frontend/src/app/features/terminal/terminalPtyRuntime.ts`（C-1）
- Modify: `ai-digital-life/frontend/src/app/i18n/zh-CN/terminal.ts`、`en-US/terminal.ts`

- [ ] **Step 1: 图标**

- `IconAutoLayout`：用户提供的双向环绕箭头 SVG，**保留 `opacity="0.4"` 分组**，写自定义组件（`makeFilled` 不支持分组）：`fill="currentColor"`，`viewBox="0 0 24 24"`，`width/height = size`。
- `IconCustomLayout`：用户提供的魔棒 SVG，`makeFilledStroked('0 0 256 256', 4, <path .../>)`。
- 两者在 `icons/index.ts` 导出。

- [ ] **Step 2: 工具栏接线（两处）**

- 新增分段选择器「均分 / 自由」（`role="group"`，样式复用 `.adl-tool-context__diff-view`/`__toggle-btn`），`aria-pressed` 反映 `layout.mode`。
- 新增「恢复自动布局」图标按钮（`IconAutoLayout` + `t.terminalAutoLayout`），`onClick={resetAuto}`。
- `TerminalPaneGrid` 传入 `layout` 与三个拖拽 handler。
- 两处宿主接线一致（`TerminalPanel` 用 `terminalActions.*`，`CenterTerminalView` 用 `view.*`）。

- [ ] **Step 3: i18n**

增：`terminalLayoutEqual: '均分'`、`terminalLayoutFree: '自由'`、`terminalLayoutModeLabel: '终端布局模式'`、`terminalAutoLayout: '恢复自动布局'`（en-US 对应）。

- [ ] **Step 4: C-1 遗留修复**

- `handleKillPane` 改为调用 `teardownPane`（释放 xterm 池 + 清 `createdSessionIds`），保持「标记 terminated」语义。
- 修正 `terminalPtyRuntime.ts` 过时注释（attachSession 现由 activatePane 唯一调用）。

- [ ] **Step 5: tsc + 测试 + commit**

```bash
git add -A ai-digital-life/frontend/src/app/icons ai-digital-life/frontend/src/app/features ai-digital-life/frontend/src/app/i18n
git commit -m "feat(terminal): equal/free layout selector, auto-layout reset and icons"
```

---

## Task C5: 全量验收

- [ ] **Step 1: 残留检查** — `git grep -n "adl:terminal.viewPrefs" -- ai-digital-life` → 0（旧键不复活）。
- [ ] **Step 2: 前端质量门** — `npx eslint . && npx tsc --noEmit`；`pnpm --dir frontend run test`。
- [ ] **Step 3: Rust 质量门** — `cargo clippy --workspace --all-targets -- -D warnings && cargo test --workspace`。
- [ ] **Step 4: 手动核对** — 报告「待用户执行」（不伪造）。
- [ ] **Step 5: Commit** — `git commit -m "chore(terminal): finalize batch C layout engine" --allow-empty`。

---

## Self-Review

- **Spec 覆盖**：§5.2 布局模型 → C1；§6.1 自动布局 → C3；§6.2 均分比例拖拽 → C2/C3；§6.3 自由像素 → C2/C3；§6.4 卷帘门 + 自定义滚动条 → C3；§6.5 操作（分段 + 恢复）→ C4；§7 图标 → C4。✅
- **占位符扫描**：无 TBD；关键步骤给代码/确切文件与键名。✅
- **类型一致性**：`TerminalPaneLayout`/`PaneLayoutMode`/`TerminalPaneGridProps`/`FreeDragEdge` 在 C1/C2/C3 定义并一致引用。✅
- **已知风险**：`normalizePaneLayoutMap` 不知各标签 pane 数 → 长度修复延后到 Hook（C1 Step 3 已注明）；自由拖拽的重叠语义取「最小尺寸 + 夹取」（spec §12 已接受）。
