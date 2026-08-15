# 文件热点组合视图（旭日图 + 排行榜）设计文档

**日期**: 2026-08-02
**状态**: 待审阅
**作者**: Brainstorming session
**关联**: 替代并扩展现有「文件旭日图」可视化

---

## 1. 背景与动机

### 1.1 现状问题

当前「文件旭日图」（`FileSunburst.tsx`）使用 `git ls-files` 作为数据源，每个文件的 `size` 固定为 1。这导致：

1. **数据源错位**：展示的是「仓库文件目录结构」而非「变更热度」，无法定位热点文件
2. **第三方干扰**：`node_modules`、`vendor`、生成代码与热点文件享有同等权重
3. **视觉混乱**：大量文件下扇形图变成「密密麻麻的披萨」，完全无法识别热点

### 1.2 用户需求

「速定位热点文件与高活跃模块」—— 这需要：
- **模块维度概览**：变更集中在哪些目录
- **文件维度细节**：具体是哪些文件在变
- **量化指标**：变更次数 + 代码行变化量

### 1.3 方案选择

经过 5 套方案对比（改进旭日图 / Treemap / 排行榜 / 组合视图 / 火焰图），选择 **方案 D：组合视图**：
- 上方：旭日图（仅目录节点，面积=变更次数，颜色=热度/时间）
- 下方：排行榜（扁平文件列表，多指标排序）
- 两者联动：点击旭日图扇形 → 排行榜筛选对应模块

后端数据结构方案选择 **方案 2：后端构建完整树 + 前端直接消费**（Rust 端做聚合和树构建，前端拿到即用）。

---

## 2. 后端数据模型与 IPC 契约

### 2.1 新增 Rust 类型

文件位置：`crates/types/src/types/git_visualization.rs`

#### 2.1.1 `GitVisFileHotspotNode`（树节点）

```rust
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct GitVisFileHotspotNode {
    pub name: String,
    pub node_type: String,           // "directory" | "file"
    #[serde(skip_serializing_if = "Option::is_none")]
    pub change_count: Option<i32>,   // 变更次数（目录=子节点求和，文件=直接值）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub additions: Option<i32>,      // 新增行数
    #[serde(skip_serializing_if = "Option::is_none")]
    pub deletions: Option<i32>,      // 删除行数
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_modified: Option<String>, // ISO 8601 最近修改时间（仅文件节点有）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub children: Option<Vec<GitVisFileHotspotNode>>,
}
```

#### 2.1.2 `GitVisFileHotspotFile`（扁平文件列表元素）

```rust
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct GitVisFileHotspotFile {
    pub path: String,          // 完整相对路径，如 "src/core/engine.ts"
    pub change_count: i32,
    pub additions: i32,
    pub deletions: i32,
    pub last_modified: String, // ISO 8601
}
```

#### 2.1.3 `GitVisFileHotspots`（IPC 返回信封）

```rust
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct GitVisFileHotspots {
    pub tree: GitVisFileHotspotNode,       // 完整目录树（含文件叶子，前端按需过滤）
    pub files: Vec<GitVisFileHotspotFile>, // 扁平文件列表（已按 change_count 降序）
}
```

### 2.2 IPC 命令

新增 `workspace_git_vis_file_hotspots`（旧 `workspace_git_vis_file_sunburst` 保留但前端不再调用）：

```rust
#[tauri::command]
pub async fn workspace_git_vis_file_hotspots(
    app: tauri::AppHandle,
    root_path: String,
    since: Option<String>,
    until: Option<String>,
) -> Result<IpcResult<GitVisFileHotspots>, AppError>
```

- 接受 `since`/`until` 时间范围参数（与 `commit_stats`/`code_evolution` 一致）
- 走 `git_vis_cache::with_cached` 缓存，新增 `CHART_TYPE_FILE_HOTSPOTS = "file-hotspots"` 常量
- 缓存 key 包含 `(root_path, since, until, chart_type)`，时间范围变更时自动失效

### 2.3 后端实现要点

文件位置：`crates/workspace/src/git/git_vis/hotspots.rs`（新建，与 `sunburst.rs` 并列）

#### 2.3.1 git 命令

```bash
git log --pretty=format:%H|%aI --numstat --since=... --until=...
```

#### 2.3.2 聚合逻辑

- 每条 numstat 行：`additions\tdeletions\tpath` → 累加到 `path` 的 `changeCount/additions/deletions`，并更新 `lastModified`（取最新提交时间）
- 二进制文件（numstat 显示 `-` `-`）按 `changeCount += 1` 处理，`additions/deletions` 不累加
- 单行解析失败 → 跳过该行，`tracing::warn!` 记录，不中断整体聚合

#### 2.3.3 树构建

- 复用 `sunburst.rs` 的 `add_to_sunburst` 模式，但注入热度字段
- 目录节点的 `changeCount/additions/deletions` = 子节点求和
- 目录节点的 `lastModified` = 子节点最大值
- 同时输出扁平 `files` 数组（按 `changeCount` 降序排序）

#### 2.3.4 边界情况

- 空仓库/无变更：返回 `tree: { name: "root", nodeType: "directory", children: [] }`, `files: []`
- 文件重命名/移动：`git log --numstat` 默认不跟踪重命名，重命名前后被视为两个文件。这是已知限制，符合「仅靠 .gitignore」的极简策略，不额外处理。

---

## 3. 前端架构与组件拆分

### 3.1 整体布局

```
┌─ TimeRangeAwareCard ─────────────────────────────────────┐
│  [刷新] 文件修改热度  [时间范围选择器]  [颜色模式切换]      │
├──────────────────────────────────────────────────────────┤
│  ┌─ FileHotspotsView (新组件) ─────────────────────────┐  │
│  │                                                      │  │
│  │  ┌─ FileSunburstChart (改造) ──────────────────────┐ │  │
│  │  │  [面包屑: root > src > core]                     │ │  │
│  │  │       ┌─── 旭日图 (仅目录) ───┐                  │ │  │
│  │  │       │  扇形面积=变更次数     │                  │ │  │
│  │  │       │  颜色=热度/时间(可切换) │                  │ │  │
│  │  │       └──────────────────────┘                  │ │  │
│  │  │  [提示文字: 点击扇形可下钻 / 当前路径 / 点击中心]  │ │  │
│  │  └──────────────────────────────────────────────────┘ │  │
│  │                                                      │  │
│  │  ┌─ FileHotspotsRanking (新组件) ──────────────────┐ │  │
│  │  │  [筛选路径: root/src/core]  [X 清除筛选]         │ │  │
│  │  │  ┌──────────────────────────────────────────────┐│ │  │
│  │  │  │ # │ 文件 │ 变更次数↑ │ 新增 │ 删除 │ 净变化  ││ │  │
│  │  │  │ 1 │ ...  │ 24       │ 120  │ 45   │ +75     ││ │  │
│  │  │  │ 2 │ ...  │ 18       │ 89   │ 30   │ +59     ││ │  │
│  │  │  │ ... (虚拟滚动)                               ││ │  │
│  │  │  └──────────────────────────────────────────────┘││ │  │
│  │  └──────────────────────────────────────────────────┘ │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                            │
│  [底部说明文字]                                             │
└────────────────────────────────────────────────────────────┘
```

### 3.2 组件清单

#### 3.2.1 新建组件

| 文件 | 职责 | 接口 |
|------|------|------|
| `charts/FileHotspotsView.tsx` | **组合容器**，持有共享状态，协调旭日图与排行榜 | `data?: GitVisFileHotspots` |
| `charts/FileHotspotsRanking.tsx` | 排行榜列表，表头排序 + 虚拟滚动 + 路径筛选 | `files`, `filterPath`, `onClearFilter`, `sortState` |
| `hooks/useFileHotspotsState.ts` | 集中管理下钻路径 + 颜色模式 + 排序状态 | 返回 state + setters |

#### 3.2.2 改造组件

| 文件 | 改造内容 |
|------|---------|
| `charts/FileSunburst.tsx` → `FileSunburstChart.tsx` | 数据源从 `adaptSunburstData` 改为 `adaptHotspotsTree`；新增 `colorMode` prop；旭日图只渲染目录节点；下钻时调用 `onDrill(path)` |
| `adapters/chartDataAdapters.ts` | 新增 `adaptHotspotsTree`（过滤文件叶子，映射为 `SunburstNode`）+ `filterFilesByPath`（按路径前缀过滤） |
| `GitVisualizationView.tsx` | `FileSunburst` 引用改为 `FileHotspotsView`；数据类型从 `GitVisFileSunburst` 改为 `GitVisFileHotspots`；`CHART_IDS.FILE_SUNBURST` 保留，映射到新端点 |

#### 3.2.3 不变组件

- `ModuleBreadcrumb` — 直接复用，接收 `pathSegments` 和 `onNavigate`
- `SunburstChart` / `SunburstSegment` / `SunburstCenter` / `SunburstHint` — 底层图表组件不变（`SunburstSegment` 新增可选 `fill` 和 `tooltipText` props）
- `TimeRangeAwareCard` — 不变，`headerExtra` 新增颜色模式切换器

### 3.3 状态管理

`useFileHotspotsState` hook 持有以下状态（组件内部，不入 Zustand）：

```typescript
interface FileHotspotsState {
  drillPath: string[];              // 下钻路径，如 ['src', 'core']
  setDrillPath: (path: string[]) => void;
  colorMode: 'heat' | 'time';       // 颜色编码模式
  setColorMode: (mode: 'heat' | 'time') => void;
  sortKey: 'changeCount' | 'additions' | 'deletions' | 'net';
  sortDir: 'asc' | 'desc';
  setSort: (key: FileHotspotsState['sortKey']) => void;
}
```

**设计依据**：这些状态是 FileHotspotsView 的局部交互态，不需要跨组件共享，不需要持久化。与 `ContributorModuleHeatmap` 的 `drillPath` 处理方式一致。

### 3.4 联动数据流

```
用户点击旭日图 src/core 扇形
  ↓
FileSunburstChart 调用 onDrill(['src', 'core'])
  ↓
useFileHotspotsState.setDrillPath(['src', 'core'])
  ↓
FileHotspotsView 重新计算：
  ├─ FileSunburstChart: 旭日图 zoomTo src/core
  └─ FileHotspotsRanking: filterFilesByPath(files, ['src', 'core'])
       → 只显示 src/core/ 下的文件
       → 顶部显示 [筛选路径: root/src/core] [X 清除]
  ↓
用户点击 [X 清除] 或旭日图中心
  ↓
setDrillPath([]) → 旭日图回到根，排行榜显示全部文件
```

### 3.5 颜色模式切换

颜色模式切换器放在 `TimeRangeAwareCard` 的 `headerExtra`：

- **热度色阶**（默认）：扇形填充色 = `changeCount` 映射到色阶（冷蓝→暖红）
- **时间色阶**：扇形填充色 = `lastModified` 映射到色阶（蓝=久远，红=近期）

旭日图适配层根据 `colorMode` 为每个目录节点计算 `fill` 属性，传入 `SunburstSegment`。

---

## 4. 旭日图适配层与渲染逻辑

### 4.1 数据适配：`adaptHotspotsTree`

```typescript
interface GitVisHotspotNodeInput {
  name: string;
  nodeType: 'directory' | 'file';
  changeCount?: number;
  additions?: number;
  deletions?: number;
  lastModified?: string;
  children?: GitVisHotspotNodeInput[];
}

interface HotspotArcMeta {
  changeCount: number;
  additions: number;
  deletions: number;
  lastModified: string | null;
}

export function adaptHotspotsTree(
  root: GitVisHotspotNodeInput,
  colorMode: 'heat' | 'time',
): { tree: SunburstNode; arcMeta: Map<number, HotspotArcMeta> }
```

**关键设计**：
- **过滤文件叶子**：递归时跳过 `nodeType === 'file'` 的节点，只把 directory 加入树
- **目录的 `changeCount` 已经是子节点求和**（后端聚合），直接作为 `value`
- **`arcMeta` Map**：旭日图的 `SunburstNode` 只有 `name/value/children`，无法承载额外字段。用 `Map<arcId, HotspotArcMeta>` 在适配层旁路存储，`SunburstSegment` 通过 `index` 查询对应的元数据
- **空目录处理**：如果某目录过滤后 `children` 为空数组，跳过该目录（不加入树）。保留根节点 `{ name: 'root', value: 0, children: [] }`，避免旭日图渲染为空

### 4.2 颜色映射

新增 `computeArcFill(meta: HotspotArcMeta, colorMode, allMetas): string`：

- **热度模式**：`changeCount` 归一化到 `[0, maxChangeCount]`，映射到色阶。复用 `buildHeatmapFillScale(HEATMAP_DEFAULT_LEVEL_STYLES)`
- **时间模式**：`lastModified` 转为时间戳，归一化到 `[minTime, maxTime]`，映射到色阶（蓝=久远→红=近期）
- **边界情况**：只有一个目录时（maxCount=0 或时间范围为零），返回色阶中点色，避免除零

`SunburstSegment` 改造：新增可选 `fill` prop。如果传入则使用该颜色，否则保持原有默认配色。

### 4.3 Tooltip 增强

现有 `SunburstSegment` 已有 `<title>` 元素。tooltip 内容从 `name` 扩展为多行：

```
src/core/
变更: 24 次
+120 / -45 行
最近: 2026-07-31
```

**实现**：`SunburstSegment` 新增可选 `tooltipText` prop。`FileSunburstChart` 在渲染时，从 `arcMeta` 查询元数据并格式化为多行文本。底层 segment 优先使用 `tooltipText`，否则回退到 `name`。

### 4.4 下钻交互改造

- `FileSunburstChart` 仍是旭日图的下钻状态所有者（`SunburstChart` 的 focus 状态在内部）
- 旭日图 focus 变化时，`FileSunburstChart` 通过 `onDrill(trailPath)` 回调将路径数组通知 `FileHotspotsView`
- `trailPath` 来自 `useSunburstBreadcrumbItems().items`，映射为 `string[]`（去掉 root）
- `FileHotspotsView` 接收后调用 `setDrillPath(trailPath)`，触发排行榜筛选

**反向联动**：`FileHotspotsView` 持有 `zoomToRoot` ref，传给 `FileSunburstChart`。用户点击排行榜 [X 清除] 时，调用 `zoomToRoot()`，旭日图通过 `useSunburstBreadcrumbItems().zoomTo(rootId)` 回到根。

### 4.5 提示文字（Hint）3 态扩展

- **默认**：`点击扇形可下钻`（不变）
- **悬停**：显示悬停目录的 `name › 变更次数 次`（如 `src/core › 24 次变更`）
- **缩放**：`点击中心可缩放`（不变）

---

## 5. 排行榜组件设计

### 5.1 数据流与职责

`FileHotspotsRanking` 接收：
- `files: GitVisFileHotspotFile[]` — 后端返回的完整扁平文件列表（已按 `changeCount` 降序）
- `filterPath: string[]` — 当前下钻路径，空数组表示无筛选
- `onClearFilter: () => void` — 清除筛选回调
- `sortState` — 排序状态 + `onSort` 回调

### 5.2 筛选逻辑

```typescript
function filterFilesByPath(
  files: GitVisFileHotspotFile[],
  filterPath: string[],
): GitVisFileHotspotFile[] {
  if (filterPath.length === 0) return files;
  const prefix = filterPath.join('/') + '/';
  return files.filter((f) => f.path.startsWith(prefix));
}
```

**边界情况**：
- `filterPath` 为空 → 返回全部文件
- 筛选后无文件 → 显示空状态「该目录下无变更文件」（遵循项目空状态规范：无句号、居中、使用 `EmptyRow` 组件）
- 文件路径与筛选前缀大小写：git 路径区分大小写，直接 `startsWith` 即可

### 5.3 排序逻辑

排序状态在 `useFileHotspotsState` 中管理：

```typescript
interface RankingSortState {
  sortKey: 'changeCount' | 'additions' | 'deletions' | 'net';
  sortDir: 'asc' | 'desc';
  onSort: (key: RankingSortState['sortKey']) => void;
}
```

排序规则：
- `changeCount` — 变更次数（默认，降序）
- `additions` — 新增行数
- `deletions` — 删除行数
- `net` — 净变化量 = `additions - deletions`（计算字段）

点击表头行为：
- 点击当前排序列 → 切换 `asc`/`desc`
- 点击新列 → 切换到该列，默认 `desc`
- 表头显示排序方向指示符（`↑`/`↓`）

### 5.4 虚拟滚动

基于固定行高 + 容器 `scrollTop` 的轻量级实现（不引入新依赖）：

```typescript
const ROW_HEIGHT = 32;
const OVERSCAN = 5;

const { startIndex, endIndex } = useMemo(() => {
  const visibleCount = Math.ceil(containerHeight / ROW_HEIGHT) + OVERSCAN * 2;
  const start = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
  return { startIndex: start, endIndex: Math.min(sorted.length, start + visibleCount) };
}, [scrollTop, containerHeight, sorted.length]);
```

**容器高度**：排行榜区域固定 `max-height: 320px`（与旭日图等高，视觉对称），超出滚动。文件数少时自适应高度。

### 5.5 列设计

| 列 | 宽度 | 内容 | 对齐 | 可排序 |
|----|------|------|------|--------|
| # | 40px | 序号（基于当前排序） | 右对齐 | 否 |
| 文件 | 自适应 | 文件名（相对于 `filterPath` 的路径，截断 + tooltip） | 左对齐 | 否 |
| 变更次数 | 80px | `changeCount` | 右对齐 | 是（默认） |
| 新增 | 70px | `+additions`（绿色） | 右对齐 | 是 |
| 删除 | 70px | `-deletions`（红色） | 右对齐 | 是 |
| 净变化 | 80px | `+net`/`-net`（绿/红） | 右对齐 | 是 |

**文件名列**：
- 显示相对于 `filterPath` 的路径。如 `filterPath=['src']`，文件 `src/core/engine.ts` 显示为 `core/engine.ts`
- 若无筛选，显示完整相对路径
- 长路径截断（左侧省略，保留文件名），鼠标悬停显示完整路径（原生 `<span title>`）

**数字列格式化**：
- 千分位分隔（如 `1,204`）
- 新增列前缀 `+`，删除列前缀 `-`
- 净变化：正数 `+75` 绿色，负数 `-30` 红色，零 `0` 灰色

### 5.6 筛选路径提示栏

当 `filterPath` 非空时，排行榜顶部显示筛选提示栏：

```
[筛选: root > src > core]  [X 清除]
```

- 复用 `ModuleBreadcrumb` 组件渲染路径（与旭日图面包屑视觉一致）
- 点击面包屑项可逐级回退
- 右侧 [X] 按钮一键清除筛选

**联动一致性**：排行榜面包屑与旭日图面包屑都从 `useFileHotspotsState.drillPath` 派生，天然一致。

### 5.7 行交互

- **悬停**：行高亮（`--adl-row-hover-bg`）
- **点击文件行**：无特殊行为（MVP 阶段不做「打开文件」功能，YAGNI）
- **无右键菜单**（YAGNI）

---

## 6. IPC 桥接、时间范围、错误处理

### 6.1 IPC 桥接层同步

按 `error-handling.md` 三端对齐原则，新增 `gitVisFileHotspots` 方法需同步更新四处：

#### 6.1.1 `shared/ipc/workspace.ts`（接口定义）

```typescript
interface WorkspaceBridge {
  gitVisFileHotspots(
    rootPath: string,
    since?: string,
    until?: string,
  ): Promise<IpcResult<GitVisFileHotspots>>;
}
```

#### 6.1.2 `tauri-bridge/tauri-workspace.ts`（真实实现）

```typescript
gitVisFileHotspots: (rootPath, since, until) =>
  invokeIpc('workspace_git_vis_file_hotspots', { rootPath, since, until }),
```

#### 6.1.3 `preview-bridge/preview-git.ts`（浏览器预览模式）

```typescript
gitVisFileHotspots: async (rootPath, since, until) => {
  const data = await requestPreviewApi<GitVisFileHotspots>(
    'git-vis/file-hotspots',
    { rootPath, since, until },
  );
  return { ok: true, data };
},
```

对应 `dev/previewWorkspaceService/gitVisualization.ts` 新增 `handleFileHotspots(rootPath, since, until)` —— 调用 `runGit` 执行 `git log --numstat` 并在 Node 端聚合（与 Rust 端逻辑镜像）。

#### 6.1.4 `mock/mock-workspace.ts`（测试 mock）

```typescript
gitVisFileHotspots: vi.fn().mockResolvedValue({
  ok: true,
  data: fileHotspotsMockData,
}),
```

#### 6.1.5 旧端点处理

旧端点 `gitVisFileSunburst` 三端保留实现（避免破坏现有测试），但前端 `GitVisualizationView` 不再调用。

### 6.2 时间范围接入

`useChartData.ts` 的 `TIME_RANGE_CHARTS` Set 新增 `CHART_IDS.FILE_SUNBURST`：

```typescript
const TIME_RANGE_CHARTS = new Set<string>([
  CHART_IDS.HEATMAP,
  CHART_IDS.CODE_LINE_EVO,
  CHART_IDS.COMMIT_TIMELINE,
  CHART_IDS.CONTRIBUTOR_MODULES,
  CHART_IDS.FILE_SUNBURST, // 新增
]);
```

**默认时间范围**：复用 `defaultTimeRange()`，与其他有时间范围的图表一致。

**`useGitVisRefresh` 改造**：
- `refreshChart(CHART_IDS.FILE_SUNBURST)` 内部 IPC 调用从 `bridge.gitVisFileSunburst(rootPath)` 改为 `bridge.gitVisFileHotspots(rootPath, since, until)`
- 从 store 读取 `gitVisTimeRange[workspaceId][CHART_IDS.FILE_SUNBURST]` 获取时间范围

### 6.3 缓存策略

`src-tauri/src/commands/git_vis_cache.rs` 新增 `CHART_TYPE_FILE_HOTSPOTS = "file-hotspots"` 常量。缓存 key 包含 `(root_path, since, until, chart_type)`，时间范围变更时自动失效。

### 6.4 错误处理

**后端错误**（Rust）：
- `git log` 失败 → `AppError::Workspace("git log --numstat failed for file_hotspots".into())`
- 空仓库/无变更 → 不报错，返回空树和空数组
- numstat 解析失败的单行 → 跳过该行，`tracing::warn!` 记录，不中断整体聚合

**前端错误**（遵循 `error-handling.md`）：
- IPC 失败 → `captureTypedError(get, error)` 捕获，UI 显示 `timeRange.error`
- 数据为空 → 旭日图显示「无目录级变更」提示，排行榜显示空状态 `EmptyRow`

**Loading 状态**：
- `useChartData` 的 `loading` 已有，`TimeRangeAwareCard` 显示骨架屏
- 排行榜独立组件不需要自己的 loading（数据由父组件传入，loading 时整个卡片显示骨架）

---

## 7. i18n 与 CSS

### 7.1 i18n 新增 key

文件位置：`frontend/src/app/i18n/{zh-CN,en-US}/changes.ts`

| Key | zh-CN | en-US |
|-----|-------|-------|
| `gitVisFileHotspotsTitle` | 文件修改热度 | File Modification Hotspots |
| `gitVisFileHotspotsDesc` | 上方旭日图展示模块分布（面积=变更次数，颜色=热度/时间），下方排行榜列出所有变更文件，点击扇形可筛选对应模块的文件 | Sunburst above shows module distribution (area = change count, color = heat/time). Ranking below lists all changed files; click an arc to filter by module |
| `gitVisHotspotsColorModeHeat` | 热度色阶 | Heat color scale |
| `gitVisHotspotsColorModeTime` | 时间色阶 | Time color scale |
| `gitVisHotspotsRankingFile` | 文件 | File |
| `gitVisHotspotsRankingChangeCount` | 变更次数 | Changes |
| `gitVisHotspotsRankingAdditions` | 新增 | Added |
| `gitVisHotspotsRankingDeletions` | 删除 | Deleted |
| `gitVisHotspotsRankingNet` | 净变化 | Net |
| `gitVisHotspotsRankingEmpty` | 该目录下无变更文件 | No changed files in this directory |
| `gitVisHotspotsFilterClear` | 清除筛选 | Clear filter |
| `gitVisHotspotsNoDirectoryChanges` | 无目录级变更 | No directory-level changes |
| `gitVisHotspotsTooltipChanges` | 变更 {count} 次 | {count} changes |
| `gitVisHotspotsTooltipLines` | +{add} / -{del} 行 | +{add} / -{del} lines |
| `gitVisHotspotsTooltipLastModified` | 最近 {date} | Last modified {date} |

**旧 key 处理**：`gitVisFileSunburstDesc` 保留但不再使用，避免破坏 i18n 快照测试。

### 7.2 CSS 样式

新增样式写入 `frontend/src/styles/regions/rightpanel/git-visualization.css`：

- `.adl-file-hotspots-view` — 组合容器，flex column 布局
- `.adl-file-hotspots-ranking` — 排行榜容器
- `.adl-file-hotspots-ranking__header` — 表头行
- `.adl-file-hotspots-ranking__row` — 数据行（含 hover 高亮）
- `.adl-file-hotspots-ranking__cell` — 单元格（按列对齐）
- `.adl-file-hotspots-ranking__sort-indicator` — 排序方向指示符
- `.adl-file-hotspots-ranking__filter-bar` — 筛选路径栏
- `.adl-file-hotspots-color-toggle` — 颜色模式切换器
- `.adl-file-sunburst--hotspots` — 旭日图容器（在热点视图中的变体）

**CSS 架构规则**：所有颜色使用 CSS 变量（`var(--text-primary)` 等），不硬编码色值。新增/删除列的颜色使用语义变量（`var(--success)` / `var(--danger)`）。

---

## 8. 测试策略

### 8.1 Rust 后端测试

文件位置：`crates/workspace/src/git/git_vis/hotspots.rs` 内 `#[cfg(test)]`

- `aggregate_numstat_by_path`：验证 numstat 行解析、按文件路径聚合 `changeCount/additions/deletions`、`lastModified` 取最新
- `build_hotspot_tree`：验证目录树构建、目录节点聚合子节点求和、空目录处理
- `binary_file_handling`：numstat 行 `-	-	binary.png` 应 `changeCount += 1`，`additions/deletions` 不累加
- 集成测试（`#[ignore]`，需 git）：创建临时 git 仓库，提交几次变更，验证端到端聚合

### 8.2 前端适配层测试

文件位置：`adapters/__tests__/chartDataAdapters.test.ts`（扩展）

- `adaptHotspotsTree` 过滤文件叶子、保留目录、`value = changeCount`
- `adaptHotspotsTree` 空目录跳过、根节点保留
- `filterFilesByPath` 前缀匹配、空 filterPath 返回全部、无匹配返回空数组

### 8.3 组件测试

- `FileHotspotsView.test.tsx`（新建）：验证组合容器渲染旭日图 + 排行榜、下钻联动（点击旭日图 → 排行榜筛选、清除筛选 → 旭日图回根）
- `FileHotspotsRanking.test.tsx`（新建）：验证表头排序切换、虚拟滚动渲染可见行、空状态、筛选路径栏
- `FileSunburstChart.test.tsx`（改造自 `FileSunburst.test.tsx`）：验证数据源切换、颜色模式 prop、tooltip 多行内容、`onDrill` 回调

### 8.4 IPC 桥接测试

- `mock-workspace.ts` 的 `gitVisFileHotspots` mock 与新类型一致
- `test-fixtures/gitVisMockData.ts` 新增 `fileHotspotsMockData`（基于真实类型定义，覆盖常规路径 + 边界：空仓库、单文件、深层嵌套）

### 8.5 回归测试

- `GitVisualizationView.test.tsx` 更新：验证 `FileHotspotsView` 替代 `FileSunburst` 后仍正确渲染
- i18n 快照测试：新增 key 在 zh-CN 和 en-US 都存在

---

## 9. 已知限制与未来扩展

### 9.1 已知限制

1. **文件重命名不跟踪**：`git log --numstat` 默认不跟踪重命名，重命名前后被视为两个文件
2. **排行榜无文件打开功能**：MVP 阶段不做「点击文件行打开编辑器」（YAGNI）
3. **虚拟滚动自实现**：未引入成熟虚拟滚动库，极端大量数据（>10k 行）时可能需评估性能
4. **旧端点保留**：`workspace_git_vis_file_sunburst` 保留但不再使用，后续可清理

### 9.2 未来扩展

1. **`--follow` 重命名跟踪**：后端可加 `--follow` 选项，但会改变 numstat 输出格式，需评估
2. **文件点击打开**：排行榜行点击后通过 IPC 打开文件到编辑器
3. **按作者维度筛选**：在文件热点基础上叠加作者筛选
4. **导出 CSV**：排行榜支持导出为 CSV

---

## 10. 文件清单

### 10.1 新建文件

| 文件 | 职责 |
|------|------|
| `crates/workspace/src/git/git_vis/hotspots.rs` | Rust 后端聚合逻辑 |
| `crates/types/src/types/git_visualization.rs`（扩展） | 新增 3 个 Rust 类型 |
| `frontend/src/app/features/git-visualization/charts/FileHotspotsView.tsx` | 组合容器组件 |
| `frontend/src/app/features/git-visualization/charts/FileHotspotsRanking.tsx` | 排行榜组件 |
| `frontend/src/app/features/git-visualization/hooks/useFileHotspotsState.ts` | 状态管理 hook |
| `frontend/src/app/features/git-visualization/charts/__tests__/FileHotspotsView.test.tsx` | 组件测试 |
| `frontend/src/app/features/git-visualization/charts/__tests__/FileHotspotsRanking.test.tsx` | 组件测试 |

### 10.2 修改文件

| 文件 | 改造内容 |
|------|---------|
| `crates/types/src/types/git_visualization.rs` | 新增 3 个类型 |
| `src-tauri/src/commands/git_vis_cache.rs` | 新增 `CHART_TYPE_FILE_HOTSPOTS` |
| `src-tauri/src/commands/workspace_git_vis.rs` | 新增 `workspace_git_vis_file_hotspots` 命令 |
| `frontend/src/shared/ipc/workspace.ts` | 新增接口方法 |
| `frontend/src/tauri-bridge/tauri-workspace.ts` | 新增实现 |
| `frontend/src/preview-bridge/preview-git.ts` | 新增 preview 实现 |
| `frontend/dev/previewWorkspaceService/gitVisualization.ts` | 新增 Node 端聚合 |
| `frontend/src/mock/mock-workspace.ts` | 新增 mock |
| `frontend/src/test-fixtures/gitVisMockData.ts` | 新增 fixture |
| `frontend/src/app/features/git-visualization/adapters/chartDataAdapters.ts` | 新增 `adaptHotspotsTree` + `filterFilesByPath` |
| `frontend/src/app/features/git-visualization/adapters/__tests__/chartDataAdapters.test.ts` | 扩展测试 |
| `frontend/src/app/features/git-visualization/charts/FileSunburst.tsx` → `FileSunburstChart.tsx` | 改造数据源 + props |
| `frontend/src/app/features/git-visualization/GitVisualizationView.tsx` | 引用切换 |
| `frontend/src/app/features/git-visualization/hooks/useChartData.ts` | `TIME_RANGE_CHARTS` 新增 |
| `frontend/src/app/features/git-visualization/hooks/useGitVisRefresh.ts` | IPC 调用切换 |
| `frontend/src/app/i18n/zh-CN/changes.ts` | 新增 i18n key |
| `frontend/src/app/i18n/en-US/changes.ts` | 新增 i18n key |
| `frontend/src/components/charts/sunburst-segment.tsx` | 新增 `fill` + `tooltipText` props |
| `frontend/src/styles/regions/rightpanel/git-visualization.css` | 新增样式 |

---

## 11. 验收标准

- [ ] 后端 `workspace_git_vis_file_hotspots` 正确返回 `tree` + `files`，时间范围过滤生效
- [ ] 旭日图只渲染目录节点，扇形面积=变更次数，颜色按热度/时间映射
- [ ] 排行榜显示所有变更文件，支持 4 列排序，虚拟滚动正常
- [ ] 点击旭日图扇形 → 排行榜筛选对应模块；点击 [X 清除] → 旭日图回根
- [ ] 颜色模式切换器在热度/时间色阶间切换
- [ ] 三端（Tauri / Preview / Mock）IPC 实现对齐
- [ ] i18n 全覆盖（zh-CN + en-US 同步）
- [ ] 所有测试通过（Rust 单元测试 + 前端组件测试 + IPC 桥接测试）
- [ ] ESLint / Prettier / Clippy / rustfmt 通过
- [ ] TypeScript 类型检查通过
