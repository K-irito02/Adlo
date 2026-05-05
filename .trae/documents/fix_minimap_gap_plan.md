# 修复变更预览区域中红色变更背景与 minimap 之间的间隙问题

## 问题分析

在变更功能文件编辑预览区域中，红色变更背景（`.adl-inline-diff-line--delete`）与 minimap 之间存在明显间隙。

### 根本原因

从代码分析来看，当前的 CSS 样式存在以下问题：

1. **`view-overlays` 的定位问题**：虽然设置了 `width: calc(100% + 84px)`，但缺少 `position: absolute` 和 `top/bottom` 属性来确保覆盖层能够正确延伸到 minimap 区域

2. **`adl-inline-diff-line` 的定位问题**：同样缺少 `position: absolute` 和 `top/bottom` 属性，导致在某些情况下背景不能完全填充

3. **未处理的边距/内边距**：Monaco 编辑器的内部元素可能存在默认的 padding 或 margin

## 修复方案

### 修改文件

主要修改文件：`frontend/src/styles/regions.css`

### 具体修改

1. **增强 `view-overlays` 的样式**：
   - 添加 `position: absolute`
   - 添加 `top: 0` 和 `bottom: 0`
   - 确保覆盖整个编辑器高度

2. **增强 `adl-inline-diff-line` 的样式**：
   - 添加 `position: absolute`
   - 添加 `top: 0` 和 `bottom: 0`
   - 确保变更背景覆盖完整高度

3. **检查并修复 side-by-side 模式**：确保并排模式也能正确处理

## 测试计划

1. **测试场景**：
   - 文件无需横向滚动时，红色变更背景应延伸至 minimap 边缘
   - 文件需要横向滚动时，滚动至最右侧，红色变更背景应仍然延伸至 minimap 边缘
   - 插入（绿色）和删除（红色）背景都应正确显示

2. **测试方法**：
   - 运行单元测试：`npm --prefix frontend test`
   - 启动开发服务器验证视觉效果
   - 检查 `changesEditorHighlight.test.ts` 和 `changesEditorSpacing.test.ts`

## 风险评估

- **低风险**：修改仅限于 CSS 样式，不会影响功能逻辑
- **回滚策略**：如果修复引入问题，恢复原始 CSS 样式即可

## 相关文件

- `frontend/src/styles/regions.css` - 主要修改文件
- `frontend/src/app/regions/right-panel/ChangesPanel.tsx` - 变更面板组件
- `frontend/src/app/regions/right-panel/changesEditorHighlight.test.ts` - 高亮测试
- `frontend/src/app/regions/right-panel/changesEditorSpacing.test.ts` - 间距测试
