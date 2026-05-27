# Tasks

## Phase 1 — 🔴 高风险高收益（优先执行）

- [x] **Task 1: App.tsx 组件分解为 5 个独立 hook**
  - [x] 创建 `useDragDropWorkspace` hook，将 Tauri 和 browser 两个 drag-drop useEffect 移入
  - [x] 创建 `usePatchReview` hook，移入 patch 相关 5 个 state var + 2 个 useEffect + 5 个 useCallback
  - [x] 创建 `useEditorReveal` hook，移入 2 个 editor reveal useEffect
  - [x] 创建 `useThemeSync` hook，移入 theme apply useEffect（同时修复依赖粒度过粗问题）
  - [x] 创建 `useTaskCenterPolling` hook，移入 task center 5s 定时轮询 useEffect
  - [x] 更新 App.tsx 引用新 hook，组件缩减至 ~200 行
  - **验证**: `npm run typecheck` + `npm test` 通过

- [x] **Task 2: 统一 post-mutation 刷新链**
  - [x] 在 `shared.ts` 中创建 `postMutationRefresh(get)` 函数，合并 3-5 个刷新调用
  - [x] 替换 taskActions.ts:19-21 的 inline 刷新链
  - [x] 替换 patchActions.ts:59-62 的 inline 刷新链
  - [x] 替换 commandActions.ts:21-24 的 inline 刷新链
  - [x] 替换 streamActions.ts:143-149 和 gitActions.ts:9-17 的 Promise.allSettled 调用（同时修复未检查 rejected 问题）
  - **验证**: `npm run typecheck` + `npm test` 通过

- [x] **Task 3: 提取泛型 expand/collapse 辅助函数**
  - [x] 在 `shared.ts` 中创建 `batchExpandAll` 函数
  - [x] 重构 `workspaceActions.expandAllWorkspaceTreesInFileNav` 使用新函数
  - [x] 重构 `gitActions.expandAllWorkspaceChanges` 使用新函数
  - [x] 重构 `workspaceActions.expandWorkspaceTreeInFileNav` 使用新函数
  - [x] 重构 `gitActions.expandWorkspaceChangesInFileNav` 使用新函数
  - **验证**: `npm run typecheck` + `npm test` 通过

- [x] **Task 4: 提取泛型 loadLazyData 工厂函数**
  - [x] 在 `shared.ts` 中创建 `createLazyLoader<State, Data>(config)` 函数
  - [x] 重构 `workspaceActions.loadWorkspaceTree` 使用工厂
  - [x] 重构 `gitActions.loadGitSnapshot` 使用工厂
  - **验证**: `npm run typecheck` + `npm test` 通过

- [x] **Task 5: 修复 changePreviewLoading 死代码**
  - [x] 在 `openChangePreviewGeneric` 进入异步读取前添加 `set({ changePreviewLoading: true })`
  - [x] 验证清理/失败路径设回 `false`
  - **验证**: `npm run typecheck` + `npm test` 通过

## Phase 2 — 🟡 中等优先级（渐进式优化）

- [x] **Task 6: 统一错误处理模式**
  - [x] 在 `shared.ts` 中添加 `clearError(get)`、`captureError(get, error)`、`setError(get, message)` 工具函数
  - [x] 统一 error 值类型为通用格式
  - [x] 修复所有 7 个 fetch action 的静默失败问题
  - [x] 修复所有 10+ 个 mutation action 的 error 未清理问题
  - [x] 修复 streamActions 中混用中文字符串作为错误值的问题
  - **验证**: `npm run typecheck` + `npm test` 通过

- [x] **Task 7: 为 fetch 类 action 添加 loading 状态**
  - [x] 在 `StoreState` 中添加 `isFetching: Record<string, boolean>` 字段
  - [x] 在 fetch action 入口/出口更新 `isFetching` 状态
  - **验证**: `npm run typecheck` + `npm test` 通过

- [x] **Task 8: 清理 barrel re-export 文件**
  - [x] 检查并更新消费方 import 路径，移除对根目录 barrel 的依赖
  - [x] 删除 7 个 barrel 文件
  - **验证**: `npm run typecheck` + `npm test` 通过，无 broken import

- [x] **Task 9: 删除废弃 cacheUtils.ts**
  - [x] 全局搜索 `cacheUtils` 导入引用，逐一替换为 `shared.ts` 导入
  - [x] 删除 `cacheUtils.ts` 文件
  - **验证**: `npm run typecheck` + `npm test` 通过

- [x] **Task 10: 修复 useRightPanelViewProps 粒度过粗**
  - [x] 评估当前 45+ 字段的 viewProps 结构
  - [x] 按面板拆分 viewProps，每个面板使用独立的自定义 hook 订阅所需字段
  - [x] 重构 RightPanel 组件，消除不必要的大 props 对象透传
  - **验证**: `npm run typecheck` + `npm test` 通过，RightPanel 功能不变

- [x] **Task 11: 分解 useTerminalPanel（547行）**
  - [x] 提取 `useTerminalPtyLifecycle` — PTY 生命周期
  - [x] 提取 `useTerminalDragDrop` — 拖拽排序
  - [x] 提取 `useTerminalMenus` — 菜单管理
  - [x] 精简后的 `useTerminalPanel` 作为组合层，调用上述子 hook
  - **验证**: `npm run typecheck` + `npm test` 通过，终端功能不变

- [x] **Task 12: 修复 allSettled 结果检查**（已与 Task 2 合并，在 `postMutationRefresh` 中统一处理）
  - **验证**: 随 Task 2 验证

- [x] **Task 13: 修复 theme effect 依赖粒度**（已与 Task 1 合并，在 `useThemeSync` 中处理）
  - **验证**: 随 Task 1 验证

- [x] **Task 14: 补充 optimizeDeps.include**
  - [x] 将 `vite.config.ts` 中 manualChunks 已有的 CM 包全部加入 `optimizeDeps.include`
  - **验证**: 类型检查通过

## Phase 3 — 🟢 低优先级 + Rust 后端

- [x] **Task 15: 拆分 workspace crate — 提取 outline**
  - [x] 创建 `crates/outline/` 新 crate，将 `workspace/src/outline/` 的 11 个解析器移入
  - [x] 创建 `Cargo.toml`，依赖 `adl-errors` + `adl-kernel`
  - [x] 更新根 workspace `Cargo.toml` members 列表
  - [x] 更新 workspace crate 的 import 为 `adl_outline::outline`
  - **验证**: `cargo check --workspace` 通过

- [x] **Task 16: 合并 context-engine + prompt-engine**
  - [x] 创建新 `crates/context/`，合并 context-engine 和 prompt-engine 的 lib.rs
  - [x] 更新根 workspace `Cargo.toml` members
  - [x] 更新 agent-runtime 的 import
  - [x] 删除旧的 `crates/context-engine/` 和 `crates/prompt-engine/`
  - **验证**: `cargo check --workspace` 通过

- [x] **Task 17: 拆分 terminal crate**
  - [x] 创建 `crates/command/` — 审批化命令执行
  - [x] 创建 `crates/pty/` — PTY 会话管理
  - [x] 更新根 workspace `Cargo.toml` members
  - [x] 更新上游依赖
  - **验证**: `cargo check --workspace` 通过

- [x] **Task 18: DB 连接池化**
  - [x] 在 `storage/Cargo.toml` 中添加 `r2d2-sqlite` 依赖
  - [x] 重构 `Database` struct 使用连接池替代 `Arc<Mutex<Connection>>`
  - [x] 更新所有 consumer 对 conn() 的调用方式
  - **验证**: `cargo test --workspace` 通过（99 tests pass）

- [x] **Task 19: EntityTable 宏化**
  - [x] 创建 declarative macro 从单一定义点生成 enum + 表名数组 + index 映射
  - [x] 替换当前的 `TABLE_NAMES` 手动维护数组
  - **验证**: `cargo test --workspace` 通过（105 tests pass）

- [x] **Task 20: kernel glob re-export 优化**
  - [x] 按 domain 分组选择性 re-export
  - [x] 保留 `pub use types::*` 作为向后兼容的便利导入
  - **验证**: `cargo check --workspace` 通过，无 broken import

- [x] **Task 21: LRU 缓存 delete+set 模式优化**
  - [x] 评估并实施优化：删除访问计数提升逻辑，每次 get 直接 delete+set
  - [x] 删除 `accessCount` Map 和 `ACCESS_PROMOTE_THRESHOLD` 常量
  - **验证**: `npm run typecheck` + `npm test` 通过

- [x] **Task 22: terminalTabs 全量替换优化**
  - [x] 在 terminalSlice 中实现引用稳定性检查
  - **验证**: `npm run typecheck` + `npm test` 通过

# Task Dependencies
- [Task 12] depends on [Task 2]（已合并）
- [Task 13] depends on [Task 1]（已合并）
- [Task 15] depends on workspace crate 现有代码 — 无前置依赖
- [Task 16] depends on context-engine & prompt-engine 代码 — 无前置依赖
- [Task 17] depends on terminal crate 现有代码 — 无前置依赖
- 所有 Phase 1 任务互不依赖，可并行执行
- Phase 2 任务可独立并行执行
- Phase 3 的 Rust 后端任务可独立并行执行
