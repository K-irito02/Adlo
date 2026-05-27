# 检查清单

## Phase 1 — 🔴 高风险高收益

### Task 1: App.tsx 组件分解
- [x] `useDragDropWorkspace` hook 创建且正确移入了 Tauri 和 browser 两个 drag-drop useEffect
- [x] `usePatchReview` hook 创建且正确移入了 patch 相关 state、useEffect、useCallback
- [x] `useEditorReveal` hook 创建且正确移入了 editor reveal useEffect
- [x] `useThemeSync` hook 创建且正确移入了 theme apply useEffect（依赖缩小为具体字段）
- [x] `useTaskCenterPolling` hook 创建且正确移入了 5s 轮询 useEffect
- [x] App.tsx 引用新 hook，组件缩减至 ~200 行
- [x] `npm run typecheck` 通过
- [x] `npm test` 通过

### Task 2: 统一 post-mutation 刷新链
- [x] `postMutationRefresh(get)` 函数在 shared.ts 中定义
- [x] taskActions.ts 刷新链替换
- [x] patchActions.ts 刷新链替换
- [x] commandActions.ts 刷新链替换
- [x] streamActions.ts 和 gitActions.ts 的 Promise.allSettled 替换（含 rejected 检查）
- [x] `npm run typecheck` 通过
- [x] `npm test` 通过

### Task 3: 泛型 expand/collapse 辅助函数
- [x] `batchExpandAll` 函数在 shared.ts 中定义
- [x] workspaceActions 中 2 个函数重构使用新函数
- [x] gitActions 中 2 个函数重构使用新函数
- [x] `npm run typecheck` 通过
- [x] `npm test` 通过

### Task 4: 泛型 loadLazyData 工厂函数
- [x] `createLazyLoader` 工厂函数在 shared.ts 中定义
- [x] `loadWorkspaceTree` 重构使用工厂
- [x] `loadGitSnapshot` 重构使用工厂
- [x] `npm run typecheck` 通过
- [x] `npm test` 通过

### Task 5: changePreviewLoading 修复
- [x] 异步读取前设置 `changePreviewLoading: true`
- [x] 成功/失败路径设回 `false`
- [x] `npm run typecheck` 通过
- [x] `npm test` 通过

## Phase 2 — 🟡 中等优先级

### Task 6: 统一错误处理模式
- [x] `clearError(get)`、`captureError(get, error)`、`setError(get, message)` 工具函数已添加
- [x] error 值类型统一为通用格式
- [x] 7 个 fetch action 静默失败问题已修复
- [x] 10+ 个 mutation action error 未清理问题已修复
- [x] streamActions 中中文字符串错误值已替换
- [x] `npm run typecheck` 通过
- [x] `npm test` 通过

### Task 7: fetch 类 action loading 状态
- [x] `isFetching: Record<string, boolean>` 已在 StoreState 中定义
- [x] fetch action 入口/出口更新 `isFetching` 状态
- [x] `npm run typecheck` 通过
- [x] `npm test` 通过

### Task 8: 清理 barrel re-export
- [x] 7 个 barrel 文件已清理（删除）
- [x] 所有消费方 import 路径已更新
- [x] `npm run typecheck` 通过
- [x] `npm test` 通过

### Task 9: 删除废弃 cacheUtils.ts
- [x] 全局搜索替换 `cacheUtils` 导入为 `shared` 导入
- [x] `cacheUtils.ts` 已删除
- [x] `npm run typecheck` 通过
- [x] `npm test` 通过

### Task 10: useRightPanelViewProps 粒度过粗修复
- [x] viewProps 按面板拆分
- [x] 各面板使用独立 hook 订阅所需字段
- [x] RightPanel 不再透传大 props 对象
- [x] `npm run typecheck` 通过
- [x] `npm test` 通过

### Task 11: useTerminalPanel 分解
- [x] `useTerminalPtyLifecycle` 提取完成
- [x] `useTerminalDragDrop` 提取完成
- [x] `useTerminalMenus` 提取完成
- [x] useTerminalPanel 作为组合层调用子 hook
- [x] `npm run typecheck` 通过
- [x] `npm test` 通过

### Task 12: allSettled 检查（已合并到 Task 2）
- [x] 随 Task 2 验证通过

### Task 13: theme effect 依赖（已合并到 Task 1）
- [x] 随 Task 1 验证通过

### Task 14: optimizeDeps.include 补充
- [x] manualChunks 中所有 CM 包已加入 `optimizeDeps.include`
- [x] 类型检查通过

## Phase 3 — 🟢 低优先级 + Rust 后端

### Task 15: 拆分 workspace crate — 提取 outline
- [x] `crates/outline/` 创建，11 个解析器移入
- [x] Cargo.toml 配置正确（依赖 adl-errors + adl-kernel）
- [x] 根 workspace Cargo.toml members 更新
- [x] workspace crate import 更新为 `adl_outline::outline`
- [x] `cargo check --workspace` 通过

### Task 16: 合并 context-engine + prompt-engine
- [x] `crates/context/` 创建，合并两个 lib.rs
- [x] 根 workspace Cargo.toml members 更新
- [x] agent-runtime import 更新
- [x] 旧 crate 目录已删除
- [x] `cargo check --workspace` 通过

### Task 17: 拆分 terminal crate
- [x] `crates/command/` 创建
- [x] `crates/pty/` 创建
- [x] 根 workspace Cargo.toml members 更新
- [x] 上游依赖更新
- [x] `cargo check --workspace` 通过

### Task 18: DB 连接池化
- [x] r2d2-sqlite 依赖添加
- [x] Database struct 使用连接池（max_size=8）
- [x] 所有 consumer conn() 调用方式更新
- [x] `cargo test --workspace` 通过（99 tests pass）

### Task 19: EntityTable 宏化
- [x] 宏从单一定义点生成 enum + 表名数组 + index 映射
- [x] 替换当前手动维护数组
- [x] `cargo test --workspace` 通过（105 tests pass）

### Task 20: kernel glob re-export 优化
- [x] 按 domain 分组选择性 re-export
- [x] 保留向后兼容的便利导入 `pub use types::*`
- [x] `cargo check --workspace` 通过，无 broken import

### Task 21: LRU 缓存优化
- [x] 评估完成：删除访问计数提升逻辑，每次 get 直接 delete+set
- [x] 删除 `accessCount` Map 和 `ACCESS_PROMOTE_THRESHOLD`
- [x] `npm run typecheck` 通过
- [x] `npm test` 通过

### Task 22: terminalTabs 全量替换优化
- [x] terminalSlice 实现引用稳定性检查
- [x] `npm run typecheck` 通过
- [x] `npm test` 通过
