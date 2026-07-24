# Branch Graph — Git 分支图谱可视化

> 日期：2026-07-18
> 状态：设计已批准，待实现

## 1. 概述

在"变更面板"的 Git 可视化仪表盘中新增第 8 张卡片：**分支图谱（Branch Graph）**。以 VS Code GitLens Commit Graph 为参考风格，使用纯 SVG + CSS Grid 实现，零新增外部依赖。

## 2. 集成方式

在 `GitVisualizationView.tsx` 中 `ChartCard` 列表末尾、Mock Data Note 之前插入：

```tsx
<ChartCard title={t.gitVisBranchGraph} desc={t.gitVisBranchGraphDesc}>
  <BranchGraph />
</ChartCard>
```

## 3. 组件树

```
GitVisualizationView
  └─ ChartCard (第 8 张)
       └─ BranchGraph.tsx (新增)
            ├─ 数据准备（lane 分配、拓扑排序、行列表构建）
            ├─ BranchGraphSVG.tsx (新增，纯 SVG 泳道 + 节点 + 连接线)
            └─ HTML Table (CSS Grid 行列表)
                 └─ 每行：泳道占位 + hash + message + author + date
```

## 4. 数据模型

```typescript
interface CommitNode {
  id: string;
  hash: string;        // 7 字符短 hash
  branch: string;      // 所属分支名
  date: string;        // ISO 格式 "2026-01-15"
  message: string;     // 提交信息首行
  author: string;      // 作者名
  authorEmail: string; // 作者邮箱
  tag?: string;        // 可选的 tag 名，如 "v1.0"
}

interface CommitEdge {
  source: string;  // 子提交 id
  target: string;  // 父提交 id（合并提交有 2+ 条 edge）
}
```

### Mock 数据拓扑

28 个提交节点，7 条分支，覆盖 11 种场景：

```
main:       a1 ─ a2 ─ a3 ────────────────── a7 ─ a8 ── a10 ─────────────────── a14 ── a15
                        ╱                    ╱         ╱                        ╱
feature-1:              b1 ─ b2 ─ b3 ─ b4 ─ b5 ─ b6 ─ b7 ─ b8 ─────────────────
                        ╱
feature-2:        c1 ─ c2 ── c3 ── c4 ── c5 (unmerged)
                              ╱
feature-3:                  d1 ── d2 ── d3 ── d4
                                    ╱
feature-4:                      e1 ─ e2

release/v1.0:                         r1 ── r2 (from a8, tag v1.0)

hotfix:                                         h1 ── h2  (from a10)
```

### 覆盖场景

| # | 场景 | 说明 |
|---|------|------|
| 1 | 线性提交 | main: a1→a2→a3→a8→a10→a15 |
| 2 | 分支分叉 | feature-1、feature-2 从 a3 分出 |
| 3 | 分支合入 main | b5→a7（feature-1 → main） |
| 4 | 分支合入非 main | feature-3 → feature-2, feature-4 → feature-3 |
| 5 | Octopus Merge | a14 合并 b8 + h2 + a10（3 父） |
| 6 | 未合入分支 | feature-2 c5 悬空 |
| 7 | Hotfix 分支 | h1→h2 从 a10 拉出后合入 a14 |
| 8 | Release + Tag | r1→r2 从 a8 拉出，tag v1.0 |
| 9 | Chain 分叉 | feature-4 从 feature-3 分出 |
| 10 | 长生命周期分支 | feature-1 贯穿全程（8 提交） |
| 11 | 多作者 | 5 名作者交叉活跃 |

## 5. 渲染架构

### 5.1 布局方式

CSS Grid 行列表 + SVG 泳道绝对定位覆盖。

```css
grid-template-columns: auto 80px 1fr auto auto;
/* 泳道列  hash  message  author  date */
```

| 列 | 宽度 | 说明 |
|----|------|------|
| 泳道 | `auto` | `branches.length × (LANE_WIDTH + LANE_GAP)` |
| Hash | `80px` | monospace 7 字符 |
| Message | `1fr` | 弹性填充，`text-overflow: ellipsis` |
| Author | `auto` | 自适应内容 |
| Date | `auto` | 自适应内容，右对齐 |

### 5.2 布局常量

| 常量 | 值 | 说明 |
|------|-----|------|
| `LANE_WIDTH` | 24px | 每条分支泳道宽度 |
| `LANE_GAP` | 8px | 分支间距 |
| `ROW_HEIGHT` | 36px | 每行高度 |
| `NODE_RADIUS` | 6px | 普通节点圆半径 |
| `MERGE_NODE_SIZE` | 12px | 合并节点方形边长 |

### 5.3 Lane 分配算法

```
输入: CommitEdge[] + CommitNode[] + allBranches[]
输出: Map<branchName, laneIndex>

1. 按 allBranches 顺序分配初始 laneIndex
2. 遍历 edges 构建 DAG (child → parent 映射)
3. 对 merge commit (2+ parents)，取所有父 branch 的 laneIndex
4. 合并后保持在主分支 lane
5. 若 lane 冲突，后续 branch 右移
```

## 6. 视觉设计

### 6.1 泳道颜色

| 分支 | 亮色 | 暗色 |
|------|------|------|
| main | `#3b82f6` (blue-500) | `#60a5fa` (blue-400) |
| feature-1 | `#10b981` (emerald-500) | `#34d399` (emerald-400) |
| feature-2 | `#f59e0b` (amber-500) | `#fbbf24` (amber-400) |
| feature-3 | `#8b5cf6` (violet-500) | `#a78bfa` (violet-400) |
| feature-4 | `#ec4899` (pink-500) | `#f472b6` (pink-400) |
| release/v1.0 | `#06b6d4` (cyan-500) | `#22d3ee` (cyan-400) |
| hotfix | `#ef4444` (red-500) | `#f87171` (red-400) |

### 6.2 节点形状

| 类型 | 形状 | 说明 |
|------|------|------|
| 普通提交 | 实心圆 `r=6` | 白色外边框 |
| 合并提交 (merge) | 方形 `12×12, rx=2` | 圆角矩形 |
| Tag 提交 | 空心圆 `r=6` | 仅描边 |

### 6.3 连接线

| 类型 | 样式 | 说明 |
|------|------|------|
| 同分支父子 | 实线 `stroke-width=2.5` | 同一 lane 内垂直连接 |
| 分叉连接 | 实线水平 + 垂直 | 从父 lane 向右引出到子 lane |
| 合入连接 | 贝塞尔曲线虚线 | `stroke-dasharray="4,3"` |

### 6.4 分支标签

彩色 badge 渲染在 tip commit 行的右侧：

```tsx
<span style={{ background: branchColor, color: '#fff', borderRadius: 4,
               padding: '2px 8px', fontSize: 11, fontWeight: 600 }}>
  {branchName}
</span>
```

点击标签 → 筛选该分支所有行（其他行降低透明度），再次点击取消。

## 7. 交互行为

| 交互 | 效果 |
|------|------|
| Hover 整行 | 背景色微变 + tooltip（完整 hash + message + date + email） |
| Hover 节点 | 节点放大 1.2x |
| 点击分支标签 | 高亮该分支行，其他行降低透明度 |
| 滚动 | 卡片内 `overflow-y: auto` |

## 8. i18n 新增 key

en-US:

| Key | Value |
|-----|-------|
| `gitVisBranchGraph` | Branch Graph |
| `gitVisBranchGraphDesc` | Commit DAG with branch topology. Each vertical lane is a branch; dots are commits. |
| `gitVisBranch` | Branch |
| `gitVisBranchGraphFilterHint` | Click a branch label to filter |

zh-CN:

| Key | Value |
|-----|-------|
| `gitVisBranchGraph` | 分支图谱 |
| `gitVisBranchGraphDesc` | 带有分支拓扑的提交有向无环图。每条垂直泳道为一个分支，圆点为提交。 |
| `gitVisBranch` | 分支 |
| `gitVisBranchGraphFilterHint` | 点击分支标签可筛选 |

## 9. 错误处理与边界情况

| 场景 | 处理方式 |
|------|---------|
| 空数据（0 提交, 0 分支）| 显示 "No commits yet" 占位图 |
| 单分支无分叉 | 单条垂直 lane，无虚线连接线 |
| 分支名过长 | CSS `text-overflow: ellipsis` + tooltip 全名 |
| 超多分支（>8 条） | lane 宽度缩小至 16px，图表区横向滚动 |
| 超多提交（>200 行） | 虚拟滚动（仅渲染可视区域 ±buffer） |
| 合入线交叉冲突 | lane 分配算法后处理偏移调整 |
| 空数据提示文字 | i18n key |

## 10. 测试计划

| 层级 | 测试 | 内容 |
|------|------|------|
| 单元 | `lane 分配算法` | 3, 4, 7 分支场景 + octopus merge |
| 单元 | `拓扑排序` | 28 节点有序性验证 |
| 单元 | `坐标计算` | 节点 x/y 位置验证 |
| 组件 | `BranchGraph` | 渲染正确节点数、hover 行高亮、标签点击筛选 |
| 组件 | `空数据` | 占位图渲染 |
| 组件 | `单分支` | 无分叉场景 |
| 快照 | SVG 结构 | 不意外变化 |

## 11. 目录结构变更

```
frontend/src/app/features/git-visualization/
├── charts/
│   ├── BranchGraph.tsx          ← 新增：图谱主容器
│   ├── BranchGraphSVG.tsx       ← 新增：SVG 泳道 + 节点 + 连接线
│   ├── BranchGraphLane.tsx      ← 新增：单条泳道线
│   ├── BranchLabel.tsx          ← 新增：分支标签 badge
│   ├── BranchCommitInfo.tsx     ← 新增：提交信息行
│   └── BranchGraph.test.tsx     ← 新增：测试
├── data/
│   ├── gitVisMockData.ts        ← 修改：增强 CommitNode + 新拓扑
│   └── gitVisMockData.test.ts   ← 修改：适配新数据
├── GitVisualizationView.tsx     ← 修改：新增第 8 张 ChartCard
└── GitVisualizationView.test.tsx ← 修改：验证 8 张卡片

frontend/src/app/i18n/
├── en-US/changes.ts             ← 修改：新增 4 个 key
└── zh-CN/changes.ts             ← 修改：新增 4 个 key

frontend/src/styles/regions/rightpanel/
└── git-visualization.css        ← 修改：新增分支图谱样式
```
