# R1 审查报告 — 文案 / 菜单钳制 / 列表窗口化（rev1）

- 快照：`.review-diffs/manifest-rev1.md`（base `4484cf75c`，55 文件，只看 rev1）
- 范围来源：`.review-diffs/adlo_frontend_src_app_i18n_*`、`..._regions_CenterTabStrip.tsx`、`..._features_tree_*`、`..._components_ContextMenu.tsx`、`..._features_browser-tree_BrowserTreeEntryFlatList.tsx`、`..._features_terminal_TerminalContextMenu.tsx` 及对应源码
- 约束遵守：未运行 `git diff/log/show`，未改源码，未跑测试套件（仅读源码 + 删除性推演）

## 范围

| # | 文件 | 关注点 |
| - | ---- | ------ |
| 1 | `adlo/frontend/src/app/i18n/{zh-CN,en-US}/{common,browser}.ts` | 书签列表 / 在右侧面板显示 / 在「中间区」显示 / 新增两键 / 中英对齐 |
| 2 | `adlo/frontend/src/app/i18n/__tests__/centerCopyParity.test.ts` | 新键登记与断言强度 |
| 3 | `adlo/frontend/src/app/regions/CenterTabStrip.tsx` | 中心标签「回右侧面板」tooltip + 右下图标的用法与 a11y |
| 4 | `adlo/frontend/src/app/features/tree/treeEntryMenus.ts` | `useClampedMenuPosition` 改为 `useLayoutEffect` + 量测绑定本次坐标 |
| 5 | `adlo/frontend/src/app/features/tree/__tests__/useClampedMenuPosition.test.tsx` | 新回归用例的删除性推演 |
| 6 | `adlo/frontend/src/app/components/ContextMenu.tsx` | 钳制移到 layout 阶段 |
| 7 | `adlo/frontend/src/app/features/browser-tree/BrowserTreeEntryFlatList.tsx` | 80 行窗口 / 哨兵 IO / 重置 / 回退 |
| 8 | `adlo/frontend/src/app/features/browser-tree/__tests__/BrowserTreeEntryFlatList.window.test.tsx` | 窗口用例的删除性推演 |
| 9 | `adlo/frontend/src/app/features/terminal/TerminalContextMenu.tsx` | 左上箭头 + 「显示」语义 |

## 上轮问题关闭情况

### 1. 文案（书签列表 / 在右侧面板显示 / 在「中间区」显示 / 新增两键 / 中英对齐与 fallback）— **已关闭**

- `zh-CN/browser.ts:128` = `书签列表`，`en-US/browser.ts:138` = `Bookmark list`；键名未变，唯一消费点 `BrowserNavigator.tsx:159/164`（tooltip + `aria-label` 同源）已核对。
- `zh-CN/common.ts:138-139` 两键均改为 `在右侧面板显示`，`en-US/common.ts:127-128` = `Show in right panel`；`CenterTabStrip.tsx:566-569` 用它渲染「回右侧面板」的 tooltip **与** `aria-label`（`637/643`），名称恒定、无 `aria-pressed`，符合 a11y 约定。
- `centerTabShowInCenter` = `在「中间区」显示` / `Show in middle area`；新增 `centerTabOpenInCenter`、`centerTabOpenAllInCenter` 中英各一条（`common.ts:140-142` / `129-131`），引用点全部存在：`browserEntrySubEntriesUtils.tsx:97/132/216`、`browserTreeEntryUtils.tsx:185`、`BrowserTreeEntryMenu.tsx:293`、`BrowserOpenTabFlatListItem.tsx:123`、`TerminalContextMenu.tsx:89`。
- 中英键对齐：三处新增键在两本字典同时存在，`keys.test.ts:642-657` 的顶层 key parity 与 `check-i18n-coverage` 覆盖；`centerCopyParity.test.ts:17-18` 补登记。fallback 无需改动（键两侧齐全，`TCopyProvider` 不做逐键回退）。
- `glossary-allow`：三行强制词（`中间区`）原行带 marker（`check-glossary.ts:140` 按行放行），`en-US` 无强制词；全仓 `src` 内 `中间区` 仅出现在这三行 → 合规。
- 遗留：文案本身**没有任何断言钉死**（见 F1）。

### 2. 菜单钳制 `useLayoutEffect` — **已关闭（含边界说明）**

- `treeEntryMenus.ts:52-78`：量测在 `useLayoutEffect`（本次 commit 的 layout 阶段），结果带 `sourceTop/sourceLeft`，`82-88` 只在「量测来源坐标 === 本次坐标」时才复用 → 跨次打开/直接换坐标都不会先画旧位置。
- 无死循环：`setMeasured` 返回 prev 的等值快路径（`69-77`）；effect 依赖 `[position, margin]`，调用方用 `useMemo` 按标量坐标 memo（`BrowserTreeEntryMenu.tsx:74-85`、`BrowserEntrySubEntries.tsx:66-70`），子组件 setState 不会触发父渲染，因此不会反复量测。
- SSR/测试安全：SPA + jsdom，无 SSR 渲染路径；`useLayoutEffect` 在 jsdom 中正常执行（新用例即走该路径）。
- `ContextMenu.tsx:39-59` 同口径修正（原 `useEffect` 是 paint 后纠正）。核对全部调用点后确认：现有调用方都是条件挂载（`{ctx && <ContextMenu .../>}`），`useState(position)` 的旧值不会跨次打开存活；改为 layout 阶段属于加固而非唯一根因，写法正确、无副作用。菜单项数量/高度在打开期不变，`[position]` 依赖不会漏量测。
- 用例删除性推演：把 `treeEntryMenus.ts` 退回 ref 回调旧实现后，`Probe` 的 `rerender(null)` 会以**旧闭包 position（非 null）**执行 detach → `setAdjusted(旧坐标)`，state 仍是上一次的坐标；重开时首帧 `adjusted !== null` → `useClampedMenuPosition.test.tsx:48` 断言失败。**该用例是真回归保护**（去 `sourceTop/sourceLeft` 匹配同样会红）。注：「paint 前」这半边 jsdom 无法断言，仍以进度里的浏览器采样为证据（已记入不修项 8）。

### 3. 列表窗口化 — **部分关闭**（见 F2、F3）

- 首屏 80 行：`FLAT_LIST_PAGE_SIZE = 80`（`BrowserTreeEntryFlatList.tsx:28`），`visibleItems = flatItems.slice(0, visibleCount)`（`:69`）。注意 80 是 **flatItems 条数**（含分隔符），实际数据行会略少于 80；进度里首屏 83 行（80 + 3 分隔符）与此一致。
- 哨兵 IO / 持续加载：`:48-67` 观察尾随 `<li>`，`rootMargin: '300px 0px'`，回调 `+80` 且 `Math.min(…, flatItems.length)` 封顶；每页重建 observer，到底后 `visibleCount >= length` 提前返回，不会空转。
- 无 IO 回退：`:53-56` `typeof IntersectionObserver === 'undefined'` → `setVisibleCount(length)`（全量）。
- 空列表：`flatItems.length === 0` → 无行、无哨兵（沿用既有空态，无新增回归）。
- 分隔符：`flatItems` 内已有 `separator` 项，切片边界可能把分隔符切成末行，下一页到达即接上；仅一帧视觉瑕疵，不阻塞。
- 用例删除性推演：把 `visibleItems.map` 改回 `flatItems.map` → `window.test.tsx:86` 期望 80 实得 200 变红；去掉哨兵 → `:87` 变红；`FLAT_LIST_PAGE_SIZE*2` 断言同时锁住追加步长。**首屏/追加两段是真保护**；重置与无 IO 回退无用例（见 F2）。
- 是否掩盖真实性能问题：窗口化只摊薄首屏（滚动到底仍会挂满全部行，每行仍有 3 个 `TooltipSimple` + favicon 订阅），没有把成本藏进「永远不加载」的假象；树模式仍是全量挂载，属既有范围。可接受。

### 4. 图标 — **已关闭（残留清理见 F4）**

- 中心标签「回右侧面板」按钮：`CenterTabStrip.tsx:645` `IconArrowDownRight size={12} decorative`，`aria-label` 由文本提供，语义（右下 = 回右侧面板）与用户选定一致。
- 终端菜单：`TerminalContextMenu.tsx:85-90` 左上箭头 + `t.centerTabShowInCenter`；动作是 `centerShowTerminalTab`（`useTerminalContextMenu.ts:76-81`，移动已有标签），用「显示」而非「打开」**语义正确**，且保持了该菜单「全图标」风格。
- 几何回归：`core.test.tsx:86-99` 锁死两条 path 的 `d`；`green` 前提是 `IconArrowUpLeft/DownRight` 在 `index.ts:31-32` 导出（已核对）。
- 检查合规：无硬编码文案；`IconArrowDownRight` 的 JSDoc 用词「在右侧面板显示」不触犯 glossary 强制词。

### 5. 单测删除性推演 / 绝对断言 / 预存问题 — 见 F1/F2/F4 与「记录不修」

## 新增发现

### F1 [severity: medium] [category: 正确性（测试有效性）]

- 位置：`adlo/frontend/src/app/i18n/__tests__/centerCopyParity.test.ts:27-34`、`adlo/frontend/src/app/features/browser/BrowserNavigator.test.tsx:33`、`adlo/frontend/src/app/regions/CenterTabStrip.test.tsx`
- 描述：本轮两处用户可见文案修复（`browserViewModeList`、`centerTabShowIn*Panel`/`InCenter`）**没有任何断言钉死**。`centerCopyParity` 只断言 `.length > 0`；`BrowserNavigator.test.tsx` 把 mock 改成 `'Bookmark list'` 但全文没有任何断言引用它；`CenterTabStrip.test.tsx` 不涉及「回右侧面板」的 tooltip/`aria-label`。
- 证据：删除性推演——把 `zh-CN/browser.ts:128` 改回 `'文件列表'`，或把 `zh-CN/common.ts:138-140` 改回旧文案，`centerCopyParity` / `keys.test.ts` 的 parity 与 `check-i18n-coverage` 全部保持绿（它们只查键存在与数量相等）。这正是本仓 `keys.test.ts:208-211`、`:290-295` 已确立的「用户可见文案用 `toBe` 钉死」惯例的反面；也是判断项 4「UI/UX 变更必须有失败用例转绿」的缺口——进度里该两项只有预览 hover 断言，没有测试。
- 建议修复：在 `centerCopyParity.test.ts`（或 `keys.test.ts`）加值断言，例如
  `expect(zhCN.browserViewModeList).toBe('书签列表'); expect(enUS.browserViewModeList).toBe('Bookmark list');`
  `expect(zhCN.centerTabShowInBrowserPanel).toBe('在右侧面板显示'); expect(zhCN.centerTabShowInCenter).toBe('在「中间区」显示');`
  `expect(zhCN.centerTabOpenInCenter).toBe('在「中间区」打开'); expect(zhCN.centerTabOpenAllInCenter).toBe('全部在「中间区」打开');`

### F2 [severity: low] [category: 正确性]

- 位置：`adlo/frontend/src/app/features/browser-tree/BrowserTreeEntryFlatList.tsx:42-45`
- 描述：重置语义与注释不符，且重置时机偏晚：
  1. 注释写「列表数据变化（切换目录/切换模式/搜索词变化）时回到首屏窗口」，实际只按 `[flatItems.length]` 判定——**同长度的数据变化不重置**（例如搜索词换一个但结果数不变、目录内替换一条书签）。
  2. 注释列举的「切换目录/切换模式」本来就由组件重挂解决（`BrowserTreeEntryChildren.tsx:60-74`，模式切换整体换树），effect 真正命中的场景是活数据增删；而这时它会**把已滚动出来的窗口收缩回 80**（滚动位置随之跳变）。
  3. 重置在 `useEffect`（paint 之后）执行，所以数据变化后的第一次提交仍按**旧的较大 `visibleCount`** 渲染（用户滚到 600 行时新增一条书签 → 先整段重渲染一帧再收回 80 行），恰好是一次被窗口化想避免的全量渲染。
- 证据：`BrowserTreeEntryFlatList.tsx:39`（初始 80）、`:43-45`（`[flatItems.length]` + 被动 effect）、`:69`（slice 用 visibleCount）。`window.test.tsx` 没有「数据变化后回到一页」的用例，删掉该 effect 也不会变红。
- 建议修复：以数据身份而非长度判定（例如把 `flatItems` 或其首/末项 path 组成的 key 传入，或由调用方给列表加 `key`）；重置改到渲染期派生（「比较上一次 key 的 state 模式」）或 `useLayoutEffect`，避免多画一帧；注释按实际行为降级为「数据条数变化时回到首屏窗口」，并补一条重置用例。

### F3 [severity: low] [category: 正确性（a11y / 可见性）]

- 位置：`adlo/frontend/src/app/features/browser-tree/BrowserTreeEntryFlatList.tsx:69`、`:131`、`:155-160`、`:221-228`
- 描述：窗口化只把前 N 项放进 DOM，带来两个可感知缺口：
  1. **选中项可能整体消失**：`selectedTreePath` 是跨模式共享并持久化的状态（`useBrowserNavigatorState.ts:32`、`BrowserNavigator.tsx:267/308`）。在树模式选中第 200 条后切到「书签列表」，前 80 项里没有它，`isTabSelected` 永不命中，也没有「把选中项纳入窗口 / 滚动到选中项」的逻辑（该目录内无任何 `scrollIntoView`）→ 用户看不到任何选中反馈。
  2. **AT / 页内查找看不到后续条目**：`role="tree"` 下只暴露部分 `treeitem`，没有 `aria-setsize`/`aria-posinset`；哨兵是 `aria-hidden="true"`，也没有「加载更多」的可访问状态。屏幕阅读器与 Ctrl+F 只知道前 80 条。
- 证据：`visibleItems = flatItems.slice(0, visibleCount)`；行的选中类只在被渲染项上计算；哨兵 `aria-hidden`；全目录 grep 无 `scrollIntoView`/`aria-setsize`。
- 建议修复：`visibleCount` 至少覆盖选中项下标（`Math.max(visibleCount, selectedIndex + 1)`）并可选 scroll-into-view；给 `li[role=treeitem]` 补 `aria-setsize`/`aria-posinset`，哨兵改为可访问的「正在加载更多」或省略。

### F4 [severity: low] [category: 文档 / 死代码]

- 位置：`docs/operations/ui-manual/rightpanel/tools/browser.md:269`、`:461`；`adlo/frontend/src/app/features/browser/BrowserNavSearchMode.tsx:101`；`adlo/frontend/src/app/icons/actions.tsx:273` + `adlo/frontend/src/app/icons/index.ts:103`
- 描述：本轮替换动作留下的三处残留：
  1. 操作手册仍把该模式称为「文件列表」（`:269`「『文件列表』模式下『新建目录』按钮…」，`:461`「三视图模式（文件树/文件列表/全列表）」）。按钮的 tooltip/`aria-label` 现在是「书签列表」；且 `browserViewModeTree`/`browserViewModeAll` 在源码里已无任何引用，`:461` 描述的「三视图」本身也过期了。`check:repo` 只校验选择器存在，抓不到这类文案漂移。
  2. `BrowserNavSearchMode.tsx:101` 注释仍写「与文件列表收藏行一致」，而同文件 `:20` 已改为「书签列表」——同一轮改名只改了一处。
  3. `IconMoveToCenter` 在本轮失去最后两个消费方（`CenterTabStrip.tsx` 与 `BrowserOpenTabFlatListItem.tsx` 都换成新箭头）后成为**零消费方的导出**（仅 `index.ts:103` 再导出，`actions.tsx:267-280` 的 JSDoc 还写着「请统一 import 此组件」），属未发布阶段应删的死代码；`check-dead-code` 只检查**新增** barrel，抓不到。
- 证据：全仓 `grep "IconMoveToCenter"` 仅命中 `icons/actions.tsx`、`icons/index.ts` 与 2026-10 的历史进度文档；`browserViewModeTree|browserViewModeAll` 仅存在于两本字典。
- 建议修复：`:269` 改为「『书签列表』模式」并按实际重写 `:461`（或直接删掉已不存在的三视图描述）；`:101` 注释改「与书签列表收藏行一致」；删除 `IconMoveToCenter` 及其 barrel 导出行（或确认未来复用点并在注释写明保留理由）。

## 记录不修

1. 「书签列表」实际还包含历史记录：list 模式同时渲染 workspace/folder/history 三个分类（`BrowserTabTree.tsx:223-236`），扁平项由 `buildFlatTabItems` 摊平。文案为近似命名，但事项 1 已由用户确认「书签列表」，记为已知取舍。
2. 入口页快捷站点/端口的菜单项用「在「中间区」显示」但动作是 `openUrlInCenter` 新建标签（`BrowserLandingPage.tsx:181-196/291-315`），与树行的「在「中间区」打开」不同源。事项 7 明确要求「同步浏览器/终端/入口页所有引用」，属用户指定文案，不改；若后续统一，建议入口页改用 `centerTabOpenInCenter`。
3. `centerTabShowInBrowserPanel` 与 `centerTabShowInTerminalPanel` 文案完全相同（两条 key 同值）：进度已说明「键保留，避免牵动引用」，属有意保留，不合并。
4. `TerminalContextMenu` 没有视口钳制（`position: fixed; left: contextMenu.x`），底部右键会溢出视口，与浏览器侧菜单不同口径：预存问题，本轮未触碰，建议后续复用 `useClampedMenuPosition`。
5. `ContextMenu` 与两个树菜单都没有 `max-height` + 内部滚动，菜单高于视口时仍会超出（钳制只能把顶部推到 8px）：预存问题。
6. `role="tree"` 的行没有方向键导航/`tabIndex` 漫游（只有内部按钮可 Tab）：预存问题；F3 只覆盖窗口化新增的那一层。
7. `browserViewModeTree` / `browserViewModeAll` 两个 i18n key 已无消费方（预存死键，`check-dead-code` 只查新增键），与 F4-1 的 `:461` 过期描述同源，可一并清理。
8. `useClampedMenuPosition` 的「paint 前」这半边没有自动化证据：jsdom 无 paint 阶段，只能靠进度里 30 帧单位置的浏览器采样；不要求补测试，但下一轮若改动该 hook 需重跑同类采样。

## 结论

- 需修复项：4（critical 0 / high 0 / medium 1 / low 3）
- 说明：核心修复（文案落地与中英对齐、`useLayoutEffect` 钳制 + 坐标绑定、80 行窗口 + 哨兵追加、箭头图标）经源码逐条核对成立；本轮剩余问题集中在「文案没有断言锁定」「窗口重置的判定键与时机」「窗口化带来的选中项/AT 可见性」「改名与换图标留下的旧称/死导出」。
