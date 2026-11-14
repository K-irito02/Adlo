# R1 rev3 审查报告 — 收藏身份 / 实心星 / 图标

## 范围

- 快照：`.review-diffs/manifest-rev3.md`（base `4484cf75c`，63 文件）；逐文件核对 rev3 全量 diff。
- 逐文件：`browserDisplayUtils.ts`、`browserBookmarkSlice.ts`、`browserBookmarkSlice.test.ts`、`useBrowserTabs.ts`、`useBrowserTabs.test.ts`、`useBookmarkToFolderDialog.ts`、`useBookmarkToFolderDialog.test.tsx`、`CenterBrowserView.tsx`、`CenterBrowserView.test.tsx`、`BrowserTabBar.tsx`、`icons/actions.tsx`、`icons/actions.test.tsx`、`icons/core.tsx`、`icons/core.test.tsx`、`icons/index.ts`。
- 交叉核对（同轮其它 scope，仅作证据）：`BrowserNavSearchMode.tsx` + `BrowserNavSearchMode.test.tsx`、`browserTabsSlice.ts` + 测试、`useBrowserTreeData.ts`、`browserUrlUtils.ts`、`browserTreeFavicon.ts` + 测试、`BrowserTreeEntryFlatList.test.tsx`、`BrowserTreeEntryMenu.tsx`、`browserEntrySubEntriesUtils.tsx`、`useBrowserDialogs.ts`、三篇知识库与进度文件。
- 未跑测试；测试有效性按「删掉修复后哪条断言变红」做删除性推演（见末节）。
- **快照落后（流程提示）**：manifest 生成于 4:43:51，但工作区在 4:50–4:54 又改了 `BrowserNavSearchMode.tsx`、`browserTreeFavicon.ts` 及两处测试注释、进度文件，并新增了 `src/app/features/browser/__tests__/BrowserNavSearchMode.test.tsx`（rev3 快照未收录）。本报告按**工作区源码**核对，并单独标注该用例；归档前应重新生成快照。

## rev2 问题关闭情况

### 1. rev2 F1 medium（`bookmarkUrlKey` 分工未闭合）— 部分关闭

已关闭的部分：

- `BrowserNavSearchMode` 的 `snapshotTabIdByUrl`、`openTab`、`historyEntry` 全部改用 `bookmarkUrlKey`（`BrowserNavSearchMode.tsx:68-91`），纯书签行改为 `nodeType:'bookmark'`、`tabId` 只留给活标签/历史、`bookmarkId` 交给条目 id（`:92-108`）；菜单 `keep` 按 `bookmarkId || tabId` 放行 delete/edit（`:158-180`）。
- `browserTabsSlice.browserOpenTab` 落目录去重改用 `bookmarkUrlKey`（`browserTabsSlice.ts:86-90`），新增跨端口用例 `browserTabsSlice.test.ts:103-111`。
- `useBrowserTreeData` 的书签条目↔标签匹配、音量状态匹配改用 `bookmarkUrlKey`（`:83-84,164,246`）。
- 工作区新增 `BrowserNavSearchMode.test.tsx:74-80`：同 host/path 不同端口的书签行分别锚定 `bm-3000` / `bm-5173`；把 map 回退到 `historyDedupKey` 会拿到 `bm-3000`，用例变红。该用例同时覆盖「纯书签行不出现在当前标签打开」（`:82-89`）。
- 全仓仅剩 `browserUrlUtils.ts:230` 的「全部」搜索合并键仍用 `historyDedupKey`；P4 已按「会改变历史/标签合并范围，需产品确认」记录不修，不重复计为遗漏。

未关闭/新暴露的部分：

- **搜索归属仍让历史压过书签**：`BrowserNavSearchMode.tsx:98` 的 `openTab ? 'tab' : historyEntry ? 'history' : 'bookmark'` 与组件头注释「归属按 已打开 > 收藏 > 历史解析」（`:38-43`）相反。书签范围内（`searchResults` 只含书签）只要该 URL 在历史里出现过，行就被判成 `history`、`bookmarkId` 不赋值；「编辑」被 `keep` 隐藏，「删除」走 `onDeleteTab(historyId, url)` 删历史而不是书签（`getTabContextMenuItems` 的 delete 分支只认 `isSavedBookmark`）。书签通常至少访问过一次，因此 rev3 的「搜索书签条目级编辑/删除」只对**从未访问过**的书签生效。
- **同一 URL 多条书签无法唯一锚定**：`snapshotTabIdByUrl` 以 strict URL 为键、`has` 先到先得（`:72-86`）；「书签」范围下同 URL 不同标题的两条条目会产生两行搜索结果，但两行都拿**第一条**的 `bookmarkId`。此时「编辑」会把第一条改名/改 URL（`browserUpdateSavedBookmark(firstId, {url, title: 当前行标题})`），「删除/取消收藏」会删第一条而不是当前行对应条目。P4 记录的「搜索行无法唯一锚定条目时的降级策略」并未实现成安全降级——代码静默选中第一条并开放编辑/删除，属错目标写操作。
- 测试有效性：`BrowserNavSearchMode.test.tsx` 只覆盖跨端口 **一条**结果 + 空历史；没有覆盖「书签 + 历史」「同 URL 多条目」「openTab/history 严格匹配」「keep 的 delete/edit」。其第二个用例名为「删除不会关闭标签」，但只断言没有「在当前标签打开」，未点击删除、未断言 `onDeleteTab` 不被调用，不能证明标题所述行为（把 `tabId` 改回条目 id 也不会变红）。

### 2. rev2 F2 low（三篇知识库 + 进度旧流程）— 部分关闭

- 三篇知识库均加了「2026-11-15 修订」段；`browser-bookmark-tuple-dedup...` 与 `browser-bookmark-dialog-and-flat-view...` 的修订与当前代码基本相符。
- `divider-strip-dual-host...:22` **自相矛盾**：前半句「不会误删另一宿主的同 URL 副本」，括号里又说「URL 级会清理该 URL 的全部副本」——URL 级动作恰恰会删另一宿主上同 URL 的副本。应改为「不会再因错误的活动标签删另一宿主的**其它**书签；同 URL 副本会随 URL 级动作一并清理」。
- 进度事项 3 仍有两处与最终代码不符：`:88`「`isUrlBookmarked()`（与 `historyDedupKey` 同口径）」——现为 `bookmarkUrlKey`（保留协议/端口）；`:90`「仅地址栏星标保留 URL 级」——树/列表/搜索中的活标签、历史行仍经 `handleBookmarkToggle` 走 `browserRemoveBookmarksForUrl`，URL 级并非只有星标。
- 进度 `:217`「记录不修：搜索纯收藏行删除空转（预存）」已过期：rev3 为有 folder/workspace 条目的纯书签行接上了 `bookmarkId` + delete（仅全局索引独有、无条目的行仍隐藏删除，但不再是空转）。
- 进度 `:228`（tree-menus）称搜索 `nodeType:'tab'` 注释「已按 rev3 结构改写」：代码注释已改（`browserTreeFavicon.ts:17-18`、`BrowserNavSearchMode.tsx:160`），但两处**测试名**仍写着 `(search results)`（`browserTreeFavicon.test.ts:41`、`BrowserTreeEntryFlatList.test.tsx:60`），实为兼容「活标签承载的书签行」，建议改名。
- 进度 `:230`（R1 rev3 段）已写「bookmark-star：rev2 F1 分工闭合与 F2 文档修订均关闭；无新增需修项」——与本报告 F1/F2 结论不符，收尾前需按本报告修正。

## 新发现

### F1 [severity: medium] [category: 正确性]
- 位置：
  - `adlo/frontend/src/app/features/browser/BrowserNavSearchMode.tsx:87-108`（归属：`openTab ? 'tab' : historyEntry ? 'history' : 'bookmark'`；`isPureBookmark = !openTab && !historyEntry`；`bookmarkId` 仅在 `isPureBookmark` 时赋值）
  - 同文件 `:68-86`（`snapshotTabIdByUrl` 以 strict URL 为键、先到先得）
  - 同文件 `:158-180`（`keep` 的 delete/edit 以 `bookmarkId || tabId` 放行）
  - 消费端：`browserEntrySubEntriesUtils.tsx:251-283`（书签行条目级动作）与 `useBrowserDialogs.ts:278-293`（按 id 改写书签条目）
  - 测试：`src/app/features/browser/__tests__/BrowserNavSearchMode.test.tsx:73-89`（只覆盖空历史 + 单结果）
- 描述：搜索面板的书签行仍不能稳定地锚定「当前这一条书签条目」：
  1. **历史优先**：`browserHistory.find(bookmarkUrlKey(h.url) === key)` 无视搜索范围；在「书签」范围里，只要该 URL 历史存在（大多数书签都访问过），纯书签行就被判成 `history`，`bookmarkId` 丢失。结果：书签行的「编辑」消失，「删除」删的是历史条目（书签仍在），「刷新」也只更新历史标题；与组件头注释声明的「已打开 > 收藏 > 历史」相反。
  2. **同 URL 多条目**：`snapshotTabIdByUrl` 只按 URL 索引并取第一条；同 URL 不同标题的两条书签（GLOSSARY 明确允许「同一链接收藏进两个目录 = 两条条目」）在「书签」范围会出两行，但两行共用第一条的 `bookmarkId`。对第二行执行「编辑」会按第一条 id 调 `browserUpdateSavedBookmark`，把第一条改成第二行的 URL/标题；「删除/取消收藏」也会删第一条。其中「编辑」错目标在 rev2 已经存在（当时把 snapshot 条目 id 塞进 `tabId` 供编辑使用），rev3 新接 `bookmarkId` 后把「删除」从空转变为错条目删除，并把「取消收藏」从 URL 级改为「只删第一条」——同 URL 多条目场景下均属错目标。
  3. `onDeleteTab`/`onEditTab` 也以 `node.tabId` 作为历史/标签 id 使用；纯书签行 `tabId` 已置空是正确方向，但历史优先场景仍会把书签行交给历史动作。
- 证据：`BrowserNavSearchMode.tsx:98` 的 `historyEntry` 判断不区分 scope/来源；`useBrowserSearch`/`mergeBrowserSearchResults` 在「全部」范围优先选书签（`browserUrlUtils.ts:228-245`），到搜索行又被改判成历史，二者矛盾。现有 `BrowserNavSearchMode.test.tsx` 使用 `browserHistory={[]}` 且每次只有一条结果，无法覆盖上述两种场景；把 `snapshotTabIdByUrl` 回退到历史键时第一条用例会红，但把归属改成历史优先/多条同 URL 时**没有任何用例会红**。
- 建议修复：
  - 先定归属口径。若按注释「已打开 > 收藏 > 历史」：在判 `historyEntry` 前先查「该 URL + 该标题对应的书签条目」（或让 `BrowserNavSearchMode` 接收 `searchScope`/结果来源 kind，书签范围不查历史），再 `bookmarkId = 该条目 id`；只对确实无条目锚定的行隐藏 edit/delete。
  - 若产品坚持历史优先：把 `BrowserNavSearchMode.tsx:38-43` 注释改成真实优先级，并明确「已访问过的书签在搜索中只能取消收藏，不能编辑/删除」；同时不要让「删除」以历史动作落在书签行上（书签范围应禁用历史归属）。
  - `snapshotTabIdByUrl` 改为按 `bookmarkUrlKey(url)` + `title`（或直接让搜索结果携带来源条目 id）映射；同一 strict URL 命中多条条目时，不要静默取第一条开放编辑/删除——隐藏这两个动作或让用户选择。
  - 补用例：①「书签」范围 + 同 URL 历史存在 → 书签行仍走条目级取消收藏且删除不删历史；②同 URL 两条不同标题书签 → 两行分别命中各自的 `bookmarkId`；③点击「删除」断言 `onRemoveBookmarkTab(bookmarkId)` 且 `onDeleteTab` 未被调用。
- 备注：历史优先部分为预存（rev2 相同），但 rev3 的 `bookmarkId` 接线把「同 URL 多条目」从空转/URL 级变成了错条目写/删，属本轮新风险；P4 的「降级策略」记录不足以覆盖。

### F2 [severity: low] [category: 文档]
- 位置：
  - `docs/knowledge-base/browser/webview-embed/divider-strip-dual-host-2026-10-02.md:22`：修订段自相矛盾（详见上节）。
  - `docs/root-cause-to-close/2026-11/progress-2026-11-14-233054.md:88`（`isUrlBookmarked` 与 `historyDedupKey` 同口径已过时）、`:90`（「仅地址栏星标保留 URL 级」不成立）、`:217`（「搜索纯收藏行删除空转」已过期）、`:230`（「bookmark-star 均关闭；无新增需修项」与本报告不符）。
- 描述：rev2 F2 的知识库/进度回扫只完成了一部分；这些句子都在描述**当前**实现，读者会按错误口径修改代码。P4 的 P5 待办只列了 `docs/operations/ui-manual/`，不覆盖上述文档。
- 建议修复：按上列逐条改写；`divider-strip` 改为「不再依赖活动标签归属，不会误删另一宿主的其它书签；同 URL 副本随 URL 级动作一并清理（用户确认口径）」；进度事项 3 的 `:88/:90` 加 P4 修订或直接更新；`:217` 删除或标注 rev3 已修；`:230` 按本报告更新为「F1 部分关闭、F2 部分关闭」。

## 记录不修

- **命名仍混淆（无运行时 bug）**：`onRemoveBookmarkTab(tabId, url)` 在书签行实际收到 `bookmarkId`（`browserEntrySubEntriesUtils.tsx:263`、`BrowserNavSearchMode.tsx:33`、`BrowserCategorySection.tsx:32`、`BrowserPanelActionsContext.ts:42`）；`snapshotTabIdByUrl` 存的是书签条目 id；`node.tabId` 同时被历史条目 id 复用（`useBrowserDialogs` 内再按历史/标签 id 分流）。行为上 rev3 已把纯书签行的 `tabId` 置空、`bookmarkId` 独立，方向正确；建议后续改名 `onRemoveBookmark(bookmarkId,url)` / `bookmarkEntryIdByUrl`。
- `useBrowserTreeData:83-84` 把**历史条目↔标签**的匹配也改成 strict 键：http 历史 + https 标签（站点升级）不再关联音量图标/`associatedTabId`；属保留协议/端口的取舍，且无测试。若只要求书签条目严格，这段可保留历史键。
- `browserUrlUtils.ts:230` 的「全部」搜索合并仍用历史键：跨端口两条书签在「全部」范围只显示一条；P4 已记录需产品确认，未重复计入。
- `bookmarkUrlKey` 的协议维度没有被独立反例覆盖：所有端口用例都同时改了 scheme + port；若实现退化为「保留端口、忽略协议」，`useBrowserTabs.test.ts:52-61`、`browserBookmarkSlice.test.ts:1008-1023`、`browserTabsSlice.test.ts:103-111`、`BrowserNavSearchMode.test.tsx:74-80` 全部仍会通过。建议补 `http://localhost:5173/app` vs `https://localhost:5173/app`。
- `BrowserNavSearchMode.test.tsx:82-89` 的用例名声称验证「删除不会关闭标签」，实际只断言没有「在当前标签打开」；建议补点击「删除」+ `onDeleteTab` 未调用断言。
- 两处测试名仍写 `(search results)`（`browserTreeFavicon.test.ts:41`、`BrowserTreeEntryFlatList.test.tsx:60`），当前实际覆盖的是「活标签承载的书签行 + isSavedBookmark」；注释已说明，不影响行为，建议改名。
- 书签行菜单同时有「取消收藏」与「删除」，对书签行效果相同（`browserEntrySubEntriesUtils.tsx:251-282`）；rev2 已记录，未处理。
- `BrowserTabBar` 关闭按钮文案修复仍无用例；`useBrowserTabs` 的 `handleToggleBookmark*` 仍无消费方（rev1 记录）。
- 实心星/箭头本轮未改动，rev1/rev2 结论继续成立（用户已选定 D 方案与外接尺寸差异）。

## 单测删除性推演（重点回答「跨端口用例是否真的能变红」）

| 修复 | 删除修复后变红的断言 | 结论 |
| --- | --- | --- |
| `BrowserNavSearchMode` 的 strict snapshot 键 + `bookmarkId` | `BrowserNavSearchMode.test.tsx:74-80`：map 回退历史键会得到 `bm-3000`，`toHaveBeenCalledWith('bm-5173', …)` 失败 | **能变红**（但只在「空历史 + 同一 URL 单条目」场景） |
| 同 URL 多条目各自锚定 | 无用例 | **不能变红** |
| 书签 + 历史时仍走书签条目级动作 | 无用例（新用例 `browserHistory={[]}`） | **不能变红** |
| `openTab`/`historyEntry` 改用 strict 键 | 新用例两个数组都为空，回退历史键也不会失败 | **不能变红** |
| 搜索 `keep` 的 delete/edit 判据 | 无用例（第二个用例只查「在当前标签打开」） | **不能变红** |
| `browserTabsSlice.browserOpenTab` 落目录用 strict 键 | `browserTabsSlice.test.ts:103-111`：回退历史键时第二条同标题条目被跳过，`toHaveLength(2)` 失败 | **能变红** |
| `useBrowserTreeData` 条目↔标签匹配用 strict 键 | 无树数据用例 | **不能变红** |
| 星标/URL 级删除 strict 键（rev2） | `useBrowserTabs.test.ts:52-61`、`browserBookmarkSlice.test.ts:1008-1023` | **能变红**（协议维度未隔离） |
| 实心星单轮廓 / 箭头几何 | `actions.test.tsx:13-24`、`core.test.tsx:87-98` | 继续有效 |

## 结论

- 需修复项：2（critical 0 / high 0 / medium 1：F1 / low 1：F2）。
- rev2 F1 的「键分工」主路径已闭合（搜索 map/归属/keep、落目录、树匹配均改用 `bookmarkUrlKey`，落目录跨端口用例可红）；但搜索行仍存在「历史压过书签」与「同 URL 多条目共用第一条 bookmarkId」两类错目标动作，且现有新用例覆盖不到；`browserUrlUtils` 合并键与协议维度隔离仍需产品/测试确认。
- rev2 F2 的文档修订部分完成：两篇知识库基本准确，`divider-strip` 修订自相矛盾，进度事项 3 仍有两处旧口径、一条过期「记录不修」，且 R1 rev3 段已提前写「bookmark-star 均关闭」。
