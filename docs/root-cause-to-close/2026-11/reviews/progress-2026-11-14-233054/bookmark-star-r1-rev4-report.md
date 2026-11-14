# R1 rev4 审查报告 — 收藏身份 / 实心星 / 搜索归属

## 范围

- 快照：`.review-diffs/manifest-rev4.md`（base `4484cf75c`，66 文件）；manifest 5:16 生成，目标源码 5:05–5:08 修改，快照与工作区一致。
- 逐文件：`browserDisplayUtils.ts`、`browserBookmarkSlice.ts`、`browserBookmarkSlice.test.ts`、`useBrowserTabs.ts`、`useBrowserTabs.test.ts`、`useBookmarkToFolderDialog.ts`、`useBookmarkToFolderDialog.test.tsx`、`CenterBrowserView.tsx`、`CenterBrowserView.test.tsx`、`BrowserTabBar.tsx`、`icons/actions.tsx`、`icons/actions.test.tsx`、`icons/core.tsx`、`icons/core.test.tsx`、`icons/index.ts`。
- 交叉核对（同轮其它 scope，仅作证据）：`BrowserNavSearchMode.tsx` + `BrowserNavSearchMode.test.tsx`、`browserTabsSlice.ts` + 测试、`useBrowserTreeData.ts`、`browserUrlUtils.ts`、`BrowserTreeEntryFlatList.test.tsx`、`browserTreeFavicon.ts` + 测试、三篇知识库、`docs/operations/ui-manual/rightpanel/tools/browser.md`、进度文件。
- 未跑测试；测试有效性按「删掉修复后哪条断言变红」做删除性推演（见末节）。

## rev3 问题关闭情况

### 1. rev3 F1 medium（搜索归属 + bookmarkId 锚定）— 部分关闭

已关闭的部分：

- 归属优先级已改为 **已打开 > 收藏 > 历史**（`BrowserNavSearchMode.tsx:103-111`）：`isOpenTab`/`isBookmarkRow`/`isHistoryRow` 互斥，`historyEntry` 只在历史行查找；书签行不再被历史抢走。
- 纯书签行 `nodeType:'bookmark'`、`tabId` 只留给活标签/历史、`bookmarkId` 交给条目 id（`:112-126`）；`keep` 的 edit/delete 以 `bookmarkId || tabId` 放行，refresh 对任意有 URL 的行放行（`:195-215`），与新结构一致。
- `bookmarkIdsByKey` 按目录/工作区顺序收集、按 `searchResults` 顺序 `shift()` 分配（`:72-102`）；新增 `BrowserNavSearchMode.test.tsx` 覆盖跨端口（`:85-92`）、同 URL 两条目（`:94-122`）、书签优先于历史（`:124-137`）、纯书签编辑（`:139-146`）。
- `browserTabsSlice.browserOpenTab` 落目录去重继续使用 `bookmarkUrlKey`，跨端口用例可红；`useBrowserTreeData` 条目↔标签匹配继续使用 `bookmarkUrlKey`。
- `browserUrlUtils.ts:230` 的「全部」合并键仍是历史键，P4 `:224` 已按「会改变历史/标签合并范围，需产品确认」记录不修——记录本身准确。
- 仅协议不同（同 host:port）的反例已补：`browserBookmarkSlice.test.ts:1025-1040`；回退到忽略协议会让 `http` 副本一起被删，用例变红。

未关闭 / 新暴露的问题：

- **`shift()` 的位置配对不是「每条结果锚定自己的条目」**：`bookmarkIdsByKey` 的顺序来自目录数组 + 工作区对象遍历，`searchResults` 的顺序来自全局索引并经过查询过滤；两者没有保证一致。`searchResults` 被查询裁剪、跨目录创建顺序不同、工作区与目录混排、或编辑书签后全局索引把条目重排到末尾时，同 URL 的多个 `bookmarkId` 会错位；编辑/删除/取消收藏命中另一条条目。新增用例只覆盖「两行都出现且顺序与目录顺序一致」的情形，不能证明该注释/进度里的保证（详见 F1）。
- **同 URL 同标题的多条目**：全局索引按 `(url,title)` 去重，搜索结果只有一行，但目录/工作区可能有多条同 URL 同标题条目；`shift()` 取第一条，仍无法「各锚定自己」，删除/编辑只能命中任意一条。
- **仅有全局索引、无目录/工作区条目的书签（global-only）**：`isBookmarkRow = !isOpenTab && Boolean(bookmarkEntryId)` 要求存在条目 id，global-only 结果为 `nodeType:'history'`、`isSavedBookmark:false`；`open-new`/`open-center` 会把书签标题传给新标签（违反 ADR-0017 的标题隔离），行也被当成历史。这是 rev4 相对 rev3 的新行为（rev3 的 `isPureBookmark` 对无活标签/历史的结果为 true）。
- **历史范围**：组件不接收 `searchScope`/来源类型，收藏优先是全局的；「历史」范围里一个已收藏 URL 会显示为书签行，删除删书签而不是历史，历史条目无法从搜索删除。纯历史行（无书签）仍可删历史、编辑隐藏，未回归；但历史范围的书签化需要产品确认或 scope-aware 归属。
- 新用例仍未覆盖：查询只剩同 URL 其中一个标题（`shift` 必然错位）、跨目录/工作区顺序、global-only、点击「删除」（`onDeleteTab` 不被调用）、refresh、openTab 优先、历史-only 行。

### 2. rev3 F2 low（文档/进度旧口径）— 部分关闭

- **已关闭**：`divider-strip-dual-host...:22` 已改为「URL 级动作会清理该 URL 的全部副本（用户明确选择），因此不存在取错活动标签的归属歧义」，不再自相矛盾；进度 `:88` 已加「P4 修订：改用 `bookmarkUrlKey`，保留协议/端口；早期与 `historyDedupKey` 同口径」，与最终代码一致。
- **未完全关闭**：
  - 进度 `:90` 仍写「…仅地址栏星标保留 URL 级」；树/列表/搜索中的活标签、历史行仍经 `handleBookmarkToggle` 走 `browserRemoveBookmarksForUrl`，URL 级并非只有星标。若本意是「书签行中仅星标保留 URL 级」，需把主语写清。
  - 进度 `:217` 仍保留「搜索纯收藏行删除空转（预存）」；rev4 已为有条目的纯书签行接上 `bookmarkId` + delete（global-only 行隐藏删除），不再是空转。
  - 进度 `:230`（R1 rev3 记录）称「书签条目 id 按出现顺序排队分配，每条搜索结果锚定自己的条目」；该保证不成立于过滤/跨目录/重排场景（见 F1），应改为「在结果与条目顺序一致时」或随 F1 修复后再写。
  - `docs/operations/ui-manual/rightpanel/tools/browser.md:169` 仍称历史/书签条目与标签按「归一化匹配，剥离跟踪参数/尾斜杠/www」关联音量图标；`useBrowserTreeData` 已改用 `bookmarkUrlKey`（协议/端口参与），该口径未同步。

## 新增发现

### F1 [severity: medium] [category: 正确性]
- 位置：
  - `adlo/frontend/src/app/features/browser/BrowserNavSearchMode.tsx:72-102`：`bookmarkIdsByKey` 按目录/工作区遍历顺序收集，`searchResults.map` 内按结果顺序 `shift()` 消费。
  - 同文件 `:106-126`：`isBookmarkRow = !isOpenTab && Boolean(bookmarkEntryId)`；`nodeType/isSavedBookmark` 依赖它。
  - 同文件 `:195-215`：`keep` 的 delete/edit 以 `bookmarkId || tabId` 放行。
  - 消费端：`browserEntrySubEntriesUtils.tsx:251-283`（条目级动作）、`useBrowserDialogs.ts:278-293`（按 id 改写书签）。
  - 测试：`src/app/features/browser/__tests__/BrowserNavSearchMode.test.tsx:84-147`。
- 描述：
  1. **位置配对错位**：`bookmarkIdsByKey` 的数组顺序与 `searchResults` 顺序不是同源。搜索结果在「书签」范围按全局索引 `browserBookmarks` 顺序并经查询过滤；条目数组按 `browserBookmarkFolders` 数组 + 各目录 entries + 工作区 entries 顺序。以下任一情况都会把 `bookmarkId` 分配给错误行：
     - 同 URL 有 A/B 两条条目，查询只匹配标题 B → 结果只剩 B，`shift()` 仍从 A 开始，B 行拿到 A 的条目 id；
     - A 在目录 F1、B 在目录 F2，但 F2 先创建、B 先收藏 → 全局索引顺序 B,A，目录遍历顺序 F1(A),F2(B)，两行互换 id；
     - 工作区条目排在目录条目之后，但全局索引按创建时间交错；
     - 编辑 A 的标题后 `browserUpdateSavedBookmark` 把新 tuple 追加到索引末尾（索引 B,A2），目录顺序仍是 A2,B。
     错位后「编辑」会按错条目 id 调 `browserUpdateSavedBookmark`，把另一条条目改名/改 URL；「删除/取消收藏」会删另一条条目。新增测试 `:94-122` 只覆盖「两行都出现、同目录、顺序与结果一致」，把查询过滤成单行或反转结果顺序即可复现；当前没有这样的用例。
  2. **global-only 书签**：`isBookmarkRow` 要求存在目录/工作区条目 id；只存在于 `browserBookmarks` 全局索引的书签（`browserCreateBookmarkEntry` 无 folder/workspace、或索引残留）在搜索结果中 `bookmarkEntryId` 为空 → `isBookmarkRow:false` → `nodeType:'history'`、`isSavedBookmark:false`、无 `bookmarkId`。后果：`getTabContextMenuItems` 的 `open-new`/`open-center` 认为不是书签，把书签快照标题传给新标签（ADR-0017 标题隔离）；行被当成历史；编辑/删除隐藏，只能取消收藏（URL 级）。若同一 URL 另有目录条目，global-only 结果若排在前还会先 `shift()` 掉那条目录条目的 id（目录行反而拿不到 id），把两个问题叠加。rev3 的 `isPureBookmark` 对这些结果是 true，故这是 rev4 的新行为。组件已持有 `browserBookmarks` 却没用于归属。
  3. **同 URL 同标题多条目**：全局索引去重后只有一行，`shift()` 取任意第一条；「各锚定自己」无从谈起，删除只能删任意一条，另一条仍在（同 title tuple 仍被引用）。
  4. **历史范围**：组件不接收 scope/来源类型，收藏优先是全局的；「历史」范围中已收藏 URL 显示为书签行，删除删书签而非历史，历史条目无法从该范围删除。纯历史行仍可删历史/编辑隐藏，未回归。这是「收藏 > 历史」优先级的直接结果，需产品确认是否 scope-aware。
  5. **测试**：新增四条用例在旧行为下会红（历史优先 → 书签优先用例红；first-only → 同 URL 两条目红；编辑隐藏 → 纯书签编辑红；历史键 → 跨端口红），但都没有覆盖上述错位/global-only/delete/refresh/openTab/历史-only。`renderSearch` 的 `browserBookmarks` 固定为三千/五千，同 URL 两条目用例的 A/B 未进全局索引，与生产数据形状不一致；若实现改用 `browserBookmarks` 判断书签身份，该用例会失配。
- 证据：`BrowserNavSearchMode.tsx:75-102`（两个独立顺序）、`:107`（global-only）、`:117-126`（nodeType/isSavedBookmark）；`browserUrlUtils.ts:230`（「全部」合并仍用历史键，导致同 URL 多标题在「全部」只出一条，进一步放大位置配对问题）；新增测试只构造「顺序一致」场景。
- 建议修复：
  - 不要按位置 `shift()`；按 `bookmarkUrlKey(url) + title` 映射条目 id（或让 `searchResults` 携带来源条目 id/来源类型）。同 URL 同标题命中多条时，隐藏 edit/delete 或让用户选择，不能静默取第一条。
  - 判断「是否书签行」用 `isUrlBookmarked(browserBookmarks, result.url)`（组件已有 prop），而不是要求目录/工作区条目 id；`isSavedBookmark`/`open-new`/`open-center` 据此保持标题隔离。无条目 id 时只提供 URL 级动作。
  - 若保留全局「收藏 > 历史」，在报告中明确；否则让 `BrowserNavSearchMode` 接收 `searchScope` 或结果来源类型，历史范围不查书签、书签范围不查历史。
  - 补用例：①同 URL A/B 但查询只命中 B → B 必须拿 B 的 id；②跨目录/工作区且结果顺序反转；③global-only 书签 → `onOpenTabInNewTab` 收到 undefined 标题、取消收藏走 URL 级；④点击「删除」断言 `onRemoveBookmarkTab(bookmarkId)` 且 `onDeleteTab` 未调用；⑤refresh/openTab 优先；⑥历史-only 行删除历史。
- 备注：rev3 已指出「同 URL 多条目」问题；rev4 的队列修复只解决「全部结果按同序出现」的窄场景，未解决过滤/重排/global-only，属部分修复。

### F2 [severity: low] [category: 文档]
- 位置：
  - `docs/root-cause-to-close/2026-11/progress-2026-11-14-233054.md:90`：「仅地址栏星标保留 URL 级」与树/列表/搜索中的活标签、历史行仍 URL 级不符（建议改为「书签行中仅地址栏星标保留 URL 级；活标签/历史行仍 URL 级」）。
  - 同文件 `:217`：「搜索纯收藏行删除空转（预存）」已过期（rev4 条目级删除已接上，global-only 行是隐藏删除而非空转）。
  - 同文件 `:230`：「每条搜索结果锚定自己的条目」是未兑现的保证（见 F1）。
  - `docs/operations/ui-manual/rightpanel/tools/browser.md:169`：音量图标匹配口径仍写「剥离跟踪参数/尾斜杠/www」，未提 `bookmarkUrlKey` 保留协议/端口；与 `useBrowserTreeData` 现状不符。
- 描述：rev3 F2 的两项主修（divider 自相矛盾、`:88` 的 `historyDedupKey` 旧口径）已完成；剩余是同一批旧文案的遗漏与一处过度承诺。它们都在描述当前实现，后续按文档改代码会再次产生口径漂移。
- 建议修复：按上列逐条改；`:230` 改成「按严格 URL + 标题匹配」或等 F1 修复后再恢复保证；`:217` 删除/标注 rev4 已修；ui-manual 补「协议/端口参与身份」。

## 记录不修

- **命名仍混淆（无运行时 bug）**：`onRemoveBookmarkTab(tabId, url)` 实际收到 `bookmarkId`（`browserEntrySubEntriesUtils.tsx:263`、`BrowserNavSearchMode.tsx:33`、`BrowserCategorySection.tsx:32`、`BrowserPanelActionsContext.ts:42`）；`tabId` 同时承载历史条目 id。建议改名 `onRemoveBookmark(bookmarkId,url)`，本轮不改。
- `browserUrlUtils.ts:230` 的「全部」合并键仍用历史键：同 URL 跨端口/多标题书签在「全部」只出一条；P4 `:224` 已记录需产品确认。F1 的位置配对问题会因这一合并进一步放大，但合并键本身按记录不修。
- `useBrowserTreeData:83-84` 把历史条目↔标签匹配也改为 strict 键：http 历史 + https 标签不再关联音量图标/`associatedTabId`；属保留协议/端口的取舍，且无树数据用例。
- 同 URL 同标题多条目、历史范围的书签优先行为，属产品口径；若接受「搜索只能代表一个条目」，需在 UI/文档明说。
- `browserTreeFavicon.test.ts:41` / `BrowserTreeEntryFlatList.test.tsx:60` 的用例名仍写 `(search results)`，实际已是「活标签承载的书签行 + isSavedBookmark」的兼容构造；注释已解释，不影响行为。
- 书签行菜单「取消收藏」与「删除」仍重复同一动作（rev2 记录未处理）；`BrowserTabBar` 文案修复仍无用例；`useBrowserTabs` 的 `handleToggleBookmark*` 仍无消费方。
- 实心星/箭头本轮未改动，rev1/rev2 结论继续成立（用户选定 D 方案与外接尺寸差异）。

## 单测删除性推演（rev4 重点）

| 修复 | 删除修复后变红的断言 | 结论 |
| --- | --- | --- |
| 跨端口条目 id | `BrowserNavSearchMode.test.tsx:85-92`：map 回退历史键会得到 `bm-3000`，期望 `bm-5173` 失败 | 能变红 |
| 同 URL 两条目各锚定 | `:94-122`：回退到 first-only 时第二行仍拿 `bm-dup-1`，期望 `bm-dup-2` 失败 | 能变红（仅顺序一致场景） |
| 书签优先于历史 | `:124-137`：回退历史优先时行变历史，`onRemoveBookmarkTab` 不被调用 → 失败 | 能变红 |
| 纯书签编辑 | `:139-146`：回退无 bookmarkId/edit 裁剪时 `browserContextEdit` 不存在 → 失败 | 能变红 |
| 协议维度 | `browserBookmarkSlice.test.ts:1025-1040`：忽略协议会连 `http` 副本一起删 → 失败 | 能变红 |
| 落目录去重 | `browserTabsSlice.test.ts:103-111`：回退历史键第二条不落目录 → 失败 | 能变红 |
| 查询只命中同 URL 的 B | 无用例；当前代码会拿 A 的 id | **不能变红（缺失且当前是 bug）** |
| global-only 书签标题隔离 | 无用例 | **不能变红** |
| 点击「删除」不关标签 | 无用例；`:124-137` 只点「取消收藏」 | **不能变红** |
| 刷新 / openTab 优先 / 历史-only 行 | 无用例 | **不能变红** |
| 星标/URL 级删除 strict 键 | `useBrowserTabs.test.ts:52-61`、`browserBookmarkSlice.test.ts:1008-1023` | 能变红 |
| 实心星/箭头 | `actions.test.tsx:13-24`、`core.test.tsx:87-98` | 继续有效 |

## 结论

- 需修复项：2（critical 0 / high 0 / medium 1：F1 / low 1：F2）。
- rev3 F1 的「归属优先级」与「条目级动作接线」已关闭，跨端口/协议/落目录用例可红；但「同 URL 多条目各锚定自己」依赖结果顺序与目录顺序一致，查询过滤、跨目录/工作区、编辑重排、同标题重复、global-only 都会错位或误判，新增用例未覆盖，故 F1 仍为 medium。
- rev3 F2 的 divider 与 `:88` 已关闭；`:90/:217/:230` 与 ui-manual 归一化口径仍有过时/过度承诺，故低风险文档项保留（low）。
- `browserUrlUtils` 合并键「记录不修」仍准确；协议-only 反例已补并可红。
