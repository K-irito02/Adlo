# R1 审查报告 — 书签树菜单/搜索节点（rev7 定向复核）

## 范围

- 快照：`.review-diffs/*-rev7.diff`（base `4484cf75c`，无 commit，工作区全量 66 文件）。
- 复核对象：`.review-diffs/tree-menus-r1-rev6-report.md` 的 F1（历史行 refresh 被误裁）/ F2（open 不消耗 id 用例未隔离）。
- 本 scope 文件（rev7）：`BrowserNavSearchMode.tsx`、`__tests__/BrowserNavSearchMode.test.tsx`；树/列表侧复核 `BrowserTreeEntryMenu.tsx`（blob `bbc43c045`）、`BrowserEntrySubEntries.tsx`（`4cd734f5e`）、`browserEntrySubEntriesUtils.tsx`（`15b62e589`）、`__tests__/BrowserTreeEntryMenu.list.test.tsx`（`d7988a527`）——与 rev6 的 index 行完全一致，本轮未改。
- 交叉核对：`useBrowserTagActions.ts`（`handleRefreshTab` 历史分支）、`browserHistorySlice.ts`（`browserUpdateHistoryTitle`）、`BrowserTreeEntryFlatList.tsx`（悬停刷新）、`browserEntrySubEntriesUtils.tsx`（共享菜单 refresh/edit）。
- 未运行测试套件（按简报）；测试有效性用「删掉实现 → 哪些断言变红」的删除性推演。
- 未执行任何 git 命令，未改动源码/配置。

## rev6 问题关闭情况

### F1 [medium] 搜索历史行的「刷新网站图标与标题」被整条裁掉 → **已关闭**

- 代码：`BrowserNavSearchMode.tsx:212-213` 改为
  `case 'refresh': return !!node.url && (!isHistoryKind || !!node.tabId);`
  即非历史行按 URL 放行；历史行要求存在 `tabId`（历史行在 `sourceIsHistory` 分支下 `tabId = historyEntry.id`，`:119`）。「编辑」仍是 `!isHistoryKind && !!(bookmarkId || tabId)`（`:216-217`），历史行不提供。
- 注释同步：`:201-203` 改为「历史行不提供「编辑」（对话框按标签 id 写入，历史 id 会空转），但「刷新」仍可按历史 id 写回历史标题（与悬停按钮同口径）」——与实现一致。
- 动作确实生效（medium 关闭的关键证据）：
  - 菜单 action `callbacks.onRefreshTab(node.tabId, node.url)`（`browserEntrySubEntriesUtils.tsx:223-232`）；
  - `handleRefreshTab` 找不到同名标签时走历史分支：`isHistoryEntry = state.browserHistory.some(h => h.id === tabId)` → `browserUpdateHistoryTitle(url, title)`（`useBrowserTagActions.ts:67-71`）；
  - `browserUpdateHistoryTitle` 按 `historyDedupKey` 命中全部同 URL 历史条目、写入新标题并 `persist('adl:browser.history')`（`browserHistorySlice.ts:146-165`，非占位标题才覆盖，`:149-151`）。
  因此历史行刷新是真实写入，不是空转。
- 用例：`BrowserNavSearchMode.test.tsx:221-244` 在「历史行 + 同 URL 活标签」下断言 `browserContextEdit` 为 `null`、`browserRefreshMeta` **存在**（`:239-240`）、`browserContextOpenCurrent` / `browserContextDelete` 存在。
- 删除性推演：把 `refresh` 改回 rev6 的 `!isHistoryKind && !!node.url` → `:240` 的 `getByText('browserRefreshMeta')` 立即抛错 → **红 ✓**（该断言即本轮回归保护）。
- 三模式一致性：refresh 现在与树/列表一致（共享菜单对该项不做类型裁剪），也与同一行悬停刷新按钮一致（`BrowserTreeEntryFlatList.tsx:94-102`、`:132-153`）。

### F2 [low] 「活标签行不消耗书签 id」用例未隔离 source 守卫 → **已关闭**

- 用例：`BrowserNavSearchMode.test.tsx:276-301` 现在让两行**同标题**（打开行与书签行都是 `One`），条目为 `[One(bm-one), Two(bm-two)]`，仍用 `rows[1]` 定位书签行并断言 `onRemoveBookmarkTab('bm-one', url)`。
- 删除性推演（仅回退 source 守卫、保留严格标题匹配）：打开行按标题取走 `bm-one`（随后因 `isOpenTab` 丢弃），书签行在剩余 `[Two]` 中找不到标题 `One` 的条目 → `bookmarkId` 为空 → `isSavedBookmark && bookmarkId` 不成立、且该 URL 不在 `browserBookmarks` → 菜单项为「收藏」而非「取消收藏」→ `getAllByText('browserUnbookmark')[0]` 抛错 → **红 ✓**。
- 同时回退成 rev4 的「`shift()` + 无标题匹配」同样会红（rev6 已证）。
- 结论：该用例现在能独立拦住「打开行消耗书签 id」这一条实现，rev5/rev6 的覆盖缺口已补齐。

## 回归核查

1. **`refresh` 条件对各类行的效果**：
   - 活标签行（`nodeType:'tab'`）：`!isHistoryKind` → 按 URL 放行 ✓；
   - 书签行（`nodeType:'bookmark'`）：同上 ✓；
   - 历史行（`nodeType:'history'`）：要求 `tabId`；正常历史行必有历史 id ✓；
   - 唯一会被裁掉的是「`nodeType:'history'` 且没有 `tabId`」的降级行——只可能出现在 `source` 不是三种已知标签、且该 URL 不在历史里的异常输入，真实管线（`mergeSearchResults`）不会产出，属合理防御。
2. **`edit` 仍只对非历史行放行**：与 rev6 结论一致（`handleEditTab` 按标签/书签 id 写入，历史 id 会走 `browserUpdateSavedBookmark` 未命中 + `browserUpdateTab` 未命中，确认阶段空转，`useBrowserDialogs.ts:281-318`）。
3. **树/列表菜单未被本轮触碰**：blob 与 rev6 一致；三模式仍共用 `getTabContextMenuItems`，列表独家「显示」位置不变。
4. **其余搜索用例未受影响**：跨端口（`:114-121`）、同 URL 反序（`:123-152`）、默认来源收藏（`:154-167`）、历史域删除（`:169-181`）、纯书签编辑+删除（`:183-195`）、global-only 抢 id（`:197-219`）、global-only 行（`:246-274`）均只依赖本轮未改的分支；`:183-195` 新增的「删除按条目 id」与 `:271-272` 的「新标签打开不带快照标题」断言也与实现一致（`isSavedBookmark → undefined`）。
5. **进度记录一致**：`progress:247` 的 rev6 结论（refresh 允许历史行需 tabId、open 用例改同标题）与代码/用例逐条相符。

## 新增发现

### F1 [severity: low] [category: 文档] 历史行用例的标题与自身断言相反（仍写「不提供…刷新」，正文已断言刷新存在）

- 位置：`adlo/frontend/src/app/features/browser/__tests__/BrowserNavSearchMode.test.tsx:221`
- 描述：用例名仍为「历史行即使有同名活标签，也不提供依赖 tabId 的编辑/刷新」，但函数体已改为「编辑隐藏、**刷新保留**」：`:238` 断言 `browserContextEdit` 为 null，`:239-240` 断言 `browserRefreshMeta` 存在。标题与断言互相矛盾，后续按标题检索回归保护的人会误判该行为已被移除。
- 证据：`:221`（标题）与 `:238-240`（断言）；实现侧 `BrowserNavSearchMode.tsx:212-217`。
- 建议修复：改名为「历史行只隐藏依赖标签 id 的编辑，刷新仍按历史 id 生效」或等价措辞（纯文案改动，无行为变化）。

## 记录不修

- （预存）树/列表的历史行仍提供空转的「编辑」（`browserEntrySubEntriesUtils.tsx:233-240`，历史 id 进对话框后确认无效）。搜索已裁掉，三模式仍不一致；更彻底的做法是把「历史行不提供编辑」下沉到共享菜单，属跨轮结构调整，本次不改。
- （严格匹配取舍）行标题与任何目录条目都不匹配时退化为 URL 级动作（无编辑/删除，「取消收藏」按 URL 清全部副本），代码注释已声明，与 `progress:217` 记录一致。
- （source 判别式）归属仍以展示标签 `result.source` 判别，依赖两侧共用同一 `t` 且三种标签互不相同；可选改为机器可读 `kind`。
- （空断言）`BrowserNavSearchMode.test.tsx:166`、`:273` 的 `expect(onDeleteTab).not.toHaveBeenCalled()` 在只点「取消收藏」/只打开菜单的场景下不构成有效证据；无害保留。
- （预存）`mergeSearchResults` 的「全部」域去重仍用 `historyDedupKey`（跨端口合并为一条），与节点侧 `bookmarkUrlKey` 不一致；P4 已记录待产品确认。
- （防御代码）`usedBookmarkIds` 在严格标题匹配后只剩防御值（同标题同 URL 的两行经真实管线不可达），保留无害。
- （命名）`browserTreeFavicon.test.ts:41`、`BrowserTreeEntryFlatList.test.tsx:60` 的用例名仍带 `(search results)`（正文注释已说明是防御性构造）。

## 结论

- rev6 F1 / F2：**2/2 已关闭**（历史行刷新恢复为 `!!node.url && (!isHistoryKind || !!node.tabId)`，且 `handleRefreshTab` 经历史 id 写回历史标题已核实；open 不消耗用例改为同标题后，仅回退 source 守卫即红）。
- 需修复项：1（critical 0 / high 0 / medium 0 / low 1）——仅剩历史行用例标题与断言相反（文案级）。
- 另记录不修 7 条（树/列表历史行空转编辑等预存差异、严格匹配降级取舍、source 判别式、两处空断言、`mergeSearchResults` 合并键待产品确认、`usedBookmarkIds` 防御性、用例命名）。
