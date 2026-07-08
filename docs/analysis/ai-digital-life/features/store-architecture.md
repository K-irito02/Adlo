# Store 架构

> 路径前缀: `frontend/src/app/stores/`

## slicedStore.ts 合并模式

```typescript
// 核心模式：将所有切片和 actions 展开合并到单一 store
export const useSlicedAppStore = create<StoreState>((set, get) => ({
  // 状态切片 (32 个) — 纯状态 + 切片内 actions
  ...createUISlice(set, get),
  ...createWorkspaceSlice(set, get),
  ...createBrowserSlice(set, get),
  // ... 其余切片

  // 根级状态
  loading: true,
  error: undefined,
  isFetching: {},

  // 跨切片 Actions (25 个领域模块)
  ...createWorkspaceActions(set, get),
  ...createSessionActions(set, get),
  // ... 其余 action 模块
}));

export const useAppStore = useSlicedAppStore;
```

模式特征:
- 所有切片类型通过 `extends` 组合到 `StoreState` 接口
- 编译时类型安全检查 (`_StoreTypeCheck`)
- `shallow` 比较器由 `zustand/react/shallow` 导出

## 全部 32 个切片

| # | 切片 | 文件 | 关键状态字段 |
|---|------|------|-------------|
| 1 | `UISlice` | `slices/uiSlice.ts` | `leftSidebarVisible`, `chatMode`, `activeRightTool`, `rightPanelWidth`, `leftSidebarWidth` |
| 2 | `WorkspaceSlice` | `slices/workspaceSlice.ts` | `appInfo`, `workspaceTree`, `recentWorkspaces`, `workspaceExpanded` |
| 3 | `GitSlice` | `slices/gitSlice.ts` | `gitSnapshot`, `gitBranches`, `gitStatus` |
| 4 | `SessionSlice` | `slices/sessionSlice.ts` | `sessions`, `activeSessionId`, `sessionOrder` |
| 5 | `EditorSlice` | `slices/editorSlice.ts` | `openTabs`, `selectedFilePath`, `fileDocumentCache` |
| 6 | `PatchSlice` | `slices/patchSlice.ts` | `activePatchSet`, `changePreview`, `changePreviewLoading`, `selectedChangePreviewPath` |
| 7 | `SearchSlice` | `slices/searchSlice.ts` | `searchQuery`, `searchResults` |
| 8 | `DiagnosticSlice` | `slices/diagnosticSlice.ts` | `indexingStatus`, `repoMap`, `codeGraph` |
| 9 | `TaskSlice` | `slices/taskSlice.ts` | `taskCenter`, `auditEntries` |
| 10 | `CommandSlice` | `slices/commandSlice.ts` | `latestCommandRun`, `commandHistory` |
| 11 | `ClipboardSlice` | `slices/clipboardSlice.ts` | `clipboardItems` |
| 12 | `TerminalSlice` | `slices/terminalSlice.ts` | `terminalSessions`, `terminalSplitPositions` |
| 13 | `BrowserTabsSlice` | `slices/browserTabsSlice.ts` | `browserTabs`, `activeTabId` |
| 14 | `BrowserBookmarkSlice` | `slices/browserBookmarkSlice.ts` | `bookmarks`, `workspaceBookmarks` |
| 15 | `BrowserHistorySlice` | `slices/browserHistorySlice.ts` | `browserHistory`, `historyIndex` |
| 16 | `BrowserFoldersSlice` | `slices/browserFoldersSlice.ts` | `tabFolders`, `bookmarkTabItems` |
| 17 | `BrowserLandingSlice` | `slices/browserLandingSlice.ts` | `shortcuts`, `localPorts`, `backgroundConfig` |
| 18 | `BrowserSlice` | `slices/browserSlice.ts` | `navigatorWidth`, `navigatorCollapsed`, `navigateInPlace` |
| 19 | `CiSlice` | `slices/ciSlice.ts` | `ciStatus`, `ciWorkflows` |
| 20 | `CommunicateSlice` | `slices/communicateSlice.ts` | `communicateState`, `platformId` |
| 21 | `GitHubRepoSlice` | `slices/githubRepoSlice.ts` | `gitWorkspaceCiConfig`, `githubCiFolderState` |
| 22 | `GitHubTreeSlice` | `slices/githubTreeSlice.ts` | `githubTreeNodes`, `githubTreeExpanded` |
| 23 | `GitHubSlice` | `slices/githubSlice.ts` | `githubSections`, `githubBranch`, `githubRemote` |
| 24 | `AgentSlice` | `slices/agentSlice.ts` | `selectedAgent`, `availableAgents`, `planModeActive`, `planFile`, `activeSubagents` |
| 25 | `CustomCommandSlice` | `slices/customCommandSlice.ts` | `customCommands` |
| 26 | `PermissionSlice` | `slices/permissionSlice.ts` | `permissionRules`, `permissionIncludeDefaults` |
| 27 | `CompactionSlice` | `slices/compactionSlice.ts` | `compactionState`, `compactionResult` |
| 28 | `WebToolsSlice` | `slices/webToolsSlice.ts` | `webFetchResults`, `webSearchResults` |
| 29 | `McpSlice` | `slices/mcpSlice.ts` | `mcpServers`, `mcpCatalog`, `mcpConnections` |
| 30 | `ProviderSlice` | `slices/providerSlice.ts` | `providers`, `selectedProviderId`, `selectedModelId`, `connectionTestResults` |
| 31 | `ReferenceSlice` | `slices/referenceSlice.ts` | `references`, `referenceSources` |
| 32 | `DurableSlice` | `slices/durableSlice.ts` | `durableSessions`, `durableHeartbeat` |
| 33 | `ToastSlice` | `slices/toastSlice.ts` | `toasts`, `toastQueue` |

## 全部 25 个 Action 模块

| # | 模块 | 文件 | 关键 Actions |
|---|------|------|-------------|
| 1 | `WorkspaceActions` | `actions/workspaceActions.ts` | `openWorkspace`, `clearWorkspaceContext`, `refreshWorkspaceTree`, `loadWorkspaceTree`, `pinWorkspace`, `unpinWorkspace`, `createWorkspaceFile`, `deleteWorkspaceFile`, `renameWorkspaceFile`, `moveWorkspaceFile`, `duplicateWorkspaceFile` |
| 2 | `SessionActions` | `actions/sessionActions.ts` | `createSession`, `selectSession`, `switchToWorkspace`, `renameSession`, `deleteSession`, `pinSession`, `archiveSession`, `sendMessage`, `cancelActiveStream` |
| 3 | `EditorActions` | `actions/editorActions.ts` | `openFile`, `openChangePreview`, `markExternalFileChange`, `notifyEditorBufferDirty` |
| 4 | `PatchActions` | `actions/patchActions.ts` | `setHunkDecision`, `applyPatchSet`, `rollbackPatchSet`, `acceptAllHunks`, `rejectAllHunks`, `restoreCheckpoint` |
| 5 | `GitActions` | `actions/gitActions.ts` | `loadGitSnapshot`, `refreshGitSnapshot`, `fetchGitStatus`, `fetchGitBranches`, `switchGitBranch`, `createGitBranch` |
| 6 | `SearchActions` | `actions/searchActions.ts` | `searchFiles` |
| 7 | `FetchActions` | `actions/fetchActions.ts` | `refreshModelHealth`, `updatePreferences`, `fetchIndexStatus`, `fetchRepoMap`, `fetchAuditEntries` |
| 8 | `StreamActions` | `actions/streamActions.ts` | `sendMessage` (流式), `cancelActiveStream` (流式) |
| 9 | `GeneralActions` | `actions/generalActions.ts` | `bootstrap`, `updatePreferences` |
| 10 | `TaskActions` | `actions/taskActions.ts` | `refreshTaskCenter`, `decideApproval`, `fetchRunActivityByRunId` |
| 11 | `CommandActions` | `actions/commandActions.ts` | `runCommand`, `fetchCommandHistory` |
| 12 | `AgentActions` | `actions/agentActions.ts` | `fetchAgents`, `selectAgentForScenario`, `enterPlanMode`, `exitPlanMode`, `refreshPlanModeState` |
| 13 | `McpActions` | `actions/mcpActions.ts` | `fetchMcpServers`, `fetchMcpCatalog`, `addMcpServer`, `removeMcpServer`, `connectMcpServer`, `disconnectMcpServer` |
| 14 | `ProviderActions` | `actions/providerActions.ts` | `fetchProviders`, `setApiKey`, `clearApiKey`, `testConnection`, `addCustomProvider`, `removeCustomProvider`, `selectModel`, `fetchModels` |
| 15 | `CustomCommandActions` | `actions/customCommandActions.ts` | `fetchCustomCommands`, `addCustomCommand`, `updateCustomCommand`, `deleteCustomCommand` |
| 16 | `PermissionActions` | `actions/permissionActions.ts` | `fetchPermissionRules`, `addPermissionRule`, `deletePermissionRule`, `setPermissionIncludeDefaults` |
| 17 | `CompactionActions` | `actions/compactionActions.ts` | `compactSession` |
| 18 | `SnapshotActions` | `actions/snapshotActions.ts` | `createSnapshot`, `listSnapshots`, `revertToSnapshot` |
| 19 | `WebToolsActions` | `actions/webToolsActions.ts` | `webFetch`, `webSearch`, `clearWebResults` |
| 20 | `SessionForkActions` | `actions/sessionForkActions.ts` | `forkSession`, `listSessionForks` |
| 21 | `LspActions` | `actions/lspActions.ts` | `lspStartServer`, `lspStopServer`, `lspGetSymbols`, `lspGetDiagnostics` |
| 22 | `ReferenceActions` | `actions/referenceActions.ts` | `fetchReferences`, `addReference`, `removeReference` |
| 23 | `PluginActions` | `actions/pluginActions.ts` | `listPlugins`, `setPluginEnabled` |
| 24 | `CustomAgentActions` | `actions/customAgentActions.ts` | `fetchCustomAgents`, `addCustomAgent`, `deleteCustomAgent` |
| 25 | `DurableActions` | `actions/durableActions.ts` | `registerDurableSession`, `durableHeartbeat` |

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

```typescript
// 领域特定选择器（纯函数 + useShallow Hook 成对）
export const patchSelectors = {
  getActivePatchSet: (state: StoreState) => state.activePatchSet,
  useActivePatchSet: () => useAppStore(useShallow((s) => s.activePatchSet)),
};

export const taskSelectors = { /* ... */ };
export const runSelectors = { /* ... */ };
export const modelSelectors = { /* ... */ };
export const commandSelectors = { /* ... */ };
export const searchSelectors = { /* ... */ };
export const combinedSelectors = { /* ... */ };
```

独立 selector 文件:
| 文件 | 内容 |
|------|------|
| `workspaceSelectors.ts` | 工作区选择器 |
| `sessionSelectors.ts` | 会话选择器 |
| `editorSelectors.ts` | 编辑器选择器 |
| `terminalSelectors.ts` | 终端选择器 |
| `browserSelectors.ts` | 浏览器选择器 |
| `communicateSelectors.ts` | 通信选择器 |
| `filesSelectors.ts` | 文件选择器 |
| `changesSelectors.ts` | 变更选择器 |
| `ciSelectors.ts` | CI 选择器 |

`useShallow` 模式: 用于返回对象/数组的选择器，避免不必要的重渲染。

## storageHelpers.ts（localStorage 模式）

| 函数 | 用途 |
|------|------|
| `readJson<T>(key, fallback)` | 读取并解析 JSON |
| `writeJson(key, value)` | 写入 JSON（捕获 QuotaExceededError） |
| `readNumber(key, fallback, min, max)` | 读取数字（clamp 约束） |
| `writeNumber(key, value)` | 写入数字 |
| `readFlag(key, fallback)` | 读取布尔标志（'1'/'0'） |
| `writeFlag(key, value)` | 写入布尔标志 |
| `createUiId(prefix)` | 生成唯一 UI ID |
| `createDebouncedWrite(waitMs)` | 创建防抖批量写入器 |
| `scheduleCrossSliceWrite` | 跨切片防抖写入实例 (50ms) |

## isFetching Record 模式

```typescript
// StoreState 中定义
isFetching: Record<string, boolean>;

// action 中使用
set({ isFetching: { fetchGitStatus: true } });
// finally 块
set({ isFetching: { fetchGitStatus: false } });
```

常用 key 命名: `fetchGitStatus`, `fetchIndexStatus`, `fetchAgents`, `fetchMcpServers`, `fetchProviders`

## StoreState.ts 结构

```typescript
interface StoreStateBase extends
  UISlice, WorkspaceSlice, GitSlice, SessionSlice, EditorSlice,
  PatchSlice, SearchSlice, DiagnosticSlice, TaskSlice, CommandSlice,
  ClipboardSlice, TerminalSlice,
  BrowserTabsSlice, BrowserBookmarkSlice, BrowserHistorySlice,
  BrowserFoldersSlice, BrowserLandingSlice, BrowserSlice,
  CiSlice, CommunicateSlice,
  GitHubRepoSlice, GitHubTreeSlice, GitHubSliceType,
  AgentSlice, CustomCommandSlice, PermissionSlice, CompactionSlice,
  WebToolsSlice, McpSlice, ProviderSlice, ReferenceSlice,
  DurableSlice, ToastSlice {
  loading: boolean;
  error?: string;
  isFetching: Record<string, boolean>;
  customAgents: AgentConfig[];
  isFetchingCustomAgents: boolean;
  lspActiveServers: string[];
  lspDiagnostics: DiagnosticInfo[];
}

export interface StoreState extends
  StoreStateBase,
  WorkspaceActions, SessionActions, EditorActions, GitActions,
  PatchActions, SearchActions, TaskActions, CommandActions,
  CustomCommandActions, PermissionActions, CompactionActions,
  DataFetchActions, AgentActions, McpActions, ProviderActions,
  WebToolsActions, LspActions, CustomAgentActions,
  ReferenceActions, SnapshotActions, SessionForkActions,
  PluginActions, DurableActions {
  bootstrap: () => Promise<void>;
}
```
