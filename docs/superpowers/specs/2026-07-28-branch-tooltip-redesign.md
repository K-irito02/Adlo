# Branch Graph Tooltip — 分支信息增强设计

## 问题

1. `adaptBranchGraphData` 未传递 `refs` 字段，导致 CommitTooltipCard 的 `uniqueRefs` 始终为空
2. Rust 后端 `branch` 赋值为 `%D` 中第一个非 tag、非 HEAD ref，当 `origin/main` 排在本地分支前时，`branch` 错误设置为远程分支名（如 `origin/main`）
3. CommitTooltipCard 分支区块仅显示 `branch`，信息过于简单

## 修复方案

### 1. Rust 后端：`branch` 优先级修正

**文件**: `crates/workspace/src/git/git_vis/branch_graph.rs`

**变更**: 在 refs 解析循环中，添加本地分支覆盖逻辑。当遇到不以 `origin/` 或 `upstream/` 开头的 ref 时，即使 `branch` 已有值（被远程分支占用），也覆盖为本地分支：

```rust
if branch.is_empty() || (!r2.starts_with("origin/") && !r2.starts_with("upstream/")
    && (branch.starts_with("origin/") || branch.starts_with("upstream/"))) {
    branch = r2.to_string();
}
```

**效果**: 对于 `%D = origin/main, feature-x` 的 commit，`branch` 最终为 `feature-x` 而非 `origin/main`。

### 2. 前端适配器：`refs` 传递

**文件**: `frontend/src/app/features/git-visualization/adapters/chartDataAdapters.ts`

**变更**: 在 `CommitNode` 映射中添加 `refs: n.refs`。

### 3. CommitTooltipCard 分支区块增强

**文件**: `frontend/src/app/features/git-visualization/charts/BranchGraph.tsx`

**新增传入数据**:
- `branchProgress?: BranchProgress`
- `tag?: string`

**分支区块布局**:

```
主分支 + ahead/behind 状态  ← 高亮 badge，与 ↑N ↓N 同行
附加本地分支列表              ← 非 origin/ 且非 branch 的 refs
远程分支列表                  ← origin/ 开头的 refs（灰色小字）
标签                          ← 🏷 tagname（如果有）
```

**条件**: 分支区块仅在有主分支或附加分支/远程分支/tag 时显示。

### 4. CSS 补充

**文件**: `frontend/src/styles/regions/rightpanel/git-visualization.css`

- `.adl-branch-graph__tooltip-remote-badge` — 远程分支 badge 样式（灰色、小号、半透明）
- `.adl-branch-graph__tooltip-tag-badge` — 标签 badge 样式
- `.adl-branch-graph__tooltip-branch-progress` — ahead/behind 文字样式

## 测试

- 现有 115 项测试全部通过
- 新增测试：验证 `refs` 传递、验证 `branch` 优先级、验证分支区块渲染
