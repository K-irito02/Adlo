# Git 可视化收尾审查循环经验（2026-10-13）

> 来源：`docs/closing-workflow/2026-10/progress-2026-10-13-011127.md`（4 轮收尾审查，T1/T2/T3 各一路，最终三方 APPROVE）。
> 背景：右侧面板「Git 可视化」的刷新守卫/缓存失效/热力尺寸钳制/表头样式修复。本轮审查的价值不在业务逻辑，而在**修复自身引入的回归被逐轮拦截**——rev1 的修复在 rev2 被抓出 2 个 critical + 1 个 high。以下为可复用教训。

## 1. React 门控：原始测量值 vs 计算值（heatmap ready gate）

`@visx/responsive` 的 `ParentSize` 首帧报 `{0, 0}`。为「测量前不渲染」设的门控若锚定**计算后**的图表宽度，会被 `minBinSize` 钳制撑过阈值——`{0,0}` 帧直接画出全尺寸图表。

而修复若把门控两个半边都换成**原始测量值**（`width`/`parentHeight`），会在真实应用里把 fluid 布局永久判死：fluid 的父 div 是内容自撑的（`height: 100%` 对 auto 高祖先解析为 0），`parentHeight` **恒为 0**，ResizeObserver 也不会再变，图表永远空白。

**教训**：门控的两个半边要分别锚定不同来源——宽度锚原始测量（拦住 0 帧），高度锚计算值（放行内容自撑）。**测试必须钉死这两半**：用可变 mock 分别钉 `{0,0}`（断言不渲染）与 `{600,0}`（断言渲染）。rev2 的 critical 恰因所有测试的 `ParentSize` mock 固定报 `height: 200`，`{0} → {W,0}` 的真实测量序列被完全掩盖。

相关文件：`src/components/charts/heatmap/heatmap-chart.tsx`（ready gate）、`heatmap-chart.test.tsx`（`mockParentSize` + 两条门控测试）。

## 2. `React.memo` 零 props 时，rerender 会被跳过

给被 `React.memo` 包裹的组件传**变化的探针 prop**（如 `v={n}`）再 rerender，才能穿透 memo 重新执行组件函数、重算 effect deps。裸 rerender（props 浅比较相等）不会重跑组件，测试会静默不触发依赖变化。

相关文件：`GitVisualizationView.test.tsx`（`VersionedView` 强制重渲染再断言 effect 重新武装）。

## 3. store mock 会静默失效：路径与 getState

- **mock 路径写错不报错**：`vi.mock('../hooks/useGitVisRefresh')` 在测试目录下解析到不存在的模块，mock 静默落空，真实 hook 在缺 `getState` 的 mock store 上运行，测试照常「通过」。路径必须与被测文件的 import 规格一致（同目录文件应写 `./hooks/...`）。
- **新增 store 读取必须同步补 mock**：守卫/失效逻辑走 `useAppStore.getState()`，测试里凡 mock `@stores/slicedStore` 都要补 `getState`；否则 `try { getState } catch { fallback }` 会把 mock 的缺陷悄悄变成「每次都刷新」的假象。

## 4. mock 图表数据用 `null` 而非 `{}`

`{}` 是 truthy，`BranchGraph` 的 `adaptBranchGraphData` 会对它取 `data.nodes.map` 崩溃（真实 store 不可能出现该形状）。守卫测试只需「键存在」即可命中缓存判定（`!== undefined`），用 `null` 既命中又不触发适配器。

## 5. 用 `overflow: hidden` 收圆角，会裁掉 absolute 外挂子卡

时间范围菜单的自定义日期子卡是 `position: absolute; left: calc(100% + 2px)` 的后代。给菜单容器加 `overflow: hidden` 裁圆角，子卡的 containing block 在容器内，会被整体裁成不可见——功能直接失效。正确做法：**条目级圆角**（`:first-child`/`:last-child` 自身 `border-radius` 裁自己的 hover 底色），不裁容器。

年份菜单是滚动容器（`overflow-y: auto` 自裁），首末项同样补了条目级圆角保持一致。

## 6. 工作区级失效标记的清除粒度

`gitVisStale` 是**工作区级**信号（一次提交让该 ws 全部 6 图失效），清除就必须在**整轮工作区刷新**完成时判断，而不是在任意一次 per-chart `setGitVisData` 里顺手清——后者会让「某图刷新在途期间落地的提交」被误标为已消费，其余 5 图长期陈旧。

清除条件三件套：本轮无失败（局部 `failedCharts` 账本，不读 store 错误表）× 本轮未被更新轮次取代（工作区级 `workspaceSeqRef`，**按工作区隔离**——共享计数器会让 A→B 切换把 A 的在途轮次误 supersede，loading 永久卡住）× 头指针在途未变（`head`/`branch` 比对，防「结算时把在途 commit 的 stale 清掉」）。

相关文件：`hooks/useGitVisRefresh.ts`、`stores/gitSnapshotSync.ts`、`stores/slices/gitVisSlice.ts`。

## 7. 复审节奏：rev1 修复 → rev2 抓出 2 critical

rev1 的修复方向都对（tab 守卫范围判定、stale 标记、SVG 展开），但引入了新的 critical（raw-parentHeight 门控、overflow:hidden 裁子卡）。**修复本身必须当作新代码接受同等审查**，不能因为「这是在修问题」就降低标准。四轮循环最终三方 APPROVE，代价是两次 critical 回归被拦截在提交之前。
