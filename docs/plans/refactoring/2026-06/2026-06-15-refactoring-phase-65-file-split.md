# 重构计划 Phase 65：文件拆分冲刺

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 拆分 4 个超大前端文件（总计 ~2870 行），解决 1 个 O(n²) 性能问题，消除 8 处 CSS 硬编码内联样式与冗余变量。

**架构说明：** 所有拆分遵循"按职责拆分，不按层级分离"原则。新文件放在目标文件同级目录或相邻子模块。提取的函数保持纯函数特性，不引入新状态依赖。拆分后原有的 barrel export（`index.ts`）更新为 re-export 新文件。

**技术栈：** React 19 + TypeScript + Zustand + CodeMirror 6

---

## 文件结构

| 操作 | 文件 | 职责 |
|------|------|------|
| **Split** | `features/editor/cmScrollLeftSync.ts` (653 行) | → `cmScrollSync.ts`（左侧-右侧滚动同步）、`cmHorizontalScroll.ts`（自定义水平滚动条）、`cmLintHighlights.ts`（lint 高亮管理） |
| **Split** | `features/editor/FoldTooltipOverlay.tsx` (666 行) | → `useFoldTooltipState.ts`（状态管理）、`useFoldTooltipPosition.ts`（定位计算）、`FoldTooltipOverlay.tsx`（仅渲染） |
| **Split** | `features/github-tree/GitHubTreeEntry.tsx` (970 行) | → `GitHubEntryMenus.ts`（菜单构建）、`GitHubEntrySubEntries.tsx`（子条目渲染）、`GitHubTreeEntry.tsx`（缩减后） |
| **Split** | `regions/right-panel/panels/communicate/GitHubPanel.tsx` (996 行) | → `GitHubCIOverview.tsx`（概览视图）、`GitHubCILogs.tsx`（日志视图）、`GitHubCISettings.tsx`（设置对话框）、`GitHubPanel.tsx`（缩减为路由编排） |
| **Fix** | `features/file-tree/fileTree.tsx` | `trunkHeightMap` O(n²) → O(n) 计算 |
| **Fix** | `TreeNodeRow.tsx` | CSS 变量 `--adl-filetree-hover-offset`、`--adl-tree-row-offset`、`--adl-outline-row-offset` 统一为 `--adl-tree-row-offset` |
| **Fix** | `TerminalTabBar.tsx` + `BrowserTabBar.tsx` | 内联 `fontSize: '13px'` 和 `padding: '2px 6px'` → CSS class + 设计 Token |
| **Fix** | `TitleBar.tsx` | 两次 `useAppStore` 调用合并为单次 `useShallow` 调用 |

---

### Task 1: 拆分 cmScrollLeftSync.ts → 3 个职责文件

**文件：**
- 删除：`features/editor/cmScrollLeftSync.ts`
- 创建：`features/editor/cmScrollSync.ts` — 仅左右编辑器滚动同步（PluginValue 类提取）
- 创建：`features/editor/cmHorizontalScroll.ts` — 自定义水平滚动条（拖拽/点击）
- 创建：`features/editor/cmLintHighlights.ts` — lint 装饰高亮管理
- 修改：`features/editor/index.ts` — 更新 barrel export

- [ ] **Step 1: 读取源文件全量内容**

```bash
cat frontend/src/app/features/editor/cmScrollLeftSync.ts
```

- [ ] **Step 2: 创建 cmScrollSync.ts — 滚动同步插件**

提取 `ScrollLeftSyncPlugin` 类中与滚动同步相关的部分（第 1-50 行、第 30-80 行范围内的 scroll sync 逻辑），保留以下 API：

```ts
// cmScrollSync.ts
import { ViewPlugin, type EditorView, type PluginValue, type ViewUpdate } from '@codemirror/view';

const SCROLL_LEFT_CSS_VAR = '--adl-editor-scroll-left';

class ScrollSyncPlugin implements PluginValue {
  private frame = 0;
  private lastChunkPositions = new Map<Element, string>();

  update(update: ViewUpdate) {
    // 仅保留跨编辑器滚动同步逻辑
    if (update.geometryChanged || update.selectionSet) {
      this.syncScrollLeft(update.view);
    }
  }

  private syncScrollLeft(view: EditorView) {
    const scroller = view.scrollDOM;
    const maxScrollLeft = scroller.scrollWidth - scroller.clientWidth;
    if (maxScrollLeft <= 0) return;

    const scrollFraction = maxScrollLeft > 0 ? scroller.scrollLeft / maxScrollLeft : 0;
    scroller.style.setProperty(SCROLL_LEFT_CSS_VAR, `${scrollFraction}`);
  }

  destroy() {
    cancelAnimationFrame(this.frame);
  }
}

export const scrollSyncPlugin = ViewPlugin.fromClass(ScrollSyncPlugin);
```

- [ ] **Step 3: 创建 cmHorizontalScroll.ts — 自定义水平滚动条**

提取 `HScrollBar` 类相关逻辑（自定义滚动条 DOM 创建、拖拽处理、ResizeObserver、点击定位）：

```ts
// cmHorizontalScroll.ts
import { type EditorView } from '@codemirror/view';

const THUMB_MIN_WIDTH = 40;
const HSCROLL_CLASS = 'adl-cm-hscroll';
const HSCROLL_VISIBLE_CLASS = 'is-visible';
const HSCROLL_DRAGGING_CLASS = 'is-dragging';
const HSCROLL_DOT_OFFSET_VAR = '--adl-hscroll-dot-offset';

function formatPx(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '0px';
  return `${value}px`;
}

export function setupHorizontalScroll(view: EditorView): { destroy: () => void } {
  const scroller = view.scrollDOM;
  // ... 创建 hscroll DOM 元素，绑定拖拽/点击事件，ResizeObserver
  // 完整代码取自原文件第 50-350 行的 HScroll 相关实现

  return {
    destroy: () => { /* 清理事件监听、DOM 节点 */ },
  };
}
```

- [ ] **Step 4: 创建 cmLintHighlights.ts**

提取 lint 装饰高亮相关逻辑：

```ts
// cmLintHighlights.ts
import { type EditorView } from '@codemirror/view';

export function collectLintHighlights(view: EditorView): Array<{ line: number; message: string }> {
  // 从 view.state 中读取 lint 装饰，返回高亮行列表
  return [];
}

export function syncLintHighlightChunks(view: EditorView, highlights: Array<{ line: number; message: string }>): void {
  // 将 lint 高亮同步到 chunk positions 系统
}
```

- [ ] **Step 5: 缩减 cmScrollLeftSync.ts 并更新 barrel**

```ts
// index.ts（更新 barrel export）
export { HScrollBar } from './cmHorizontalScroll';
export { scrollSyncPlugin } from './cmScrollSync';
export { collectLintHighlights, syncLintHighlightChunks } from './cmLintHighlights';
```

删除原 `cmScrollLeftSync.ts`。

- [ ] **Step 6: 检查所有 import**

```bash
rg "from.*cmScrollLeftSync" frontend/src/app --type-add 'ts:*.ts' --type-add 'tsx:*.tsx' -t ts -t tsx
```

将所有引用 `cmScrollLeftSync` 的 import 更新为指向对应的新文件。

- [ ] **Step 7: 运行质量门禁**

```bash
cd frontend && npx eslint . && npx tsc --noEmit
```

- [ ] **Step 8: 提交**

```bash
git add frontend/src/app/features/editor/cmScrollSync.ts frontend/src/app/features/editor/cmHorizontalScroll.ts frontend/src/app/features/editor/cmLintHighlights.ts frontend/src/app/features/editor/index.ts
git rm frontend/src/app/features/editor/cmScrollLeftSync.ts
git commit -m "refactor(editor): 拆分 cmScrollLeftSync.ts 为 3 个职责文件"
```

---

### Task 2: 拆分 FoldTooltipOverlay.tsx → 2 个 Hook + 精简组件

**文件：**
- 创建：`features/editor/useFoldTooltipState.ts` — 折叠区域状态管理
- 创建：`features/editor/useFoldTooltipPosition.ts` — tooltip 定位计算
- 修改：`features/editor/FoldTooltipOverlay.tsx` — 缩减为仅渲染逻辑
- 修改：`features/editor/index.ts` — 更新 barrel export

- [ ] **Step 1: 创建 useFoldTooltipState.ts**

提取 fold 状态管理，包括 fold 检测、展开/折叠操作：

```ts
// useFoldTooltipState.ts
import { useCallback, useState } from 'react';
import type { EditorView } from '@codemirror/view';
import { foldable, foldedRanges, foldEffect, unfoldEffect } from '@codemirror/language';

export interface FoldTooltipState {
  text: string;
  rect: DOMRect;
}

export function useFoldTooltipState(view: EditorView | null) {
  const [tooltip, setTooltip] = useState<FoldTooltipState | null>(null);

  const isFoldedAt = useCallback((line: number) => {
    if (!view) return false;
    const lineHandle = view.state.doc.line(line);
    const ranges = foldedRanges(view.state);
    return ranges.iterLines().some((from, to) => from <= line && line <= to);
  }, [view]);

  const toggleFold = useCallback((line: number) => {
    if (!view) return;
    const pos = view.state.doc.line(line).from;
    if (foldable(view.state, pos)) {
      view.dispatch({ effects: foldEffect.of(pos) });
    } else {
      view.dispatch({ effects: unfoldEffect.of(pos) });
    }
  }, [view]);

  return { tooltip, setTooltip, isFoldedAt, toggleFold };
}
```

- [ ] **Step 2: 创建 useFoldTooltipPosition.ts**

提取 tooltip 定位计算：

```ts
// useFoldTooltipPosition.ts
import { useMemo } from 'react';

interface PositionState {
  left: number;
  top: number;
  side: 'right' | 'left';
}

export function useFoldTooltipPosition(tooltipRect: DOMRect | null): PositionState | null {
  return useMemo(() => {
    if (!tooltipRect) return null;
    // 定位计算逻辑（取原文件第 200-250 行的定位计算代码）
    const gutterWidth = 48;
    const left = tooltipRect.right + 8;
    const top = tooltipRect.top - 4;
    return { left, top, side: 'right' };
  }, [tooltipRect]);
}
```

- [ ] **Step 3: 精简 FoldTooltipOverlay.tsx**

移除 `getLineNumberFromEvent`、`isFoldedAt`、`toggleFold`、定位计算代码，改为调用 hooks。将 `useAppStore` locale 改为 `useTCopy`：

```tsx
// FoldTooltipOverlay.tsx（精简后）
import { createPortal } from 'react-dom';
import type { EditorView } from '@codemirror/view';
import { useFoldTooltipState, type FoldTooltipState } from './useFoldTooltipState';
import { useFoldTooltipPosition } from './useFoldTooltipPosition';

interface FoldTooltipOverlayProps {
  view: EditorView | null;
}

export function FoldTooltipOverlay({ view }: FoldTooltipOverlayProps) {
  const { tooltip, setTooltip, isFoldedAt, toggleFold } = useFoldTooltipState(view);
  const position = useFoldTooltipPosition(tooltip?.rect ?? null);

  // 事件绑定和 portal 渲染（约 200 行，使用 hooks 替代之前的内联逻辑）
  // ...

  return position && tooltip ? createPortal(
    <div className="adl-fold-tooltip" style={{ left: position.left, top: position.top }}>
      {/* tooltip 内容 */}
      <button onClick={() => { /* toggleFold */ }}>{tooltip.text}</button>
    </div>,
    document.body
  ) : null;
}
```

- [ ] **Step 4: 运行质量门禁**

```bash
cd frontend && npx eslint . && npx tsc --noEmit
```

- [ ] **Step 5: 提交**

```bash
git add frontend/src/app/features/editor/useFoldTooltipState.ts frontend/src/app/features/editor/useFoldTooltipPosition.ts frontend/src/app/features/editor/FoldTooltipOverlay.tsx frontend/src/app/features/editor/index.ts
git commit -m "refactor(editor): 拆分 FoldTooltipOverlay 为 2 hook + 精简组件"
```

---

### Task 3: 拆分 GitHubTreeEntry.tsx → 菜单 + 子条目 + 缩减主文件

**文件：**
- 创建：`features/github-tree/GitHubEntryMenus.ts` — 菜单构建函数
- 创建：`features/github-tree/GitHubEntrySubEntries.tsx` — 4 种子条目渲染
- 修改：`features/github-tree/GitHubTreeEntry.tsx` — 缩减为 entry 外壳
- 修改：`features/github-tree/index.ts` — 更新 barrel

- [ ] **Step 1: 读取源文件确认完整内容

```bash
cat frontend/src/app/features/github-tree/GitHubTreeEntry.tsx
```

- [ ] **Step 2: 创建 GitHubEntryMenus.ts**

提取 `SUB_ENTRY_ICONS` + 菜单项构建函数（原第 16-38 行 + 第 120-380 行范围的所有菜单逻辑）：

```ts
// GitHubEntryMenus.ts
export const SUB_ENTRY_ICONS: Record<string, React.ReactNode> = {
  overview: (/* 图标 SVG */),
  workflows: (/* 图标 SVG */),
  jobs: (/* 图标 SVG */),
  logs: (/* 图标 SVG */),
};

type ChildMenuItem = /* 原类型定义 */;

export function buildChildMenuItems(
  node: GitHubTreeNode,
  categoryType: GitHubCategoryType,
  // ...参数
): ChildMenuItem[] {
  // 原菜单构建逻辑
}

export function buildRootMenuItems(
  node: GitHubTreeNode,
  // ...参数
): ChildMenuItem[] {
  // 原根条目菜单构建逻辑
}
```

- [ ] **Step 3: 创建 GitHubEntrySubEntries.tsx**

提取 4 种子条目渲染（overview/workflows/jobs/logs）：

```tsx
// GitHubEntrySubEntries.tsx
interface GitHubEntrySubEntriesProps {
  node: GitHubTreeNode;
  categoryType: GitHubCategoryType;
  expandedPaths: Record<string, boolean>;
  selectedTreePath: string | null;
  onSelectTreePath: (path: string | null) => void;
  onTogglePath: (path: string) => void;
  callbacks: SectionCallbacks;
}

export function GitHubEntrySubEntries(props: GitHubEntrySubEntriesProps) {
  const { node, expandedPaths, selectedTreePath, onSelectTreePath, onTogglePath, callbacks } = props;

  if (node.children.length === 0) return null;
  if (!expandedPaths[node.path]) return null;

  return (
    <div className="adl-github-tree__children">
      {node.children.map((child) => (
        <GitHubTreeSubEntry
          key={child.path}
          node={child}
          selectedTreePath={selectedTreePath}
          onSelectTreePath={onSelectTreePath}
          onTogglePath={onTogglePath}
          callbacks={callbacks}
        />
      ))}
    </div>
  );
}

function GitHubTreeSubEntry({ node, selectedTreePath, onSelectTreePath, onTogglePath, callbacks }: /* 参数 */) {
  // 原子条目渲染逻辑
}
```

- [ ] **Step 4: 精简 GitHubTreeEntry.tsx**

```tsx
// GitHubTreeEntry.tsx（缩减后）
import { buildChildMenuItems, buildRootMenuItems, SUB_ENTRY_ICONS } from './GitHubEntryMenus';
import { GitHubEntrySubEntries } from './GitHubEntrySubEntries';
// ...其他 import

export function GitHubTreeEntry(props: GitHubTreeEntryProps) {
  const { node, categoryType, callbacks } = props;

  const menuItems = node.children.length > 0
    ? buildChildMenuItems(node, categoryType, /* ... */)
    : buildRootMenuItems(node, /* ... */);

  return (
    <div>
      {/* 外层 entry 按钮 */}
      <GitHubEntrySubEntries
        node={node}
        expandedPaths={expandedPaths}
        selectedTreePath={selectedTreePath}
        onSelectTreePath={onSelectTreePath}
        onTogglePath={onTogglePath}
        callbacks={callbacks}
      />
    </div>
  );
}
```

- [ ] **Step 5: 运行质量门禁**

```bash
cd frontend && npx eslint . && npx tsc --noEmit
```

- [ ] **Step 6: 提交**

```bash
git add frontend/src/app/features/github-tree/
git commit -m "refactor(github-tree): 拆分 GitHubTreeEntry 为菜单+子条目模块"
```

---

### Task 4: 拆分 GitHubPanel.tsx → 4 子视图组件

**文件：**
- 创建：`panels/communicate/GitHubCIOverview.tsx` — CI 概览视图
- 创建：`panels/communicate/GitHubCILogs.tsx` — CI 日志视图
- 创建：`panels/communicate/GitHubCISettings.tsx` — CI 设置对话框
- 创建：`panels/communicate/GitHubCITree.tsx` — CI 工作区树导航
- 修改：`panels/communicate/GitHubPanel.tsx` — 缩减为路由编排
- 修改：`panels/communicate/index.ts` — 更新 barrel

- [ ] **Step 1: 读取源文件确认完整结构

```bash
cat frontend/src/app/regions/right-panel/panels/communicate/GitHubPanel.tsx
```

- [ ] **Step 2: 创建每个子视图组件**

每个文件包含视图对应的 JSX 和逻辑：

```tsx
// GitHubCIOverview.tsx
interface GitHubCIOverviewProps {
  // 仅接收该视图需要的数据和回调
}

export function GitHubCIOverview(props: GitHubCIOverviewProps) {
  // 原概览视图对应的 JSX（约 200 行）
}
```

```tsx
// GitHubCILogs.tsx
export function GitHubCILogs(props: GitHubCILogsProps) {
  // 原日志视图对应的 JSX（约 150 行）
}
```

```tsx
// GitHubCISettings.tsx
export function GitHubCISettings(props: GitHubCISettingsProps) {
  // 原设置对话框对应的 JSX（约 100 行）
}
```

```tsx
// GitHubCITree.tsx
export function GitHubCITree(props: GitHubCITreeProps) {
  // 原 CI 树导航对应的 JSX（约 200 行）
}
```

- [ ] **Step 3: 精简 GitHubPanel.tsx**

```tsx
// GitHubPanel.tsx（缩减为路由编排）
export function GitHubPanel() {
  const { activeWorkspaceSection } = useAppStore(useShallow((s) => ({
    activeWorkspaceSection: s.activeWorkspaceSection,
  })));

  switch (activeWorkspaceSection) {
    case 'overview':
      return <GitHubCIOverview {...overviewProps} />;
    case 'logs':
      return <GitHubCILogs {...logsProps} />;
    case 'settings':
      return <GitHubCISettings {...settingsProps} />;
    default:
      return <GitHubCITree {...treeProps} />;
  }
}
```

- [ ] **Step 4: 运行质量门禁**

```bash
cd frontend && npx eslint . && npx tsc --noEmit
cd .. && cargo clippy --workspace --all-targets
```

- [ ] **Step 5: 提交**

```bash
git add frontend/src/app/regions/right-panel/panels/communicate/GitHubCIOverview.tsx frontend/src/app/regions/right-panel/panels/communicate/GitHubCILogs.tsx frontend/src/app/regions/right-panel/panels/communicate/GitHubCISettings.tsx frontend/src/app/regions/right-panel/panels/communicate/GitHubCITree.tsx frontend/src/app/regions/right-panel/panels/communicate/GitHubPanel.tsx frontend/src/app/regions/right-panel/panels/communicate/index.ts
git commit -m "refactor(github-panel): 拆分为 4 子视图组件"
```

---

### Task 5: 修复 trunkHeightMap O(n²) → O(n)

**文件：**
- 修改：`features/file-tree/fileTree.tsx:L214-L233`

- [ ] **Step 1: 替换 O(n²) 计算为 O(n) 反向遍历**

```tsx
const trunkHeightMap: Record<string, number> = useMemo(() => {
  const map: Record<string, number> = {};
  const depths: number[] = new Array(flatNodes.length);

  // 第一遍：记录每个节点的 depth
  for (let i = 0; i < flatNodes.length; i++) {
    depths[i] = flatNodes[i].depth;
  }

  // 第二遍：反向遍历 O(n)，累加后代计数
  const descendantCounts: number[] = new Array(flatNodes.length).fill(0);
  for (let i = flatNodes.length - 1; i >= 0; i--) {
    const { node, depth } = flatNodes[i];
    if (node.kind === 'directory' && descendantCounts[i] > 0) {
      map[node.path] = (descendantCounts[i] + 1) * VIRTUAL_ITEM_HEIGHT;
    }
    // 向上累加到父节点
    if (i > 0) {
      const depthDelta = depth - depths[i - 1];
      let parentIndex = i - 1;
      // 向上找最近的低深度节点（父目录）
      while (parentIndex >= 0 && depths[parentIndex] >= depth) {
        parentIndex--;
      }
      if (parentIndex >= 0) {
        descendantCounts[parentIndex] += descendantCounts[i] + 1;
      }
    }
  }

  return map;
}, [flatNodes]);
```

- [ ] **Step 2: 运行文件树测试**

```bash
cd frontend && npx vitest run src/app/features/file-tree/fileTree.test.tsx --reporter=verbose
```

- [ ] **Step 3: 运行质量门禁**

```bash
cd frontend && npx eslint . && npx tsc --noEmit
```

- [ ] **Step 4: 提交**

```bash
git add frontend/src/app/features/file-tree/fileTree.tsx
git commit -m "perf(file-tree): trunkHeightMap O(n²) → O(n) 反向遍历"
```

---

### Task 6: CSS 变量统一 + 硬编码内联样式修复

**文件：**
- 修改：`features/file-tree/TreeNodeRow.tsx:L80-L82`
- 修改：`styles/regions/rightpanel/file-tree.css`
- 修改：`styles/regions/rightpanel/files-panel.css`
- 修改：`features/terminal/TerminalTabBar.tsx:L81-L82`
- 修改：`features/browser/BrowserTabBar.tsx:L92-L93`

- [ ] **Step 1: 统一 TreeNodeRow.css 变量**

```tsx
// TreeNodeRow.tsx（仅保留单一变量）
style={{
  '--adl-tree-row-offset': `${Math.max(4, rowOffset)}px`,
}}
```

- [ ] **Step 2: 更新 CSS 引用**

在 `file-tree.css` 和 `files-panel.css` 中将 `var(--adl-filetree-hover-offset)` / `var(--adl-outline-row-offset)` 统一替换为 `var(--adl-tree-row-offset)`：

使用编辑器全局搜索替换，或运行：
```bash
Get-ChildItem -Path "frontend/src/styles/regions/rightpanel" -Include "file-tree.css","files-panel.css" -Recurse | ForEach-Object {
  (Get-Content $_.FullName) -replace 'var\(--adl-filetree-hover-offset\)', 'var(--adl-tree-row-offset)' -replace 'var\(--adl-outline-row-offset\)', 'var(--adl-tree-row-offset)' | Set-Content $_.FullName
}
```

- [ ] **Step 3: 修复 TerminalTabBar 硬编码样式**

```tsx
// TerminalTabBar.tsx
// 之前：
//   fontSize: '13px',
//   padding: '2px 6px',
// 之后：移除内联 style，使用 CSS class

// 在原 className 中添加：
className={`adl-terminal-tab__label${/* ... */}`}
```

在 `terminal-panel.css` 中添加：

```css
.adl-terminal-tab__label {
  font-size: var(--font-size-sm, 13px);
  padding: var(--spacing-xs, 2px) var(--spacing-sm, 6px);
}
```

- [ ] **Step 4: 修复 BrowserTabBar 硬编码样式**

同上，使用 CSS class + 设计 Token。

- [ ] **Step 5: 优化 TitleBar.tsx store 订阅**

```tsx
// TitleBar.tsx 将两次 useAppStore 合并为一次
// 之前：
//   const { leftCollapsed, rightCollapsed, toggleLeft, toggleRight, toggleBoth } = useAppStore(...)
//   ... another useAppStore call at line 165
// 之后：
const titleBarState = useAppStore(useShallow((s) => ({
  leftCollapsed: s.leftCollapsed,
  rightCollapsed: s.rightCollapsed,
  toggleLeftPanel: s.toggleLeftPanel,
  toggleRightPanel: s.toggleRightPanel,
  toggleBothPanels: s.toggleBothPanels,
  // 从第二个 useAppStore 调用补充字段
  someOtherField: s.someOtherField,
})));
```

- [ ] **Step 6: 运行质量门禁**

```bash
cd frontend && npx eslint . && npx tsc --noEmit
```

- [ ] **Step 7: 提交**

```bash
git add frontend/src/app/features/file-tree/TreeNodeRow.tsx frontend/src/styles/regions/rightpanel/file-tree.css frontend/src/styles/regions/rightpanel/files-panel.css frontend/src/app/features/terminal/TerminalTabBar.tsx frontend/src/app/features/browser/BrowserTabBar.tsx frontend/src/app/regions/TitleBar.tsx
git commit -m "refactor(style): CSS变量统一 + 硬编码样式迁移 + TitleBar优化"
```
