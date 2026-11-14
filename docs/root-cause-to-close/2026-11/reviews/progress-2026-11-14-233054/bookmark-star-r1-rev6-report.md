# R1 rev6 定向复核报告 — 收藏星 / 搜索归属

## 范围

- 快照：`.review-diffs/manifest-rev6.md`（base `4484cf75c`，66 文件）；manifest 6:20，目标源码 6:08–6:10，快照与工作区一致。
- 逐文件复核：`BrowserNavSearchMode.tsx`、`BrowserNavSearchMode.test.tsx`、`browserDisplayUtils.ts`、`browserBookmarkSlice.ts` + 测试、`useBrowserTabs.ts` + 测试、`useBookmarkToFolderDialog.ts` + 测试、`CenterBrowserView.tsx` + 测试、`BrowserTabBar.tsx`、`icons/*`、`browserTabsSlice.ts` + 测试、`useBrowserTreeData.ts`、`browserUrlUtils.ts`、三篇知识库、`ui-manual/rightpanel/tools/browser.md`、进度文件。
- 未跑测试；测试有效性按「删掉修复后哪条断言变红」做删除性推演（见末节）。

## rev5 问题关闭情况

### 1. rev5 F1 medium（`takeBookmarkEntry` fallback / global-only 串 id）— 代码已关闭

- `takeBookmarkEntry` 已去掉 `?? unused[0]`（`BrowserNavSearchMode.tsx:103-111`）：只按 `entry.title === title` 选未使用条目，无匹配返回 `undefined`；`usedBookmarkIds` 防止重复使用。
- 注释已同步（`:73-77`）：「标题不匹配时不回退……宁可少一个条目级动作，也不能把 A 条目的 id 塞给 B 行」。
- global-only 代码路径自洽：`sourceIsSaved` 为真时 `isBookmarkRow:true`、`isSavedBookmark:true`、`bookmarkId` 仅在有严格标题匹配的条目时赋值、`tabId` 仅给活标签/历史（`:121-145`）。
- 新增「global-only 不抢同 URL 目录条目 id」用例 `BrowserNavSearchMode.test.tsx:185-213`：同 URL 目录条目标题「官方标题」、global-only 标题「全局标题」；断言无 edit/delete、保留取消收藏。回退到 `unused[0]` 会拿到 `bm-official` 并使 edit/delete 出现，用例变红。**用例可红，修复有效。**
- 历史域、反序、跨端口、纯书签编辑用例继续有效。

**未关闭的仅是测试覆盖（见新增 F1），代码/行为无回归。**

### 2. rev5 F2 low（历史行有活标签时的 edit/refresh）— 已关闭

- `keep` 已改为 `refresh: !isHistoryKind && !!node.url`、`edit: !isHistoryKind && !!(bookmarkId || tabId)`（`BrowserNavSearchMode.tsx:212-217`）；历史行无论是否有同名活标签都不再提供 refresh/edit，只保留 URL 级动作（open-current/open-new/open-center/copy/bookmark-toggle）与删除历史。
- 新增用例 `BrowserNavSearchMode.test.tsx:215-237`：source=history + `browserTabs` 含同 URL，断言无 `browserContextEdit`/`browserRefreshMeta`，保留 `browserContextOpenCurrent`/`browserContextDelete`；回退旧 keep 会红。
- 注释已同步（`:201-203`）：「历史行不做元数据刷新/编辑……只保留 URL 级动作与删除历史」。

### 3. rev5 F3 low（头注释/fallback/keep 注释）— 已关闭

- 头注释改为「归属按搜索结果自身的 `source` 解析（已打开 > 收藏 > 历史的合并优先级由 `mergeSearchResults` 写入）」（`:38-43`），与实现一致。
- fallback 注释（`:73-77`）与 `takeBookmarkEntry` 的严格匹配一致；keep 注释（`:201-203`）与历史行裁剪一致。无残留过度承诺。

### 4. 文档残留（rev5 F2）— 已同步

- 进度 `:90`（地址栏星标 + 搜索/历史行 URL 级、树/列表书签行条目级）、`:217`（global-only 删除无条目可删、取消收藏仍可用）均准确；R1 rev4/rev5 段已补（`:232-243`）。
- `ui-manual:169` 已补 `bookmarkUrlKey`（协议/端口参与）并明确历史只看当日条目；`divider-strip:22` 修订不再自相矛盾。
- 未发现新文档矛盾；R1 rev5 段对 fallback/keep/注释修复的记录与代码一致。

## 新增发现

### F1 [severity: low] [category: 测试]
- 位置/描述：
  1. **global-only 分类未被断言**：`BrowserNavSearchMode.test.tsx:239-258` 只断言「取消收藏」入口、无 delete、无 open-current。一个把 source=saved 的 global-only 判成 `history`（且无 history id）的实现同样满足这些条件（`isUrlBookmarked` 仍给取消收藏）。`isSavedBookmark`/`nodeType:'bookmark'` 的标题隔离副作用（`open-new` 传 `undefined` title）没有断言；当前用例无法为 `isBookmarkRow = ... sourceIsSaved ...` 的回归变红。
  2. **「open 不消耗条目 id」用例只覆盖旧位置 shift**：`:260-285` 第一条 open 行 title Two、第二条 saved 行 title One，条目 One/Two；即使 open 行改为按标题消耗 Two，第二条 One 仍拿 `bm-one`，断言通过。要证明 `sourceIsOpen` 时跳过 `takeBookmarkEntry`，需用同标题/单条目，让「若消耗则 saved 行拿不到 id」。
  3. 同标题同 URL 的真实场景（生产全局索引每个 `(url,title)` 只有一行、目录/工作区可有多条）仍无用例；rev5 的合成「两条相同 searchResults」已移除（不可达），但一行/多条的行为（取第一条、第二条不可达）未定义/未测，属产品口径而非本轮代码缺陷。
  4. bookmark 行「删除」（非取消收藏）仍无用例：当前新用例只点「取消收藏」或断言菜单项存在；`onDeleteTab` 未被调用只在历史域用例中覆盖。refresh 对 bookmark/global-only 行也未直接断言。
- 证据：global-only 用例的断言集合；open 用例的 title 构造；同标题用例已移除。
- 建议修复：①global-only 用例增加 `onOpenTabInNewTab` spy，点击「在新标签打开」断言 `(url, undefined)`（或断言 open-new/open-center 的 title 参数）；②open 不消耗用同标题/单条目；③若要支持同标题一行/多条，定义策略并补用例（否则在进度记录「搜索只能代表一条同标题条目」）；④补 bookmark 行「删除」调用 `onRemoveBookmarkTab` 且 `onDeleteTab` 未调用的断言。

## 记录不修

- 同 URL 同标题多条目（目录/工作区）在搜索里只有一行，`takeBookmarkEntry` 取第一条；第二条无法从搜索编辑/删除。属产品口径，需 UI/文档明说；本轮未改。
- `result.source` 使用本地化展示字符串（`t.browserSavedTabs` 等）分类；同字典下正确，但公开 prop/语言切换旧 memo 可能落入未知来源 fallback。建议后续引入 `sourceKind: 'open'|'saved'|'history'`（设计建议，非本轮阻塞）。
- `onRemoveBookmarkTab(tabId,url)` 实际收到 `bookmarkId`；`node.tabId` 同时承载历史条目 id（沿用 rev3 记录，建议改名）。
- `browserUrlUtils.ts:230` 的「全部」合并键仍用历史键：同 URL 跨端口/多标题书签在「全部」只出一条；P4 `:224` 已记录需产品确认。
- `useBrowserTreeData:83-84` 历史条目↔标签匹配使用 strict 键：http 历史 + https 标签不再关联音量图标/`associatedTabId`；属协议/端口保留的取舍，无树数据用例。
- `browserTreeFavicon.test.ts:41` / `BrowserTreeEntryFlatList.test.tsx:60` 的用例名仍写 `(search results)`，实际是「活标签承载的书签行」兼容构造。
- 书签行「取消收藏」与「删除」仍重复同一动作；`BrowserTabBar` 文案修复仍无用例；`useBrowserTabs` 的 `handleToggleBookmark*` 仍无消费方。
- 实心星/箭头本轮未改动，rev1/rev2 结论继续成立。

## 单测删除性推演（rev6 重点）

| 修复/用例 | 回退后变红的断言 | 结论 |
| --- | --- | --- |
| 严格标题、不回退 | `:185-213`：恢复 `?? unused[0]` → global-only 行拿到 `bm-official`，edit/delete 出现，断言失败 | 能变红 |
| global-only 仍按书签行（isSavedBookmark） | `:239-258`：把 source=saved 判成 history（无 history id）→ 仍是取消收藏、无 delete/open-current，用例**仍通过** | **不能变红（需断言标题隔离）** |
| open 行跳过 takeBookmarkEntry | `:260-285`：让 open 行按标题消耗 Two → 第二行 One 仍拿 `bm-one`，用例通过；只有回退位置 shift 才红 | **不能变红（用例构造不足以证明）** |
| 历史行隐藏 edit/refresh | `:215-237`：回退旧 keep（isLive）→ edit/refresh 出现，断言失败 | 能变红 |
| 历史域仍按历史 | `:162-174` | 能变红 |
| 反序按标题匹配 | `:116-145` | 能变红 |
| 纯书签编辑 | `:176-184` | 能变红 |
| 跨端口 | `:107-114` | 能变红 |
| bookmark 行「删除」 | 无用例（只点取消收藏/断言项存在） | **不能变红** |
| 协议-only / 落目录 / 星标删除 | `browserBookmarkSlice.test.ts:1025-1040`、`browserTabsSlice.test.ts:103-111`、`useBrowserTabs.test.ts:52-61` | 能变红 |
| 实心星/箭头 | `actions.test.tsx:13-24`、`core.test.tsx:87-98` | 继续有效 |

## 结论

- 需修复项：1（critical 0 / high 0 / medium 0 / low 1：F1 测试覆盖）。
- rev5 F1 的 fallback/串 id、F2 的历史行 keep、F3 的注释均已关闭；文档残留也已同步，未发现新的行为或文档问题。
- 唯一残留：global-only 分类（`isSavedBookmark`）与「open 不消耗条目 id」两条用例的断言不足以让对应回归变红；同标题一行/多条与 bookmark 行删除仍缺用例/产品口径。
