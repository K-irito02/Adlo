# 文件热点排行榜（移除旭日图 + 双模式下钻）设计文档

**日期**: 2026-08-03
**状态**: 待审阅
**作者**: Brainstorming session
**关联**: 重构 2026-08-02 的「文件热点组合视图（旭日图 + 排行榜）」；彻底移除旭日图及相关死代码

---

## 1. 背景与动机

### 1.1 现状问题

当前「文件热点」可视化是 `FileHotspotsView` = 旭日图（`FileSunburstChart`）+ 排行榜（`FileHotspotsRanking`）组合视图。用户反馈：

1. **旭日图不适用**：项目目录多、变更多时，旭日图（尤其是只保留目录节点后仍扇区极小的深层结构）视觉上「密密麻麻」，不美观、不清晰
2. **排行榜更直观**：变更热度本质是「排序信息」，扁平排行榜 + 多指标排序比扇形面积更清晰
3. **下钻能力被割裂**：下钻目前由旭日图驱动（点击扇形 → 排行榜被动筛选），交互链路长且依赖旭日图
4. **名称/路径混在一列**：当前「文件」列显示相对路径（如 `core/engine.ts`），文件名不够突出

### 1.2 用户需求

1. **删除旭日图**，仅保留排行榜
2. **下钻能力融合进排行榜**（不再依赖旭日图驱动）
3. **「文件名/目录名」与「路径」拆成两列**，名称清晰、路径可查
4. 排行榜提供 **全排列模式** 与 **下钻模式** 两种模式

### 1.3 方案选择

方案 A（用户已确认）：**单一 mode-aware 排行榜组件**。`FileHotspotsView` 收敛为排行榜视图，内部一个 `FileHotspotsLeaderboard` 组件持有 `mode` + `drillPath` + 排序状态；两种模式只是行数据源的分支（`files` 全量 vs `tree` 子节点）。下钻交互完全复用贡献者模块热力图（`ContributorModuleHeatmap`）的交互套件：`ModuleBreadcrumb` + 点击下钻 + 右键 `ModuleTreeCard` 路径跳转。

---

## 2. 数据模型与行来源

### 2.1 数据源（不变）

仍为同一个 IPC：`workspace_git_vis_file_hotspots` → `GitVisFileHotspots { tree, files }`。**无需新增后端工作**。

- `tree: GitVisFileHotspotNode` — 完整目录树，目录节点已含聚合的 `changeCount/additions/deletions/lastModified`
- `files: GitVisFileHotspotFile[]` — 扁平文件列表

### 2.2 行来源

| 模式 | 行来源 | 行类型 |
|------|--------|--------|
| 全排列（full） | `data.files`（全部文件，不做下钻过滤） | 仅文件 |
| 下钻（drill） | `data.tree` 在 `drillPath` 处的子节点 | 目录 + 文件 |

新增辅助函数（`adapters/chartDataAdapters.ts` 内）：

```typescript
export interface HotspotTreeNode {
  name: string;
  nodeType: 'directory' | 'file';
  changeCount?: number;
  additions?: number;
  deletions?: number;
  lastModified?: string;
  children?: HotspotTreeNode[];
}

/** 按路径段逐层查找，返回该路径下的子节点列表；找不到返回空数组 */
export function getHotspotChildren(
  root: HotspotTreeNode,
  drillPath: string[],
): HotspotTreeNode[]
```

逻辑与 `moduleTreeUtils.getChildrenAtPath` 一致：从 `root` 起，按 `drillPath` 每段 `name` 匹配下钻；`drillPath=[]` 时返回 `root.children`。

### 2.3 边界情况

- 空仓库/无变更：`files=[]`、`tree` 无子节点 → 两种模式都显示空状态
- `drillPath` 在数据刷新后失效（某段不再存在）→ `getHotspotChildren` 返回空数组，UI 显示空状态；同时 `FileHotspotsView` 在数据变化时校验并重置 `drillPath` 到根
- 目录节点无 `children` 或 `children` 为空 → 该目录行不可下钻（点击无操作、右键不弹树形选择器）

---

## 3. 列设计（两种模式一致）

| 列 | 内容 | 可排序 |
|----|------|--------|
| # | 序号（基于当前排序） | 否 |
| 名称 | 文件名/目录名（basename，如 `handler.ts` / `core`） | 否 |
| 路径 | 从工作区根起的完整路径（如 `src/api/handler.ts`），行 `title` 亦为完整路径 | 否 |
| 变更次数 | `changeCount` | 是（默认，降序） |
| 新增 | `+additions`（绿色） | 是 |
| 删除 | `-deletions`（红色） | 是 |
| 净变化 | `additions - deletions`，正负着色 | 是 |

**设计决策**：
- **名称列 = basename，路径列 = 完整路径**（用户已确认）。名称列突出可读性，路径列满足「知道它的路径」
- 全排列模式：行均为文件，名称列 = basename
- 下钻模式：行可能为目录（聚合统计）或文件；名称列 = 节点 `name`，路径列 = 完整路径（由树推导，`drillPath` 前缀 + 各祖先 name + 自身 name）
- 数值列格式化沿用现有：千分位、`+`/`-` 前缀、净变化绿/红/灰
- 长路径截断 + `title` tooltip（项目规则：纯文本路径展示可用原生 `title`）
- 下钻模式中目录与文件行统一参与排序（不强制目录置顶）；默认「变更次数」降序

---

## 4. 组件结构与状态

### 4.1 组件树

```
FileHotspotsView (收敛为容器)
└── FileHotspotsLeaderboard (新组件，charts/)
    ├── [分段按钮] 全排列 | 下钻   (仅组件内部)
    ├── ModuleBreadcrumb           (仅下钻模式显示；在根时显示禁用的「根目录」项，与热力图一致)
    ├── 表头 (# / 名称 / 路径 / 变更次数 / 新增 / 删除 / 净变化)
    ├── 虚拟滚动行
    └── ModuleTreeCard             (右键目录行时弹出，portal)
```

- `FileHotspotsView` props 保持 `{ data?: GitVisFileHotspots }`，`GitVisualizationView.tsx` 无需改数据流
- 删除 `FileSunburstChart`、`FileHotspotsRanking` 两个旧组件（合并进 `FileHotspotsLeaderboard`）

### 4.2 状态管理（`useFileHotspotsState` 扩展）

```typescript
type HotspotMode = 'full' | 'drill';
type RankingSortKey = 'changeCount' | 'additions' | 'deletions' | 'net';
type SortDir = 'asc' | 'desc';

interface FileHotspotsState {
  mode: HotspotMode;                 // 全排列 / 下钻
  setMode: (mode: HotspotMode) => void;
  drillPath: string[];               // 下钻路径
  setDrillPath: (path: string[]) => void;
  sortKey: RankingSortKey;
  sortDir: SortDir;
  setSort: (key: RankingSortKey) => void;
}
```

- **移除** `colorMode`（`'heat' | 'time'`）：该状态仅服务旭日图扇形着色，旭日图删除后一并移除
- **模式持久化**：`mode` 写入 localStorage（key：`git-vis:file-hotspots-mode`），默认 `'full'`；读取出错回退默认值。`drillPath` 与排序不持久化（会话内交互态，与 `ContributorModuleHeatmap` 的 `drillPath` 处理一致）

### 4.3 下钻交互（完全照搬贡献者模块热力图）

| 交互 | 行为 |
|------|------|
| 顶部面包屑 `ModuleBreadcrumb` | 显示当前 `drillPath`；点击「根目录」或任一段回退到对应层级 |
| 点击目录行 | `setDrillPath([...drillPath, name])` 下钻 |
| 右键目录行（有子节点） | 光标处弹出 `ModuleTreeCard`（子树 = 该目录 `children`），选择子路径后跳转；Esc / 点击外部关闭 |
| 点击文件行 | 无操作（叶子节点，YAGNI：不做打开文件） |
| 切换到全排列模式 | 清空 `drillPath` 回到根 |

复用 `ModuleBreadcrumb` / `ModuleTreeCard` / `TreeRow`（均已在贡献者模块热力图中使用，零新增交互组件）。

---

## 5. 旭日图彻底移除（清理范围）

按项目「禁止死代码 / 禁止兼容层」规则，旭日图及其所有关联代码彻底移除：

### 5.1 后端（Rust / Tauri）

| 文件 | 操作 |
|------|------|
| `crates/workspace/src/git/git_vis/sunburst.rs` | 删除 |
| `crates/workspace/src/git/git_vis/mod.rs` | 移除 `pub mod sunburst;` 与 re-export |
| `crates/workspace/src/lib.rs` | 移除 `capture_file_sunburst` 导出 |
| `src-tauri/src/commands/workspace_git_vis.rs` | 移除 `workspace_git_vis_file_sunburst` 命令 |
| `src-tauri/src/main.rs` | 移除命令注册 |
| `src-tauri/permissions/digital-life.toml` | 移除 `workspace_git_vis_file_sunburst` 权限 |
| `crates/types/src/types/git_visualization.rs` | 移除 `GitVisSunburstNode`、`GitVisFileSunburst` 类型 |

### 5.2 前端

| 文件 | 操作 |
|------|------|
| `src/app/features/git-visualization/chartIds.ts` | 移除 `CHART_IDS.FILE_SUNBURST` |
| `src/app/stores/actions/gitVisActions.ts` | 移除 `FILE_SUNBURST` 分支与 `HEATMAP_TABS` 项 |
| `src/app/features/git-visualization/charts/FileSunburst.tsx` | 删除 |
| `src/app/features/git-visualization/charts/FileSunburst.test.tsx` | 删除 |
| `src/components/charts/sunburst-chart.tsx`、`sunburst-segment.tsx`、`sunburst-center.tsx`、`sunburst-breadcrumb.tsx`、`sunburst-hint.tsx`、`sunburst.ts`、`sunburst-context.ts`、`sunburst-data.ts` 及其 `__tests__/` | 删除（经核对仅 `FileSunburst.tsx` 消费该共享库） |
| `src/app/features/git-visualization/adapters/chartDataAdapters.ts` | 移除 `adaptSunburstData`、`adaptHotspotsTree`、`computeArcFill`、`filterFilesByPath`；新增 `getHotspotChildren` |
| `src/app/features/git-visualization/adapters/__tests__/chartDataAdapters.test.ts` | 清理旭日图相关用例；新增 `getHotspotChildren` 用例 |
| `src/kernel/types.ts` | 移除 `GitVisSunburstNode`、`GitVisFileSunburst` |
| `src/shared/ipc/workspace.ts` | 移除 `gitVisFileSunburst` 接口 |
| `src/tauri-bridge/tauri-workspace.ts` | 移除实现 |
| `src/preview-bridge/preview-git.ts` | 移除实现 |
| `src/mock/mock-workspace.ts` | 移除 mock |
| `frontend/dev/previewWorkspaceService/gitVisualization.ts` | 移除 `handleFileSunburst` |
| `frontend/dev/previewWorkspaceService/index.ts` | 移除 `/workspace/git-vis-file-sunburst` 路由 |
| `src/styles/regions/rightpanel/git-visualization.css` | 移除 `.adl-file-sunburst-*` 规则 |

### 5.3 i18n

- **移除**：`gitVisFileSunburst`、`gitVisFileSunburstDesc`、`gitVisSunburstHintZoomIn`、`gitVisSunburstHintZoomOut`、`gitVisHotspotsColorModeHeat`、`gitVisHotspotsColorModeTime`、`gitVisHotspotsTooltipChanges`、`gitVisHotspotsTooltipLines`、`gitVisHotspotsTooltipLastModified`、`gitVisHotspotsNoDirectoryChanges`
- **更新**：`gitVisFileHotspotsDesc`（描述双模式排行榜）
- **新增**（zh-CN + en-US 同步）：

| Key | zh-CN | en-US |
|-----|-------|-------|
| `gitVisHotspotsModeFull` | 全排列 | Full Ranking |
| `gitVisHotspotsModeDrill` | 下钻 | Drill Down |
| `gitVisHotspotsRankingName` | 名称 | Name |
| `gitVisHotspotsRankingPath` | 路径 | Path |
| `gitVisHotspotsEmpty` | 无变更文件 | No changed files |
| `gitVisHotspotsDrillHint` | 点击目录行下钻，右键目录行可路径跳转 | Click a directory row to drill down; right-click for path jump |

---

## 6. 样式（CSS）

在 `git-visualization.css` 中：

- 保留/微调 `.adl-file-hotspots-ranking*`（表头/行/单元格/排序指示/空状态）
- 新增 `.adl-file-hotspots__mode-toggle` — 分段按钮（复用现有分段控件风格，参考 `ChartColorPresetSelector` / 热力图 tab 切换样式）
- 新增 `.adl-file-hotspots-ranking__cell--name` / `--path` — 名称列（突出、截断）与路径列（次要色、截断 + `title`）
- 移除 `.adl-file-hotspots-color-toggle`（颜色模式切换器）
- 颜色一律使用 `var(--…)` 设计 token，不硬编码

---

## 7. 测试策略

### 7.1 组件测试

- `FileHotspotsLeaderboard.test.tsx`（新建，替代 `FileHotspotsView.test.tsx`）：
  - 全排列模式：渲染全部文件；名称/路径分列显示（basename 与完整路径）；表头排序切换（变更次数/新增/删除/净变化）；默认「变更次数」降序
  - 下钻模式：渲染目录 + 文件行；点击目录行下钻（行内容变为该目录子节点）；面包屑回退到根；切换到全排列清空 `drillPath`；右键目录行弹出树形选择器并可跳转
  - 空状态：`data` 为空 / 无变更时显示空提示
- `useFileHotspotsState.test.tsx`（新建）：模式切换 + localStorage 持久化、`setSort` 切换方向逻辑

### 7.2 适配层测试

- `getHotspotChildren`：空 `drillPath` 返回根子节点；按段下钻；不存在路径返回空数组；文件节点无子节点

### 7.3 清理回归

- 移除 `FileSunburst.test.tsx`、旭日图共享组件测试、`FileHotspotsView.test.tsx`、`FileHotspotsRanking.test.tsx`（旧）相关用例
- `GitVisualizationView.test.tsx`：更新 i18n mock（移除已删 key）
- 全局 grep 确认 `sunburst` / `gitVisFileSunburst` / `FILE_SUNBURST` / `colorMode` 无残留引用

### 7.4 质量门禁

- `cargo clippy --workspace --all-targets -- -D warnings`
- `pnpm --dir frontend run lint`
- `pnpm --dir frontend run test`
- TypeScript 类型检查（`tsc --noEmit`）
- i18n 双语言 key 一致性

---

## 8. 验收标准

- [ ] 文件热点卡片不再渲染旭日图（无 SVG 扇形图），仅显示排行榜
- [ ] 排行榜顶部分段按钮「全排列 | 下钻」，默认全排列，切换状态记忆于 localStorage
- [ ] 全排列模式：全部文件按变更指标排序，名称/路径分列清晰
- [ ] 下钻模式：点击目录行逐层下钻，面包屑逐级回退，右键目录行弹出树形选择器任意路径跳转（与贡献者模块热力图交互一致）
- [ ] 名称列显示 basename，路径列显示完整路径，长路径 tooltip 完整展示
- [ ] 数据刷新后失效的 `drillPath` 自动重置
- [ ] 旭日图相关代码（后端/命令/权限/桥接/预览/mock/组件/适配器/i18n/CSS/测试）全部移除，无死代码残留
- [ ] 三端（Tauri / Preview / Mock）`gitVisFileHotspots` 对齐，`gitVisFileSunburst` 三端全部移除
- [ ] 全部测试通过（Rust + 前端），clippy / lint / tsc 通过

---

## 9. 文件清单

### 9.1 新建

| 文件 | 职责 |
|------|------|
| `frontend/src/app/features/git-visualization/charts/FileHotspotsLeaderboard.tsx` | 双模式排行榜主组件 |
| `frontend/src/app/features/git-visualization/charts/__tests__/FileHotspotsLeaderboard.test.tsx` | 组件测试 |
| `frontend/src/app/features/git-visualization/hooks/__tests__/useFileHotspotsState.test.ts` | 状态 hook 测试 |

### 9.2 修改

| 文件 | 改造内容 |
|------|---------|
| `frontend/src/app/features/git-visualization/charts/FileHotspotsView.tsx` | 收敛为排行榜容器 |
| `frontend/src/app/features/git-visualization/hooks/useFileHotspotsState.ts` | 新增 `mode`/`setMode` + localStorage 持久化，移除 `colorMode` |
| `frontend/src/app/features/git-visualization/adapters/chartDataAdapters.ts` | 移除旭日图适配器，新增 `getHotspotChildren` |
| `frontend/src/app/features/git-visualization/adapters/__tests__/chartDataAdapters.test.ts` | 同步清理/新增用例 |
| `frontend/src/app/i18n/zh-CN/changes.ts` | 移除/更新/新增 key |
| `frontend/src/app/i18n/en-US/changes.ts` | 移除/更新/新增 key |
| `frontend/src/styles/regions/rightpanel/git-visualization.css` | 移除旭日图样式，新增模式切换与列样式 |
| `frontend/src/app/features/git-visualization/GitVisualizationView.test.tsx` | i18n mock 更新 |

### 9.3 删除

见第 5 节清理范围（后端 7 处、前端 18 处、i18n、CSS、测试）。
