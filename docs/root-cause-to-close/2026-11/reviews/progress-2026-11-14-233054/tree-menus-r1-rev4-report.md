# R1 审查报告 — 书签树菜单/动作接线（rev4 复审）

## 范围

- 快照：`.review-diffs/*-rev4.diff`（base `4484cf75c`，无 commit，工作区全量 66 文件）。
- 复审对象：`.review-diffs/tree-menus-r1-rev3-report.md` 的 F1（注释漂移）/ F2（搜索节点结构无用例），并按要求核查 rev4 的 `BrowserNavSearchMode` 归属优先级改动对树/列表菜单一致性与历史行删除语义的影响。
- 本 scope 文件（rev4 快照）：`BrowserCategorySection.tsx`、`BrowserEntrySubEntries.tsx`、`BrowserTabTree.tsx`、`BrowserTreeEntryMenu.tsx`、`browserEntrySubEntriesUtils.tsx`、`browserTreeEntryUtils.tsx`、`__tests__/BrowserBookmarkRowActions.test.tsx`、`__tests__/BrowserTreeEntryMenu.list.test.tsx`、`__tests__/BrowserTreeEntryFlatList.test.tsx`、`BrowserNavigator.tsx` / `.test.tsx`、`BrowserNavTabsMode.tsx` / `BrowserNavListMode.tsx` / `BrowserNavSearchMode.tsx`、`__tests__/BrowserNavSearchMode.test.tsx`（新）、`BrowserPanel.tsx`、`BrowserPanelActionsContext.ts`、`BrowserOpenTabFlatListItem.tsx`、`useBrowserFolderCrud.ts` / `.test.ts`、`useBrowserTagActions.ts` / 其测试、`icons/*`。
- 交叉核对（非本 scope 归属）：`browserTreeFavicon.ts` + 其测试、`useBrowserTreeData.ts`、`useBrowserSearch.ts`、`browserUrlUtils.ts`（`mergeSearchResults`）、`browserTabsSlice.ts`、`browserBookmarkSlice.ts`（`removeEntriesMatching`）。
- 未运行测试套件（按简报）；测试有效性用「删掉实现 → 哪些断言变红」的删除性推演。
- 未执行任何 git 命令，未改动源码/配置。

## rev3 问题关闭情况

### F1 [low] 注释仍称「搜索纯收藏行 nodeType 仍是 'tab'」+ keep 注释漏 bookmarkId → **已关闭**

逐处核对（全部与 rev3 结构一致）：

| 位置 | 现状 | 判定 |
| --- | --- | --- |
| `browserTreeFavicon.ts:17-19` | 改为「搜索/列表里的书签行可能带 `isSavedBookmark`，即使 `nodeType` 不是 `'bookmark'` 也按被动列表处理」 | ✓ 与 `:23-24` 的 `passive` 实现一致，不再声称生产搜索行是 `'tab'` |
| `browserTreeFavicon.test.ts:41-43` | 改为「搜索纯收藏行现为 `nodeType:'bookmark'`；这里保留 `'tab'` 变体，验证被动判定以 `isSavedBookmark` 优先」 | ✓ 防御性用例保留，理由已更新 |
| `BrowserTreeEntryFlatList.test.tsx:60-62` | 改为「生产搜索结果的纯收藏行现为 `nodeType:'bookmark'` + `isSavedBookmark:true`；这里保留 `'tab'` 变体…」 | ✓ 同一口径 |
| `BrowserNavSearchMode.tsx:179` | 改为「无 `tabId` 且无 `bookmarkId` 的行仅保留 url/name 级动作」 | ✓ 与 `:190-198` 的 `keep()`（`delete/edit` 判 `bookmarkId || tabId`）一致 |

残留瑕疵（不影响事实正确性，记「记录不修」）：两个用例的**标题**仍带 `(search results)`；`BrowserTreeEntryFlatList.test.tsx:61` 用「向后兼容的构造」措辞（未发布阶段更宜写「防御性构造」）。

### F2 [low] 搜索节点结构与菜单裁剪无组件级用例 → **已关闭**

- 新增 `adlo/frontend/src/app/features/browser/__tests__/BrowserNavSearchMode.test.tsx`（147 行，4 条用例），逐条对照要求：

| 要求 | 用例 | 删除性推演（删/改实现会红吗） |
| --- | --- | --- |
| 跨端口锚定 | `:91-98`（`http://localhost:3000/app` 与 `https://localhost:5173/app` 各有条目，结果行取 5173） | 把节点键换回 `historyDedupKey` → 两 URL 同键、队列首元素是 bm-3000 → 取消收藏走 URL 级而非 `onRemoveBookmarkTab('bm-5173', …)` → 红 ✓ |
| 同 URL 多条目各自锚定 | `:100-128`（同 URL 两条目 A/B，两行分别取消收藏） | 换回 rev3 的「首个 id 覆盖」→ 两次调用都是 bm-dup-1 → `mock.calls` 不等 → 红 ✓ |
| 书签优先于历史 | `:130-143`（同 URL 既在历史亦被收藏） | 恢复 rev3 的「历史优先」→ 行变历史行，取消收藏走 `handleBookmarkToggle` → `onRemoveBookmarkTab` 断言失败 → 红 ✓ |
| 纯书签行可编辑 | `:145-152` | `keep('edit')` 回退到 `!!node.tabId` → 菜单无「编辑」→ `getByText` 抛错 → 红 ✓ |

- 其余核对：用例从公共入口渲染真实组件（只 mock 回调），断言走菜单点击后的回调参数，不是读内部字段；`TCopyProvider` + key 名定位沿用既有测试写法。
- 未被这批用例覆盖、但属 rev3 已存在实现（rev4 未再改）的点：`openTab`/`historyEntry` 的键查询（测试里 `browserTabs: []`、历史行分支未被命中）。不构成本轮缺口。

## 回归核查（rev4 归属优先级与相关面）

1. **与 `useBrowserSearch` 的优先级是否真一致** — `mergeSearchResults`（`browserUrlUtils.ts:228-245`）在 **「全部」域**按 `已打开 > 收藏 > 历史` 去重，rev4 的节点优先级与之相符 ✓。但该函数对 `bookmarks` / `history` 两个单域**直接返回该源全部条目**（`:222-227`），不参与优先级合并；`BrowserNavSearchMode` 却把「收藏 > 历史」无条件套用（`:99-111`），并用不到组件已声明的 `searchResults[].source`（`:20`）。→ 见新增 F1。
2. **树/列表菜单是否受影响** — 否。三模式仍共用 `getTabContextMenuItems`；树 `BrowserEntrySubEntries.tsx:262-291`、列表 `BrowserTreeEntryMenu.tsx:205-229` 的差异仍只有列表专有的「显示」（插在删除前）。rev4 只改搜索组件内部节点构造与 `keep()`。
3. **历史行删除语义** — 在「全部」域：同一 URL 既打开/收藏又在历史时，行归属为打开/收藏，`删除` 不再删历史，与行来源标签（`source`）一致，属预期修正。「历史」域下出现回归 → 见新增 F1。
4. **跨端口/跨域合并口径** — `mergeSearchResults` 的「全部」域去重仍用 `historyDedupKey`（跨端口合并为一条），与节点侧的 `bookmarkUrlKey` 不一致；这是 P4 已记录的「需产品确认」项，rev4 未改，本次不影响新增用例（用例直接注入 `searchResults`）。
5. **新用例自身健壮性** — 4 条用例之间无 store 依赖（组件只吃 props），无状态串味；`rowOf` 用行文本定位，标题为单字符 A/B 时无子串冲突；第二条用例里点击后菜单关闭、再开另一行，流程正确。

## 新增发现

### F1 [severity: medium] [category: 正确性] 「历史」搜索域下归属被改成书签行：`删除` 删掉书签、历史条目删不掉，且两个菜单项效果重复

- 位置：`adlo/frontend/src/app/features/browser/BrowserNavSearchMode.tsx:99-127`（归属判定）；相关注释 `:41-42`、`:103-105`
- 描述：rev4 把归属优先级定为「已打开 > 收藏 > 历史」并**无条件**应用。`mergeSearchResults` 只在「全部」域做这条合并；在「历史」域它直接返回历史条目（`browserUrlUtils.ts:225-227`）。于是当用户把范围切到「历史」并搜到一个同时被收藏的 URL 时：
  - 行被构造成书签行（`nodeType:'bookmark'`、`bookmarkId=<条目 id>`、`isSavedBookmark:true`）；
  - 「删除」走条目级分支 → `onRemoveBookmarkTab(bookmarkId, url)`，**删掉的是书签**；历史条目仍在，因为 `searchResults` 来自历史域，删除后该行原样留在列表里；
  - 「取消收藏」与「删除」两项落到同一个书签条目，效果重复，「删除历史条目」在该行不可达（只有切到树里的历史目录才能删）。
  rev3 及以前该域下历史优先，`删除` 删的是历史条目 —— 这是本轮引入的行为回归。
- 证据：
  - `mergeSearchResults` 的单域分支不做优先级合并：`browserUrlUtils.ts:219-227`。
  - 组件已拿到 `source`（`BrowserNavSearchMode.tsx:20`）却完全未使用（`grep source` 仅命中类型声明），归属计算只看 `browserTabs` / 目录条目。
  - 删除路径：`browserEntrySubEntriesUtils.tsx:269-283`（`isSavedBookmark → onRemoveBookmarkTab`）。
  - 新增用例只注入 `source: '书签'` 的结果（`BrowserNavSearchMode.test.tsx:55`），没有「历史域 + 同 URL 有书签」的场景，故不覆盖该回归。
- 建议修复：用 `result.source`（或把 `searchScope` 传进来）决定归属，只有来源是收藏时才提升书签优先级；历史来源的行保持 `nodeType:'history'` + `tabId=<历史 id>`。补一条用例：`searchResults:[{source:'历史', url:U}]` + U 同时被收藏 → 断言 `删除` 调用 `onDeleteTab(<h-id>, U)` 且**不**调用 `onRemoveBookmarkTab`。同时把 `:41-42` 的「与 useBrowserSearch 合并优先级一致」限定为「全部域」，`:103-105` 的注释补上来源域前提。

### F2 [severity: medium] [category: 正确性] 同 URL 多条目的 id 分配按目录遍历顺序而非身份匹配，搜索结果顺序不同时会移除另一目录的副本

- 位置：`adlo/frontend/src/app/features/browser/BrowserNavSearchMode.tsx:73-102`
- 描述：`bookmarkIdsByKey` 按「目录数组顺序 → 目录内条目顺序」入队（`:85-98`），结果行按 `searchResults` 顺序 `shift()` 取 id（`:99-102`）。而「书签」域的行顺序来自**全局收藏索引的原序**（`filterBrowserItems(browserBookmarks, query)`，见 `browserUrlUtils.ts:219-223`），与目录数组顺序无关联。两者不一致时，行会锚定到另一目录里同 URL 的条目：
  - 场景：先把 U 收藏进后建的目录 F2（标题 B），再收藏进 F1（标题 A）。全局索引顺序 [B, A]，目录遍历顺序 [F1:A, F2:B] → 队列 [A_id, B_id]；搜到 B 行 → 取到 A_id → 「取消收藏/删除」删掉 F1 的 A 副本，用户点的那一行（B）反而还在。
  - 次要问题：`bookmarkEntryId` 在判断 `isOpenTab` **之前**就被 `shift()` 消费（`:102`），打开中的标签行会白耗一个 id，进一步错位后续同 URL 行。
  - 注释 `:73-74` 声称「保证每条搜索结果行都锚定自己的条目」——当前只保证「取到不同条目」，不保证「取到自己的」。
- 证据：新用例 `BrowserNavSearchMode.test.tsx:100-128` 之所以通过，是因为用例里的目录条目顺序（bm-dup-1 A → bm-dup-2 B）恰好与结果顺序（A、B）一致；把用例的目录条目顺序或结果顺序任一调换，代码不变而期望值就要反过来 —— 说明映射依据是出现顺序。`browserBookmarks` 允许同 URL 不同标题并存（收藏索引按 (url,title) 去重），所以该场景在生产可达；「书签」域不做 URL 去重（`browserUrlUtils.ts:222-223`）。
- 建议修复：把每个 key 的候选改成 `{id,title}[]`，先按 `bookmarkUrlKey(url) + result.title` 精确匹配（命中即移除该候选），无匹配再回退队首；并且只在行最终判为书签行时才消费 id（调整 `:102` 到 `isOpenTab` 判定之后或先算 `isOpenTab`）。补一条「目录顺序与结果顺序相反」的用例（期望仍按标题各自锚定），并把 `:73-74` 的注释改成与实际保证一致。

## 记录不修

- （命名）`browserTreeFavicon.test.ts:41`、`BrowserTreeEntryFlatList.test.tsx:60` 的用例名仍带 `(search results)`，正文注释已说明是保留 `'tab'` 变体的防御性构造；仅命名问题。
- （措辞）`BrowserTreeEntryFlatList.test.tsx:61` 的「向后兼容的构造」在未发布阶段建议改成「防御性构造」，避免被读成兼容代码。
- （预存）「书签」搜索域下若 URL 已在标签中打开，行归属仍是 `tab`（删除=关标签），与「只搜书签」的域语义不一致；rev3 已有，本轮未改。
- （预存）`mergeSearchResults` 的「全部」域去重仍用 `historyDedupKey`（跨端口合并为一条），P4 已记录待产品确认；它使节点侧的严格键在「全部」域对跨端口结果不生效。
- （预存）树/列表/搜索共用菜单的其余差异：搜索对非活标签行隐藏「在当前标签打开」；`SectionCallbacks.onOpenInCenter/onOpenAllInCenter` 仍可选；菜单 `icon` 管道无生产者；`onCloseTab` 未接线；`BrowserTreeEntryMenu.tsx:192-203` 的 entryMenu「显示」不可达。
- （文档）进度 P4 第 217 行仍把「搜索纯收藏行删除空转（预存）」列在记录不修，而第 224 行已修；建议第 217 行补「rev3 已修」，避免下轮误判（rev3 报告已提，仍未处理）。

## 结论

- rev3 F1（注释）/ F2（搜索组件级用例）：**2/2 已关闭**，四处注释与实现一致，新用例四条逐一可失败。
- 需修复项：2（critical 0 / high 0 / medium 2 / low 0）。
- 另记录不修 6 条（用例命名与「向后兼容」措辞、书签域下打开标签归属、`mergeSearchResults` 合并键待产品确认、三模式菜单既有差异项、P4 第 217 行旧记录）。
