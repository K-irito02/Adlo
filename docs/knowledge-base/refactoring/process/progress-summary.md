# 重构执行总结（截至第十七轮）

> 第十八轮以后详情见 `REFACTORING_PROGRESS_REPORT.md`（原文已归档）。

## 范围

共 **58 项**重构任务（前 16 轮 36 项 + 第十七轮 22 项），覆盖 7 个 Phase，横跨前端（React/TypeScript）和后端（Rust）。

| Phase | 任务数 | 主题 |
|-------|--------|------|
| Phase 1 | 6 | 快赢修复（代码重复、死代码、类型安全） |
| Phase 2 | 9 | 渲染性能 + Rust 优化 |
| Phase 3 | 4 | CSS 文件拆分（~6,463 行 → 14 个模块化文件） |
| Phase 4 | 4 | Bundle 体积优化（CM 动态导入、highlight.js 按需） |
| Phase 5 | 3 | Action 职责边界清理 |
| Phase 6 | 10 | 长期架构债务（Store 迁移、Props 拆分、types.rs 拆分） |
| Phase 7 | 22 | 架构深度重构（Rust crate 17→19、Store 增强、5 个新 Hook、DB 连接池等） |

## 关键成果

### 第十七轮新增（2026-05-28）

| 类别 | 改进项 |
|------|--------|
| **App.tsx 重构** | 447 → 203 行，提取 5 个自定义 Hook（useDragDropWorkspace / usePatchReview / useEditorReveal / useThemeSync / useTaskCenterPolling） |
| **shared.ts 工具函数** | 7 个新函数（refreshSideEffects / batchExpandAll / loadLazyData / sessionMutate 等），消除 8 处重复刷新链、60+ 行重复展开、90% lazy-load 重复 |
| **Rust crate 架构** | 17 → 19 crate（新增 adl-outline / adl-context / adl-command / adl-pty，移除 context-engine / prompt-engine） |
| **DB 连接池** | Arc\<Mutex\> → r2d2，支持并发读取 |
| **useRightPanelViewProps** | 300 → 55 行，45+ 字段 → 7 个 per-panel hook |
| **useTerminalPanel 拆分** | 547 → 290 行，3 个子 hook |
| **统一错误处理** | 16+ fetch action 添加 isFetching；error 类型统一为结构化对象 |
| **Barrel 清理** | 删除 7 个 barrel re-export + cacheUtils.ts（deprecated） |
| **EntityTable 宏化** | 20 变体 enum 宏生成，消除 3 处手动同步风险 |
| **LRU 缓存简化** | 移除 access count 重哈希，利用 Map 原生语义 |
| **optimizeDeps** | 13 个 CodeMirror 包全入预打包，减少冷启动 ESM 请求数 |
| **terminalSlice 引用稳定性** | 拖拽排序全量替换 → splice + immutably 更新 |
| **Promise.allSettled 检查** | 3 处静默丢弃 → 收集失败原因合并展示 |

### 代码质量（累计）
- 消除 ~200 行右键菜单重复（`useFileContextMenu` hook）
- 消除 12 行 Git 刷新重复（`refreshAfterBranchChange`）
- 消除 22 个 Rust `.clone()` 调用（`From` trait）
- 消除 ~50 行搜索重复（`FnMut` 取消模式）
- 4 处 `as any` → 类型安全
- 2 处死代码删除
- 7 个 barrel re-export 文件清理 + 1 个 deprecated 文件删除

### 渲染性能（累计）
- 7 个核心组件包裹 `React.memo`
- `acceptAllHunks`/`rejectAllHunks`：N 次 `set()` → 1 次
- `openFileGeneric`：2 次 `set()` → 1 次
- `openTabsByPath` Record：O(n) → O(1) 查找
- `useShallow` 包裹 Record 类型选择器
- useRightPanelViewProps 300→55 行，7 个 per-panel hook 细粒度订阅
- useTerminalPanel 547→290 行，3 个子 hook 按关注点拆分
- terminalSlice 拖拽排序全量替换 → immutably 更新
- LRU 缓存移除 access count 重哈希

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
- 统一 error 处理模式：入口清 error，出口捕获后走 `setError(actionName, message)`
- 16+ fetch action 添加 `isFetching` 状态（按 key 的 Map）

### Rust 架构
- `kernel/types.rs`（1,286 行）拆分为 7 个领域文件
- `IGNORED_DIRS` 改为 `HashSet` O(1) 查找
- `adl-terminal` 确认零 Tauri 依赖
- 事件工厂 `run_activity_event()` 消除 5 处内联 `json!()`
- Crate 架构 DAG 优化：17→19 crate（新增 adl-outline / adl-context / adl-command / adl-pty，移除 context-engine / prompt-engine）
- DB 连接池化：Arc\<Mutex\> → r2d2
- EntityTable 宏生成：20 变体 enum 单一定义点

## 验证

| 套件 | 结果 |
|------|------|
| TypeScript typecheck (`tsc --noEmit`) | ✅ exit 0 |
| Vitest (183 tests) | ✅ 183/183 |
| Cargo check (19 crates) | ✅ 零错误 |
| Cargo test (全部) | ✅ 全部 passed |
| 新增 crate | `adl-outline`、`adl-context`、`adl-command`、`adl-pty` |
| 移除 crate | `context-engine`、`prompt-engine` |
| 新建前端文件 | 5 个新 Hook + 7 个 per-panel hook + 3 个子 hook |
| 删除前端文件 | 7 个 barrel 文件 + `cacheUtils.ts` |
| DB 架构升级 | Arc\<Mutex\> → r2d2 连接池 |
| 前端行净减少 | App.tsx 447→203, useRightPanelViewProps 300→55, useTerminalPanel 547→290 |

## 遗留项（移至后续迭代）

- T6.2 尾段：`ui-store.ts` 终端状态最终移除（当前已 `@deprecated`）
- 合并最终用户反馈后剩余的 CSS 微调
- 长期：`ui-store.ts` 剩余状态（菜单/浏览器/设置）迁移到 `uiSlice`
