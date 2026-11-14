# R1 rev7 定向复核（文档）— 收尾核对

- 快照：`.review-diffs/manifest-rev7.md`（base `4484cf75c`，66 文件，只看 rev7）
- 上一轮报告：`.review-diffs/copy-clamp-window-r1-rev6-report.md`（rev6 判零问题）
- 进度真源：`docs/root-cause-to-close/2026-11/progress-2026-11-14-233054.md`（P4 段 rev5/rev6 记录 238-249 行）
- 约束遵守：未运行 `git` 命令、未改源码、未跑测试套件；结论来自 rev7 快照 + 工作区源码比对

## 范围

rev7 在本范围内**没有任何文档改动**，变化只有搜索节点逻辑与其用例、以及进度文件：

| 文件 | rev6 → rev7 | 说明 |
| ---- | ----------- | ---- |
| `docs/operations/ui-manual/rightpanel/tools/browser.md` | **哈希相同**（`413413E1…`） | 与 rev6 逐字节一致；工作区当前内容核过 4 个关键行（`:169` 当日音频、`:426` 共 8 项、`:436` 收藏/取消收藏、`:439` 显示范围），与 rev6 报告一致 |
| `features/browser/BrowserNavSearchMode.tsx` + `__tests__` | 变更（`285D7002…` → `AD331412…`） | `keep('refresh')` 由 `!isHistoryKind && !!url` 改为 `!!url && (!isHistoryKind || !!tabId)`：历史行**有 tabId 时保留刷新**（按历史 id 写回历史标题，与悬停按钮同口径），编辑仍对历史行隐藏 |
| `docs/root-cause-to-close/…progress…md` | 变更 | 记录 rev6 复审结论与 rev7 修复 |

文档所描述的实现文件在 rev7 全部未变（哈希一致）：`browserEntrySubEntriesUtils.tsx`（`getTabContextMenuItems` 8 项）、`BrowserTreeEntryMenu.tsx`、`useBrowserTreeData.ts`、`BrowserTreeEntryFlatList.tsx`、`BrowserOpenTabFlatListItem.tsx`。

## rev6 结论复核

rev6 报告为零发现，本轮无待关闭项；沿用其两条已关闭结论，并在 rev7 快照上重新对了一遍：

- **E1（已关闭）标签右键菜单表**：`browser.md:426-437` 8 行仍与 `getTabContextMenuItems`（`browserEntrySubEntriesUtils.tsx:195-284`）逐项同序一致；`:439` 的「显示仅列表模式活标签行 / 已打开标签页、树模式不显示」仍成立（`BrowserTreeEntryMenu.tsx:216-227`、`BrowserOpenTabFlatListItem.tsx:121-129`、`BrowserEntrySubEntries.tsx:350-359`——三个文件 rev7 未变）。
- **E2（已关闭）音频覆盖范围**：`:169`「书签/收藏目录条目 + 历史目录当日条目」仍与 `useBrowserTreeData.ts:74-90`（`entryDateStr === todayStr`）及 `keepAudio`（`:245-253`）一致；该文件 rev7 未变。

## 本轮核对（rev7 搜索调整是否产生文档矛盾）

- 结论：**无矛盾**。文档全文没有描述搜索结果行的归属规则，也没有描述搜索行的右键菜单（`grep 搜索` 仅命中范围切换按钮、输入框与「搜索结果里的收藏行属于被动列表」的图标占位说明）。rev7 的 `refresh` 调整只影响搜索行菜单的裁剪，不落在任何文档断言上。
- 反向核对：文档 `:483` 的「书签 / 历史 / 标签行右键菜单：在「中间区」打开」仍成立——`open-center` 不在 `keep()` 的裁剪名单里（`BrowserNavSearchMode.tsx:204-221` 的 `default: true`），搜索/树/列表三种入口都保留该项。
- 附带一致性：rev7 让搜索历史行的「刷新」恢复（与悬停按钮、树模式同口径），使文档 `:433` 的「刷新Logo/标题」在树模式下继续成立（树侧 `handleRefreshTab` 对历史 id 走 `browserUpdateHistoryTitle`，该路径 rev7 未变）。

## 新增发现

无。

## 记录不修（沿用 rev6，均不改变行为与验收结论）

1. `:439`「只出现在…」在标签菜单语境下准确；入口页快捷站点/端口菜单与终端标签菜单也有同文案，若要字面严格可加「浏览器导航器的标签菜单中」。
2. `:169`「当日（与访问日期同一天）」括号略绕，可简化为「当日（`visitedAt` 为今天）」。
3. 「标签悬停按钮」节 `:449` 的「三个操作按钮」：`onCloseTab` 在 tabs/list 模式仍未接线（P4 已记录），树/列表实际两个；接线时一并校正。
4. 树模式历史叶子行仍显示「编辑」（搜索模式已对历史行隐藏编辑）：rev7 只对齐了「刷新」，编辑口径差异留在 tree-menus scope，文档未承诺搜索行，不改。
5. 既有取舍不变：签名 O(n)/碰撞、选中项兜底无上界、窗口化 Ctrl+F、`role="tree"` 混 `role="separator"`、`'all'` 死变体、`onlyOpenTabs` 死分支。

## 结论

- 需修复项：0（本轮零问题；rev7 无文档改动，rev6 的 E1/E2 结论继续成立，搜索行 refresh/edit 调整未产生新的文档矛盾）
