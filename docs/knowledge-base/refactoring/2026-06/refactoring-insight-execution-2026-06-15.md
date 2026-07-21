# 重构洞察执行记录 – 2026-06-15（第 10 次 / Phase 65）

## 来源

重构洞察报告 `docs/refactoring-insight/report/daily-insights/2026-06/refactor-insight-2026-06-15.md`

## 执行的 6 项任务

| # | 文件 | 变更 | 行数变化 |
|---|------|------|----------|
| 1 | `cmScrollLeftSync.ts` | 拆为 `cmScrollSync.ts` + `cmHorizontalScroll.ts` + `cmLintHighlights.ts` | 653→3 文件（~580 行合计） |
| 2 | `FoldTooltipOverlay.tsx` | 提取 `useFoldTooltipState.ts` + `useFoldTooltipPosition.ts`，主组件精简 | 666→34 行 + 2 hook 文件 |
| 3 | `GitHubTreeEntry.tsx` | 拆为 `GitHubEntryMenus.tsx` + `GitHubEntrySubEntries.tsx` | 970→478 行 (−53%) |
| 4 | `GitHubPanel.tsx` | 拆为 `GitHubCIOverview.tsx` + `GitHubCILogs.tsx` + `GitHubCISettings.tsx` + `GitHubCITree.tsx` | 996→73 行 (−93%) |
| 5 | `fileTree.tsx` | `trunkHeightMap` O(n²) → O(n) 栈式单次遍历 | 无行数变化 |
| 6 | CSS 变量 + 硬编码样式 | 3 变量→1 变量，2 处内联样式→CSS class，TitleBar 2 次 store 调用→1 次 | 14 文件更新 |

## 经验教训

### 1. 超大组件安全拆分的模式

**问题：** 4 个 600-1000 行的巨型文件需要安全拆分。手动逐行分析费时且易出错。

**方案：** 使用 Subagent 模式：每个拆分任务派发独立子代理，各代理专注分析单个文件的责任边界，提出拆分方案。

**教训：** 超大组件拆分的通用模式是"三明治提取"：
1. 责任识别 → 2. 纯函数/数据（菜单构建、子条目渲染）→ 3. 主文件保留编排逻辑
4 个拆分任务均遵循此模式，ESLint/tsc 零错误通过。

### 2. Bridge 桥接层拆分需谨慎

`GitHubPanel.tsx` 的拆分中，子视图组件（`GitHubCITree.tsx`, `GitHubCIOverview.tsx`）直接使用 `useAppStore` 而非 prop drilling。这是有意的选择——子视图本身就是 Store 的消费者，prop drilling 反而会引入不必要的中间层。但在做 Domain 拆分时，如果未来子视图需要复用，应提取其需要的 selector 到独立文件。

### 3. O(n²) → O(n) 的栈式算法

`trunkHeightMap` 原来使用嵌套循环（对每个目录向前扫描统计后代），在大文件树（10000+ 节点）下退化为 O(n²)。

**替换方案：** 维护一个深度栈 `{ path, depth, count }`。单次遍历 flatNodes：
- 遇到小于等于栈顶深度的节点 → 栈顶弹出（目录闭合），记录高度
- 目录推入栈，文件累加到栈顶计数
- 遍历完成后弹出栈中剩余条目

**注意点：** 这种栈式算法需要正确处理 flatNodes 的排序前提（BFS 遍历、depth 递增）。如果 flatNodes 排序方式改变，算法需要同步调整。

### 4. CSS 变量命名的收敛原则

原来的 3 个 CSS 变量（`--adl-filetree-hover-offset`、`--adl-tree-row-offset`、`--adl-outline-row-offset`）在 `TreeNodeRow.tsx` 中被赋予相同的计算值（`Math.max(4, rowOffset)`），但在 3 个不同的 CSS 文件中被分别引用。

**原则：** 如果多个 CSS 变量在运行时总是取相同值，就应该合并。合并后不仅减少了变量计算开销，还消除了"修改一个忘记改另一个"的风险。

### 5. 硬编码内联样式的消除

`TerminalTabBar.tsx` 和 `BrowserTabBar.tsx` 中相同的 `fontSize: '13px'` 和 `padding: '2px 6px'` 内联样式直接硬编码，不受主题控制。这些样式被用于输入编辑框。

**消除方式：** 删除内联 style 中的这两个属性，然后在 CSS 中定义 `.adl-tool-list__item-editable-input` 规则，使用 `var(--font-size-sm, 13px)` 和 `var(--space-0-5, 2px) var(--space-1-5, 6px)`。

**注意：** 这种修改是安全的——移除非行为影响的样式属性不会改变功能。但如果某个内联属性是唯一控制该元素视觉的规则，删除后需确保 CSS 规则覆盖。

### 6. Store 订阅合并

`TitleBar.tsx` 中有两次独立的 `useAppStore(useShallow(...))` 调用，导致组件创建了两次 Store 订阅。虽然没有明显的性能影响（React 内部 dedup），但代码风格不一致且容易忘记同步。

**改进：** 合并为单次 `useShallow` 调用，同时订阅所有 13 个字段。
