# 终端多窗口改造 · 批次 D（自定义布局卡片 + 持久化收尾）实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在两处工具栏加入「自定义布局」按钮，点击弹出布局卡片：方块按窗格顺序排列、各有不同颜色；支持拖拽排序、进入「交换位置」模式后选两块确认交换、双击方块标注（限 1 字符）；按标签独立持久化、重启恢复。

**Architecture:** 新增 `TerminalLayoutCard` 弹出卡片（锚定工具栏按钮）与纯函数 `paneColor(index)`；所有变更复用 B 阶段 store 动作（`terminalReorderPanes`/`terminalSwapPanes`/`terminalUpdatePane`）与既有按标签持久化（`adl:terminal.tabs` 的 `panes[].label/colorIndex`），无需新存储键。

**Tech Stack:** React 19 + Zustand + TypeScript；图标 `IconCustomLayout`（批次 C 已加）。

**Spec:** `docs/superpowers/specs/2026-10-07-terminal-multipane-design.md`（§5.1 `label`/`colorIndex`、§7 工具栏、§9 自定义布局卡片、§10 持久化）

## Global Constraints

- 未发布产品：禁止数据格式兼容 / 旧版本迁移代码。
- 双端一致：两处宿主共用同一卡片组件与动作。
- 可见文案走 i18n（zh-CN / en-US 双份）；禁止 emoji。
- 标注限 **1 字符**（一个简体中文字计 1 字符）。
- 每标签独立、互不影响；重启恢复结构与布局、逐窗格新建 shell（B/C 已实现，D 只补 `label`）。
- 完成后必须通过：`pnpm --dir frontend run lint`、`npx tsc --noEmit`、`cargo clippy --workspace --all-targets -- -D warnings`、`cargo test --workspace`、`pnpm --dir frontend run test`。

## 文件结构

**新增**
- `frontend/src/app/components/terminal/TerminalLayoutCard.tsx`
- `frontend/src/app/features/terminal/paneColors.ts`
- 测试：`__tests__/paneColors.test.ts`、`__tests__/TerminalLayoutCard.test.tsx`

**修改**
- `frontend/src/app/features/terminal/TerminalPanel.tsx`、`features/center/CenterTerminalView.tsx`（按钮 + 卡片接线）
- `frontend/src/app/features/terminal/useTerminalPanel.ts`、`features/center/useTerminalView.ts`（透出 reorder/swap/update-pane-label 动作）
- `frontend/src/app/i18n/zh-CN/terminal.ts`、`en-US/terminal.ts`
- `frontend/src/styles/regions/rightpanel/terminal-panel.css`（卡片样式）

---

## Task D1: 颜色调色板 + 卡片骨架

**Files:**
- Create: `ai-digital-life/frontend/src/app/features/terminal/paneColors.ts`
- Create: `ai-digital-life/frontend/src/app/components/terminal/TerminalLayoutCard.tsx`
- Test: `ai-digital-life/frontend/src/app/features/terminal/__tests__/paneColors.test.ts`、`ai-digital-life/frontend/src/app/components/terminal/__tests__/TerminalLayoutCard.test.tsx`

**Interfaces:**
```ts
// paneColors.ts
export const PANE_COLORS: readonly string[]; // 至少 8 个互不相同的颜色（用 CSS 变量或固定色）
export function paneColor(colorIndex: number): string; // 越界取模
```
```tsx
// TerminalLayoutCard.tsx
interface TerminalLayoutCardProps {
  panes: TerminalPane[];
  onMove: (fromIndex: number, toIndex: number) => void;
  onSwap: (paneIdA: string, paneIdB: string) => void;
  onLabelChange: (paneId: string, label: string) => void;
  onClose: () => void;
}
```

- [ ] **Step 1: 写失败测试**

- `paneColors.test.ts`：`paneColor(0) !== paneColor(1)`；`paneColor(PANE_COLORS.length) === paneColor(0)`（取模）；`PANE_COLORS.length >= 8`。
- `TerminalLayoutCard.test.tsx`：渲染 N 个方块（`.adl-layout-card__square`），数量 = `panes.length`，顺序 = `panes` 顺序；每块内联背景色 = `paneColor(pane.colorIndex)`；有「交换位置」入口按钮。

- [ ] **Step 2: 运行确认失败** — `npx vitest run src/app/features/terminal/__tests__/paneColors.test.ts src/app/components/terminal/__tests__/TerminalLayoutCard.test.tsx` → FAIL。

- [ ] **Step 3: 实现**

- `paneColors.ts`：`PANE_COLORS` 取 8 个区分度高的颜色（优先复用设计 token `var(--…)`；无对应 token 时用固定 hex 并注释说明「卡片色板，非主题语义色」）。`paneColor(i) = PANE_COLORS[((i % len) + len) % len]`。
- `TerminalLayoutCard.tsx`：外层 `.adl-layout-card`；方块列表 `.adl-layout-card__grid`；每块 `.adl-layout-card__square`，`style={{ background: paneColor(pane.colorIndex) }}`，显示 `pane.label`（有则显示，否则空）；底部按钮组：`.adl-layout-card__swap-toggle`（「交换位置」）。本步先渲染骨架与顺序，交互留 D2。

- [ ] **Step 4: 测试 + commit**

Run: `npx vitest run src/app/features/terminal/__tests__/paneColors.test.ts src/app/components/terminal/__tests__/TerminalLayoutCard.test.tsx` + `npx tsc --noEmit`。
```bash
git add ai-digital-life/frontend/src/app/features/terminal/paneColors.ts ai-digital-life/frontend/src/app/features/terminal/__tests__/paneColors.test.ts ai-digital-life/frontend/src/app/components/terminal/TerminalLayoutCard.tsx ai-digital-life/frontend/src/app/components/terminal/__tests__/TerminalLayoutCard.test.tsx
git commit -m "feat(terminal): pane color palette and layout card skeleton"
```

---

## Task D2: 卡片交互（排序 / 交换 / 双击标注）

**Files:**
- Modify: `ai-digital-life/frontend/src/app/components/terminal/TerminalLayoutCard.tsx`
- Test: `ai-digital-life/frontend/src/app/components/terminal/__tests__/TerminalLayoutCard.test.tsx`

**Interfaces:**
- 复用 D1 的 props；交互实现：
  - **排序**：方块 `draggable`（或指针拖拽），`onDragStart`/`onDragOver`/`onDrop` 计算 `fromIndex`/`toIndex` 调 `onMove`。
  - **交换模式**：点「交换位置」→ 进入 `swapMode`；点两个方块高亮选择；选够两个后「确认交换位置」按钮可点 → 调 `onSwap(a,b)` 并退出模式；「取消」退出。
  - **双击标注**：双击方块进入内联编辑（`<input maxLength={1}>`），回车/失焦提交 `onLabelChange(paneId, value.slice(0,1))`（**限 1 字符**）；Esc 取消。

- [ ] **Step 1: 写失败测试**

- 排序：模拟拖拽（`onMove`）被调用且参数正确。
- 交换：进入模式 → 点两块 → 「确认交换位置」→ `onSwap` 收到两块 id；未选够两块时确认按钮禁用。
- 标注：双击 → 输入「中」→ 回车 → `onLabelChange` 收到 `'中'`；输入超过 1 字符被截断为 1。

- [ ] **Step 2: 实现**（按上方交互；标注输入 `maxLength={1}` + 提交时 `slice(0,1)` 双保险）。

- [ ] **Step 3: 测试 + commit**

Run: `npx vitest run src/app/components/terminal/__tests__/TerminalLayoutCard.test.tsx` + `npx tsc --noEmit`。
```bash
git add ai-digital-life/frontend/src/app/components/terminal/TerminalLayoutCard.tsx ai-digital-life/frontend/src/app/components/terminal/__tests__/TerminalLayoutCard.test.tsx
git commit -m "feat(terminal): layout card reorder, swap and label editing"
```

---

## Task D3: 工具栏按钮 + 两处接线 + i18n + 验收

**Files:**
- Modify: `ai-digital-life/frontend/src/app/features/terminal/TerminalPanel.tsx`
- Modify: `ai-digital-life/frontend/src/app/features/center/CenterTerminalView.tsx`
- Modify: `ai-digital-life/frontend/src/app/features/terminal/useTerminalPanel.ts`、`features/center/useTerminalView.ts`
- Modify: `ai-digital-life/frontend/src/app/i18n/zh-CN/terminal.ts`、`en-US/terminal.ts`
- Modify: `ai-digital-life/frontend/src/styles/regions/rightpanel/terminal-panel.css`

**Interfaces:**
- `useTerminalPanel.terminalActions` 增 `handleReorderPanes`, `handleSwapPanes`, `handlePaneLabelChange`；`useTerminalView` 同构透出。内部委托 `terminalReorderPanes(tabId, orderedIds)` / `terminalSwapPanes(tabId, a, b)` / `terminalUpdatePane(tabId, paneId, { label })`。

- [ ] **Step 1: 动作接线**

- `handleReorderPanes(fromIndex, toIndex)`：以当前 `panes` 顺序构造新 id 数组调 `terminalReorderPanes(tabId, next)`。
- `handleSwapPanes(a,b)`：`terminalSwapPanes(tabId, a, b)`。
- `handlePaneLabelChange(paneId, label)`：`terminalUpdatePane(tabId, paneId, { label: label.slice(0,1) })`。
- 两处宿主同构透出。

- [ ] **Step 2: 工具栏按钮 + 卡片接线（两处）**

- 新增「自定义布局」图标按钮（`IconCustomLayout` + `t.terminalCustomLayout`），点击开合卡片（`useState` + ref，外部点击/Esc 关闭，复用既有菜单下拉的关闭逻辑）。
- 卡片锚定按钮下方；`onMove`/`onSwap`/`onLabelChange` 接对应动作；`onClose` 关卡片。

- [ ] **Step 3: i18n**

增：`terminalCustomLayout: '自定义布局'`、`terminalLayoutCardSwap: '交换位置'`、`terminalLayoutCardSwapConfirm: '确认交换位置'`、`terminalLayoutCardSwapCancel: '取消'`、`terminalLayoutCardAnnotateHint: '双击方块标注（限 1 字符）'`（en-US 对应）。

- [ ] **Step 4: CSS**

`.adl-layout-card`（绝对定位/浮层，`z-index` 高于工具栏）、`.adl-layout-card__grid`（正方形网格）、`.adl-layout-card__square`（正方形、圆角、居中文字）、选中/交换高亮、内联输入样式；亮暗主题适配（用 token）。

- [ ] **Step 5: 全量验收**

Run: `git grep -n -E "terminalLayoutCard|paneColor" -- ai-digital-life/frontend/src`（确认接线）；`npx eslint . && npx tsc --noEmit`；`pnpm --dir frontend run test`；`cargo clippy --workspace --all-targets -- -D warnings && cargo test --workspace`。
Step 手动核对：报告「双端手动 UI 核对待用户执行」，不伪造。

- [ ] **Step 6: Commit**

```bash
git add -A ai-digital-life/frontend/src/app
git commit -m "feat(terminal): custom layout card with reorder, swap and labels"
```

---

## Self-Review

- **Spec 覆盖**：§9 卡片（方块数/颜色/拖拽排序/交换模式/双击标注限 1 字符）→ D1/D2；§7 工具栏「自定义布局」→ D3；§5.1 `label`/`colorIndex` 持久化 → D2/D3 复用 store；§10 重启恢复 → B/C 已实现，D 仅补 `label`。✅
- **占位符扫描**：无 TBD；关键步骤给确切文件/类名/键名与交互契约。✅
- **类型一致性**：`TerminalLayoutCardProps` 在 D1 定义、D2/D3 引用一致；动作名 `handleReorderPanes`/`handleSwapPanes`/`handlePaneLabelChange` 在 D3 统一。✅
- **已知风险**：卡片浮层与 Tauri WebView 无关（纯前端 DOM）；标注 `maxLength=1` 对 emoji/组合字符按 UTF-16 截断（简体中文与常见字符为 1 码元，符合需求；组合字符/emoji 可能超出，实现时用 `Array.from` 取首个码点更稳）。
