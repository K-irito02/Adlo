# AI Digital Life - UI 设计系统

> 版本: v0.1.0 (Phase 0)
>
> 桌面应用专属 UI 风格系统 | Electron + React + TypeScript

## 设计系统概述

本设计系统为 **AI Digital Life** 第一阶段（Phase 0）桌面应用提供完整的 UI 规范定义，涵盖：

| 模块 | 文档 | 说明 |
|------|------|------|
| 🎨 设计令牌 | [tokens/00-design-tokens.md](./tokens/00-design-tokens.md) | 间距、字体、圆角、阴影、动效等基础设计原子 |
| 🎨 配色方案 | [themes/](./themes/) | 5 套配色 × 3 种主题模式 = 15 套完整主题变量 |
| 🖼️ 图标系统 | [icons/00-icon-system.md](./icons/00-icon-system.md) | SVG 图标库管理规范，禁止使用 emoji |
| 🧩 组件规格 | [components/](./components/) | Button / Input / Card / Badge / Modal / Tooltip 等组件交互规范 |
| ✨ 动效反馈 | [interactions/](./interactions/) | 动画时长/缓动曲线/状态过渡/加载态 |
| 📐 布局响应式 | [layout/](./layout/) | 断点系统/栅格/容器/安全区域 |
| ♿ 无障碍 | [accessibility/](./accessibility/) | 键盘导航/屏幕阅读器/对比度/焦点管理 |
| ⚡ 性能与测试 | [quality/](./quality/) | 渲染优化策略/测试方案 |

## 核心设计原则

### 1. 桌面优先 (Desktop First)

- 针对 Electron 桌面应用场景优化
- 充分利用屏幕空间，信息密度适中
- 支持窗口缩放自适应（768px ~ 1920px+）
- 遵循平台原生体验（Windows/macOS/Linux）

### 2. 安全边界可视化

- 权限等级通过颜色和图标直观区分
- 高风险操作有明确的视觉警示层级
- 审批流程的每一步都有清晰的 UI 反馈
- 安全模式/受限模式有醒目的视觉标识

### 3. 语义化配色

- 所有颜色使用语义化命名（primary / danger / success / warning）
- 禁止在组件中直接使用硬编码色值
- 5 套配色方案可自由切换，所有组件自动适配
- 每套配色均通过 WCAG AA 对比度验证

### 4. SVG 图标唯一性

- **严禁使用 emoji 作为 UI 图标**
- 统一使用 SVG 格式矢量图标
- 图标支持 `currentColor` 自适应主题色
- 图标尺寸标准化：12px / 16px / 20px / 24px / 32px / 48px

### 5. 渐进增强的无障碍

- 键盘可完全操作所有 UI 元素
- 屏幕阅读器友好的语义化结构
- 颜色不是唯一的信息传达方式
- 尊重 `prefers-reduced-motion` 系统设置

## 技术栈约束

| 决策项 | 选型 | 说明 |
|--------|------|------|
| UI 框架 | React 18+ | 组件化开发 |
| 样式方案 | CSS Variables + Tailwind CSS | 运行时主题切换能力 |
| 状态管理 | Zustand | 轻量级全局状态 |
| 图标方案 | 自建 SVG Icon System | Lucide 风格，自定义扩展 |
| 字体渲染 | 系统字体栈 + 编程字体 | 跨平台一致性 |
| 构建工具 | Vite | 快速 HMR 与构建 |

## 目录结构

```
design-system/
├── README.md                    ← 本文件
├── tokens/
│   └── 00-design-tokens.md      设计令牌（间距/字体/圆角/阴影/动效/z-index）
├── themes/
│   ├── 00-theme-system.md       主题切换机制与 CSS 变量架构
│   ├── 01-color-scheme-1-charcoal-pink.md   配色一：炭黑 & 甜酷粉
│   ├── 02-color-scheme-2-deepblue-cream.md   配色二：深海蓝 & 柔奶白
│   ├── 03-color-scheme-3-purple-green.md     配色三：藤紫 & 钛啡绿
│   ├── 04-color-scheme-4-white-camellia.md   配色四：无白 & 茶花红
│   └── 05-color-scheme-5-indigo-cyan.md      配色五：捣蓝 & 清水蓝
├── icons/
│   └── 00-icon-system.md        SVG 图标系统规范
├── components/
│   ├── 00-component-overview.md  组件库总览与分类
│   ├── 01-button-spec.md         按钮组件规格
│   ├── 02-input-spec.md          输入框组件规格
│   ├── 03-card-spec.md           卡片组件规格
│   ├── 04-badge-tag-spec.md     徽章/标签组件规格
│   ├── 05-modal-dialog-spec.md  模态框/对话框规格
│   ├── 06-tooltip-spec.md       悬停提示组件规格
│   ├── 07-table-list-spec.md    表格/列表组件规格
│   └── 08-navigation-spec.md     导航组件规格
├── interactions/
│   ├── 00-animation-spec.md      动画系统规范
│   └── 01-feedback-spec.md       交互反馈规范
├── layout/
│   ├── 00-layout-system.md      布局系统与栅格
│   └── 01-responsive-spec.md     响应式断点与适配
├── accessibility/
│   └── 00-accessibility-spec.md 无障碍设计规范
└── quality/
    ├── 00-performance-spec.md   性能优化策略
    └── 01-testing-strategy.md    测试方案与验收标准
```

## 配色方案速查

| # | 方案名称 | 主色调 | 强调色 | 风格定位 |
|---|----------|--------|--------|----------|
| 1 | 炭黑甜酷粉 | `#1A1A1D` | `#E6397C` | 科技感 / 赛博朋克 |
| 2 | 深海柔奶白 | `#122E8A` | `#F5EFEA` | 专业 / 可信 |
| 3 | 藤紫钛啡绿 | `#5E55A2` | `#91C53A` | 自然 / 创新 |
| 4 | 无白茶花红 | `#F1DDDF` | `#E72D48` | 温暖 / 人文 |
| 5 | 捣蓝清水蓝 | `#113056` | `#91CFD5` | 冷静 / 精密 |

每套配色均提供 **Light（浅色）/ Dark（深色）/ System（跟随系统）** 三种主题模式。

## 使用指南

### 对于设计师

1. 从 [design-tokens.md](./tokens/00-design-tokens.md) 了解基础设计原子
2. 在 [themes/](./themes/) 中选择配色方案并确认主题模式
3. 参考 [components/](./components/) 中的组件规格进行设计稿制作
4. 使用 [icons/00-icon-system.md](./icons/00-icon-system.md) 中的图标进行排版

### 对于开发者

1. 安装依赖后，CSS 变量自动注入到 `:root` 和 `[data-theme]`
2. 通过 `document.documentElement.setAttribute('data-theme', 'scheme-1-dark')` 切换主题
3. 组件从 `@/design-system/components/*` 导入
4. 图标从 `@/design-system/icons/*` 导入，支持 tree-shaking

### 切换主题示例

```typescript
// 切换配色方案 + 主题模式
type ColorScheme = 'scheme-1' | 'scheme-2' | 'scheme-3' | 'scheme-4' | 'scheme-5';
type ThemeMode = 'light' | 'dark' | 'system';

function setTheme(scheme: ColorScheme, mode: ThemeMode) {
  const root = document.documentElement;
  
  // 设置配色方案
  root.setAttribute('data-color-scheme', scheme);
  
  // 设置主题模式
  if (mode === 'system') {
    root.removeAttribute('data-theme');
    // 监听 prefers-color-scheme 媒体查询
  } else {
    root.setAttribute('data-theme', `${scheme}-${mode}`);
  }
}
```

## 版本历史

| 版本 | 日期 | 变更说明 |
|------|------|----------|
| v0.1.0 | 2026-04-19 | Phase 0 初始版本，建立完整设计系统框架 |
