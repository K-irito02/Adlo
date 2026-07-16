# 差异查看器主题与折叠修复经验

## 背景

本次修复涉及变更面板差异查看器的两个问题：
1. 删除行背景色太浅、不可见
2. "无变更行"没有默认自动折叠

## 问题 1：删除行背景色不可见

### 根因分析

**问题 1A：CSS 选择器覆盖不足**

CM6 merge 扩展在不同模式下使用不同的 CSS 类标记变更行：

| 模式 | 标记类 | 问题 |
|------|--------|------|
| 内联模式 `.cm-deletedChunk` | 块级容器 | 容器内 `.cm-line` 可能没有 `.cm-deletedLine` 标记 |
| 侧边对比 A 侧 | `.cm-changedLine`（非 `.cm-deletedLine`） | 原选择器 `:has(.cm-deletedLine)` 匹配不上 |

原 CSS 仅用了 `.cm-line:has(.cm-deletedLine)`，导致侧边对比模式 A 侧和部分内联删除块的行未获得红色背景。

**问题 1B：硬编码值覆盖了主题变量**

- 块级背景使用硬编码 `rgba(239,68,68,0.05)`（5% 透明度），未使用 CSS 变量
- 内联 `.cm-deletedChunk` 使用灰色 `rgba(128,128,128,0.05)` 而非红色
- Gutter 使用硬编码 `rgba(239,68,68,0.10)`（10% 透明度）

**问题 1C：暗色主题透明度太低**

暗色主题 `--editor-diff-remove-bg` 仅 12%，视觉上几乎不可见。

### 修复方案

**修复 1：补全 CSS 选择器**

```css
/* 同时匹配三种删除行场景 */
.adl-cm-diff-viewer .cm-line:has(.cm-deletedLine),
.adl-cm-diff-viewer .cm-line:has(.cm-changedLine),
.adl-cm-diff-viewer--inline .cm-deletedChunk .cm-line {
  background-color: var(--editor-diff-remove-bg) !important;
}
```

**修复 2：块级背景使用主题变量**

- `rgba(239,68,68,0.05)` → `var(--editor-diff-remove-bg)`
- `rgba(128,128,128,0.05)` → `var(--editor-diff-remove-bg)`
- `rgba(34,197,94,0.05)` → `var(--editor-diff-insert-bg)`

**修复 3：新增 gutter 专用变量**

新增 `--editor-diff-remove-gutter-bg` / `--editor-diff-insert-gutter-bg`，确保内容区背景比行号区背景淡，形成清晰视觉层级：

| 层级 | 亮色主题 | 暗色主题 |
|------|---------|---------|
| 行号区 | 28% | 30% |
| 内容区 | 18% | 20% |
| 悬停/激活 | 35% | 35% |

### 教训

1. **CM6 merge 的 DOM 结构复杂**：侧边对比 A 侧用 `.cm-changedLine`，内联删除块用 `.cm-deletedChunk`，不要假设只有一种标记类
2. **CSS 变量 > 硬编码**：任何与主题相关的颜色值必须通过 CSS 变量定义，避免在具体 CSS 规则中硬编码 rgba
3. **内容区 < 行号区透明度**：内容区背景比行号区稍淡，可避免删除行背景喧宾夺主
4. **不同主题需独立调校**：暗色主题相同透明度下视觉更淡，需要更高透明度值

## 问题 2：无变更行未自动折叠

### 根因分析

`collapseUnchanged` 功能已完全实现（`COLLAPSE_UNCHANGED_CONFIG = { margin: 3, minSize: 4 }`），但三个消费者全部硬编码为 `false`：

- `ChangesPanel.tsx` 补丁文件差异查看器
- `ChangesPanel.tsx` 变更概览差异查看器
- `EditorSurfaceShell.tsx` 编辑器文件补丁查看器

### 修复

全部改为 `collapseUnchanged={true}`。

### 教训

1. **功能已实现但未启用**：检查功能启用状态时，不仅要看组件本身的默认值，还要看所有消费者的传入值
2. **折叠与导航的配合**：大纲导航通过 `uncollapseUnchanged` StateEffect 展开折叠区域。注意该 effect 接收文档**位置（offset）**而非行号，且必须传入折叠区域**首行的位置**而非目标行的位置。详见 [outline-navigation-and-refresh-fix-2026-06-09.md](../交互优化/outline-navigation-and-refresh-fix-2026-06-09.md)。
3. **折叠配置的权衡**：`margin: 3` 保留 3 行上下文，`minSize: 4` 跳过短区域，确保折叠不至于丢失必要的上下文信息

## 涉及文件

| 文件 | 变更 |
|------|------|
| `frontend/src/styles/themes.css` | 调整 `--editor-diff-remove-bg` 透明度值；新增 `--editor-diff-*-gutter-bg` 变量 |
| `frontend/src/styles/regions/rightpanel/diff-viewer.css` | 修复 CSS 选择器；硬编码值改为 CSS 变量；新增 `.cm-line:has(.cm-changedLine)` 和 `.cm-deletedChunk .cm-line` 选择器 |
| `frontend/src/app/regions/right-panel/panels/ChangesPanel.tsx` | `collapseUnchanged={false}` → `{true}`（两处） |
| `frontend/src/app/regions/right-panel/EditorSurfaceShell.tsx` | `collapseUnchanged={false}` → `{true}`（一处） |
| `frontend/src/app/regions/right-panel/changesEditorOptions.test.ts` | 更新测试断言 |
