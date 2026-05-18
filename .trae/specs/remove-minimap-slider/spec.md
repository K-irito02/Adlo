# 删除 Minimap 滑动条 — 规格

## Why

Minimap 滑动条功能在"文件"面板和"变更"面板的正文区域右侧提供代码缩略图 + 滑动条，该功能在当前 Phase 阶段不再需要，需彻底删除以减少代码体积和维护成本。

## What Changes

### 删除范围

1. **核心实现文件** — 删除 `cmMinimap.ts` 完整文件
2. **Diff 范围计算** — 从 `changePreviewDiffRanges.ts` 中删除仅用于 minimap 的类型和函数
3. **消费组件** — 从 `FilesPanel.tsx`、`ChangesPanel.tsx`、`DiffViewer.tsx` 中移除所有 minimap 相关的导入、状态、props 和逻辑
4. **CSS 样式** — 从 `regions.css` 中移除所有 minimap 相关的样式规则
5. **测试文件** — 删除或更新所有引用 minimap 的测试文件
6. **E2E 测试** — 删除 minimap-diff-debug.spec.ts
7. **设计 Token** — 移除 `--adl-editor-minimap-width` CSS 自定义属性

### 保留范围（确保不影响其他功能）

- `PreviewDiffVisualRange` 类型：仍被 sticky context (`stickyContext.ts`) 使用，**保留**
- `computePreviewDiffVisualRanges` 函数：仍被 ChangesPanel 用于 sticky context diff 高亮，**保留**
- `estimateWrapColumn` 函数：当前在 `cmMinimap.ts` 中定义，被 FilesPanel 和 ChangesPanel 使用，需**提取到独立文件**后再删除 `cmMinimap.ts`
- `changePreviewDiffRanges.ts` 中的通用 diff 计算逻辑：仍被 sticky context 和 diff viewer 使用，**保留**

## Impact

- Affected specs: 编辑功能、差异查看、文件面板、变更面板、粘性上下文
- Affected code:
  - `frontend/src/app/regions/right-panel/cmMinimap.ts` — 整文件删除
  - `frontend/src/app/regions/right-panel/cmMinimap.test.ts` — 整文件删除
  - `frontend/src/app/regions/right-panel/changePreviewDiffRanges.ts` — 删除 minimap 专用类型/函数
  - `frontend/src/app/regions/right-panel/changePreviewDiffRanges.test.ts` — 删除 minimap 相关测试
  - `frontend/src/app/regions/right-panel/FilesPanel.tsx` — 移除 minimap 导入和逻辑
  - `frontend/src/app/regions/right-panel/ChangesPanel.tsx` — 移除 minimap 导入和逻辑
  - `frontend/src/app/regions/right-panel/DiffViewer.tsx` — 移除 minimap props 和逻辑
  - `frontend/src/styles/regions.css` — 移除 minimap 样式
  - `frontend/e2e/minimap-diff-debug.spec.ts` — 删除
  - `frontend/src/app/regions/right-panel/filesEditorOptions.test.ts` — 更新
  - `frontend/src/app/regions/right-panel/changesEditorOptions.test.ts` — 更新
  - `frontend/src/app/regions/right-panel/cmPreviewStyling.test.ts` — 更新
  - `frontend/src/app/regions/right-panel/changesEditorHighlight.test.ts` — 更新

## ADDED Requirements

### Requirement: 提取 estimateWrapColumn

**原因**: `estimateWrapColumn` 函数当前在 `cmMinimap.ts` 中定义，被 FilesPanel 和 ChangesPanel 使用。删除 `cmMinimap.ts` 前需将其提取到独立文件。

- 新建文件 `cmWrapColumn.ts`，包含 `estimateWrapColumn` 函数
- 更新 FilesPanel.tsx 和 ChangesPanel.tsx 的导入路径

### Requirement: 删除 Minimap 滑动条核心实现

删除 `cmMinimap.ts` 完整文件，包括：

- `MinimapSettings` 接口及其默认值
- `MinimapPlugin` 类（CodeMirror PluginValue）
- `getMinimapExtension()` 函数
- `updateMinimapDiffModel()` / `updateMinimapDiffHunks()` 函数
- `estimateWrapColumn()` 函数（先提取到独立文件）
- 所有类型定义（`CmMinimapDiffModel`、`CmMinimapDiffRange`、`CmMinimapDiffSegment` 等）
- 所有纯函数（`computeMinimapSliderMetrics`、`computeMinimapScrollTopFromPointer` 等）

### Requirement: 清理 changePreviewDiffRanges.ts 中的 Minimap 代码

从 `changePreviewDiffRanges.ts` 中删除：

- `PreviewDiffMinimapModel` 类型 — 删除
- `PreviewDiffMinimapOptions` 类型 — 删除
- `computePreviewDiffMinimapModel()` 函数（含辅助函数 `computeFallbackMinimapModel`、`appendVisualLineRanges`、`appendVisualLineColumns`、`isLineHidden`）— 删除
- `PreviewDiffVisualRange` 类型 — **保留**（被 sticky context 使用）
- `computePreviewDiffVisualRanges()` 函数 — **保留**（被 ChangesPanel 使用）

### Requirement: 清理消费组件

#### DiffViewer.tsx

- 从 props 接口删除 `minimapModel`、`minimapScopeId`、`onMinimapDragStart`
- 删除 `getMinimapExtension` 和 `updateMinimapDiffModel` 导入
- 删除 `computePreviewDiffMinimapModel` 导入和调用（`mergedMinimapModel`）
- 删除 `CmMinimapDiffModel` 类型导入
- 删除 SideBySideDiffViewer 组件中 minimap 相关的 props 和逻辑
- 删除 InlineDiffViewer 组件中 minimap 相关的 props 和逻辑

#### FilesPanel.tsx

- 删除 `getMinimapExtension`、`updateMinimapDiffHunks`、`estimateWrapColumn` 导入
- 更新 `estimateWrapColumn` 导入到新的 `cmWrapColumn.ts`
- 删除 `computePreviewDiffMinimapModel` 导入和调用
- 删除 `fileDiffMinimapScopeId`、`fileEditorMinimapScopeId` 相关代码
- 删除 `fileDiffMinimapExpandedUnchanged` 状态和 `handleFileDiffMinimapDragStart`
- 删除传递给 DiffViewer 的 minimap props

#### ChangesPanel.tsx

- 删除 `getMinimapExtension` 导入；更新 `estimateWrapColumn` 导入
- 删除 `computePreviewDiffMinimapModel` 导入和调用
- 删除 `changePreviewEditorMinimapScopeId`、`changePreviewDiffMinimapScopeId` 相关代码
- 删除传递给 DiffViewer 的 minimap props
- **保留** `computePreviewDiffVisualRanges` 导入和调用（用于 sticky context）

### Requirement: 清理 CSS 样式

- **保留但修改** `--adl-editor-minimap-width`: 删除该自定义属性定义
- 删除 `.adl-cm-minimap`、`.adl-cm-minimap--standard`、`.adl-cm-minimap--thumbnail` 等 minimap 容器样式
- 删除 `.adl-cm-minimap-canvas`、`.adl-cm-minimap-slider` 等画布和滑块样式
- 删除 `.adl-cm-minimap-context-menu`、`.adl-cm-minimap-menu-segmented` 等上下文菜单样式
- 更新 `.adl-sticky-context` 的 `right` 属性：从 `var(--adl-editor-minimap-width, 84px)` 改为固定值 `0px`
- 删除 `.adl-cm-no-word-wrap` 中关于 `padding-right` 的 minimap 相关规则
- 删除 `.adl-cm-scroller--minimap-scrollbar` 相关规则

### Requirement: 清理测试文件

- 删除 `cmMinimap.test.ts`（完整文件）
- 从 `changePreviewDiffRanges.test.ts` 中删除所有 `computePreviewDiffMinimapModel` 相关测试
- 从 `filesEditorOptions.test.ts` 中删除 minimap 相关的断言
- 从 `changesEditorOptions.test.ts` 中删除 minimap 相关的断言
- 从 `cmPreviewStyling.test.ts` 中删除 minimap 引用
- 从 `changesEditorHighlight.test.ts` 中删除 minimap 引用
- 删除 `minimap-diff-debug.spec.ts`（完整文件）

### Requirement: 在 DiffViewer 中保留 collapseUnchanged 功能

DiffViewer 的 `collapseUnchanged` 功能**不依赖于** minimap，但当前在 `SideBySideDiffViewer` 和 `InlineDiffViewer` 组件的扩展数组中与 `getMinimapExtension()` 一起传递。删除 minimap 后，需确保 `collapseUnchanged` 功能（包括 `uncollapseUnchanged` effect 和相关折叠/展开逻辑）仍正常工作。

## REMOVED Requirements

### Requirement: 最小化地图滑动条

**Reason**: 该功能不再需要，需要彻底删除以减少代码体积和维护成本。
**Migration**: 任何依赖于 minimap 的第三方代码或配置需要手动适配。
