# R1 rev3 复审 — 文案 / 菜单钳制 / 列表窗口化

- 快照：`.review-diffs/manifest-rev3.md`（base `4484cf75c`，63 文件，只看 rev3）
- 进度真源：`docs/root-cause-to-close/2026-11/progress-2026-11-14-233054.md`（P4 段 197-225 行）
- 上一轮报告：`.review-diffs/copy-clamp-window-r1-rev2-report.md`
- 约束遵守：未运行 `git` 命令、未改源码、未跑测试套件；结论来自 rev3 快照 + 工作区源码 + 删除性推演

## 范围

rev3 在本范围内只有 4 个文件实际变化（其余与 rev2 快照 SHA256 相同，结论沿用）：

| 文件 | 变化 | 结论 |
| ---- | ---- | ---- |
| `features/browser-tree/BrowserTreeEntryFlatList.tsx` | 重置键由 `[flatItems]` 改为「路径/分隔符签名」+ `useLayoutEffect` | rev2 N1 修复面 |
| `...__tests__/BrowserTreeEntryFlatList.window.test.tsx` | 新增「内容相同的重建不重置窗口」用例 | 配合 N1 |
| `i18n/__tests__/centerCopyParity.test.ts` | 补 en 两条面板文案断言 | rev2 N2 修复面 |
| `features/browser/BrowserNavSearchMode.tsx` | 书签身份键统一（bookmark 作用域）+ 注释 | 只核注释与「不影响窗口化」 |

沿用未变的：`i18n/{zh-CN,en-US}/{common,browser}.ts`、`features/tree/treeEntryMenus.ts`、`features/tree/__tests__/useClampedMenuPosition.test.tsx`、`components/ContextMenu.tsx`、`regions/CenterTabStrip.tsx`、`features/terminal/TerminalContextMenu.tsx`、`icons/{actions,core,index}.ts(x)`（与 rev2 逐字节一致）。

顺带核到（非本范围改动但对窗口有影响）：`useBrowserTreeData.ts` rev3 只把匹配键换成 `bookmarkUrlKey` 并补 `iconUri`，**节点 path 未变**——这是签名方案能生效的前提，见下。

## rev2 问题关闭情况

### N1（medium）窗口重置从 `[flatItems]` 改为「路径/分隔符签名」— **已关闭**

- 实现：`BrowserTreeEntryFlatList.tsx:42-57`
  - `listSignature = flatItems.map(item => item.type === 'tab' ? \`t:${item.node.path}\` : \`s:${item.label}\`).join('\u0000')`（`:45-51`，`useMemo` 依赖 `[flatItems]`）
  - `useLayoutEffect(() => setVisibleCount(FLAT_LIST_PAGE_SIZE), [listSignature])`（`:55-57`）
- 是否真正解决「元数据刷新整棵重建就收回 80 行」：**是**。重建链路 `useBrowserTreeCache`（`metaVersion`/`browserTabs` 依赖）→ 新的节点对象 → `BrowserTreeEntryChildren` 的 `flatItems` 新数组（`BrowserTreeEntryChildren.tsx:43-46`）→ 身份变、**path 不变** → 签名字符串值相等 → `useLayoutEffect` 依赖按值比较不触发 → 窗口保持。rev3 的 `useBrowserTreeData` 只改匹配键与 `iconUri`，未触碰 `path` 构造（`bookmark:${id}::…` / `tab:${uniqueKey}:${id}` / `history-entry:${id}` / `search:${index}:${url}`），前提成立。
- 两个用例都能失败（删除性推演，两条方向互补）：
  - `window.test.tsx:125-147`「内容相同的重建（元数据刷新）不重置窗口」：先追加到 120 行，再用**同 path、仅 `name` 变化**的新数组 rerender，断言仍是 120 行。退回 rev2 的 `[flatItems]` 依赖 → layout effect 触发 → 变 80 行 → **`toHaveLength(120)` 变红**。这是 rev2 N1 的定点回归保护。
  - `window.test.tsx:100-123`「同长度的数据变化也重置回一页」：path 全部替换（`replaced:${index}`）→ 签名变化 → 断言 80 行。若把签名退化成只看长度（rev1 行为）→ 仍是 120 行 → **`toHaveLength(80)` 变红**。
  - 结论：两个用例合起来把「内容变→重置」「身份变但内容不变→不重置」两侧都钉住，缺一不可。
- 签名计算成本：O(n) 映射 + 拼接，每次 `flatItems` 身份变化（即每次树重建；站点元数据更新时高频）各算一次；311 条 × ~100 字符 ≈ 30KB 瞬时字符串，与同文件已有的 `tabItems` filter（`:82-86`）和 `positionByPath` Map（`:87-90`）同阶。当前数据规模（用户书签 311 条、历史按分类上限 100）可接受；若未来出现上万条，可改为与上一次的 path 数组逐项比较（ref）以避免整串分配——属可选优化，见「记录不修」1。
- 签名碰撞风险：要碰撞必须让某个 `path` 或分隔符文案里出现**裸 `\u0000`**。path 由 id 与 `encodeURIComponent(url)` 组成（NUL 会被编码成 `%00`），分隔符文案来自工作区/目录名的文本输入。实际不可达；即便发生，后果是「少重置一次」（窗口偏大、多渲染几行），因为 `visibleItems` 始终从索引 0 切片，不会渲染错行或错位。
- 残余：注释把语义说成了「只在实际列表内容变化时重置」（见 N1′）。

### N2（low）en 面板文案断言 — **已关闭**

- `centerCopyParity.test.ts:46-47` 补 `expect(enUS.centerTabShowInBrowserPanel).toBe('Show in right panel')` 与 `TerminalPanel` 同值断言；与字典实际值一致（`en-US/common.ts:127-128`）。
- 删除性推演：把 en 改回 `Show in browser panel` / `Show in terminal panel` → 该用例变红。zh 侧 `:38-39` 已有同款断言，两侧现已对称。

## 新增发现

### N1′ [severity: low] [category: 文档（注释与实现不符）]

- 位置：`adlo/frontend/src/app/features/browser-tree/BrowserTreeEntryFlatList.tsx:44`（另 `:53` 同类措辞）
- 描述：注释写「用路径/分隔符文案拼接签名，**只在实际列表内容变化时**重置」，但签名只覆盖「成员 + 顺序 + 分隔符文案」；**行内容**（`name` / `url` / `iconUri`）变化而 path 不变时不会重置。反例随手可得：标签行 path 为 `tab:${uniqueKey}:${id}` 不含 URL，标签在新地址导航后该行 url/name 都变了、签名不变、窗口不重置（这本身是期望行为，只是注释把它说成了「内容变化即重置」）。属于简报 §5.8 的「绝对断言必须能被证明」，应降级措辞。
- 证据：`:45-51` 签名只取 `node.path` 与 `item.label`；`:91` 的窗口切片与行渲染字段（`name`/`url`/favicon）无关；`useBrowserTreeData.ts` 的 path 构造不含标题/图标。
- 建议修复：`:44` 改为「只在列表成员或顺序变化时重置（标题/图标/URL 更新不重置）」，`:53` 的「列表内容变化（切换目录/切换模式/搜索词变化）」建议同步为「成员或顺序变化（切换目录/搜索词变化等）」，避免把「模式切换」（实际靠组件重挂）也归因于该签名。

## 记录不修

1. 签名 O(n) 字符串拼接：每次树重建都整串重算。当前规模可接受（书签 311、历史按分类上限 100）；若列表增长到上千，可改为与上次 path 数组逐项比较（`useRef`）避免分配。纯优化，不影响行为。
2. 签名碰撞的理论面：需裸 `\u0000` 进入 path/分隔符；失败方向是「少重置一次」，不会渲染错行。
3. 选中项兜底无上界（rev2 已记录）：`effectiveVisibleCount = max(visibleCount, selectedIndex + 1)`（`:93-94`）未改动；可达性仍受「选中只由点击已渲染行写入、点外部/失焦即清空」限制（`useBrowserNavigatorState.ts:48-84`），故仍记为取舍项。
4. 窗口化 Ctrl+F/AT 只看已渲染行：P4 line 217 已作为固有取舍记录，`aria-setsize/posinset` 已补（`:187-188`）。
5. `onCloseTab` 未接线（P4 line 217 已记录）：`BrowserNavTabsMode/BrowserNavListMode/BrowserNavSearchMode` 都不传 `onCloseTab`，`BrowserTreeEntryFlatList` 的关闭按钮分支（`onCloseTab ? [...] : []`）恒不渲染，因此列表行没有「可见但点了没反应」的死按钮；`handleCloseClick` 目前是死代码，随接线或删除一并处理。
6. `<ul role="tree">` 内混入 `<li role="separator">`（ARIA 1.2 的 tree 只允许 treeitem/group）：预存结构。
7. `browserViewMode?: 'tree' | 'list' | 'all'` 的 `'all'` 分支已无调用方（`BrowserTreeEntry.tsx:63-64`），字典键已删：预存死变体。
8. rev3 之后尚未跑最终门禁与浏览器预览（P4 line 225 只写到「准备 rev3 快照」），本报告是代码级判定；建议闭环时补一次「滚动到底 + 触发一次站点元数据刷新」的采样，为 N1 的视觉证据留档。
9. 签名对 `name`/`url`/`iconUri` 变化不重置是**有意且正确**的设计（行内容变化不需要重置窗口），只需按 N1′ 修正注释措辞。

## 结论

- 需修复项：1（critical 0 / high 0 / medium 0 / low 1）
  - low：N1′（注释绝对断言「只在实际列表内容变化时重置」，应改为「成员或顺序变化」）
- rev2 两项：N1 已关闭（签名 + 双向用例，成本与碰撞风险可接受）、N2 已关闭（en 断言补齐且与字典值一致）。
- 未发现 rev3 引入的新回归：`useLayoutEffect` 依赖为字符串（按值比较，无身份抖动）、签名 memo 只影响计算量、选中项兜底未改动、i18n 删除键在源码中零引用（全仓仅历史 `docs/plans`、`docs/root-cause-to-close` 提到）；钳制与箭头图标文件与 rev2 逐字节一致。
