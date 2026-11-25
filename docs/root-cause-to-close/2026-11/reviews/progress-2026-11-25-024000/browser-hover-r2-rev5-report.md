# browser-hover · R2 · rev5 审查报告

## 范围

- rev5 快照（base `595216f1fee34957b1edfcf274042c1c5a7d18a7`），scope `browser-hover`，只有 2 个快照文件：
  - `adlo/frontend/src/app/features/browser/BrowserOpenTabFlatListItem.tsx`（rev5 diff 第 5-24 行，blob `16f2efc74..293f66bc3`）
  - `adlo/frontend/src/app/features/browser/__tests__/BrowserOpenTabFlatList.test.tsx`（rev5 diff 第 5-53 行，blob `beaea8964..6dc888c38`）
- CSS：`adlo/frontend/src/styles/regions/rightpanel/browser-tree-entry.css` 不在 rev5 变更清单中，相对基线无净变更（与 R1 rev2 的撤回结论一致），本轮 R2 只读该文件作为显现条件的上下文。
- rev5 的两个 blob 标识与 R1 复核的 rev2 相同 → 本 scope 在 rev2→rev5 之间没有内容变化；R2 关注点（死代码 / 冗余守卫 / 根因修后多余防御 / 应删或降级的诊断日志）逐项过一遍。
- 只读约束：未运行 `git diff/log/show`、未跑测试套件或单测、未启动 dev server / 浏览器（未占用端口）、未改源码；只写本报告。读取的上下文：`useOpenInCenterAction.ts`、`BrowserOpenTabFlatList.tsx`、`BrowserNavOpenMode.tsx`、`browser-tree-entry.css:205-245`、`titlebar.css:201`、i18n `common.ts`（`centerTabShowInCenter` 双端键）与 `centerCopyParity.test.ts`。

## 上轮问题关闭情况（逐条）

- R1 F1（`:focus-within` 无效 + 不可见可命中，medium）：**已关闭**。rev5 快照无 CSS 文件；工作区 `browser-tree-entry.css` 的显现路径仍只有 `:215-219`（actions）与 `:242-245`（meta）的 `:hover`，无任何 `:focus*` 规则；「仅悬停」为已采纳方案。
- R1 F2（CSS 变更缺样式回归锁，low）：**已关闭**。本轮无 CSS 净变更，无新增锁义务。
- R2 定向复核（本轮新增关注）：
  - **死代码**：rev5 只新增 1 个 `<button>` JSX 块（`BrowserOpenTabFlatListItem.tsx:77-89`）与 1 条用例（测试 `:258-292`）；`IconArrowUpLeft`、`useOpenInCenterAction`、`moveTabToCenter` 在基线中已被右键菜单使用（`:140-148`），新增块没有引入未被使用的新符号或参数 —— 无死代码。
  - **冗余守卫**：新按钮的 `e.stopPropagation()`（`:82`）是必需的——点击会冒泡到 `.adl-filetree__row` 的 `onClick={() => onSelectTab(tab.id)}`（`:50`）；用例的 `not.toHaveBeenCalled()` 正是它的删除性保护。`actions?.contains(...)` 的 `?.` 是 TS 在 `expect(...).not.toBeNull()` 后不做类型收窄的必要写法，不是多余防御。无冗余守卫。
  - **根因修后多余防御**：`onRefreshTab` 的 `try/catch` + `instanceof Promise`（`:116-126`）与 `console.warn`（`:121,125`）都在基线中，属异步回调的真实失败路径（返回 Promise 或同步抛错两种调用方），不是本轮根的补丁；不在本轮 diff 行，且属正当错误处理，不降级。
  - **诊断日志**：rev5 两个文件未新增任何 `console.*` / debug 输出；上述两条 `console.warn` 为既有生产失败告警（非临时诊断），保留正当。
  - **测试有效性（删除性推演）**：删按钮 → `getByRole('button', { name: 'Show in center' })` 抛错变红；两按钮换序 → `compareDocumentPosition(...) & FOLLOWING` 为 0 变红；删 `stopPropagation` → 冒泡触发 `onSelectTab`，`not.toHaveBeenCalled()` 变红；删 `moveTabToCenter(tab.id)` → `toHaveBeenCalledWith('normal-a')` 变红；移出 `.adl-browser-node__actions` → `closest()` 为 null / `contains(close)` 为 false 变红。用例从公共入口 `BrowserOpenTabFlatList` 渲染，未用 `as unknown as` 触碰私有方法/内部字段。
  - **store 覆盖手法**：`useAppStore.setState({ centerShowBrowserTab: moveToCenter as never })`（`:261`）+ `try/finally` 还原（`:259-261,289-291`）；`useOpenInCenterAction` 用 `getState()` 调用时不订阅，覆盖不影响渲染也不跨用例泄漏。`as never` 是本仓测试覆盖 store action 的既有惯例（`SettingsPanel.test.tsx:86-90`、`ResetAllDialog.test.tsx:110-121`），不属简报 §5.1 禁止的 `as unknown as` 私域断言。
  - **注释/文案漂移**：新增注释「DOM 顺序：在中心显示 → 关闭」（`:280`）与断言一致；「点击动作按钮不应顺带选中标签」（`:287`）有 `not.toHaveBeenCalled()` 支撑；用例标题「hover actions include "Show in center" to the left of Close」与实际断言（含顺序）一致，且未承诺焦点可见。无绝对断言措辞。
  - **i18n**：`t.centerTabShowInCenter` 在 zh-CN / en-US 均存在（`common.ts:139/128`），与右键菜单同键同图标；`aria-label` 与 tooltip 同文案，非状态切换按钮，不适用「名称恒定 vs `aria-pressed` 二选一」规则。

## 新增发现

无。rev5 本 scope 无新增走查点；死代码 / 冗余守卫 / 多余防御 / 诊断日志四项均为零。

## 记录不修

1. 键盘 Tab 仍会落到视觉隐藏的两个操作按钮（`.adl-browser-node__actions` 与祖先 meta 均 `opacity: 0`），键盘用户看不到本体；`.adl-filetree__row:focus-within` 只叠底色。pre-existing，且「仅悬停」已被用户/主代理采纳。
2. 新用例仍挂在 `describe('BrowserOpenTabFlatList reorder')` 下（`:51,258`），语义分组不符；纯风格。
3. 测试夹具 `centerTabShowInCenter: 'Show in center'`（`:17`）与生产 en 文案 `Show in middle area` 不同；仅夹具，不影响断言。
4. 悬停按钮（`:77-89`）与右键菜单「show-in-center」（`:140-148`）是同一 action 的两个入口，存在少量重复调用形态；两者都是独立用户入口，抽取无收益，纯风格。
5. 「悬停才显现」契约无自动化锁（无 CSS diff 即无锁义务），只能靠真实渲染验收；本轮无新增 CSS 风险，记录供 P5 知晓。
6. 按钮 `pointerdown` 仍冒泡到 `li` 开启潜在拖拽会话（>4px 才成拖拽，click 由 `useOpenTabReorder` 抑制）；与既有关闭按钮同源，pre-existing。
7. 进度文件 `docs/root-cause-to-close/2026-11/progress-2026-11-25-024000.md` 中「悬停/聚焦」表述与撤回后实现不符；文档属 P5 范围。

## 结论

- 需修复项：0（critical 0 / high 0 / medium 0 / low 0）——本轮零问题。
