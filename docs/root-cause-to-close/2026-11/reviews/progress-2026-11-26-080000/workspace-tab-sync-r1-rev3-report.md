# workspace-tab-sync — R1 rev3 报告

## 范围

- 快照：`.review-diffs/*-rev3.diff`（`manifest-rev3.md`，base `a94a8ce25d`），仅本 scope 4 个归属文件。
- 归属文件：
  - `adlo/frontend/src/app/features/git-visualization/WorkspaceTabBar.tsx`
  - `adlo/frontend/src/app/features/git-visualization/WorkspaceTabBar.test.tsx`
  - `adlo/frontend/src/app/features/git-visualization/gitVisualizationWorkspaces.ts`
  - `adlo/frontend/src/app/features/git-visualization/gitVisualizationWorkspaces.test.ts`
- 只读上下文：`stores/slices/workspaceSlice.ts:96`（`recentWorkspaces: []`）、`stores/persisted/registry.ts`（无 `recentWorkspaces` 条目；`adl:changes.activeWorkspaceTab` / `showGitVisualization` 仍持久化于 `:665-685`）、`hooks/useAppStartup.ts:39-46`（`void actions.bootstrap()` 在 effect 中异步回填）、`src/test-setup.ts:48-66`（`ResizeObserver` 无操作 mock）。
- 未运行任何测试套件；测试有效性用读代码 + 删除性推演，未启动 dev server / 浏览器（无端口占用）。

## 上轮问题关闭情况

- **F1（low，启动期整表水合被当作新增 → 标签栏跳到最后一页）→ 已关闭。**
  - 实现：`WorkspaceTabBar.tsx:90-92` 在 effect 中先于新增判定 `if (previousIds.length === 0) return;`；`:87` 的 `previousVisibleIdsRef.current = currentIds` 在守卫**之前**执行，故守卫只跳过一次判定，后续真实新增仍以水合后的列表为基线。
  - 前提复核：`workspaceSlice.ts:96` 初值 `[]`，`registry.ts` 未持久化 `recentWorkspaces`（仅 `activeWorkspaceTab` / `showGitVisualization`），`useAppStartup.ts:42` 在首帧后的 effect 里异步 `bootstrap()`，故「先空列表挂载、再整表回填」确实是常规启动路径，修复对准真实触发条件。
  - 守卫不误伤「真正的首次新增」：挂载时列表非空（27 条）→ `previousIds.length === 27` → 守卫不触发；新增 1 条走 `:93-108` 的既有跳页逻辑。用例 `WorkspaceTabBar.test.tsx:159-198` 正覆盖该路径（挂载 27 条 → 追加 `workspace-new` → 520px 每页 4 → `waitFor` 断言可见 `New Workspace`），删掉整段跳页 effect 会因 `orderedTabs.slice(0,4)` 不含新标签而超时变红。
  - 新用例 `WorkspaceTabBar.test.tsx:130-157` 的删除性推演（去掉 `:90-92` 的 return）：空列表挂载（`visibleTabs` 初值 0，`page=0`，`totalPages=1`）→ `rerender` 后 `workspaceTabs` 变 27 条，`recalc` 先写 `totalPages=7`；同一提交内夹紧 effect 因 `totalPages` 依赖未变而跳过，跳页 effect 得 `previousIds=[]` → `added=27` → `addedIndex=tabOrder.indexOf(last)=26` → `setPage(floor(26/4)=6)`；下一提交夹紧为 `min(6,6)=6`。最终渲染 `orderedTabs.slice(24,28)`（第 25–27 项），`waitFor(() => toContain('Workspace 1'))` 超时，且 `not.toContain('Workspace 27')` 直接失败 → **确实变红**。保留守卫则 `page` 保持 0，两条断言均过。
  - 断言形态合规：用例经组件公共入口渲染，断言可见文案（`Workspace 1` / `Workspace 27` / `New Workspace`），不是容器存在或内部字段，符合「等内容，不等容器」。
  - 恢复机制复核：
    - `getBoundingClientRect`：两个新用例均在用例体内捕获 `originalFn` 并包 `try/finally` 恢复（`:153-156`、`:195-197`），`waitFor` 的 await 在 `try` 内，异常路径也会恢复；两处 stub 都只覆盖 `adl-workspace-tab__container`，其余元素回落 `originalFn.call(this)`，不会把非容器元素宽度钉成 0 而影响同文件其它用例。
    - `mockRecentWorkspaces`：水合用例 `:138` 捕获原数组引用、`:145`/`:154` 恢复（`try/finally` 双保险），且是「整体替换」而非原地改写，原数组未被污染；新增用例 `:173-187` 用展开新建数组追加 `workspace-new`；`afterEach`（`:47-54`）再按 `removedFromSidebar` / `workspace-new` 过滤，跨用例不残留。
  - 附带核对：`previousVisibleIdsRef` 的 `useRef` 初值在挂载非空时即当前 id，首轮 `added` 为空不跳；StrictMode 双调用 effect 也不跳（ref 跨两次调用保留）。行为与 rev2 已确认部分一致。

结论：上轮主表唯一一项已关闭。

## 新增发现

无。

## 记录不修

- `WorkspaceTabBar.tsx:88-89` 注释「The first population comes from the async bootstrap…」在「挂载时 0 个工作区、用户打开第一个工作区」这一冷启动首次路径上并不成立；但该分支下新增项索引必为 0、`page` 本就为 0，行为不受影响（守卫无需翻页）。属措辞略偏概全、不影响事实与行为，按 rev≥2 收敛不放主表。
- `WorkspaceTabBar.test.tsx:83-103`（既有 dots 用例）恢复 `getBoundingClientRect` 未包 `try/finally`：仅在该用例自身中途失败时泄漏 stub，且新用例已在自身 `try/finally` 中恢复。pre-existing，rev2 已记录，rev≥2 不再重提。
- `WorkspaceTabBar.tsx:143/193/216` 硬编码英文 `aria-label`（`Previous page` / `Next page` / `Page N`）未走 `useTCopy`：pre-existing，非本轮引入。
- `reconcileTabOrder` 单测未覆盖「全部新增（`order=[]`）/ 全部消失（`visible=[]`）/ 双方皆空」：实现逐条推演正确（`[]` + 27 条 → 追加 27 条；27 条 + `[]` → `[]`），属可选补测。
- `WorkspaceTabBar.tsx:98-100` 的 `addedIndex < 0` 分支在本轮 `reconcileTabOrder` 契约下不可达（新增 id 必被追加进 `tabOrder`），防御分支，不报。

## 结论

- 需修复项：0（critical 0 / high 0 / medium 0 / low 0）；本轮零问题。
