# 贡献者模块热力图 — 树形下钻设计

## 概述

为「贡献者模块热力图」（ContributorModuleHeatmap）的 x 轴（模块列）增加树形下钻能力。左键逐层展开，右键弹出文件树路径选择器支持跨层级跳转，面包屑导航回溯。

## 后端改动

### 存储全路径

**文件**: `crates/workspace/src/git/git_vis/contributor.rs`

当前仅捕获顶级目录，路径信息丢失：

```rust
// 改前
let top_dir = trimmed.split('/').next().unwrap_or(trimmed);
*entry.1.entry(top_dir.to_string()).or_insert(0) += 1;

// 改后
*entry.1.entry(trimmed.to_string()).or_insert(0) += 1;
```

`trimmed` 为相对于仓库根的完整路径（如 `"src/components/charts/heatmap/heatmap-cells.tsx"`）。

### 新增 allPaths 字段

**文件**: `crates/types/src/types/git_visualization.rs`

```rust
pub struct GitVisContributorModules {
    pub matrix: Vec<GitVisContributorModule>,
    pub all_paths: Vec<String>,  // 新增：所有出现过的唯一路径
}
```

后端在遍历 `git log --name-only` 时收集所有出现的路径到 `HashSet`，完成后转为 `Vec<String>` 返回。

### 缓存

SQLite `git_vis_cache` 缓存 key 不变（基于 time range + workspace），缓存内容升级为含 `all_paths` 的新格式。

## 前端树解析与聚合

### 新增 `frontend/src/app/features/git-visualization/moduleTreeUtils.ts`

```typescript
interface ModuleTreeNode {
  name: string
  path: string
  isDir: boolean
  children: ModuleTreeNode[]
}

function buildModuleTree(allPaths: string[]): ModuleTreeNode

function getChildrenAtPath(
  tree: ModuleTreeNode,
  pathSegments: string[],
): ModuleTreeNode[]

function childrenToHeatmapColumns(
  children: ModuleTreeNode[],
  matrix: RawContributorModules['matrix'],
): { columns: HeatmapColumn[]; rowLabels: string[] }
```

- `buildModuleTree`：按 `/` 拆分路径为段，构建嵌套树结构
- `getChildrenAtPath`：沿 `pathSegments` 遍历树，返回目标节点的直接子节点
- `childrenToHeatmapColumns`：将子节点列表转为 `HeatmapColumn[]`。每列的值 = 该子树下所有文件对该贡献者的 commit 数之和

### 适配器变更

`chartDataAdapters.ts` 中 `contributorModulesToHeatmapColumns` 保持向后兼容，但 `ContributorModuleHeatmap` 改为使用 `childrenToHeatmapColumns`。

## 贡献者模块热力图交互

### 状态管理

```typescript
// ContributorModuleHeatmap.tsx
const [drillPath, setDrillPath] = useState<string[]>([])     // 面包屑路径
const [chartStatus, setChartStatus] = useState<ChartStatus>('loading')
const treeRef = useRef<ModuleTreeNode | null>(null)
```

### 左键列标题 → 逐层下钻

`HeatmapXAxis` 新 prop：`onColumnClick?: (label: string) => void`

```typescript
const handleColumnClick = (label: string) => {
  setDrillPath(prev => [...prev, label])
}
```

每次 `drillPath` 变化 → `useMemo` 重新计算：

```typescript
const { columns, rowLabels } = useMemo(() => {
  const children = getChildrenAtPath(treeRef.current!, drillPath)
  if (children.length === 1 && !children[0].isDir) {
    // 叶子节点（文件），无子项可展开
    return { columns: [], rowLabels: [] }
  }
  return childrenToHeatmapColumns(children, matrix)
}, [drillPath, matrix])
```

**叶子节点处理：** 当前路径指向文件时，`getChildrenAtPath` 返回空列表 → 热力图显示空状态提示文字（"此路径下无子模块"）。面包屑中该文件为最后一段且不可点击。右键卡片可继续选取其他路径跳转。

### 右击列标题 → 文件树卡片

新增 `onColumnContextMenu?: (label: string, x: number, y: number) => void` prop。

### 列标题视觉区分

热力图列标题中，目录和文件使用不同的样式标记：
- **目录**：纯文字，如 `heatmap`
- **文件**：文字前加文件类型徽章图标（复用 `fileTreeVisuals.ts` 的扩展名→图标映射），如 `📄 bar-chart.tsx`

### 加载动画

```typescript
<HeatmapChart
  data={columns}
  status={chartStatus}
  loadingLabel={t.gitVisLoadingModules}
  // ...原有 props
>
```

首次 IPC 返回前：`chartStatus = 'loading'` → 热力图网格脉冲 + 闪烁文字
数据就绪：`chartStatus = 'ready'` → Motion 进入动画

## 面包屑导航

### 新增 `ModuleBreadcrumb.tsx`

位于热力图上方、描述文字位置：

```
Root > src > components > charts
```

- 每个段为 button，点击跳回该层级
- 当前段高亮不可点击
- `>` 分隔符 `--text-muted`
- 根前缀文案："Root"（i18n key: `gitVisModuleRoot`）

## 右键文件树卡片

### 新增 `ModuleTreeCard.tsx`

右击列标题弹出，portal 到 `document.body`。

**交互规则：**

| 操作 | 行为 |
|------|------|
| 点击目录行 ▶ chevron | 展开/折叠子节点 |
| 点击行（空白/文字） | 选中该路径，高亮 + ✓ 标记 |
| 再次点击已选中行 | 保持选中 |
| 点击其他行 | 切换选中 |
| 点击底部 [确认跳转] | 跳转到选中路径，关闭卡片 |
| 点击 [取消] / 外部 | 关闭卡片，不跳转 |

**展开/折叠：** 使用组件内 `expandedPaths: Set<string>` 状态控制。

**滚动：** `overflow-y: auto` 垂直滚动、`overflow-x: auto` 水平滚动。

**视觉风格：** 参照文件面板的 `FileTree` 样式 — 28px 行高、文件类型徽章图标、缩进线。

**数据范围：** 被右键列标题路径下的完整子树（含所有深度子目录和文件）。

## 数据缓存策略

```typescript
const drillCache = useRef<Map<string, { columns: HeatmapColumn[]; rowLabels: string[] }>>(new Map())
const CACHE_KEY = drillPath.join('/')
```

同一路径往返无需重复计算。

后端 SQLite 缓存不受影响。

## 受影响文件清单

| 文件 | 改动 |
|------|------|
| `crates/types/src/types/git_visualization.rs` | `GitVisContributorModules` 新增 `all_paths: Vec<String>` |
| `crates/workspace/src/git/git_vis/contributor.rs` | 存储完整路径替代顶级目录；收集 `all_paths` |
| `src-tauri/src/commands/workspace_git_vis.rs` | 无需改动（数据自动序列化新字段） |
| `src-tauri/src/commands/git_vis_cache.rs` | 缓存 key 不变，缓存内容适配新格式 |
| `frontend/src/app/features/git-visualization/moduleTreeUtils.ts` | **新建** — `buildModuleTree` / `getChildrenAtPath` / `childrenToHeatmapColumns` |
| `frontend/src/app/features/git-visualization/ModuleBreadcrumb.tsx` | **新建** — 面包屑导航组件 |
| `frontend/src/app/features/git-visualization/ModuleTreeCard.tsx` | **新建** — 右键文件树选择器 |
| `frontend/src/app/features/git-visualization/charts/ContributorModuleHeatmap.tsx` | 大规模改造 — 下钻状态机、列点击/右键、面包屑集成、加载动画、树缓存 |
| `frontend/src/app/features/git-visualization/adapters/chartDataAdapters.ts` | `contributorModulesToHeatmapColumns` 保持向后兼容 |
| `frontend/src/components/charts/heatmap/heatmap-x-axis.tsx` | 新增 `onColumnClick`、`onColumnContextMenu` prop；标签改为可交互（`pointer-events-auto`） |
| `frontend/src/app/features/git-visualization/HeatmapCardGroup.tsx` | module tab 集成面包屑 |
| 前端 i18n 文件 | 新增 keys：`gitVisLoadingModules`、`gitVisModuleRoot`、`gitVisModuleConfirm`、`gitVisModuleCancel` |
| CSS | 新增 `module-tree-card.css`（卡片+滚动）、`module-breadcrumb.css` |
| 测试文件 | 各变更文件对应测试 |

## 测试策略

| 层级 | 内容 |
|------|------|
| 单元测试 | `buildModuleTree` — 空/单文件/深层嵌套/混合文件目录 |
| | `childrenToHeatmapColumns` — 聚合正确性、空贡献者、空子树 |
| | `getChildrenAtPath` — 根/深路径/不存在路径 |
| 组件测试 | `ContributorModuleHeatmap` — 左键下钻、面包屑导航、右键卡片、路径跳转 |
| | `ModuleBreadcrumb` — 路径渲染、点击返回、当前高亮 |
| | `ModuleTreeCard` — 展开折叠、选中切换、确认跳转、取消、外部关闭 |
| | `HeatmapXAxis` — 新交互 prop 回调 |
| 后端测试 | `contributor.rs` — 全路径存储断言、空仓库、单文件、路径含空格/中文 |
| 边界测试 | 10 万+ `allPaths` 加载动画、全根目录文件、超长路径名 |
