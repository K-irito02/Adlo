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

## 主题系统

| 层级 | 存储位置 |
|------|----------|
| Theme（持久化） | Tauri backend |
| Color Scheme（偏好） | `localStorage` |

**重要**：WebView 不得直接修改持久化主题，必须通过桥接命令。

## 相关文件

- [docs/design-system/README.md](/E:/Programs/Obsidian/notes/ai-digital-life/docs/design-system/README.md)
- [mandatory-testing.md](./mandatory-testing.md)
