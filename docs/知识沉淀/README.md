# 知识沉淀

本目录集中管理全项目的**总结性知识**与**经验教训**，按领域分类维护。

## 目录结构

| 目录 | 内容 | 文件数 |
|------|------|--------|
| [重构](./重构/) | 重构方法论、组件提取、执行报告、阶段性总结 | 11 |
| [多工作区](./多工作区/) | 多工作区开发中的变更面板、文件树、终端、布局等经验 | 9 |
| [浏览器](./浏览器/) | 内置浏览器实现、空标签引导页、树形目录交互等经验 | 7 |
| [代码质量](./代码质量/) | 全量代码质量检测与修复经验 | 7 |
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
| [refactoring-lessons-2026-06-04.md](./重构/refactoring-lessons-2026-06-04.md) | 重构洞察 2026-06-03 执行 | React 19 iframe 事件系统陷阱、Rust 依赖删除、TS 大小写、CSS transition:all |
| [progress-summary.md](./重构/progress-summary.md) | 重构洞察 | 第 1-17 轮重构进展汇总 |
| [summary-2026-05-31.md](./重构/summary-2026-05-31.md) | 重构洞察 | 2026-05-31 重构总结 |
| [summary-2026-05-30.md](./重构/summary-2026-05-30.md) | 重构洞察 | 2026-05-30 重构总结 |
| [terminal-fix-2026-05-22.md](./重构/terminal-fix-2026-05-22.md) | 重构洞察 | 终端功能修复总结 |
| [styling-restoration-2026-05-27.md](./重构/styling-restoration-2026-05-27.md) | 重构洞察 | 文件树大纲样式恢复经验 |
| [ui-store-migration-2026-06-07.md](./重构/ui-store-migration-2026-06-07.md) | 2026-06-07 重构 | UI Store 迁移与代码重构经验（状态迁移、组件更新、性能优化） |
| [uiSliceNavigatorRefactor-2026-06-08.md](./重构/uiSliceNavigatorRefactor-2026-06-08.md) | 2026-06-08 重构 | Navigator 方法移动到 uiSlice 经验（单一职责原则、向后兼容、警告清理） |

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
| [changes-panel-alignment-fix.md](./多工作区/changes-panel-alignment-fix.md) | 2026-06-07 UI 优化 | 变更面板文件行对齐优化（组件拆分、CSS 间距调整） |
| [changes-panel-stats-button-alignment-fix-2026-06-07.md](./多工作区/changes-panel-stats-button-alignment-fix-2026-06-07.md) | 2026-06-07 UI 优化 | 变更面板统计按钮居中对齐 + TypeScript 导入大小写修复 |

### 浏览器

| 文件 | 来源 | 说明 |
|------|------|------|
| [builtin-browser.md](./浏览器/builtin-browser.md) | architecture/builtin-browser-implementation | 内置浏览器实现 16 条经验（Tauri 差异、WebView 生命周期、布局等） |
| [browser-link-interception.md](./浏览器/browser-link-interception.md) | 浏览器实现 | 浏览器链接拦截处理经验 |
| [browser-tree-fix.md](./浏览器/browser-tree-fix.md) | development/browser-tree-fix | 树形目录选择与交互修复（4 条经验） |
| [browser-subdirectory-fix.md](./浏览器/browser-subdirectory-fix.md) | development/browser-subdirectory-fix | 子目录导航修复（4 条经验） |
| [browser-navigate-fix-2026-06-04.md](./浏览器/browser-navigate-fix-2026-06-04.md) | 2026-06-04 修复执行 | 浏览器模式下 URL 无法加载修复（无活动标签页创建逻辑、调试经验与调试手段） |
| [browser-url-sync-fix-2026-06-04.md](./浏览器/browser-url-sync-fix-2026-06-04.md) | 2026-06-04 修复执行 | 浏览器 URL 同步修复经验 |
| [browser-landing-page-2026-06-08.md](./浏览器/browser-landing-page-2026-06-08.md) | 2026-06-08 新功能 | 浏览器空标签引导页实现总结（端口扫描、UI 标准、组件架构） |

### 代码质量

| 文件 | 来源 | 说明 |
|------|------|------|
| [code-quality-detection-and-fix.md](./代码质量/code-quality-detection-and-fix.md) | 全仓库代码质量检测与修复执行 | 7 条经验（React 19 hooks、React.memo、CodeMirror 重建、Rust clippy 等） |
| [eslint-prettier-ts-cleanup-2026-06-04.md](./代码质量/eslint-prettier-ts-cleanup-2026-06-04.md) | 四维门禁清零执行 | 6 条经验（`_param` 解构陷阱、`any`→具体类型级联错误、组件拆分、图书馆接等） |
| [syntax-highlighting-fix-2026-06-05.md](./代码质量/syntax-highlighting-fix-2026-06-05.md) | 2026-06-05 修复执行 | 变更面板语法高亮修复（CodeMirror Facet 多实例、pnpm 传递依赖陷阱、Vite 预构建缓存） |
| [diff-viewer-theme-fix-2026-06-06.md](./代码质量/diff-viewer-theme-fix-2026-06-06.md) | 2026-06-06 修复执行 | 差异查看器主题修复（CSS 选择器覆盖不足、硬编码值、内容/行号区层级）与无变更行自动折叠启用 |
| [diff-viewer-gutter-hover-fix-2026-06-08.md](./代码质量/diff-viewer-gutter-hover-fix-2026-06-08.md) | 2026-06-08 修复执行 | 差异查看器并排模式 A 侧行号区悬停颜色修复（`EditorView.editorAttributes` DOM 类归属判断） |

### 浏览器自动化

| 文件 | 来源 | 说明 |
|------|------|------|
| [lessons.md](./浏览器自动化/lessons.md) | .opencode/skills/... | 21 条浏览器自动化调试记录（跨平台路径、Rust 工具链、CSS 优先级等） |
| [rules-lessons.md](./浏览器自动化/rules-lessons.md) | .agents/rules/browser-automation | 浏览器自动化规则 10 条经验 |
