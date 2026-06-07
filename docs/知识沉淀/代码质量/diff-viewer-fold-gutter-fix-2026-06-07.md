# 变更查看器折叠 Gutter 修复总结 (2026-06-07)

## 问题概述

本次修复解决了变更查看器（Diff Viewer）行号区域折叠/展开功能的完整性问题，涵盖折叠图标渲染、点击交互、Tooltip 提示、行号区域悬停高亮等模块。

## 解决的问题清单

### 1. 折叠图标点击无效 (Phase 1)

- **现象**：折叠图标正常渲染，但点击无响应
- **根因**：使用自定义 `gutter()` + `GutterMarker` 替代内置 `foldGutter()` 后，未添加 `codeFolding()` 扩展。`codeFolding()` 提供处理 `foldEffect`/`unfoldEffect` 所需的 `foldState` 状态字段，缺少它导致 `view.dispatch` 空操作
- **修复**：在 `sharedExtensions.ts` 和 `CodeEditor.tsx` 中添加 `codeFolding()` 扩展
- **文件**：`sharedExtensions.ts`, `CodeEditor.tsx`

### 2. MergeView 事件拦截 (Phase 2)

- **现象**：自定义 gutter 上的 `click`/`mousedown` 事件无法被 `EditorView.domEventHandlers` 捕获
- **根因**：MergeView 内部 gutter 处理器调用了 `stopPropagation()`，阻止事件冒泡到 `view.dom`
- **修复**：使用 `document.addEventListener('mousedown', handler, true)` 在捕获阶段拦截事件
- **经验**：MergeView 上下文中，`mouseover` 不受影响但 `mousedown`/`click` 需要捕获阶段

### 3. 未变更行无功能 (Phase 3)

- **现象**：只有变更行支持折叠，未变更行无 Tooltip 和点击效果
- **根因**：`.cm-changeGutter` 以 `position: absolute; width: 100%; height: 100%; z-index: 20` 覆盖整个 gutter 区域。对于未变更行（无子元素），鼠标事件目标为 `.cm-changeGutter` 容器本身，`closest('.cm-gutterElement')` 返回 `null`
- **修复**：新增 `getLineNumberFromEvent()` 回退到 `view.posAtCoords(event.clientX, event.clientY)` 通过坐标间接查行号
- **补充**：添加 CSS `pointer-events: none` 到 `.cm-changeGutter` 容器，让事件穿透

### 4. 灰色背景铺满整行 (Phase 3)

- **现象**：行号区域灰色背景分为左右两块（行号列、折叠列各一块）
- **修复**：用 `position: fixed` 的 `adl-gutter-hover-overlay` div 覆盖整个 `.cm-gutters` 宽度
- **经验**：`position: absolute` 在 flex 容器的 `z-index` stacking 中不可靠，`position: fixed` 脱离容器层叠上下文

### 5. Tooltip 行号不准确 (Phase 4)

- **现象**：Tooltip 提示的折叠/展开行数总是少一行（如 `}` 行不计入）
- **根因**：`foldable()` 返回的 `to` 是独占的，旧代码 `range.to - 1` 丢弃了独占行
- **修复**：直接使用 `doc.lineAt(range.to).number`，不再 `-1`
- **文件**：`FoldTooltipOverlay.tsx` 中 `computeTooltipText` 函数

### 6. 删除行异常触发折叠 (Phase 4)

- **现象**：红色删除行 gutter 区域也会显示 Tooltip 和响应点击
- **修复**：`computeTooltipFromEvent` 和 `handleGutterFold` 都检查 `target.closest('.cm-deletedLineGutter')` 后跳过

### 7. 折叠占位行误触发 (Phase 4)

- **现象**：收起无变更行的 `.cm-collapsedLines` 行（折叠占位符）也会触发 Tooltip 和折叠
- **修复**：新增 `getGutterRowAtY()` 函数检查 `.cm-foldGutter` 该行是否有 `.adl-cm-fold-marker` 图标元素，无图标则跳过

### 8. 红绿边界 Tooltip 位置偏移 (Phase 4)

- **现象**：绿色变更行上的 tooltip 显示在相邻红色行位置
- **根因**：`view.lineBlockAtHeight()` 在侧边模式下 gutter 子元素高度为 0 时，Y 坐标映射到错误行块
- **修复**：统一使用 `getGutterRowAtY()` 通过 `.cm-lineNumbers > .cm-gutterElement` 的 `getBoundingClientRect()` DOM 坐标定位

### 9. 点击折叠后灰色背景消失 (Phase 4)

- **现象**：点击折叠后 overlay 背景消失
- **修复**：改为 `requestAnimationFrame(repositionOverlay)` 通过保存的最近鼠标事件重新定位

### 10. Tooltip 在行号区域移动时延迟消失 (Phase 4)

- **现象**：鼠标从有折叠图标的行号区域移到无折叠图标的行号区域时，tooltip 延迟 150ms 才消失，感觉粘滞
- **根因**：`handleMouseMove` 中当 `computeTooltipFromEvent` 返回 null（无折叠标记行）时调用 `scheduleHide()`，该方法有 150ms 延迟，适用于 mouseleave 场景但不适用于行间切换场景
- **修复**：在 `else if (tooltipVisibleRef.current)` 分支中，直接取消 hideTimer 并立即调用 `hide()`，不再延迟
- **关键代码**：
  ```typescript
  } else if (tooltipVisibleRef.current) {
    if (hideTimerRef.current !== null) { clearTimeout(hideTimerRef.current); hideTimerRef.current = null; }
    hide();
  }
  ```
- **文件**：`FoldTooltipOverlay.tsx`

### 11. 文件面板折叠图标灰色圆背景 (Phase 4)

- **现象**：鼠标悬停在文件面板的"展开/折叠"图标按钮上时，图标背后出现圆形灰色背景。变更面板无此效果
- **根因**：CSS 规则 `box-shadow: 0 0 0 4px var(--ring-neutral)` + `border-radius: 4px` 在 `cm-overrides.css` 和 `editor-surface.css` 两个文件中**同时存在**（重复定义），首次修复只删除了 `cm-overrides.css` 的副本，漏掉了 `editor-surface.css` 中的真正生效规则
- **修复**：从两个 CSS 文件中删除该规则
- **教训**：CSS 规则可能分散在多个文件中。删除某效果时必须全局搜索确认无残留副本。`grep` 或 `ripgrep` 搜索应作为删除前的验证步骤
- **文件**：`cm-overrides.css`, `editor-surface.css`

### 12. 折叠占位符 "..." 无灰色背景 (Phase 4)

- **现象**：代码折叠后在内容区域显示的 "..." 图标按钮没有灰色背景效果
- **根因**：`.cm-foldPlaceholder` 的背景色由 `cmTheme.ts` 通过 CSS 变量 `--editor-fold-placeholder` 设置（暗色 `rgba(255,255,255,0.1)` / 亮色 `rgba(0,0,0,0.08)`），过于透明几乎不可见，且无 hover 样式
- **修复**：在 `cm-overrides.css` 中用 `--editor-hover-bg` 覆盖背景色，并改为常驻显示（不依赖 hover）：
  ```css
  .adl-cm-editor .cm-foldPlaceholder {
    background-color: var(--editor-hover-bg) !important;
    cursor: pointer;
  }
  ```
- **注意**：使用 `!important` 是因为 `cmTheme.ts` 通过 CodeMirror EditorTheme 设置的样式优先级高于纯 CSS，必须用 `!important` 覆盖
- **文件**：`cm-overrides.css`

## 核心技术架构

```
FoldTooltipOverlay 组件
├── 事件层 (effect hook)
│   ├── mousemove → updateGutterHoverOverlay() ← 覆盖全宽灰色背景
│   ├── mousemove → computeTooltipFromEvent() ← 仅在折叠列显示 Tooltip
│   ├── mouseleave → 清除 overlay
│   └── mousedown (capture:true) → handleGutterFold() ← 捕获阶段绕过 stopPropagation
│
├── getGutterRowAtY() ← 统一函数，从 .cm-lineNumbers 取行号位、从 .cm-foldGutter 取图标状态
│
├── FoldTooltipOverlay → body portal
│   └── tooltip span
│
└── adl-gutter-hover-overlay → body
    └── position: fixed, 覆盖整个 gutter 宽度
```

### 关键文件映射

| 文件 | 职责 | 行数 |
|------|------|------|
| `FoldTooltipOverlay.tsx` | 核心交互组件，~430 行 | 事件 + 逻辑 + UI |
| `cmFoldGutter.ts` | 纯视觉折叠 gutter，~45 行 | GutterMarker 实现 |
| `cmLineNumberFold.ts` | 已删除，功能合并到 FoldTooltipOverlay | — |
| `sharedExtensions.ts` | 添加 `codeFolding()` | 1 行增长 |
| `CodeEditor.tsx` | 添加 `codeFolding()` | 1 行增长 |
| `gutterHoverSync.ts` | 内容行 hover → gutter 高亮 | 独立，未改动 |
| `diff-viewer.css` | `.cm-changeGutter: pointer-events: none` | 2 行变更 |
| `cm-overrides.css` | 移除 fold marker box-shadow + 添加 .cm-foldPlaceholder 背景 | ~4 行变更 |
| `editor-surface.css` | 移除 fold marker box-shadow（重复规则） | 减少 ~4 行 |

## 经验教训

### 1. MergeView 中 gutter 事件必须使用捕获阶段

> MergeView 内部在 gutter DOM 元素上挂载了 `mousedown` 处理器，并在其中调用 `stopPropagation()`。自定义 gutter 扩展如果使用 `EditorView.domEventHandlers` 的 `click`/`mousedown`，将永远无法收到事件。
>
> **方案**：`document.addEventListener('mousedown', handler, true)` 在捕获阶段拦截。

### 2. 自定义 gutter 需要额外提供 codeFolding()

> `foldGutter()` 内部自动包含 `codeFolding()`。替换为自定义 `gutter()` + `GutterMarker` 后必须显式添加 `codeFolding()`，否则 `foldEffect`/`unfoldEffect` 空操作。

### 3. DOM 优先于 CodeMirror 行块计算

> `view.lineBlockAtHeight()` 和 `view.posAtCoords()` 在特定布局（侧边模式、折叠区域、0高度元素）下不可靠。直接遍历 `.cm-lineNumbers > .cm-gutterElement` 的 `getBoundingClientRect()` 始终精确。

### 4. Overlay 方案优于元素样式修改

> 为单个 gutter 列修改背景色会产生对齐缺口。采用 `position: fixed` overlay 覆盖整个 `.cm-gutters` 区域，脱离所有层叠上下文，一次覆盖全部列。

### 5. WeakMap 缓存 DOM 引用

> `overlayCache = new WeakMap<HTMLElement, HTMLElement>()` 以 `.cm-gutters` 为 key 缓存 overlay 元素，当视图变化时自动垃圾回收，无需手动管理生命周期。

### 6. 调试日志先于修复

> 第 3 轮修复后才开始通过 `console.log` 加调试日志，导致前 3 轮盲目猜测。后续应先在关键路径添加日志，根据运行时证据决策。

### 7. CSS 规则分散在多个文件中

> 文件面板和变更面板的编辑器 CSS 规则同时定义在 `cm-overrides.css` 和 `editor-surface.css` 两个文件中。第 11 次修复（删除 fold marker box-shadow）只删除了 `cm-overrides.css` 的副本，漏掉了 `editor-surface.css` 的真正生效规则。删除 CSS 效果前应全局搜索确认无残留副本。

### 8. Tooltip 延迟的适用场景区分

> `scheduleHide()` 的 150ms 延迟仅适用于 `mouseleave`（鼠标离开编辑器容器）场景，作为避免闪烁的安全缓冲。当鼠标在同一容器内切换到无折叠标记的行时，应直接 `hide()` 而不延迟。事件处理函数需要区分"离开目标区域"和"移动到相邻区域"两种场景。

## 最终效果验证

- ✅ 变更行折叠图标可点击展开/折叠
- ✅ 未变更行折叠图标可点击展开/折叠
- ✅ 鼠标悬停折叠图标列显示 Tooltip（"折叠至N行"/"展开至N行"）
- ✅ Tooltip 位置固定，不会因鼠标位置偏移
- ✅ 行号区域灰色背景铺满整个 gutter 宽度
- ✅ 灰色背景不会为折叠图标让位
- ✅ 折叠后 overlay 高度跟随文档布局变化
- ✅ 删除行（红色）无折叠功能和 Tooltip
- ✅ 收起无变更行占位符无折叠功能和 Tooltip
- ✅ 红绿边界 Tooltip 位置正确
- ✅ 点击折叠后背景保持不消失
- ✅ Tooltip 行号提示准确（不丢失 `}` 行）
- ✅ Tooltip 在行号区域行间切换时立即消失，无延迟
- ✅ 文件面板折叠图标悬停无圆形灰色背景（与变更面板一致）
- ✅ "..." 折叠占位符常驻灰色背景，非仅 hover 时显示
- ✅ 测试 214/214 通过
