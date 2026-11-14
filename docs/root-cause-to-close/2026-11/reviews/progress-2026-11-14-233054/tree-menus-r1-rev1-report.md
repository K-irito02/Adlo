# R1 审查报告 — 书签树菜单/动作接线（rev1）

## 范围

- 快照：`.review-diffs/*-rev1.diff`（base `4484cf75c`，无 commit，工作区全量）。
- 需求真源：`docs/root-cause-to-close/2026-11/progress-2026-11-14-233054.md` 事项 2 / 6 / 8（本 scope 相关项）。
- 审查文件：
  - `adlo/frontend/src/app/features/browser-tree/BrowserCategorySection.tsx`
  - `adlo/frontend/src/app/features/browser-tree/BrowserEntrySubEntries.tsx`
  - `adlo/frontend/src/app/features/browser-tree/BrowserTabTree.tsx`
  - `adlo/frontend/src/app/features/browser-tree/BrowserTreeEntryMenu.tsx`
  - `adlo/frontend/src/app/features/browser-tree/browserEntrySubEntriesUtils.tsx`
  - `adlo/frontend/src/app/features/browser-tree/browserTreeEntryUtils.tsx`
  - `adlo/frontend/src/app/features/browser-tree/__tests__/BrowserBookmarkRowActions.test.tsx`
  - `adlo/frontend/src/app/features/browser/BrowserNavigator.tsx` / `.test.tsx`
  - `adlo/frontend/src/app/features/browser/BrowserNavTabsMode.tsx` / `BrowserNavListMode.tsx` / `BrowserNavSearchMode.tsx`
  - `adlo/frontend/src/app/features/browser/BrowserPanel.tsx` / `BrowserPanelActionsContext.ts`
  - `adlo/frontend/src/app/features/browser/BrowserOpenTabFlatListItem.tsx`
  - `adlo/frontend/src/app/features/browser/useBrowserFolderCrud.ts` / `.test.ts`
  - `adlo/frontend/src/app/features/browser/useBrowserTagActions.ts` / `__tests__/useBrowserTagActions.test.ts`
  - 交叉核对（非本 scope 归属）：`useBrowserTreeData.ts`、`useOpenInCenterAction.ts`、`browserTabsSlice.ts`、`browserBookmarkSlice.ts`、`BrowserTreeEntryFlatList.tsx`、`icons/*`、i18n `common.ts`。
- 未运行测试套件（按简报）；测试有效性用「删掉实现→哪些断言变红」的删除性推演。
- 未修改任何源码/配置。

## 上轮问题关闭情况

本轮为 rev1 首轮，无上轮 R1 报告可逐条核对；以下按进度文件自述逐条核对代码：

1. 事项 2「无活标签书签行有悬停按钮与右键菜单」— **基本关闭，但有一处静默失效**：`isLeafBrowserNodeType()`（tab/history/bookmark）已统一叶子分支（`browserEntrySubEntriesUtils.tsx:14-16`、`BrowserEntrySubEntries.tsx:125`、`:265`、`:346`），more 弹层与右键菜单均生效；`getTabHoverButtons` 由 `onCloseTab && tabId` 控制关闭按钮（`BrowserEntrySubEntries.tsx:127`）。**但**书签行新出现的「刷新网站图标与标题」悬停按钮点击无反应（F1）。
2. 事项 6「新增在中心/全部在中心打开」— **功能已落地，收集口径不完整**：`SectionCallbacks.onOpenInCenter/onOpenAllInCenter`（`BrowserCategorySection.tsx:25-28`）→ `BrowserPanel`（`:483-484`、`:528-529`）→ `useBrowserTreeActions` → `useBrowserTagActions.handleOpenInCenter` / `useBrowserFolderCrud.handleOpenAllInCenter`；tabs/list 两模式均已接线（`BrowserNavigator.tsx:290-293`、`:331-334`），search 模式自行接 `openUrlInCenter`（`BrowserNavSearchMode.tsx:134`）。单条路径正确，批量路径在工作区分支重复 + 遗漏（F2）。
3. 事项 8「图标收敛」— **关闭**：书签目录/列表菜单项无 `icon`（`browserEntrySubEntriesUtils.tsx:88-114`、`:117-162`、`:195-278`、`browserTreeEntryUtils.tsx:177-187`）；「已打开标签页」右键菜单保留左上箭头（`BrowserOpenTabFlatListItem.tsx:122-125`）；`IconArrowUpLeft`/`IconArrowDownRight` 几何与导出正确（`core.tsx:202-216`、`index.ts:31-32`），并有精确 `path d` 回归（`core.test.tsx:86-98`）。残留一项：`IconMoveToCenter` 已无调用方（F6）。
4. 事项 1「列表按钮文案」、事项 3/4/5/7/9 不在本 scope，未核。

## 新增发现

### F1 [severity: high] [category: 正确性] 树模式书签行的悬停「刷新网站图标与标题」按钮点击无反应

- 位置：`adlo/frontend/src/app/features/browser-tree/BrowserEntrySubEntries.tsx:150-154`（配合 `:127`）
- 描述：书签叶子（`nodeType: 'bookmark'`）没有 `tabId`，而悬停 refresh 分支以 `if (childNode.tabId && childNode.url)` 为前置条件，因此本轮**新启用**的书签行刷新按钮是死按钮；同一行的右键菜单「刷新网站图标与标题」却用 `callbacks.onRefreshTab(node.tabId, node.url)`（允许 `tabId === undefined`）能正常工作，列表模式也无条件调用。进度事项 2 的验证只断言「行按钮存在」，未点击验证其效果。
- 证据：
  - 书签叶子无 `tabId`：`useBrowserTreeData.ts:132-145`（folder 书签）、`:229-240`（工作区书签）。
  - 菜单同动作口径允许无 tabId：`browserEntrySubEntriesUtils.tsx:224-232` → `useBrowserTagActions.ts:40-83`（`tabId` 缺失时按 url 找历史/书签快照刷新）。
  - 列表模式无该 guard：`BrowserTreeEntryFlatList.tsx:94-102`。
  - 断言缺口：`BrowserBookmarkRowActions.test.tsx:115-119` 只查 `aria-label="browserContextMore"`；没有用例点击刷新按钮，删掉/加回该 guard 都不会变红。
  - 与本轮新注释冲突：`browserEntrySubEntriesUtils.tsx:9-13` 声称「三者共用同一套行级菜单与悬停动作」，当前刷新动作对书签行是空的。
- 建议修复：refresh 分支改为 `if (childNode.url) callbacks.onRefreshTab(childNode.tabId, childNode.url);`（与右键菜单同口径），并补一条「点击无活标签书签行的刷新按钮 → `onRefreshTab(undefined, url)` 被调用」的用例；同时把注释降级为「共用同一套行级菜单/按钮集合」或改后保持准确。

### F2 [severity: medium] [category: 正确性] 工作区「全部在中心打开」的 URL 收集与树不一致：同一标签重复打开，工作区文件夹内书签被漏掉

- 位置：`adlo/frontend/src/app/features/browser/useBrowserFolderCrud.ts:301-311`（workspace 分支）、`:362-370`（`handleOpenAllInCenter`）
- 描述：`collectNodeOpenTargets` 的 workspace 分支把「工作区活标签」与「工作区书签快照」都塞进列表，且不过滤已位于中心的标签；同时完全不遍历 `parentType === 'workspace'` 的目录树，目录里的书签不会被打开。而树在渲染时对「活标签 + 其书签快照」已去重（`useBrowserTreeData.ts:207-213`），同一工作区的删除路径也会递归根目录（`useBrowserFolderCrud.ts:78-132`）。新菜单的文档注释写明「目录/工作区/历史分组下的**全部** URL」（`BrowserCategorySection.tsx:27-28`、`useBrowserFolderCrud.ts:296`），与实现不符。
- 证据 / 复现：
  1. 工作区 W 有活标签 T(url U) 且用户把 T 收藏到 W（书签条目 `sourceTabId = T.id`）→ 树里只显示 1 行（`useBrowserTreeData.ts:207-213` 过滤了书签行），右键 W →「全部在中心打开」→ `targets` 里 U 出现两次（`:303-311`），新建 2 个同 URL 中心标签。
  2. 工作区 W 下建子目录 F 并收藏若干书签 → 右键 W →「全部在中心打开」→ F 内书签一条都不打开（`:301-311` 未走目录），与右键 F 自身「全部在中心打开」结果不同。
  3. 同一问题也被 `handleOpenAllInNewTabs` 继承（旧实现在收集阶段直接调 `browserOpenTab`，行为未变），但新菜单把「全部」语义摆到了用户面前。
  4. 用例只覆盖嵌套目录：`useBrowserFolderCrud.test.ts:43-51`（f1 + 子目录 f2，无工作区/历史日用例），删掉桌面/工作区分支不会变红。
- 建议修复：workspace 分支改为「tabs（可保留含中心标签或显式说明）+ 工作区根目录及其子目录 entries」，最终以 `historyDedupKey(url)` 去重；补 workspace（含活标签 + 同 URL 书签快照）与 `history:day` 两条用例；若确定不展开工作区目录，需把注释里的「全部 URL / 目录/工作区…全部」降级并同步进度文件。

### F3 [severity: medium] [category: 正确性] 列表模式右键菜单是树菜单的整份复制并已漂移：书签行「取消收藏」会删掉该 URL 的全部收藏

- 位置：`adlo/frontend/src/app/features/browser-tree/BrowserTreeEntryMenu.tsx:357-373`（列表内联菜单）对照 `browserEntrySubEntriesUtils.tsx:252-261`（树/搜索共用菜单）
- 描述：树/搜索在 `isSavedBookmark && bookmarkId` 时只移除当前条目（本轮新增分支）；列表模式仍直接调 `handleBookmarkToggle(...)`，命中「URL 已收藏」后走 `browserRemoveBookmarksForUrl`，删除**所有**同 URL 条目（其它目录、工作区、全局索引）。同一个书签行在「书签目录」和「书签列表」里点同一个「取消收藏」，结果不同。根因是列表模式内联复制了 `getTabContextMenuItems` 的 9 项菜单（`BrowserTreeEntryMenu.tsx:265-393`），本轮新增的「打开」和 `isSavedBookmark` 分支只落到其中一处。
- 证据：
  - 树/搜索：`browserEntrySubEntriesUtils.tsx:254-259`（`onRemoveBookmarkTab(node.bookmarkId, url)` 后 `return`）。
  - 列表：`BrowserTreeEntryMenu.tsx:365-372` 无该分支 → `browserEntrySubEntriesUtils.tsx:168-179` → `browserBookmarkSlice.ts:824-870`（按 URL 清全部）。
  - 无列表模式菜单用例：`grep centerTabOpenInCenter|centerTabShowInCenter` 仅命中断言树模式的 `BrowserBookmarkRowActions.test.tsx:137,145`。
- 建议修复：列表模式菜单改为调用 `getTabContextMenuItems(node, callbacks, t, isUrlBookmarked(bookmarks, node.url))`（同时删掉内联 9 项），或在 `:365` 前补 `if (node.isSavedBookmark && node.bookmarkId) { callbacks.onRemoveBookmarkTab?.(node.bookmarkId, node.url); ... }`；补「列表模式取消收藏只移除该条目」用例。

### F4 [severity: low] [category: 文档] 注释「关闭按钮只对确有活标签页的行有意义」与 `tabId` 语义不符（historical 叶子也带 tabId）

- 位置：`adlo/frontend/src/app/features/browser-tree/BrowserEntrySubEntries.tsx:126`
- 描述：注释把 `!!childNode.tabId` 当作「确有活标签页」的判据，但历史叶子把历史条目 id 写进 `tabId`（`useBrowserTreeData.ts:102`）。因此一旦有消费方接入 `onCloseTab`（当前 `BrowserNavTabsMode`/`BrowserNavListMode` 都未传），历史行会渲染一个点击无反应的关闭按钮（`useBrowserTabs.ts:109-119` 的 `browserCloseTab` 找不到该 id）。注释是绝对断言式表述（「只对…有意义」），代码并不能证明它。
- 证据：`useBrowserTreeData.ts:92-108`（`nodeType: 'history'` + `tabId: entry.id`）；`BrowserEntrySubEntries.tsx:127`。
- 建议修复：判据改为 `childNode.nodeType === 'tab'`（真活标签；含「有活标签的书签行」），或把注释改成「纯书签行没有 tabId，故不显示关闭按钮」。

### F5 [severity: low] [category: 正确性] 「历史行不得出现『显示』」缺少回归测试，列表模式新增项也未被覆盖

- 位置：`adlo/frontend/src/app/features/browser-tree/BrowserTreeEntryMenu.tsx:306-318`
- 描述：本轮把「显示」收敛为仅 `nodeType === 'tab'` 的行（事项 8 明确要求历史行不得出现），但没有任何用例锁定；把 gate 改回「有 url 就显示」现有测试仍全绿。同理列表模式新增的「在「中间区」打开」也无用例。
- 证据（删除性推演）：`BrowserBookmarkRowActions.test.tsx` 只覆盖树模式叶子菜单与目录菜单；`grep show-in-center` 在测试中零命中。
- 建议修复：在 `BrowserBookmarkRowActions.test.tsx`（或新列表模式用例）中，右键历史行断言 `queryByText('centerTabShowInCenter') === null` 且存在 `centerTabOpenInCenter`；再补一条列表模式 `open-center` 动作断言。

### F6 [severity: low] [category: 死代码] `IconMoveToCenter` 收敛后已无调用方

- 位置：`adlo/frontend/src/app/icons/actions.tsx:273`、`adlo/frontend/src/app/icons/index.ts:103`
- 描述：本轮把两处使用换成新箭头（`BrowserOpenTabFlatListItem.tsx:124`、`CenterTabStrip.tsx:645`），`IconMoveToCenter` 只剩定义 + re-export，成为无消费方的图标（未发布阶段不留无调用方导出）。
- 证据：全仓 `grep IconMoveToCenter` 仅命中 `actions.tsx:273` 与 `index.ts:103`。
- 建议修复：删除该图标定义与导出（若担心后续复用，应在 ADR/注释中记录保留理由，否则默认删除）。

## 记录不修

- （可选回调）`SectionCallbacks.onOpenInCenter/onOpenAllInCenter` 仍为可选且用 `?.` 调用（`browserEntrySubEntriesUtils.tsx:98`、`:133`、`:219`、`browserTreeEntryUtils.tsx:186`），菜单项却无条件渲染：现有 3 个提供方都已接线（tabs/list 全接、search 只用单条动作，未渲染目录菜单），**当前无静默失效**；建议改必填补类型漏洞，属可选优化。
- （提前抽象）`icon?: React.ReactNode` 已加进 4 处菜单项类型并加了 `.adl-sidebar-menu__icon` 渲染，但无任何生产者；`BrowserEntrySubEntries.tsx:281-288` 的 map 还会丢掉 `icon`。进度事项 8 说「供已打开标签页等有图标菜单使用」，实际「已打开标签页」走独立的 `ContextMenu` items（`BrowserOpenTabFlatListItem.tsx:117-130`），并不经过这些菜单组件。
- （范围取舍）`collectNodeOpenTargets` 只支持 `history:day`，因此历史年/月节点没有「全部在中心打开」（删/改会静默无操作，本轮不加是正确取舍）；但接口注释「目录/工作区/历史分组下的全部 URL」需与之一致（见 F2）。
- （设计取舍）一次「全部在中心打开」为每条 URL 新建标签，`browserOpenTab` 还会写一条历史（`browserTabsSlice.ts:128-131`）：311 条导入书签的目录一次点击 = 311 个中心标签 + 311 条历史，无上限/确认；已按用户要求实现，建议后续评估。
- （预存）搜索模式纯书签行的「删除」静默无操作：搜索节点未设置 `bookmarkId`（`BrowserNavSearchMode.tsx:90-104`），`getTabContextMenuItems` 走 `onRemoveBookmarkTab(node.bookmarkId ?? '', url)`，`browserRemoveBookmark('' , url)` 匹配不到任何条目（`browserBookmarkSlice.ts:801-807`）。非本轮引入。
- （预存）`onCloseTab` 在 tabs/list 两模式都未接线（`BrowserNavTabsMode.tsx:86-106`、`BrowserNavListMode.tsx:51-71`），因此 hover 关闭按钮实际永不渲染；F4 的 guard 只在该回调接入后才有意义。

## 测试有效性小结（删除性推演）

| 实现点 | 删掉后变红的用例 |
| --- | --- |
| `isLeafBrowserNodeType` 含 `bookmark`（`browserEntrySubEntriesUtils.tsx:16`） | `BrowserBookmarkRowActions.test.tsx:115-137`（悬停 more / 右键菜单 / more 弹层） |
| `getTabContextMenuItems` 的 `open-center` 项 | `BrowserBookmarkRowActions.test.tsx:139-145` |
| `getEntryMoreMenuItems`/`getChildNodeMoreMenuItems` 的 `open-all-center` 项 | `BrowserBookmarkRowActions.test.tsx:147-153` |
| `handleOpenAllInCenter`（含嵌套目录递归） | `useBrowserFolderCrud.test.ts:43-51` |
| `handleOpenInCenter` | `useBrowserTagActions.test.ts:29-34` |
| 悬停 refresh 对书签行可用（F1） | 无（现状为空实现，用例不存在） |
| 列表模式「显示」仅限活标签行 / 列表 `open-center`（F5） | 无 |
| 工作区批量收集去重与目录包含（F2） | 无（仅嵌套目录用例，且目录用例走的是 folder 分支） |

另：`BrowserBookmarkRowActions.test.tsx:155-164`（菜单删除走 `onRemoveBookmarkTab`）在本轮之前的实现下也已通过（`isSavedBookmark → onRemoveBookmarkTab` 分支未改），属行为钉桩而非本轮回归保护，记录备查。

## 结论

- 需修复项：6（critical 0 / high 1 / medium 2 / low 3）。
- 另记录不修 6 条（可选回调、提前抽象的 icon 管道、历史年/月范围、批量打开规模、搜索模式预存删除空转、`onCloseTab` 未接线预存）。
