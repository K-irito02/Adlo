# Diff Viewer Gutter Hover 效果修复总结 (2026-06-06)

## 问题概述

本次修复解决了变更查看器（Diff Viewer）中行号区域（Gutter）与内容显示区域悬停/点击效果的对齐问题。

## 解决的问题清单

### 1. 变更竖线位置问题
- **问题**：变更指示器竖线原本在行号数字右侧
- **解决方案**：通过绝对定位将 `cm-changeGutter` 移到最左侧，调整其他 gutter 偏移
- **结果**：变更竖线现在显示在最左侧边缘

### 2. 变更行背景颜色显示问题
- **问题**：行号区域未显示与内容区域一致的红/绿变更背景
- **解决方案**：为变更行 gutter 元素添加基础透明度背景（10%），悬停/点击时加深到35%
- **结果**：行号区域与内容区域视觉一致

### 3. 点击行时行号区域缺口问题
- **问题**：点击行后，变更竖线位置出现视觉缺口
- **解决方案**：`cm-activeLineGutter` 向左延伸3px（`margin-left: -3px; padding-left: 3px;`）
- **结果**：缺口消除，视觉完整

### 4. 鼠标悬停内容行时行号区域未同步高亮问题
- **问题**：鼠标悬停在变更内容行上时，行号区域未显示加深背景
- **多次尝试**：
  - 尝试1：使用 `:has()` CSS 选择器（DOM结构复杂，不可靠）
  - 尝试2：给变更行 gutter 元素添加临时 class（仍有小问题）
  - 尝试3：使用 JavaScript 创建 overlay 覆盖层（最终方案）
- **最终方案**：使用 `gutterHoverSync` 扩展，在 gutters 容器上创建绝对定位的 overlay 层
- **结果**：悬停时完整覆盖整个 gutter 宽度，无缺口

### 5. 普通行悬停时行号区域无灰色背景问题
- **问题**：未变更行悬停时行号区域没有背景色
- **解决方案**：在 overlay 方案中根据行类型选择正确的背景色
- **结果**：普通行显示灰色，变更行显示红/绿色

## 核心技术实现

### 关键文件

| 文件 | 功能 |
|------|------|
| [`ai-digital-life/frontend/src/app/features/editor/gutterHoverSync.ts`](../../../ai-digital-life/frontend/src/app/features/editor/gutterHoverSync.ts) | 悬停同步扩展的核心实现 |
| [`ai-digital-life/frontend/src/styles/regions/rightpanel/diff-viewer.css`](../../../ai-digital-life/frontend/src/styles/regions/rightpanel/diff-viewer.css) | 变更查看器样式 |

### GutterHoverSync 扩展架构

```
gutterHoverSync()
├── mouseover 事件
│   ├── 找到悬停的内容行
│   ├── 判断是否为变更行
│   ├── 找到对应位置的 gutter 元素
│   ├── 创建绝对定位的 overlay
│   ├── 设置背景色（普通/变更行）
│   └── 添加到 gutters 容器
└── mouseout 事件
    └── 移除所有 overlay
```

### 关键技术点

1. **垂直重叠检测**：使用 `getBoundingClientRect()` 实现精确的行匹配
2. **绝对定位 overlay**：解决多个分离的 gutter 元素对齐问题
3. **高 z-index (25)**：确保覆盖所有 gutter 元素
4. **背景色判断逻辑**：
   - 普通行：`--editor-hover-bg`
   - 并排模式A侧（删除）：`rgba(239, 68, 68, 0.35)`
   - 并排模式B侧（插入）：`rgba(34, 197, 94, 0.35)`
   - 内联模式：根据上下文判断

## 经验教训

### 1. 不要过度依赖 CSS :has() 选择器
- **教训**：复杂的 DOM 结构中，`:has()` 选择器难以维护且可能跨浏览器兼容性问题
- **替代方案**：使用 JavaScript 事件处理更可靠

### 2. 当多个相邻元素需要同步高亮时，使用 Overlay 方案
- **教训**：分别修改每个元素的样式容易产生对齐问题和视觉缺口
- **最佳实践**：创建一个覆盖层元素，一次性覆盖整个宽度

### 3. 先理解现有架构再修改
- **教训**：本次开始时未充分理解 `cm-changeGutter` 的绝对定位实现
- **改进**：先通过浏览器开发者工具或调试脚本完全理解 DOM 结构

### 4. 增量验证，及时回退
- **教训**：多次尝试失败后，保留每次的中间结果，以便回退和对比
- **实践**：使用 Git 或本地备份，每个小改动后立即验证

### 5. 复用已有的工作组件
- **发现**：项目中已有 `gutterHoverSync.ts`，但功能较简单
- **改进**：增强现有组件而不是重写，保持代码一致性

## 最终效果验证

✅ 变更竖线显示在最左侧  
✅ 变更行在行号区域有基础红/绿背景（10%）  
✅ 鼠标悬停内容行时，行号区域同步加深到35%  
✅ 鼠标悬停行号区域变更行时，背景加深  
✅ 点击变更行时，行号区域显示加深背景  
✅ 普通行悬停时行号区域显示灰色背景  
✅ 所有效果无视觉缺口，从左到右完整覆盖  
✅ 并排模式和内联模式都正常工作  

## 相关规则参考

- [组件架构规则](../../../.agents/rules/component-architecture.md)
- [CSS 架构规则](../../../.agents/rules/css-architecture.md)
- [开发规则](../../../.agents/rules/dev-rules.md)
