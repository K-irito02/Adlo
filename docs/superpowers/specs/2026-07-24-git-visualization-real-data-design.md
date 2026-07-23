# Git 可视化真实数据接入 — 设计文档

> 日期：2026-07-24 | 状态：已批准

## 概述

将变更面板中 Git 可视化区域的 8 种图表从模拟数据切换到真实后端数据，新增独立时间范围选择器，并设计三级优先级的自动加载策略。

## 一、整体架构

```
┌─────────────────────────────────────────────────────────────────┐
│  Frontend (React)                                                │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │  GitVisualizationView                                       ││
│  │  ├─ WorkspaceTabBar (工作区切换 → 从缓存读取，不自动刷新)    ││
│  │  ├─ HeatmapCardGroup (含 TimeRangeSelector)                 ││
│  │  ├─ ChartCard: BranchGraph (无时间范围)                      ││
│  │  ├─ ChartCard: CodeLineEvo (含 TimeRangeSelector)           ││
│  │  ├─ ChartCard: CommitTimeline (含 TimeRangeSelector)        ││
│  │  ├─ ChartCard: FileSunburst (无时间范围)                     ││
│  │  └─ [移除 Mock Data Note]                                   ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                  │
│  Bridge Layer (tauri / preview / mock)                           │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │  WorkspaceBridge 新增 5 个 IPC 方法                          ││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
                         │ IPC
┌─────────────────────────────────────────────────────────────────┐
│  Backend (Rust / Node.js)                                        │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │  git log --pretty=format:... --since/--until → 聚合统计      ││
│  │  └→ 日历数据 / 时段分布 / 贡献者 / 代码行演变 / 提交时间线   ││
│  │  git log --all --topo-order --parents → 分支图谱 DAG         ││
│  │  git ls-files → 文件旭日图                                   ││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
```

### 时间范围需求矩阵

| 图表 | 需要时间范围 | 理由 |
|------|:---:|------|
| 提交日历 | 是 | 按年/月查看提交分布 |
| 提交时段 | 是 | 按时段统计需限定数据范围 |
| 贡献活跃度 | 是 | 贡献者统计需时间窗口 |
| 贡献者模块 | 是 | 模块修改统计需时间窗口 |
| 代码行演变 | 是 | 时间序列核心图表 |
| 提交时间线 | 是 | 时间序列核心图表 |
| 分支图谱 | 否 | 结构性 DAG |
| 文件旭日图 | 否 | 文件层级结构 |

## 二、工作区 Git 数据加载策略

复用设置面板"工作区加载"的三个列表作为自动刷新优先级。

### 三级优先级

| 列表 | 优先级 | 触发时机 |
|------|:---:|------|
| 优先加载列表 | 高 | 应用启动时同步/异步加载 |
| 延迟加载列表 | 中 | 首屏就绪后异步加载 |
| 工作区标签列表 | 低 | 高、中优先级全部完成后加载 |

### 升降级规则

| 场景 | 高优先级 | 中优先级 | 低优先级 |
|------|:--:|:--:|:--:|
| 两者均不为空 | 优先列表 | 延迟列表 | 标签列表 |
| 两者均为空 | 标签列表↑ | — | — |
| 优先为空，延迟不为空 | 延迟列表↑ | 标签列表↑ | — |
| 优先不为空，延迟为空 | 优先列表 | 标签列表↑ | — |

### 加载时序

```
应用启动
  │
  ├─[同步/异步]── 高优先级工作区 Git 数据全部拉取 ──→ 完成
  │                                                    │
  └─[首屏就绪后]─→ 中优先级工作区 Git 数据拉取 ──→ 完成
                                                        │
                                                        └─→ 低优先级工作区 Git 数据拉取
```

### 交互行为

- **切换工作区标签**：不自动刷新，使用缓存数据；缓存为空则显示加载骨架屏
- **单个图表刷新按钮**：仅刷新当前选中工作区的当前图表
- **全局刷新按钮**：仅刷新当前选中工作区的全部图表
- **时间范围切换**：仅刷新当前工作区 + 当前图表

## 三、后端 API 端点

### 端点 1：`git_vis_commit_stats`

服务于 4 个图表：提交日历 / 提交时段 / 贡献活跃度 / 提交时间线

- **参数**：`root_path: String`, `since: Option<String>`, `until: Option<String>`
- **后端实现**：一次 `git log --pretty=format:"%H|%h|%aI|%an|%ae|%s" --since=... --until=...` 拉取所有提交，聚合出 4 组统计

```typescript
interface GitVisCommitStats {
  dailyCommits: Array<{ date: string; count: number }>;
  hourlyDistribution: Array<{ day: number; hour: number; count: number }>;
  contributorActivity: Array<{
    author: string;
    authorEmail: string;
    totalCommits: number;
    periods: Array<{ period: string; count: number }>;
  }>;
  commitTimeline: Array<{ date: string; cumulative: number }>;
  commits: Array<{
    hash: string;
    shortHash: string;
    date: string;
    author: string;
    authorEmail: string;
    message: string;
  }>;
}
```

### 端点 2：`git_vis_code_evolution`

服务于代码行演变图表。

- **参数**：`root_path: String`, `since: Option<String>`, `until: Option<String>`
- **后端实现**：`git log --numstat --since/--until`，解析每行 `additions\tdeletions\tfile`，按周汇总

```typescript
interface GitVisCodeEvolution {
  weeks: Array<{ weekStart: string; additions: number; deletions: number }>;
}
```

### 端点 3：`git_vis_contributor_modules`

服务于贡献者模块热力图。

- **参数**：`root_path: String`, `since: Option<String>`, `until: Option<String>`
- **后端实现**：`git log --name-only --since/--until`，根据文件路径提取顶层目录作为"模块"

```typescript
interface GitVisContributorModules {
  matrix: Array<{
    author: string;
    authorEmail: string;
    modules: Array<{ module: string; count: number }>;
  }>;
}
```

### 端点 4：`git_vis_branch_graph`

服务于分支图谱。无时间范围参数。

- **参数**：`root_path: String`
- **后端实现**：`git log --all --topo-order --pretty=format:"%H|%h|%P|%D|%aI|%an|%ae|%s"` + `git branch --list` 构建 DAG

```typescript
interface GitVisBranchGraph {
  nodes: Array<{
    hash: string;
    shortHash: string;
    parentHashes: string[];
    branch: string;
    date: string;
    message: string;
    author: string;
    authorEmail: string;
    tag?: string;
  }>;
  edges: Array<{ from: string; to: string }>;
  branches: string[];
}
```

### 端点 5：`git_vis_file_sunburst`

服务于文件旭日图。无时间范围参数。

- **参数**：`root_path: String`
- **后端实现**：`git ls-files` + 文件大小（行数）构建层级树

```typescript
interface GitVisFileSunburst {
  tree: SunburstNode;
}

interface SunburstNode {
  name: string;
  type: "directory" | "file";
  size?: number;
  children?: SunburstNode[];
}
```

## 四、时间范围选择器

### 布局位置

每个需要时间范围的图表卡片 `header` 内放置独立 `TimeRangeSelector`：

```
ChartCard
├── header
│   ├── 标题 + 描述
│   ├── TimeRangeSelector
│   └── RefreshButton
├── [图表内容]
```

### 交互设计

```
┌─────────────────────────────────────────────────────┐
│  [◀] 近一月 ▼ | 2026-06-24 ~ 2026-07-24 [▶]        │
└─────────────────────────────────────────────────────┘
```

| 元素 | 行为 |
|------|------|
| 预设下拉 `▼` | 近一周 / 近一月 / 近一年 / 全部 / 自定义 |
| 日期区间显示 | 点击任一日期弹出日历面板 |
| `<` `>` 翻页 | 按当前粒度前后移动 |
| 自定义模式 | 选择起止日期后自动切入 |

### 预设与 API 参数映射

| 预设 | `since` | `until` |
|------|---------|---------|
| 近一周 | 7 天前 | 今天 |
| 近一月 | 1 月前 | 今天 |
| 近一年 | 1 年前 | 今天 |
| 全部 | `null` | `null` |
| 自定义 | 用户选择起始 | 用户选择结束 |

- 默认值：**近一年**
- 每个图表独立维护时间范围，互不影响

## 五、状态管理与数据流

### Zustand Slice：`gitVisSlice`

```typescript
interface GitVisSlice {
  gitVisData: Record<string, GitVisWorkspaceData>;
  gitVisLoading: Record<string, Record<string, boolean>>;
  gitVisTimeRange: Record<string, Record<string, TimeRangeState>>;
  gitVisLoadedPhases: Record<string, 'high' | 'medium' | 'low' | undefined>;

  setGitVisData: (workspaceId: string, chartId: string, data: unknown) => void;
  setGitVisLoading: (workspaceId: string, chartId: string, loading: boolean) => void;
  setGitVisTimeRange: (workspaceId: string, chartId: string, range: TimeRangeState) => void;
  clearWorkspaceGitVisData: (workspaceId: string) => void;
}

interface TimeRangeState {
  preset: 'week' | 'month' | 'year' | 'all' | 'custom';
  since?: string;
  until?: string;
}
```

### 数据刷新策略

- 切换时间范围时：保持旧数据显示，新数据到达后替换，避免闪白
- `commitStats` 端点一次返回 4 组数据，共用缓存
- 图表的加载、错误状态独立维护

### 跨图表请求去重

当同一工作区的多个图表使用相同时间范围且调用同一端点时，复用同一次请求结果。

## 六、错误处理与调试日志

### 错误处理

| 场景 | 处理方式 |
|------|---------|
| 非 git 仓库 | 相应图表卡片显示空状态，不展示为 error |
| git 命令失败 | 后端返回 `ok: false`，图表卡片内显示内联错误 + 重试按钮 |
| 部分成功/失败 | 每个卡片独立 error 状态 |
| IPC 超时（大仓库） | 60s 超时，提示减小时间范围 |

### 前端调试日志

前缀：`[ADL-GIT-VIS]`，使用 `console.debug`，仅开发环境输出。

| 日志点 | 内容 |
|--------|------|
| 启动加载 | 三级优先级计算结果、每级包含的工作区列表 |
| 请求发送 | workspaceId、chartId、since、until |
| 请求完成 | workspaceId、chartId、耗时 ms、数据量 |
| 请求失败 | workspaceId、chartId、错误信息 |
| 缓存命中 | workspaceId、chartId、缓存年龄 |
| 时间范围变更 | workspaceId、chartId、旧范围 to 新范围 |

### 后端调试日志

前缀：`[ADL-GIT-VIS]`，使用 `tracing::debug`。

| 日志点 | 内容 |
|--------|------|
| 各端点 | 执行的 git 命令文本、返回记录数、聚合耗时 |
| 所有端点 | 总耗时（命令执行 + 聚合计算） |

日志格式统一：`[ADL-GIT-VIS] [endpoint] [workspace_id] <message>`

## 七、实现清单

### 后端（Rust）

- [ ] `crates/workspace/src/git/git_visualization.rs` — 新建，5 个端点的数据生成函数
  - `capture_commit_stats(root, since, until) -> GitVisCommitStats`
  - `capture_code_evolution(root, since, until) -> GitVisCodeEvolution`
  - `capture_contributor_modules(root, since, until) -> GitVisContributorModules`
  - `capture_branch_graph(root) -> GitVisBranchGraph`
  - `capture_file_sunburst(root) -> GitVisFileSunburst`
- [ ] `crates/types/src/types/visualization.rs` — 新建，返回数据类型
- [ ] `src-tauri/src/commands/workspace_git_vis.rs` — 新建，5 个 Tauri command
- [ ] `src-tauri/src/main.rs` — 注册 5 个 command
- [ ] `src-tauri/permissions/` — 添加权限声明

### 后端（Preview Bridge / Node.js）

- [ ] `frontend/dev/previewWorkspaceService/gitVisualization.ts` — 新建，同步实现 5 个端点
- [ ] `frontend/dev/previewWorkspaceService/index.ts` — 注册路由

### 前端 — IPC Bridge

- [ ] `shared/ipc/workspace.ts` — `WorkspaceBridge` 新增 5 个方法类型
- [ ] `tauri-bridge/tauri-workspace.ts` — Tauri 调用实现
- [ ] `preview-bridge/preview-git.ts` — Preview HTTP 调用实现
- [ ] `mock/mock-workspace.ts` — Mock 保持现有模拟数据实现

### 前端 — 状态管理与数据层

- [ ] `stores/slices/gitVisSlice.ts` — 新建 Zustand slice
- [ ] `stores/actions/gitVisActions.ts` — 新建 actions（fetch/缓存/优先级加载）
- [ ] 启动时三级优先级加载逻辑

### 前端 — 组件

- [ ] `TimeRangeSelector.tsx` — 新建，时间范围选择器组件
  - 预设下拉菜单
  - 自定义日期范围选择（日历面板）
  - 翻页按钮
- [ ] `GitVisualizationView.tsx` — 修改，接入真实数据
  - 图表组件传入真实数据 + 时间范围回调
  - 移除 Mock Data Note
  - 添加加载/错误/空状态处理
- [ ] 各图表组件 — 修改，适配真实数据类型（替换 mock 数据引用）
  - `CalendarHeatmap.tsx`
  - `ClockHeatmap.tsx`
  - `ContributorActivityHeatmap.tsx`
  - `ContributorModuleHeatmap.tsx`
  - `BranchGraph.tsx`
  - `CodeLineEvo.tsx`
  - `CommitTimeline.tsx`
  - `FileSunburst.tsx`
- [ ] `HeatmapCardGroup.tsx` — 修改，添加时间范围选择器
- [ ] `ChartCard` — 修改，header 支持时间范围选择器插槽
- [ ] `RefreshButton.tsx` — 修改，接入真实刷新逻辑
- [ ] `useGitVisRefresh.ts` — 替换 stub 实现，接入真实 action

### 调试日志

- [ ] 前端：所有 [ADL-GIT-VIS] 日志点
- [ ] 后端：所有 tracing::debug 日志点
