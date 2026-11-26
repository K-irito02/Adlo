# workspace-tab-sync — R2 rev4 报告

## 范围

- 快照：`.review-diffs/*-rev4.diff`（`manifest-rev4.md`，base `a94a8ce25d`），仅本 scope 4 个归属文件。
- 归属文件：
  - `adlo/frontend/src/app/features/git-visualization/WorkspaceTabBar.tsx`
  - `adlo/frontend/src/app/features/git-visualization/WorkspaceTabBar.test.tsx`
  - `adlo/frontend/src/app/features/git-visualization/gitVisualizationWorkspaces.ts`
  - `adlo/frontend/src/app/features/git-visualization/gitVisualizationWorkspaces.test.ts`
- R2 检查面：死代码、冗余守卫、根因修复后多余的防御、应删/降级的诊断日志、注释冗余或与实现不符。
- 只读上下文：`hooks/useMouseDragReorder.ts`（拖拽写回契约）、`stores/slices/workspaceSlice.ts` / `hooks/useAppStartup.ts`（rev3 已核对的水合路径，本轮不重复取证）。
- 未运行任何测试套件；判断用读代码 + 删除性推演。未启动 dev server / 浏览器，无端口占用。

## 上轮问题关闭情况

- **rev3 主表唯一项（F1 low，启动期整表水合被当作新增 → 标签栏跳到末页）→ 已关闭，且 rev4 仍成立。**
  - `WorkspaceTabBar.tsx:90-92` 保留 `if (previousIds.length === 0) return;`，且 `:87` 的 `previousVisibleIdsRef.current = currentIds` 在该 return 之前执行，守卫只跳过当次判定。
  - 回归保护在位：`WorkspaceTabBar.test.tsx:130-157` 以空列表挂载再回填，断言 `toContain('Workspace 1')` + `not.toContain('Workspace 27')`；删掉该 return 后 `added=27`、`addedIndex=26`、`perPage=4` → `page=6`，两条断言均会变红。
  - rev4 快照中本 scope 代码与 rev3 报告引用的行号/内容一致（effect `:81-109`、用例 `:130-157`/`:159-198`），未见本轮新增改动。
- **rev1 F1（medium，分页时新标签不可见）→ 仍关闭**：跟随新增项 effect（`:81-109`）在位，窄容器用例（`:159-198`）锁定「新增后可见」。
- **rev1 F2（low，`reconcileTabOrder` JSDoc 过度承诺）→ 仍关闭**：`gitVisualizationWorkspaces.ts:19` 为「无变化时返回原引用，避免下游 useMemo 重复计算」，与 `tabOrder` → `orderedTabs` 消费链一致。

## 新增发现

无。

按 R2 检查面逐项核对结论（均为「无需修复」）：

- **死代码**：四个文件无未引用变量/函数/导入。`reconcileTabOrder` 内 `visible` / `kept` / `keptIds` / `added` 均被消费；组件内 `userTabOrder` / `tabOrder` / `previousVisibleIdsRef` / `visibleTabs` / `totalPages` 均被读取或传给 hook；测试内 `waitFor` / `originalWorkspaces` / `originalFn` 均被使用。
- **诊断日志**：本轮新增代码无 `console.*`，无应删除或降级的调试输出。
- **冗余守卫（已记录过，见下节）**：`WorkspaceTabBar.tsx:98-100` 的 `addedIndex < 0` 在当前 `reconcileTabOrder` 契约下不可达；`added.length === 0`（`:94-96`）已覆盖空集合。
- **注释与实现一致性**：`:39-41`（拖拽顺序 vs 渲染顺序 reconcile）、`:81-82`（新增项跟随翻页）、`:101-102`（为何按实时宽度而非 `visibleTabs` 计页）、`:13-20`（reconcile 三条件 + 同引用）均与代码逐句相符。`:101-102` 的「`visibleTabs` 可能仍是更新前计数」成立：`recalc` effect（`:68-75`）与跳页 effect 在同一次提交按声明顺序执行，`setVisibleTabs` 要到下一提交才反映。
- **拖拽契约无残留防御**：`useMouseDragReorder`（`:95-107`）以 `itemsRef.current`（即 reconciled `tabOrder`，含全部可见 id）计算 `next` 写回 `setUserTabOrder`；再次 reconcile 时 `kept.length === order.length && added.length === 0` 返回同引用，不会重排或吞掉拖拽结果，无额外守卫需要。

## 记录不修

- `WorkspaceTabBar.tsx:98-100` 的 `if (addedIndex < 0) return;` 在当前 `reconcileTabOrder` 契约下不可达：`tabOrder` 由 `reconcileTabOrder(userTabOrder, currentIds)` 得出，`added` 的 id 必属 `currentIds`，而该契约保证 `currentIds` 全部出现在返回值中（无变化分支要求 `kept.length === order.length` 且 `added.length === 0`）。属可删的防御代码；R1 rev2/rev3 已两次以「防御分支」记录不修，按 rev≥2 收敛约定不进主表，交主代理决定是否随本轮一并删除（删除后无需补测，无行为变化）。
- `WorkspaceTabBar.tsx:104-107` 的 `perPage` 计算与 `recalc`（`:63`）重复：注释已说明必须用实时宽度（`visibleTabs` 同提交内滞后），属有意重复而非遗漏复用；如需收敛，可抽同文件内的小函数，但当前不构成缺陷。
- `WorkspaceTabBar.tsx:83` `useRef<string[]>(workspaceTabs.map(...))` 的初值表达式每次渲染都会构造一次数组（仅首次生效）：纯性能微项，pre-existing 写法，不改。
- `WorkspaceTabBar.tsx:88-89` 注释把「上一份列表为空」直接表述为「异步 bootstrap 首次填充」：用户从空列表打开第一个工作区时同样命中该守卫（此时新增项索引为 0、`page` 本为 0，行为无差）。rev3 已记录为措辞略偏概全、不影响事实与行为，维持不修。
- 预存项（本轮未触及、前几轮已记录）：既有 dots 用例（`WorkspaceTabBar.test.tsx:83-103`）恢复 `getBoundingClientRect` 未包 `try/finally`；`WorkspaceTabBar.tsx:173/223/246` 硬编码英文 `aria-label` 未走 `useTCopy`；`afterEach` 用魔法 id `'workspace-new'` 清理；`mockRecentWorkspaces` 用手写内联类型而非 `RecentWorkspaceEntry`（pre-existing，本轮仅把 `const` 改为 `let`）。
- `reconcileTabOrder` 单测未覆盖「全部新增 / 全部消失 / 双方皆空 / 重复 id」：实现逐条推演正确，属可选补测。

## 结论

- 需修复项：0（critical 0 / high 0 / medium 0 / low 0）；本轮零问题。
