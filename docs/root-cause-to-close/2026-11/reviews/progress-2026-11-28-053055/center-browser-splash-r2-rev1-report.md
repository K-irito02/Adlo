## 范围

- scope：center-browser-splash
- phase：r2
- rev：1
- base：`b3aa37ec45316dba2dd8b677419a6a216c2020d8`（只读 `.review-diffs` 中 rev1 快照）
- 文件（4，均本 scope owner）：
  - adlo/frontend/src/app/App.tsx（仅注释改动）
  - adlo/frontend/src/app/features/center/CenterBrowserView.tsx
  - adlo/frontend/src/app/features/center/centerOverlay.ts
  - adlo/frontend/src/app/features/center/__tests__/CenterBrowserView.test.tsx
- 未运行测试套件（未跑 check:changed / vitest / cargo test），未启动任何服务或端口，未运行 git diff/log/show，未修改任何源码。
- 只读上下文：useBrowserViewHost.ts、useWebViewBounds.ts、useWebViewVisibility.ts、useWebViewLifecycle.ts、useCenterObscured.ts、BrowserPanel.tsx、uiSlice.ts、uiSliceTypes.ts。

## 上轮问题关闭情况（逐条：已关闭 / 未关闭 + 理由）

- R1 主表为空（`center-browser-splash-r1-rev1-report.md` 结论为 0），无未关闭 finding，无需逐条复核。

## 新增发现

本轮无 finding。清理面核对结论（不构成 finding）：

- **无死代码 / 无用导出新增**：`centerOverlay.ts` 新增的 `startupOverlayHidden` 字段是全仓唯一读取点（`centerOverlay.ts:22`）的必填入参，由 `CenterBrowserView.tsx:77` 订阅、`:172` 传入；无生产代码走默认值或可选分支，不存在「声明了却没人传」的静默路径。
- **无冗余守卫 / 多余防御**：`!flags.startupOverlayHidden || …`（centerOverlay.ts:22）即根因修复本身，与 `BrowserPanel.tsx:375` 的 `!startupOverlayHidden || …` 同形；没有为「开屏」额外加 try/catch、兜底定时器或第二套隐藏通道（隐藏仍统一走 `useBrowserViewHost` 的 `overlayActive` 门控）。
- **无应删/降级的诊断日志**：本轮 4 个文件无新增 `console.*`；`useWebViewLifecycle.ts:441` 的既有 `console.warn` 属未改动存量。
- **无不必要的抽象 / 兼容层**：修复直接复用既有 `overlayActive` 契约，未新增 hook、未引入字段别名或旧值兼容分支；测试的 `useBrowserViewHost` mock 仅旁路记录入参、原样调用真实实现（test:43-52），无 `as unknown as` 私有偷看。
- **无重复接线**：`startupOverlayHidden` 在中心只被 `computeCenterOverlayActive` 消费一次，未同时并入 `isVisible`/`webViewDisabled`（`CenterBrowserView.tsx:183-185` 仍为 `!centerObscured`），与「开屏只阻止落位、不阻止创建」的分工一致，未产生双门控。
- **注释与实现一致**：App.tsx:191-192、CenterBrowserView.tsx:75-76、centerOverlay.ts:6-10 的表述与最终代码、既有 `hasOverlayActive` 口径逐句相符；旧注释只提「供 BrowserPanel」的漂移已随本轮更新消除，未残留过期描述。
- **删除性推演（清理后回归保护仍成立）**：删 `centerOverlay.ts:22` 的 `!flags.startupOverlayHidden` → `CenterBrowserView.test.tsx:159` 的 `.toBe(true)` 变红；删 `CenterBrowserView.tsx:172` 的传参 → `CenterOverlayFlags` 必填字段致 typecheck 报错，绕过类型则 `!undefined` 恒真使 `:165` 的 `.toBe(false)` 变红；删 `:77` 订阅 → 变量未定义编译失败。

## 记录不修

- （风格，可选）同一段理由（「与右侧面板 `hasOverlayActive` 同口径 / DOM 盖不住原生子窗口」）在三处各写一遍：`App.tsx:191-192`、`CenterBrowserView.tsx:75-76`、`centerOverlay.ts:6-10`，另有测试内两处半句。属注释冗余而非错误，收敛后即不再变动，不额外改。
- （存量，可选）`centerOverlay.ts:1` 的 `CenterOverlayFlags` 仅在本文件内被引用，仍以 `export` 暴露；降级为文件内类型可减一处无消费方导出，属既有形态，不在本轮动。
- （存量设计，记录）`centerOverlay.ts:12-16` 的 `addressExpanded?` 为测试可读性而保留的可选字段，实现明确不并入返回值；本轮未触碰，按既有约定保留。
- （测试文案，可选）测试 `CenterBrowserView.test.tsx:161` 注释后半句「恢复 WebView 正常定位」描述的是 overlay 转 false 后的下游效应（由 `useWebViewVisibility` 承担，jsdom 不可观测），本用例不断言该点；前半句「overlay 转 false」有断言支撑，故不按失效文案处理。
- （P5）`docs/root-cause-to-close/2026-11/progress-2026-11-28-053055.md` 的事实与措辞同步留给 P5，不属 R1/R2 范围。

## 结论

- 需修复项：0
- critical/high/medium/low 各 0。
- 本轮零问题：本轮改动是在既有 `overlayActive` 契约上的一次字段补齐，未引入死代码、无消费方导出、兼容层或诊断日志；删除性推演确认回归用例对修复有效。
