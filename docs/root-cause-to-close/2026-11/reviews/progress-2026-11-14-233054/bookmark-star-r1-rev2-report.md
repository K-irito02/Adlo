# R1 rev2 审查报告 — 收藏身份 / 实心星 / 图标

## 范围

- 快照：`.review-diffs/manifest-rev2.md`（base `4484cf75c`，58 文件）；逐文件核对 rev2 全量 diff。
- 逐文件：`browserDisplayUtils.ts`、`browserBookmarkSlice.ts`、`browserBookmarkSlice.test.ts`、`useBrowserTabs.ts`、`useBrowserTabs.test.ts`、`useBookmarkToFolderDialog.ts`、`useBookmarkToFolderDialog.test.tsx`、`CenterBrowserView.tsx`、`CenterBrowserView.test.tsx`、`BrowserTabBar.tsx`、`icons/actions.tsx`、`icons/actions.test.tsx`、`icons/core.tsx`、`icons/core.test.tsx`、`icons/index.ts`。
- 交叉核对（同轮其它 scope，仅作证据）：`browserEntrySubEntriesUtils.tsx`、`BrowserTreeEntryMenu.tsx`、`BrowserTreeEntryMenu.list.test.tsx`、`BrowserNavSearchMode.tsx`、`browserUrlUtils.ts`、`browserTabsSlice.ts`、`useBrowserTreeData.ts`、`useBrowserFolderCrud.ts`、`BrowserNavListMode.tsx`、`BrowserNavTabsMode.tsx`、`useBrowserDialogs.ts`、`useBrowserTagActions.ts`、`bookmarkTransferSlice.ts`。
- 未跑测试；测试有效性按「删掉修复后哪条断言变红」做删除性推演（见末节）。
- **快照/工作区差异（流程提示）**：`BrowserTreeEntryMenu.tsx`（4:18:55）与其列表用例（4:19:32）在 rev2 快照（4:11）之后又改过——工作区已把「在中心显示」插到危险项「删除」之前并补顺序断言；本报告以工作区源码为准，不再把该顺序列为问题。若最终以 rev2 快照归档，需重新生成快照。

## 上轮问题关闭情况

1. **F1 medium「列表/树取消收藏范围不一致」— 已关闭（列表/树范围内）。**
   - 列表菜单改走共享 `getTabContextMenuItems`（`BrowserTreeEntryMenu.tsx:207-229`，当前工作区含「显示」插到删除前的整理；rev2 快照为数组尾部追加）。
   - 书签行文案/动作使用同一条件 `node.isSavedBookmark && node.bookmarkId`（`browserEntrySubEntriesUtils.tsx:251-268`）：文案恒为「取消收藏」，动作只调 `onRemoveBookmarkTab(bookmarkId, url)`，不再走 URL 级清理；反向语义（label=收藏、点击=删除）随同关闭。
   - 回归：`BrowserTreeEntryMenu.list.test.tsx:115-124` 从列表模式 `BrowserTreeEntry` 进入，点击后断言回调收到 `('saved-1', url)`；删除该分支（回到旧的 URL 级 `handleBookmarkToggle`）→ 回调不被调用，用例变红。该用例的 store 未收藏该 URL，因此同时守住「书签行文案恒为取消收藏」。
   - 残留：**搜索模式的书签行没有 `bookmarkId`，仍落在 URL 级分支**，且搜索模式仍用历史键定位条目——见 F1-rev2。

2. **F2 medium「pending 无活标签时丢目录关联」— 已关闭。**
   - `useBookmarkToFolderDialog.ts:188-210`：无 `tabId` 时改走 `browserCreateBookmarkEntry({url,title,folderId|workspaceId})`，不再只写全局索引；失败路径有关闭对话框 + warning，但不会误报成功。
   - 回归：`useBookmarkToFolderDialog.test.tsx:120-144` 以 pending 投递进入、断言 create 收到 `{url,title,folderId:'f1'}`；删除 else 分支后该断言失败。
   - 记录：先 `browserToggleBookmark` 再 create 是两次写（create 自身也会补全局索引）；create 失败时会留下 toggle 写出的索引项。预检在同容器同标题上已先跑，实际很难触发，见「记录不修」。

3. **F3 low「收藏键忽略协议/端口」— 已关闭。**
   - `bookmarkUrlKey`（`browserDisplayUtils.ts:268-286`）使用 `protocol + u.host`（含端口）+ 归一化 path/query，忽略 hash；`isUrlBookmarked` 与 `browserRemoveBookmarksForUrl` 均改用该键（`browserDisplayUtils.ts:257-266`、`browserBookmarkSlice.ts:829-838`）。
   - 反例用例：`browserBookmarkSlice.test.ts:1008-1023`（`http://localhost:3000/app` 不被 `https://localhost:5173/app` 删除）、`useBrowserTabs.test.ts:52-61`（不互相点亮星标）；删除修复后均变红。
   - 注释同步：`isUrlBookmarked` 与 `bookmarkUrlKey` 的注释都明确「保留协议/端口、忽略尾斜杠/www/跟踪参数」。
   - 残留：新键只接入星标/URL 级删除/批量打开去重；其余仍在比较**书签条目**的路径仍用 `historyDedupKey`——见 F1-rev2。

4. **F4 low「IconArrowUpLeft 注释夸大用途」— 已关闭。**
   - `core.tsx:202-208` 改为「当前用于「在中心显示」（已打开标签页 / 终端标签菜单）」；全仓 call site 核对仅 `BrowserOpenTabFlatListItem.tsx:124`（已打开标签页）与 `TerminalContextMenu.tsx:87`（终端标签菜单），与注释一致。
   - `core.test.tsx:87-91` 用例名同步为 `show-in-center glyph`；`IconArrowDownRight` 仍只用于 `CenterTabStrip.tsx:645` 的「在右侧面板显示」，注释准确。
   - 实心星本轮未改动；rev1 的结论（单轮廓、无 fillRule、fill=currentColor、MIT 注明、与空心星不共享路径）继续成立。

## 新增发现

### F1 [severity: medium] [category: 正确性]
- 位置（新 `bookmarkUrlKey` 未覆盖的「书签条目 ↔ URL/标签」匹配）：
  - `adlo/frontend/src/app/features/browser/BrowserNavSearchMode.tsx:69-89`：`snapshotTabIdByUrl` 以 `historyDedupKey` 为键；`openTab`/`historyEntry` 也用历史键匹配。
  - `adlo/frontend/src/app/features/browser/BrowserNavSearchMode.tsx:90-104`：纯书签行只写 `tabId = snapshotTabId`，**不写 `bookmarkId`**。
  - `adlo/frontend/src/app/features/browser/BrowserNavSearchMode.tsx:149-185`：菜单直接用 `getTabContextMenuItems`，`edit/delete` 以 `node.tabId` 放行。
  - `adlo/frontend/src/app/features/browser/browserUrlUtils.ts:228-245`：搜索「全部」合并键 `url:${historyDedupKey}`。
  - `adlo/frontend/src/app/stores/slices/browserTabsSlice.ts:80-110`：`browserOpenTab(..., folderId)` 的「同 URL 同标题已有条目则不重复建条目」用历史键。
  - `adlo/frontend/src/app/features/browser-tree/useBrowserTreeData.ts:164,246`：书签条目与活标签的音量状态匹配用历史键（仅图标）。
- 描述：本轮把「书签身份」拆成 `bookmarkUrlKey`（保留协议/端口），但只接入了星标、URL 级取消收藏和批量打开去重。**凡是要把某个搜索行/新标签锚到「具体书签条目」的地方仍用 `historyDedupKey`**，而后者对 `http://host:3000/app` 与 `https://host:5173/app` 得到同一个键（`hostname` 不含协议/端口）。因此跨端口/协议时：
  1. 搜索面板「书签」范围内两个条目的 `snapshotTabIdByUrl` 只保留先遇到的那一个 id；另一条搜索行的 `tabId` 指向**另一个端口的书签条目**。该行右键「编辑」→ `onEditTab` 拿到错误条目 id → `browserUpdateSavedBookmark` 按 id 改写该条目 URL（`useBrowserDialogs.ts:278-293`），等于把另一个端口的书签改成当前行 URL；「删除」仍以空 `bookmarkId` 调 `onRemoveBookmarkTab`，继续空转（P4 已记录）。
  2. 同一搜索行还可能被历史键锚到另一端口的**活标签**（`openTab` 先于书签命中）：`node.isSavedBookmark=false`，菜单「删除」走 `onDeleteTab(错误 tabId, 当前 URL)`，关闭另一端口标签；「刷新/编辑」也会把标题/元数据写到错误标签。搜索行本应只能操作当前 URL 对应的那一条目/标签。
  3. 「保存并打开」通过 `browserOpenTab(url, ..., folderId)` 落目录时，跨端口同标题的已有条目会使新条目被历史键判成重复而**不写入目录**，用户只看到新标签打开、目录里没有这本书签。
  4. 树行音量图标可能取自另一端口标签（仅视觉）。
- 证据：`historyDedupKey` 只拼 `hostname`（`browserDisplayUtils.ts:237-247`）；上述四处均在书签条目参与的比较中使用它；`getTabContextMenuItems` 的书签行条目级分支要求 `node.isSavedBookmark && node.bookmarkId`（`browserEntrySubEntriesUtils.tsx:261-266`），搜索节点不满足，故回落到 URL 级 `handleBookmarkToggle`。现有 port 反例只覆盖星标与 URL 级删除（`useBrowserTabs.test.ts:52-61`、`browserBookmarkSlice.test.ts:1008-1023`），未覆盖搜索/新标签落目录。
- 建议修复：把「书签条目参与的身份匹配」统一到 `bookmarkUrlKey`（至少 `snapshotTabIdByUrl` + 纯书签行 `bookmarkId = snapshotEntryId` + `browserOpenTab` 的 folder 去重）；搜索行的 `openTab`/`historyEntry` 归属也建议改用严格键（`bookmarkUrlKey` 仍归一化尾斜杠/www/跟踪参数，只把协议/端口纳入身份），避免关错标签。注意同一严格键可能仍对应多个目录的条目（GLOSSARY：同一链接可收藏进两个目录成两条条目），搜索行无法唯一锚定条目时应优先复用 `bookmarkId`/条目级入口，或对无法唯一锚定的行隐藏「编辑/删除」，不要把 `tabId` 当归宿。补一条「同 host/path、不同端口的两条书签 → 搜索各自编辑/取消收藏只命中自己；保存并打开在目标目录各建一条」的用例。`browserUrlUtils` 的「全部」合并键是否改用严格键需产品确认（会同时改变历史/标签的合并范围）。
- 备注：**预存路径，非 rev2 新引入**；但本轮已把收藏身份定义为「协议+端口」并明确要求检查分工/跨端口，这条是分工未闭合的实际后果。若主代理决定顺延，请按简报 §7 记录理由。

### F2 [severity: low] [category: 文档]
- 位置：
  - `docs/knowledge-base/browser/bookmark/browser-bookmark-tuple-dedup-and-title-isolation-2026-08-15.md:37`：仍写「UI 层 isBookmarked 若按 URL-only 会出现『取消收藏反而新增书签』，二者必须同时迁移」——当前设计正是 UI URL-only + 独立 URL 级取消动作，toggle 元组语义保留；该条已成为会误导后续修复的旧规则。
  - `docs/knowledge-base/browser/bookmark/browser-bookmark-dialog-and-flat-view-2026-06-15.md:107`：仍写「已收藏 → 直接调用 `browserToggleBookmark()` 取消收藏」；实际已改为 `browserRemoveBookmarksForUrl`。同文件 `:183-185` 仍描述 toggle 取消时同步清 `browserTabFolders`（旧键）。
  - `docs/knowledge-base/browser/webview-embed/divider-strip-dual-host-2026-10-02.md:21`：仍写「已收藏分支的取消收藏必须显式传本宿主活动标签的 `(url,title)`」；本轮恰好反向——URL 级动作，不再传元组。
  - `docs/root-cause-to-close/2026-11/progress-2026-11-14-233054.md:90`（事项 3 修复 bullet）：「地址栏实心星与树菜单『取消收藏』走 URL 级动作」已被 P4 的条目级决定取代，建议在该行补「P4 修订」指向。
- 描述：本轮取代了「取消收藏 = 调 toggle 传 (url,title)」的旧流程，但知识库/进度里的旧流程描述未回扫；P4 的 P5 待办只列了 `docs/operations/ui-manual/`，不覆盖这几篇。后续按旧文案修改代码会直接复现「再插一条 / 误删另一宿主」的问题（正是 `divider-strip-dual-host` 那篇记录过的坑）。
- 建议修复：给三篇知识库加「2026-11-15 修订」段落（UI 收藏态=URL 身份键 `bookmarkUrlKey`；取消收藏=星标走 `browserRemoveBookmarksForUrl`，书签行=条目级 `browserRemoveBookmark`；`browserToggleBookmark` 的取消分支不再是 UI 入口），并在进度事项 3 的 bullet 补一句指向 P4。

## 记录不修

- 快照落后：rev2 快照生成后 `BrowserTreeEntryMenu.tsx` 与其列表用例又改过（已把「显示」插到「删除」前并补断言）；归档/下一轮复审前应重新生成快照，避免报告引用与最终代码漂移。
- 书签行菜单现在同时有「取消收藏」与「删除」，两者对书签行都调 `onRemoveBookmarkTab(bookmarkId,url)`（`browserEntrySubEntriesUtils.tsx:251-282`）；功能不冲突但语义重复，建议后续只保留一项或把条目级项改名「删除书签」。
- 列表模式活标签行同时出现「在中心打开」（共享项）与「在中心显示」（`nodeType==='tab'` 追加，`BrowserTreeEntryMenu.tsx:207-229`），树模式活标签行只有「打开」；属菜单外观差异，不影响动作正确性。
- `bookmarkUrlKey` 无直接单测；两组端口反例都同时改了协议+端口——若实现退化为「保留端口、忽略协议」，两条用例仍会通过。建议补 `http://localhost:5173/app` vs `https://localhost:5173/app` 的隔离用例，并补一条 hash/跟踪参数归一化断言（`bookmarkUrlKey` 注释声明忽略二者）。
- `handleBookmarkToggle` 的 `bookmarkId` 形参在 rev2 后已无生产者（书签行提前 return），`browserPendingBookmark.bookmarkId`（`browserBookmarkSlice.ts:443,480`）随之成为只读字段；`onBookmarkTab`/`handleBookmarkFromUrl` 仍无消费方（死链路），可一并清理。
- F2 的 pending 分支先 toggle 再 create：create 失败会留下 toggle 写出的索引孤儿；当前预检使失败几乎不可达，若要简化可只保留 create。
- `useBrowserTabs.ts:163-172` 的 `handleToggleBookmark`/`handleToggleBookmarkForTab` 仍无消费方且走元组 toggle（rev1 记录，未处理）。
- `BrowserTabBar.tsx:118-127` 关闭按钮文案修复仍无用例（rev1 记录，未处理）。
- 列表模式回调接线（`BrowserNavListMode` → `onRemoveBookmarkTab`）无独立用例：`BrowserTreeEntryMenu.list.test.tsx` 从 `BrowserTreeEntry` 进入，绕过该层；若 `Omit` 回归，取消收藏会静默无效。建议补一条 `BrowserNavigator` list 模式用例（或断言 callbacks 透传）。
- 批量打开去重改用 `bookmarkUrlKey` 后，同站点 http/https 两个条目会各开一个标签（`useBrowserFolderCrud.ts:364-376`）；这是保留协议/端口的自然结果，需与用户确认是否接受。
- 星标对「http 书签、https 页面」现在显示空心（协议保留的策略结果）；用户已选定该口径，不改。
- `<IconBookmarkStarFilled>` 外接尺寸略大于空心星（约 1px @14），用户已选定 D 方案，不改。

## 单测删除性推演（本轮重点）

| 修复 | 删除修复后变红的断言 |
| --- | --- |
| 列表/树书签行取消收藏=条目级 | `BrowserTreeEntryMenu.list.test.tsx:115-124`：菜单点击后 `onRemoveBookmarkTab('saved-1', url)`；回到 URL 级 `handleBookmarkToggle` 则回调不被调用 |
| 书签行文案恒「取消收藏」 | 同上用例的 store 未收藏该 URL，`getByText`/`includes('browserUnbookmark')` 在文案回落到 `browserBookmark` 时失败 |
| pending 无活标签落目录 | `useBookmarkToFolderDialog.test.tsx:120-144`：删除 create else 分支后 `createSpy` 不被调用 |
| 收藏键保留端口/协议（删除） | `browserBookmarkSlice.test.ts:1008-1023`：回退到历史键会连 `http://localhost:3000/app` 一起删，断言残留项失败 |
| 收藏键保留端口/协议（星标） | `useBrowserTabs.test.ts:52-61`：回退到历史键会 `isBookmarked=true`，期望 false 失败 |
| 星标只按 URL | `useBrowserTabs.test.ts:28-49` + `CenterBrowserView.test.tsx:258-285` |
| 地址栏按 URL 取消 | `useBookmarkToFolderDialog.test.tsx:101-118` 的 `toHaveBeenCalledWith('https://x.test')` |
| 实心星单轮廓 | `actions.test.tsx:13-24`（rev2 未改动，继续有效） |
| 箭头几何/用途 | `core.test.tsx:87-98`（几何）+ `core.tsx` 注释已按真实 call site 修正 |

未受回归保护：F1-rev2 的搜索/落目录跨端口路径（无既有用例）；协议维度未隔离（见「记录不修」）；列表模式回调接线。

## 结论

- 需修复项：2（critical 0 / high 0 / medium 1：F1-rev2（预存路径，分工未闭合）/ low 1：F2-rev2（文档旧流程未回扫））。
- 上轮四项（F1–F4）在声明范围内均已关闭，且都有可失败的回归断言或等价证据；实心星/箭头图标本轮无新增问题。
- 最大剩余风险：`bookmarkUrlKey` 的分工只完成「星标 + URL 级删除 + 批量打开」，搜索归属与新标签落目录仍按历史键比较书签条目，跨端口时可能编辑错条目、关闭错标签或漏建目录条目；以及三篇知识库仍指导旧的 toggle 取消流程。
