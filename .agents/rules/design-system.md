---
description: Design system constraints, theming, component specifications, and accessibility
globs: adlo/frontend/**/*
alwaysApply: false
---

# 设计系统

## 核心约束

| 约束 | 规则 |
|------|------|
| 颜色 | CSS 自定义属性 `var(--…)`，禁止硬编码 |
| 图标 | SVG 格式，继承 `currentColor`，禁止 emoji |
| 窗口 | 最小宽度 640px |
| Tooltip | 自定义 Tooltip 组件与原生 `title` 均可使用，具体方案开发时由用户决策（详见 [ui-patterns.md](./ui-patterns.md#9-tooltip)） |

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

表单聚焦：`input` / `textarea` / `select` 聚焦只改边线为 `var(--focus-border)`（亮色黑 / 暗色白），不使用品牌蓝，也不叠加 focus ring。

## Surface 交互语义层

表面（Surface）层级的交互态通过语义 token 表达，不依赖透明度微调：

| Token | 用途 |
|-------|------|
| `--surface-hover` | 悬停态轻微底色（如菜单项 hover） |
| `--surface-active` | 选中/激活态稍深底色（如菜单项 active） |
| `--surface-raised` | 弹出层背景（菜单、popover） |

详见 [tokens.md](../../docs/design-system/foundations/tokens.md)。

## 提示色（Hint）

拖拽手柄 / 分界线的悬停提示必须使用中性色 `var(--text-secondary)`，禁用 `--accent` 蓝色（避免与选中 / 焦点语义混淆）。完整规范见 [hint-color-usage.md](./hint-color-usage.md)。

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
.adl-iconstrip__separator::before {
  top: var(--adl-iconstrip-separator-inset); /* 7px */
  bottom: var(--adl-iconstrip-separator-inset);
  width: 1px;
  background: transparent;
}
.adl-iconstrip__separator.is-visible::before {
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

详见 [tool-switcher.css](../../adlo/frontend/src/styles/regions/rightpanel/tool-switcher.css)（`.adl-iconstrip__separator`）。

## CodeMirror 编辑器集成

| 组件 | 文件 | 说明 |
|------|------|------|
| `CodeEditor` | `frontend/src/app/features/editor/CodeEditor.tsx` | CodeMirror 6 编辑器封装，支持语言扩展、主题同步、行号/换行/折叠 |
| `DiffViewer` | `frontend/src/app/features/diff-viewer/DiffViewer.tsx` | 差异查看器（合并视图/并排视图），支持未改块折叠 |

### 依赖管理约束

所有 `@codemirror/*` 核心包（state/view/language/commands/autocomplete/search/lint）必须满足：
1. **显式依赖**：代码直接使用的包（如 `@codemirror/state`）必须在 `package.json` 的 `dependencies` 中列出
2. **预捆绑单例**：在 `vite.config.ts` 的 `optimizeDeps.include` 中列出，确保 Vite 开发模式下仅加载一个实例，避免 `instanceof` 检查失败

## xterm.js 终端组件

| 组件 | 文件 | 说明 |
|------|------|------|
| `XtermTerminal` | `frontend/src/app/components/terminal/XtermTerminal.tsx` | xterm.js 封装组件，支持 FitAddon、WebLinksAddon、主题同步（MutationObserver 监听 data-theme 变化） |
| `TerminalPanel` | `frontend/src/app/features/terminal/TerminalPanel.tsx` | 终端面板，管理多标签/多会话、Shell 类型选择、PTY 生命周期 |

### 双端 PTY 实现

| 模式 | 后端 | 通信 |
|------|------|------|
| Tauri | `pty_commands.rs` (Rust PTY) | Tauri Event `digital-life://pty-output` |
| 浏览器 | `previewTerminalService.ts` (Node.js `child_process.spawn`) | 轮询 `/__adl_preview_api__/pty/output-since`（`preview-pty-bridge.ts`，间隔 1000ms） |

## 主题系统

### 架构概览

`ThemeController`（`design-system/theme.ts`）是唯一真实来源。所有消费者通过 `useResolvedTheme()` hook 或 MutationObserver 读取当前主题，禁止直接读取 `appInfo.config.resolvedTheme`。

```
启动时序（消除主题闪烁）：
  index.html 内联脚本（同步读 localStorage，设置 data-theme + colorScheme）
    → ThemeController 构造函数（读 localStorage 初始化状态，不写 DOM）
    → useThemeSync（appInfo 加载后调 setTheme，同步 DOM + localStorage）
    → setTheme → syncRoot（写 data-theme + colorScheme + localStorage）

运行时：
  ThemeController (singleton, systemPrefersDark() 解析)
    ├─ useResolvedTheme() hook     → React 组件 (FilesPanel, DiffViewer, CodeEditor)
    ├─ MutationObserver            → xterm.js 终端
    ├─ useBrowserThemeSync         → Tauri WebView 颜色方案
    └─ DOM data-theme / color-scheme → CSS 变量
```

### 核心文件

| 文件 | 职责 |
|------|------|
| `index.html` | 内联脚本同步设置 data-theme + colorScheme（从 localStorage 缓存） |
| `design-system/theme.ts` | `ThemeController` 类 + `resolveThemeMode()` + `systemPrefersDark()` |
| `app/utils/theme.ts` | `ThemeController` 单例 |
| `app/hooks/useResolvedTheme.ts` | React hook 订阅 ThemeController |
| `app/hooks/useThemeSync.ts` | appInfo 加载后同步主题控制器，移除 no-transition 类 |
| `shared/resolveTheme.ts` | `resolveCurrentTheme()` 包装函数（使用 `systemPrefersDark()`） |
| `styles/themes.css` | `[data-theme]` CSS 变量 + `no-transition` 类 |

### 规则

- `ThemeMode`（`'light' | 'dark' | 'system'`）由 Rust 后端持久化，通过 `app.updatePreferences` 修改
- `ResolvedTheme`（`'light' | 'dark'`）必须在前端通过 `systemPrefersDark()` 解析，禁止在后端解析 `System` 模式
- 应用内用户选择优先：即使 OS 是 dark，用户选 light 就用 light
- localStorage 双缓存：`adl-theme-mode`（用户选择的 mode）+ `adl-resolved-theme`（已解析主题），供 index.html 内联脚本在下次启动时同步读取
- React 组件必须使用 `useResolvedTheme()` 获取当前主题，禁止读取 `appInfo.config.resolvedTheme`
- 非 React 上下文（如 xterm.js）通过 MutationObserver 监听 `<html data-theme>` 属性变化；
  React 侧的颜色面（含 `StartupOverlay`）只消费 CSS 变量（`--splash-*` 等），不读 `data-theme`
- `themeController.setTheme()` 只需传 `mode`，不需要传 `resolvedTheme`（Controller 自行解析）
- 修改偏好时调用 `actions.updatePreferences({ themeMode })`，不要直接修改 store
- 禁止直接调用 `window.matchMedia('(prefers-color-scheme: dark)')`，必须使用 `systemPrefersDark()` 统一函数

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

- [ui-patterns.md](./ui-patterns.md) — UI 模式速查（对话框、菜单、悬停、点击、颜色、Hint Card、按钮、文件树等 27 类模式的一站式入口）
- [docs/design-system/README.md](../../docs/design-system/README.md)
- [design-system/tokens.ts](../../adlo/frontend/src/design-system/tokens.ts)
- [styles/themes.css](../../adlo/frontend/src/styles/themes.css)
- [styles/index.css](../../adlo/frontend/src/styles/index.css) — CSS 入口（导入 layout + regions/*）
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
