# Refactoring Knowledge

重构方法论、执行记录与架构改进经验，按子主题归类维护（不按时间归档）。

## 子主题

### [process/](./process/)

重构方法论、执行记录与阶段性总结。

| 文件 | 说明 |
|------|------|
| [refactoring-insight-execution-log.md](./process/refactoring-insight-execution-log.md) | 重构洞察执行记录汇编（第 8~12 次 + 2026-07-01 全流程执行：SDD 模式、行数验证、leaf module 破循环依赖等） |
| [refactoring-summary-2026-05.md](./process/refactoring-summary-2026-05.md) | 2026-05 重构总结汇编（05-30 修复计划 + 05-31 第二十轮） |
| [refactoring-summary-2026-06-01.md](./process/refactoring-summary-2026-06-01.md) | 第 1-30 轮重构任务汇总与经验 |
| [refactoring-lessons-2026-06-04.md](./process/refactoring-lessons-2026-06-04.md) | React 19 iframe 事件系统陷阱、Rust 依赖删除、TS 大小写、CSS transition:all |
| [refactoring-process-lessons.md](./process/refactoring-process-lessons.md) | 跨 4 轮重构的 16 条经验（CSS、React、Rust 等） |
| [refactoring-execution-2026-06-27.md](./process/refactoring-execution-2026-06-27.md) | SDD 子代理驱动重构、model-gateway 模块化、browserUrlUtils 提取 |
| [performance-optimization-lessons-2026-06-11.md](./process/performance-optimization-lessons-2026-06-11.md) | 性能优化经验总结（虚拟化、memo、选择器、代码分割、内存泄漏） |
| [high-risk-refactoring-2026-06-12.md](./process/high-risk-refactoring-2026-06-12.md) | 高风险重构经验（组件提取安全、切片拆分策略、Hook 拆散、跨包依赖） |
| [residual-architecture-cleanup-2026-06-09.md](./process/residual-architecture-cleanup-2026-06-09.md) | Phase 41-42 残余架构清理 8 领域经验（bridge 下沉、React.memo、clone 消除） |
| [refactor-round-68-2026-06-19.md](./process/refactor-round-68-2026-06-19.md) | CSS barrel 模式、Store 三层拆分、agent_pipeline 模块化、console.log 清理 |
| [execution-lessons.md](./process/execution-lessons.md) | 第 10 轮重构执行经验（CSS 截断、类型收窄、OnceLock 等） |
| [progress-summary.md](./process/progress-summary.md) | 第 1-17 轮重构进展汇总 |

### [store-ui/](./store-ui/)

Store 迁移、UI 状态重构、主题统一与 UI 恢复。

| 文件 | 说明 |
|------|------|
| [ui-store-migration-2026-06-07.md](./store-ui/ui-store-migration-2026-06-07.md) | UI Store 迁移与代码重构经验（状态迁移、组件更新、性能优化） |
| [ui-slice-navigator-refactor-2026-06-08.md](./store-ui/ui-slice-navigator-refactor-2026-06-08.md) | Navigator 方法移入 uiSlice 经验（单一职责、向后兼容、警告清理） |
| [styling-restoration-2026-05-27.md](./store-ui/styling-restoration-2026-05-27.md) | 文件树大纲样式恢复经验 |
| [theme-unified-management-2026-06-30.md](./store-ui/theme-unified-management-2026-06-30.md) | Theme 统一管理：ThemeController 唯一真实来源、useResolvedTheme hook、消除内联 matchMedia |
| [ui-restoration.md](./store-ui/ui-restoration.md) | UI 恢复经验（CSS 层叠、动画恢复、结构分层） |

### [architecture/](./architecture/)

Crate 拆分、模块分解、终端架构评估与持久化架构。

| 文件 | 说明 |
|------|------|
| [terminal-fix-2026-05-22.md](./architecture/terminal-fix-2026-05-22.md) | 终端功能修复总结 |
| [terminal-pty-evaluation.md](./architecture/terminal-pty-evaluation.md) | Terminal 与 PTY crate 职责边界评估报告 |
| [crate-split-and-dep-inversion-2026-06-08.md](./architecture/crate-split-and-dep-inversion-2026-06-08.md) | Crate 拆分与依赖倒置经验 |
| [component-extraction.md](./architecture/component-extraction.md) | 组件安全提取方法论（类型导入、Vite 缓存、export type 等） |
| [browser-module-decomposition-2026-06-29.md](./architecture/browser-module-decomposition-2026-06-29.md) | 浏览器模块分解与架构清理 |
| [provider-model-streaming-redesign-2026-07-07.md](./architecture/provider-model-streaming-redesign-2026-07-07.md) | Provider 动态注册系统、Model 选择路由、SSE 真实流式传输 |
| [persisted-state-registry-lessons-2026-09-21.md](./architecture/persisted-state-registry-lessons-2026-09-21.md) | 右侧面板 UI 状态持久化 8 条经验（剪枝参照清单就绪、persistField 补丁、单一定义） |
