# 变更面板内联 Diff Minimap 滑动条优化计划

## 问题描述

在"变更"标签页的"内联"模式下，存在两个问题：

1. **普通滑动条右侧有很宽的空区域** — 滚动条右侧存在不必要的空白
2. **Minimap 不显示缩略图内容、不支持滑动** — 缩略图区域为空白，且无法交互

参考："文件"标签页的标准编辑器 Minimap 功能正常工作。

## 根因分析

### 关键差异对比

| 特性 | 文件面板（正常） | 变更面板内联 Diff（异常） |
|------|-----------------|--------------------------|
| 组件 | `<Editor>` / `<DiffEditor>` | `<DiffEditor>` |
| `useTrueInlineView` | ❌ 未使用 | ✅ `true` |
| `renderOverviewRuler` | 未设置（默认） | `false` |
| CSS 选择器 | `.adl-tool-editor:not(--changes) .monaco-editor .minimap` | `.adl-tool-editor--changes .editor.modified .minimap` |
| 原始编辑器 | 正常显示 | `width: 0; overflow: hidden` 隐藏 |
| Minimap 内容 | ✅ 正常渲染 | ❌ 不渲染 |

### 最可能的根因

1. **`experimental: { useTrueInlineView: true }`** — 此实验性选项改变了 Monaco 内联 Diff 的 DOM 结构，可能导致 CSS 选择器 `.editor.modified .minimap` 无法匹配到实际的 minimap 元素，从而使 minimap 无法正常渲染和交互。

2. **CSS `filter: drop-shadow(...)`** — 应用于 minimap 容器的 `filter` 属性可能干扰 canvas 元素的渲染，特别是在 Diff 编辑器上下文中。

3. **滚动条与 minimap 定位不一致** — CSS 将 scrollbar 定位在 `right: 0`，minimap 定位在 `right: 12px`，但 Monaco 内部布局引擎可能未正确计算此自定义定位，导致内容区域与滚动条/minimap 之间出现空白。

## 实施步骤

### 步骤 1：启动应用并检查 DOM 结构

- 启动开发服务器 `npm run dev`
- 在变更面板的内联 Diff 中检查 DOM 结构
- 对比文件面板标准编辑器的 DOM 结构
- 确认 `useTrueInlineView: true` 是否改变了 minimap 相关的 DOM 层级
- 确认 minimap canvas 元素是否存在及其尺寸

### 步骤 2：修复 ChangesPanel.tsx 的 Monaco 选项

**文件**: `ai-digital-life/frontend/src/app/regions/right-panel/ChangesPanel.tsx`

- 移除 `experimental: { useTrueInlineView: true }` — 这是导致 minimap 不工作的最可能原因。移除后，Monaco 将使用标准的内联 Diff 渲染模式，该模式与文件面板的 DiffEditor 一致，minimap 应能正常工作。
- 评估是否需要调整 `renderOverviewRuler` — 当前设为 `false`，如果移除后 minimap 仍不工作，尝试设为默认值或移除此选项。

### 步骤 3：修复 regions.css 的 Minimap 样式

**文件**: `ai-digital-life/frontend/src/styles/regions.css`

针对变更面板内联 Diff 的 minimap CSS（第 4079-4141 行），进行以下调整：

1. **移除 `filter: drop-shadow(...)`** — 此属性可能干扰 canvas 渲染。改用 `box-shadow` 实现阴影效果（`box-shadow` 不影响 canvas 渲染）。

2. **确保 CSS 选择器匹配实际 DOM** — 如果移除 `useTrueInlineView` 后 DOM 结构恢复为标准的 `.editor.modified` 层级，现有选择器应能正常匹配。否则需要调整选择器。

3. **修复滚动条空白区域** — 调整 scrollbar 和 minimap 的定位，确保：
   - scrollbar 紧贴右侧边缘，不产生空白
   - minimap 与 scrollbar 正确对齐
   - 内容区域正确延伸到 minimap 左侧

4. **确保 minimap-slider 可交互** — 验证 minimap-slider 的样式不会阻止鼠标事件。

### 步骤 4：验证 Minimap 功能

- 在变更面板的内联 Diff 中验证：
  - ✅ Minimap 显示代码缩略图内容
  - ✅ Minimap slider 可见且高度合理
  - ✅ 点击 minimap 可跳转到对应位置
  - ✅ 拖动 minimap slider 可滚动编辑器
  - ✅ 滚动条右侧无多余空白
  - ✅ 深色/浅色主题下阴影效果正常

### 步骤 5：更新测试

**文件**:
- `ai-digital-life/frontend/src/app/regions/right-panel/changesEditorOptions.test.ts`
- `ai-digital-life/frontend/src/app/regions/right-panel/changesEditorSpacing.test.ts`

- 如果移除了 `useTrueInlineView`，更新 `changesEditorOptions.test.ts` 确保不再断言该选项
- 如果修改了 CSS（移除 `filter`、调整定位等），更新 `changesEditorSpacing.test.ts` 中的断言
- 确保所有测试通过

### 步骤 6：运行完整测试套件

```bash
npm run typecheck -w @ai-digital-life/desktop
npx vitest run
```

确保类型检查和所有单元测试通过。

## 风险评估

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| 移除 `useTrueInlineView` 可能影响内联 Diff 渲染质量 | 中 | 对比移除前后的渲染效果，如果质量下降，寻找替代方案 |
| CSS 修改可能影响其他面板 | 低 | CSS 选择器已通过 `.adl-tool-editor--changes` 限定范围 |
| `filter` 移除可能影响视觉效果 | 低 | 使用 `box-shadow` 替代，保持相似的视觉效果 |

## 涉及文件

| 文件 | 变更类型 |
|------|----------|
| `frontend/src/app/regions/right-panel/ChangesPanel.tsx` | 修改 Monaco 选项 |
| `frontend/src/styles/regions.css` | 修改 minimap/scrollbar CSS |
| `frontend/src/app/regions/right-panel/changesEditorOptions.test.ts` | 更新测试断言 |
| `frontend/src/app/regions/right-panel/changesEditorSpacing.test.ts` | 更新测试断言 |
