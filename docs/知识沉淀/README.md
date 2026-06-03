# 知识沉淀

本目录集中管理全项目的**总结性知识**与**经验教训**，按领域分类维护。

## 目录结构

| 目录 | 内容 | 文件数 |
|------|------|--------|
| [重构](./重构/) | 重构方法论、组件提取、执行报告、阶段性总结 | 9 |
| [多工作区](./多工作区/) | 多工作区开发中的变更面板、文件树、终端、布局等经验 | 9 |
| [浏览器](./浏览器/) | 内置浏览器实现、树形目录交互、子目录修复经验 | 3 |
| [浏览器自动化](./浏览器自动化/) | 浏览器自动化调试记录与规则经验 | 2 |

## 索引

### 重构

| 文件 | 来源 | 说明 |
|------|------|------|
| [component-extraction.md](./重构/component-extraction.md) | 重构洞察 | 组件安全提取方法论（类型导入、Vite 缓存、export type 等） |
| [ui-restoration.md](./重构/ui-restoration.md) | 重构洞察 | UI 恢复经验（CSS 层叠、动画恢复、结构分层） |
| [execution-lessons.md](./重构/execution-lessons.md) | 重构洞察 | 第 10 轮重构执行经验（CSS 截断、类型收窄、OnceLock 等） |
| [refactoring-process-lessons.md](./重构/refactoring-process-lessons.md) | REFACTORING_PROGRESS_REPORT | 跨 4 轮重构的 16 条经验（CSS、React、Rust 等） |
| [refactoring-summary-2026-06-01.md](./重构/refactoring-summary-2026-06-01.md) | 重构洞察 | 第 1-30 轮重构任务汇总与经验 |
| [progress-summary.md](./重构/progress-summary.md) | 重构洞察 | 第 1-17 轮重构进展汇总 |
| [summary-2026-05-31.md](./重构/summary-2026-05-31.md) | 重构洞察 | 2026-05-31 重构总结 |
| [summary-2026-05-30.md](./重构/summary-2026-05-30.md) | 重构洞察 | 2026-05-30 重构总结 |
| [terminal-fix-2026-05-22.md](./重构/terminal-fix-2026-05-22.md) | 重构洞察 | 终端功能修复总结 |
| [styling-restoration-2026-05-27.md](./重构/styling-restoration-2026-05-27.md) | 重构洞察 | 文件树大纲样式恢复经验 |

### 多工作区

| 文件 | 来源 | 说明 |
|------|------|------|
| [changes-terminal-panel.md](./多工作区/changes-terminal-panel.md) | Superpowers Specs | 变更面板与终端面板重构（10 条经验：useMemo 对齐、ResizeObserver、hover 缓冲等） |
| [file-tree.md](./多工作区/file-tree.md) | Superpowers Specs | 多工作区文件树（11 条经验：Tooltip 覆盖、数据流、CSS 选择器、状态同步等） |
| [component-split.md](./多工作区/component-split.md) | Superpowers Specs | Phase 3 组件拆分（Rust 异步模式、组件拆分策略） |
| [terminal-profile.md](./多工作区/terminal-profile.md) | Superpowers Specs | 终端默认配置修复（PTY 通信、SSE 同步、配置持久化） |
| [stats-fix.md](./多工作区/stats-fix.md) | Superpowers Specs | 多工作区统计修复经验 |
| [tree-layout-alignment.md](./多工作区/tree-layout-alignment.md) | Superpowers Specs | 文件树布局对齐经验 |
| [file-selection-fix.md](./多工作区/file-selection-fix.md) | Superpowers Specs | 文件选择修复经验 |
| [terminal-binding.md](./多工作区/terminal-binding.md) | Superpowers Specs | 终端工作区绑定改进经验 |
| [interactive-terminal.md](./多工作区/interactive-terminal.md) | Superpowers Specs | 交互式终端讨论总结 |

### 浏览器

| 文件 | 来源 | 说明 |
|------|------|------|
| [builtin-browser.md](./浏览器/builtin-browser.md) | architecture/builtin-browser-implementation | 内置浏览器实现 16 条经验（Tauri 差异、WebView 生命周期、布局等） |
| [browser-tree-fix.md](./浏览器/browser-tree-fix.md) | development/browser-tree-fix | 树形目录选择与交互修复（4 条经验） |
| [browser-subdirectory-fix.md](./浏览器/browser-subdirectory-fix.md) | development/browser-subdirectory-fix | 子目录导航修复（4 条经验） |

### 浏览器自动化

| 文件 | 来源 | 说明 |
|------|------|------|
| [lessons.md](./浏览器自动化/lessons.md) | .opencode/skills/... | 21 条浏览器自动化调试记录（跨平台路径、Rust 工具链、CSS 优先级等） |
| [rules-lessons.md](./浏览器自动化/rules-lessons.md) | .agents/rules/browser-automation | 浏览器自动化规则 10 条经验 |
