# R1 审查报告 — 书签树菜单/动作接线（rev3 复审）

## 范围

- 快照：`.review-diffs/*-rev3.diff`（base `4484cf75c`，无 commit，工作区全量 63 文件）。
- 需求真源：进度文件事项 2 / 6 / 8 + P4 审查记录（`docs/root-cause-to-close/2026-11/progress-2026-11-14-233054.md:197-225`）。
- 复审对象：`.review-diffs/tree-menus-r1-rev2-report.md` 的 N1/N2；并按提示核查 rev3 期间树相关改动（`useBrowserTreeData` 的 `bookmarkUrlKey` 匹配、`BrowserNavSearchMode` 节点结构、`getTabContextMenuItems` 三模式一致性）。
- 本 scope 文件（rev3 快照）：`BrowserCategorySection.tsx`、`BrowserEntrySubEntries.tsx`、`BrowserTabTree.tsx`、`BrowserTreeEntryMenu.tsx`、`browserEntrySubEntriesUtils.tsx`、`browserTreeEntryUtils.tsx`、`__tests__/BrowserBookmarkRowActions.test.tsx`、`__tests__/BrowserTreeEntryMenu.list.test.tsx`、`BrowserNavigator.tsx` / `.test.tsx`、`BrowserNavTabsMode.tsx` / `BrowserNavListMode.tsx` / `BrowserNavSearchMode.tsx`、`BrowserPanel.tsx`、`BrowserPanelActionsContext.ts`、`BrowserOpenTabFlatListItem.tsx`、`useBrowserFolderCrud.ts` / `.test.ts`、`useBrowserTagActions.ts` / `__tests__/useBrowserTagActions.test.ts`、`icons/*`。
- 交叉核对：`useBrowserTreeData.ts`、`browserTabsSlice.ts` + 其测试、`browserTreeFavicon.ts` + 其测试、`BrowserTreeEntryFlatList.test.tsx`、`browserDisplayUtils.ts`（`bookmarkUrlKey`）、`browserBookmarkSlice.ts`（`removeEntriesMatching`）。
- 未运行测试套件（按简报）；测试有效性用「删掉实现 → 哪些断言变红」的删除性推演。
- 未执行任何 git 命令，未改动源码/配置。

## rev2 问题关闭情况

### N1 [low] 列表模式「在中心显示」落在危险项「删除」之后 → **已关闭**

- 代码：`BrowserTreeEntryMenu.tsx:205-229` 新增 `tabMenuViewItems`：先取共享菜单项，再 `findIndex(item => item.id === 'delete')` 把 `show-in-center` 插入其前（`deleteIndex < 0` 时兜底追加）。渲染侧 `BrowserTreeEntryMenu.tsx:262-283` 只消费该数组。
- 顺序核对（列表模式活标签行）：打开当前位置 → 打开新标签 → 在「中间区」打开 → 刷新 → 编辑 → 复制链接 → 取消收藏 → **在「中间区」显示** → **删除（danger）**。危险项回到末尾。
- 树/list 顺序一致性：树模式叶子菜单仍是 `getTabContextMenuItems` 原样 8 项（无「显示」，`BrowserEntrySubEntries.tsx:262-291`），列表模式 = 同一 8 项 + 插入 1 项；移除项的相对顺序完全一致，唯一差异是设计上列表专有的「显示」。
- 顺序断言可失败：`BrowserTreeEntryMenu.list.test.tsx:138-142` 用 `liveText.indexOf('centerTabShowInCenter') < liveText.indexOf('browserContextDelete')`。删除性推演：
  - 改回 rev2 的「追加到末尾」→ show 索引 > delete 索引，断言变红；
  - 若「显示」整项缺失 → 上一条 `toContain('centerTabShowInCenter')`（`:136`）变红，不会因 `indexOf === -1` 假通过；
  - 若 `delete` 缺失（理论回归）→ `indexOf('browserContextDelete') === -1`，`toBeLessThan(-1)` 变红（fail-safe）。
  标签键无子串歧义（`browserContextDelete` 只在删除项出现一次）。**断言有效。**
- 代码注释同步：`:205-206` 说明「插入危险项之前」，与实现一致。

### N2 [low] 「全部在新标签打开」随共享收集器扩展未记录 → **已关闭（记录），直测缺位已评估**

- 记录：`progress-2026-11-14-233054.md:222` 明确写入「『全部在新标签打开』随共享收集器扩展为包含工作区根目录书签并按 `bookmarkUrlKey` 去重（本文件记录）」。措辞与代码一致：`useBrowserFolderCrud.ts:313-327`（工作区根目录 + 嵌套递归）、`:364-376`（`bookmarkUrlKey` 去重）、`:381-388`（新标签动作）与 `:391-397`（中心动作）共用同一收集器。
- 用例覆盖：
  - 共享收集器由 3 条中心用例覆盖（`useBrowserFolderCrud.test.ts:43-51` 嵌套目录、`:78-96` 工作区去重 + 根目录、`:98-119` 历史日去重），其中「去掉去重 → 变 4 个标签」「去掉根目录递归 → 缺 child.test」都能让用例变红。
  - `handleOpenAllInNewTabs` 本身无直测（wrapper 只是循环 `browserOpenTab`），但逻辑全在共享收集器里，回归风险已由上述用例承担；不单列需修复项（见「记录不修」）。
- 备注：记录位置在 P4 审计段而非事项 6 的「实现」列表；事项 6 仍是 `[ ] 待用户确认`，用户确认时看不到这条既有行为变更。建议在该事项实现列表补一行（可选，非阻断）。

## 回归核查（rev3 树相关改动）

1. **`useBrowserTreeData` 改用 `bookmarkUrlKey`** — 三处：历史叶子↔活标签匹配（`useBrowserTreeData.ts:83-84`）、目录书签↔标签音频保留（`:164`）、工作区书签↔标签音频保留（`:246`）。改动只影响 `isPlayingAudio/isAudioMuted/associatedTabId` 的配对，不再影响节点类型、去重或打开动作；`sourceTabId` 的条目↔标签锚定仍是 id 匹配（`:123-125`、`:208-213`），未受键变更影响。
   - 语义变化：`http://host:3000/x` 与 `https://host:5173/x` 不再互相当作同一地址 → 音量图标不再跨协议/端口串行显示。这与收藏身份（`bookmarkUrlKey`）一致，属预期收紧；代价是「书签存 http、标签已升级 https」时书签行不显示音量图标（纯展示）。
   - 无新回归：空/非法 URL 走 `bookmarkUrlKey` 的 catch 分支返回原串，不会互相误配。
2. **`BrowserNavSearchMode` 节点结构** — 纯收藏行从 `nodeType:'tab'` + `tabId=<entryId>` 改为 `nodeType:'bookmark'` + `bookmarkId=<entryId>` + `tabId=undefined`（`BrowserNavSearchMode.tsx:88-106`）。逐项核对消费方：
   - `getTabContextMenuItems`：条目级「取消收藏/删除」分支现在命中（`:251-268`），搜索行与树/列表语义一致（此前是 URL 级清理 + `browserRemoveBookmark('')` 空转）；`refresh` 依赖 `node.url`、`open-center` 依赖 `node.url`，均不依赖 `tabId` ✓。
   - 搜索菜单 `keep()`：`delete/edit` 改判 `bookmarkId || tabId`（`:173-176`），条目未定位时（无 `bookmarkId`）直接隐藏，不再出现「点了没反应」；`refresh` 改判 `!!node.url`（`:170-172`）✓。
   - `BrowserTreeEntryFlatList`：`onRefreshTab(node.tabId, node.url)` 接受 `undefined` ✓；关闭按钮本模式未接 `onCloseTab` ✓；音量指示读 `associatedTabId ?? tabId`，纯收藏行两者皆空且 `isPlayingAudio` 为 undefined，不渲染 ✓。
   - 条目级删除确实能删到工作区书签：`handleRemoveBookmark(bookmarkId, url)` → `browserRemoveBookmark` → `removeEntriesMatching` 无条件遍历 `browserWorkspaceBookmarks`（`browserBookmarkSlice.ts:380-396`）✓。
3. **`browserTabsSlice` 落目录去重改用 `bookmarkUrlKey`** — `browserTabsSlice.ts:83-90`；`browserTabsSlice.test.ts:102-110` 有 `http://localhost:3000/app` vs `https://localhost:5173/app` 反例（2 条条目），删掉新键回归即变红 ✓。这条影响「新建书签/仅保存并打开」进目录的行为，与收藏身份一致。
4. **`getTabContextMenuItems` 三模式一致性** — 树、列表、搜索现在都从同一函数取项：树 8 项；列表 8 项 +「显示」（活标签行，删除之前）；搜索 8 项按归属裁剪（`open-current` 仅活标签、`refresh` 有 url、`delete/edit` 有 `bookmarkId` 或 `tabId`）。书签行的「取消收藏/删除」三模式语义已统一为条目级（可定位时）；不可定位时搜索降级为 URL 级/隐藏（已记录）。

## 新增发现

### F1 [severity: low] [category: 文档] 搜索行 `nodeType` 由 `'tab'` 改为 `'bookmark'` 后，三处注释/用例说明仍称「仍是 'tab'」，另有一处 keep 注释漏掉 `bookmarkId`

- 位置：
  - `adlo/frontend/src/app/features/browser-tree/browserTreeFavicon.ts:17`
  - `adlo/frontend/src/app/features/browser-tree/__tests__/browserTreeFavicon.test.ts:41-42`
  - `adlo/frontend/src/app/features/browser-tree/__tests__/BrowserTreeEntryFlatList.test.tsx:60-61`
  - `adlo/frontend/src/app/features/browser/BrowserNavSearchMode.tsx:160`
- 描述：rev3 把搜索纯收藏行改为 `nodeType: 'bookmark'`（`BrowserNavSearchMode.tsx:98`），但这几处仍以「生产搜索结果的纯收藏行 nodeType 仍是 'tab'」为前提：
  1. `browserTreeFavicon.ts:17`「`isSavedBookmark` 优先：搜索结果的纯收藏行 `nodeType` 仍是 `'tab'`，但无活标签。」——前提已不成立（`passive` 结论仍正确，因为 `isSavedBookmark` 分支先命中）。
  2. `browserTreeFavicon.test.ts:41-42`用例名「saved-bookmark rows stay passive even when the node type is tab (search results)」+ 注释「BrowserNavSearchMode 的纯收藏结果节点 type 仍是 tab」——该用例本身作为防御性断言仍有价值，但「生产就是这样」的理由已过期。
  3. `BrowserTreeEntryFlatList.test.tsx:60-61`「生产搜索结果的纯收藏行是 nodeType:'tab' + isSavedBookmark:true」——同上（该文件未在本轮改动清单内，注释随生产代码漂移）。
  4. `BrowserNavSearchMode.tsx:160`「按归属裁剪死菜单（R1）：无 tabId 的行仅保留 url/name 级动作」——现在 `bookmarkId` 也会放行 `delete/edit`（`:173-176`），注释与 keep 实现不符。
- 证据：`grep "纯收藏"`/`nodeType 仍` 命中上述位置；`BrowserNavSearchMode.tsx:98-100` 的新节点构造；`browserTreeFavicon.ts:20-21` 的 `passive` 判定（`isSavedBookmark === true` 先命中，故行为未变）。
- 建议修复：把 1/2/3 的措辞改为「搜索结果纯收藏行现在是 `nodeType:'bookmark'`；`isSavedBookmark` 仍优先，保留该防御用例（模拟旧结构/异常结构）」；`BrowserNavSearchMode.tsx:160` 改为「无 `tabId` 且无 `bookmarkId` 的行仅保留 url/name 级动作」。

### F2 [severity: low] [category: 正确性] 搜索模式节点结构与菜单裁剪改动无任何组件级用例

- 位置：`adlo/frontend/src/app/features/browser/BrowserNavSearchMode.tsx:88-106`、`:158-179`
- 描述：本轮把搜索纯收藏行从「`tabId` 指向书签条目 id」改成「`bookmarkId` 锚定 + `nodeType:'bookmark'`」，并据此改了 `keep()` 的 `delete/edit/refresh` 判据。这是用户可见的菜单行为变更（取消收藏从「清全部同 URL」变成「移除该条目」、删除/编辑从空转变成真实写入），但 `BrowserNavSearchMode` 在 `BrowserNavigator.test.tsx:23-25` 里被整体 mock，全仓无其它用例；`grep` 也没有任何测试引用 `bookmarkUrlKey` 或搜索菜单。
- 证据（删除性推演）：把 `bookmarkId: isPureBookmark ? snapshotTabId : undefined` 改回 `undefined`、或把 `nodeType` 改回 `'tab'`、或把 `keep('delete')` 改回 `!!node.tabId`，现有测试均不会变红（`BrowserBookmarkRowActions.test` 覆盖树模式，`BrowserTreeEntryMenu.list.test` 覆盖列表模式，slice 测试覆盖存储层）。
- 建议修复：补一条组件级用例（渲染 `BrowserNavSearchMode`，右键一个纯收藏结果行）：断言 `browserUnbookmark`/`browserContextDelete` 存在且点击后调用 `onRemoveBookmarkTab(<entryId>, url)`；再补一条「条目无法定位（不在任何目录/工作区）」时 `delete/edit` 被裁剪、`无 onRemoveBookmarkTab('', url)` 的断言。若不补，至少在进度记录的「验证」里说明该路径仅由代码走查覆盖。

## 记录不修

- （顺序口径）列表模式「显示」现在位于「取消收藏」之后、「删除」之前，而非 rev1 内联版的第 3 位；菜单分组仍以危险项收尾，符合 rev2 N1 的修复目标，不再调整。
- （无直测）`handleOpenAllInNewTabs` 无独立用例（wrapper 仅循环调用共享收集器，后者有 3 条用例）；若后续要单独改该动作语义，再补用例。
- （语义取舍）搜索纯收藏行无法唯一锚定条目时（条目只在全局索引、不在任何目录/工作区）降级为 URL 级清理/隐藏菜单项；已在 P4 记录。
- （行为收紧）`useBrowserTreeData` 的音量图标配对现在区分协议/端口（与收藏身份一致）：书签存 `http://` 而标签已升级 `https://` 时，书签行不再显示音量图标；纯展示，无数据影响。
- （预存）搜索模式对非活标签行隐藏「在当前标签打开」（`BrowserNavSearchMode.tsx:168-169`），树模式对纯书签行仍提供该动作；既有差异，未在本轮处理。
- （预存）`SectionCallbacks.onOpenInCenter/onOpenAllInCenter` 仍为可选 + `?.` 调用（三处提供方均已接线）；菜单 `icon` 管道仍无生产者；`onCloseTab` 仍未接线；`entryMenuViewItems` 的 `show-in-center`（`BrowserTreeEntryMenu.tsx:192-203`）仍不可达。
- （文档一致性建议）P4 第 217 行「记录不修」仍列「搜索纯收藏行删除空转（预存）」，而第 224 行已通过 `bookmarkId` 锚定修复；建议在第 217 行补「rev3 已修（可定位条目时）」，避免下一轮误判为未修。
- （测试注释）`browserTreeFavicon.test.ts` / `BrowserTreeEntryFlatList.test.tsx` 的「saved-bookmark typed as tab」用例作为防御性断言保留（见 F1 的修复建议只改措辞，不删用例）。

## 结论

- rev2 N1、N2：**2/2 已关闭**（N1 有可失败顺序断言；N2 已记录，共享收集器有用例，新标签动作无直测但逻辑被覆盖）。
- 需修复项：2（critical 0 / high 0 / medium 0 / low 2）。
- 另记录不修 8 条（顺序口径、新标签动作无直测、搜索不可定位时降级、音量图标协议收紧、搜索/树「在当前标签打开」差异、可选回调与 icon 管道、`onCloseTab` 未接线与不可达的 entryMenu 显示项、P4 第 217 行旧记录）。
