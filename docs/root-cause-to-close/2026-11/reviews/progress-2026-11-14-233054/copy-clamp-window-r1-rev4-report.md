# R1 rev4 复审 — 文案 / 菜单钳制 / 窗口化 / UI 手册

- 快照：`.review-diffs/manifest-rev4.md`（base `4484cf75c`，66 文件，只看 rev4）
- 上一轮报告：`.review-diffs/copy-clamp-window-r1-rev3-report.md`
- 进度真源：`docs/root-cause-to-close/2026-11/progress-2026-11-14-233054.md`（P4 段，含 rev3 复审记录 226-231 行）
- 约束遵守：未运行 `git` 命令、未改源码、未跑测试套件；结论来自 rev4 快照 + 工作区源码 + 删除性推演

## 范围

rev4 在本范围内只有 3 处变化（其余与 rev3 快照 SHA256 相同）：

| 文件 | 变化 | 关注点 |
| ---- | ---- | ------ |
| `adlo/frontend/src/app/features/browser-tree/BrowserTreeEntryFlatList.tsx` | 仅注释（签名语义） | rev3 N1′ 修复面 |
| `...__tests__/BrowserTreeEntryFlatList.test.tsx` | 仅注释（搜索行 nodeType 说明） | 顺带核对措辞 |
| `docs/operations/ui-manual/rightpanel/tools/browser.md` | P5 重写导航模式章节 + 头部计数表 + 中心动作 | 本轮新增核对面 |

沿用未变的：`window.test.tsx`、`centerCopyParity.test.ts`、`i18n/{zh-CN,en-US}/{common,browser}.ts`、`treeEntryMenus.ts`、`ContextMenu.tsx`、`CenterTabStrip.tsx`、`TerminalContextMenu.tsx`、`icons/*`（与 rev3 逐字节一致）。UI 手册之外的知识库 3 篇属其他 scope。

## rev3 问题关闭情况

### N1′（low）签名注释绝对断言 — **已关闭**

- 现文本（`BrowserTreeEntryFlatList.tsx:42-52`）：
  - `:42-43` 说明「列表**身份**签名（不含节点对象身份）…目录/模式/搜索词未变时不该把窗口收回首屏」；
  - `:44-45`「成员的增删/换序会重置窗口；同一成员的行内内容（标题/URL/图标）变化不重置（那不是列表身份变化）」；
  - `:46-52` 签名实现（`t:${path}` / `s:${label}`，`\u0000` 分隔）。
- 与实现一致：签名只取 `path` / 分隔符文案，成员增删或换序必然改变拼接结果；`name` / `iconUri` 不参与签名。与两个用例一致：`window.test.tsx:100-123` 换 path → 断言回到 80 行；`:125-147` 只改 `name` → 断言仍是 120 行。两条用例的删除性推演仍然成立（退回 `[flatItems]` 或退回只看长度，必有一条变红）。
- 残余两处（不构成事实错误，见「记录不修」3、4）：`:54` 的效果注释仍是较宽的「列表内容变化（切换目录/切换模式/搜索词变化）」；「URL 变化不重置」对书签行不成立（书签 path 内嵌 URL）。

## 新增发现

### D1 [severity: low] [category: 文档]

- 位置：`docs/operations/ui-manual/rightpanel/tools/browser.md:463`、`:467-473`、`:487-502`
- 描述：rev4 重写后的「导航模式与书签列表」把「已打开标签页」模式描述成一棵分组树，但实现是**扁平的已打开标签列表**：
  1. `:463`「只显示已打开的标签（**按工作区/目录分组**）」——`BrowserNavOpenMode` 只转发给 `BrowserOpenTabFlatList`（`BrowserNavOpenMode.tsx:14-34`），后者对 `panelTabs` 直接 `map` 出一行一个标签（`BrowserOpenTabFlatList.tsx:43-57`），没有工作区/目录分组。
  2. `:471-472`「空目录过滤 / 分隔行过滤」两条特性描述的是旧的「文件树」视图：当前 open 模式没有任何目录行或分隔行，这两条既无法验证也不成立；`:473`「历史分类隐藏」同理（扁平列表里根本没有分类）。
  3. `:487-502` 的自动化示例仍在验证「历史分类不存在 / 每个目录行下至少一个标签」（`.adl-browser-entry__header`、`.adl-browser-entry__tree .adl-filetree__item`）——在扁平模式下这些选择器命中 0 个，循环空转、断言恒真，等于**假通过**的示例。
- 证据：`BrowserNavOpenMode.tsx:24-32`（只有 `BrowserOpenTabFlatList`）；`BrowserOpenTabFlatList.tsx:27`（注释「该列表只承载面板标签」）、`:45-56`（`panelTabs.map`）；`BrowserTabTree.tsx:57/108/120/223` 的 `onlyOpenTabs` 分支**无任何调用方**（全仓仅定义处引用），即旧的「open 模式用树分组」路径已死。文档 `:457-465` 的新表与 `:487` 的旧示例因此互相矛盾。
- 建议修复：`:463` 改为「只显示已打开的面板标签（扁平列表，一行一个标签；不分目录）」；删除「空目录过滤 / 分隔行过滤」两行并把「历史分类隐藏」按扁平列表重述（保留「切换标签不刷新」「新标签页 favicon」「标签加载状态」等仍成立的项）；`:487-502` 的示例改为对 `.adl-filetree__item` 直接计数，并删除目录/子节点断言。

### D2 [severity: low] [category: 文档]

- 位置：`docs/operations/ui-manual/rightpanel/tools/browser.md:306-315`
- 描述：头部计数表与实现不符：
  1. `:308`「计数**随当前 navigatorMode 变化**」与 `:313`「`search` → `searchResults.length`（带 query 时回退到过滤后长度）」——实际渲染的是 `openTabCount = browserTabs.filter(isPanelTab).length`（`useBrowserPanelState.ts:47`），**与模式无关**；`BrowserNavigator.tsx:129-132` 的标题+计数在所有模式下同一处渲染，搜索模式不会改显结果数（搜索区只渲染结果列表与空态，`BrowserNavigator.tsx:391-422` 没有计数）。
  2. `:315`「由 `useBrowserPanel.computeNavigatorCount` 纯函数计算」——该函数在源码里**没有生产消费方**：只有 `features/browser/index.ts:8` 的 barrel 再导出与 `useBrowserPanel.test.ts` 的单测（`useBrowserTabs.ts:12-29` 定义，`_query` 参数未使用，不存在「带 query 回退过滤后长度」的分支）。更早的进度（`progress-2026-11-11-235609.md:44`）也已把 `computeNavigatorCount` 记为「无消费方」。
- 证据：`useBrowserPanelState.ts:46-48`（`openTabCount` 与 `navigatorTitle` 同处定义，后者已统一为 `t.toolBrowser`）；`BrowserNavigator.tsx:129-132`；`useBrowserTabs.ts:22-27`；`features/browser/index.ts:8`；`useBrowserPanel.test.ts:23-49`（唯一调用方）。
- 建议修复：二选一——(a) 按现状改写文档：「计数恒为右侧面板标签数（不含中心标签），与导航模式无关」，并删掉 `computeNavigatorCount` 归属；(b) 若确实要模式感知计数，先把 `computeNavigatorCount` 接回 `useBrowserPanelState` 并补搜索模式的结果数，再保留该表。现状是「文档描述了不存在的接线」，会让验收/自动化按错误预期判定。

## 记录不修

1. 「中心动作」`:484` 只写了「『已打开标签页』中的已打开标签右键菜单」有「在「中间区」显示」；**列表模式**的标签行右键菜单同样有该项（`BrowserTreeEntryMenu.tsx:216-227`，插在「删除」之前）。描述不完整但不算错误，建议下次补一句。
2. `BrowserTreeEntryFlatList.test.tsx:61-62` 注释「保留 `'tab'` 变体…（**向后兼容的构造**）」：这里是测试保留非生产形态以验证 `isSavedBookmark` 优先级，不是产品兼容代码，但「向后兼容」属仓库禁用措辞，建议改为「非生产形态的构造，仅验证 isSavedBookmark 优先」。
3. 注释 `:45`「（标题/URL/图标）变化不重置」：书签行的 path 内嵌 `encodeURIComponent(displayUrl)`（`useBrowserTreeData.ts` 的 `bookmark:${id}::${url}`），改 URL 会换 path → **会**重置。该句只对标签行成立（`tab:${uniqueKey}:${id}` 不含 URL）。属措辞精度问题，不影响行为。
4. `:54` 效果注释「列表内容变化（切换目录/切换模式/搜索词变化）」仍是宽措辞；`切换模式` 实际靠组件重挂，`切换到目录` 也是重挂/成员变化。可随下次顺手收敛，不阻塞。
5. 「书签列表 … 首屏渲染 80 行」：80 是 `flatItems` 条数（含分隔符），所以首屏 `<li>` 行数为 80、其中数据行可能略少。与进度里「80 数据行 + 3 分隔符」的说法不完全一致（进度那句与代码不符），文档本身按行数计是准确的，不改。
6. 既有取舍仍成立：签名 O(n) 拼接成本、裸 `\u0000` 碰撞（失败方向仅「少重置一次」）、选中项兜底无上界、窗口化 Ctrl+F 只见已渲染行、`onCloseTab` 未接线、`role="tree"` 内混 `role="separator"`、`browserViewMode` 的 `'all'` 死变体（另：`onlyOpenTabs` 分支无调用方，见 D1）。
7. 进度 line 231 只写「准备全量门禁 → rev4 快照」，未记录门禁结果与浏览器预览；本报告为代码级判定，D1/D2 的修正也建议顺手在该轮预览里核一眼「已打开标签页」列表形态与头部计数。

## 结论

- 需修复项：2（critical 0 / high 0 / medium 0 / low 2）
  - low：D1（「已打开标签页」被写成分组树 + 空目录/分隔行特性 + 假通过示例）
  - low：D2（头部计数表与 `computeNavigatorCount` 归属与实现不符）
- rev3 的 1 条 low（N1′）已关闭；窗口化实现与两条用例未变，结论继续成立。
- 未发现 rev4 引入的代码回归：本范围唯一代码改动是注释；`centerCopyParity`、i18n 字典、钳制与箭头图标均与 rev3 逐字节一致。
