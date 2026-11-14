# R1 rev6 定向复核（文档）— 文案 / 窗口化收尾

- 快照：`.review-diffs/manifest-rev6.md`（base `4484cf75c`，66 文件，只看 rev6）
- 上一轮报告：`.review-diffs/copy-clamp-window-r1-rev5-report.md`
- 进度真源：`docs/root-cause-to-close/2026-11/progress-2026-11-14-233054.md`（P4 段 rev5 记录 238-243 行）
- 约束遵守：未运行 `git` 命令、未改源码、未跑测试套件；结论来自 rev6 快照 + 工作区源码比对

## 范围

rev6 在本范围内只有两处变化，其余与 rev5 逐字节一致（SHA256 核对）：

| 文件 | 变化 | 关注点 |
| ---- | ---- | ------ |
| `docs/operations/ui-manual/rightpanel/tools/browser.md` | 音频覆盖范围改写、标签右键菜单表改写 + 新增范围说明 | rev5 E1/E2 |
| `adlo/frontend/src/app/features/browser/BrowserNavSearchMode.tsx`（+ 测试） | 搜索行归属：严格标题匹配不回退、历史行隐藏 refresh/edit（bookmark/tree scope） | 是否与文档冲突 |

未变（与 rev5 同哈希）：`BrowserTreeEntryFlatList.tsx` 及其两个测试、`centerCopyParity.test.ts`、i18n 字典、`treeEntryMenus.ts`、`ContextMenu.tsx`、`CenterTabStrip.tsx`、`TerminalContextMenu.tsx`、`icons/*`、`browserEntrySubEntriesUtils.tsx`、`BrowserTreeEntryMenu.tsx`、`useBrowserTreeData.ts`、`browserTreeEntryUtils.tsx`。

## rev5 问题关闭情况

### E1（low）标签右键菜单表与树模式不符 — **已关闭**

- `browser.md:426-437` 的 8 行表与实现**逐项同序一致**：在当前标签打开、在新标签打开、在「中间区」打开、刷新Logo/标题、编辑、复制链接、**收藏/取消收藏**、删除——对应 `getTabContextMenuItems`（`browserEntrySubEntriesUtils.tsx:195-284`）的 open-current / open-new / open-center / refresh / edit / copy-link / bookmark-toggle / delete。
- 树模式不存在的「在「中间区」显示」已从表内移除；新增说明 `:439`「只出现在**列表模式**的活标签行右键菜单与「已打开标签页」的标签右键菜单（把现有标签移入中心），树模式不显示」，与三处代码一致：
  - 列表模式活标签行：`BrowserTreeEntryMenu.tsx:216-227`（仅 `nodeType === 'tab'` 插入，且 `moveTabToCenter`）；
  - 已打开标签页：`BrowserOpenTabFlatListItem.tsx:121-129`（`moveTabToCenter`）；
  - 树模式：`BrowserEntrySubEntries.tsx:350-359` 原样渲染共享 8 项，无插入。
- 「收藏/取消收藏」行的描述「按 URL 切换收藏状态（书签行恒显示「取消收藏」并只删当前条目）」与实现一致：标签由 `node.isSavedBookmark && node.bookmarkId` / `isBookmarked` 决定（`:251-260`），书签行走 `onRemoveBookmarkTab(bookmarkId)` 只删当前条目、其余走 URL 级 `handleBookmarkToggle`（`:261-267`）。图标列「—」也与实现一致（无 icon）。

### E2（low）音频覆盖范围缺「当日」限定 — **已关闭**

- `browser.md:169` 已改为「**书签/收藏目录中的条目、以及历史目录中当日（与访问日期同一天）的条目**也会与当前打开标签按同一 URL 匹配显示」。
- 与实现一致：历史叶子节点仅在 `entryDateStr === todayStr` 时匹配活标签（`useBrowserTreeData.ts:74-90`）；书签/收藏目录走 `keepAudio`（`:245-253`），无日期限制；匹配键为 `bookmarkUrlKey`（`browserDisplayUtils.ts:276-286`：协议 + 主机含端口 + 去尾斜杠 path + 归一化 query，剥 www/跟踪参数），与文中「协议 + 主机含端口 + 归一化路径/query，剥离跟踪参数/尾斜杠/www」逐项对得上，「不同端口/协议不互相点亮」也成立。

## 新增发现

无。针对本轮指引的两处风险点核对结果：

1. **搜索归属改动**（`BrowserNavSearchMode.tsx` rev6：`takeBookmarkEntry` 标题不匹配不回退、历史行 `keep()` 裁掉 refresh/edit）：文档没有描述搜索结果行的归属规则或搜索行右键菜单（`grep 搜索` 只命中范围切换按钮、输入框与「搜索结果里的收藏行属于被动列表」这类图标占位说明），因此**不构成文档矛盾**；「在「中间区」打开」等共享项在搜索行仍存在（`getTabContextMenuItems` + `keep()` 默认放行），与中心动作小节一致。
2. **历史行菜单改动**：文档的标签右键菜单表明确限定「导航器树中标签（工作区目录/自建目录）」，而树模式历史叶子行确实仍显示刷新/编辑（`getTabContextMenuItems` 未按 nodeType 裁剪，且 `handleRefreshTab` 对历史 id 会走 `browserUpdateHistoryTitle`，刷新有效）；rev6 只裁搜索行——两者口径不同，但文档未对搜索行作承诺，无矛盾（见「记录不修」4）。
3. 真值来源另核：`browserTabsSlice` 的书签条目去重键改 `bookmarkUrlKey`，文档的收藏对话框章节没有「同一 URL 只收藏一次」类断言，无矛盾。

## 记录不修

1. `:439` 的「只出现在…」在**标签菜单语境**下准确；但同文案在入口页快捷站点/端口右键菜单（`BrowserLandingPage.tsx:291-315`）与终端标签菜单（`TerminalContextMenu.tsx:85-90`）也出现。若想字面严格，可加「浏览器导航器的标签菜单中」限定；按本轮验收口径（列表模式 / 已打开标签页）不改。
2. `:169` 的括号「当日（与访问日期同一天）」略绕：实现是历史条目的 `visitedAt` 落在今天，建议改成「当日（`visitedAt` 为今天）」。
3. 「标签悬停按钮」节 `:449` 仍写「三个操作按钮（关闭/刷新/更多）」：`onCloseTab` 在 tabs/list 模式的 callbacks 中从未接线（`BrowserNavTabsMode.tsx:86-106`、`BrowserNavListMode.tsx:51-71`），`getTabHoverButtons` 的关闭条件为 `!!callbacks.onCloseTab && …`（`BrowserEntrySubEntries.tsx:127-129`）→ 树/列表模式实际只有两个按钮；「已打开标签页」模式确有三个（`BrowserOpenTabFlatListItem.tsx`）。属 P4 已记录的「`onCloseTab` 未接线（预存）」，接线时一并校正文档。
4. 树模式历史叶子行仍显示刷新/编辑，搜索模式 rev6 已裁掉：两套口径，建议 tree-menus scope 判定是否对齐（树侧刷新对历史 id 有效，编辑仍可能是空转），文档不改。
5. 目录右键菜单表仍缺「新建书签」行（`browserTreeEntryUtils.tsx:166-176`）：pre-existing，rev5 已记录。
6. 既有取舍无变化：签名 O(n)/碰撞、选中项兜底无上界、窗口化 Ctrl+F、`role="tree"` 混 `role="separator"`、`browserViewMode` 的 `'all'` 死变体、`onlyOpenTabs` 死分支。
7. rev6 之后尚未见全量门禁/预览记录（进度 line 243 写「准备全量门禁 → rev6 快照 → 定向复核」）；本报告为代码级判定。

## 结论

- 需修复项：0（本轮零问题；rev5 的 2 条 low 均已关闭，未发现 rev6 新增文档矛盾）
- 文档与实现在本轮涉及的四个面（导航模式/书签列表窗口化、中心动作、头部计数、标签与目录菜单）逐条一致；剩余差异均为已记录的取舍或措辞精度问题，不改变行为与验收结论。
