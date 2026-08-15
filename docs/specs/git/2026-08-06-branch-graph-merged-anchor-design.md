# 已合并分支"头部锚点"高亮 + "已并入 main"提示 — 设计

日期：2026-08-06
模块：git-visualization / BranchGraph

## 背景与动机

真实仓库中 `heatmap-chart-generalization` 已完全并入 main（`main..heatmap` = 0，其 tip `bae939bb` 位于 main first-parent 脊柱上）。当前行为：

- 归属规则把 `bae939bb` 判给 main → 节点显示 main 色
- 点击 heatmap 标签过滤时，"归属=heatmap 的提交"为 0 → 无任何节点点亮，全部变暗

用户期望：选中一个已并入 main 的分支时，**携带该分支 ref 的头节点（头部锚点）用该分支色点亮**，让用户知道"这个分支的标签停在这里"；同时在悬停分支标签时提示"该分支已并入 main"。

## 目标

1. 选中已并入 main 的分支后，其头节点以分支色点亮（不改变默认视图、不改变归属规则）。
2. 悬停分支标签时，对已并入 main 的分支显示"已并入 main"提示。

## 非目标

- 不改变 `computeBranchOwnership` 的归属规则（脊柱屏障仍生效）。
- 不改变默认视图（未选中时 `bae939bb` 仍是 main 色）。
- 不点亮已合并分支的整段历史（那会≈点亮整个 main 历史）。
- 不改后端 / Rust / preview / mock 的 IPC 契约（纯前端计算，天然双端一致）。

## 方案

### A. 头部锚点：选中态颜色覆盖（`resolveRowDisplay`）

新增纯函数，替代 `SvgLanes` / `CommitTableRows` 中现有的 `rowSelected` / `rowColor` / `isFiltered` 逻辑：

```
resolveRowDisplay(node, fallbackColor, ownership, selectedBranches) → { selected, color }

无任何选中:
  selected = true, color = 归属色(ownership) 或 fallbackColor

有选中:
  节点 refs 中第一个已选中的分支 → selected = true, color = 该分支色   // 锚点优先
  否则归属分支已选             → selected = true, color = 归属色
  否则                        → selected = false（变暗）, color = 归属色
```

- 节点色/泳道段色/连线色全部改用此函数的 color。
- 变暗判定（opacity 0.1 / row--dimmed）全部改用此函数的 selected。
- 对 `model-settings` 等未合并分支：归属色本来就 = 分支色，行为无变化。

### B. "已并入 main"判定（`computeMergedBranches`）

```
computeMergedBranches(nodes, edges, branches) → Set<branch>

- mainline = main（否则 master，否则第一个本地分支）
- 构建 parentMap
- mainReachable = 从 mainline 所有 tip 沿 parent 可达的全部节点
- 非 mainline 分支 B 的所有 tip 都 ∈ mainReachable  ⟺  B 已并入 main
```

等价于 `git merge-base --is-ancestor B main`。纯前端从现有图数据计算。

### C. 分支标签 tooltip

`TagRow` 的 title 优先级：

1. 分支 ∈ mergedBranches → `t.gitVisMergedIntoMain`（新 i18n key，如 "已并入 main"）
2. 否则维持现有逻辑：有 mergeBase → 进度 tooltip + base；无 → `label — 仅本地`

## 改动文件

| 文件 | 改动 |
|------|------|
| `frontend/src/app/features/git-visualization/utils/branchMergeStatus.ts`（新） | `computeMergedBranches` |
| `frontend/src/app/features/git-visualization/utils/branchMergeStatus.test.ts`（新） | 单测（linear merged / fast-forward / diverged / multi-tip） |
| `frontend/src/app/features/git-visualization/utils/branchRowDisplay.ts`（新） | `resolveRowDisplay` |
| `frontend/src/app/features/git-visualization/utils/branchRowDisplay.test.ts`（新） | 单测（默认/选中/锚点优先/无归属 fallback） |
| `frontend/src/app/features/git-visualization/charts/BranchGraph.tsx` | SvgLanes + CommitTableRows 改用 resolveRowDisplay；新增 mergedBranches 计算并传给 TagRow |
| `frontend/src/app/i18n/zh-CN/changes.ts` | 加 `gitVisMergedIntoMain` |
| `frontend/src/app/i18n/en-US/changes.ts` | 加 `gitVisMergedIntoMain` |
| `frontend/src/app/features/git-visualization/charts/BranchGraph.test.tsx` | mock i18n 补 key；新增锚点亮色 + tooltip 用例 |

## 测试策略

- `branchMergeStatus.test.ts`：构造 main 脊柱 + 已并入分支（fast-forward 吸收）、未并入分支（分叉）、多 tip 分支。
- `branchRowDisplay.test.ts`：无选中、选中锚点、选中归属、无归属 fallback 四种状态。
- `BranchGraph.test.tsx`：新增 fixture（已并入分支 tip 在 main 脊柱上）→ 选中后该节点保持高亮且为分支色；tooltip 含 merged 提示。
- 回归：`git-visualization` 全量 + `tsc --noEmit` + `eslint`。
