# 最近工作区 名称/路径布局修复：比例上限、省略截断、基线对齐、原生提示 — 2026-08-07

来源：WelcomeState 最近工作区列表 + StatusBar 工作区菜单卡片的多轮 UI 修复（路径重叠 → 统一比例截断 → 原生 tooltip → 垂直对齐）。

## 经验教训

### 1. Grid `justify-self: end` + `overflow: hidden` 是"完整长路径重叠"的根因

网格项设 `justify-self: end` 时按**内容宽度**（max-content，nowrap 下即完整文本）定尺寸并右对齐；`overflow: hidden` 裁剪的是**元素自身的大盒子**，而不是网格轨道。于是长路径以完整宽度渲染、向左溢出到相邻的名称列，`text-overflow: ellipsis` 完全不生效。

修复：改用 `justify-self: stretch`，让元素填满自己的轨道，截断才在轨道边界处生效。判断标准：任何网格列里要"超长截断"，该项必须撑满轨道（`stretch` 或显式 `width: 100%`），不能靠 `overflow: hidden` 兜底。

### 2. 百分比轨道实现"所有行统一的比例上限"，且不随名称宽度变化

`grid-template-columns: 14px minmax(0, 1fr) minmax(0, 45%)`：

- 第 3 列 `minmax(0, 45%)` 是**确定尺寸**（按钮宽度的 45%），所有行一致、与名称列宽度无关；超出即省略号截断，短路径完整显示。
- 第 2 列 `minmax(0, 1fr)` 吸收剩余空间，名称过长时同样省略号截断。
- 两列都要 `justify-self: stretch` + `min-width: 0` + `overflow: hidden` + `text-overflow: ellipsis` + `white-space: nowrap`，才能各自在轨道内截断。

比 `1fr`（路径 = 剩余空间、随名称变化）更符合"统一比例上限"的诉求。

### 3. 混合字号文本垂直"偏上" → 用 `align-self: baseline` 而非盒子居中

名称（12px sans）与路径（11px mono）行盒高度不同，`align-items: center` 居中两个盒子后，字体度量差异会让文本视觉偏上。改为名称/路径 `align-self: baseline`，按文本基线对齐，落在同一条水平线。

### 4. 截断场景用系统原生 `title` 展示完整信息

单行省略号截断后部分信息不可见，在行按钮上加原生 `title={`${name}\n${path}`}`（`\n` 在 Chromium/WebView2 中渲染为多行），悬停显示完整名称与完整路径。AGENTS.md 明确允许路径展示使用原生 `title` 属性。

### 5. 卡片长文本处理：纵向堆叠 + 单行省略，不靠加宽卡片

StatusBar 工作区菜单卡片固定宽度 `min(320px, ...)`。选项按钮纵向堆叠（`flex-direction: column`，名称在上、路径在下），名称与路径均 `width: 100%` + 单行省略号截断（用 `:not(.adl-statusbar__menu-option--global)` 限定，避免全局模式提示文案被截断）。**"让路径换行显示全"是错误策略**——多行会让行高失控，也失去 tooltip 的意义；截断 + 原生提示才是正解。

### 6. 纯 CSS 布局问题用调试日志做数值化排查（不依赖浏览器自动化）

按项目规范（调试日志收起器为最高优先级调试手段），在组件里临时加 `useEffect` 度量每一行的 `getBoundingClientRect`（名称 right / 路径 left / `gap`）、`scrollWidth - clientWidth`（溢出量）与计算后的 `grid-template-columns`，经 `console.log` 收集进 `debug-logs.txt`，量化确认重叠与截断后再改 CSS，验证完成后移除诊断代码。
