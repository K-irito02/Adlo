---
description: Design system constraints, theming, component specifications, and accessibility
globs: ai-digital-life/frontend/**/*
alwaysApply: false
---

# 设计系统

## 核心约束

| 约束 | 规则 |
|------|------|
| 颜色 | CSS 自定义属性 `var(--…)`，禁止硬编码 |
| 图标 | SVG 格式，继承 `currentColor`，禁止 emoji |
| 窗口 | 最小宽度 640px |
| Tooltip | 必须统一使用一种 Tooltip 方案，禁止混合使用多种方案 |

## Tooltip 组件

| 组件 | 用途 |
|------|------|
| `TooltipSimple` | 便捷组件（推荐） |
| `Tooltip` + `TooltipTrigger` + `TooltipContent` | 组合模式（复杂场景） |

## 交互状态

| 状态 | 选择器 |
|------|--------|
| 悬停 | `:hover` |
| 聚焦 | `:focus-visible` |
| 激活 | `:active` |
| 禁用 | `:disabled` |
| 加载中 | `[data-loading="true"]` |

## Surface 交互语义层

表面（Surface）层级的交互态通过语义 token 表达，不依赖透明度微调：

| Token | 用途 |
|-------|------|
| `--surface-hover` | 悬停态轻微底色（如菜单项 hover） |
| `--surface-active` | 选中/激活态稍深底色（如菜单项 active） |
| `--surface-raised` | 弹出层背景（菜单、popover） |

详见 [tokens.md](../../docs/design-system/tokens.md)。

## 工具条/标签栏（IconStrip）

### 按钮样式

| 属性 | 值 |
|------|-----|
| 默认文字色 | `var(--text-secondary)` |
| 默认背景 | `transparent` |
| 悬停/激活背景 | `var(--bg-hover)` |
| 悬停/激活文字色 | `var(--text-primary)` |
| 高度 | `30px` |
| 圆角 | `0` |
| 底部边框 | `1px solid var(--border-subtle)` |

### 相邻分割线

当两个相邻按钮同时处于悬停或激活态时，中间显示垂直分割线：

```css
.adl-communicate__platform-separator::before {
  top: 7px;
  bottom: 7px;
  width: 1px;
  background: var(--border-strong);
}
```

React 中实现：
```tsx
const isHighlighted = activeTab === tab.id || hoveredTab === tab.id;
const nextTab = TABS[index + 1];
const shouldShowSeparator =
  !!nextTab &&
  isHighlighted &&
  (activeTab === nextTab.id || hoveredTab === nextTab.id);
```

详见 [tool-switcher.css](../frontend/src/styles/regions/rightpanel/tool-switcher.css) 和 [communication-panel.css](../frontend/src/styles/regions/rightpanel/communication-panel.css)。

## CodeMirror 编辑器集成

| 组件 | 文件 | 说明 |
|------|------|------|
| `CodeEditor` | `frontend/src/app/features/editor/CodeEditor.tsx` | CodeMirror 6 编辑器封装，支持语言扩展、主题同步、行号/换行/折叠 |
| `DiffViewer` | `frontend/src/app/features/diff-viewer/DiffViewer.tsx` | 差异查看器（合并视图/并排视图），支持未改块折叠 |
| `cmFoldGutter` | `frontend/src/app/features/editor/cmFoldGutter.ts` | 自定义折叠 gutter 扩展（GutterMarker），替代内置 foldGutter() 以移除内建事件处理 |
| `FoldTooltipOverlay` | `frontend/src/app/features/editor/FoldTooltipOverlay.tsx` | 折叠工具提示 + Gutter 悬停高亮 + 折叠/展开点击处理。使用捕获阶段 `document.addEventListener` 绕过 MergeView 的 `stopPropagation`。同时处理 `.cm-foldPlaceholder` 展开绕过 CM 焦点依赖 |
| `useFoldMarkerAutoHide` | `frontend/src/app/features/editor/useFoldMarkerAutoHide.ts` | 折叠标记自动隐藏 Hook。三层检测：DOM 检查、MutationObserver、轮询 + Promise.resolve(forceParsing).then(reconfigure) |
| `cmTheme` | `frontend/src/app/features/editor/cmTheme.ts` | 主题同步：从 CSS 自定义属性读取颜色，支持亮暗主题动态切换 |
| `cmScrollLeftSync` | `frontend/src/app/features/editor/cmScrollLeftSync.ts` | 自定义水平滚动条，支持边缘滚动、Diff 双编辑器同步 |
| `gutterHoverSync` | `frontend/src/app/features/editor/gutterHoverSync.ts` | 内容行悬停 → gutter 高亮同步，使用绝对定位 overlay |

### MergeView 事件约束

在 `@codemirror/merge` (MergeView) 上下文中，gutter DOM 元素上的 `mousedown`/`click` 事件会被 MergeView 内部处理器调用 `stopPropagation()` 拦截，无法通过 `EditorView.domEventHandlers` 或常规冒泡监听捕获。必须使用捕获阶段：`document.addEventListener('mousedown', handler, true)`。

### `codeFolding()` 依赖

自定义 gutter（`gutter()` + `GutterMarker`）需要显式添加 `codeFolding()` 扩展（来自 `@codemirror/language`）。内置 `foldGutter()` 隐式包含它，自定义实现不包含。

### Fold gutter 异步渲染

`lineMarker()` 依赖异步解析的语法树。初次渲染时 `foldable()` 可能返回 null。语法树解析完成后 gutter 不自动重渲染。需使用 `foldGutterCompartment.reconfigure(createFoldGutterExtension())` 强制重建。

注意 `forceParsing()` 返回 Promise（异步解析），必须 `Promise.resolve(forceParsing(...)).then(reconfigure)` 确保语法树解析完成后再重建 gutter。参看 `useFoldMarkerAutoHide.ts` 中的三层检测机制。

### Fold gutter 变更行遮盖

在 Diff Viewer 中，`.cm-changeGutter` 以 `position: absolute; z-index: 20; width: 100%` 覆盖整个 gutter 区域，其内部变更行 gutter 元素的背景色会遮盖下方 `.cm-foldGutter` 的折叠标记。需设置 `.cm-foldGutter { position: relative; z-index: 21 !important; }` 使折叠标记浮现在变更栏之上。

### Gutter hover 高亮方案

使用 `position: fixed` overlay 元素（直接挂载到 `document.body`）覆盖整个 `.cm-gutters` 区域，通过 `mousemove` + `requestAnimationFrame` 驱动位置更新。避免为每个 gutter 列独立设置背景色导致的对齐缺口。

### 依赖管理约束

所有 `@codemirror/*` 核心包（state/view/language/commands/autocomplete/search/lint）必须满足：
1. **显式依赖**：代码直接使用的包（如 `@codemirror/state`）必须在 `package.json` 的 `dependencies` 中列出
2. **预捆绑单例**：在 `vite.config.ts` 的 `optimizeDeps.include` 中列出，确保 Vite 开发模式下仅加载一个实例，避免 `instanceof` 检查失败

## xterm.js 终端组件

| 组件 | 文件 | 说明 |
|------|------|------|
| `XtermTerminal` | `frontend/src/app/components/terminal/XtermTerminal.tsx` | xterm.js 封装组件，支持 FitAddon、WebLinksAddon、主题同步（MutationObserver 监听 data-theme 变化） |
| `TerminalPanel` | `frontend/src/app/features/terminal/TerminalPanel.tsx` | 终端面板，管理多标签/多会话、Shell 类型选择、PTY 生命周期 |

### 主题同步机制

xterm.js 主题色从 CSS 自定义属性读取，非硬编码：

| xterm 属性 | CSS 变量 |
|-----------|---------|
| `background` | `--bg` |
| `foreground` | `--text-primary` |
| `selectionBackground` | `--selection` |
| `selectionInactiveBackground` | `--selection` (with opacity) |

`MutationObserver` 监听 `<html>` 的 `data-theme` 属性变化，自动更新 xterm 颜色。

### 双端 PTY 实现

| 模式 | 后端 | 通信 |
|------|------|------|
| Tauri | `pty_commands.rs` (Rust PTY) | Tauri Event `digital-life://pty-output` |
| 浏览器 | `previewTerminalService.ts` (Node.js `child_process.spawn`) | SSE `/__adl_preview_api__/pty/output` |

## 主题系统

| 层级 | 存储位置 |
|------|----------|
| Theme（持久化） | Tauri backend |
| Color Scheme（偏好） | `localStorage` |

**重要**：WebView 不得直接修改持久化主题，必须通过桥接命令。

## Design Token 类型定义

设计 Token 的 TypeScript 类型定义位于 `frontend/src/design-system/tokens.ts`：

| 类型 | 说明 |
|------|------|
| `ShadowToken` | `'shadow-sm' \| 'shadow' \| 'shadow-md' \| ...` 等 13 个 Shadow token |
| `ColorToken` | CSS 颜色变量枚举 |
| `SpacingToken` | 间距变量枚举 |

`SHADOW_TOKENS` 导出列表可在运行时用于遍历或校验。

### 新增的 Shadow 设计 Token

| Token | Light 模式值 | Dark 模式值 | 用途 |
|-------|-------------|-------------|------|
| `--shadow-inset-highlight` | `inset 0 1px 0 rgba(255,255,255,0.4)` | `inset 0 1px 0 rgba(255,255,255,0.06)` | 面板顶部内阴影高光 |
| `--shadow-panel` | `-12px 0 24px ...` | `-12px 0 24px ...` | 右侧面板全局阴影 |
| `--shadow-panel-sm` | `-10px 0 12px ...` | `-10px 0 12px ...` | 右侧面板小阴影 |
| `--shadow-divider` | `-2px 0 4px -1px ...` | `-2px 0 4px -1px ...` | 面板分割线阴影 |
| `--ring-neutral` | `rgba(128,128,128,0.12)` | `rgba(128,128,128,0.12)` | 中性态焦点环 |
| `--ring-error` | `rgba(239,68,68,0.25)` | `rgba(239,68,68,0.25)` | 错误态焦点环 |

## 相关文件

- [docs/design-system/README.md](../../docs/design-system/README.md)
- [design-system/tokens.ts](../../ai-digital-life/frontend/src/design-system/tokens.ts)
- [styles/themes.css](../../ai-digital-life/frontend/src/styles/themes.css)
- [styles/regions.css](../../ai-digital-life/frontend/src/styles/regions.css)
- [mandatory-testing.md](./mandatory-testing.md)

## CSS 架构

详细 CSS 拆分阈值、死 CSS 预防、布局稳定性规则见 [css-architecture.md](./css-architecture.md)

核心约束:
- 单个 CSS 文件 > 1000 行必须拆分
- 删除组件时必须同步删除其专属 CSS
- 内容可变容器使用固定 `width`，禁止仅设置 `min-width`

## React 性能模式

详细组件拆分、Hook 提取阈值见 [component-architecture.md](./component-architecture.md)

核心约束:
- `useMemo` 用于避免复杂计算的重复执行
- `useCallback` 用于传递给 `React.memo` 子组件的回调
- 超过 50 项的滚动列表使用 `content-visibility: auto`
