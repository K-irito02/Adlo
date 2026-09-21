# 书签名默认值、标签命名、文件夹标签插入修复 — 2026-06-21

## 问题清单

| # | 问题 | 根因 | 涉及文件 |
|---|------|------|---------|
| 1 | 书签/标签名显示 i18n 占位符（"新标签页"） | `getAppCopy().browserDefaultTabTitle` 被用作默认 title | `browserTabsSlice.ts` |
| 2 | 书签星号 toggle 时 title 为空 | `browserBookmarkSlice.ts` 未对空 title 做 hostname 回退 | `browserBookmarkSlice.ts` | — 合并了 |
| 3 | 书签跳转时无 title 回退 | 同上 | `browserBookmarkSlice.ts` |
| 4 | 目录树中 tab 节点显示"无标题" | 硬编码 `'无标题'` fallback | `useBrowserTreeData.ts` |
| 5 | 新建标签对话框 name 字段必填但无实际用途 | 空 name 无法确认，但 title 应该可选 | `CreateTabDialog.tsx` |
| 6 | 新建目录对话框空 name 直接取消 | `RenameDialog.tsx` 空值视为无变更直接 cancel | `RenameDialog.tsx` |
| 7 | 文件夹"+"按钮创建的标签出现在目录顶级，不在文件夹内 | `browserOpenTab` 无 `folderId` 参数，且 folder 更新与 tab 创建不同步 | `browserTabsSlice.ts`, `BrowserPanel.tsx`, `BrowserNavigator.tsx` |
| 8 | HMR 不更新 Zustand store（需 Ctrl+F5） | Vite HMR 不重新初始化 store closures | — |
| 9 | 浏览器非 workspace 目录下"+"按钮不响应 | navigar header "+" 只提取 `workspaceId`，忽略 `folderId` | `BrowserNavigator.tsx` |

## 修复详情

### 1. 标签/书签名默认值

`browserTabsSlice.ts`:
- 删除 `getAppCopy` 导入，删除 `browserDefaultTabTitle` 引用
- 新增 `hostnameFromUrl(url)`：`new URL(url).hostname.replace(/^www\./, '') || url`
- `browserOpenTab`: title fallback 链改为 `title?.trim() || (url ? hostnameFromUrl(url) : '')`

`browserBookmarkSlice.ts`:
- 所有 title 为空时 fallback 到 `hostnameFromUrl(url)`

`useBrowserTreeData.ts`:
- 删除 `'无标题'` 硬编码 fallback，直接返回 `name`

### 2. 新建标签 name 可选

`CreateTabDialog.tsx`:
- 删除 `handleConfirm` 中空 name early return
- 确认按钮 `disabled` 条件改为 `!url.trim()`（仅 URL 必填）
- `onConfirm` 传入 `name.trim()`（允许空字符串）

### 3. 新建目录空 name 处理

`RenameDialog.tsx:46`:
- 提前返回条件从 `!trimmed || trimmed === initialValue` 改为 `initialValue && (!trimmed || trimmed === initialValue)`
- 当 `initialValue` 为空（新建目录），空字符串不会触发取消，而是提交给上层处理

### 4. 文件夹标签插入（核心修复）

**根因**：`browserOpenTab` 只接受 `(url, title, workspaceId)`，文件夹"+"按钮创建标签后需要通过第二步 `browserUpdateTabFolder` 将 tabId 加入文件夹，两步之间存在时序问题（React 闭包、Zustand set 批次等）。

**修复**（原子化方案）：

`browserTabsSlice.ts`:
- `browserOpenTab` 新增第 4 参数 `folderId?: string`
- 在单个 `set()` 回调中同时创建 tab 原子更新 folder.tabs[]
- 当 folderId 存在时，workspaceId 传入 `undefined`（标签不归 workspace 管，避免树顶级重复）
- 新增 `scheduleWrite(BROWSER_TAB_FOLDERS_KEY, nextFolders)` 持久化

`BrowserPanel.tsx`:
- 新增 `pendingFolderIdRef`（`useRef<string>`）—— 保证 `handleCreateTabConfirm` 读取最新 folderId
- `handleCreateTabConfirm` 从 ref 读取 folderId，调用 `browserOpenTab(url, name, folderId ? undefined : workspaceId, folderId || undefined)`
- `handleSetCreateTabDialog` 同步更新 ref 和 state

`BrowserNavigator.tsx`:
- 导航栏 header "+" 按钮：从 `path` 解析 `fId` 和 `wsId`，传入 `setCreateTabDialog({ open: true, workspaceId: wsId, folderId: fId })`
- 树条目 "+" 回调：`onCreateTab: (workspaceId, folderId)` → 同样传入 `folderId`

### 5. IconGlobe → IconLink

`BrowserTreeEntry.tsx`, `BrowserEntrySubEntries.tsx`, `BrowserTabBar.tsx`:
- 将 `IconGlobe` 替换为 `IconLink`（URL fallback 图标更贴切）
- CSS class 从 `adl-browser-tree__globe-fallback` 改为 `adl-browser-tree__link-fallback`
- CSS class `adl-tool-list__default-icon--globe` 改为 `adl-tool-list__default-icon--link`

### 关键原理

- **原子化 set()**：`browserOpenTab` 在 Zustand `set()` 回调中同时更新 `browserTabs` 和 `browserTabFolders`，树计算 `useBrowserTreeData` 一次 useMemo 即看到结果
- **Ref 绕过闭包**：`pendingFolderIdRef` 确保 `handleCreateTabConfirm` 读取最新 folderId，不受 React 批次/闭包影响
- **workspaceId 清空**：当 folderId 有值时 workspaceId 传 `undefined`，`buildWorkspaceCategoryTree` 过滤 `tabs.filter(t => t.workspaceId === ws.id)` 确保标签不进入 workspace 顶级

### 涉及文件

- `frontend/src/app/stores/slices/browserTabsSlice.ts`
- `frontend/src/app/stores/slices/browserBookmarkSlice.ts`
- `frontend/src/app/features/browser/BrowserPanel.tsx`
- `frontend/src/app/features/browser/BrowserNavigator.tsx`
- `frontend/src/app/features/browser/browser-landing/CreateTabDialog.tsx`
- `frontend/src/app/features/browser/BrowserTabBar.tsx`
- `frontend/src/app/features/browser-tree/BrowserTreeEntry.tsx`
- `frontend/src/app/features/browser-tree/BrowserEntrySubEntries.tsx`
- `frontend/src/app/features/browser-tree/useBrowserTreeData.ts`
- `frontend/src/app/components/RenameDialog.tsx`
- `frontend/src/styles/regions/rightpanel/files-navigator.css`
