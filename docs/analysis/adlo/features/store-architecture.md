# Store 架构

> 路径前缀: `frontend/src/app/stores/`
> 实现快照（以 `slicedStore.ts`/`StoreState.ts` 为准；规范见 `.agents/rules/zustand-patterns.md`）。

## slicedStore.ts 合并模式

```typescript
// 核心模式：将所有切片和 actions 展开合并到单一 store
export const useSlicedAppStore = create<StoreState>((set, get) => ({
  // 状态切片（slicedStore.ts 实测 32 个 create*Slice，含 8 浏览器 + 3 GitHub）
  ...createUISlice(set, get),
  ...createWorkspaceSlice(set, get),
  ...createBrowserSlice(set, get),
  // ... 其余切片

  // 根级状态
  loading: true,
  error: undefined,
  isFetching: {},

  // 跨切片 Actions（18 个 *Actions 模块）
  ...createWorkspaceActions(set, get),
  ...createEditorActions(set, get),
  // ... 其余 action 模块
}));

export const useAppStore = useSlicedAppStore;
```

模式特征:
- 所有切片类型组合到 `StoreState` 接口，编译时类型安全
- 对象/数组选择器配 `useShallow`，避免不必要重渲染
- 持久化经 `persisted/registry.ts` 中心登记表（`adl:ui.*`），唯一写盘入口

## 32 个切片（slicedStore.ts 实测）

| 切片创建函数 | 文件 |
|-------------|------|
| `createUISlice` | `slices/uiSlice.ts`（+ uiSliceExpansion/uiSliceWidths/uiSliceTypes） |
| `createWorkspaceSlice` | `slices/workspaceSlice.ts` |
| `createGitSlice` / `createGitVisSlice` | `slices/gitSlice.ts` / `slices/gitVisSlice.ts` |
| `createEditorSlice` | `slices/editorSlice.ts` |
| `createPatchSlice` | `slices/patchSlice.ts` |
| `createSearchSlice` | `slices/searchSlice.ts` |
| `createDiagnosticSlice` | `slices/diagnosticSlice.ts` |
| `createTerminalSlice` | `slices/terminalSlice.ts`（+ terminalSliceTypes） |
| `createClipboardSlice` / `createClipboardHistorySlice` | `slices/clipboardSlice.ts` / `slices/clipboardHistorySlice.ts` |
| `createBrowserSlice` / `createBrowserTabsSlice` / `createBrowserBookmarkSlice` / `createBrowserHistorySlice` / `createBrowserFoldersSlice` / `createBrowserLandingSlice` / `createBrowserSearchEnginesSlice` / `createBrowserDownloadsSlice` | `slices/browser*.ts`（+ browserSliceShared/browserTypes/browserFoldersDeletion/Types/Utils） |
| `createCenterTabsSlice` | `slices/centerTabsSlice.ts`（+ centerTabsTypes/tabLocation） |
| `createDshSlice` | `slices/dshSlice.ts` |
| `createReferenceSlice` | `slices/referenceSlice.ts` |
| `createSystemMonitorSlice` | `slices/systemMonitorSlice.ts` |
| `createNotificationSlice` | `slices/notificationSlice.ts` |
| `createErrorToastSlice` / `createToastSlice` | `slices/errorToastSlice.ts` / `slices/toastSlice.ts` |
| `createFileOpNoticeSlice` | `slices/fileOpNoticeSlice.ts` |

## 18 个 Action 模块（`stores/actions/`，`*Actions.ts`）

| 模块 | 文件 |
|------|------|
| Workspace 系 | `workspaceActions.ts`、`workspaceLifecycleActions.ts`、`workspaceTreeActions.ts` |
| Editor | `editorActions.ts` |
| Patch | `patchActions.ts` |
| Git 系 | `gitActions.ts`、`gitBranchActions.ts`、`gitFileOpsActions.ts`、`gitSnapshotActions.ts`、`gitVisActions.ts` |
| Search | `searchActions.ts` |
| Fetch/通用 | `fetchActions.ts`、`generalActions.ts` |
| Browser | `browserCleanupActions.ts` |
| Center | `centerActions.ts` |
| Dsh | `dshActions.ts` |
| Reference | `referenceActions.ts` |
| Utilities | `utilitiesActions.ts` |

## helpers/类型与顺序文件（`stores/actions/`，非 `*Actions` 模块）

| 文件 | 说明 |
|------|------|
| `editorActionsHelpers.ts` | Editor action 辅助函数 |
| `browserCleanupHelpers.ts` | Browser 清理辅助函数 |
| `workspaceTreeRename.ts` | 工作区树重命名顺序/工具 |
| `workspaceLoadOrder.ts` | 工作区加载顺序 |
| `workspaceNaturalOrderSync.ts` | 工作区自然顺序同步 |
| `preferencePatchMerge.ts` | 偏好合并类型/工具 |

## stores/ 根模块（非 slice / action）

| 文件 | 说明 |
|------|------|
| `editorSavePipeline.ts` | 编辑器存盘流水线（按文件串行、保存代际、自写回声指纹、watcher 信号） |

## cacheHelpers.ts 模式

| 函数 | 用途 | 调用位置 |
|------|------|----------|
| `clearError(get)` | 在 mutation action 入口清空全局 error | 每个 action 入口第一行 |
| `captureError(get, error)` | 捕获错误（支持 string/Error/{message} 三种格式） | 异步调用失败时 |
| `captureTypedError(get, error)` | 类型化捕获（支持 AppError instance、{code,message}、Error/string 三级降级） | 推荐替代 captureError |
| `setError(get, message)` | 直接设置全局 error 消息 | 已知错误消息时 |

```typescript
// 标准 action 模式
async function someAction() {
  clearError(get);                                // 入口清空
  set({ isFetching: { someAction: true } });      // loading
  const result = await someIpcCall();
  if (!result.ok) {
    captureTypedError(get, result.error);          // 错误捕获
    set({ isFetching: { someAction: false } });
    return;
  }
  set({ data: result.data, isFetching: { someAction: false } });
}
```

## selectors.ts

性能选择器（`selectors.ts` + `browserSelectors.ts`/`editorSelectors.ts`/`terminalSelectors.ts`/`workspaceSelectors.ts`）：对象/数组选择配 `useShallow`，单原始值直接选。规范见 `.agents/rules/zustand-patterns.md`。

## storageHelpers.ts（localStorage 模式）

| 函数 | 用途 |
|------|------|
| `readJson<T>(key, fallback)` | 读取并解析 JSON |
| `writeJson(key, value)` | 写入 JSON（捕获 QuotaExceededError） |
| `readNumber(key, fallback, min, max)` | 读取数字（clamp 约束） |
| `writeNumber(key, value)` | 写入数字 |
| `readFlag(key, fallback)` | 读取布尔标志（'1'/'0'） |
| `writeFlag(key, value)` | 写入布尔标志 |
| `createDebouncedWrite(waitMs)` | 创建防抖批量写入器 |
| `scheduleCrossSliceWrite` | 跨切片防抖写入 |

> 写入统一收敛到 `persisted/registry.ts` 中心登记表，禁止 slice 直调 `localStorage.setItem`（见 `.agents/rules/localstorage-central-registry-persistence-architecture.md`）。

## isFetching Record 模式

```typescript
// StoreState 中定义
isFetching: Record<string, boolean>;

// key 命名为函数名（如 fetchGitStatus），finally 块确保重置
```
