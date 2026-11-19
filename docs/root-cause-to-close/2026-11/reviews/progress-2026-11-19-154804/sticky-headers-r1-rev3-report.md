# R1 rev3 审查报告 — 事项 1：右侧导航树「工作区标题吸顶」

**需修复项：0**

## 范围

- 快照：`manifest-rev3.md`（base `ab9116174`，rev3 全量重生成；未复用 rev1/rev2 快照结论）。
- 逐文件 rev3 diff 重读：`MultiWorkspaceTreeShell.tsx`、`MultiWorkspaceFileTree.tsx`、`MultiWorkspaceChangesTree.tsx`、`rightpanel/file-tree-browser.css`、`__tests__/stickyWorkspaceHeaders.test.tsx`、`styles/sticky-workspace-headers.test.ts`。
  - 三个 TSX 的 rev3 diff 与 rev1/rev2 一致（blob 未变），按全量重核结论；本轮新增集中在 CSS 与该 CSS 契约测试、组件测试。
- 依赖上下文重读：`TreeNodeRow.tsx`、`TreeRow.tsx`、`fileTree.tsx`、`useFileTreeVirtualization.ts`、`useFileTreeRevealOnRequest.ts`、`CustomScrollArea.tsx`、`WorkspaceFileTreeEntry.tsx`、`WorkspaceChangesEntry.tsx`、`FileNavigatorTree.tsx`、`ChangesTreePanel.tsx`、`MultiWorkspaceTerminal.tsx`、`MultiWorkspaceContainer.tsx`、`themes.css`、`files-panel-list.css`、`tree-dnd.css`、`styles/testing/cssRules.ts`。
- 规约：`review-brief.md`、`review-judgements.md`、`mandatory-testing.md`、`css-architecture.md`。
- 未审查：事项 2 的 DnD / 排序 / 剪贴板 / Rust / IPC（另一子代理）、`docs/**`（P5）；只复核「变更面板不支持拖拽」与吸顶开关一致。
- **本轮实跑**：按应用真实 DOM 形状（滚动口 → sticky shell → entry → `.adl-filetree-shell` → 非滚动 `.adl-filetree-scroll` → `ul` → 绝对定位 `li[data-path]`）搭最小页面，用真实 Edge（headless）跑行为探针。端口 **9461**（已关闭，仅 TimeWait）、临时 profile 已删除、Edge 子进程已 `taskkill /T /F`；未起 dev server、未占用应用端口；未运行 `check:*` / vitest。探针在 `%TEMP%\opencode\sticky-probe3\`（未写仓库）。

## 上轮问题关闭情况

- **rev2 F1（`scroll-padding-top` 让聚焦吸顶标题按钮时视口跳动）——已关闭。**
  - 代码：容器规则只剩 `padding-top: 0`（`file-tree-browser.css:106-108`），改为行级 `li[data-path] { scroll-margin-top: 34px }`（`:110-114`），并保留了「为什么不用容器 scroll-padding」的注释（`:110-111`）。
  - 断言：`sticky-workspace-headers.test.ts:97-108` 同时锁「`:has` 规则体不含 `scroll-padding-top`」与「行规则含 `scroll-margin-top: 34px`」（删任一侧该用例变红）。
  - 真机探针复算（应用形状）：
    - 容器 `getComputedStyle(scrollPaddingTop)` = `auto`（无容器 scroll-padding）。
    - 上向定位：`scrollTop=800` → 对上方行 `scrollIntoView({block:'nearest'})` → 行落点 **35px**（模型含 1px 边框；应用无边框即 34px），标题底=35px，不再被遮挡；把行 `scroll-margin-top` 覆盖为 0 的对照落点 **1px**（整行 28px 被 34px 标题盖住）→ margin 确为承重项。
    - 内层 `.adl-filetree-scroll` `scrollTop` 始终 0、`scrollHeight == clientHeight`（1680）→ 由外层滚动口完成滚动，`scroll-margin` 作用在正确滚动口上，未被嵌套容器吃掉。
    - 键盘聚焦吸顶标题：`focus` 展开按钮 delta **0**；再聚焦标题内第二个 `tabindex` 控件 delta **0**；「先 reveal 到底部再聚焦标题」delta **0** → rev2 的跳动回归消失。
  - 与主代理记录一致：进度文件 rev3 diff 中「4d 处置」一节写明「真机实测：行落点 34px、聚焦吸顶标题按钮 `scrollTop` 增量 0」。
- **rev2 F2（默认关闭用例缺 `--dnd` 断言）——已关闭。**
  - `stickyWorkspaceHeaders.test.tsx:132` 新增 `expect(shell?.classList.contains('adl-multitree--dnd')).toBe(false);`，与用例名「默认不开启吸顶与拖拽」一致。
  - 删除性推演：把 `MultiWorkspaceTreeShell.tsx:34` 改成默认拼 `adl-multitree--dnd`，该断言变红。

## 新增发现

无。本轮零问题。

（复核过但未构成缺陷的点：吸顶不透明底/层叠顺序（`z-index: 2`）、两面板吸顶开关与「变更面板不带 DnD」、`:has` 内边距归零与内容呼吸位、`li[data-path]` 与两种行实现（`TreeNodeRow.tsx:79-92`、`TreeRow.tsx:39-54`，均为 `<li data-path>`）的匹配、reveal 目标为 `li` 本身（`useFileTreeRevealOnRequest.ts:41-42`）。）

## 记录不修

- 行规则用标签限定的 `li[data-path]`（`:112`），而 JS 定位按属性 `[data-path]`：若将来行容器换成非 `li`，reveal 会静默退回被遮挡，且契约测试锁的是字面选择器、不会发现。当前两个行组件都是 `<li>`，属未来耦合风险；若要加固，可放宽为 `[data-path]` 或补一条「行渲染出 `li[data-path]`」的结构断言。纯可选。
- `scroll-margin-top: 34px` 与 `.adl-multitree-entry__header { min-height: 34px }`（`:81`）两处 34 需人工同步；已连续两轮提示抽 `--adl-multitree-header-height`，仍属可选优化（改高度时契约测试同样要求两处一致）。
- `sticky-workspace-headers.test.ts:101` 只保证「`:has` 规则体不含 `scroll-padding-top`」；若将来有人把 `scroll-padding-top` 加到 `.adl-multitree-scroll` 全局规则上不会变红（会影响其它树，但属假设性改动）。
- 键盘聚焦「已部分压在吸顶标题下」的行按钮不会触发补偿（实测：行顶距滚动口 21px、被标题盖住 13px 时 `focus` 的 `scrollTop` 增量 0，仅露出下半行；行内按钮不继承行的 `scroll-margin`）。属既有边角（聚焦前该行已被手动滚到该位置）、非完全遮挡（WCAG 2.4.11 最小要求仍满足），如需覆盖应给 `.adl-tree-node__label` 也加 `scroll-margin-top`。本轮不修。
- 测试文件头注释的关键约束仍是 4 条（`sticky-workspace-headers.test.ts:16-22`），未把行级 `scroll-margin` 列为第 5 条；断言已覆盖，属文档性遗漏。

## 结论

- 需修复项：0（本轮零问题）。
- rev1 F1（遮挡）、rev1 F2（契约测试强度）与 rev2 两项（容器 scroll-padding 回归、`--dnd` 断言）均已闭环，并有本子代理独立真机复算；未发现新的吸顶渲染、DnD 开关、双端一致性或测试有效性问题。
