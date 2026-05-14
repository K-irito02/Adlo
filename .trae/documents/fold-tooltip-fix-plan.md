# 折叠图标 Tooltip 修复计划

## 摘要

修复 "文件" 和 "变更" 面板中 CodeMirror 编辑器折叠 gutter 图标的 tooltip 不显示问题。将当前基于原生 `title` 属性的实现替换为基于 React Portal 的浮动 tooltip，使用项目已有的 `.tooltip` CSS 样式，支持主题变化，并在 Tauri 桌面和浏览器模式下保持一致。

## 当前状态分析

### 文件结构

```
frontend/src/app/regions/right-panel/
├── cmFoldGutter.ts          # foldGutter markerDOM 生成 (V形/箭头图标)
├── cmFoldingTooltip.ts      # ⚠️ 问题文件：用原生 title 设置 tooltip
├── CodeEditor.tsx           # 普通编辑器 (文件视图)
├── DiffViewer.tsx           # Diff 比较视图 (SideBySideDiffViewer + InlineDiffViewer)
├── FilesPanel.tsx           # 文件面板，使用 getFoldingTooltipExtension
├── ChangesPanel.tsx         # 变更面板，使用 getFoldingTooltipExtension
├── changesEditorOptions.test.ts  # 测试引用 getFoldingTooltipExtension
└── filesEditorOptions.test.ts    # 测试引用 getFoldingTooltipExtension

frontend/src/app/components/
└── Tooltip.tsx              # TooltipSimple/Tooltip/TooltipTrigger/TooltipContent

frontend/src/app/utils/
└── tooltipPosition.ts       # computePosition 定位工具

frontend/src/styles/
├── components.css           # .tooltip 样式 (CSS 变量，支持主题)
└── regions.css              # .cm-foldGutter / .adl-cm-fold-marker 样式
```

### 问题根因

`cmFoldingTooltip.ts` 中的 `FoldingTooltipPlugin` (CodeMirror ViewPlugin) 使用 `el.setAttribute("title", tooltipText)` 设置原生 HTML `title` 属性：

```typescript
// cmFoldingTooltip.ts:57-58
if (tooltipText) {
  el.setAttribute("title", tooltipText);  // 原生 title，不可靠
}
```

**两个问题**：
1. 原生 `title` 属性在 CodeMirror 的动态 DOM 环境下**不可靠**，实际悬停时 tooltip 不弹出
2. 违反了设计系统规则：`Tooltip | 禁止原生 title，必须使用 TooltipSimple`

### 架构约束

折叠 gutter 的 DOM 由 CodeMirror 内部管理（`@codemirror/language` 的 `foldGutter` 扩展），不是 React 管理的 DOM。因此不能直接使用 `TooltipSimple`（它需要包裹 React 子元素），需要一种**DOM-to-React 桥接方案**。

## 设计方案

### 核心思路

创建一个新的 React 组件 `FoldTooltipOverlay`，通过 `createPortal` 将 tooltip 渲染到 `document.body`。该组件：

1. 接收 `EditorView` 引用
2. 直接在 CodeMirror 管理的 `.cm-foldGutter` DOM 上附加**事件委托**监听器
3. 鼠标进入有折叠标记的 gutter 元素时，用 `foldable()` / `foldedRanges()` 计算 tooltip 文本
4. 通过 `createPortal` 渲染浮动 tooltip，使用现有 `.tooltip` CSS 类
5. 滚动时自动关闭

### 组件设计

#### `FoldTooltipOverlay` 组件 Props

```typescript
interface FoldTooltipOverlayProps {
  getView: () => EditorView | null;  // 惰性获取 EditorView（应对 view 延迟创建）
}
```

#### 工作流程

```
用户悬停折叠图标
  → mouseover 事件冒泡到 .cm-foldGutter (事件委托)
  → event.target.closest('.cm-gutterElement') 找到行元素
  → 检查内部是否有 .adl-cm-fold-marker
  → 根据 open/closed 状态调用 foldable()/foldedRanges() 计算文本
  → 获取元素 getBoundingClientRect()
  → 设置 React state (text + triggerRect)
  → 首次渲染 tooltip (off-screen, visibility:hidden)
  → useLayoutEffect 测量 tooltip 尺寸
  → 计算正确位置（优先右侧，边界外则翻转到左侧，并做 viewport clamp）
  → 更新位置 state → 重渲染到正确位置
```

#### 定位计算

使用简化的定位逻辑（复用 `computePosition` 接口思路，但针对 gutter tooltip 场景优化）：

- 默认 placement: `right`，alignment: `start`
- 如果右侧空间不足，翻转到 `left`
- 上下做 viewport clamp（`Math.max(4, Math.min(maxY, y))`）
- offset: 4px

### 文件变更清单

| 操作 | 文件 | 说明 |
|------|------|------|
| **新建** | `FoldTooltipOverlay.tsx` | 浮动 tooltip 组件 |
| **修改** | `CodeEditor.tsx` | 渲染 `FoldTooltipOverlay`，传入 `viewRef` |
| **修改** | `DiffViewer.tsx` | `SideBySideDiffViewer` 和 `InlineDiffViewer` 各渲染 `FoldTooltipOverlay` |
| **修改** | `FilesPanel.tsx` | 移除 `getFoldingTooltipExtension` 导入和使用 |
| **修改** | `ChangesPanel.tsx` | 移除 `getFoldingTooltipExtension` 导入和使用 |
| **删除** | `cmFoldingTooltip.ts` | 不再需要 |
| **修改** | `changesEditorOptions.test.ts` | 移除对 `getFoldingTooltipExtension` 的引用断言 |
| **修改** | `filesEditorOptions.test.ts` | 移除对 `getFoldingTooltipExtension` 的引用断言 |

### CodeEditor.tsx 变更

```tsx
// 新增导入
import { FoldTooltipOverlay } from "./FoldTooltipOverlay";

// 在 JSX 中，CodeMirror 包装元素内部添加：
<div className="adl-cm-editor" style={{ position: 'relative' }}>
  <CodeMirror ... />
  <FoldTooltipOverlay getView={() => viewRef.current} />
</div>
```

### DiffViewer.tsx 变更

**SideBySideDiffViewer** (两个编辑器)：
```tsx
// 在 useEffect 中 MergeView 创建后，使用 ref 存储 editor views
// 渲染两个 overlay：
<FoldTooltipOverlay getView={() => mergeViewARef.current} />
<FoldTooltipOverlay getView={() => mergeViewBRef.current} />
```

具体实现：在 `SideBySideDiffViewer` 中额外维护 `mergeViewARef` 和 `mergeViewBRef`，在 MergeView 创建/销毁时更新。

**InlineDiffViewer** (一个编辑器)：
```tsx
<FoldTooltipOverlay getView={() => viewRef.current} />
```

### 与现有 tooltip 样式的一致性

新 tooltip 使用与 `Tooltip.tsx` 中 `TooltipContentInner` 相同的 CSS 类：
- `.tooltip` — 主容器（背景色 `var(--text-primary)`，文字色 `var(--bg)`，圆角、阴影）
- `.tooltip__content` — 内容 wrapper
- 无箭头（gutter tooltip 简化为纯文本提示）

CSS 变量自动适配 light/dark 主题切换。

### 边界情况处理

| 场景 | 处理 |
|------|------|
| 行号禁用（gutter 不存在） | `document.querySelector('.cm-foldGutter')` 返回 null，跳过监听 |
| 编辑器滚动 | `view.scrollDOM` 的 `scroll` 事件 → 关闭 tooltip |
| 快速在 gutter 元素间移动 | `mouseover` 事件带 `closest('.cm-gutterElement')` 精确匹配 |
| MergeView 销毁/重建 | `FoldTooltipOverlay` 的 `useEffect` cleanup 移除监听器 |
| 编辑器内容变化（折叠状态改变） | mouseover 时实时计算，始终反映最新状态 |
| 窗口 resize | tooltip 通过 portal 渲染到 body，位置基于 viewport 坐标 |

### 多实例处理

每个 `FoldTooltipOverlay` 实例独立管理自己的状态和事件监听器，通过各自的 `getView()` 访问对应的 `EditorView`。不会有多实例冲突。

## 测试更新

### 需修改的测试

`changesEditorOptions.test.ts`:
- 移除 `expect(changesPanelSource).toContain("getFoldingTooltipExtension")`
- 添加 `expect(changesPanelSource).toContain("FoldTooltipOverlay")`

`filesEditorOptions.test.ts`:
- 移除 `expect(filesPanelSource).toContain("getFoldingTooltipExtension")`
- 添加 `expect(filesPanelSource).toContain("FoldTooltipOverlay")`

### 新增建议（可选）

如果项目支持组件级测试，可为 `FoldTooltipOverlay` 添加单元测试：
- tooltip 文本计算正确性
- 定位计算正确性
- 事件监听器正确清理

## 验证步骤

1. `npm --prefix frontend run typecheck` — 类型检查通过
2. `npm --prefix frontend test` — 所有测试通过（含更新后的测试）
3. 浏览器预览：`npm run dev:browser`
   - 打开 "文件" 面板，确认行号区域折叠图标悬停时显示 "展开至N行" / "折叠至N行"
   - 打开 "变更" 面板（内联 + 并排），确认同上
   - 切换 light/dark 主题，确认 tooltip 颜色跟随变化
4. Tauri 桌面：`npm run dev:tauri`
   - 重复上述验证
5. 边界测试：
   - 禁用行号 → tooltip 不出现
   - 滚动编辑器 → tooltip 消失
   - 快速在不同行间移动 → tooltip 正确切换

## 假设与决策

1. **Tooltip 位置**：默认在 gutter 元素右侧显示，空间不足时翻转到左侧。对齐方式为 `start`（与行顶部对齐）。
2. **无箭头**：gutter tooltip 简洁为纯文字提示，不带三角箭头。
3. **延迟**：使用 CSS `transition` 控制显示（200ms opacity/fade），无需 JS 延迟。
4. **移除而非重构 `cmFoldingTooltip.ts`**：该文件唯一目的是设置原生 title，完全移除是更干净的做法。
5. **不修改 `cmFoldGutter.ts`**：该文件仅负责 marker DOM 生成，与 tooltip 逻辑无关，保持不变。
