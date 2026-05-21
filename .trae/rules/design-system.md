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
| Tooltip | 禁止原生 `title`，必须使用 `TooltipSimple` |

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

详见 [tokens.md](/E:/Programs/Obsidian/notes/ai-digital-life/docs/design-system/tokens.md)。

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

- [docs/design-system/README.md](/E:/Programs/Obsidian/notes/ai-digital-life/docs/design-system/README.md)
- [design-system/tokens.ts](/E:/Programs/Obsidian/notes/ai-digital-life/frontend/src/design-system/tokens.ts)
- [styles/themes.css](/E:/Programs/Obsidian/notes/ai-digital-life/frontend/src/styles/themes.css)
- [styles/regions.css](/E:/Programs/Obsidian/notes/ai-digital-life/frontend/src/styles/regions.css)
- [mandatory-testing.md](./mandatory-testing.md)
