---
description: CSS architecture rules, splitting thresholds, dead CSS prevention, and layout stability
alwaysApply: false
---

# CSS 架构规范

## 文件组织
- CSS 文件按 UI 区域拆分：`regions/`、`components/`、`features/` 各司其职
- 单个 CSS 文件 > 1000 行：必须按子区域或组件进一步拆分
- 全局变量和基础样式放在 `src/styles/`：`index.css`、`variables.css`、`reset.css`
- 组件专属样式放在组件同目录或 `features/{domain}/` 对应目录

## 变量与 Token
- 所有颜色使用 `var(--...)` CSS 变量，禁止硬编码 hex/rgb
- 间距使用 `var(--space-{n})`（4px 基准网格：0, 2, 4, 6, 8, 12, 16, 24, 32, 48）
- 新设计 Token 必须同时在 `design-system/tokens.ts` 中注册 TypeScript 类型

## 死 CSS 预防
- 删除组件时，必须同时搜索并删除其专属 CSS
- 定期（每 5 轮重构）扫描未使用的 CSS 类并清理
- 新组件优先使用已有工具类，避免重复定义

## 布局稳定性
- 内容可能变化的容器使用固定 `width`，禁止仅设置 `min-width`
- 图标或徽标元素使用 `margin-left: auto` 固定在容器右侧，而非绝对定位
- 禁止对动态列表项使用不同的高度或间距（导致布局抖动）

## 性能相关
- 超过 50 项的滚动列表：使用 `content-visibility: auto` 延迟渲染屏外内容
- 动画和过渡仅使用 `transform` 和 `opacity`，避免触发 layout/paint（使用 `will-change` 提示浏览器）
- 禁止使用 `*` 选择器或深度嵌套选择器（>3 层）

## 禁止项
- 禁止使用 `!important`（除非覆盖第三方库样式）
- 禁止硬编码颜色值（hex、rgb、hsl 等）
- 禁止在 CSS 中使用 `transition: all`
- 禁止超过 3 层的选择器嵌套
