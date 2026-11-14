# R1 审查报告 — 收藏身份 / 实心星 / 图标（rev1）

## 范围

- 快照：`.review-diffs/manifest-rev1.md`（base `4484cf75c`，55 文件）；只看 rev1 全量 diff。
- 逐文件核对：`browserDisplayUtils.ts`、`browserBookmarkSlice.ts`、`browserBookmarkSlice.test.ts`、`useBrowserTabs.ts`、`useBrowserTabs.test.ts`、`useBookmarkToFolderDialog.ts`、`useBookmarkToFolderDialog.test.tsx`、`CenterBrowserView.tsx`、`CenterBrowserView.test.tsx`、`BrowserTabBar.tsx`、`icons/actions.tsx`、`icons/actions.test.tsx`、`icons/core.tsx`（新增箭头）、`icons/core.test.tsx`、`icons/index.ts`。
- 交叉核对（同轮其它 scope 的文件，仅作证据）：`browserEntrySubEntriesUtils.tsx`、`BrowserTreeEntryMenu.tsx`、`BrowserTreeEntry.tsx`/`BrowserTreeEntryChildren.tsx`、`BrowserTreeEntryFlatList.tsx`、`BrowserNavSearchMode.tsx`、`bookmarkTransferSlice.ts`、`useBrowserPanelCloseHandlers.ts`。
- 未跑测试；测试有效性按「删掉修复后哪条断言变红」做删除性推演（见末节）。
- 本轮无 CSS/主题改动，不涉及 `ui-probe` 计算样式门禁。

## 上轮问题关闭情况

1. **收藏状态只按 URL（归一化）判定 — 已关闭（附 F3 口径注记）。**
   `useBrowserTabs.ts:88` 与 `CenterBrowserView.tsx:115` 均改为 `isUrlBookmarked(browserBookmarks, activeTab?.url)`；搜索/树菜单标签同口径（`BrowserNavSearchMode.tsx:207`、`BrowserEntrySubEntries.tsx:270,353`、`BrowserTreeEntryMenu.tsx:359`）。全仓 UI 已无 `browserBookmarks.some(url&&title)` 的收藏态判定（只剩 store 内元组增删语义）。导入/仅保存的标题快照与页面标题不同时星标可实心，`useBrowserTabs.test.ts:34-56` 与 `CenterBrowserView.test.tsx:256-284` 的删除性推演均会变红。

2. **`browserRemoveBookmarksForUrl` 删除范围/持久化/孤儿索引 — 已关闭。**
   - 范围：`removeEntriesMatching` 遍历全部目录（含嵌套，目录是扁平数组）与全部工作区条目，按 `historyDedupKey` 删所有同 URL 条目；`browserBookmarkSlice.ts:835-840` 再兜底清「仅存在于全局索引、未挂目录/工作区」的条目。
   - 持久化：三个 key 分别按 `wsChanged`/`foldersChanged`/`bookmarksChanged` 落盘（`browserBookmarkSlice.ts:851-859`），未变化的 key 不写。
   - 孤儿索引：helper 先按「元组是否仍被引用」修剪，再按 URL 键清剩余索引项；因为所有同键容器条目已在前一步删除，不会误删仍被引用的元组。
   - 与 `browserToggleBookmark` 元组语义：新增注释与实际一致；可达流程中未产生反向语义——`browserSetPendingBookmark` 只在 `!isUrlBookmarked` 时投递（`browserEntrySubEntriesUtils.tsx:168-179`），对话框 pending 分支的 toggle 不会命中取消分支。**但书签行「取消收藏」存在另一处范围冲突，见 F1。**

3. **所有收藏/取消收藏入口同步 — 未关闭。**
   面板/中心地址栏星标、树行菜单、搜索菜单已统一到 URL 级；`BrowserTabBar` 的关闭按钮误用「取消收藏」tooltip/aria 已改回 `_t.close`。**未同步项：同一书签行在两种视图模式下「取消收藏」的删除范围不同（F1）**；另有一条预存入口缺陷（F2）。

4. **实心星 Tabler 单轮廓（几何/a11y/尺寸/许可/错误路径）— 已关闭。**
   - 错误路径：不再复用空心星 `d`，`actions.tsx:137-140` 使用 Tabler `star-filled` 独立路径；`actions.test.tsx:19-30` 断言 1 个 `M` 子路径、无 `fillRule`、`fill=currentColor`、`stroke=null`，删除修复后会变红。
   - a11y：`makeFilled` 与 `make` 共用 `resolveA11y`；两处调用均为 `size={14} decorative`，按钮自身提供随状态变化的 `aria-label`，无 `aria-pressed`（符合「名称随状态变化」规则）。
   - 尺寸：两个 call site 均 14；`makeFilled` 默认 16 未被使用。
   - 许可：注释含 Tabler / MIT / 官方链接，符合根 AGENTS「外部参考代码标注 MIT 来源」。
   - 记录：视觉外接尺寸与空心星不完全一致（见「记录不修」），非缺陷。

5. **单测删除性推演 / 预存 / 绝对断言 — 部分关闭。**
   - `useBrowserTabs.test.ts`、`CenterBrowserView.test.tsx`、`useBookmarkToFolderDialog.test.tsx`、`browserBookmarkSlice.test.ts`、`actions.test.tsx` 的删除性推演均成立（详见末节）。
   - 未覆盖：书签行「取消收藏」分支（F1）、`BrowserTabBar` 文案修复、pending 投递的目录落位（F2）。
   - 绝对断言：URL 身份相关注释与代码相符；`core.tsx` 箭头注释与落库用法不符（F4）。

## 新增发现

### F1 [severity: medium] [category: 正确性]
- 位置：
  - `adlo/frontend/src/app/features/browser-tree/BrowserTreeEntryMenu.tsx:357-372`（扁平/列表视图右键菜单：书签行「取消收藏」→ `handleBookmarkToggle` → `browserRemoveBookmarksForUrl`，按 URL 删除**所有副本**）
  - `adlo/frontend/src/app/features/browser-tree/browserEntrySubEntriesUtils.tsx:251-262`（树视图 FileTree 菜单：`isSavedBookmark && bookmarkId` → `onRemoveBookmarkTab`，只删**当前条目**）
  - 视图分派证据：`BrowserTreeEntry.tsx:63` `isFlatMode = list || all` → `BrowserTreeEntryChildren.tsx:60-74` 走 `BrowserTreeEntryFlatList` + `BrowserTreeEntryMenu`；非扁平走 `BrowserEntrySubEntries` → `getTabContextMenuItems`。
- 描述：同一个书签行、同一个「取消收藏」文案，在「书签列表」里删除该 URL 在所有目录/工作区的副本，在「书签目录」树里只删除当前条目。若同一 URL 被保存到两个目录（判重只在目标容器内，允许存在），列表视图一次点击会静默删掉另一个目录的副本；树视图点击后 URL 仍被另一条引用，地址栏星标仍实心，与「取消收藏」的字面承诺相反。两处语义都不算「所有入口同步」。
  另：`getTabContextMenuItems` 的删除分支只以 `isSavedBookmark` 为条件，与文案条件 `isBookmarked` 不同源——一旦索引与条目短暂不一致（或未来调用方传错 `isBookmarked`），会出现「label=收藏、点击=删除」的反向动作。
- 证据：上述两分支代码；`BrowserBookmarkRowActions.test.tsx:155-164` 只断言「删除」走 `onRemoveBookmarkTab`，未断言 bookmark-toggle 分支（删除该分支不会变红）；`BrowserTreeEntryMenu` 侧无任何测试。
- 建议修复：先由用户确认书签行「取消收藏」应表达「移除这条收藏」还是「取消该 URL 的收藏」，然后两处统一：
  - 若保持条目级（推荐，避免静默删其它目录副本）：扁平视图也走 `onRemoveBookmarkTab(node.bookmarkId, url)`，并把文案换成「删除书签/删除收藏条目」，不与 URL 级「取消收藏」共用 key；同时把删除分支条件改为 `isBookmarked && node.isSavedBookmark && node.bookmarkId`。
  - 若坚持 URL 级：移除 `getTabContextMenuItems` 的条目级特例，并在菜单/提示中明确「将删除该网址的全部收藏副本」。
  - 补两条回归：同一 URL 在两个目录时，列表视图/树视图「取消收藏」的删除集合各一条断言。

### F2 [severity: medium] [category: 预存]
- 位置：`adlo/frontend/src/app/features/browser/useBookmarkToFolderDialog.ts:136-196`（pending 分支），关键在 `:177-182`
- 描述：经 `browserPendingBookmark` 投递的「收藏到目录」（复现场景：树/列表里对**没有活标签页**的历史行等右键「收藏」）提交时，先 `browserToggleBookmark` 写入全局索引，然后用 `browserTabs.find(url)?.id || pendingBookmark.tabId` 取 tabId。但 `browserSetPendingBookmark` 的载荷字段是 `bookmarkId`（`browserBookmarkSlice.ts:476-482`），从不携带 `tabId`；`useBookmarkToFolderDialog` 本地类型里的 `tabId` 实际永远为空。因此没有同 URL 活标签时 `if (tabId)` 为假，`addTabToDirectory` 被整体跳过，最终只留下一条**未挂目录/工作区的全局索引项**，却照常 toast「已收藏」。
- 证据：`browserEntrySubEntriesUtils.tsx:168-179` 只投递 `{url,title,bookmarkId}`；`useBookmarkToFolderDialog.ts:55-59` 的本地 `tabId` 无写入点；`browserRemoveOrphanedBookmarks` 在「清除标签目录」安全清扫与目录删除后都会清掉未被目录/工作区引用的索引项（`useBrowserPanelCloseHandlers.ts:47-54`、`useBrowserFolderCrud.ts:198,287,452`），于是这条「已收藏」会随后静默消失。现有用例只覆盖 pending 为空、`activeTab` 存在的分支（`useBookmarkToFolderDialog.test.tsx:78-95`）。
- 建议修复：pending 分支不要依赖活标签：无 tabId 时走 `browserCreateBookmarkEntry({ url, title, folderId/workspaceId })`（该 action 已支持无标签落目录），或把 `tabId` 补进 `browserPendingBookmark` 载荷并区分 `bookmarkId`。补一条「历史行无活标签 → 收藏到目录 → 目标目录出现该条目」的回归。
- 备注：预存问题，非本轮 diff 引入；请主代理决定是否纳入本轮（若顺延需按简报 §7 记录理由）。

### F3 [severity: low] [category: 正确性]
- 位置：`adlo/frontend/src/app/utils/browserDisplayUtils.ts:237-266`（`historyDedupKey` / `isUrlBookmarked`），注释在 `:250-256`
- 描述：收藏身份复用 `historyDedupKey`，该键由 `URL.hostname`（不含协议、端口）+ pathname + 归一化 query 组成，实际会**同时忽略 scheme、端口与 hash**；注释只列了「尾斜杠、www 前缀、跟踪参数与参数顺序」。后果：`http://localhost:3000/app` 与 `https://localhost:5173/app` 会被判为同一收藏——地址栏误亮实心星，点击星标会经 `browserRemoveBookmarksForUrl` 把另一端口应用的书签一并删除（同主机不同端口在本地开发/自建服务场景可达）。
- 证据：`new URL(url).hostname` 语义；`browserDisplayUtils.ts:240-243` 只拼 hostname/path/query；删除动作按同一键匹配（`browserBookmarkSlice.ts:829-838`）。
- 建议修复：两者取一——(a) 收藏身份改用含 `protocol` + `host`（含端口）的键（hash 可继续忽略），并补端口/协议不同的反例用例；(b) 若确认沿用历史口径，把注释补全为「同时忽略协议、端口与 hash」，并在进度/ADR 记明该取舍，避免后续把它当缺陷反复改。

### F4 [severity: low] [category: 文档]
- 位置：`adlo/frontend/src/app/icons/core.tsx:202-208`；`adlo/frontend/src/app/icons/core.test.tsx:87-91`
- 描述：注释称 `IconArrowUpLeft` 是「用于『在中心打开 / 显示 / 全部打开』的统一入口图标」，用例名也称「unified center entry glyph」；但落库后该图标只用于「在「中间区」显示」两个入口（`BrowserOpenTabFlatListItem.tsx:124`、`TerminalContextMenu.tsx:87`），书签目录/书签列表的「打开 / 全部打开」按进度事项 8 是纯文字无图标。注释把设计意图写成了现状。
- 证据：全仓 `IconArrowUpLeft` 引用仅上述两处 call site + index/test。
- 建议修复：注释与用例名改为「用于『在「中间区」显示』（已打开标签页 / 终端标签菜单）」，或若后续确实要给『打开/全部打开』补图标，再把注释恢复为统一入口表述并补 call site。

## 记录不修（一行一条）

- 实心星（Tabler `star-filled`）外接尺寸约 21.3×19.2/24，空心星含描边约 19.6×18.9/24，14px 下实心星约大 1px；用户已选定 D 方案，属视觉取舍，不改。
- `useBrowserTabs.ts:163-172` 的 `handleToggleBookmark` / `handleToggleBookmarkForTab` 全仓无消费方且仍走元组 toggle；预存死代码，若未来接线会重新引入元组语义，建议另立事项删除或改 URL 级。
- `browserRemoveBookmarksForUrl` 未调用 `removeSiteMetaIfUnreferenced`（URL 级取消收藏后站点元数据缓存可能残留到下次清扫）；与既有 toggle 取消路径一致，非本轮回归。
- `BrowserTabBar.tsx:118-127` 的关闭按钮文案修复无回归用例（纯 a11y/tooltip 修正），建议下次动该文件时补一条 render 断言。
- 搜索结果的纯书签行（`BrowserNavSearchMode.tsx:90-104`，`isSavedBookmark: true` 但未设 `bookmarkId`）右键「删除」会以空 id 调 `browserRemoveBookmark` 而无实际效果；预存、属搜索 scope，建议单列事项。
- 切片测试沿用「`as any` 改状态 + 公开 action 断言」的既有写法；断言入口是公开 action，可接受，不单独计为测试缺陷。

## 单测删除性推演（本轮重点）

| 修复 | 删除修复后变红的断言 |
| --- | --- |
| star 只按 URL 判定 | `useBrowserTabs.test.ts:34-56`（标题不同 / 尾斜杠+www）+ `CenterBrowserView.test.tsx:256-284`（ImportedTitle + Remove bookmark 按钮） |
| 地址栏星标按 URL 取消 | `useBookmarkToFolderDialog.test.tsx:97-114` → `toHaveBeenCalledWith('https://x.test')`（旧实现会以对象调 toggle）；`CenterBrowserView.test.tsx` 同向 |
| URL 级删除范围 | `browserBookmarkSlice.test.ts:974-1015`：去掉目录/工作区删除 → `folders[0].entries`、`workspaceBookmarks === {}` 失败；去掉归一化 → 第二条失败 |
| 实心星单轮廓 | `actions.test.tsx:19-30`：恢复旧 evenodd 空心路径 → `M` 计数变 2 / `fillRule` 非空，失败 |
| 箭头几何 | `core.test.tsx:87-98`：两箭头互换或路径改动即失败（不覆盖注释所述「用途」） |

未受回归保护的修复：F1 的书签行 bookmark-toggle 分支、`BrowserTabBar` 文案、F2 的 pending 目录落位。

## 结论

- 需修复项：4（critical 0 / high 0 / medium 2：F1、F2（预存）/ low 2：F3、F4）。
- 核心结论：URL 身份判定与实心星路径已闭合、可被定向用例守住；剩余风险集中在「取消收藏」在不同视图下的删除范围不一致（F1），以及预存的「收藏到目录」无活标签时丢目录关联（F2）。
