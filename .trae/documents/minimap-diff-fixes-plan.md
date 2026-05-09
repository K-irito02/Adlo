# Minimap 与变更功能修复计划

## 概述

修复"文件"功能和"变更"功能（内联/并排模式）下 minimap 的四个核心问题，并补充发现的其他缺陷。

## 当前状态分析

### 关键文件

| 文件 | 职责 |
|------|------|
| `cmMinimap.ts` | Minimap 插件核心：渲染、滑块、拖拽、diff 颜色 |
| `DiffViewer.tsx` | Diff 视图组件：内联/并排模式、MergeView 创建、滚动同步 |
| `ChangesPanel.tsx` | 变更面板：minimapModel 传递、折叠控制 |
| `FilesPanel.tsx` | 文件面板：minimapModel 传递 |
| `changePreviewDiffRanges.ts` | diff 范围计算：minimap model 生成 |
| `cmTheme.ts` | 编辑器主题：diff 颜色 CSS 变量 |
| `regions.css` | 布局样式：minimap 定位、diff viewer 布局 |
| `themes.css` | 主题变量：minimap diff 颜色、editor diff 颜色 |

### 已识别的根因

**问题 1：Minimap 容器位置动态变化**
- CSS `.adl-tool-editor__surface > .adl-cm-minimap` 使用 `position: absolute; right: 0`，理论上应固定在右侧
- 但在并排模式下，MergeView 创建的 DOM 结构可能导致 `attachToHost()` 中的 `closest(".adl-tool-editor__surface")` 找不到正确的宿主，minimap 可能被附加到编辑器 DOM 内部而非 surface
- 即使附加到 surface，并排模式下 minimap 覆盖整个 diff 区域，但 `--adl-editor-minimap-width` 变量只设置在 surface 上，左侧编辑器的 scroller 也有 `padding-right`，导致布局偏移
- 缺少 `adl-cm-scroller--minimap-scrollbar` 的 CSS 规则（类被添加但无对应样式），原生滚动条未被隐藏

**问题 2：Minimap 受折叠行影响**
- `render()` 方法在有 diff model 时使用 `diffModel.totalLines`，这是基于完整文件计算的，理论上正确
- 但滑块位置 `updateSlider()` 使用 `scrollDOM.scrollTop/scrollHeight/clientHeight`，这些值受折叠状态影响——折叠行时 scrollHeight 减小，滑块位置对应的是折叠后的视口而非完整文档
- `expandCollapsedLines()` 在拖拽/点击时才展开，但 minimap 渲染本身没有独立于折叠状态

**问题 3：Minimap 变更颜色与编辑器不一致**
- 编辑器使用 `--editor-diff-insert-bg`（暗色：`rgba(74,222,128,0.14)`）和 `--editor-diff-remove-bg`（暗色：`rgba(248,113,113,0.14)`）
- Minimap 使用 `--minimap-diff-insert-bg`（暗色：`rgba(74,222,128,0.35)`）和 `--minimap-diff-remove-bg`（暗色：`rgba(248,113,113,0.35)`）
- 色调一致但透明度不同，这是为了小缩略图的可视性——**这本身不是 bug**
- 真正的问题：minimap 的 diff 范围来自 `computePreviewDiffMinimapModel()`，而编辑器的 diff 高亮来自 `@codemirror/merge` 的内置算法，两者可能使用不同的 diff 算法或行映射，导致同一行在 minimap 和编辑器中显示不同的变更类型
- `minimapHunksToDiffModel()` 将 `AgentHunkDecoration` 的 `changeKind: "modified"` 映射为同时包含 insert+delete（tone: "strong"），而编辑器中 modified 行可能只显示为 `.cm-changedLine`（单一颜色），颜色语义不对应

**问题 4：并排模式下滑块不可拖拽、正文不可滚轮滚动**
- Minimap 的 `handleSliderPointerDown` 和 `handleCanvasPointerDown` 使用 pointer events，在并排模式下事件可能被 MergeView 的 DOM 结构拦截
- `scrollToPointer()` 设置 `scrollDOM.scrollTop`，在并排模式下 editor "b" 的 scrollDOM 可能与预期不同
- 鼠标滚轮：minimap 的 `handleWheel` 转发 deltaY 到 scrollDOM，但并排模式下 MergeView 的滚动同步可能与此冲突
- 正文区域滚轮：`.cm-scroller` 有 `overflow-y: auto !important` 和 `scrollbar-width: none`，但缺少 `adl-cm-scroller--minimap-scrollbar` 的 CSS 规则来正确隐藏原生滚动条，可能导致滚动行为异常

### 额外发现的缺陷

1. **`adl-cm-scroller--minimap-scrollbar` CSS 缺失**：`cmMinimap.ts` 中添加了该类名，但 CSS 中无对应规则，原生滚动条未被隐藏
2. **并排模式左侧编辑器 scroller 的 padding-right**：CSS `.adl-cm-diff-viewer--side-by-side .cm-mergeViewEditors > .cm-editor:first-child .cm-scroller` 设置 `padding-right: 0`，但右侧编辑器的 scroller 仍有 `padding-right: var(--adl-editor-minimap-width)`，这导致右侧编辑器内容区域变窄，minimap 覆盖在右侧编辑器上方而非整个 diff 区域的右边缘
3. **minimap 在并排模式下应展示合并 diff 视图**：当前并排模式的 minimap 只附加到 editor "b"，只显示修改后内容；应改为展示原始+修改后的合并 diff 视图（红色删除+绿色插入）

## 修改方案

### 1. Minimap 容器固定定位（问题 1）

**文件**: `regions.css`, `cmMinimap.ts`

**CSS 修改**:
- 确保 `.adl-tool-editor__surface > .adl-cm-minimap` 始终 `position: absolute; right: 0; top: 0; bottom: 0;`，不受任何父容器布局影响
- 添加 `.adl-cm-diff-viewer--side-by-side .cm-mergeViewEditors > .cm-editor .cm-scroller` 的 `padding-right: 0` 规则，在并排模式下两个编辑器的 scroller 都不需要为 minimap 留空间（minimap 定位在 surface 层级）
- 添加 `.adl-cm-scroller--minimap-scrollbar` CSS 规则，隐藏原生滚动条

**cmMinimap.ts 修改**:
- 在 `attachToHost()` 中增加防御性检查，确保 minimap 始终附加到 `.adl-tool-editor__surface`
- 如果 `closest()` 未找到 surface，使用递归向上查找而非直接 fallback 到 `view.dom`
- 在并排模式下，确保 `--adl-editor-minimap-width` 变量正确设置在 surface 上

### 2. Minimap 始终显示完整文件内容（问题 2）

**文件**: `cmMinimap.ts`

**核心修改**:
- Minimap 的 `render()` 方法始终基于完整文档行数渲染，不受折叠状态影响
- 当有 diff model 时，使用 `diffModel.totalLines` 和 `diffModel.ranges`（这已经是基于完整文件计算的）
- 当无 diff model 时，使用 `this.view.state.doc.lines`（这也是完整文档行数）
- **滑块位置计算修改**：`updateSlider()` 需要基于"完整文档的虚拟滚动位置"而非"折叠后的实际滚动位置"来计算滑块位置
  - 方案：在 minimap 内部维护一个"虚拟 scrollHeight"概念，基于完整文档行数计算，而非依赖 `scrollDOM.scrollHeight`（后者受折叠影响）
  - 滑块的 top 和 height 基于虚拟 scrollHeight 计算
  - 拖拽滑块时，将虚拟位置映射回实际 scrollTop

**具体实现**:
- 新增 `computeMinimapSliderMetricsForFullDoc()` 函数，接收完整文档行数、当前视口起始行、视口可见行数、容器高度等参数，计算滑块位置
- 在 `updateSlider()` 中，获取当前视口的首尾行号（通过 `this.view.viewport`），基于完整文档行数计算滑块位置
- 在 `scrollToPointer()` 中，将 minimap 上的指针位置映射为编辑器的目标行号，再通过 `EditorView.scrollIntoView()` 滚动到目标位置

### 3. Minimap 变更颜色与编辑器一致（问题 3）

**文件**: `cmMinimap.ts`, `DiffViewer.tsx`, `ChangesPanel.tsx`, `FilesPanel.tsx`

**核心修改**:
- 统一 minimap 和编辑器的 diff 数据源：不再独立计算 minimap diff model，而是从 MergeView 的实际 diff 信息中提取
- 对于内联模式：从 `unifiedMergeView` 的变更数据中提取行范围
- 对于并排模式：从 MergeView 的变更 chunks 中提取行范围
- 确保颜色映射一致：
  - 编辑器中 `.cm-insertedLine` → minimap 中 insert 类型（绿色）
  - 编辑器中 `.cm-deletedLine` → minimap 中 delete 类型（红色）
  - 编辑器中 `.cm-changedLine` → minimap 中同时标记 insert+delete（绿色+红色叠加）

**具体实现**:
- 在 `DiffViewer.tsx` 中，MergeView 创建后，提取实际的 diff chunks 并转换为 `CmMinimapDiffModel`
- 使用 MergeView 的 `chunks()` API 获取变更区域
- 将 chunks 转换为 minimap 的 diff ranges，确保行号与编辑器显示一致
- 在 `cmMinimap.ts` 的 `getSegmentColor()` 中，确保颜色读取自与编辑器相同的 CSS 变量体系（但使用 minimap 专用的高透明度版本）

### 4. 并排模式滚动和拖拽修复（问题 4）

**文件**: `cmMinimap.ts`, `DiffViewer.tsx`, `regions.css`

**Minimap 拖拽修复**:
- 确保 `handleSliderPointerDown` 和 `handleCanvasPointerDown` 的 pointer events 在并排模式下正确绑定
- 检查 `setPointerCapture` 是否在正确的元素上调用
- `scrollToPointer()` 需要正确获取并排模式下的 scrollDOM

**正文滚轮滚动修复**:
- 添加缺失的 `.adl-cm-scroller--minimap-scrollbar` CSS 规则
- 确保并排模式下两个编辑器的 scroller 都支持鼠标滚轮
- 检查 MergeView 的滚动同步是否阻止了滚轮事件的默认行为

**具体实现**:
- 在 `regions.css` 中添加：
  ```css
  .adl-cm-scroller--minimap-scrollbar::-webkit-scrollbar {
    width: 0;
    height: 0;
  }
  .adl-cm-scroller--minimap-scrollbar {
    scrollbar-width: none;
  }
  ```
- 在 `DiffViewer.tsx` 中，确保并排模式的滚动同步不会阻止滚轮事件传播
- 在 `cmMinimap.ts` 中，确保 `handleWheel` 正确转发滚轮事件到 editor "b" 的 scrollDOM

### 5. 并排模式 Minimap 合并 diff 视图（额外改进）

**文件**: `DiffViewer.tsx`, `cmMinimap.ts`

**核心修改**:
- 在并排模式下，minimap 应展示原始+修改后内容的合并视图
- 使用 `computePreviewDiffMinimapModel()` 计算合并 diff model（已有此函数）
- 将合并 diff model 传递给 minimap 插件
- Minimap 渲染时，删除行用红色、插入行用绿色，与内联模式表现一致

**具体实现**:
- 在 `SideBySideDiffViewer` 中，使用 `computePreviewDiffMinimapModel()` 计算 minimap model
- 通过 `updateMinimapDiffModel()` 将 model 传递给 editor "b" 的 minimap 插件
- 确保 minimap 的 `render()` 方法正确处理合并 diff model 的渲染

### 6. Minimap 滑块初始定位到变更区域（用户需求 2 补充）

**文件**: `DiffViewer.tsx`, `ChangesPanel.tsx`

**核心修改**:
- 当打开变更文件时，编辑器会自动滚动到第一个变更区域
- Minimap 的滑块应同步定位到对应的变更区域
- 这需要确保滑块位置计算基于完整文档，且在编辑器滚动到变更区域后更新

**具体实现**:
- 在 DiffViewer mount 后，监听编辑器的滚动事件
- 当编辑器滚动到变更区域时，minimap 的 `handleEditorScroll` 会自动更新滑块位置
- 确保初始滚动到变更区域的事件能触发滑块更新

## 实施步骤

### Step 1: CSS 修复（regions.css）
1. 添加 `.adl-cm-scroller--minimap-scrollbar` 规则
2. 修复并排模式下 scroller padding-right
3. 确保 minimap 定位样式健壮

### Step 2: Minimap 容器定位修复（cmMinimap.ts）
1. 增强 `attachToHost()` 的宿主查找逻辑
2. 确保并排模式下 minimap 附加到正确的宿主

### Step 3: Minimap 完整文档渲染（cmMinimap.ts）
1. 修改 `updateSlider()` 使用基于完整文档的虚拟滚动计算
2. 修改 `scrollToPointer()` 使用行号映射而非直接 scrollTop 设置
3. 确保 `render()` 始终基于完整文档行数

### Step 4: Minimap 颜色一致性（cmMinimap.ts, DiffViewer.tsx）
1. 从 MergeView 提取实际 diff chunks
2. 统一 minimap diff model 数据源
3. 确保颜色映射与编辑器一致

### Step 5: 并排模式滚动修复（cmMinimap.ts, DiffViewer.tsx）
1. 修复 minimap 拖拽在并排模式下的行为
2. 修复正文滚轮滚动
3. 确保滚动同步正常工作

### Step 6: 并排模式合并 diff 视图（DiffViewer.tsx）
1. 在 SideBySideDiffViewer 中计算合并 diff model
2. 传递给 minimap 插件
3. 验证渲染效果

### Step 7: 验证与测试
1. 运行 `npm --prefix frontend run typecheck`
2. 运行 `npm --prefix frontend test`
3. 手动验证内联/并排模式下的四个问题是否修复

## 假设与决策

| 决策 | 选择 | 理由 |
|------|------|------|
| 并排模式 minimap 覆盖范围 | 整个 diff 区域右边缘 | 用户选择"左右合并视图" |
| Minimap 折叠行为 | 始终显示全部内容 | 用户确认，且更符合 VS Code 行为 |
| Minimap 颜色透明度 | 保持高于编辑器 | 小缩略图需要更高对比度 |
| Diff 数据源 | 从 MergeView 提取 | 确保与编辑器显示一致 |
| 滑块位置计算 | 基于完整文档的虚拟滚动 | 不受折叠状态影响 |
