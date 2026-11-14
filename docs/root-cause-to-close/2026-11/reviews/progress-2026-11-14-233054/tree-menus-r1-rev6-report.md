# R1 审查报告 — 书签树菜单/搜索节点（rev6 定向复核）

## 范围

- 快照：`.review-diffs/*-rev6.diff`（base `4484cf75c`，无 commit，工作区全量 66 文件）。
- 复核对象：`.review-diffs/tree-menus-r1-rev5-report.md` 的 F1（global-only 用例夹具）/ F2（活标签行不消耗书签 id 无用例），以及本轮新增的严格标题匹配与历史行 `refresh/edit` 裁剪。
- 本 scope 文件（rev6）：`BrowserNavSearchMode.tsx`、`__tests__/BrowserNavSearchMode.test.tsx`；并核对树/列表侧是否同步（`BrowserTreeEntryMenu.tsx` blob `bbc43c045`、`BrowserEntrySubEntries.tsx` `4cd734f5e`、`browserEntrySubEntriesUtils.tsx` `15b62e589`、`__tests__/BrowserTreeEntryMenu.list.test.tsx` `d7988a527` —— 与 rev5 完全一致，未被本轮改动）。
- 交叉核对：`useBrowserTagActions.ts`（`handleRefreshTab`）、`browserHistorySlice.ts`（`browserUpdateHistoryTitle`）、`BrowserTreeEntryFlatList.tsx`（悬停刷新）、`useBrowserDialogs.ts`（`handleEditTab` 空转路径）、`browserBookmarkSlice.ts`（标题 trim 与索引同步）。
- 未运行测试套件（按简报）；测试有效性用「删掉实现 → 哪些断言变红」的删除性推演。
- 未执行任何 git 命令，未改动源码/配置。

## rev5 问题关闭情况

### F1 [low] global-only 用例夹具与注释不符 → **已关闭**

- 夹具已参数化：`BrowserNavSearchMode.test.tsx:65-98` 的 `renderSearch(..., options: { bookmarks?, tabs? })`，`browserBookmarks` 默认 `defaultBookmarks`（`:45-48`）。
- global-only 用例：`:245-264` 把 `https://global-only.test/app` 加入 `bookmarks`，断言 `browserUnbookmark`（取消收藏）+ 无 `browserContextDelete` + 无 `browserContextOpenCurrent`。与实现一致：`sourceIsSaved → isBookmarkRow`、`bookmarkId` 空 → `keep('delete')` 裁掉、label 由 `isUrlBookmarked` 判为「取消收藏」（`browserEntrySubEntriesUtils.tsx:255-267`、`BrowserNavSearchMode.tsx:214-215`）。
- 另新增 `:191-219`「global-only 书签不会抢同 URL 目录条目的 id」：目录条目标题「官方标题」、行标题「全局标题」→ 严格匹配失败 → 无 `bookmarkId` → 断言无「编辑/删除」；把 `takeBookmarkEntry` 的 `unused[0]` 回退恢复后，`bookmarkId` 会取到 `bm-official`，两条 `queryByText(...).toBeNull()` 立即变红 → **可失败 ✓**。

### F2 [low] 活标签行不消耗书签 id 无用例 → **已关闭（满足要求），但用例未隔离 source 守卫**

- 新增 `:266-291`：`rows[0]` 为 `source:'browserOpenTabs'` 的活标签行，`rows[1]` 为默认 `browserSavedTabs` 的书签行（标题 One），目录条目 `[One, Two]`；断言第二行「取消收藏」→ `onRemoveBookmarkTab('bm-one', url)`。
- 删除性推演（rev4 行为）：恢复「无条件 `takeBookmarkEntry` + 按出现顺序 `shift()`」→ 第一行取走 `bm-one`，第二行拿 `bm-two` → 断言失败 → **红 ✓**（满足 rev5 提出的「旧 shift 行为会红」）。
- 精度缺口：只去掉 source 守卫（`sourceIsOpen || sourceIsHistory ? undefined : ...`）而保留严格标题匹配时，第一行按标题取走的是 `bm-two`，第二行仍拿到 `bm-one` → 用例仍绿。即该用例实际保护的是「旧 shift + 无标题匹配」这一组合，而非「打开行不消耗 id」本身。→ 见新增 F2。

## 回归核查

1. **严格标题匹配（去掉 `unused[0]` 回退）对现有搜索用例的影响** — 无失效，逐条核对：
   - 跨端口用例（`:113-120`）标题「五千」与条目 `bm-5173` 同名 → 命中 ✓；
   - 反序用例（`:122-151`）标题 B/A 与条目同名 → 命中 ✓；
   - 默认来源收藏（`:153-166`）「三千」→ `bm-3000` ✓；
   - 历史域（`:168-180`）不取候选 ✓；
   - 纯书签编辑（`:182-189`）「五千」→ `bm-5173` ✓；
   - global-only（`:245-264`、`:191-219`）本就按「无匹配」设计 ✓。
   - 生产侧标题一致性也核对过：`browserCreateBookmarkEntry`（`browserBookmarkSlice.ts:513-514`）、`browserUpdateSavedBookmark`（`:656-657`）与 `computeToggleBookmarkOutcome`（`:126-128`）都对 title 做同一套 `trim() || hostnameFromUrl`,且索引元组与目录条目同步写入/同步淘汰（`:760-780`），所以「行标题 == 条目标题」在正常路径成立；不匹配仅剩「索引元组已无对应条目」的降级场景（记录不修）。
2. **历史行 `refresh/edit` 裁剪对一致性的影响** — `edit` 裁剪正确：`handleEditTab` 只接收标签/书签 id，历史 id 会走 `browserUpdateSavedBookmark`（未命中）+ `browserUpdateTab`（未命中）→ 对话框确认后空转（`useBrowserDialogs.ts:281-318`）。`refresh` 裁剪**过度**：`handleRefreshTab` 明确处理历史 id 并写回标题（`useBrowserTagActions.ts:67-71` → `browserHistorySlice.ts:146-165`），且树/列表仍提供该项、同一行的悬停刷新按钮仍在调用同一回调 → 见新增 F1。
3. **树/列表菜单** — blob 与 rev5 相同，三模式仍共用 `getTabContextMenuItems`；列表独家「显示」仍插在「删除」前。本轮只改搜索侧 `keep()` 与节点归属。
4. **删除了 rev5 的「同标题同 URL 两条目各用一次」用例** — 该场景经真实管线不可达（全局索引按 (url,title) 去重、`searchResults` 在「全部」域按 URL 去重、历史行不取候选），删除可接受；`usedBookmarkIds` 现仅作防御（见记录不修）。

## 新增发现

### F1 [severity: medium] [category: 正确性] 搜索历史行的「刷新网站图标与标题」被整条裁掉：该动作对历史 id 生效，树/列表与同行的悬停按钮仍在提供

- 位置：`adlo/frontend/src/app/features/browser/BrowserNavSearchMode.tsx:212-213`（`case 'refresh': return !isHistoryKind && !!node.url;`）与 `:201-203` 的注释
- 描述：本轮为修「历史行有活标签时仍显示依赖 tabId 的编辑/刷新」，把 `refresh` 与 `edit` 一起按 `isHistoryKind` 裁掉。这个前提只对 `edit` 成立：
  - `refresh` 的 action 是 `callbacks.onRefreshTab(node.tabId, node.url)`（`browserEntrySubEntriesUtils.tsx:223-232`），历史行的 `tabId` 就是历史条目 id；`handleRefreshTab` 在找不到同名标签时走历史分支 `browserUpdateHistoryTitle(url, title)`（`useBrowserTagActions.ts:67-71`），会真实刷新站点元数据并把历史标题写回并持久化（`browserHistorySlice.ts:146-165`）——不是空转。
  - 结果：搜索里历史行不再有「刷新网站图标与标题」，但同一行的**悬停刷新按钮**仍调用同一回调（`BrowserTreeEntryFlatList.tsx:94-102`、`:132-153`），树/列表的历史行菜单也仍提供该项（`browserEntrySubEntriesUtils.tsx:223-232`）→ 同一能力在三种模式、同一行的两个入口之间不一致。
  - 注释「历史行不做元数据刷新/编辑（传入的是历史 id，对话框会空转）」把「对话框空转」这一 `edit` 专属理由套到了 `refresh` 上，与实现不符。
- 证据：`BrowserNavSearchMode.test.tsx:221-243` 断言历史行 `browserRefreshMeta` 为 `null`（把上述行为固化）；`BrowserTreeEntryFlatList` 的 `tabBtns` 无条件含 refresh；`useBrowserTagActions.ts:67-71` 的历史分支；`browserHistorySlice.ts:149-161`（还会按 `historyDedupKey` 更新同 URL 的所有历史条目标题）。
- 建议修复：`case 'refresh': return !!node.url;`（保留 `edit` 的 `!isHistoryKind`），并补一条「历史行菜单含刷新且点击调用 `onRefreshTab(historyId, url)`」断言；若确认历史行不应刷新标题，则必须同时隐藏搜索历史行的悬停刷新按钮、修正注释，并在进度里记录「树/列表仍保留该动作」的差异——两种做法都要三模式口径一致。
- 附带建议（同源）：`edit` 的空转裁剪目前只落在搜索组件里，树/列表的历史行仍提供空转的「编辑」。更彻底的做法是把「历史行不提供编辑」下沉到 `getTabContextMenuItems`（按 `node.nodeType === 'history'` 跳过），避免三处各写一份 `keep()`。

### F2 [severity: low] [category: 正确性] 「活标签行不消耗书签 id」用例未隔离 source 守卫，只回退该守卫时仍绿

- 位置：`adlo/frontend/src/app/features/browser/__tests__/BrowserNavSearchMode.test.tsx:266-291`（被测实现 `BrowserNavSearchMode.tsx:103-105`）
- 描述：用例给了两行不同标题（打开行 `Two`、书签行 `One`），条目也是 `[One, Two]`。严格标题匹配下，即使把 `bookmarkCandidate = sourceIsOpen || sourceIsHistory ? undefined : takeBookmarkEntry(...)` 改回无条件取候选，打开行按标题取走的是 `bm-two`，书签行仍拿到 `bm-one` → 断言 `onRemoveBookmarkTab('bm-one', U)` 依旧通过。也就是说：删掉本条修复（source 守卫）不会让任何用例变红，rev5 F2 想加的回归保护仍缺一半。
- 证据（推演）：仅回退 `:103-105` 的守卫、保留 `:78-86` 的标题匹配 → 调用序列 `[['bm-two'…], ['bm-one'…]]`，但断言只看第二行，故绿；只有同时回退成 rev4 的 `shift()` 才红。
- 建议修复：让打开行与书签行的标题相同（如两行都用 `One`），或让打开行的标题等于「后续书签行需要的那条条目」标题；此时无条件取候选会让打开行先吃掉 `bm-one`，书签行拿不到同标题条目 → 断言红。补好后可顺带覆盖「打开行不消耗 id」这一条独立结论。

## 记录不修

- （删除的用例）rev5 的「同标题同 URL 两条目各用一次」已删：该输入经真实管线不可达（全局索引按 (url,title) 去重、`mergeSearchResults` 在「全部」域按 URL 去重、历史行不取候选）。`usedBookmarkIds` 因严格标题匹配后只剩防御价值，保留无害。
- （严格匹配的取舍）行标题与任何目录条目都不匹配时（索引里残留无归属的元组、或同名副本被改名后旧元组仍被别处引用），该行退化为 URL 级动作：无「编辑/删除」，「取消收藏」会按 URL 清掉全部副本。代码注释已声明「宁可少一个条目级动作」，与进度 `:217` 的记录一致；属已声明的取舍。
- （source 判别式）归属仍以展示标签 `result.source` 作判别（`:100-102`），依赖两侧共用同一 `t` 且三种标签在当前语言下互不相同；更稳的是给合并结果加机器可读 `kind`。沿用 rev5 结论，不改。
- （空断言）`BrowserNavSearchMode.test.tsx:165`、`:263` 的 `expect(onDeleteTab).not.toHaveBeenCalled()` 在只点「取消收藏」/只打开菜单的场景下不构成有效证据（与 F1/F2 一并修时顺手处理即可）。
- （预存）`mergeSearchResults` 的「全部」域去重仍用 `historyDedupKey`（跨端口合并为一条），与节点侧 `bookmarkUrlKey` 不一致；P4 已记录待产品确认。
- （预存）树/列表对历史行仍提供空转的「编辑」；搜索对非活标签行隐藏「在当前标签打开」；`SectionCallbacks.onOpenInCenter/onOpenAllInCenter` 仍可选；菜单 `icon` 管道无生产者；`onCloseTab` 未接线；`BrowserTreeEntryMenu.tsx:192-203` 的 entryMenu「显示」不可达。
- （命名）`browserTreeFavicon.test.ts:41`、`BrowserTreeEntryFlatList.test.tsx:60` 的用例名仍带 `(search results)`（正文注释已说明是防御性构造）。

## 结论

- rev5 F1 / F2：**2/2 已关闭**（global-only 夹具已按真实分支修正并断言「取消收藏」；活标签行不消耗 id 的用例已新增且 rev4 行为会红）。
- 需修复项：2（critical 0 / high 0 / medium 1 / low 1）——F1 历史行刷新被过度裁剪（功能性动作消失 + 三模式/同行入口不一致 + 注释前提不成立）；F2 新增用例未隔离 source 守卫。
- 另记录不修 7 条（删除的合成用例、严格匹配的降级取舍、source 展示标签判别式、两处空断言、`mergeSearchResults` 合并键待产品确认、树/列表历史行空转编辑等预存差异、用例命名）。
