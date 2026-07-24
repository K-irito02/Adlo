# Git 可视化区域：去除卡片悬浮感，改为一体式布局

**日期**: 2026-07-23
**状态**: 已批准（含后续调整）
**涉及范围**: CSS + 组件结构调整

---

## 目标

移除 Git 可视化区域中所有区块的"悬浮卡片"视觉效果，使各区块与容器背景融为一体，区块之间仅靠间距划分。

## 当前问题

5 个区块（热力聚合卡片、代码行演变、提交时间线、文件旭日图、分支图）均使用 `.adl-git-vis__card` 类，带有以下视觉属性，产生了悬浮分层感：

- `background: var(--bg-card)` — 独立于容器背景的卡片底色
- `border-radius: var(--radius-lg)` — 圆角边界
- `box-shadow: var(--shadow-sm)` / hover 时提升到 `var(--shadow-md)` — 阴影强化"浮起"效果

## 设计方案

### 核心思路

仅间距，无分隔线，无卡片样式。各区块与 Git 可视化区域共享同一背景色，区块之间仅靠垂直间距划分。

### CSS 变更

**文件**: `frontend/src/styles/regions/rightpanel/git-visualization.css`

#### 1. `.adl-git-vis__card` — 移除以下属性

| 属性 | 动作 | 原因 |
|------|------|------|
| `background: var(--bg-card)` | 删除 | 区块与容器背景合一 |
| `border-radius: var(--radius-lg)` | 删除 | 不再需要圆角边界 |
| `box-shadow: var(--shadow-sm)` | 删除 | 不再需要阴影 |
| `transition: box-shadow 0.2s` | 删除 | 不再有阴影过渡 |

保留：`padding`、`display: flex`、`flex-direction: column`、`flex-shrink: 0`

#### 2. `.adl-git-vis__card:hover` — 整条规则删除

不再需要 hover 阴影提升效果。

#### 3. `.adl-git-vis__card-desc` — 移除分隔线

| 属性 | 动作 | 原因 |
|------|------|------|
| `border-top: 1px solid var(--border-subtle)` | 删除 | "仅间距"不需要任何线条 |

保留：`padding`、`margin-top`、字体颜色/大小。

### 附加调整

#### 4. BranchGraph 顺序前移

**文件**: `frontend/src/app/features/git-visualization/GitVisualizationView.tsx`

将 `<ChartCard title={t.gitVisBranchGraph}>` 从末位移至 `<HeatmapCardGroup />` 之后（第 2 位），使分支图谱紧接热力聚合展示。

新顺序：
1. WorkspaceTabBar
2. HeatmapCardGroup
3. BranchGraph
4. CodeLineEvo
5. CommitTimeline
6. FileSunburst
7. 底部 note

#### 5. FileSunburst 水平居中

**文件**: `frontend/src/app/features/git-visualization/charts/FileSunburst.tsx`

`SunburstChart` 固定 `size={320}` 宽度，在其父级 wrapper `<div className="adl-git-vis__chart">` 上添加居中样式，使其在容器内水平居中而非偏左。

CSS 方案：在 wrapper div 上设 `display: flex; justify-content: center;`（内联 style 或专用 class）。

### 不变内容

- `ChartCard` wrapper、`HeatmapCardGroup` 结构均不修改
- 区块间 `gap: var(--space-4)` (16px) 保持不变
- 区块标题 (`h3`) 样式不变 — 作为各区块的唯一视觉标识
- 各图表组件内部逻辑不变
- 容器 `padding` 不变

## 验证

1. 亮/暗主题下区块背景均与容器背景一致
2. 区块间仅通过垂直间距区分
3. 标题和描述文字清晰可读
4. 所有图表功能不受影响
5. 无回归：现有测试通过