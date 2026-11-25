# browser-hover · R1 · rev2 定向复核报告

## 范围

- rev2 快照（base `595216f1fee34957b1edfcf274042c1c5a7d18a7`），scope `browser-hover`，本 scope 仅 2 个快照文件：
  - `adlo/frontend/src/app/features/browser/BrowserOpenTabFlatListItem.tsx`（rev2 diff 行 5-24）
  - `adlo/frontend/src/app/features/browser/__tests__/BrowserOpenTabFlatList.test.tsx`（rev2 diff 行 5-53）
- 复核目标：rev1 F1（容器级 `:focus-within` 无效 + 不可见可命中 + 禁用选择器形态）是否按「建议 3：撤回 CSS、改为仅悬停显现」彻底撤回；F2（CSS 无样式锁）是否随撤回消失；组件/测试是否因撤回产生回归。
- 只读约束：未运行 `git diff/log/show`、未跑测试套件、未启动 dev server / 浏览器（未占用任何端口）、未改源码；只写本报告。读取了工作区源码作为上下文（`useOpenInCenterAction.ts`、`BrowserOpenTabFlatList.tsx`、`Tooltip.tsx`、`browser-tree-entry.css`、`tree-shared.css`、`preview-loading-empty-state.test.ts`、`BrowserTreeEntryFlatList.tsx`、`.agents/rules/ui-patterns.md` §3、`.agents/rules/desktop-ui-verification.md` §样式回归锁、进度文件末段）。
- 撤回事实核对：`changed-files-rev2.txt` 中本 scope 只有上述 2 个文件，`browser-tree-entry.css` 已不在 rev2 变更清单；rev1 快照里的该 CSS diff（新增 `.adl-filetree__row:focus-within .adl-browser-node__actions` 一行）在 rev2 无对应快照 → 相对基线净变更为零。

## 上轮问题关闭情况

- **F1（medium，`:focus-within` 不生效 + 不可见可命中 + 禁用形态）：已关闭。**
  - `browser-tree-entry.css` 当前全文无 `:focus` / `:focus-visible` / `:focus-within`（grep 零命中）；显现路径只剩 `215-219` 的 `.adl-tree-node__row:hover` / `.adl-filetree__row:hover` 与 `242-245` 的 `.adl-browser-entry__tree .adl-filetree__row:hover …meta`，与基线一致。
  - 撤回后隐藏态回到 `207-213`（`opacity: 0; pointer-events: none`）+ `221-233`（meta 同样 `opacity: 0; pointer-events: none`），不再存在「聚焦后不可见按钮可点击」的指针侧回归；也不再保留 ui-patterns §3 明令禁止的容器级 `:focus-within` 形态。
  - 采用的是报告 F1 建议 3（产品接受「仅悬停」，与既有「关闭」按钮现状一致）；建议 3 允许的配套动作——需求/进度文档的「聚焦」承诺降级——已由主代理记入 P5 台账（见本文「记录不修」第 2 条）。
- **F2（low，CSS 变更缺样式回归锁）：已关闭。**
  - `desktop-ui-verification.md:47` 的锁定义务前提是「改/新增 CSS」；该 CSS 相对基线已无净改动，本轮无 CSS 行为需要锁，因此不存在「删掉声明锁仍绿」的退化路径。
  - 复核既有样式锁未受影响：唯一读取 `browser-tree-entry.css` 的 `src/styles/preview-loading-empty-state.test.ts:32` 只断言 `.adl-browser-entry__empty` 的 `padding`（`:199-211`），与撤回行无关；`src/styles` 内无任何针对 `.adl-browser-node__actions` 显现契约的锁（grep 仅命中该 padding 用例），故无需清理残留断言。

## 新增发现

无。rev2 的组件与测试 diff 的内容标识与 rev1 完全相同（组件 `16f2efc74..293f66bc3`、测试 `beaea8964..6dc888c38`），本轮实质改动只有 CSS 撤回，未引入新的代码/测试/契约变化。

复核通过、不产出 finding 的点：

- 按钮形态与 DOM 顺序：新按钮仍在 `.adl-browser-node__actions` 内、「关闭」之前；`adl-icon-btn adl-icon-btn--xs`、`IconArrowUpLeft size={12}`、`TooltipSimple placement="top"` 与相邻关闭按钮一致；`TooltipSimple` → `TooltipTrigger` 以 `span.tooltip-trigger`（`display:inline-flex`）包裹并 `cloneElement` 合并 `onClick`（`Tooltip.tsx:139-142,182-186`），因此 `stopPropagation()` 仍生效、`closest()` / `compareDocumentPosition()` 断言不受包装影响。
- 测试仍成立（删除性推演）：
  - 删新按钮 → `getByRole('button', { name: 'Show in center' })` 抛错变红；
  - 交换两按钮顺序 → `compareDocumentPosition(...) & Node.DOCUMENT_POSITION_FOLLOWING` 为 0 变红（这是撤回后唯一保护「左侧」语义的断言，仍然有效）；
  - 换容器或不渲染 actions → `closest('.adl-browser-node__actions')` 为 null / `contains(close)` 为 false 变红；
  - 删 `stopPropagation()` → click 冒泡到 `.adl-filetree__row` 的 `onClick`，`onSelectTab` 被调用，`not.toHaveBeenCalled()` 变红；
  - 删 `moveTabToCenter(tab.id)` → `toHaveBeenCalledWith('normal-a')` 变红。
- 撤回不影响测试语义：用例标题为「hover actions include …」（`BrowserOpenTabFlatList.test.tsx:258`），未声称焦点可见；用例不模拟 hover 只查 DOM，与「仅悬停显现」的实现一致，无注释/标题承诺超出实现。
- 生产文案键未变：`centerTabShowInCenter` 在 zh-CN/en-US 均存在（`common.ts:139/128`，`centerCopyParity.test.ts:16,40,43` 锁值），与右键菜单同键同图标。
- 测试的全局 action 覆盖可恢复：`useAppStore.setState({ centerShowBrowserTab: moveToCenter as never })` 在 `try/finally` 中还原原始引用（`:259-261,289-291`）；`useOpenInCenterAction` 只在调用时 `getState()` 取该 action、不订阅，故覆盖不会引发额外渲染或跨用例泄漏。`as never` 是本仓测试覆盖 store action 的既有惯例（如 `SettingsPanel.test.tsx:90`、`BrowserSettings.test.tsx:549`），不属于简报 §5.1 禁止的 `as unknown as` 私域断言。

## 记录不修

1. 键盘 Tab 仍会落到视觉隐藏的两个操作按钮（祖先 `.adl-filetree__meta` 与 `.adl-browser-node__actions` 均 `opacity: 0`），键盘用户看不到按钮本体；`.adl-filetree__row:focus-within`（`tree-shared.css:43`）只给整行叠加 `--bg-hover` 底色，不显现按钮。此为撤回后的既有状态，与「关闭」按钮同源、pre-existing，且「仅悬停」为本轮用户/主代理明确采纳的方案；不进入主表。
2. 进度文件 `docs/root-cause-to-close/2026-11/progress-2026-11-25-024000.md:110,114,117` 仍写「鼠标悬停/聚焦」「row hover/focus」「CSS 悬停选择器补 `:focus-within`」，与撤回后实现不符（该文件 `:126` 已记录将在 P5 降级为「仅悬停」）。文档属 P5 范围，不进入主表。
3. 新用例仍挂在 `describe('BrowserOpenTabFlatList reorder')` 下（`BrowserOpenTabFlatList.test.tsx:51,258`），语义分组不符；纯风格，pre-existing。
4. 测试夹具 `centerTabShowInCenter: 'Show in center'`（`:17`）与生产 en 文案 `Show in middle area` 不同；仅夹具，不影响断言，pre-existing。
5. 按钮 `pointerdown` 仍冒泡到 `li` 开启潜在拖拽会话（>4px 才成拖拽，click 由 `useOpenTabReorder` 抑制）；与既有关闭按钮同源，pre-existing。
6. 撤回后该功能无任何自动化保护的「悬停才显现」契约（无 CSS diff 即无锁义务），键盘/指针显现行为只能靠真实渲染验证；本轮未新增 CSS 风险，记录供 P5/R2 知晓。

## 结论

- 需修复项：0（critical 0 / high 0 / medium 0 / low 0）——本轮零问题。
- 上轮 F1、F2 均已关闭；撤回彻底（`browser-tree-entry.css` 无任何 focus 规则、rev2 变更清单不含该文件），组件与测试相对 rev1 无实质变化且断言仍成立。
