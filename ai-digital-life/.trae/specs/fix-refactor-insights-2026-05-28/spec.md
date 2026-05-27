# 重构洞察修复计划 Spec

## Why
基于 2026-05-28 生成的重构洞察报告，报告中识别了 22 项架构、设计和性能问题。本计划针对全部问题制定系统性的优化/修复方案，分三个阶段逐步实施，以最小化风险并最大化长期演进收益。

## What Changes

### Phase 1 — 🔴 高风险高收益（优先执行）
1. **App.tsx 组件分解**：将 447 行的巨型组件拆分为 5 个独立 hook（`useDragDropWorkspace`、`usePatchReview`、`useEditorReveal`、`useThemeSync`、`useTaskCenterPolling`），使其缩减至 ~200 行的组合根组件。
2. **统一 post-mutation 刷新链**：在 `shared.ts` 中创建 `postMutationRefresh(get)` 组合函数，消除 8 个调用点的重复刷新链。
3. **提取泛型 expand/collapse 辅助函数**：消除 workspaceActions 与 gitActions 中 4 个函数的重复懒加载+并发批量展开模式。
4. **提取泛型 loadLazyData 辅助函数**：消除 `loadWorkspaceTree` 与 `loadGitSnapshot` 的 5 步模式重复。

### Phase 2 — 🟡 中等优先级（渐进式优化）
5. **统一错误处理模式**：建立统一的 error action 模式，修复 fetch 类 action 静默失败、mutation 类 action 不清理旧 error、以及错误值类型混用问题。
6. **创建 API 服务层**：在 `src/services/` 中创建 IPC 封装层，统一错误格式和超时处理。
7. **为 fetch 类 action 添加 loading 状态**：16+ 个 action 增加统一的 `isFetching` 指示器。
8. **清理 barrel re-export 文件**：重新组织 `right-panel/` 目录的 7 个 barrel 文件。
9. **删除废弃的 cacheUtils.ts**：全局替换导入路径后删除。
10. **修复 useRightPanelViewProps 粒度过粗问题**：将 45+ 字段的巨型 hook 按面板拆分。
11. **分解 useTerminalPanel（547行）**：按关注点拆分为多个子 hook。
12. **修复 Promise.allSettled 未检查 rejected**：为 3 处调用添加结果检查。
13. **修复 theme effect 的依赖粒度**：将依赖从 `appInfo` 缩小到具体字段。

### Phase 3 — 🟢 低优先级 + Rust 后端（结构性优化）
14. **拆分 workspace crate — 提取 outline**：将 outline 解析器拆分为独立 `adl-outline` crate。
15. **合并 context-engine + prompt-engine**：合并为 `adl-context` crate。
16. **拆分 terminal crate**：拆分为 `adl-command` + `adl-pty`。
17. **DB 连接池化**：将 `Arc<Mutex<Connection>>` 改为连接池。
18. **EntityTable 宏化**：消除手动同步风险。
19. **kernel glob re-export 优化**：按 domain 分路径导出。
20. **修复 LRU 缓存 delete+set 模式**：评估改用更高效的实现。
21. **修复 terminalTabs 全量替换**：改为不可变局部更新。
22. **补充 optimizeDeps.include**：将 manualChunks 中已有的 CM 包全部加入。

## Impact
- **Affected specs**: Store action 接口行为、UI 组件生命周期、Rust crate 依赖图
- **Affected code**: 前端 ~30 个文件、Rust 后端 ~15 个文件
- **Backward compatibility**: 除 Rust crate 拆分外，均保持 API 兼容。Rust crate 拆分涉及 Cargo.toml workspace members 变更及导入路径更新。

## ADDED Requirements

### Requirement: 统一后置刷新链
The system SHALL provide a single `postMutationRefresh(get)` function in shared.ts that consolidates the common refresh sequence (`refreshTaskCenter → fetchAuditEntries(40) → fetchCommandHistory → fetchGitStatus`).

#### Scenario: Feature parity after refactor
- **WHEN** any action previously invoked an inline refresh chain
- **THEN** it SHALL call `postMutationRefresh(get)` instead, producing identical side effects

### Requirement: 泛型懒加载辅助函数
The system SHALL provide `createLazyLoader<State, Data>(config)` factory that abstracts the 5-step lazy-load pattern (cache check → loading state → IPC call → error handling → data write).

#### Scenario: Feature parity after refactor
- **WHEN** `loadWorkspaceTree` or `loadGitSnapshot` is called
- **THEN** the 5-step logic SHALL be implemented via the shared factory, not inline

### Requirement: App.tsx hook 分解
App.tsx SHALL be decomposed into the following custom hooks, each with single responsibility:
- `useDragDropWorkspace`: 2 drag-drop useEffect (Tauri + browser) → ~85 行
- `usePatchReview`: 5 state vars, 2 useEffect, 5 useCallback → ~80 行
- `useEditorReveal`: 2 editor refs, 2 useEffect (reveal) → ~25 行
- `useThemeSync`: 1 useEffect → ~8 行
- `useTaskCenterPolling`: 1 useEffect → ~6 行

#### Scenario: Functionality preserved after decomposition
- **WHEN** the App component is mounted
- **THEN** all existing behaviors (drag-drop open workspace, patch review state, editor scroll-to-line, theme sync, task polling) SHALL work identically

## MODIFIED Requirements

### Requirement: Error Handling — Unified Pattern
The system SHALL establish a consistent error handling pattern across all 11 action modules:
- Every action SHALL clear `error` state on entry
- Every action SHALL capture errors via a unified `setError(actionName, message)` rather than inline conditionals
- Error value type SHALL be unified as `{ code: string; message: string }` instead of mixed IPC strings and literal Chinese strings

### Requirement: IPC Abstraction Layer
The system SHALL introduce a service layer in `src/services/` that wraps all `window.digitalLife.*` calls. Each action module SHALL import from the service layer rather than calling IPC directly. This is a medium-priority refactor — Phase 2.

## REMOVED Requirements

(No removals — all changes are additive or refactoring with preserved behavior)
