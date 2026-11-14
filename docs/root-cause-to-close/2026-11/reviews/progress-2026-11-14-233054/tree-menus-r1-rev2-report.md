# R1 审查报告 — 书签树菜单/动作接线（rev2 复审）

## 范围

- 快照：`.review-diffs/*-rev2.diff`（base `4484cf75c`，无 commit，工作区全量 58 文件）。
- 需求真源：进度文件事项 2 / 6 / 8 + P4 审查记录（`docs/root-cause-to-close/2026-11/progress-2026-11-14-233054.md:197-219`）。
- 复审对象：`.review-diffs/tree-menus-r1-rev1-report.md` 的 F1–F6 与本轮修复 diff。
- 本 scope 文件（rev2 快照）：`BrowserCategorySection.tsx`、`BrowserEntrySubEntries.tsx`、`BrowserTabTree.tsx`、`BrowserTreeEntryMenu.tsx`、`browserEntrySubEntriesUtils.tsx`、`browserTreeEntryUtils.tsx`、`__tests__/BrowserBookmarkRowActions.test.tsx`、`__tests__/BrowserTreeEntryMenu.list.test.tsx`、`BrowserNavigator.tsx` / `.test.tsx`、`BrowserNavTabsMode.tsx` / `BrowserNavListMode.tsx` / `BrowserNavSearchMode.tsx`、`BrowserPanel.tsx`、`BrowserPanelActionsContext.ts`、`BrowserOpenTabFlatListItem.tsx`、`useBrowserFolderCrud.ts` / `.test.ts`、`useBrowserTagActions.ts` / `__tests__/useBrowserTagActions.test.ts`、`icons/actions.tsx` + `index.ts`。
- 交叉核对（非本 scope 归属）：`useBrowserTreeData.ts`、`browserTypes.ts`、`browserBookmarkSlice.ts` + 其测试、`browserDisplayUtils.ts`（`bookmarkUrlKey`）、`BrowserTreeEntryFlatList.tsx`、`useBrowserTabs.ts`、`useOpenInCenterAction.ts`。
- 未运行测试套件（按简报）；测试有效性用「删掉实现 → 哪些断言变红」的删除性推演。
- 未执行任何 git 命令，未改动源码/配置。

## 上轮问题关闭情况

### F1 [high] 树模式书签行悬停刷新按钮被 tabId 守卫拦住 → **已关闭**

- 代码：`BrowserEntrySubEntries.tsx:153-158` 改为「有 url 即调用」——`if (childNode.url) callbacks.onRefreshTab(childNode.tabId, childNode.url)`，与右键菜单（`browserEntrySubEntriesUtils.tsx:227-231`）同口径；`:154` 新增注释说明书签行无 tabId。
- 测试：`BrowserBookmarkRowActions.test.tsx:129-134`「书签行悬停「刷新」按钮按 URL 刷新（无 tabId 也能生效）」，断言 `onRefreshTab(undefined, 'https://xmrth.fun/user/shop')`。
- 删除性推演：把 `if (childNode.url)` 换回 `if (childNode.tabId && childNode.url)`，该用例立即变红（无调用 → `toHaveBeenCalledWith` 失败）。**回归保护有效。**
- 附带：`browserEntrySubEntriesUtils.tsx:11-15` 原「三者共用同一套…悬停动作」的注释现在成立。

### F2 [medium] 工作区批量打开重复 + 漏目录 → **已关闭（核心），保留 1 条语义取舍**

- 代码：`useBrowserFolderCrud.ts:313-327` 新增工作区根目录（含嵌套，子目录过滤 `parentType` 与 `buildFolderNode` 一致）递归收集；`:364-376` 以 `bookmarkUrlKey` 对全部 target 去重（活标签/根书签/目录书签/目录内嵌套/历史日统一走这条出口）。
- 测试：`useBrowserFolderCrud.test.ts:53-96` 工作区用例（活标签 `https://dup.test/page` + 同 URL 工作区书签快照 + 根书签 + 根目录书签 → 恰好 3 个中心标签）；`:98-119` 历史日用例（3 条含 1 条重复 URL → 2 个中心标签）。
- 删除性推演：去掉去重 → 工作区用例 `centerTabs` 变 4 且 `toEqual` 失败；去掉根目录递归 → 缺 `https://child.test/` 失败；去掉历史分支 → 历史用例 0 失败。**回归保护有效。**
- 文档：`BrowserCategorySection.tsx:27-28` 注释已改为「目录（含嵌套）/工作区（含根目录）/历史日」，与实现一致。
- 残留（判为语义取舍，见「记录不修」）：已在中心的标签点「全部打开」仍会再建一份新标签（"打开"=新建，去重只在本次收集集合内）。

### F3 [medium] 列表菜单复制漂移（取消收藏范围与树不一致）→ **已关闭**

- 代码：`BrowserTreeEntryMenu.tsx:266-286` 删除 9 项内联菜单，改为 `getTabContextMenuItems(contextMenuForTab.node, callbacks, t, isUrlBookmarked(...))`，仅在末尾按 `nodeType === 'tab'` 追加「显示」。列表模式因此继承条目级分支：`browserEntrySubEntriesUtils.tsx:251-268`（`isSavedBookmark && bookmarkId → onRemoveBookmarkTab(bookmarkId, url)`，文案恒为「取消收藏」）。
- 测试：`BrowserTreeEntryMenu.list.test.tsx:121-130`「已保存书签『取消收藏』只移除当前条目，不按 URL 清理全部副本」，断言 `onRemoveBookmarkTab('saved-1', 'https://saved.example/')`。
- 删除性推演：还原成旧内联实现，该用例在 `find` 阶段找不到 `browserUnbookmark` 项（旧实现走 tuple 判定 + `handleBookmarkToggle`）→ `fireEvent.click(undefined)` 抛错变红。**回归保护有效。**
- 列表/树一致性复核：两者现在是同一实现，差异只剩「显示」一项（列表且有活标签时存在，按事项 8 设计）。列表模式回调全链路可用：`BrowserNavListMode.tsx:51-71` 传 `onRemoveBookmarkTab`/`onOpenInCenter`/`onOpenAllInCenter` → `BrowserNavigator.tsx:331-334`。

### F4 [low] 关闭按钮判据/注释与 tabId 语义不符 → **已关闭**

- 代码：`BrowserEntrySubEntries.tsx:126-130` 判据改为 `!!callbacks.onCloseTab && childNode.nodeType === 'tab' && !!childNode.tabId`，注释同步为「历史行也带 tabId，但那是历史条目 id」。
- 复核：`useBrowserTreeData.ts:92-108` 历史叶子 `nodeType:'history'` + `tabId=entry.id`，现在不会再命中关闭按钮；`nodeType:'tab'` 覆盖真标签与「有活标签的书签行」，语义正确。当前两模式都未接 `onCloseTab`（预存），判据只在未来接线时生效。

### F5 [low] 历史行「显示」与列表 `open-center` 无用例 → **已关闭**

- 测试：`BrowserTreeEntryMenu.list.test.tsx:132-142`：活标签行同时含 `centerTabShowInCenter` / `centerTabOpenInCenter`；历史行含 `centerTabOpenInCenter` 且**不含** `centerTabShowInCenter`。
- 删除性推演：把 `nodeType === 'tab'` 的 gate 改成恒追加 → 历史行断言 `not.toContain` 变红；删掉列表 `open-center`（共享实现）→ 两处 `toContain('centerTabOpenInCenter')` 变红。**回归保护有效。**
- 小缺口：列表用例只断言「显示/打开」文案存在，未点击 `open-center` 断言回调；动作本身与树共用同一实现且树用例已断言回调，风险低（记录不修）。

### F6 [low] `IconMoveToCenter` 死代码 → **已关闭**

- 代码：`icons/actions.tsx` 定义删除（rev2 diff `:264-264` 段），`icons/index.ts:100-103` re-export 删除；`BrowserOpenTabFlatListItem.tsx:9,124`、`CenterTabStrip.tsx` 已改用 `IconArrowUpLeft` / `IconArrowDownRight`。
- 全仓 `grep IconMoveToCenter`：仅命中历史进度文档（`docs/root-cause-to-close/2026-10/…`、`docs/root-cause-to-close/2026-11/…:209,214`），`adlo/frontend/src` 零引用。**无失效引用。**

## 回归核查（本轮修复是否引入新问题）

1. **去重误删不同端口/协议** — 未发生。`bookmarkUrlKey`（`browserDisplayUtils.ts:276-286`）保留 `protocol + host（含端口）`，只归一化尾斜杠、`www.`、已知跟踪参数（含 `token`）、参数顺序，并忽略 hash；`useBrowserFolderCrud.ts:370` 用它做批量去重。`browserBookmarkSlice.test.ts:1013-1028` 有 `http://localhost:3000/app` vs `https://localhost:5173/app` 的反例（删除路径，同一键函数），确认协议/端口不会被合并。
2. **列表菜单是否仍与树一致** — 是。同一 `getTabContextMenuItems`，仅「显示」为列表专有；取消收藏范围两边都是条目级（书签行）/URL 级（活标签、历史行），语义已对齐。
3. **树/列表/搜索三模式差异** — 只剩「显示」（列表专有）与搜索模式按归属裁剪（`BrowserNavSearchMode.tsx:158-174`，属既有设计）。
4. **菜单 id 唯一性** — 列表菜单追加后 id 集合无重复（open-current / open-new / open-center / refresh / edit / copy-link / bookmark-toggle / delete / show-in-center）。
5. **菜单关闭行为** — 共享菜单的 action 不再自己 `setContextMenuForTab(null)`，但外层 `handleTabMenuAction`（`BrowserTreeEntryMenu.tsx:155-162`）统一 `fn()` 后关闭；早退分支（如 `!node.url`）也会关闭，`BrowserTreeEntryMenu.tsx:265-308` 无「点了不关」路径。
6. **测试隔离** — `useBrowserFolderCrud.test.ts:18-30` 的 `beforeEach` 已重置 `browserTabs`/`bookmarkFolders`/`workspaceBookmarks`/`history`/`centerTabs`，新增三例之间无状态串味。

## 新增发现

### N1 [severity: low] [category: 设计] 列表模式「在中心显示」被追加到「删除」之后（危险项不再位于末尾）

- 位置：`adlo/frontend/src/app/features/browser-tree/BrowserTreeEntryMenu.tsx:265-286`
- 描述：改用共享菜单后，「显示」被拼在 `getTabContextMenuItems` 数组末尾，因此在列表模式的活标签右键菜单里顺序变成：打开当前位置 → 打开新标签 → **在「中间区」打开** → 刷新 → 编辑 → 复制链接 → 取消收藏 → **删除（danger）** → **在「中间区」显示**。rev1 内联实现里「显示」在第 3 位（打开项之后、刷新之前）。用户可见的菜单顺序与分组被这次重构顺手改了，且危险项后面还挂了一项非危险项。
- 证据：`browserEntrySubEntriesUtils.tsx:195-284` 的返回顺序（`delete` 最后）+ `BrowserTreeEntryMenu.tsx:277-286` 的追加；rev1 快照 `BrowserTreeEntryMenu.tsx` 旧数组顺序为 open-current / open-new / show-in-center / refresh / …
- 建议修复：给 `getTabContextMenuItems` 加一个可选参数（如 `options?: { showInCenter?: boolean }`），在 `open-center` 之后按固定位置插入「显示」；树/搜索不传即不渲染。这样既保持单一实现，也固定顺序，而不是在调用侧追加到末尾。

### N2 [severity: low] [category: 文档] 进度文件未记录「全部在新标签打开」的既有行为也随共享收集器改变

- 位置：`docs/root-cause-to-close/2026-11/progress-2026-11-14-233054.md:214`；代码 `useBrowserFolderCrud.ts:297-388`
- 描述：F2 的修复落在两个动作共用的 `collectNodeOpenTargets` 上，因此**既有动作**「全部在新标签打开」在工作区上也从「活标签 + 工作区根书签」变为「再含工作区根目录（含嵌套）内的书签，并按 URL 去重」。方向与「删除」路径（`useBrowserFolderCrud.ts:78-132`）一致、也符合「全部」语义，但这是用户可见的既有功能行为变更，进度与审查记录只写了新增的「全部在中心打开」。
- 证据：`handleOpenAllInNewTabs`（`:381-388`）与 `handleOpenAllInCenter`（`:391-397`）共用同一收集器；对比 rev1 实现（工作区分支只有 `browserTabs` + `browserWorkspaceBookmarks`）。
- 建议修复：在进度文件事项 6 的实现/验证里补一句「`全部在新标签打开` 同步扩展到工作区根目录书签并按 URL 去重」，或经用户确认后再保留；若只想影响新动作，则需给两个 action 传不同选项（不推荐，会造成两套收集逻辑）。

## 记录不修

- （口径）去重键忽略 hash：`bookmarkUrlKey` 与历史/星标同一「URL 身份」口径，同一页面不同锚点的两条书签在「全部打开」时只会开一个；注释与 `isUrlBookmarked` 文档已写明「忽略 hash」，属于既有身份口径的一致延伸。
- （语义取舍）「已在中心」的标签点「全部在中心打开」会再建一份同 URL 标签：去重只作用于本次收集集合，未按「已在中心」跳过；与「打开 = 新建标签」的既有语义一致（rev1 F2 的子项，按取舍保留）。
- （可选回调）`SectionCallbacks.onOpenInCenter/onOpenAllInCenter` 仍为可选 + `?.` 调用（`browserEntrySubEntriesUtils.tsx:98,133,223`、`browserTreeEntryUtils.tsx:186`），菜单项无条件渲染；三处提供方（tabs/list/search）均已接线，当前无静默失效。
- （提前抽象）`icon?: React.ReactNode` 仍无生产者（`BrowserTreeEntryMenu.tsx:19-27,84,295`、`BrowserEntrySubEntries.tsx:377`、`browserTreeEntryUtils.tsx:118,160`、`browserEntrySubEntriesUtils.tsx:82,189`），且 `BrowserEntrySubEntries.tsx:285-292` 的 map 仍会丢掉 `icon`；「已打开标签页」走独立 `ContextMenu` items，不经过这些组件。
- （预存）搜索模式纯书签行仍走 URL 级：搜索节点没有 `bookmarkId`（`BrowserNavSearchMode.tsx:90-104`），`getTabContextMenuItems` 的条目级分支不命中，`删除` 还会落到 `browserRemoveBookmark('' , url)` 空转（`browserBookmarkSlice.ts:801-807`）。这也是 `browserEntrySubEntriesUtils.tsx:253-254`「动作只移除当前条目」在搜索行上不成立的原因。
- （预存）工作区子目录右键「全部打开」创建的新标签不带 `workspaceId`（folder 分支不传，`useBrowserFolderCrud.ts:328-352`），与从工作区行打开的结果不同；rev1 亦如此。
- （预存）`entryMenuViewItems`（`BrowserTreeEntryMenu.tsx:192-204`）的 `show-in-center` 仍不可达：`BrowserTreeEntry` 只渲染目录节点，没有 `url`/`tabId`。
- （预存）`onCloseTab` 在 tabs/list 两模式都未接线（`BrowserNavTabsMode.tsx:86-106`、`BrowserNavListMode.tsx:51-71`），hover 关闭按钮实际永不渲染。

## 结论

- 上轮 F1–F6：**6/6 已关闭**，且都有可失败的回归保护（F1、F3、F5 的用例经删除性推演确认；F2 三例覆盖去重/根目录/历史日；F4、F6 无残留）。
- 需修复项：2（critical 0 / high 0 / medium 0 / low 2）。
- 另记录不修 8 条（去重忽略 hash、已在中心再开一份、可选回调、icon 管道、搜索模式预存、工作区子目录无 workspaceId、不可达的 entryMenu 显示项、`onCloseTab` 未接线）。
