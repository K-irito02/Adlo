# GitHub CI 按目录独立绑定与数据隔离

## 背景

GitHub 通信面板支持两种目录类型：**工作区**（顶级目录）和 **文件夹**（用户创建的子目录）。二者各自需要独立绑定 GitHub 仓库配置并显示对应的 CI 状态数据。

## 解决的问题

### 1. `renderChildMeta` 设置按钮打开错误的配置

`GitHubTreeEntry.tsx` — `renderChildMeta` 中，子目录的齿轮设置按钮通过 `isUnderWorkspace` 判断打开工作区还是文件夹设置。但 `isUnderWorkspace` 检查的是**父节点**是否有 `workspaceId`，导致工作区下的子文件夹点击设置时打开了**工作区**的配置对话框，用户以为在配子目录，实际配了工作区。

**教训**：无论父节点类型，子文件夹的设置按钮应始终调用 `onOpenFolderSettings(childFolderId)`。

### 2. `ciSnapshot` 全局共享导致目录间数据混淆

`ciSnapshot` 是 Zustand store 中的单一字段，不同目录共用。切换目录时 `restoreCiSnapshot(id)` 若无缓存则返回 `{}`，上一个目录的数据残留显示。

**修复**：无缓存时显式清空 `ciSnapshot: null, ciJobs: [], ciError: null`，确保不显示错误目录的数据。

### 3. 日志状态全局共享

`selectedLogJobId`、`cachedJobLogs`、`logLoading`、`logError` 均为全局字段：

| 字段 | 问题 |
|------|------|
| `selectedLogJobId` | 不同目录共用，切换后仍记住上个目录的选中 job |
| `cachedJobLogs` | 按 `jobId` 索引，不同目录的同 ID job 日志互相覆盖 |

**修复**：日志状态改为局部 `useState` + `key={activeId}` 强制重新挂载，同时存入 store 的 `ciLogCaches[dirId]` 以实现持久化和跨切换恢复。

### 4. Store 同步 `set()` 被 return 覆盖

在 Zustand slice factory 中同步调用 `set({ ciSnapshots: savedSnapshots })`，但同 slice 的 return `{ ciSnapshots: {} }` 在 `...spread` 时**覆盖**了已设置的值。

```typescript
// ❌ 会被 return { ciSnapshots: {} } 覆盖
set({ ciSnapshots: savedSnapshots });
return { ciSnapshots: {}, ... };
```

**教训**：Store 构建期间的同步 `set()` 会在 spread 时被 return 值覆盖。必须用 `Promise.resolve().then(() => set(...))` 延后到 store 构建完成。

### 5. 按目录的数据持久化

- **CI 快照**：`ciSnapshots` → `adl-ui:ci-snapshots`，每次 `refreshCiStatusForWorkspace` 成功后写入
- **日志缓存**：`ciLogCaches` → `adl-ui:ci-log-caches`，日志变更时 debounced 写入

两者均按 `dirId` 索引，切换目录时从 `ciSnapshots[dirId]` / `ciLogCaches[dirId]` 恢复，零 API 调用。

### 6. Access Token 在设置对话框中始终为空

`GitHubSettingsDialog` 每次打开时 `setToken('')`，且未接收 `initialToken` prop。即使用户之前已填写过 token，重新打开设置仍需重填。

**修复**：添加 `initialToken` prop，从 store 的 `ciAccessToken` 传入，使用密码输入框掩码显示。

### 7. Token hydration 缺少本地回退

令牌 hydration 依赖 `bridge.github.hasAccessToken()`，若桥接层失败则无法恢复 token。

**修复**：在桥接检查之后添加 `localStorage.getItem(CI_ACCESS_TOKEN_KEY)` 直接回退读取。

### 8. 切换目录不触发自动刷新（Rate Limit 保护）

自动刷新仅发生在以下时机：
- 配置/重新配置仓库（`handleSettingsSave` → `onRefreshWorkspace`）
- Git push 检测（`notifyGitPushed`）
- 用户手动点击刷新按钮

切换目录、点击子条目**绝不触发 API 调用**，仅从缓存恢复显示。

## 相关文件

| 文件 | 修改内容 |
|------|----------|
| `GitHubTreeEntry.tsx` | `renderChildMeta` 设置/刷新按钮始终操作子目录而非父工作区；`actionButtonsSlot` 刷新按钮支持文件夹 |
| `GitHubPanel.tsx` | `handleSelectTreePath` 切换目录不自动刷新；`handleSettingsSave` 文件夹保存触发刷新+token；日志传入 `dirKey`+`initialJobId` |
| `githubCiStatusSlice.ts` | `ciSnapshots` + `ciLogCaches` 持久化 + `restoreCiSnapshot` 无缓存清空；hydration 时序修正 |
| `GitHubLogViewer.tsx` | 日志状态改为从 `ciLogCaches[dirKey]` 读取；selector 不返回新对象 |
| `GitHubSettingsDialog.tsx` | 新增 `initialToken` prop，对话框保留已有令牌 |
| `githubCiConfigSlice.ts` | Token hydration 添加 localStorage 回退 |
