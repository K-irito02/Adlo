# 变更背景跳动问题修复计划

## 问题分析

### 现象
在"变更"面板的**内联**（和**并排**）模式下，正文区域的绿色（插入）/红色（删除）变更背景的**右边缘**在滚动过程中会出现跳动/抖动。无论使用的是 Minimap 滑动条还是普通滑动条，该现象均会复现。触发场景包括：普通滚动、拖拽拉伸边框线、拖拽应用程序边缘、Minimap ↔ 普通滑动条切换、自动换行切换等。

### 根本原因

当前变更背景通过 CSS 选择器 `.cm-line:has(.cm-insertedLine)` / `.cm-line:has(.cm-deletedLine)` 应用 `background-color` 到 `.cm-line` 元素上。问题出在 **`.cm-line` 宽度可变**：

- `.cm-line` 是 CodeMirror 的块级行元素，其宽度由行内文本内容决定。短行（如仅含 `}`）的 `.cm-line` 宽度远小于长行（如含长注释的代码行）
- 因此不同行的绿色/红色背景右边缘位置不同
- 当用户滚动时，不同宽度的行依次进入视口，其背景右边缘位置不断变化，造成**视觉上的"跳动"感**

### 影响范围

| 模式 | 影响 |
|------|------|
| 内联模式（inline） | ✅ 受影响的主动能 |
| 并排模式（side-by-side） | ✅ 同样受影响（各 pane 内部） |
| Minimap 模式 | ✅ 受影响 |
| 普通滑动条模式 | ✅ 受影响 |
| 拖拽边框/窗口边缘 | ✅ 会触发重排，加剧跳动 |
| 自动换行切换 | ✅ 行宽变化导致背景右边缘变化 |

---

## 设计方案

### 核心思路

**用 `box-shadow` 将 `.cm-line` 的变更背景无限向右延伸**，使所有行的背景右边缘稳定在同一位置（被 `.cm-scroller` 的 padding box 边界或 Minimap 容器裁剪），消除因行宽差异导致的跳动。

Minimap 容器和普通滑动条容器**保持现有的不透明主题色背景**（`var(--surface)` / `var(--editor-bg)`），覆盖其下方区域，不受变更背景延伸影响。

三层视觉效果：
```
┌──────────────────────────────────────────────┐
│  .cm-scroller (overflow: auto)               │
│  ┌──────────────────────────┬─────────────┐  │
│  │  .cm-content             │ padding-r    │  │
│  │  ┌────────────────────┐  │              │  │
│  │  │ .cm-line           │  │ ┌──────────┐│  │
│  │  │ background +       │  │ │ Minimap  ││  │
│  │  │ box-shadow ────────┼──┼→│ 容器     ││  │
│  │  │ 向右无限延伸        │  │ │(不透明白 ││  │
│  │  │                    │  │ │ 覆盖其上)││  │
│  │  │ 文本内容           │  │ └──────────┘│  │
│  │  └────────────────────┘  │              │  │
│  └──────────────────────────┴─────────────┘  │
└──────────────────────────────────────────────┘
```

关键点：
- `.cm-line` 的 `box-shadow` 向右延伸，使短行和长行的背景右边缘视觉上一致
- Minimap/滚动条容器**保持不透明**，覆盖在延伸的背景之上
- 正文内容不受影响（padding-right 仍在保护文本区域）

### 方案细节

#### 步骤 1：用 `box-shadow` 扩展 `.cm-line` 背景

**文件**：`ai-digital-life/frontend/src/styles/regions.css`

**修改位置**：L4647-4653 的 `.cm-line:has(...)` 规则

**当前代码**：
```css
.adl-cm-diff-viewer .cm-line:has(.cm-insertedLine) {
  background-color: var(--editor-diff-insert-bg) !important;
}

.adl-cm-diff-viewer .cm-line:has(.cm-deletedLine) {
  background-color: var(--editor-diff-remove-bg) !important;
}
```

**修改为**：
```css
.adl-cm-diff-viewer .cm-line:has(.cm-insertedLine) {
  background-color: var(--editor-diff-insert-bg) !important;
  box-shadow: 500px 0 0 0 var(--editor-diff-insert-bg);
}

.adl-cm-diff-viewer .cm-line:has(.cm-deletedLine) {
  background-color: var(--editor-diff-remove-bg) !important;
  box-shadow: 500px 0 0 0 var(--editor-diff-remove-bg);
}
```

**原理**：`box-shadow` 不影响元素布局（不改变盒模型尺寸），但视觉上将同色背景向右延伸 500px。由于 `.cm-scroller` 的 `overflow: auto` 裁剪边界在 padding box 处，而 `padding-right` 区域在 padding box 之内，box-shadow 可延伸到 padding 区域。Minimap/滚动条容器以不透明背景覆盖在该区域之上，变更背景的右边缘始终被同一裁剪边界截断，不会跳动。

500px 远大于 Minimap 宽度（60-100px），确保在任何窗口尺寸下都能覆盖。

**为什么不用其他方案**：
- ❌ `width: 100%` 或 `min-width`：会破坏 CodeMirror 的行内布局
- ❌ `::after` 伪元素：CodeMirror 可能使用伪元素，冲突风险高
- ❌ JS 动态计算并注入背景层：复杂度高，性能开销大
- ✅ `box-shadow`：纯 CSS，零布局影响，性能优秀

#### 步骤 2：并排模式兼容

**文件**：`ai-digital-life/frontend/src/styles/regions.css`

并排模式下各 pane 的 `.cm-scroller` 设置了 `padding-right: 0`（L4789-4792），因为 Minimap 挂载在 merge view 容器层级。但各 pane 内部 `.cm-line` 宽度仍可变，需要同样应用 box-shadow。

在当前选择器 `.adl-cm-diff-viewer .cm-line:has(...)` 的基础上，并排模式的行已自动匹配（`.adl-cm-diff-viewer--side-by-side` 是 `.adl-cm-diff-viewer` 的子类）。但由于并排模式下 padding-right 为 0，box-shadow 延伸后会被 `.cm-scroller` 的 content box 边界裁剪（无 padding 区域可延伸），但这不影响核心目标——**统一背景右边缘**，因为在同一个 pane 内所有 `.cm-line` 的背景右边缘都会被同一裁剪边界截断。

验证：`.adl-cm-diff-viewer .cm-line:has(...)` 选择器已同时覆盖内联和并排模式，无需额外添加选择器。✅

#### 步骤 3：Minimap / 滚动条容器背景保持不变

**文件**：`ai-digital-life/frontend/src/styles/regions.css`

Minimap 和普通滚动条容器的背景**不做修改**，保持现有样式：

```css
/* Minimap 模式 - 保持不变 */
.adl-cm-minimap {
  background: var(--surface);        /* 不透明，覆盖变更背景 */
  /* ... 其他样式不变 ... */
}

/* 普通滚动条模式 - 保持不变 */
.adl-cm-minimap--standard {
  background: var(--editor-bg);      /* 不透明，覆盖变更背景 */
  /* ... 其他样式不变 ... */
}
```

这确保了：
- Minimap Canvas 的结构线和 diff 色块在熟悉的背景上渲染
- 普通滚动条的滑块在熟悉的背景上显示
- 变更背景不会透出到 Minimap/滚动条区域

#### 步骤 4：`box-shadow` 裁剪边界确认

当前 `.cm-scroller` 样式：
```css
overflow-x: auto;
overflow-y: auto !important;
```

CSS 规范规定 `overflow: auto` 的裁剪边界在 **padding box**（而非 content box）。这意味着 `padding-right` 区域在裁剪边界之内，box-shadow 可以延伸到 padding 区域。✅ 确认无问题。

#### 步骤 5：暗色主题兼容

暗色主题下 `--editor-diff-insert-bg` 和 `--editor-diff-remove-bg` 使用不同的 rgba 值：

| 变量 | 亮色主题 | 暗色主题 |
|------|----------|----------|
| `--editor-diff-insert-bg` | `rgba(34, 197, 94, 0.12)` | `rgba(74, 222, 128, 0.12)` |
| `--editor-diff-remove-bg` | `rgba(239, 68, 68, 0.12)` | `rgba(248, 113, 113, 0.12)` |

`box-shadow` 通过 CSS 变量引用，自动适配暗色主题。无需额外处理。✅

---

## 修改文件清单

| 文件 | 修改内容 | 影响行 |
|------|----------|--------|
| `frontend/src/styles/regions.css` | `.cm-line:has(...)` 添加 `box-shadow` | L4647-4653 |

**仅修改一个文件的两处 CSS 规则**，变更范围极小，风险可控。

---

## 测试验证清单

| # | 测试项 | 验证内容 |
|---|--------|----------|
| 1 | 内联模式滚动 | 绿色/红色背景右边缘不再跳动，所有行的背景右边缘对齐一致 |
| 2 | 并排模式滚动 | 两侧 pane 内背景右边缘稳定 |
| 3 | Minimap → 普通滑动条切换 | 切换过程背景无跳动，始终稳定 |
| 4 | 拖拽窗口边缘 | 窗口大小变化时背景无跳动 |
| 5 | 拖拽 resizer 边框线 | 并排模式面板宽度变化时背景无跳动 |
| 6 | 自动换行切换 | 切换前后背景连续性，无跳动 |
| 7 | 暗色主题 | 暗色主题下 box-shadow 颜色正确 |
| 8 | 亮色主题 | 亮色主题下 box-shadow 颜色正确 |
| 9 | Minimap Canvas 正常显示 | Canvas 结构线和 diff 色块清晰可见，无异常 |
| 10 | 滑块交互正常 | Minimap 滑块和普通滑块均可正常拖拽和点击 |
| 11 | 文本内容不被覆盖 | 正文行内容仍在 content 区域内，不被 Minimap 遮挡 |
| 12 | 并排模式同步滚动 | 两侧 pane 同步滚动正常，背景无异常 |

---

## 风险评估

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|----------|
| box-shadow 渲染性能 | 低 | 低 | CodeMirror 虚拟化只渲染可见行（通常 30-60 行），实际 box-shadow 元素数极少 |
| 极端长行（>500px 宽度）box-shadow 不足 | 极低 | 低 | 500px 覆盖约 60+ 字符（等宽字体），远超典型代码行长度。如需可增至 1000px |
| 并排模式 pane 极窄时背景延伸过度 | 低 | 低 | 并排模式 padding-right=0，box-shadow 被 content box 裁剪，视觉上等同于 `background-color` |
| Safari/旧浏览器 box-shadow 裁剪行为差异 | 低 | 低 | 500px 远超 padding-right，有充足余量 |