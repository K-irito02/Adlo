# R1 rev2 复审 — 文案 / 菜单钳制 / 列表窗口化

- 快照：`.review-diffs/manifest-rev2.md`（base `4484cf75c`，58 文件，只看 rev2）
- 进度真源：`docs/root-cause-to-close/2026-11/progress-2026-11-14-233054.md`（P4 段，197-219 行）
- 上一轮报告：`.review-diffs/copy-clamp-window-r1-rev1-report.md`
- 约束遵守：未运行 `git` 命令、未改源码、未跑测试套件；结论来自 rev2 快照 + 工作区源码 + 删除性推演

## 范围

P4 记录的本范围修复面（line 215）：文案值断言、窗口重置键与时机、选中项窗口兜底 + `aria-setsize/posinset`、删除无消费方 i18n 键、搜索注释与箭头注释。

| 文件 | rev2 是否有改动 | 说明 |
| ---- | -------------- | ---- |
| `i18n/__tests__/centerCopyParity.test.ts` | 有 | 新增「钉死用户可见文案」用例（10 条断言） |
| `i18n/{zh-CN,en-US}/browser.ts` | 有 | `browserViewModeList` 改值；删除 `browserViewModeTree/All/Default` |
| `i18n/{zh-CN,en-US}/common.ts` | 无（与 rev1 快照逐字节一致） | 三条 centerTab 文案保持 |
| `features/browser-tree/BrowserTreeEntryFlatList.tsx` | 有 | 重置改 `useLayoutEffect + [flatItems]`；选中项兜底；`aria-setsize/posinset` |
| `...__tests__/BrowserTreeEntryFlatList.window.test.tsx` | 有 | 新增「同长度数据变化重置」「选中项兜底 + setsize/posinset」两条 |
| `features/browser/BrowserNavSearchMode.tsx` | 有（注释行） | 「文件列表」→「书签列表」 |
| `icons/actions.tsx`、`icons/index.ts` | 有 | 删除 `IconMoveToCenter`（实现 + barrel） |
| `icons/core.tsx`、`icons/core.test.tsx` | 有（注释/用例名） | 箭头注释改为「当前用于「在中心显示」（已打开标签页 / 终端标签菜单）」 |
| `features/tree/treeEntryMenus.ts`、`features/tree/__tests__/useClampedMenuPosition.test.tsx`、`components/ContextMenu.tsx`、`regions/CenterTabStrip.tsx`、`features/terminal/TerminalContextMenu.tsx` | 无（SHA256 与 rev1 快照逐一相同） | 钳制/图标结论沿用 rev1，不重复复述 |

## 上轮问题关闭情况

### F1（medium）文案值断言（zh/en）— **已关闭**（残余见 N2）

- `centerCopyParity.test.ts:35-46` 新增用例，10 条 `toBe` 断言：`browserViewModeList`（zh+en）、`centerTabShowInBrowserPanel/TerminalPanel`（仅 zh）、`centerTabShowInCenter` / `centerTabOpenInCenter` / `centerTabOpenAllInCenter`（zh+en）。
- 删除性推演：把 `zh-CN/browser.ts:127` 改回 `文件列表`、或把 `common.ts:138-142` 任一条改回旧词 → `:36-45` 直接变红。该用例现在是**真回归保护**（rev1 的 `length > 0` 只能挡缺键，挡不住改值）。
- 残余：en 的两条面板文案（`Show in right panel`）未被断言 → N2。

### F2（low）窗口重置改 `useLayoutEffect` + `[flatItems]`，并有用例 — **未完全关闭**（方向对，键选得过宽 → N1）

- 已改：`BrowserTreeEntryFlatList.tsx:44-46` 用 `useLayoutEffect` + `[flatItems]`，注释说明「避免先按旧的大窗口多画一帧」；rev1 的「长度判等 + paint 后重置」两点都修掉了。
- 用例：`window.test.tsx:100-123`「同长度的数据变化也重置回一页」——换成同长度、不同 path 的新数组后断言回到 80 行；删除该 effect 会红，是真保护。
- 但键从「长度」换成了「整个数组身份」，而 `flatItems` 身份在**数据没变**的后台重建里也会变（见 N1），导致该 effect 在正常浏览时反复把已展开的窗口收回首屏。这是本轮新引入的回归，程度 medium。

### F3（low）选中项纳入窗口 + `aria-setsize/posinset` + 用例 — **已关闭**

- 实现：`BrowserTreeEntryFlatList.tsx:70-87`（`tabItems` / `positionByPath` / `selectedIndex` / `effectiveVisibleCount`）、`:178-179`（`aria-setsize={tabItems.length}`、`aria-posinset={index+1}`）。
- 用例：`window.test.tsx:125-135` 选中第 101 个条目 → 断言行数 > 80、选中行存在、`aria-setsize=120`、`aria-posinset=101`；回归时会红。
- 计数口径正确：`setsize` 只数 `type === 'tab'` 的行（分隔符不是 treeitem），每分类各自一棵 `ul[role=tree]`，与 DOM 结构一致。
- 「Ctrl+F / AT 只看已渲染行」已按窗口化固有取舍记录（P4 line 217），且 setsize/posinset 已让 AT 知道真实总数 → 可接受。
- 「选中项覆盖是否导致一次渲染过多」的结论见「记录不修」第 1 条：可达路径基本被「点击即渲染 + 失焦/点外部清空选中」挡住，故不成缺陷，但存在无上界的理论成本。

### F4（low）ui-manual / 注释 / 死导出 / 死键 — **已关闭**

- ui-manual：P4 line 218 明确记为 P5 待办并给出具体行号（`browser.md:269/461`），符合简报 §7「记录理由后可不修」。
- `BrowserNavSearchMode.tsx:101` 注释已改为「与书签列表收藏行一致」（同文件 `:41` 同步）。
- `IconMoveToCenter`：`actions.tsx` 实现与 JSDoc 整段删除、`icons/index.ts:103` 导出行删除；全仓 `grep IconMoveToCenter` 只剩历史进度文档（`2026-10` 两条），无源码/测试引用。
- 死键：`browserViewModeTree/All/Default` 从两本字典同时删除（`zh-CN/browser.ts:127` 起、`en-US/browser.ts:137` 起仅留 `browserViewModeList`）；全仓源码仅剩 `browserViewModeList` 的 2 处消费 + 1 处测试 mock + 1 处新断言；`CopyDict` 由 zh 字典派生，无残留类型引用（否则 typecheck 会报错）。
- 箭头注释：`icons/core.tsx:202` 改为「当前用于「在中心显示」（已打开标签页 / 终端标签菜单）」，与 `BrowserOpenTabFlatListItem.tsx:124`、`TerminalContextMenu.tsx:87` 两处实际用法逐一对应，不再夸大。

## 新增发现

### N1 [severity: medium] [category: 副作用]

- 位置：`adlo/frontend/src/app/features/browser-tree/BrowserTreeEntryFlatList.tsx:42-46`
- 描述：重置键从「长度」换成「`flatItems` 数组身份」后，**数据内容没变、只是树被重建**也会重置到 80 行。而本仓的浏览器树本来就会在每次站点元数据更新时整棵重建；用户滚到第 80 行之后时，一次后台 favicon/标题结算就会把窗口收回首屏：layout 阶段收缩（本帧即 paint 80 行，滚动位置被 clamp）→ 哨兵重新进入视口 → 被动 effect 再追加一页。净效果是「列表闪一下 + 滚动位置丢失（用户回到 ~第 55-80 行附近）」，而不是停在原位置。
- 证据：
  1. `BrowserTreeEntryChildren.tsx:43-46`：`flatItems` 由 `useMemo` 生成，依赖含 `node`（树节点对象身份）。
  2. `useBrowserTreeCache.ts:62-63`：`subscribeSiteMetaGlobal(() => setMetaVersion(v => v+1))`；`:75-92`、`:102-105`、`:115-118` 三棵树的 `useMemo` 都把 `browserTabs` 与 `metaVersion` 放进依赖 → 元数据/标签任一变化即重建，节点对象全部换新身份。
  3. `siteMetaCache.ts:135`（全局订阅语义「每当任意 URL 的元数据镜像更新时触发」）、`:509-528`（`applyBroadcastUpdate` → `upsertMirror` → `notify`）、`:117-132`（notify 广播到 globalListeners）。
  4. `BrowserTreeEntryFlatList.tsx:44-46`（重置）与 `:48-68`（IO 依赖 `[visibleCount, flatItems.length]`，收缩后重建 observer 并追加一页）。
  5. 删除性推演：把注入源（`metaVersion`）当作「数据变化」是本轮的实现选择；现有用例 `window.test.tsx:100-123` 只覆盖「同长度但**内容不同**」的重置，**没有**「同内容重建不重置」的反例，所以这个误收缩不会被任何测试拦住。
  6. 旁证：P4 只跑了 `check:changed`（line 200，且发生在 rev2 修复前）与 rev1 的浏览器采样（line 29，长度判等时代）；rev2 之后没有重跑「滚动到底」采样，故该回归未被视觉验证（P4 line 219 自己写明「准备最终全量门禁 → rev2 快照」）。
- 建议修复：把重置键换成「内容签名」而非数组身份，例如 `flatItems.length` + 首末 `path` + 当前目录/模式（`useBrowserEntryKey` 之类的 `useMemo` 派生字符串），或把重置上移到 `BrowserTreeEntryChildren`/`BrowserNavSearchMode`，在它们已知「目录切换/模式切换/搜索词变化」的地方显式触发一次。同时补一条反例用例：传入内容相同、身份不同的新数组，断言**不**重置。

### N2 [severity: low] [category: 正确性（测试有效性）]

- 位置：`adlo/frontend/src/app/i18n/__tests__/centerCopyParity.test.ts:38-39`
- 描述：F1 的值断言只覆盖了 zh 的两条面板文案，`enUS.centerTabShowInBrowserPanel` / `enUS.centerTabShowInTerminalPanel` 仍无断言。把 en 改回 `Show in browser panel` / `Show in terminal panel`，所有测试保持绿——这正是 F1 要防的那类「文案回潮」。
- 证据：`:35-46` 共 10 条断言，en 侧只覆盖 `browserViewModeList`、`centerTabShowInCenter`、`centerTabOpenInCenter`、`centerTabOpenAllInCenter` 四个键；两条面板键只有 zh 一行。
- 建议修复：各补一行 `expect(enUS.centerTabShowInBrowserPanel).toBe('Show in right panel');`（TerminalPanel 同值同理）。

## 记录不修

1. **选中项兜底无上界（一次渲染过多）**：`effectiveVisibleCount = Math.max(visibleCount, selectedIndex + 1)`（`:82-83`），最坏情况首屏渲染到选中下标。但可达性很窄：`selectedTreePath` 只由「点击已渲染的 `.adl-filetree__row`」写入（`useBrowserNavigatorState.ts:48-69`），点模式按钮/点外部/`window.blur` 都会清空（`:66`、`:76-84`），所以切换到列表模式时选中通常已被清掉；真正能形成「深下标 + 空窗口」只剩持久化水合（`stores/persisted/registry.ts:809`）或将来新增的程序化定位入口。若后续加「从搜索定位到列表行」这类入口，建议改成区间窗口（`[start, start+page]`）+ `scrollIntoView`，并让 IO 追加基于 `effectiveVisibleCount`：当前 `:61` 从 `visibleCount` 递增，与兜底值脱节时会连发 160/240/320 三次「不长行」的追加（每次重渲染 301 行）。
2. Ctrl+F/浏览器查找只能命中已渲染行：P4 line 217 已作为窗口化固有取舍记录，setsize/posinset 已补。
3. `<ul role="tree">` 内混入 `<li role="separator">`（ARIA 1.2 的 tree 只允许 treeitem/group）：预存结构，与窗口化无关。
4. `browserViewMode?: 'tree' | 'list' | 'all'` 的 `'all'` 分支已无调用方（`BrowserTreeEntry.tsx:63-64` 仍判断），本轮删掉 `browserViewModeAll` 后更明显：预存死变体，可随下次清理一并移除。
5. `docs/plans/ui/2026-06-12-i18n-full-localization.md:465-498` 仍列出已删的三个键：历史计划文档，非现行规格，不改。
6. ui-manual「文件列表/三视图」：P4 line 218 转 P5 待办，理由与行号已记录。
7. rev2 修复后尚未跑最终门禁与浏览器预览（P4 line 219）：本报告是代码级判定，窗口行为的视觉证据仍需主代理补齐。

## 结论

- 需修复项：2（critical 0 / high 0 / medium 1 / low 1）
- 明细：medium 1 = N1（窗口重置按数组身份 → 元数据重建导致的误收缩与滚动位置丢失）；low 1 = N2（en 两条面板文案仍无断言）。
- 上轮 4 项：F1 已关闭（残余 N2）、F2 方向正确但引入 N1、F3 已关闭、F4 已关闭。
- 钳制（`useClampedMenuPosition` / `ContextMenu` / 用例）与箭头图标（`CenterTabStrip` / `TerminalContextMenu` / 几何用例）本轮文件与 rev1 逐字节一致，rev1 的「已关闭」结论继续成立。
