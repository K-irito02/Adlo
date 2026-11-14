# R1 rev5 审查报告 — 收藏身份 / 实心星 / 搜索归属

## 范围

- 快照：`.review-diffs/manifest-rev5.md`（base `4484cf75c`，66 文件）。
- 逐文件：`browserDisplayUtils.ts`、`browserBookmarkSlice.ts`、`browserBookmarkSlice.test.ts`、`useBrowserTabs.ts`、`useBrowserTabs.test.ts`、`useBookmarkToFolderDialog.ts`、`useBookmarkToFolderDialog.test.tsx`、`CenterBrowserView.tsx`、`CenterBrowserView.test.tsx`、`BrowserTabBar.tsx`、`icons/actions.tsx`、`icons/actions.test.tsx`、`icons/core.tsx`、`icons/core.test.tsx`、`icons/index.ts`。
- 交叉核对（同轮其它 scope，仅作证据）：`BrowserNavSearchMode.tsx` + `BrowserNavSearchMode.test.tsx`、`browserTabsSlice.ts` + 测试、`useBrowserTreeData.ts`、`browserUrlUtils.ts`、`BrowserTreeEntryFlatList.test.tsx`、`browserTreeFavicon.ts` + 测试、三篇知识库、`ui-manual/rightpanel/tools/browser.md`、进度文件。
- 未跑测试；测试有效性按「删掉修复后哪条断言变红」做删除性推演（见末节）。
- **快照落后提示**：manifest 5:54；`BrowserNavSearchMode.test.tsx` 5:58（当前 275 行，快照 diff 221 行）与 `ui-manual/browser.md` 5:59 在快照后又有改动——工作区已补 global-only 的 browserBookmarks fixture 与「活标签不消耗条目 id」用例。本报告按**工作区源码**核对，并标注这些快照外用例。

## rev4 问题关闭情况

### 1. rev4 F1 medium（搜索条目 id 锚定 / global-only / 测试有效性）— 部分关闭

已关闭的部分：

- 归属已改为按 `result.source`（`t.browserOpenTabs` / `t.browserSavedTabs` / `t.browserHistoryTabs`）判定（`BrowserNavSearchMode.tsx:115-128`）：「历史域」已收藏 URL 仍按历史行处理（删除历史），书签域仍按书签行；不再有 rev4 的全局「收藏压过历史」。
- 同一 URL 多条目改为**标题优先匹配未使用条目**（`takeBookmarkEntry`，`:100-105`），顺序无关；反序用例 `BrowserNavSearchMode.test.tsx:116-145` 回退到位置 `shift()` 会红。
- global-only 的代码路径已按 `sourceIsSaved` 保留书签行（`:111-136`）：无目录条目时 `isBookmarkRow:true`、`isSavedBookmark:true`、`tabId:undefined`、`bookmarkId:undefined`；工作区新 fixture 已把该 URL 放进 `browserBookmarks` 并断言「取消收藏」入口（`:228-247`）。
- 历史域用例 `:162-174`（删除历史、不删书签）在 rev4 行为下会红；新增「活标签行不消耗书签条目 id」用例 `:249-274` 覆盖 source=open 时不 `takeBookmarkEntry`。
- 协议-only 反例、落目录 strict 键、星标/URL 级删除用例仍有效。

未关闭 / 新暴露：

- **标题不匹配时的 fallback 仍会抢条目**：`takeBookmarkEntry` 为 `unused.find(title) ?? unused[0]`（`:104`）。当搜索结果标题与任何目录条目都不同（global-only 标题、索引残留、标题被改）时，会取该 URL 下第一个未使用条目，把别的条目 id 赋给该行。典型：同一 URL 既有 global-only 书签（标题 G）又有目录条目（标题 F，id X）；若 G 的搜索结果排在前面，G 行会拿到 X，之后 F 行无 id → 对 G 行「编辑/删除」实际改写/删除 F。注释「标题也相同才退回该 URL 下第一个未使用条目」（`:73-75`）与代码不符；该 fallback 是 rev4 错位问题的新变体。
- **同标题同 URL 的多条目在真实搜索中只有一行**：全局索引按 `(url,title)` 去重，`useBrowserSearch` 也只产出一行；但目录/工作区可有多条同标题条目。`takeBookmarkEntry` 对一行只取第一个未使用条目，另一条永远无法从搜索编辑/删除。新增用例 `:185-226` 手工传入**两条相同 title/url 的 searchResults**（生产不会出现），只能证明 `usedBookmarkIds` 不重复，不能证明真实的一行/多条场景；该用例对「同标题两条各锚定自己」是合成场景。
- **global-only 用例仍不能证明「书签行」**：fixture 已把 URL 放进 `browserBookmarks`，但断言只有「取消收藏」入口、无 delete、无 open-current。一个被误判为 `history` 且没有 history id 的行同样满足这三条（`isUrlBookmarked` 仍给「取消收藏」）。要证明 `isSavedBookmark/nodeType:'bookmark'`，需断言标题隔离副作用（如点击「在新标签打开」时 `onOpenTabInNewTab(url, undefined)`）或直接检查 `open-new`/`open-center` 的 title 参数；当前用例不能变红。
- **「活标签不消耗条目 id」用例标题大于断言**：第一条 open 行标题 Two、第二条 saved 行标题 One，条目为 One/Two。若 open 行也按标题消耗，会取 Two，第二条 One 仍取 One，断言仍通过；该用例只能抓住 rev4 的**位置** `shift()`，不能证明 source=open 不调用 `takeBookmarkEntry`。要证明需用同标题/单条目，让 open 行若消耗则 saved 行拿不到自己的 id。
- **`source` 使用本地化展示字符串**（`result.source === t.browserSavedTabs`）：当前 panel/search 同一 `useTCopy` 字典，生产可用；但 `searchResults` 是公开 prop，其他调用方或语言切换瞬间的旧 memo 会落入 `bookmarkCandidate` fallback（无来源时按收藏候选处理）。建议改 `sourceKind: 'open'|'saved'|'history'`，不要把展示文案当类型（记录/设计建议）。
- 仍未覆盖：标题不匹配 fallback、真实的一行/同标题多条、global-only 的标题隔离、bookmark 行「删除」（当前用例只点「取消收藏」）、refresh、source=history + 活标签（见 F2）、source=all 的 open 优先。

### 2. rev4 F2 low（文档残留）— 已关闭（列出的文档）

- 进度 `:90` 已改为「地址栏星标与搜索/历史行的取消收藏保留 URL 级；树/列表书签行条目级」——不再写「仅地址栏星标」；与实际一致。
- 进度 `:217` 已改为「仅存在于全局索引、没有目录条目的书签行『删除』无条目可删（预存，取消收藏仍可用）」——准确。
- 进度 R1 rev4 段 `:232-237` 已补；`:236` 记录 source/标题匹配修复与 F2 文档同步。
- `ui-manual:169` 已补 `bookmarkUrlKey`（协议/端口参与）并明确历史只看当日条目；与 `useBrowserTreeData` 一致。
- `divider-strip-dual-host:22` 修订已不再自相矛盾。
- 残留仅“明显但非本轮文档清单”的代码注释/进度措辞（见 F3），不属于 rev4 F2 原条目。

## 新增发现

### F1 [severity: medium] [category: 正确性]
- 位置：
  - `adlo/frontend/src/app/features/browser/BrowserNavSearchMode.tsx:100-105`（`takeBookmarkEntry` 的 `?? unused[0]` fallback）
  - 同文件 `:68-99`（条目表按目录/工作区顺序收集）
  - 同文件 `:111-144`（source → nodeType/isSavedBookmark/bookmarkId/tabId）
  - 测试：`src/app/features/browser/__tests__/BrowserNavSearchMode.test.tsx:185-226`（同标题两条合成）、`:228-247`（global-only 断言不足）、`:249-274`（open 不消耗断言不足）
- 描述：
  1. **无标题匹配时的 fallback 会错配条目**：`takeBookmarkEntry` 找不到同标题条目时退回 `unused[0]`。global-only 标题 + 同 URL 目录条目、或索引/条目标题不同步时，global-only 行会拿到目录条目 id，真正的目录行反而无 id；对前者「编辑/删除」实际作用于后者。应只在标题精确命中时锚定；无命中时保持 `bookmarkId:undefined`（只留 URL 级动作），或让 searchResults 携带来源条目 id。注释 `:73-75` 声称「标题也相同才退回」，与代码不符。
  2. **同标题同 URL 的真实场景仍不可区分**：生产搜索每 `(url,title)` 仅一行，目录/工作区可有多条同标题条目；`takeBookmarkEntry` 取第一个未使用，另一条永远轮不到。用例 `:185-226` 传入两条相同 searchResults，生产不会出现，无法覆盖真实的一行/多条；删除该行只会移除任意一条，另一条仍使索引 tuple 存活（行仍在）。需要产品定义：隐藏 edit/delete、让用户选择，或按来源条目 id 精确锚定。
  3. **global-only 用例的断言不能证明书签行**：fixture 已含 `browserBookmarks` URL，但「取消收藏/无 delete/无 open-current」在 history 行（无 history id）同样成立；`isSavedBookmark`/`nodeType` 没有被断言。一个把 source=saved 的 global-only 判成 history 的实现也能通过。应断言标题隔离（`onOpenTabInNewTab(url, undefined)`）或「编辑/删除」不可见 + 「取消收藏」走 URL 级，才能对 `isSavedBookmark` 变红。
  4. **「open 不消耗条目 id」用例只在位置 shift 下变红**：首行 title Two、次行 title One，条目 One/Two；即使 open 行也按标题消耗 Two，次行 One 仍得到 One，断言通过。要证明 source=open 跳过 `takeBookmarkEntry`，需用同标题/单条目让消耗可观察。
  5. **source 为展示字符串**：`result.source === t.browserSavedTabs` 等；同字典下正确，但公开 prop 的其他来源或语言切换旧 memo 会落入 fallback；建议引入 `sourceKind` 枚举（设计建议，非本轮阻塞）。
  6. 未覆盖：无标题匹配 fallback、真实一行/同标题多条、global-only 标题隔离、bookmark 行「删除」（当前只点「取消收藏」）、refresh、source=history + 活标签（F2）、all 域 open 优先。
- 证据：`takeBookmarkEntry` 的 fallback；全局索引 `(url,title)` 去重 + `useBrowserSearch` 单行；新增用例的构造；global-only 断言只到「无 delete/open-current」。
- 建议修复：
  - 去掉 `?? unused[0]`；标题不匹配时 `bookmarkId:undefined`。若确需兜底，仅在「该 URL 只有一条候选且来源明确为书签」时使用，并写测试。
  - 同 URL 同标题多条目：`takeBookmarkEntry` 命中多条时隐藏 edit/delete 或走选择 UI；不要静默取第一条。
  - 测试：①global-only + 同 URL 另一目录条目（不同标题）→ global-only 行不得拿目录条目 id；②真实一行 + 两条同标题条目 → 定义并断言行为；③global-only 标题隔离（`onOpenTabInNewTab` undefined）；④open 行与 saved 行同标题/单条目 → saved 行拿到唯一条目 id；⑤bookmark 行「删除」→ `onRemoveBookmarkTab` 且 `onDeleteTab` 未调用；⑥refresh/open-source/all-open 优先。
- 备注：rev4 的 `shift()` 顺序问题在「标题不同、都出现在结果中」的场景已修复；上述 1/2 是标题匹配落地的边界，3/4 是回归用例的有效性。

### F2 [severity: low] [category: 正确性]
- 位置：`adlo/frontend/src/app/features/browser/BrowserNavSearchMode.tsx:197`（`isLive = !!node.associatedTabId`）、`:212-215`（`keep` 的 edit）；消费端 `useBrowserDialogs.ts:278-293`
- 描述：source=history 的行现在即使 URL 有活标签也保持 `nodeType:'history'`、`tabId=historyEntry.id`，但 `associatedTabId` 仍指向活标签。`keep('edit')` 用 `isLive = !!associatedTabId` 放行编辑：历史行（有活标签）会显示「编辑」，点击后 `onEditTab(node.tabId)` 传的是**历史条目 id**；`handleEditTabConfirm` 先按 bookmarkId/history id 找书签条目（找不到），再 `browserUpdateTab(historyId)`（无此标签）→ 对话框空转关闭。rev4 的 open 优先会把该行判成 tab 行，编辑的是标签；rev5 的 source=history 让历史行保留下来，但 keep 仍用弱引用 `associatedTabId` 判活，产生这个新的空转入口。
- 证据：`isHistoryKind && !isLive` 才隐藏 edit；source=history + `browserTabs` 含同 URL 时 `isLive=true`；`tabId` 是历史 id；新历史域用例 `:162-174` 的 `browserTabs=[]`，未覆盖。
- 建议修复：edit 只对 `node.nodeType === 'tab'`（或 `node.tabId === node.associatedTabId`）放行；历史行无论是否有活标签都隐藏 edit；`open-current` 可继续用 `associatedTabId`。补 source=history + 活标签的用例，断言无「编辑」、删除仍删历史。
- 备注：仅空转对话框，不改数据，故低。

### F3 [severity: low] [category: 文档]
- 位置/描述：
  - `BrowserNavSearchMode.tsx:41-42` 头注释仍写「归属按 已打开 > 收藏 > 历史解析（与 useBrowserSearch 合并优先级一致）」；现实现按 `result.source` 判定，书签域/历史域各自来源优先（历史域已收藏 URL 仍历史、书签域即使有活标签仍书签），只有 `all` 域的 source 才是该合并优先级。注释应改为「按结果来源；all 域来源由合并优先级生成」。
  - 同文件 `:73-75` 「标题也相同才退回该 URL 下第一个未使用条目」与 `:104` 的 `?? unused[0]`（无标题匹配即退回）不符；按 F1 修代码或改注释。
  - 同文件 `:199-200` 「编辑对纯历史行无写入（对话框空转）」与实际 F2 行为不符（历史行有活标签时编辑可见但空转）；随 F2 修正或补「仅真标签行可编辑」。
  - `docs/root-cause-to-close/...:236` R1 rev4 段写「书签条目 id 按出现顺序排队分配…已随 source/标题匹配修复」；实际标题匹配已落地，但无标题 fallback/同标题真实场景/global-only 测试仍未闭合，建议改为「按来源 + 标题匹配；无标题匹配/同标题多条仍按记录处理」，并补一句 rev5 的 keep/测试边界。
- 描述：rev4 F2 的列出的三处文档已修；上述是 rev5 新代码注释与 R1 rev4 摘要的过度承诺，会让后来人以为无标题/同标题场景也已闭合。
- 建议修复：按上列改注释/进度措辞；不需要改行为的部分与 F1/F2 一起处理。

## 记录不修

- `browserUrlUtils.ts:230` 的「全部」合并键仍用历史键：同 URL 跨端口/多标题书签在「全部」只出一条；P4 `:224` 已记录需产品确认，本轮未改。
- `useBrowserTreeData:83-84` 历史条目↔标签匹配使用 strict 键：http 历史 + https 标签（站点升级）不再关联音量图标/`associatedTabId`；属协议/端口保留的取舍，无树数据用例。
- `onRemoveBookmarkTab(tabId,url)` 实际收到 `bookmarkId`；`node.tabId` 同时承载历史条目 id（沿用 rev3 记录，建议改名）。
- 同 URL 同标题多条目、历史域书签优先的产品口径，仍需 UI/文档明说。
- `browserTreeFavicon.test.ts:41` / `BrowserTreeEntryFlatList.test.tsx:60` 的用例名仍写 `(search results)`，实际是「活标签承载的书签行」兼容构造。
- 书签行「取消收藏」与「删除」仍重复同一动作；`BrowserTabBar` 文案修复仍无用例；`useBrowserTabs` 的 `handleToggleBookmark*` 仍无消费方。
- 实心星/箭头本轮未改动，rev1/rev2 结论继续成立。

## 单测删除性推演（rev5 重点）

| 修复/用例 | 回退后变红的断言 | 结论 |
| --- | --- | --- |
| 历史域仍按历史 | `BrowserNavSearchMode.test.tsx:162-174`：回退 source/改回收藏优先 → 删除走 `onRemoveBookmarkTab`，期望 `onDeleteTab('h-1')` 失败 | 能变红 |
| 反序按标题匹配 | `:116-145`：回退位置 `shift()` → B 拿 `bm-dup-1`，期望 `bm-dup-2` 失败 | 能变红 |
| 同标题两条 | `:185-226`：移除 `usedBookmarkIds` → 第二行仍 `bm-same-1`，失败 | 能变红，但用例是两条相同 searchResults（生产只有一行），不覆盖真实一行/多条 |
| global-only 按书签行 | `:228-247`：把 source=saved 的 global-only 判成 history（无 history id）→ 仍是 `browserUnbookmark`、无 delete/open-current，用例**仍通过** | **不能变红** |
| open 行不消耗条目 | `:249-274`：让 open 行也按标题消耗 Two → 第二行 One 仍得 `bm-one`，用例通过；只有回退位置 shift 才红 | 只覆盖旧 shift，不能证明 source=open 跳过 |
| 无标题匹配 fallback | 无用例；当前代码会拿 `unused[0]` | **不能变红（缺失且是 F1 风险）** |
| 纯书签编辑 | `:176-184`：移除 bookmarkId/edit 放行 → 无编辑项 | 能变红 |
| 跨端口 | `:107-114`：回退历史键 → `bm-3000` | 能变红 |
| 协议-only | `browserBookmarkSlice.test.ts:1025-1040`：忽略协议 → http 副本也被删 | 能变红 |
| 落目录去重 | `browserTabsSlice.test.ts:103-111` | 能变红 |
| 星标/URL 级删除 | `useBrowserTabs.test.ts:52-61`、`browserBookmarkSlice.test.ts:1008-1023` | 能变红 |
| keep edit（history+活标签） | 无用例；当前会显示空转编辑 | **不能变红** |
| 实心星/箭头 | `actions.test.tsx:13-24`、`core.test.tsx:87-98` | 继续有效 |

## 结论

- 需修复项：3（critical 0 / high 0 / medium 1：F1 / low 2：F2、F3）。
- rev4 F1 的 source 归属、历史域、反序标题匹配、global-only 代码路径与 open 行跳过均已落地；剩余是无标题匹配 fallback 抢条目、同标题一行/多条的真实歧义、global-only/open 不消耗两条用例断言不足，以及 source 字符串耦合。
- rev4 F2 列出的文档已同步；新增的代码注释/进度摘要（F3）与 keep 的 `isLive`（F2）仍有与新结构不符之处。
- `browserUrlUtils` 合并键「记录不修」仍准确；协议-only 反例已补并可红。
