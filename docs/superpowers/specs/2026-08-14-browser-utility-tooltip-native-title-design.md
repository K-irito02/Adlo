# Design: Browser Navigator 工具按钮 tooltip 文案与原生 title 化

日期：2026-08-14
状态：已批准

## 目标

对浏览器导航栏（open/tabs 模式）中的两个工具按钮做两处调整：

1. **文案**：open 模式"清空所有已打开标签"按钮的 tooltip 文字改为"关闭所有已打开标签页"。
2. **原生 title 化**：该"关闭"按钮与"始终新建标签页"（open 模式 "+"）按钮的自定义 Tooltip（TooltipSimple）改为系统原生 `title` 提示。

## 决策（已与用户确认）

| 决策点 | 结论 |
|--------|------|
| 中文文案 | **关闭所有已打开标签页**（强调"关闭"动作——内部 `handleCloseAllTabs` 实际执行关闭全部标签；保留"所有"强调全部范围） |
| 英文文案 | **Close all open tabs**（与中文"关闭"动作对齐） |
| 测试方式 | 抽取叶子组件 + 组件测试（遵循 Task 7 抽取 `BrowserNavModeSwitch` 的先例） |

## 命名检查结论

- `browserClearAllOpenTabs`（i18n key）：动作仍是"清空全部已打开标签"，key 名依然准确，**不改名**。
- `handleCloseAllTabs`（handler）：语义不变，**不改名**。
- `common.clearAllOpenTabs`（common.ts:133）：未使用的死 key，本次不动，仅记录。

## 改动点

### 1. i18n 文案

`frontend/src/app/i18n/zh-CN/browser.ts:133`
- `browserClearAllOpenTabs: '清空所有已打开标签'` → `'关闭所有已打开标签页'`

`frontend/src/app/i18n/en-US/browser.ts:141`
- `browserClearAllOpenTabs: 'Clear all open tabs'` → `'Close all open tabs'`

### 2. 抽取叶子组件

新建 `frontend/src/app/features/browser/BrowserNavUtilityButtons.tsx`，抽出 open 模式下的两个按钮（"+"/"始终新建标签页"按钮 与 "清空已打开标签页"按钮），props 化以支持独立测试：

- `alwaysNewTabLabel` / `clearOpenTabsLabel`：文案
- 回调：`onAlwaysNewTab`、`onClearOpenTabs`
- `ariaLabel` 与 `title` 均使用对应 i18n 文案

### 3. BrowserNavigator.tsx 接线

将原内联的两个按钮（BrowserNavigator.tsx:183-215 的 "+" 按钮、232-243 的"清空"按钮）替换为 `<BrowserNavUtilityButtons />`：

- 移除这两个按钮的 `TooltipSimple` 包裹，改为原生 `title`。
- 保留 `aria-label`。
- 保持 display 显隐逻辑（open/tabs 模式）不变。
- 原有 `handleAlwaysNewTab(t.browserNewTabPage)`、`handleCloseAllTabs()` 逻辑通过 props 传入。

注意：BrowserNavigator.tsx:183-215 的 "+" 按钮同时服务 `tabs` 模式（`browserNewTab` 文案、打开新建标签对话框）与 `open` 模式（`browserNewTabAlways` 文案、始终新建标签）。为最小化改动与风险，**tabs 模式下的行为与 Tooltip 保持原样**（仍在 BrowserNavigator 内联），仅将 open 模式的"始终新建标签页"按钮抽为叶子组件并原生 title 化。

> 澄清：抽取范围聚焦"本次要改的两个 open 模式按钮"。若两按钮分属不同显隐容器（`span style=display` 分支），则分别对应两个 leaf；如结构合适也可合并为一个叶子组件，以实际文件结构为准。

### 4. 测试

新增 `BrowserNavUtilityButtons.test.tsx`（仿 `BrowserNavModeSwitch.test.tsx`）：

- 断言"关闭所有已打开标签页"按钮渲染原生 `title` 属性且值正确、`aria-label` 保留。
- 断言"始终新建标签页"按钮渲染原生 `title` 且值正确、`aria-label` 保留。
- 断言按钮触发对应回调。

## 验收标准

- `pnpm --dir frontend run typecheck` 0 错误
- `pnpm --dir frontend run lint` 0 errors
- `pnpm --dir frontend vitest run BrowserNavUtilityButtons` 通过
- i18n parity（keys.test.ts）通过
- 双端一致：Tauri 与浏览器模式均使用原生 `title`（无自定义 Tooltip 差异）

## 非目标

- 不改动 tabs 模式 "+" 按钮、书签删除按钮、模式切换开关等其它按钮的 tooltip 方案。
- 不清理 `common.clearAllOpenTabs` 死 key。
