# 变更查看器折叠 Gutter 修复总结 (2026-06-07)

## 问题概述

本次修复解决变更查看器（Diff Viewer）行号区域折叠/展开功能的完整性问题，涵盖折叠图标渲染、点击交互、Tooltip 提示、行号区域悬停高亮等模块。共 **17 项修复**，涉及 **8 个源代码文件** 和 **3 个 CSS 文件**。

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

### 3. 未变更行无功能 (Phase 3)

- **现象**：只有变更行支持折叠，未变更行无 Tooltip 和点击效果
- **根因**：`.cm-changeGutter` 以 `position: absolute; width: 100%; height: 100%; z-index: 20` 覆盖整个 gutter 区域，拦截了鼠标事件
- **修复**：`getLineNumberFromEvent()` 回退到 `view.posAtCoords()` 通过坐标查行号；添加 CSS `pointer-events: none` 到 `.cm-changeGutter`

### 4. 灰色背景铺满整行 (Phase 3)

- **现象**：行号区域灰色背景分为左右两块（行号列、折叠列各一块）
- **修复**：用 `position: fixed` 的 overlay 覆盖整个 `.cm-gutters` 宽度
- **经验**：`position: absolute` 在 flex 容器的 `z-index` stacking 中不可靠

### 5. Tooltip 行号不准确 (Phase 4)

- **现象**：Tooltip 提示的折叠/展开行数总是少一行
- **根因**：`foldable()` 返回的 `to` 是独占的，旧代码 `range.to - 1` 丢弃了独占行
- **修复**：直接使用 `doc.lineAt(range.to).number`，不再 `-1`

### 6. 删除行异常触发折叠 (Phase 4)

- **现象**：红色删除行 gutter 区域也会显示 Tooltip 和响应点击
- **修复**：`computeTooltipFromEvent` 和 `handleGutterFold` 都检查 `target.closest('.cm-deletedLineGutter')` 后跳过

### 7. 折叠占位行误触发 (Phase 4)

- **现象**：收起无变更行的 `.cm-collapsedLines` 行也会触发 Tooltip 和折叠
- **修复**：新增 `getGutterRowAtY()` 函数检查 `.cm-foldGutter` 该行是否有折叠标记，无则跳过

### 8. 红绿边界 Tooltip 位置偏移 (Phase 4)

- **现象**：绿色变更行上的 tooltip 显示在相邻红色行位置
- **修复**：统一使用 `getGutterRowAtY()` 通过 DOM 元素 `getBoundingClientRect()` 定位

### 9. 点击折叠后灰色背景消失 (Phase 4)

- **现象**：点击折叠后 overlay 背景消失
- **修复**：改为 `requestAnimationFrame(repositionOverlay)` 通过最近鼠标事件重新定位

### 10. Tooltip 行间切换延迟 (Phase 4)

- **现象**：鼠标从有折叠图标的行切换到无折叠图标的行时，tooltip 延迟 150ms 才消失
- **根因**：`handleMouseMove` 在无折叠标记的行调用 `scheduleHide()`，该函数有 150ms 延迟
- **修复**：行间切换直接 `hide()` 不延迟；150ms 仅保留给 `mouseleave` 场景

### 11. 文件面板折叠图标灰色圆背景 (Phase 4)

- **现象**：文件面板的折叠图标悬停时有圆形灰色背景，变更面板没有
- **根因**：CSS 规则 `box-shadow: 0 0 0 4px var(--ring-neutral)` 在 `cm-overrides.css` 和 `editor-surface.css` 两个文件中同时存在
- **修复**：从两个文件中删除该规则
- **教训**：CSS 规则可能跨文件重复，删除前应全局搜索确认

### 12. 折叠占位符 "..." 无灰色背景 (Phase 4)

- **现象**：代码折叠后在内容区域显示的 "..." 图标按钮没有灰色背景
- **修复**：用 `!important` 覆盖 CodeMirror EditorTheme 的 `--editor-fold-placeholder` 背景色

### 13. 内容区域 "..." 无 Tooltip (Phase 5)

- **现象**：鼠标悬停在 "..." 折叠占位符上没有 Tooltip 提示
- **根因**：`handleMouseMove` 在鼠标离开 gutter 区域时直接 return，完全不检查内容区域的 `.cm-foldPlaceholder`
- **修复**：新增 `computeTooltipFromPlaceholder()` 函数，`handleMouseMove` 在 gutter 外先检查 `.cm-foldPlaceholder`
- **文件**：`FoldTooltipOverlay.tsx`

### 14. 折叠标记首次打开不显示 — 语法树未解析 (Phase 5)

- **现象**：首次打开第一个变更文件时，行号区域的折叠标记不出现；第二个文件正常
- **根因**（第一层）：`lineMarker()` 在 gutter 初次渲染时被调用，但此时语法树未解析完成，`foldable()` 对所有行都返回 null。语法树解析完成后，gutter 不会自动重渲染，`lineMarker()` 不再被调用
- **修复**（第一层）：使用 `foldGutterCompartment.reconfigure(createFoldGutterExtension())` 在每次 poll 中强制重建整个 fold gutter

### 15. 折叠标记首次打开不显示 — forceParsing 不触发重渲染 (Phase 5)

- **现象**：即使调用了 `forceParsing()`，折叠标记仍然不出现
- **根因**（第二层）：`forceParsing` 内部检查 `success != syntaxTree(state)`。由于 parse context 的 `this.tree = done` 是直接修改对象引用，`success` 和 `syntaxTree(state)` 指向同一对象，比较永远为 false，`view.dispatch({})` 永远不会执行
- **修复**（最终）：使用 `foldGutterCompartment.reconfigure(createFoldGutterExtension())` 强制重建完整 gutter。同时 `syntaxTreeAvailable()` 对 stream parser 不可靠，需轮询 DOM 或使用 `forceParsing(view, doc.length, 1000)` 指定完整文档长度 + 长超时
- **文件**：`useFoldMarkerAutoHide.ts`

### 16. 内容区域 "..." 点击需要两次才能展开 (Phase 6)

- **现象**：点击 gutter 折叠图标后，再去点击内容区域的 "..." 占位符展开时，第一次点击仅是恢复编辑器焦点，第二次才真正触发展开
- **根因**：`captureMouseDown` 在捕获阶段处理 gutter 点击时调用了 `handleGutterFold()`，其中 `stopPropagation()` 阻止了事件传播到 CodeMirror 的默认事件处理器，导致编辑器失去焦点上下文。CodeMirror 对 ".cm-foldPlaceholder" 的展开依赖编辑器焦点
- **修复**：在 `captureMouseDown` 中直接检测 `.cm-foldPlaceholder` 点击，手动通过 `view.dispatch({ effects: unfoldEffect.of(targetRange) })` 展开，绕过 CodeMirror 的焦点依赖
- **文件**：`FoldTooltipOverlay.tsx`

### 17. 变更行折叠标记首次打开不显示 — 早期退出 + forceParsing 时序 (Phase 6)

- **现象**：变更行（红/绿）的折叠标记首次打开不显示，无变更行正常
- **根因**（两个独立 bug）：
  - Bug A — 早期退出：`useFoldMarkerAutoHide` 的 useEffect 中 `hasFoldGutterMarkers(el)` 检测到 spacer + 1 个标记（无变更行）后 `return` 提前退出，poll 从未启动，导致 `forceParsing` + `reconfigure` 永不被调用，变更行无法获得标记
  - Bug B — 时序错误：`forceParsing()` 返回 Promise（异步解析），但代码不 await 直接同步执行 `reconfigure`，`lineMarker()` 在 Lezer 语法树还未解析到深层行区域时运行，`foldable()` 对这些行返回 null
- **修复**：
  - 移除早期退出，发现标记后仅 `startRevealTimer()` 不 `return`
  - `Promise.resolve(forceParsing(view, doc.length, timeout)).then(doReconfigure)` 确保语法树解析完成后再重建 gutter
  - `lineMarker` 添加 try-catch 防止异常导致 gutter 整体中断
- **文件**：`useFoldMarkerAutoHide.ts`, `cmFoldGutter.ts`, `diff-viewer.css`
- **教训**：React Hooks 中 `return` 提前退出可能导致副作用永不被执行。轮询逻辑中已检测到标记后的 early return 是安全优化，但在此场景恰是 bug

## 核心技术架构

```
useFoldMarkerAutoHide Hook
├── state: 'hidden' | 'visible' (通过 data-fold-marker-state 控制 CSS)
├── 组件挂载 → setState('visible') + 5s 最大可见计时器
├── ① 立即检测 → hasFoldGutterMarkers() 检查 DOM
├── ② MutationObserver → 检测 DOM 变化
├── ③ 轮询 (100ms) → forceParsing + foldGutterCompartment.reconfigure
│   └── Promise.resolve(forceParsing).then(reconfigure) ← await 语法树解析
└── gutter 鼠标监听 → mouseenter 立即显示, mouseleave 延迟 300ms 隐藏

FoldTooltipOverlay 组件
├── mousemove → updateGutterHoverOverlay() ← position:fixed 灰色背景
├── mousemove → computeTooltipFromEvent() ← gutter 折叠标记 tooltip
├── mousemove → computeTooltipFromPlaceholder() ← 内容区 "..." tooltip
├── mouseleave → 清除 overlay + 150ms 延迟隐藏 tooltip
└── mousedown (capture:true)
    ├── .cm-gutters 内 → handleGutterFold() ← 绕过 MergeView stopPropagation
    └── .cm-foldPlaceholder → unfoldEffect + preventDefault ← 绕过 CM 焦点依赖

cmFoldGutter 扩展
├── lineMarker() → foldable() 依赖语法树, 异步解析后才返回有效标记
├── try-catch 防止异常中断 gutter 渲染
└── initialSpacer → always-present 占位, 必须用 :nth-child(n+2) 排除

CSS 层级 (diff-viewer.css)
├── z-index 20 → .cm-changeGutter (变更指示栏, position:absolute, width:100%)
├── z-index 21 → .cm-foldGutter (折叠标记, position:relative)
└── z-index 25 → .adl-gutter-hover-overlay (悬停高亮, position:fixed)
```

### 关键文件映射

| 文件 | 职责 | 行数 |
|------|------|------|
| `FoldTooltipOverlay.tsx` | 折叠 Tooltip + 悬停高亮 + 点击处理 | ~430 行 |
| `useFoldMarkerAutoHide.ts` | 折叠标记自动隐藏 Hook | ~220 行 |
| `cmFoldGutter.ts` | 自定义折叠 gutter GutterMarker | ~48 行 |
| `sharedExtensions.ts` | `codeFolding()` + `foldGutterCompartment` | — |
| `gutterHoverSync.ts` | 内容行 hover → gutter 高亮 | 独立，未改动 |
| `diff-viewer.css` | 变更栏 + 折叠栏 z-index 层级 | — |
| `cm-overrides.css` / `editor-surface.css` | 折叠标记样式、auto-hide | — |

## 关键教训

### 1. MergeView 中 gutter 事件必须使用捕获阶段

### 2. 自定义 gutter 需要额外提供 codeFolding()

### 3. DOM 优先于 CodeMirror 行块计算

### 4. Overlay 方案优于元素样式修改

### 5. WeakMap 缓存 DOM 引用

### 6. forceParsing() 触发重渲染的局限性

> `forceParsing()` 内部比较 `success != syntaxTree(state)`。由于 parse context 的 `this.tree = done` 是直接修改对象引用，`success` 和 `syntaxTree(state)` 恒为同一对象，比较永远为 false，`view.dispatch({})` 永远不会执行。依赖 `forceParsing` 触发 gutter 重渲染不可靠。
>
> **方案**：`foldGutterCompartment.reconfigure(createFoldGutterExtension())` 强制重建完整 gutter。

### 7. Compartment.reconfigure 强制 gutter 重建

> `EditorView.dispatch({ effects: foldGutterCompartment.reconfigure(createFoldGutterExtension()) })` 触发完整的插件生命周期：销毁旧 gutter → 销毁所有 DOM 元素 → 创建新 gutter → 重新调用 `lineMarker()`。这是语法树异步解析后确保折叠标记出现的可靠方案。

### 8. syntaxTreeAvailable() 对 stream parser 不可靠

> `syntaxTreeAvailable(view.state)` 对 stream/增量式解析器立即返回 `true`，不反映深层解析进度。应轮询 DOM 或使用 `forceParsing(view, doc.length, 1000)` 指定完整文档长度 + 长超时。

### 9. 轮询 + MutationObserver + forceParsing 三层检测

> 单一检测机制不可靠。最终方案使用三层检测：① 快速 DOM 检查（初始渲染已有标记时） ② MutationObserver（后续 DOM 变化时） ③ 定时轮询 + `forceParsing` + `foldGutterCompartment.reconfigure`（兜底）。

### 10. 捕获阶段事件处理 + preventDefault 导致焦点问题

> `document.addEventListener('mousedown', handler, true)` 在捕获阶段拦截事件后调用 `preventDefault()` + `stopPropagation()`，阻止了事件到达 CodeMirror 的默认事件处理器，导致编辑器丢失焦点上下文。方案：在同一个 `captureMouseDown` 处理器中同时处理 gutter 点击和 `.cm-foldPlaceholder` 展开，对占位符点击手动 `view.dispatch({ effects: unfoldEffect })`。

### 11. React Hook 早期返回导致副作用中断

> `useEffect` 中 `if (condition) { action; return cleanup; }` 的 early return 模式会导致后续所有副作用（poll、MutationObserver、事件绑定）永不执行。即使检测到的条件只是"部分满足"（如只有无变更行的标记），也应确保容错路径继续执行。在本场景中，`hasFoldGutterMarkers` 检测到 apenas 无变更行的标记就 early return，导致 poll 永不被调用，变更行无法获得标记。
>
> **方案**：移除 early return，检测到标记后仅触发展示逻辑，不中断注册剩余的检测/重建机制。

### 12. forceParsing 返回 Promise 需 await 再执行依赖操作

> `forceParsing()` 返回 `Promise<void> | false`。当返回 Promise 时表示语法树正在后台异步解析，Promise resolve 后才解析完毕。依赖语法树的操作（如 `foldable()`）必须在 Promise resolve 后执行。使用 `Promise.resolve(forceParsing(...)).then(() => reconfigure)` 确保正确时序。

### 13. 变更栏 z-index 遮盖折叠标记

> `.cm-changeGutter` 以 `position: absolute; z-index: 20; width: 100%` 覆盖整个 gutter 区域，其内部变更行 gutter 元素的背景色会遮盖下方 `.cm-foldGutter` 的折叠标记。折叠标记 DOM 元素存在但不可见。
>
> **方案**：`.cm-foldGutter { position: relative; z-index: 21; }` 使用 `!important` 防止被覆盖。

## 最终效果验证

- ✅ 变更行/未变更行折叠图标可点击展开/折叠
- ✅ 鼠标悬停折叠图标列显示 Tooltip
- ✅ 行号区域灰色背景铺满整个 gutter 宽度
- ✅ 删除行（红色）无折叠功能和 Tooltip
- ✅ 收起无变更行占位符无折叠功能和 Tooltip
- ✅ Tooltip 行号提示准确
- ✅ Tooltip 行间切换立即消失无延迟
- ✅ Tooltip 鼠标离开编辑器 150ms 后消失
- ✅ 文件面板折叠图标悬停无圆形灰色背景
- ✅ "..." 折叠占位符常驻灰色背景 + Tooltip 提示
- ✅ "展开/折叠"图标首次打开出现 → 1秒自动消失
- ✅ 鼠标悬停行号区域时图标始终可见
- ✅ 点击 "..." 折叠占位符一次立即展开，无需二次点击
- ✅ 变更行折叠标记首次打开正常显示
- ✅ 无变更行折叠标记首次打开正常显示
- ✅ 测试 214/214 通过
