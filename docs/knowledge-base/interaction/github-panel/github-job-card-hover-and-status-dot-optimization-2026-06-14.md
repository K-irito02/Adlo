# GitHub Job 卡片悬停 & 状态圆点优化

2026-06-14

## 变更摘要

针对"通信 → GitHub → 概览"功能下的 JOBS 卡片区域，优化了三项交互细节。

### 1. 展开/折叠按钮悬停态（`JobRow.tsx`）

- 展开/折叠图标（`IconChevronUp`/`IconChevronDown`）原本是裸露的 SVG，无悬停反馈
- 改为包裹在 `<button className="adl-github__log-btn">` 中，与"查看日志"按钮共享相同的悬停样式（`color: var(--text-primary); background: var(--surface-hover)`）
- 点击该按钮仍触发卡片展开/折叠（通过 `e.stopPropagation()` + `setExpanded`）

### 2. 移除重复 StatusDot（`JobRow.tsx`）

- 卡片 header 行原本有 `<StatusDot>` + 左侧状态色条（`border-left: 3px`）+ 状态 chip，状态指示三重冗余
- 展开后的 timeline 步骤原本有 `<StatusDot>` + `::before` 伪元素圆点，圆点双重显示
- 已从 `JobRow` 中删除两处 `<StatusDot>` 渲染：
  - 卡片 header：保留左侧状态色条 + chip 文字，状态指示已充分
  - timeline 步骤：保留 `::before` 伪元素圆点（绘制在竖线上，颜色随 `.is-success`/`.is-failure`/`.is-running` 变化）

### 3. 时间线步骤全宽悬停背景（`communication-panel.css`）

- 为 `.adl-github-timeline__step` 添加 `:hover` 背景效果
- 背景延伸至卡片左右边缘，四角直角（无圆角）

## 关键技术挑战：`z-index` 层叠上下文

### 问题

使用 `::after` 伪元素延伸背景时，`z-index: -1` 在根层叠上下文中绘制在所有普通流元素**之后**，包括卡片的 `background: var(--surface-secondary)`。导致 `::after` 背景被卡片背景遮挡，视觉上不可见。

### 解决

```css
.adl-github-timeline__step {
  position: relative;
  z-index: 0;  /* 创建局部层叠上下文 */
}

.adl-github-timeline__step:hover {
  z-index: 1;  /* 悬停时抬高，避免被相邻步骤的 ::after 遮挡 */
}

.adl-github-timeline__step:hover::after {
  position: absolute;
  top: 0;
  bottom: 0;
  left: -36px;    /* 10( body pad) + 16(timeline margin) + 10(timeline pad) */
  right: -10px;   /* 10( body pad-right) */
  background: var(--surface-hover);
  z-index: -1;    /* 在 step 的层叠上下文内为负，位于 step 内容/::before 之后 */
  pointer-events: none;
}
```

**原理**：`z-index: 0` 让 step 元素创建新的层叠上下文。`::after` 的 `z-index: -1` 仅在此上下文内为负——它位于 step 内容和 `::before` 圆点之后，但始终在卡片背景（父级普通流）之上。

### 延伸计算

背景向左延伸 36px：`10px( body padding-left) + 16px( timeline margin-left) + 10px( timeline padding-left)`
背景向右延伸 10px：`10px( body padding-right)`

这些值取决于卡片容器到步骤元素之间各层 padding/margin 的累加。

## 设计决定

| 决定 | 理由 |
|------|------|
| `StatusDot` 不用于 `JobRow` | 卡片左侧状态色条 + chip 文字已足够，避免状态指示三层冗余。`StatusDot` 仍用于 `OverviewView` hero 头部和 `WorkflowsView` 卡片头部 |
| 时间线步骤悬停使用 `::after` + `z-index` 模式 | 这是实现"背景超出元素边界延伸至卡片边缘"的最简洁方式，无需改动 HTML 结构 |
| `border-radius: 0` | 直角背景贴合卡片左右边缘，避免圆角产生未填充的缝隙 |
| 展开/折叠按钮复用 `.adl-github__log-btn` | 保持同一卡片内操作按钮的视觉一致性，减少 CSS 类数量 |

## 相关文件

| 文件 | 变更 |
|------|------|
| `frontend/src/app/regions/right-panel/panels/communicate/JobRow.tsx` | 移除 StatusDot import/渲染，展开/折叠图标包裹 button |
| `frontend/src/styles/regions/rightpanel/communication-panel.css` | `.adl-github-timeline__step` 添加 `z-index: 0` + hover `::after` 全宽背景 |
