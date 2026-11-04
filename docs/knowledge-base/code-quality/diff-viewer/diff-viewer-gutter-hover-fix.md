# Diff Viewer Gutter Hover 修复经验汇编

变更查看器（Diff Viewer）行号区（Gutter）悬停/点击高亮同步的两轮修复经验：首轮实现同步 overlay 方案（2026-06-06），次轮修复并排模式 A/B 侧背景色判断的 DOM 类归属根因（2026-06-08）。

## 2026-06-06：Gutter 悬停效果同步修复

### 问题概述

修复变更查看器中行号区域（Gutter）与内容显示区域悬停/点击效果的对齐问题。

### 解决的问题清单

1. **变更竖线位置问题**：变更指示器竖线原本在行号数字右侧 → 绝对定位将 `cm-changeGutter` 移到最左侧，调整其他 gutter 偏移 → 变更竖线显示在最左侧边缘
2. **变更行背景颜色显示问题**：行号区域未显示与内容区域一致的红/绿变更背景 → 为变更行 gutter 元素添加基础透明度背景（10%），悬停/点击时加深到 35% → 行号区域与内容区域视觉一致
3. **点击行时行号区域缺口问题**：点击行后变更竖线位置出现视觉缺口 → `cm-activeLineGutter` 向左延伸 3px（`margin-left: -3px; padding-left: 3px;`）→ 缺口消除
4. **鼠标悬停内容行时行号区域未同步高亮问题**：多次尝试（`:has()` CSS 选择器不可靠 → 临时 class 仍有问题 → JavaScript overlay 覆盖层）→ 最终使用 `gutterHoverSync` 扩展在 gutters 容器上创建绝对定位 overlay → 悬停时完整覆盖整个 gutter 宽度，无缺口
5. **普通行悬停时行号区域无灰色背景问题**：未变更行悬停时行号区域没有背景色 → overlay 方案中根据行类型选择正确背景色 → 普通行灰色、变更行红/绿

### 核心技术实现

关键文件：

| 文件 | 功能 |
|------|------|
| `adlo/frontend/src/app/features/editor/gutterHoverSync.ts` | 悬停同步扩展核心实现 |
| `adlo/frontend/src/styles/regions/rightpanel/diff-viewer.css` | 变更查看器样式 |

GutterHoverSync 扩展架构：

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

关键技术点：

1. 垂直重叠检测：`getBoundingClientRect()` 实现精确的行匹配
2. 绝对定位 overlay：解决多个分离 gutter 元素对齐问题
3. 高 z-index (25)：确保覆盖所有 gutter 元素
4. 背景色判断：普通行 `--editor-hover-bg`；并排 A 侧（删除）`rgba(239, 68, 68, 0.35)`；并排 B 侧（插入）`rgba(34, 197, 94, 0.35)`；内联模式按上下文判断

### 经验教训

1. 不要过度依赖 CSS `:has()` 选择器：复杂 DOM 结构中难以维护且可能有跨浏览器兼容性问题，JavaScript 事件处理更可靠
2. 多个相邻元素需同步高亮时用 Overlay 方案：分别修改每个元素样式易产生对齐问题与视觉缺口；创建覆盖层元素一次性覆盖整个宽度
3. 先理解现有架构再修改：本次未充分理解 `cm-changeGutter` 的绝对定位实现，应先通过 DevTools 完全理解 DOM 结构
4. 增量验证、及时回退：多次尝试失败后保留每次中间结果，用 Git 或本地备份，每个小改动后立即验证
5. 复用已有工作组件：增强现有 `gutterHoverSync.ts` 而非重写，保持代码一致性

### 最终效果验证

✅ 变更竖线显示在最左侧 ✅ 变更行行号区基础红/绿背景（10%） ✅ 悬停内容行时行号区同步加深到 35% ✅ 悬停行号区变更行背景加深 ✅ 点击变更行行号区加深 ✅ 普通行悬停显示灰色背景 ✅ 无视觉缺口、从左到右完整覆盖 ✅ 并排/内联模式均正常

## 2026-06-08：并排模式 A/B 侧 Gutter 背景色根因修复

### 问题概述

并排模式下，鼠标悬停在左侧（A 侧/删除）红色变更行的**内容区域**时，行号区（gutter）错误地显示为绿色背景，而非红色。

### 根因

`gutterHoverSync.ts` 判断当前编辑器是 A 侧（删除）还是 B 侧（插入）的逻辑使用了错误的 DOM 祖先。`@codemirror/merge` 通过 `EditorView.editorAttributes.of({ class: "cm-merge-a" })` 添加类，即类在 **`.cm-editor`** 元素上，**不在** `.cm-mergeViewEditor` 上。

| 版本 | 代码 | 检查的 DOM 元素 | 结果 |
|------|------|-----------------|------|
| 原代码 | `mergeViewEditor.parentElement.classList.contains('cm-merge-a')` | `.cm-mergeViewEditors` | ❌ 永为 false |
| 第一次修复 | `mergeViewEditor.classList.contains('cm-merge-a')` | `.cm-mergeViewEditor` | ❌ 永为 false |
| **最终修复** | **`editor.classList.contains('cm-merge-a')`** | **`.cm-editor`** | ✅ 正确 |

两次修复失败的原因：第一次只改了 `parentElement` 访问，未验证 `.cm-merge-a` 到底在哪个元素上，而是通过 CSS 选择器 `.cm-merge-a .cm-changedLineGutter` 错误推断类在 `.cm-mergeViewEditor` 上。

### 经验教训

1. **CSS 选择器不能推断 DOM 结构**：`.cm-merge-a .cm-changedLineGutter` 只要求 `.cm-merge-a` 是后代祖先，不指定层级；必须查阅库源代码或通过 DevTools 验证真实 DOM 类归属
2. **验证第三方库的 DOM 类添加方式**：`EditorView.editorAttributes` 是 CodeMirror 6 特有 API，不同于常规 `className` 赋值；最佳实践是在 `node_modules` 中搜索目标类名（如 `cm-merge-a`）确认添加方式
3. **修改后验证的内容不能变**：修复假设错误时"测试通过"无意义，需手动在浏览器验证实际效果或通过代码审查确认逻辑正确性

### 涉及文件

| 文件 | 变更 |
|------|------|
| `frontend/src/app/features/editor/gutterHoverSync.ts` | 第 87-91 行：`mergeViewEditor.parentElement?.classList.contains('cm-merge-a')` → `editor.classList.contains('cm-merge-a')` |
