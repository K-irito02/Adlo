# 浏览器书签元组去重与标题隔离

**日期**：2026-08-15

## 背景

浏览器「新建书签/编辑书签」重构（配合 `docs/plans/browser/2026-08-14-browser-bookmark-toast-title-isolation.md`）将书签去重语义从「按网址（URL）唯一」改为「(网址, 标题) 元组唯一」，并实现标签标题隔离与悬停语义化路径。

## 变更内容

### 1. 去重语义：从 URL-only 改为 (url, title) 元组

- 用户裁决：**URL 是核心身份**。URL 不同、仅标题相同 → 始终允许（不构成碰撞）。URL 相同 + 同路径 + 标题相同 → 真重复，拦截。
- 统一应用在：新建（仅保存/保存并打开）、编辑书签、收藏到目录（星标→目录对话框）、星标切换。
- 全局书签表（`browserBookmarks`）与 folder/workspace 条目均按元组键。
- 删除/清理路径（`browserRemoveTabBookmarks`、`browserRemoveOrphanedBookmarks`）按元组键回收孤儿，避免残留旧标题条目。

### 2. 标签标题隔离

- 已打开/将打开的标签**始终显示网站真实标题**（页面抓取）；书签自定义标题**只在书签树/列表显示**。
- 所有「把书签标题写进 live tab」的写入点被移除：编辑书签（live tab 只更新 url）、保存并打开（`browserOpenTab(url, undefined)`）、当前标签打开书签（只更新 url）、右键「在新标签打开」已收藏书签（传 undefined）。
- 收藏记录通过 `browserBookmarkTab` 的 `titleOverride` 参数写入用户自定义标题。

### 3. 重复提示带语义化路径

- 新建/编辑书签遇真重复时，toast 附带冲突位置的**语义化路径**（如「工作区A/工具/子文件夹」），由 `buildFolderPathLabel`/`buildWorkspacePathLabel` 构建。
- 新增 i18n key `browserBookmarkDuplicateWithPath`（`{path}` 插值）。

### 4. 悬停原生 title 语义化

- 目录/书签悬停的原生 `title` 从内部标识（`folder:xxx`/`bookmark:...`）改为语义化路径（`/` 分隔，与真实文件路径一致）。
- `TreeNodeRow`/`FileTree` 新增可选 `nodeTitle`/`getNodeTitle` prop（默认回退 `nodePath`，不影响其它文件树）。
- `buildBrowserNodeTitleMap` 遍历子树为每个叶子建 `path → 语义化 title` 映射；`baseParentPath` 参数让顶层 userFolder 的直接书签子级获得文件夹前缀。

## 经验教训

1. **store 去重语义与 UI「已收藏」判断必须同步**：当 store 的 toggle 改为元组语义后，UI 层所有「isBookmarked/bookmarkedUrls」判断若仍按 URL-only，会出现「取消收藏反而新增书签」的反向行为。二者必须同时迁移。
2. **多写入点需统一去重规则**：创建、编辑、保存并打开、收藏到目录、星标切换是 5 个独立写入点，去重谓词必须一致（`url === url && title === title`），否则同一 URL 不同标题时各路径行为分裂。
3. **删除/清理路径需元组键**：创建允许同 URL 多标题后，`browserRemoveTabBookmarks`/`browserRemoveOrphanedBookmarks` 若仍按 URL 清理，会误删其它标题条目。需按元组键回收。
4. **标题双轨（标签=网站标题/书签=自定义标题）**：标签标题由页面抓取，书签标题由用户自定义，二者解耦。实现时需保证「打开标签」与「写收藏」走不同标题来源（`browserOpenTab` 传 undefined + `browserBookmarkTab` 用 titleOverride）。
5. **路径分隔符统一**：语义化路径用 `/`（与真实文件路径一致），`buildWorkspacePathLabel` 需把 Windows 反斜杠归一化为 `/`。

## 2026-11-15 修订（收藏身份与取消入口）

> 上文第 1 条已被部分取代：UI 层「已收藏」判断现按**严格 URL 身份键** `bookmarkUrlKey`（协议 + 主机含端口 + 归一化路径/query，忽略 hash），不再使用 `(url,title)` 元组；`browserToggleBookmark` 仍保留元组语义供写路径使用。取消收藏也不再统一调 toggle：
>
> - 地址栏实心星 → `browserRemoveBookmarksForUrl(url)`（URL 级，清理全局索引 + 各目录/工作区副本）；
> - 书签目录/列表中的书签行 → 条目级 `browserRemoveBookmark(bookmarkId)`；
> - 搜索/历史/标签行 → 按行归属走对应标签/历史/书签动作。
>
> 因此「UI URL-only + toggle 元组」是**有意共存**的两套语义，不再要求二者同时迁移；上文第 1 条仅作为历史记录保留。

## 相关文件

- `frontend/src/app/stores/slices/browserBookmarkSlice.ts`（去重、toggle、cleanup、titleOverride）
- `frontend/src/app/stores/slices/browserFoldersUtils.ts`（`buildFolderPathLabel`/`buildWorkspacePathLabel`）
- `frontend/src/app/features/browser/useBrowserDialogs.ts`（新建/编辑/收藏到目录流程）
- `frontend/src/app/features/browser-tree/browserTreeTitle.ts`（`buildBrowserNodeTitleMap`）
- `frontend/src/app/features/file-tree/TreeNodeRow.tsx`、`FileTree.tsx`（`nodeTitle`/`getNodeTitle`）
