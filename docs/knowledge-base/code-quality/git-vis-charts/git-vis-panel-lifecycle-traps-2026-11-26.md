# Git 可视化面板的三个「一次性初始化」陷阱（2026-11-26）

三个独立缺陷，共同点是「状态只在某个时机计算一次，之后不再与真相对齐」，用户侧分别表现为：时间筛选控件消失、新增工作区不出现、分支标签 `g` 变 `q`。

## 1. 默认时间范围只初始化一次 → 三个图表的时间筛选控件消失

- **现象**：代码行演变 / 提交时间线 / 文件热点标题右侧没有时间筛选；热力图组的控件仍在。
- **根因**：`useChartData` 用 `initializedRef`（布尔）保证「每个图表只写一次默认范围」。首个渲染的 `activeWorkspaceTab` 若与最终展示的工作区不同（默认 `workspace-1`、旧路径 hash、或在标签栏切到另一个工作区），默认范围会写到别的 workspace 键上；切到真正的工作区后布尔守卫已锁死，store 里没有该 workspace 的范围，`TimeRangeAwareCard` 的 `timeRange.hasTimeRange && timeRange.timeRange` 恒假。
  热力图组不受影响，是因为它的控件用本地 `tabRangesRef` + `defaultTimeRange()` 兜底，不读 store —— 这正好解释了「只有这三个没有」。
- **修复**：守卫改为按 workspace 记录；进一步审查后直接删除守卫 —— effect 的判据是「当前 workspace 没有该图表范围」，写入后判据立即为假，本身就是收敛的；删除后还能覆盖「工作区移除（`clearWorkspaceGitVisData` 剪掉范围）后同路径重加、id 相同」的场景。
- **教训**：`initializedRef` 这类「只做一次」的守卫要么按领域键（workspace / chart）作用域化，要么先证明 effect 不收敛再引入；全局布尔会把「第一次不巧」固化成永久缺省。

## 2. 标签顺序在挂载时快照 → 新增工作区不显示

- **现象**：面板打开期间添加工作区，标签栏不出现新工作区；关闭再打开 Git 可视化才出现。
- **根因**：`WorkspaceTabBar` 用 `useState(() => workspaceTabs.map(...))` 存标签顺序，渲染时按 `tabOrder` 取 `tabMap`，新 id 不在 `tabOrder` 里被过滤掉。重新挂载才会重建顺序表。同一缺陷也覆盖「面板先挂载、`recentWorkspaces` 由 bootstrap 异步回填」。
- **修复**：新增纯函数 `reconcileTabOrder(order, visibleIds)`（保留用户拖拽顺序、按可见清单追加新增、剔除消失项、无变化返回原引用），组件只存 `userTabOrder`，渲染顺序每次 reconcile；新增项还要跳到它所在页（`page` 只做上界夹紧不会跟随），并跳过「`previousIds` 为空」的首次水合，避免启动时被当成整批新增而跳到末页。
- **教训**：用户可排序的列表不能把「顺序」和「成员」一起快照；顺序是用户数据，成员是派生数据，必须每轮对齐。

## 3. 行盒高度 1em + `overflow: hidden` → 字形下伸部被裁

- **现象**：分支标签 `gitee/...` 显示成 `qitee/...`。
- **根因**：标签按钮内联 `lineHeight: 1`，被内层省略号 span 继承；该 span 用 `overflow: hidden` 做单行省略，行盒 11px 小于字体 ascent+descent（实测 12px），`g` 的下伸部被裁掉。
- **修复**：`.adl-branch-graph__label-text` 显式 `line-height: normal`（字体自带行盒）。真实浏览器实测：before `clientHeight 11 / glyphBottom 11.5`，after `clientHeight 12 / glyphBottom 12`。
- **教训**：给 `overflow: hidden` 的文本容器设 `line-height` 时，必须 ≥ 字体 ascent+descent；`line-height: 1` 只适合无下伸字母或不做垂直裁切的场景。

## 验证与回归保护

- `hooks/__tests__/useChartData.test.tsx`：切换 workspace、`clearWorkspaceGitVisData` 后重新初始化、切回不重写（`toBe` 引用断言）。
- `WorkspaceTabBar.test.tsx`：窄容器（520px / 每页 4）下新增工作区跳页后可见；空列表水合后仍停在第 1 页。
- `styles/git-vis-branch-label.test.ts`：样式锁钉 `line-height: normal` + 保留省略号裁切。
- 三处均做过删除性推演（回退修复即变红）。
