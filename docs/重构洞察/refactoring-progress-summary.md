# 2026-05-27 重构执行总结

## 范围

共 **36 项**重构任务，覆盖 6 个 Phase，横跨前端（React/TypeScript）和后端（Rust）。

| Phase | 任务数 | 主题 |
|-------|--------|------|
| Phase 1 | 6 | 快赢修复（代码重复、死代码、类型安全） |
| Phase 2 | 9 | 渲染性能 + Rust 优化 |
| Phase 3 | 4 | CSS 文件拆分（~6,463 行 → 14 个模块化文件） |
| Phase 4 | 4 | Bundle 体积优化（CM 动态导入、highlight.js 按需） |
| Phase 5 | 3 | Action 职责边界清理 |
| Phase 6 | 10 | 长期架构债务（Store 迁移、Props 拆分、types.rs 拆分） |

## 关键成果

### 代码质量
- 消除 ~200 行右键菜单重复（`useFileContextMenu` hook）
- 消除 12 行 Git 刷新重复（`refreshAfterBranchChange`）
- 消除 22 个 Rust `.clone()` 调用（`From` trait）
- 消除 ~50 行搜索重复（`FnMut` 取消模式）
- 4 处 `as any` → 类型安全
- 2 处死代码删除

### 渲染性能
- 7 个核心组件包裹 `React.memo`
- `acceptAllHunks`/`rejectAllHunks`：N 次 `set()` → 1 次
- `openFileGeneric`：2 次 `set()` → 1 次
- `openTabsByPath` Record：O(n) → O(1) 查找
- `useShallow` 包裹 Record 类型选择器

### CSS 架构
- 4 个巨型 CSS 文件（总计 ~6,463 行）拆分为 14 个模块化文件
- 34 个硬编码 hex 颜色迁移到 `tokens.css` 语义化 Token
- 修复文件类型图标垂直居中
- 隔离文件树和文档大纲的独立样式（不同按钮大小、连接线位置、悬停效果）

### Store 架构
- 面板布局状态：`ui-store.ts` → `uiSlice`（6 字段 + 9 setter）
- `indexingStatus`/`repoMap`：`workspaceSlice` → `diagnosticSlice`
- `activeTool` → `activeRightTool` 统一命名
- `workspaceTree` 废弃字段完全移除（7 个文件）
- 终端字段标记 `@deprecated`，指向 `terminalSlice`
- 新建 `searchActions.ts`、`taskActions.ts`、`commandActions.ts`
- 提取 `localStorageUtils.ts`、`storageScheduler.ts`
- 16 个消费者文件从 `useUiStore` 迁移到 `useAppStore`

### Rust 架构
- `kernel/types.rs`（1,286 行）拆分为 7 个领域文件
- `IGNORED_DIRS` 改为 `HashSet` O(1) 查找
- `adl-terminal` 确认零 Tauri 依赖
- 事件工厂 `run_activity_event()` 消除 5 处内联 `json!()`

## 验证

| 套件 | 结果 |
|------|------|
| TypeScript typecheck (`tsc --noEmit`) | ✅ exit 0 |
| Vitest (183 tests) | ✅ 183/183 |
| Cargo check (15 crates) | ✅ 零错误 |
| Cargo test (全部) | ✅ 全部 passed |

## 遗留项（移至后续迭代）

- T6.2 尾段：`ui-store.ts` 终端状态最终移除（当前已 `@deprecated`）
- 合并最终用户反馈后剩余的 CSS 微调
- 长期：`ui-store.ts` 剩余状态（菜单/浏览器/设置）迁移到 `uiSlice`
