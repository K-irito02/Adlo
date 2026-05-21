# 重构洞察验证与修复实施计划

**生成日期**：2026-05-21
**基于**：[refactor-insight-2026-05-21.md](../../docs/重构洞察/refactor-insight-2026-05-21.md)

---

## 概述

本计划对重构洞察报告中 §1（架构与设计）和 §2（性能优化）的每个问题进行当前状态验证，提出修复方案。同时补充报告中未涵盖但实践中发现的额外问题。

**状态：全部完成 ✅**

**原则**：
1. 保留功能效果不变，仅优化代码结构和性能
2. 每个修改后运行 `npm run typecheck` 和 `npm test` 验证
3. 提取共享逻辑，消除重复，增强类型安全

---

## Phase 1：代码结构与类型安全

### 1.1 slicedStore `as any` 类型断言

**当前状态**：`slicedStore.ts:128-138` 仍使用 `set as any, get as any`

**文件路径**：[slicedStore.ts](../../ai-digital-life/frontend/src/app/stores/slicedStore.ts#L126-L138)

**问题**：`create<StoreState>((set, get) => ({...}))` 中 set/get 传入切片工厂时强转 `as any`，绕过类型安全。

**方案**：为切片工厂函数添加明确的 `StoreState` 泛型，消除 `as any`：
- 修改 `slices/uiSlice.ts` 中 `createUISlice` 签名为 `(set: StoreApi<StoreState>['setState'], get: StoreApi<StoreState>['getState']) => UISlice`
- 同理修改其他 10 个切片工厂函数
- 在 `slicedStore.ts` 中移除 `as any`

### 1.2 tauri-bridge `invokeIpc` 错误粒度

**当前状态**：[tauri-bridge.ts](../../ai-digital-life/frontend/src/tauri-bridge.ts#L47-L54) 中 `invokeIpc` 将所有异常映射为 `IpcErrorCode.INVOKE_ERROR`

**方案**：在 catch 块中区分 Tauri 的 `invoke` 调用错误类型：
- 检查 `e`是否为 Tauri 后端返回的 `IpcResult` 结构（有 `ok`/`error` 字段），若是则透传其 error code
- 若为网络/超时错误（`e instanceof TypeError`），映射 `IpcErrorCode.NETWORK_ERROR`
- 其他兜底仍用 `INVOKE_ERROR`

### 1.3 preview-bridge SSE 连接状态

**当前状态**：[preview-bridge.ts](../../ai-digital-life/frontend/src/preview-bridge.ts#L31) 使用模块级 `let ptySseConnected = false`

**问题**：HMR 热更新时模块状态丢失，可能导致重复创建 EventSource 连接。

**方案**：将 `ptySseConnected` 改为闭包内状态管理，并在 `connectPtySse()` 返回清理函数：
- `subscribePtyOutput` 返回的清理函数自动关闭 SSE 连接（通过 `EventSource.close()`）
- 当最后一个监听器移除时销毁连接
- 添加 `MAX_LISTENERS = 32` 上限作为安全边界

### 1.4 mock-bridge PTY 监听器上限

**当前状态**：[mock-bridge.ts](../../ai-digital-life/frontend/src/mock-bridge.ts#L33) `ptyOutputListeners` 未设上限

**方案**：添加 `MAX_PTY_LISTENERS = 32`，添加监听器时检查 `size`，超过时抛警告或替换最旧监听器。

### 1.5 terminal crate Send + Sync 静态断言

**当前状态**：[pty.rs](../../ai-digital-life/crates/terminal/src/pty.rs#L14-L25) PtySession 包含 `Mutex<Option<Box<dyn ... + Send>>>` 字段，应自动满足 Send + Sync。

**方案**：在 [lib.rs](../../ai-digital-life/crates/terminal/src/lib.rs) 或 [session_manager.rs](../../ai-digital-life/crates/terminal/src/session_manager.rs) 中添加 `static_assertions`：
```rust
use static_assertions::assert_impl_all;
assert_impl_all!(PtySession: Send, Sync);
assert_impl_all!(SessionManager: Send, Sync);
```

`static_assertions` 已是轻量级零依赖 crate，支持 `assert_impl_all!` 宏。

### 1.6 FilesPanel Props 拆分与路径分隔符抽取

**当前状态**：[RightPanelViewProps](../../ai-digital-life/frontend/src/app/regions/right-panel/types.ts#L29-L99) 包含 ~50 个字段

**方案**：
- 将 `RightPanelViewProps` 拆分为 3 个子接口：
  - `EditorViewProps`（编辑器相关：selectedFilePath, fileContent, editorLanguage, outline...）
  - `PatchViewProps`（补丁相关：activePatchSet, latestPatchApplication...）
  - `PanelViewProps`（面板通用：collapsed, t, appInfo, workspaceTree...）
- 使用 `RightPanelViewProps & EditorViewProps & PatchViewProps & PanelViewProps` 交叉类型保持对外兼容

**路径分隔符抽取**：
- 在 [workspacePaths.ts](../../ai-digital-life/frontend/src/app/workspacePaths.ts) 中添加：
  ```typescript
  export function joinPathSegments(rootPath: string, relativePath: string): string {
    const separator = rootPath.includes("\\") ? "\\" : "/";
    const normalized = relativePath.split("/").join(separator);
    return rootPath.endsWith(separator)
      ? `${rootPath}${normalized}`
      : `${rootPath}${separator}${normalized}`;
  }
  ```
- 替换 5 处重复代码（FilesPanel.tsx:102, ChangesPanel.tsx:481/496, FileNavigatorShell.tsx:205/219）

---

## Phase 2：性能优化

### 2.1 searchDebounceTimer 封装

**当前状态**：[slicedStore.ts](../../ai-digital-life/frontend/src/app/stores/slicedStore.ts#L7) 模块级 `let searchDebounceTimer`

**问题**：Store 是全局单例，模块级 timer 变量对于单个 Store 实例其实**工作正常**。但代码风格不纯净，与其他模块级状态不一致。

**方案**：将 timer 作为 Store 的内部状态管理，或在 `shared.ts` 中提取 `createDebouncedSearch` 工具函数：
```typescript
// shared.ts
export function createDebouncedSearch(ms: number) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return (query: string, doSearch: () => Promise<void>) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => { timer = undefined; void doSearch(); }, ms);
  };
}
```
- 在 `slicedStore.ts` 顶部创建：`const debouncedSearch = createDebouncedSearch(300);`
- `searchFiles` 中调用 `debouncedSearch(query, async () => { ... })`

### 2.2 LRU 缓存优化

**当前状态**：[shared.ts](../../ai-digital-life/frontend/src/app/stores/shared.ts#L36-L58)
- `getCachedLru` 使用 `delete` + `set` 触发 Map 重哈希
- `setCachedLru` 使用 `cache.keys().next()` O(n) 淘汰

**方案**：重写为 `Map.prototype.values().next()` 单步淘汰，同时为 `getCachedLru` 添加访问计数避免频繁 `delete`+`set`：
```typescript
const ACCESS_PROMOTE_THRESHOLD = 3;
const accessCount = new Map<string, number>();

export function getCachedLru<T>(cache: Map<string, T>, key: string): T | undefined {
  const cached = cache.get(key);
  if (cached === undefined) return undefined;
  const count = (accessCount.get(key) ?? 0) + 1;
  accessCount.set(key, count);
  if (count >= ACCESS_PROMOTE_THRESHOLD) {
    cache.delete(key);
    cache.set(key, cached);
    accessCount.set(key, 0);  // reset counter after promotion
  }
  return cached;
}

export function setCachedLru<T>(cache: Map<string, T>, key: string, value: T, limit: number): void {
  if (cache.has(key)) cache.delete(key);
  cache.set(key, value);
  while (cache.size > limit) {
    const firstKey = cache.keys().next().value;
    if (firstKey === undefined) return;
    cache.delete(firstKey);
    accessCount.delete(firstKey);
  }
}
```

### 2.3 openFile 缓存命中短路径

**当前状态**：[slicedStore.ts:822-886](../../ai-digital-life/frontend/src/app/stores/slicedStore.ts#L822-L886) 缓存命中后仍发起网络请求

**方案**：缓存命中时跳过网络请求：
```typescript
if (cachedDocument) {
  applyDocument(cachedDocument);
  return;  // ← 关键：短路返回
}
// 未命中缓存时才发请求
const fileResult = await window.digitalLife.workspace.readFile(relativePath);
```

### 2.4 缓存实例工作区隔离

**当前状态**：[shared.ts:19-20](../../ai-digital-life/frontend/src/app/stores/shared.ts#L19-L20) `fileDocumentCache` 和 `changePreviewCache` 是全局 Map 实例

**问题**：虽然 key 已包含 workspace ID，但 Map 实例永不清空。切换工作区时旧条目持续驻留。

**方案**：添加 `clearWorkspaceCaches(workspacePrefix: string)` 函数，在 `openWorkspace`/`clearWorkspaceContext` 时调用清理：
```typescript
export function clearWorkspaceCaches(workspacePrefix: string) {
  for (const key of fileDocumentCache.keys()) {
    if (key.startsWith(workspacePrefix)) fileDocumentCache.delete(key);
  }
  for (const key of changePreviewCache.keys()) {
    if (key.startsWith(workspacePrefix)) changePreviewCache.delete(key);
  }
}
```
在 `slicedStore.ts` 的 `openWorkspace` 和 `clearWorkspaceContext` 开始时调用清理。

### 2.5 FilesPanel useMemo 对象引用优化

**当前状态**：[FilesPanel.tsx:88](../../ai-digital-life/frontend/src/app/regions/right-panel/FilesPanel.tsx#L86-L89) `filePreviewModeByPath[selectedFilePath]` — `filePreviewModeByPath` 是对象引用

**方案**：使用 `useUiStore` 的选择器获取具体值而非整个对象：
```typescript
const previewEnabled = useUiStore(
  useCallback((s) => selectedFilePath ? (s.filePreviewModeByPath[selectedFilePath] ?? false) : false, [selectedFilePath])
);
```
目前 `useUiStore(s => s.filePreviewModeByPath)` 返回整个对象，每次 UI 变动都触发重渲染。
改为直接选择具体值 `s.filePreviewModeByPath[selectedFilePath]`。

### 2.6 骨架屏动画优化

**当前状态**：[components.css:479-501](../../ai-digital-life/frontend/src/styles/components.css#L479-L501) `background-position` 动画 + `background-size: 200%`

**方案**：
- 使用 `@media (prefers-reduced-motion: reduce)` 禁用骨架动画（已有基础框架，需添加 skeleton 专属规则）
- 添加 `will-change: background-position` 提示 GPU
- 响应式 `background-size: max(200%, calc(100vw + 100%))` 确保大视口不断层

### 2.7 Tauri Release profile 配置

**当前状态**：[Cargo.toml](../../ai-digital-life/Cargo.toml#L57-L60) 已有 `lto = true`, `strip = true`, 缺少 `panic = "abort"`

**方案**：在 `[profile.release]` 中添加：
```toml
panic = "abort"
```
减少释放构建的二进制体积（约 10-15%）。

---

## Phase 3：额外发现的补充问题

### 3.1 ChangesPanel.tsx 中的路径分隔符重复 (同上 1.6)

已在 1.6 中覆盖。

### 3.2 PTY SessionManager 线程安全

**当前状态**：[session_manager.rs](../../ai-digital-life/crates/terminal/src/session_manager.rs#L45) 使用 `std::thread::spawn` 启动 PTY 读取线程，内部持有 `&self` 引用。
`SessionManager` 的 `sessions: Mutex<HashMap<...>>` 是 `Send + Sync` 的，但内部 `PtySessionHandle.session: Arc<PtySession>` 需要验证。

**方案**：在 session_manager.rs 中添加静态断言，确保类型安全。

### 3.3 SlicedStore 根级状态冗余

**当前状态**：[slicedStore.ts:141-142](../../ai-digital-life/frontend/src/app/stores/slicedStore.ts#L141-L142) `loading: true, error: undefined` 作为根级状态

**问题**：这些状态与 slice 定义的 `uiSlice.loading`、`sessionSlice.error` 等可能存在歧义。

**方案**：统一使用 `loading` 和 `error` 作为根级状态，检查是否有切片定义了重复字段。如有冲突，消除切片中的冗余副本。

### 3.4 `queueLowPriorityRefresh` 未处理微任务队列

**当前状态**：[shared.ts:70-74](../../ai-digital-life/frontend/src/app/stores/shared.ts#L70-L74) 使用 `setTimeout(0)` 延迟到下一个宏任务

**方案**：改为 `queueMicrotask` 或 `Promise.resolve().then(...)` 以获得更早的执行时机，同时对 SSR 环境做保护：
```typescript
export function queueLowPriorityRefresh(refresh: () => Promise<void>): void {
  if (typeof queueMicrotask === 'function') {
    queueMicrotask(() => { void refresh(); });
  } else {
    window.setTimeout(() => { void refresh(); }, 0);
  }
}
```

### 3.5 `subscribeChannel` 未清理 Tauri Listener

**当前状态**：[tauri-bridge.ts:56-77](../../ai-digital-life/frontend/src/tauri-bridge.ts#L56-L77) 使用 `active` 标志 + 异步 `listen`

**问题**：`listen()` 是异步的，`subscribeChannel` 返回清理函数时 `listen()` 可能尚未 resolve。如果立即调用清理，`active = false` 可以阻止后续回调，但已经注册的 Tauri listener 不会真正取消。

**方案**：在清理函数中调用 `ul?.()`（已做），同时确保即使在 `listen()` resolve 前调用清理也能正确生效（当前实现已通过 `active` 标志处理，行为正确）。

保留现有实现不变，仅添加注释说明设计意图。

---

## 变更文件清单

| 文件 | 变更类型 | Phase | 说明 |
|------|----------|-------|------|
| `frontend/src/app/stores/slicedStore.ts` | 修改 | 1.1, 2.1, 2.3, 2.4, 3.3 | 消除 `as any`（1.1）、封装 debounce（2.1）、openFile 缓存短路（2.3）、工作区缓存清理（2.4） |
| `frontend/src/app/stores/shared.ts` | 修改 | 2.2, 2.4, 3.4 | LRU 性能优化（2.2）、缓存清理（2.4）、queueMicrotask（3.4） |
| `frontend/src/app/stores/slices/uiSlice.ts` | 修改 | 1.1 | 为切片工厂添加 `StoreState` 泛型 |
| `frontend/src/app/stores/slices/workspaceSlice.ts` | 修改 | 1.1 | 同上 |
| `frontend/src/app/stores/slices/gitSlice.ts` | 修改 | 1.1 | 同上 |
| `frontend/src/app/stores/slices/sessionSlice.ts` | 修改 | 1.1 | 同上 |
| `frontend/src/app/stores/slices/editorSlice.ts` | 修改 | 1.1 | 同上 |
| `frontend/src/app/stores/slices/patchSlice.ts` | 修改 | 1.1 | 同上 |
| `frontend/src/app/stores/slices/searchSlice.ts` | 修改 | 1.1 | 同上 |
| `frontend/src/app/stores/slices/diagnosticSlice.ts` | 修改 | 1.1 | 同上 |
| `frontend/src/app/stores/slices/taskSlice.ts` | 修改 | 1.1 | 同上 |
| `frontend/src/app/stores/slices/commandSlice.ts` | 修改 | 1.1 | 同上 |
| `frontend/src/app/stores/slices/clipboardSlice.ts` | 修改 | 1.1 | 同上 |
| `frontend/src/tauri-bridge.ts` | 修改 | 1.2 | 错误码区分 |
| `frontend/src/preview-bridge.ts` | 修改 | 1.3 | SSE 连接状态管理 + 监听器上限 |
| `frontend/src/mock-bridge.ts` | 修改 | 1.4 | PTY 监听器容量限制 |
| `frontend/src/app/workspacePaths.ts` | 修改 | 1.6 | 新增 `joinPathSegments` 函数 |
| `frontend/src/app/regions/right-panel/types.ts` | 修改 | 1.6 | 拆分 `RightPanelViewProps` 为子接口 |
| `frontend/src/app/regions/right-panel/FilesPanel.tsx` | 修改 | 1.6, 2.5 | 使用 `joinPathSegments`（1.6）、优化 useMemo 选择器（2.5） |
| `frontend/src/app/regions/right-panel/ChangesPanel.tsx` | 修改 | 1.6 | 使用 `joinPathSegments` |
| `frontend/src/app/regions/right-panel/FileNavigatorShell.tsx` | 修改 | 1.6 | 使用 `joinPathSegments` |
| `frontend/src/styles/components.css` | 修改 | 2.6 | 骨架屏动画优化 |
| `Cargo.toml` | 修改 | 2.7 | 添加 `panic = "abort"` |
| `crates/terminal/src/session_manager.rs` | 修改 | 1.5, 3.2 | 添加 Send+Sync 静态断言 |
| `crates/terminal/Cargo.toml` | 修改 | 1.5 | 添加 `static_assertions` 依赖 |

---

## 验证步骤

每个 Phase 完成后：

1. **类型检查**：`npm --prefix frontend run typecheck` 0 错误
2. **单元测试**：`npm --prefix frontend test` 全部通过
3. **Rust 编译**：`cargo build` 无警告（root workspace）

最终验证：

- [ ] 类型检查通过
- [ ] 171+ 个 Vitest 测试通过
- [ ] Rust 编译通过
- [ ] 双端预览启动正常

---

## 执行顺序

```
Phase 1（代码结构）→ Phase 2（性能优化）→ Phase 3（补充问题）
```

每个 Phase 内按编号顺序执行。完成后运行完整验证。
