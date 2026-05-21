# 重构洞察报告 – ai-digital-life
**生成日期**：2026-05-21

## 1. 架构与设计

| 位置（文件:行/函数） | 问题描述 | 优化建议 | 优先级 |
|----------------------|----------|----------|--------|
| `frontend/src/app/stores/slicedStore.ts:126-138` | Store 合并使用 `as any` 类型断言绕过类型检查，削弱了 TypeScript 类型安全性。`| create<StoreState>` 的泛型参数与展开的切片类型不兼容，表明类型设计存在不协调。 | 使用 `ReturnType<typeof createStore>` 或显式定义 Store 类型层级，避免 `as any`。 |
| `frontend/src/tauri-bridge.ts:46-53` | `invokeIpc` 函数返回 `{ ok: false, error: ... }` 但未区分网络错误、Tauri 错误和应用逻辑错误，导致错误处理粒度不足。 | 引入细粒度错误码分类（如 `NETWORK_ERROR`、`TAURI_INVOKE_ERROR`、`APP_ERROR`），便于前端针对性处理。 |
| `frontend/src/preview-bridge.ts:32-46` | SSE 连接使用模块级变量 `ptySseConnected` 管理状态，在热更新场景下可能导致状态不一致。 | 使用单例模式或 `WeakMap` 管理连接状态，增强模块独立性。 |
| `frontend/src/app/stores/shared.ts:5-8` | 全局请求序列计数器（`workspaceRequestSeq` 等）使用可变模块级变量，在并发请求场景下存在竞态风险。 | 封装到 `useRef` 或专用 `RequestSeqManager` 类中，确保状态隔离。 |
| `frontend/src/app/ui-store.ts:74` | `deferredJsonWriteHandles` 使用 `Map<string, number>` 管理 timeout 句柄，内存泄漏风险：若组件卸载前 timeout 未触发，句柄将永久保留。 | 在 `onUniveralPersist` 或 store 卸载时清理所有 pending timeout。 |
| `frontend/src/mock-bridge.ts:31-39` | Mock PTY 输出监听器使用 `Set<(event: PtyOutputEvent) => void>`，缺少错误边界和容量限制，可能导致内存泄漏。 | 添加最大监听器数量限制和自动清理机制。 |
| `frontend/src/app/stores/slicedStore.ts:216-222` | `bootstrap` 函数并行发起 3 个请求但未实现请求取消/竞态保护，仅靠 `requestSeq !== workspaceRequestSeq` 判断可能存在边界条件。 | 引入 `AbortController` 或更严格的请求生命周期管理。 |
| `crates/terminal/src/lib.rs` | 终端 crate 可能未实现 `Send + Sync` 约束，PTY 会话在多线程环境下可能出现未定义行为。 | 添加 `static assertions` 验证 `TerminalSession: Send + Sync`。 |
| `src-tauri/src/main.rs:11-96` | `invoke_handler` 注册 60+ 个命令，未实现命令分组或按需加载，长时间运行后内存占用可能增长。 | 考虑命令懒注册或模块化命令注册（如 `commands::app::register(app)`）。 |
| `frontend/src/app/components/FilesPanel.tsx:15-51` | Props 接口 `RightPanelViewProps` 可能包含过多字段（约 40+ 个 prop），组件耦合度高。 | 考虑使用 Context 注入或 Hook 封装，减少 Props drilling。 |
| `frontend/src/styles/components.css:474-500` | Skeleton shimmer 动画使用固定 `background-size: 200%`，在大视口下可能出现可见的渐变断层。 | 使用 `background-size: 300%` 或更平滑的 gradient 重复模式。 |
| `frontend/src/app/regions/right-panel/FilesPanel.tsx:99-105` | `selectedAbsolutePath` 计算使用 `includes("\\")` 判断路径分隔符，缺乏跨平台健壮性。 | 使用 `path.sep` 或 `process.platform` 统一处理。 |

## 2. 性能优化

| 位置（文件:行/函数） | 问题描述 | 优化建议 | 优先级 |
|----------------------|----------|----------|--------|
| `frontend/src/app/stores/slicedStore.ts:7` | `searchDebounceTimer` 使用模块级 `setTimeout` 变量，多实例场景下可能产生状态冲突。 | 封装到 `useRef` 或 debounce hook 中，确保每个组件实例独立。 |
| `frontend/src/app/stores/shared.ts:36-43` | `getCachedLru` 实现每次命中时 `delete` + `set` 会触发 Map 重新哈希，在高频访问场景下性能下降。 | 使用 `Map.prototype.get` 配合 `moveToEnd`（如 linked-list-map）优化，或记录访问时间戳批量重排。 |
| `frontend/src/app/stores/shared.ts:46-58` | `setCachedLru` 每次设置后遍历删除最旧元素，时间复杂度 O(n)。 | 改用 `LinkedMap` 或 `lru-cache` 库，实现 O(1) 插入和 O(1) 淘汰。 |
| `frontend/src/app/stores/slicedStore.ts:822-886` | `openFile` 函数先读取缓存再发起网络请求，缓存命中时仍执行后续逻辑，存在冗余计算。 | 缓存命中时直接 `return`，减少不必要状态更新。 |
| `frontend/src/app/regions/right-panel/FilesPanel.tsx:86-89` | `fileCategory` 和 `previewEnabled` 在 `useMemo` 中计算，但依赖项包含对象引用（`filePreviewModeByPath[selectedFilePath]`），可能导致不必要的重算。 | 使用 `useShallow` 或稳定化选择器避免对象引用变化。 |
| `frontend/src/app/stores/slicedStore.ts:988-1008` | `searchFiles` 内部使用 `setTimeout` + `searchDebounceTimer`，与组件卸载时可能产生竞态。 | 使用 `useCallback` + `useRef` 保存最新 query，或使用 `useDebouncedCallback` 库。 |
| `frontend/src/preview-bridge.ts:56-75` | `loadRecentWorkspaces`/`persistRecentWorkspaces` 每次操作都 `JSON.parse`/`JSON.stringify`，大型工作区列表可能产生 GC 压力。 | 增量更新或使用 `structuredClone` 优化。 |
| `frontend/src/app/stores/slicedStore.ts:119-120` | 模块级缓存实例 `fileDocumentCache` 和 `changePreviewCache` 跨所有工作区共享，切换工作区后缓存可能返回陈旧数据。 | 按工作区 ID 隔离缓存或实现缓存失效机制。 |
| `frontend/src/styles/components.css:479-490` | Skeleton 动画使用 `background-position` 动画，在低端 GPU 上可能产生 jank。 | 考虑使用 `@media (prefers-reduced-motion)` 禁用动画，或使用 CSS `will-change: background-position` 提示。 |
| `src-tauri/src/main.rs:1` | Release 构建未启用 `panic = "abort"` 和完整 LTO，可能影响二进制大小和运行时性能。 | 在 `Cargo.toml` 的 `[profile.release]` 中添加 `panic = "abort"`，验证性能提升。 |

## 3. 其他发现（已解决 ✅）

下列问题已在重构中完成修复：

- ✅ **双端桥接代码重复**：已在 `shared/ipc.ts` 中抽取共享类型，3 个桥接文件统一使用 `IpcErrorCode` 枚举。
- ✅ **遗留 Store 废弃标记**：4 个 @deprecated Store 文件（`useWorkspaceStore.ts`、`useSessionStore.ts`、`useEditorStore.ts`、`usePatchStore.ts`）已彻底删除。
- ✅ **全局 CSS 变量**：`regions.css` 中 6 处硬编码 Shadow 值已替换为设计 Token，新增亮暗主题 Shadow token 和 TypeScript 类型定义。
- ✅ **错误处理不一致**：`IpcErrorCode` 枚举已在 `shared/ipc.ts` 中定义，`tauri-bridge.ts` 和 `preview-bridge.ts` 已统一使用。
- ✅ **模块化程度**：前端已按功能域分层为 `app/features/` 目录，包含 7 个功能模块（file-tree / outline / patch-review / editor / diff-viewer / preview / terminal），所有 import 路径已更新。
- ⏳ **Rust Crates 依赖**：部分 crate 过度工程化问题待架构评审后合并（已列入 Phase 3+）。

> 由自动化重构洞察生成于 2026-05-21 14:30:00
