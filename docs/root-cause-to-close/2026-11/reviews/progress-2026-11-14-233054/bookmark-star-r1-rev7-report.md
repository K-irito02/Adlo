# R1 rev7 定向复核报告 — 收藏星 / 搜索归属

## 范围

- 快照：`.review-diffs/manifest-rev7.md`（base `4484cf75c`，66 文件）；manifest 6:35。
- 逐文件复核：`BrowserNavSearchMode.tsx`、`BrowserNavSearchMode.test.tsx`、`useBrowserTagActions.ts`、`useBrowserTreeData.ts`、`browserDisplayUtils.ts`、`browserBookmarkSlice.ts` + 测试、`useBrowserTabs.ts` + 测试、`useBookmarkToFolderDialog.ts` + 测试、`CenterBrowserView.tsx` + 测试、`BrowserTabBar.tsx`、`icons/*`、`browserTabsSlice.ts` + 测试、`browserUrlUtils.ts`、三篇知识库、`ui-manual/rightpanel/tools/browser.md`、进度文件。
- 未跑测试；测试有效性按「删掉修复后哪条断言变红」做删除性推演（见末节）。
- **快照/工作区差异（流程提示）**：`BrowserNavSearchMode.test.tsx` 当前 6:37（296 行）晚于 rev7 manifest 6:35；工作区已把历史行用例名从「不提供…编辑/刷新」改为「不提供…编辑（刷新保留）」。本报告按工作区源码核对；以 rev7 快照归档前需重新生成快照，否则快照内用例名与当前断言相反。

## rev6 问题关闭情况

### 1. rev6 F1 low（测试覆盖：global-only 分类 / open 不消耗 / bookmark 删除）— 已关闭

- **global-only 标题隔离**：`BrowserNavSearchMode.test.tsx:246-268` 现断言 `onOpenTabInNewTab('https://global-only.test/app', undefined)`；若 `isBookmarkRow`/`isSavedBookmark` 回归为 false，会传 `node.name`（`GlobalOnly`），断言变红。global-only 的 `isSavedBookmark:true`/`tabId:undefined` 由 `sourceIsSaved` 路径保证（`BrowserNavSearchMode.tsx:128-145`）。
- **bookmark 行「删除」条目级**：`BrowserNavSearchMode.test.tsx:177-195` 点击「删除」并断言 `onRemoveBookmarkTab('bm-5173', url)`；若删除回退为关闭标签/删历史，断言变红。
- **open 不消耗条目 id**：`:270-295` 现让活标签行与书签行同标题（One），条目 One/Two；若 open 行按标题消耗 bm-one，第二行无条目可锚定、取消收藏不会命中 `bm-one`，断言变红。source=open 跳过 `takeBookmarkEntry`（`BrowserNavSearchMode.tsx:121-124`）得到覆盖。
- 同标题同 URL 的真实一行/多条仍无用例（rev6 已把不可达的合成用例移除）；`takeBookmarkEntry` 对生产的一行取第一条，第二条无法从搜索编辑/删除——属产品口径，见「记录不修」，不是本轮代码缺陷。

### 2. rev6 F2 low（历史行 refresh/edit）— 已复核：恢复 refresh 不算回归，edit 仍隐藏

- rev6 曾把历史行的 refresh/edit 一并隐藏；rev7 恢复 refresh：`keep` 为 `refresh: !!node.url && (!isHistoryKind || !!node.tabId)`，`edit: !isHistoryKind && !!(bookmarkId || tabId)`（`BrowserNavSearchMode.tsx:212-217`）。
- **与历史标题刷新实现一致**：
  - 历史节点的 `tabId` 是历史条目 id（`useBrowserTreeData.ts:102` `tabId: entry.id`）。
  - 菜单 refresh 调 `onRefreshTab(node.tabId, url)`；`handleRefreshTab`（`useBrowserTagActions.ts:67-71`）在 `tab` 找不到时用 `browserHistory.some(h => h.id === tabId)` 判定历史条目并 `browserUpdateHistoryTitle(url,title)`——正是「按历史 id 写回历史标题」。
  - 树/列表/悬停刷新按钮同口径（`BrowserEntrySubEntries` / `BrowserTreeEntryFlatList` 传 `childNode.tabId`），搜索菜单恢复后与它们一致。
- **不算回归**：rev6 隐藏 refresh 是过度修复——refresh 对历史 id 有效；真正空转的是「编辑」（按标签 id 写入、历史 id 找不到），该动作仍隐藏。历史 live 用例 `BrowserNavSearchMode.test.tsx:221-244` 断言无 edit、保留 `browserRefreshMeta`，并保留 open-current/delete；回退到 rev6（隐藏 refresh）或用旧 `isLive` 显示 edit 都会红。
- 注释已同步（`:201-203`）：「历史行不提供『编辑』……但『刷新』仍可按历史 id 写回历史标题」。

### 3. rev6 F3 low（注释/文档残留）— 已关闭

- 头注释已改为「归属按搜索结果自身的 `source` 解析（已打开 > 收藏 > 历史的合并优先级由 `mergeSearchResults` 写入）」（`:38-43`）。
- `takeBookmarkEntry` 注释（`:73-77`）与严格标题匹配一致；keep 注释（`:201-203`）与「仅 edit 隐藏、refresh 保留」一致。
- 进度 `:90/:217`、`ui-manual:169`（`bookmarkUrlKey` 协议/端口 + 历史当日条目）、`divider-strip:22` 均已同步；R1 rev5/rev6 段与当前代码一致，未发现新文档矛盾。

## 新增发现

**本轮零问题。** 代码、注释、文档与新增用例在本次定向复核范围内自洽；无 critical/high/medium/low 需修复项。

## 记录不修

- 同 URL 同标题多条目（目录/工作区）在搜索里只有一行，`takeBookmarkEntry` 取第一条；第二条无法从搜索编辑/删除。属产品口径，需 UI/文档明说；rev6 已移除不可达的合成用例。
- `result.source` 使用本地化展示字符串（`t.browserSavedTabs` 等）分类；同字典下正确，公开 prop/语言切换旧 memo 仍可能落到未知来源（此时有目录条目则按书签、无则按历史）。建议后续引入 `sourceKind` 枚举。
- `onRemoveBookmarkTab(tabId,url)` 实际收到 `bookmarkId`；`node.tabId` 同时承载历史条目 id（建议改名，沿用 rev3 记录）。
- `browserUrlUtils.ts:230` 的「全部」合并键仍用历史键：同 URL 跨端口/多标题书签在「全部」只出一条；P4 `:224` 已记录需产品确认。
- `useBrowserTreeData:83-84` 历史条目↔标签匹配使用 strict 键：http 历史 + https 标签不再关联音量图标/`associatedTabId`；属协议/端口保留的取舍。
- `browserTreeFavicon.test.ts:41` / `BrowserTreeEntryFlatList.test.tsx:60` 的用例名仍写 `(search results)`，实际是「活标签承载的书签行」兼容构造。
- 书签行「取消收藏」与「删除」仍重复同一动作；`BrowserTabBar` 文案修复仍无用例；`useBrowserTabs` 的 `handleToggleBookmark*` 仍无消费方。
- 实心星/箭头本轮未改动，rev1/rev2 结论继续成立。

## 单测删除性推演（rev7 重点）

| 修复/用例 | 回退后变红的断言 | 结论 |
| --- | --- | --- |
| global-only 标题隔离 | `:246-268`：`isSavedBookmark` 回归为 false → `onOpenTabInNewTab(url, 'GlobalOnly')`，期望 undefined 失败 | 能变红 |
| bookmark 行「删除」条目级 | `:177-195`：删除回退为 `onDeleteTab` → `onRemoveBookmarkTab` 不被调用，期望失败 | 能变红 |
| open 不消耗条目 id | `:270-295`：让 open 行按标题消耗 bm-one → 第二行无 id/无「取消收藏」可点，期望 bm-one 失败 | 能变红 |
| 历史行 refresh 保留 | `:221-244`：回退 rev6（隐藏 refresh）→ 无 `browserRefreshMeta`，失败 | 能变红 |
| 历史行 edit 隐藏 | `:221-244`：回退旧 `isLive`/恢复 edit → `browserContextEdit` 出现，失败 | 能变红 |
| 严格标题、不回退 | `:191-219`：恢复 `?? unused[0]` → global-only 行拿到 `bm-official`，edit/delete 出现，失败 | 能变红 |
| 反序标题匹配 | `:117-152` | 能变红 |
| 历史域仍按历史 | `:163-181` | 能变红 |
| 纯书签编辑/删除 | `:177-195` | 能变红 |
| 跨端口 | `:113-120` | 能变红 |
| 同标题真实一行/多条 | 无用例（产品口径） | 不适用 |
| 协议-only / 落目录 / 星标删除 | `browserBookmarkSlice.test.ts:1025-1040`、`browserTabsSlice.test.ts:103-111`、`useBrowserTabs.test.ts:52-61` | 能变红 |
| 实心星/箭头 | `actions.test.tsx:13-24`、`core.test.tsx:87-98` | 继续有效 |

## 结论

- 需修复项：0（本轮零问题）。
- rev6 的唯一 low（global-only 标题隔离 / bookmark 删除 / open 不消耗）已用可红用例关闭；历史行 refresh 恢复与 `handleRefreshTab` 的历史标题写回一致，**不算回归**，edit 仍隐藏；F3 注释与文档残留均已同步。
- 仅余产品口径/设计记录（同标题一行多条、source 字符串分类、命名、browserUrlUtils 合并键等）与 rev7 快照落后（用例名）这一流程提示。
