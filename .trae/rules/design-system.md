---
description: Design system constraints, theming, component specifications, and accessibility
globs: ai-digital-life/apps/desktop/renderer/**/*
alwaysApply: false
---

# 设计系统

## 核心约束

| 约束项 | 规则 |
|--------|------|
| 颜色 | 必须使用 CSS 自定义属性 `var(--…)`，禁止硬编码 |
| 图标 | 必须使用 SVG 格式并继承 `currentColor`，禁止 emoji |
| 最小窗口宽度 | 640px |
| Tooltip 提示 | **禁止**使用原生 HTML `title` 属性，必须使用 `TooltipSimple` 组件 |

## Tooltip 组件规范

### API

| 组件 | 用途 |
|------|------|
| `TooltipSimple` | 便捷组件，用于简单文本提示（推荐） |
| `Tooltip` + `TooltipTrigger` + `TooltipContent` | 组合模式，用于富内容/复杂场景 |

### 关键文件

| 文件 | 职责 |
|------|------|
| `components/Tooltip.tsx` | React 组件（组合模式 API + TooltipSimple） |
| `hooks/useTooltip.ts` | 核心 Hook（状态管理、定时器、事件处理） |
| `utils/tooltipPosition.ts` | 纯函数定位引擎（4方向 + 自动翻转 + 边界检测） |
| `styles/components.css` | Tooltip CSS 样式（动画、箭头、主题适配） |

## 交互状态

所有交互控件必须提供完整状态：

| 状态 | CSS 选择器 |
|------|-----------|
| 默认 | `:default` 或无 |
| 悬停 | `:hover` |
| 聚焦 | `:focus-visible` |
| 激活 | `:active` |
| 禁用 | `:disabled` |
| 加载中 | `[data-loading="true"]` |

## 主题系统

| 层级 | 职责 | 存储位置 |
|------|------|----------|
| 主题 (Theme) | 持久化偏好 | Main 进程，通过 IPC |
| 配色方案 (Color Scheme) | Renderer 端偏好 | `localStorage` |

**重要**：Renderer 不得直接修改持久化主题状态，必须通过 IPC：
```typescript
window.digitalLife.app.updatePreferences({ theme: 'dark' })
```

## 目录结构

```
renderer/src/
├── design-system/   # 设计系统组件
├── styles/          # CSS 样式系统
│   └── tokens.css   # 设计令牌
└── locales/         # 国际化资源
```

## 测试要求

- 所有公共设计系统辅助函数必须有测试覆盖
- 组件测试应覆盖所有交互状态

## 随项目演进

- 新增设计令牌：更新 `tokens.css` 并同步文档
- 新增组件：更新目录结构 + 组件文档
- 主题系统变更：更新主题系统表格

## 相关文件

- [docs/design-system/README.md](/E:/Programs/Obsidian/notes/ai-digital-life/docs/design-system/README.md)
- [docs/design-system/tokens.md](/E:/Programs/Obsidian/notes/ai-digital-life/docs/design-system/tokens.md)
- [docs/design-system/themes.md](/E:/Programs/Obsidian/notes/ai-digital-life/docs/design-system/themes.md)
- [docs/design-system/components.md](/E:/Programs/Obsidian/notes/ai-digital-life/docs/design-system/components.md)
- [docs/design-system/accessibility.md](/E:/Programs/Obsidian/notes/ai-digital-life/docs/design-system/accessibility.md)
