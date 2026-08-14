# 书签错误提示友好化 + 标签标题隔离 + 悬停语义化路径设计

**日期**：2026-08-14

## 背景

浏览器"新建书签"重构（已完成 Task 1-8）引入了按 (路径, url, title) 去重的语义。本次是三项收尾优化：

1. **错误提示友好化**：当"新建书签/编辑书签"因真重复被拦截时，当前只有编辑书签有 toast（`browserEditBookmarkDuplicate`），且不附带重复发生的**位置**。需补全新建书签的提示，并在所有提示中内嵌**语义化路径**（用户界面显示的层级路径，如"工作区A → 工具 → 子文件夹"），帮助用户定位。
2. **标签标题隔离**：书签自定义标题只应在书签树/列表里显示，**绝不**影响已打开的标签或将要打开的标签。已打开的标签始终显示网站自身的真实标题（页面抓取）。
3. **悬停语义化路径**：鼠标悬停在目录或书签上时，系统原生 `title` 显示内部标识（`folder:xxx` / `bookmark:...`），与用户界面看到的路径不一致。需改为语义化路径（如"工作区A → 工具 → 子文件夹"）。

## 需求澄清（用户确认）

- **需求 1**：toast 文案内嵌语义化路径，覆盖全面（新建书签仅保存/保存并打开 + 编辑书签）、提示详细。
- **需求 2**：标签始终显示网站真实标题；自定义标题只在书签树里显示。范围覆盖：编辑书签、新建书签（保存并打开）、点击打开书签。
- **需求 3**：目录/书签悬停 title 改为语义化路径，与用户界面显示的路径一致。

## 当前行为与问题点

### 需求 1 现状

| 操作 | 当前拦截行为 | 问题 |
|------|-------------|------|
| 编辑书签 | `browserUpdateSavedBookmark` 返回 `{ok:false}` → toast `browserEditBookmarkDuplicate`（无路径） | 无位置信息 |
| 新建书签-仅保存 | `browserCreateBookmarkEntry` 静默 return（无返回值、无提示） | 静默失败，用户不知被拦 |
| 新建书签-保存并打开 | `browserBookmarkTab` 预追加检查拦截（无提示） | 无提示 |

### 需求 2 现状（自定义标题泄漏到标签的写入点）

| 位置 | 代码 | 问题 |
|------|------|------|
| 编辑书签 | `useBrowserDialogs.ts:157-160` `browserUpdateTab(tabId, { title: trimmedName, url: trimmedUrl })` | 把自定义标题写进 live tab |
| 点击"在当前标签打开"书签 | `useBrowserTagActions.ts:131` `browserUpdateTab(activeTabId, { url: tab.url, title: tab.title })` | `tab.title` 可能是书签快照标题，覆盖 active tab 标题 |
| "保存并打开"新建书签 | `useBrowserDialogs.ts:118,165` `browserOpenTab(url, title, ...)` / `browserNavigateActiveTab(url, title)` | 用自定义标题打开标签 |

> 注：`browserCreateBookmarkEntry`（仅保存）和 `browserUpdateSavedBookmark`（编辑的收藏记录部分）本身**不写** `browserTabs`，无泄漏问题。泄漏只来自上面 3 个 UI 调用点。

## 设计

### 1. 语义化路径工具（新）

**新增纯函数**（`frontend/src/app/stores/slices/browserFoldersUtils.ts`）：

```ts
/** 沿 parentId 链构建文件夹层级路径标签，如 "工具 → 子文件夹"。 */
export function buildFolderPathLabel(
  folderId: string,
  folders: TabFolderState[],
  workspaces: RecentWorkspaceEntry[],
): string;

/** 构建工作区路径标签，如 "工作区A"。 */
export function buildWorkspacePathLabel(
  wsId: string,
  workspaces: RecentWorkspaceEntry[],
): string;
```

**规则**：
- 文件夹路径：从目标文件夹沿 `parentId` 向上收集名称，根在上、目标在下，用 `" → "` 连接。仅含文件夹名（不含前缀 `folder:`）。
- 若文件夹的 `parentType === 'workspace'`（即挂在某工作区下），最前面加该工作区名（从 `recentWorkspaces` 按 id 匹配 `name || path`）。
- 顶层文件夹（无 `parentId`）：只返回文件夹名。
- 未知 `folderId`：返回空字符串（调用方回退到不带路径的文案）。
- 未知 `wsId`：返回空字符串。
- 循环 `parentId` 保护：沿链向上最多 N 步（如 20），超出截断，避免死循环。

> 依赖 `RecentWorkspaceEntry` 类型（`workspaceSlice.ts` 已用）与 `TabFolderState`（`browserFoldersTypes.ts`）。

### 2. store 拦截返回路径（需求 1）

**`browserUpdateSavedBookmark`**（`browserBookmarkSlice.ts`）：返回值从 `{ ok: boolean }` 扩展为 `{ ok: boolean; pathLabel?: string }`。`ok:false` 时 `pathLabel` 为冲突位置的语义化路径（构建逻辑见上，读取 `_get()` 的 `browserTabFolders` + `recentWorkspaces`）。

**`browserCreateBookmarkEntry`**（`browserBookmarkSlice.ts`）：当前为同步 `set` 且无返回值。改为：拦截（folder/workspace 真重复）时返回 `{ ok: false; pathLabel: string }`，成功返回 `{ ok: true }`。`set` 回调内无法直接取返回值，采用 `_get()` + 提前判断冲突的方式：
- 进入 `set` 前先用 `_get()` 读当前 folder/workspace 条目，判断是否冲突；冲突则返回 `{ ok: false, pathLabel }`（不执行 `set` 写入）。
- 不冲突则照常 `set`，返回 `{ ok: true }`。

> 需保持 `set` 内的 `foldersChanged`/`wsChanged`/tabIdUrlMap 写入逻辑不变（Task 3/8 修复过）。

**`browserBookmarkTab`**（`browserBookmarkSlice.ts`，save-and-open 路径）：当前返回 `void`，拦截发生在 `computeBookmarkTabOutcome` 的 `set` 内。改为返回 `{ ok: boolean; pathLabel?: string }`：在 `set` 前用 `_get()` + `computeBookmarkTabOutcome` 预判冲突；冲突时 `ok:false` + `pathLabel`（不执行 `set`）；不冲突则照常 `set`，返回 `{ ok: true }`。
> 保留真实 tabId 关联：save-and-open 仍走 `browserOpenTab`（真实标签）+ `bookmarkNewTab`→`browserBookmarkTab`（真实 tabId 写入收藏），与现状一致；仅新增返回值供 UI 层判断是否弹 toast。

**调用方**（`useBrowserDialogs.ts`）：
- `handleEditTabConfirm`：`result.ok === false` → `showToast(t.browserBookmarkDuplicateWithPath, 'warning', ...)`（用 `{path}` 插值 `result.pathLabel`）。回退：`pathLabel` 为空时用不含路径的 `browserEditBookmarkDuplicate`。
- `handleCreateTabConfirm` save-only 分支：`store.browserCreateBookmarkEntry(...)` 返回 `{ok, pathLabel}`；`ok:false` → toast（含路径），不写任何状态。
- `handleCreateTabConfirm` save-and-open 分支：`bookmarkNewTab` 改为返回 `{ok, pathLabel}`（内部调 `browserBookmarkTab` 拿返回值）；`ok:false` → toast（含路径）。注意：`browserOpenTab` 会先创建真实标签——**顺序调整**为先判断冲突再开标签：save-and-open 分支先调 `browserCreateBookmarkEntry` 预检（返回 `{ok,pathLabel}`），`ok:false` → toast 并 return（不开标签）；`ok:true` → 再 `browserOpenTab(url, undefined, ...)` + `bookmarkNewTab` 建立真实 tabId 关联（此时 `browserCreateBookmarkEntry` 已用合成 tabId 写入收藏，`bookmarkNewTab`/`browserBookmarkTab` 以真实 tabId 幂等更新——同 tabId+url 则更新标题，语义一致）。

> **实现注意**：save-and-open 的双写（`browserCreateBookmarkEntry` 合成 tabId + `browserBookmarkTab` 真实 tabId）需在实现时核对 `computeBookmarkTabOutcome` 的查重逻辑，确保合成 tabId 条目会被真实 tabId 条目正确更新/覆盖，避免残留两条记录。若存在残留风险，改为：save-and-open 分支先仅做**只读预检**（新增纯函数 `checkBookmarkCollision(url, title, workspaceId?, folderId?)` 返回 `{ok, pathLabel}`，不写状态），`ok` 后再走原 `browserOpenTab` + `bookmarkNewTab`（真实 tabId 单写）。计划阶段以"只读预检"为推荐实现。

### 3. i18n key（需求 1）

`zh-CN/browser.ts` 与 `en-US/browser.ts` 同时新增/调整：

| key | zh | en |
|-----|----|----|
| `browserBookmarkDuplicateWithPath`（新） | `该位置已存在相同网址与标题的书签：{path}` | `A bookmark with the same URL and title already exists at: {path}` |
| `browserEditBookmarkDuplicate`（保留，作无路径回退） | 现有值 | 现有值 |

> 插值格式需与现有 i18n 插值机制一致（检查 `formatT`/`formatMessage` 用法，参考 `browserRefreshMetaHint` 等带变量的 key）。

### 4. 标签标题隔离（需求 2）

**4a. 编辑书签**（`useBrowserDialogs.ts:157-160`）：
- `browserUpdateTab(tabId, { url: trimmedUrl })` —— 移除 `title: trimmedName`。live tab 标题交给页面抓取（`useBrowserPageMeta`/`useBrowserUrlChange`）。
- `browserUpdateSavedBookmark` 保持只写收藏记录（不碰 live tab）。✓

**4b. 点击"在当前标签打开"书签**（`useBrowserTagActions.ts:131`）：
- `browserUpdateTab(activeTabId, { url: tab.url })` —— 移除 `title: tab.title`。

**4c. "保存并打开"新建书签**（`useBrowserDialogs.ts:118,165`）：
- 打开标签时不传自定义标题：`browserOpenTab(url, undefined, ...)`（新建标签）、`browserNavigateActiveTab(url, undefined)`（当前标签）。
- 页面加载后由现有页面标题抓取逻辑覆盖为真实标题。
- 保留真实 tabId 的收藏关联：打开标签后 `bookmarkNewTab`（→`browserBookmarkTab`）仍以真实标签 id 写入收藏。`browserOpenTab` 的 folderId 参数传 `undefined`（收藏写入统一由 `browserBookmarkTab` 负责，避免 `browserOpenTab` 的 folder append 用空标题重复写入）。

**4d. 树显示不变**：书签树节点仍显示快照/自定义标题（`buildFolderNode` 用 snapshotTitle）。仅打开标签的行为变化。

### 5. 悬停语义化路径（需求 3）

**问题定位**：
- 顶层目录/工作区条目：`MultiTreeEntryShell.tsx:110` `<span title={label}>` —— 已显示名称（语义化）。✅ 无需改。
- **嵌套节点**（书签、子文件夹、工作区书签）：`TreeNodeRow.tsx:117` `<button title={nodePath}>` —— 显示内部路径（`folder:xxx` / `bookmark:...` / `tab:...`）。❌ 需改。
- 嵌套节点由 `BrowserEntrySubEntries` → `FileTree` → `TreeNodeRow` 渲染；`FileTree` 传入 `nodePath={node.path}`，`TreeNodeRow` 直接用作 `title`。

**方案**：
- `TreeNodeRow` 新增可选 prop `nodeTitle?: string`：`title={nodeTitle ?? nodePath}`（默认回退 `nodePath`，不影响其他文件树——git 树、工作区树等仍显示内部路径，本次不改它们）。
- `FileTree` 新增可选 prop `getNodeTitle?: (node: T) => string | undefined`：`VirtualNodeComponent` 计算 `title={getNodeTitle?.(node)}` 传入 `TreeNodeRow`。
- `BrowserEntrySubEntries`（浏览器树唯一的 `FileTree` 调用方）提供 `getNodeTitle`：
  - 子文件夹（`kind === 'directory'`，nodeType `folder`）：`buildFolderPathLabel(node.folderId!, tabFolders, workspaces)` → 如"工作区A → 工具 → 子文件夹"。需从 store 读取 `browserTabFolders` + `recentWorkspaces`。
  - 书签/标签叶子（`kind === 'file'`）：**路径 + 书签名**（用户已确认）——若该叶子所属的父目录能解析出路径，则显示 `"{父路径} / {书签名}"`（如"工具 → 子文件夹 / 百度"）；无法解析路径（如历史叶子、独立工作区书签无父目录）则退化为仅名称 `node.name`。
  - 历史叶子（history）：名称（`node.name`）。
- 保持 `data-path={nodePath}` 不变（内部逻辑/测试依赖）。

> `BrowserEntrySubEntries` 当前已 `useAppStore`（line 11 import），可读取 `browserTabFolders`/`recentWorkspaces`。

### 6. 测试

- **`browserFoldersUtils.test.ts`**（新）：路径构建——顶层文件夹、嵌套（父→子）、workspace 下嵌套、未知 id 返回空、循环 parentId 截断。
- **store 测试**（`browserBookmarkSlice.test.ts`）：
  - `browserCreateBookmarkEntry` 拦截返回 `{ok:false, pathLabel}`；成功返回 `{ok:true}`；不写状态。
  - `browserUpdateSavedBookmark` 拦截返回 `{ok:false, pathLabel}`；成功 `{ok:true}`。
- **`useBrowserDialogs.test.ts`**：
  - 新建-仅保存遇重复 → toast 含路径，不写 live tab。
  - 新建-保存并打开遇重复 → toast 含路径，不开标签（顺序调整：先预检冲突再开标签）。
  - 编辑遇重复 → toast 含路径，`browserUpdateTab` 不被调用。
  - 编辑成功 → `browserUpdateTab` 只传 url（不传 title）。
  - 保存并打开成功 → `browserOpenTab` 不传自定义标题。
- **`browserBookmarkSlice.test.ts`**：`browserBookmarkTab` 拦截返回 `{ok:false, pathLabel}`；成功 `{ok:true}`。
- **`useBrowserTagActions.test.ts`**（若存在）：当前标签打开书签 → `browserUpdateTab` 只传 url（不传 title）。若文件不存在则新建或并入 useBrowserDialogs 测试。
- **悬停 title（需求 3）**：
  - `TreeNodeRow`/`FileTree`：新增 `nodeTitle`/`getNodeTitle` prop 且默认回退 `nodePath`（不影响其他文件树）；现有文件树测试不破坏。
  - `BrowserEntrySubEntries` 的 `getNodeTitle`：目录节点 title = `buildFolderPathLabel` 结果；书签/标签叶子 = `"{父路径} / {书签名}"`（父路径无法解析时退化为 `node.name`）；历史叶子 = `node.name`。
- **`keys.test.ts`**：parity 自动校验新 key。

## 变更文件清单

| 文件 | 变更 |
|------|------|
| `stores/slices/browserFoldersUtils.ts` | 新增 `buildFolderPathLabel` / `buildWorkspacePathLabel` |
| `stores/slices/browserBookmarkSlice.ts` | `browserCreateBookmarkEntry` 返回 `{ok,pathLabel}`；`browserUpdateSavedBookmark` 返回 `{ok,pathLabel}`；`browserBookmarkTab` 返回 `{ok,pathLabel}` |
| `features/browser/useBrowserDialogs.ts` | 编辑/新建拦截 toast（含路径）；编辑不再写 live tab title；保存并打开不带自定义标题（仍走 bookmarkNewTab 建立真实 tabId 关联，先预检冲突再开标签） |
| `features/browser/useBrowserTagActions.ts` | 当前标签打开书签不再写 title |
| `features/file-tree/TreeNodeRow.tsx` | 新增 `nodeTitle?: string`，`title={nodeTitle ?? nodePath}` |
| `features/file-tree/FileTree.tsx` | 新增 `getNodeTitle?: (node) => string \| undefined`，传给 TreeNodeRow |
| `features/browser-tree/BrowserEntrySubEntries.tsx` | 提供 `getNodeTitle`（目录→语义化路径；叶子→名称） |
| `i18n/zh-CN/browser.ts`、`i18n/en-US/browser.ts` | 新增 `browserBookmarkDuplicateWithPath` |
| 各测试文件 | 见第 6 节 |

## 不做的事（YAGNI）

- 不新增 toast 组件/富文本/展开交互（确认内嵌文案即可）。
- 不动星标收藏按钮（url 开关语义，之前已确认）。
- 不动书签树节点标题显示（保留自定义标题展示）。
- 不动 `browserToggleBookmark` 去重（保持 url-keyed）。
- 不改其他文件树（git 树、工作区文件树等）的悬停 title——本次仅浏览器树，`nodeTitle ?? nodePath` 默认回退保证无影响。
