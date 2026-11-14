# R1 审查报告 — 书签树菜单/搜索节点（rev5 复审）

## 范围

- 快照：`.review-diffs/*-rev5.diff`（base `4484cf75c`，无 commit，工作区全量 66 文件）。
- 复审对象：`.review-diffs/tree-menus-r1-rev4-report.md` 的 F1（历史域归属）/ F2（同 URL 多条目按目录顺序 `shift()`、打开行消耗书签 id），以及新增/更新的 `BrowserNavSearchMode.test.tsx`。
- 本 scope 文件（rev5 快照）：`BrowserNavSearchMode.tsx`、`__tests__/BrowserNavSearchMode.test.tsx`，并逐一核对树/列表侧是否被本轮改动（`BrowserTreeEntryMenu.tsx`、`BrowserEntrySubEntries.tsx`、`browserEntrySubEntriesUtils.tsx`、`browserTreeEntryUtils.tsx`、`__tests__/BrowserTreeEntryMenu.list.test.tsx`、`__tests__/BrowserBookmarkRowActions.test.tsx`、`BrowserNavTabsMode.tsx` / `BrowserNavListMode.tsx`、`BrowserNavigator.tsx`、`useBrowserFolderCrud.ts`）。
- 交叉核对（非本 scope 归属）：`browserUrlUtils.ts`（`mergeSearchResults` 的 source 标签）、`useBrowserSearch.ts`、`browserBookmarkSlice.ts`（`removeEntriesMatching`）、`browserSearchOverlay` 对 `source` 的展示、i18n 标签值。
- 未运行测试套件（按简报）；测试有效性用「删掉实现 → 哪些断言变红」的删除性推演。
- 未执行任何 git 命令，未改动源码/配置。

## rev4 问题关闭情况

### F1 [medium] 「历史」搜索域里已收藏 URL 被强制判成书签行 → **已关闭**

- 代码：`BrowserNavSearchMode.tsx:115-128` 改为按 `result.source` 判定归属：
  - `sourceIsOpen = result.source === t.browserOpenTabs && Boolean(openTab)`
  - `sourceIsSaved = result.source === t.browserSavedTabs`
  - `sourceIsHistory = result.source === t.browserHistoryTabs && Boolean(historyEntry)`
  - `isBookmarkRow = !isOpenTab && !sourceIsHistory && (sourceIsSaved || Boolean(bookmarkCandidate))`；`isHistoryRow` 时 `tabId = historyEntry.id`（`:135`）。
  历史域的行因此保持 `nodeType:'history'` + 历史 id，「删除」走 `onDeleteTab`，「取消收藏」与「删除」不再落到同一个书签条目。
- 用例：`BrowserNavSearchMode.test.tsx:149-161`（`source:'browserHistoryTabs'` + 同 URL 有书签）→ 点「删除」断言 `onDeleteTab('h-1', url)` 且 `onRemoveBookmarkTab` 未被调用。
- 删除性推演：去掉 `sourceIsHistory`（回到 rev4 的「收藏优先」）→ 行变书签行，「删除」走 `onRemoveBookmarkTab` → `onDeleteTab` 断言失败、`not.toHaveBeenCalled` 也失败 → **红 ✓**。
- 附带正面变化：`bookmarks` 域里 URL 已在标签中打开的行，现在按 `source` 判为书签行（此前被 `openTab` 抢成 tab 行，删除=关标签）；与域的「只搜书签」语义一致。
- 「全部」域未受影响：`mergeSearchResults` 已按 已打开 > 收藏 > 历史 写入 `source`（`browserUrlUtils.ts:236-244`），归属与行来源一致。

### F2 [medium] 同 URL 多条目按目录顺序 `shift()` + 打开行消耗 id → **已关闭（核心），id 消耗分支无用例**

- 代码：
  1. 队列改为 `Map<key, {id,title}[]>`（`:80-99`），`takeBookmarkEntry(key, title)` 先在**未使用**候选中按标题精确匹配，匹配不到才回退队首（`:100-109`），并按 id 记入 `usedBookmarkIds`。
  2. 打开/历史来源的行不再取书签候选：`bookmarkCandidate = sourceIsOpen || sourceIsHistory ? undefined : takeBookmarkEntry(...)`（`:121-122`），因此打开标签行不会白耗一个书签 id（rev4 的次要问题）。
  3. 注释同步为「按搜索结果自身的标题优先匹配未使用的条目…标题也相同才退回该 URL 下第一个未使用条目」（`:39-41`），与实现一致。
- 用例：
  - `:97-132`「按标题锚定自己的条目（顺序无关）」——目录条目顺序 A→B，搜索结果顺序故意反转为 B→A，断言调用 `[[bm-dup-2], [bm-dup-1]]`。删除性推演：改回「按出现顺序取队首」→ 变成 `[[bm-dup-1], [bm-dup-2]]`，断言失败 → **红 ✓**。
  - `:172-207`「同标题同 URL 两条目各用一次」——若去掉 `usedBookmarkIds`（总是取标题匹配的第一个）→ 两次都是 `bm-same-1`，断言失败 → **红 ✓**。
- 遗留：第 (2) 点（打开标签行不消耗 id / `sourceIsOpen` 时不取候选）在用例里没有覆盖 —— 所有用例都是 `browserTabs: []`。见新增 F2。

## 回归核查（树 / 列表 / 三模式）

1. **树与列表菜单未被本轮触碰** — `BrowserTreeEntryMenu.tsx`（rev5 blob `bbc43c045`）、`BrowserEntrySubEntries.tsx`（`4cd734f5e`）、`__tests__/BrowserTreeEntryMenu.list.test.tsx`（`d7988a527`）与 rev4 完全一致（比对 rev4/rev5 快照 index 行）。三模式仍共用 `getTabContextMenuItems`，列表独有的「显示」仍插在「删除」之前。
2. **source 判定的稳定前提** — `result.source` 是 `mergeSearchResults` 写入的**展示标签**（`BrowserSearchOverlay.tsx:27` 直接渲染它），两侧都用同一个 `t`。当前两种语言下三个标签互不相同（zh：`收藏标签`/`历史标签`/`已打开标签页`；en：`Saved tabs`/`History tabs`/`Open Tabs`），且 `useMemo` 依赖已补 `t.browserOpenTabs/browserSavedTabs/browserHistoryTabs`（`:153-155`），切换语言时会重算 → 无现网错判。
3. **归属回退链** — `source` 为打开来源但 `openTab` 已消失时，`sourceIsOpen=false`，会落到书签候选或历史行（`historyEntry` 命中则可用）；不会产生「无任何 id 的死菜单」（`keep()` 仍按 `bookmarkId || tabId` 裁剪）。
4. **global-only 行（只有全局索引、无目录条目）** — 代码按书签行处理（`sourceIsSaved` 命中），`bookmarkId` 为空 → 「删除」被 `keep()` 裁掉，「取消收藏」仍可用（`handleBookmarkToggle → browserRemoveBookmarksForUrl`），与进度 `:217` 的记录一致。**但新用例没有真正覆盖这个分支**，见新增 F1。
5. **搜索「删除/编辑」条目级语义** — 三模式下可定位条目时均为条目级；不可定位（global-only）时搜索隐藏「删除」、树/列表因有 `bookmarkId` 不受影响。

## 新增发现

### F1 [severity: low] [category: 文档] 「仅存在于全局索引的书签」用例的夹具与注释不符：URL 并不在 `browserBookmarks` 里，期望标签与真实分支相反

- 位置：`adlo/frontend/src/app/features/browser/__tests__/BrowserNavSearchMode.test.tsx:209-220`（配合 `:55-58` 的固定夹具）
- 描述：用例名与注释写「仅存在于全局索引的书签仍按书签行处理」「browserBookmarks 有该 URL，但 folders 里没有条目」，但 `renderSearch` 的 `browserBookmarks` 固定只有 `localhost:3000` / `localhost:5173` 两条，`https://global-only.test/app` **不在全局索引里**。于是：
  - 断言 `getByText('browserBookmark')`（=「收藏」）之所以通过，是因为 `isUrlBookmarked` 为 false；**真正的 global-only 行**（URL 在索引、无目录条目）会得到「取消收藏」（`browserUnbookmark`），按现有断言反而会失败；
  - 该用例实际只覆盖了「source=收藏、无目录候选」这一半路径（`isBookmarkRow` 成立、`bookmarkId` 空、「删除」被裁），没有覆盖「取消收藏可移除全局索引条目」的动作结果。
  - 进度 `:234` 声称「补…global-only 用例」，与事实不符（注释级偏差）。
- 证据：`BrowserNavSearchMode.test.tsx:55-58`（`browserBookmarks` 无 global-only URL）、`:213`（注释声称有）、`:216`（断言 `browserBookmark`）；实现侧 `browserEntrySubEntriesUtils.tsx:256-260`（有 `bookmarkId` 才强制「取消收藏」，否则看 `isBookmarked`）、`:262-267`（无 `bookmarkId` 时走 URL 级 `handleBookmarkToggle`）、`BrowserNavSearchMode.tsx:207-214`（`keep('delete')` 需 `bookmarkId || tabId`）。
- 建议修复：给 `renderSearch` 增加可选 `bookmarks` 参数，该用例传入包含 `https://global-only.test/app` 的索引并断言 `browserUnbookmark` + 点击后走 URL 级（可断言 `onRemoveBookmarkTab` 未被调用，因为无条目 id），同时保留「无 `browserContextDelete`」断言；或把用例改名/注释降级为「source=收藏但条目不可定位时的降级」。

### F2 [severity: low] [category: 正确性] 「打开标签行不消耗书签 id」的修复没有用例

- 位置：`adlo/frontend/src/app/features/browser/BrowserNavSearchMode.tsx:118-127`（`sourceIsOpen` 时不取候选）
- 描述：rev4 F2 的次要问题（打开中的标签行先 `shift()` 白耗一个书签 id，导致后续同 URL 行错位）在本轮已修，但所有用例都传入 `browserTabs: []`，没有一条能让该行为变红的断言。
- 证据（删除性推演）：构造 `browserTabs:[{id:'t1', url:U}]`、目录里 U 有唯一条目 `bm-1`、`searchResults:[{source:'browserOpenTabs',url:U},{source:'browserSavedTabs',url:U}]`。当前实现里第二行仍能取到 `bm-1`；把 `bookmarkCandidate` 改回「无条件 `takeBookmarkEntry`」（rev4 行为），第一行会耗掉 `bm-1`，第二行 `bookmarkId` 为空 → 点「取消收藏」走 URL 级而非 `onRemoveBookmarkTab('bm-1', U)` → 若补了对应断言即会变红。现有测试集无此断言，改回 rev4 行为也不会红。
- 建议修复：补上述一条用例（断言第二行「取消收藏」→ `onRemoveBookmarkTab('bm-1', U)`；打开行「删除」→ `onDeleteTab('t1', U)`）。

## 记录不修

- （设计脆弱性）归属判定把 `result.source` 这个**展示标签**当判别式（`:118-120`）。当前两种语言标签互不相同、两侧共用同一 `t`、依赖数组已包含三个标签，故无现网错判；更稳的做法是在 `mergeSearchResults` 结果上增加机器可读的 `kind: 'open' | 'bookmark' | 'history'`，`source` 继续只作展示（`BrowserSearchOverlay.tsx:27`）。属可选优化，不改。
- （空断言）`BrowserNavSearchMode.test.tsx:146`、`:219` 的 `expect(onDeleteTab).not.toHaveBeenCalled()` 在「只点了取消收藏 / 只打开了菜单」的场景下不构成有效证据；与新增 F1 一并修正即可，不单列。
- （预存）`mergeSearchResults` 的「全部」域去重仍用 `historyDedupKey`（跨端口合并为一条），与节点侧 `bookmarkUrlKey` 不一致；P4 已记录待产品确认。
- （预存）树/列表/搜索共用菜单的既有差异：搜索对非活标签行隐藏「在当前标签打开」；`SectionCallbacks.onOpenInCenter/onOpenAllInCenter` 仍可选；菜单 `icon` 管道无生产者；`onCloseTab` 未接线；`BrowserTreeEntryMenu.tsx:192-203` 的 entryMenu「显示」不可达。
- （命名）`browserTreeFavicon.test.ts:41`、`BrowserTreeEntryFlatList.test.tsx:60` 的用例名仍带 `(search results)`（rev4 已记录，正文注释已说明是防御性构造）。

## 结论

- rev4 F1 / F2：**2/2 已关闭**（历史域按 `source` 归属、同 URL 多条目按标题匹配未使用条目，均有可失败用例；打开行消耗 id 的实现已修但缺用例）。
- 需修复项：2（critical 0 / high 0 / medium 0 / low 2）。
- 另记录不修 5 条（source 标签判别式的可选加固、两处空断言、`mergeSearchResults` 合并键待产品确认、三模式菜单既有差异项、用例命名）。
