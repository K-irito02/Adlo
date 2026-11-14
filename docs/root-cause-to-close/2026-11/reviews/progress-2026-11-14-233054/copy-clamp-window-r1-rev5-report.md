# R1 rev5 复审 — 文档 / 窗口化

- 快照：`.review-diffs/manifest-rev5.md`（base `4484cf75c`，66 文件，只看 rev5）
- 上一轮报告：`.review-diffs/copy-clamp-window-r1-rev4-report.md`
- 进度真源：`docs/root-cause-to-close/2026-11/progress-2026-11-14-233054.md`（P4 段，含 rev4 复审记录 232-237 行）
- 约束遵守：未运行 `git` 命令、未改源码、未跑测试套件；结论来自 rev5 快照 + 工作区源码 + 删除性推演

## 范围

rev5 在本范围内只有 3 处变化（其余与 rev4 快照 SHA256 相同）：

| 文件 | 变化 | 关注点 |
| ---- | ---- | ------ |
| `docs/operations/ui-manual/rightpanel/tools/browser.md` | 模式表/特性表/自动化示例、计数表、标签右键菜单表、目录/历史菜单表、音频覆盖范围 | rev4 两项修复 + 本轮新增核对面 |
| `...__tests__/BrowserTreeEntryFlatList.window.test.tsx` | 首条用例补 `15000ms` 超时（`:92`） | flake 加固，无行为变化 |
| `features/browser/BrowserNavSearchMode.tsx`（+ `__tests__`） | 搜索行归属/条目排队（bookmark scope） | 只核「不影响窗口化」 |

沿用未变的：`BrowserTreeEntryFlatList.tsx`、`centerCopyParity.test.ts`、i18n 字典、`treeEntryMenus.ts`、`ContextMenu.tsx`、`CenterTabStrip.tsx`、`TerminalContextMenu.tsx`、`icons/*`（与 rev4 逐字节一致）。

## rev4 问题关闭情况

### D1（low）「已打开标签页」被写成分组树 — **已关闭**

- 模式表 `:463` 已改为「只显示已打开的标签，**扁平列表（不分组、无分类头）**，历史不出现」；实现是 `BrowserNavOpenMode` → `BrowserOpenTabFlatList`（`panelTabs.map`，`BrowserOpenTabFlatList.tsx:43-57`），无工作区/目录分组。
- 特性表 `:467-478` 已删除「空目录过滤 / 分隔行过滤 / 历史分类隐藏」三行，替换为「扁平列表 | 直接列出已打开标签的行（`.adl-filetree__row`），不渲染工作区/目录分类头」，并保留「切换标签不刷新」等仍成立的项。
- 自动化示例 `:487-497` 重写后三条断言都有意义（不再空转）：
  1. `page.click('[aria-label="已打开标签页"]')` —— 按钮 `aria-label={t.browserOpenTabs}`（`BrowserNavigator.tsx:138`，zh 值「已打开标签页」，`zh-CN/browser.ts:55`）✓；
  2. `.adl-browser-entry__header` 计数 0 —— 该 class 只由树模式的分类头产出（`features/tree/MultiTreeEntryShell.tsx:85`），open 模式无分类头 ✓；
  3. `.adl-filetree__node--directory` 计数 0 —— 树模式展开后的子目录行由 `FileTree`→`TreeRow` 发出该 class（`TreeRow.tsx:41`），open 模式不渲染 `FileTree` ✓（这一条 rev4 时我一度怀疑是空选择器，核对后确认有效）；
  4. `.adl-filetree__row` 首行可见 —— open 模式每行确有该 class（`BrowserOpenTabFlatListItem.tsx:43`）✓。

### D2（low）头部计数表与实现不符 — **已关闭**

- `:308-313` 已改为「统一标题 `t.toolBrowser` + 计数 `openTabCount`」，两条要点：`openTabCount = browserTabs.filter(isPanelTab).length`、**不随 `navigatorMode` 变化**；`computeNavigatorCount` 目前无生产消费方（仅 barrel 导出 + 单测）。
- 与实现一致：`useBrowserPanelState.ts:46-48`（`navigatorTitle = v.t.toolBrowser`、`openTabCount = browserTabs.filter(isPanelTab)`）、`BrowserNavigator.tsx:129-132`（同一处渲染标题+计数，搜索模式不改显结果数）；`computeNavigatorCount` 在源码中只有 `features/browser/index.ts:8` 再导出与 `useBrowserPanel.test.ts` 引用（定义在 `useBrowserTabs.ts:12-29`）。
- 历史变更段（`:313`）同步改写，不再把模式感知计数当既有行为。

## 新增发现

### E1 [severity: low] [category: 文档]

- 位置：`docs/operations/ui-manual/rightpanel/tools/browser.md:426-437`（`:433` 为新增行）
- 描述：`:426` 的「导航器树中标签（工作区目录/自建目录）支持右键菜单，共 8 项操作」表里新增了「在「中间区」显示 | 把该行对应的活标签移动到中心（仅活标签行）」，但**树模式的叶子菜单没有这一项**，且表里漏了实际存在的「收藏 / 取消收藏」：
  - 树模式（`BrowserEntrySubEntries.tsx:350-359`）原样渲染 `getTabContextMenuItems`（`browserEntrySubEntriesUtils.tsx:181-285`），恰好 8 项：在当前标签打开、在新标签打开、在「中间区」打开、刷新、编辑、复制链接、**收藏/取消收藏**、删除——无「显示」。
  - 「在「中间区」显示」只在两处出现：列表模式的活标签行（`BrowserTreeEntryMenu.tsx:216-227`，插在「删除」前 → 该模式共 9 项）；「已打开标签页」的标签菜单（`BrowserOpenTabFlatListItem.tsx:121-129`）。
  - 结果：表的「8 项」数量对、集合错——多一项「显示」、少一项「收藏/取消收藏」。文档同页 `:484` 的中心动作 bullet 3 又把「显示」限定在「已打开标签页」菜单，与本表自相矛盾。
- 证据：`getTabContextMenuItems` 的 `bookmark-toggle` 项（`:251-268`）无条件加入，且函数内不存在 `show-in-center`；`BrowserEntrySubEntries.tsx:350-359` 无后处理；列表模式插入逻辑见 `BrowserTreeEntryMenu.tsx:216-227`；已打开标签页菜单见 `BrowserOpenTabFlatListItem.tsx:121-129`。
- 建议修复：把 `:433` 换成「收藏 / 取消收藏 | 切换该行 URL 的收藏状态（书签行恒为「取消收藏」） | —」；另在表下补一句「列表模式的活标签行额外有「在「中间区」显示」，插在「删除」之前」——顺带补上 rev4 记录「中心动作 bullet 3 未提列表模式」的缺口。

### E2 [severity: low] [category: 文档]

- 位置：`docs/operations/ui-manual/rightpanel/tools/browser.md:169`
- 描述：rev5 修订后的音频覆盖范围写「**历史目录、书签/收藏目录中与当前打开标签同 URL 的条目也显示**」，缺少「当日」限定：历史树只在**当日**条目上匹配活标签（`useBrowserTreeData.ts:74-90` 的 `if (entryDateStr === todayStr)`），昨天/更早的同 URL 历史条目不会显示音量图标；书签/收藏目录无此限制（`keepAudio`，`:245-253`）。按现状验收「在历史目录找同 URL 的旧条目」会得出功能缺失的错误结论。
- 证据：`useBrowserTreeData.ts:74-79`（日期比较后才匹配）、`:85-89`（匹配成功才写入 `isPlayingAudio/associatedTabId`）；`BrowserOpenTabFlatListItem.tsx:52-53` 证明活标签行本身有指示器。
- 建议修复：改为「历史目录中**当日**与当前打开标签同 URL 的条目、以及书签/收藏目录中的同 URL 条目也显示」，或补一句「历史仅当日条目与活标签关联」。

## 记录不修

1. 目录右键菜单表（`:503-513`）缺「新建书签」（`browserTreeEntryUtils.tsx:166-176`，工作区/目录「更多」菜单第一项）：pre-existing 缺行，与本轮新增的「全部在「中间区」打开」无关，建议下次顺手补。
2. 中心动作 bullet 3（`:484`）未提列表模式标签行也有「在「中间区」显示」：rev4 已记录，可在 E1 修复时一并覆盖。
3. 签名/测试注释残余（rev4 记录）：`BrowserTreeEntryFlatList.tsx:45`「（标题/URL/图标）变化不重置」对书签行不成立（书签 path 内嵌 URL）；`BrowserTreeEntryFlatList.test.tsx:61-62` 的「向后兼容的构造」属仓库禁用措辞。
4. 既有取舍仍成立：签名 O(n) 拼接成本、裸 `\u0000` 碰撞（失败方向仅「少重置一次」）、选中项兜底无上界、窗口化 Ctrl+F 只见已渲染行、`onCloseTab` 未接线、`role="tree"` 内混 `role="separator"`、`browserViewMode` 的 `'all'` 死变体、`BrowserTabTree` 的 `onlyOpenTabs` 死分支。
5. 计数段 `:308`「地址栏右侧」为 pre-existing 措辞，本轮未核布局（也不在 rev5 改动行内），不改。
6. 窗口测试 rev5 仅给首条用例补 `15000ms` 超时（`:92`）；窗口化章节与 rev3/rev4 一致（80 行首屏、哨兵追加、选中项兜底），未发现代码回归。
7. 进度 line 237 记「rev4 修复完成，准备全量门禁 → rev5 快照 → 收尾复审」；本报告为代码级判定。

## 结论

- 需修复项：2（critical 0 / high 0 / medium 0 / low 2）
  - low：E1（标签右键菜单表多「在「中间区」显示」、少「收藏/取消收藏」，与树模式实现不符）
  - low：E2（音频覆盖范围缺「当日」限定，历史非当日条目实际不显示）
- rev4 的 2 条 low（D1 扁平列表、D2 计数表）均已关闭，且 D1 的自动化示例重写后三条断言都有效。
- 未发现 rev5 引入的代码回归：窗口化实现/用例与 rev4 等价（仅超时加固），i18n、钳制、箭头图标文件逐字节未变；搜索行归属改动不影响扁平列表的签名与窗口。
