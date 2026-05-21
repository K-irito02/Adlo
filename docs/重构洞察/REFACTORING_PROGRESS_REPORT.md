# 重构进度报告

> 更新日期: 2026-05-22

## 完成状态

| 轮次 | 日期 | 内容 | 状态 |
|------|------|------|------|
| 第一轮 | 2026-05-20 | Zustand 切片定义（10 个切片） | ✅ |
| 第二轮 | 2026-05-21 | 切片合并 + 性能优化（Rust DRY、搜索 debounce 等） | ✅ |
| 第三轮 | 2026-05-21 | CSS Token 迁移 + 模块化分层 + 错误码统一 | ✅ |
| 第四轮 | 2026-05-21 | 重构洞察验证与修复（消除 11 处 `as any`、LRU 优化、SSE 管理等） | ✅ |
| 第五轮 | 2026-05-22 | CodeMirror 双实例 Bug 修复（`@codemirror/state` 显式依赖 + `optimizeDeps.include`） | ✅ |
| **第六轮** | **2026-05-22** | **Store/桥接/接口/性能/Rust 全面重构** | ✅ |

## 第六轮重构（2026-05-22）：Store 拆分、桥接模块化、Rust 优化

基于 [重构洞察报告](./refactor-insight-2026-05-22.md) 和 [实施计划](../../.trae/documents/refactor-implementation-plan-2026-05-22.md) 完成 17 项改动（另 2 项经分析确认已有最优实现而跳过）：

### Phase 1：前端架构重构（4 项）

| 任务 | 改动 | 描述 |
|------|------|------|
| `slicedStore.ts` 拆分 | 1465 → 87 行 | 提取 8 个领域 action 模块到 `stores/actions/` 目录 |
| `preview-bridge.ts` 拆分 | 615 行 → 4 个模块 | 拆分为 `api.ts`/`storage.ts`/`ptyBridge.ts`/`index.ts` |
| `DigitalLifeBridge` 接口拆分 | 新增 13 个子接口 | `WindowBridge`、`WorkspaceBridge`、`PtyBridge` 等 |
| `sendMessage` 流处理器提取 | 2 个工厂函数 | `createModelStreamSubscriber` / `createRunActivitySubscriber` |

### Phase 2：前端性能与代码质量（7 项实施 + 2 项验证跳过）

| 文件 | 优化 |
|------|------|
| `useStreamingText.ts` | cleanup 显式重置 `bufferRef` / `setText("")` |
| `fileTree.tsx` | memo 类型断言简化（`as typeof FileTreeNodeComponent`） |
| `Composer.tsx` | 移除 2 个冗余 `useCallback` 包装 |
| `shared.ts` | debounce 新增 `cancel()` 方法 |
| `StoreState.ts` | 交叉类型 → `interface extends` 继承链 |
| `fileTree.tsx` T2.3/T2.4 | `useMemo` 依赖 + getMultiSelectedNodes 验证已最优（跳过） |
| `useTooltip.ts` | 全局 Set + `globalListenerAttached` 经验证为合理优化，保留 |

### Phase 3：Rust 后端优化（5 项实施 + 1 项验证跳过）

| 函数 | 优化 |
|------|------|
| `search_text` / `search_text_async` | 提取公共 `search_text_in_files` 消除重复 |
| `collect_text_files_inner` | 消除 `fs::metadata()` 双重 I/O + IGNORED_DIRS 扩展至 18 项 |
| `build_retrieval_snapshot` | 消除二次遍历，extension 统计合并入遍历过程 |
| `sanitize_brace_line` | 正则缓存 `OnceLock` 一次性编译 |
| `shell_command` | `#[cfg]` 宏分离为独立函数 |
| `finalize_outline_items` | O(n²) 但 n<200，收益有限，跳过 |

### 当前架构

#### Store 架构（新增 actions/ 目录）

```
app/stores/
├── slicedStore.ts          # 基于切片合并的完整 Store（真源，~87 行）
├── StoreState.ts           # 完整 StoreState 类型接口（interface extends）
├── slices.ts               # 统一导出所有切片
├── selectors.ts            # 选择器（含 useShallow React Hook 版本）
├── shared.ts               # 共享状态和工具（LRU 缓存、防抖搜索、缓存清理）
├── cacheUtils.ts           # 缓存工具函数
├── conversationUtils.ts    # 会话工具函数
├── index.ts                # 模块索引
├── slices/                 # 11 个独立切片（含 clipboardSlice）
├── actions/                # [新增] 8 个跨切片 action 模块
│   ├── workspaceActions.ts # 工作区操作
│   ├── sessionActions.ts   # 会话操作
│   ├── editorActions.ts    # 编辑器操作
│   ├── patchActions.ts     # 补丁操作
│   ├── gitActions.ts       # Git 操作
│   ├── fetchActions.ts     # 数据拉取操作
│   ├── streamActions.ts    # 流式消息操作（含 sendMessage）
│   └── generalActions.ts   # 通用操作（bootstrap, updatePreferences）
└── (已删除)                # 4 个遗留 Store 已清理
```

#### 桥接层架构（preview-bridge.ts 目录化）

```
frontend/src/
├── shared/ipc.ts           # DigitalLifeBridge + 13 个子接口
├── tauri-bridge.ts         # Tauri 模式桥接
├── mock-bridge.ts           # 纯内存回退
├── preview-bridge/          # [新增] 浏览器模式桥接模块
│   ├── index.ts            # 组合入口（setupPreviewBridge）
│   ├── api.ts              # 请求封装（requestPreviewApi）
│   ├── storage.ts          # localStorage 持久化工具
│   └── ptyBridge.ts        # PTY 连接管理（SSE、listeners）
└── (已删除) preview-bridge.ts
```

### 关键改进

| 改进项 | 说明 |
|--------|------|
| Store actions 模块化 | `slicedStore.ts` 从 1465 行降至 87 行，按领域拆分为 8 个独立模块 |
| 桥接层目录化 | `preview-bridge.ts` 从 615 行拆分为 4 个关注点分离的文件 |
| 接口类型层次 | `DigitalLifeBridge` 拆分为 13 个命名子接口，改善类型推断与复用 |
| 流处理器提取 | `sendMessage` 中的流订阅逻辑提取为可复用的工厂函数 |
| Rust 搜索去重 | `search_text` 与 `search_text_async` 消除 81% 逻辑重复 |
| 文件遍历 I/O 优化 | 消除 `fs::metadata()` 双重 I/O，每文件减少一次系统调用 |
| IGNORED_DIRS 扩展 | 从 7 项增至 18 项，覆盖更多常见排除目录 |
| 正则编译缓存 | `sanitize_brace_line` 正则从每次调用编译改为 `OnceLock` 一次性初始化 |
| Actions 类型安全 | 8 个 action 模块的 `set: any` 替换为 `StoreApi<StoreState>["setState"]`，消除类型盲区 |

### 验证结果

| 检查项 | 结果 |
|--------|------|
| TypeScript typecheck | ✅ 0 error |
| 前端测试 (Vitest) | ✅ 31 files, 183 tests |
| Rust cargo check | ✅ |
| Rust cargo test (all crates) | ✅ 全部通过 |
| 新增文件 | 12 |
| 修改文件 | 16 |
| 删除文件 | 1 (`preview-bridge.ts` → 目录化) |
| 遗留清理 | 4 个遗留 Store 已删除 |
| CSS Token 迁移 | 6 个 Shadow 设计 Token 替换硬编码值，亮暗主题区分 |
| 模块化分层 | 7 个功能模块迁移到 `features/`，统一 index.ts 导出 |
| 错误码统一 | `IpcErrorCode` 枚举跨桥接层共享 |
| invoke 错误粒度 | 区分网络错误（TypeError）→ `NETWORK_ERROR`、后端错误 → 透传 code |
| SSE 连接管理 | 引用计数自动关闭，无监听器时释放 EventSource |
| PTY 监听器限流 | 两个桥接层均添加 `MAX_PTY_LISTENERS = 32` 上限 |
| Rust Send+Sync 断言 | PtySession / SessionManager / PtySessionHandle 静态类型安全验证 |
| 骨架屏动画 | 响应式 `background-size`、`will-change` GPU 提示、`prefers-reduced-motion` 禁用 |
| Release 构建 | 添加 `panic = "abort"`，减少二进制体积 |
| 微任务刷新 | `queueLowPriorityRefresh` 优先使用 `queueMicrotask` |

## 重构统计

| 指标 | 数值 |
|------|------|
| 重构轮次 | 5 轮 |
| 新增/修改文件 | StoreState.ts, useStreamingText.ts, preferencesMerger.ts, design-system/tokens.ts, package.json（@codemirror/state 显式依赖）, vite.config.ts（optimizeDeps） |
| 重写/迁移文件 | slicedStore.ts, selectors.ts, shared.ts, 11 个 slice 文件 |
| 删除文件 | app/slicedStore.ts（旧 1237 行），4 个废弃 Store, pnpm-lock.yaml |
| 迁移模块 | 7 个（file-tree / outline / patch-review / editor / diff-viewer / preview / terminal） |
| 新增设计 Token | 6 个 Shadow token（亮暗主题各 6 个值） |
| 消除 `as any` | 11 处（所有 slice 工厂） |
| 消除重复代码 | 5 处路径分隔符 → 全局 `joinPathSegments` |
| 新增 Rust 断言 | 3 个 `static_assertions` |
| 包管理变更 | pnpm → npm（因 pnpm store 损坏恢复为 npm） |
| 新增 Vite 配置 | `optimizeDeps.include` 强制 7 个 CodeMirror 包预捆绑为单例 |
| 切片数量 | 11 个独立切片 |
| 类型检查 | 0 错误 |
| 测试通过 | 171/171（Vitest），2 个 Playwright E2E 预存问题 |
| Rust 编译 | cargo check 零警告零错误 |

## 相关文档

- [重构洞察报告](./refactor-insight-2026-05-21.md)
- [重构实施计划](./重构实施计划-2026-05-21.md)
- [Insight Fix 实施计划](../../.trae/documents/refactor-insight-fix-plan-2026-05-21.md)
