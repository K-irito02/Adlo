# R2 定向复核报告 — rev7

- 仓库根：`E:/AI-DIGITAL-LIFE/SourceWorkspace-worktrees/slot-1`
- 快照：`.review-diffs/*-rev7.diff`（manifest-rev7，base `e16d9665`，48 文件）；对照上轮 `r2-rev6-report.md`
- 只读：未改源码 / 未跑 git diff-log-show / 未跑测试套件；复算脚本只写在 `.review-diffs/tmp/`
- 范围：R2 rev6 的 3 项 low（F1 注释绝对断言 / F2 IPC 注释 / F3 静态死代码）是否关闭 + 是否引入新问题

## 范围

1. `adlo/frontend/src/app/stores/actions/externalWorkspace.ts` 头注释 vs `WorkspaceTabBar.tsx` 实际行为
2. `adlo/frontend/src/shared/ipc/workspace.ts` 的 `addToSidebar` JSDoc（旧决策、`@see` 路径）与 `preview-bridge/preview-workspace.ts` 降级注释
3. `AgentSiteRulesPanel.tsx` 的 `configBaseRef`、`openByMethod.test.ts` 的 `refreshOneWorkspaceTree` mock、`settings.css` 的 chevron 重复块与 6 组死声明

复核方法：直接读当前源码 + ADR；另用统一 diff 复算脚本（`.review-diffs/tmp/file-delta.mjs`、`css-delta.mjs`）把 rev6 快照还原成 rev6 文件内容，与当前文件做行级 diff，确认本轮改动只包含预期行（避免「顺手删多了」）。

## 上轮问题关闭情况

### F1 注释绝对断言 — 已关闭

- `externalWorkspace.ts:12-13` 现为：「带 `removedFromSidebar: true`：侧栏、文件树、终端、检索等可见列表会过滤掉（Git 可视化标签栏目前仍按全量 `recentWorkspaces` 展示，未做过滤）」。
- 与代码一致：
  - 未过滤：`WorkspaceTabBar.tsx:24-26` 直接 `recentWorkspaces.map(...)`，文件内无 `removedFromSidebar` 判断（全仓 `removedFromSidebar` 搜索，仅测试文件命中该组件名）。
  - 已过滤：`useAppStartup.ts:83`（侧栏补全）、`useFilesPanelProps.ts:88`、`cacheHelpers.ts:424`（可见条目）、`FileNavigatorShell.tsx:187`（文件树工作区列表）、`TerminalPanel.tsx:125`（终端）、`searchSlice.ts:186`（检索）、`SearchSettingsDialog.tsx:33`、`WorkspaceSettings.tsx:98`、`CenterBrowserView.tsx:122`、`CenterTerminalView.tsx:62`、`generalActions.ts:290`、`workspaceNaturalOrderSync.ts:28`。
- 措辞已从「所有可见列表」降级为「侧栏、文件树、终端、检索等可见列表」+ 点名一个例外，不再有「所有/必然」式断言。
- 复算 diff：本文件本轮只改这 3 行（1 删 2 增），无其他改动。
- 残余观察见「记录不修」第 1、2 条（不影响本条关闭）。

### F2 IPC 注释 — 已关闭

- `shared/ipc/workspace.ts:96-99` 已改写为「保留能力：智能体文件链接**不再**走这条路径——未知工作区改用内存隐藏工作区（见 ADR 0023），应用内当前无调用方。前后端契约仍保留（server route + 三桥对齐）…」，不再以事实口吻写旧登记决策；与 `docs/adr/0023-agent-link-unknown-workspace-registration.md:31-32`（不调用 `addToSidebar`、不写 DB）一致。
- 事实核对：
  - 「应用内当前无调用方」成立：`addToSidebar` 全仓仅命中 `httpBridge.ts:892`、`mock/mock-workspace.ts:64`、`preview-bridge/preview-workspace.ts:107` 三处桥接实现 + JSDoc（应用代码零调用）。
  - 「server route + 三桥对齐」成立：`crates/server/src/router.rs:43`、`handlers/workspace.rs:173` 仍在；三桥实现存在。
- `@see` 路径已修正为 `mock/mock-workspace.ts`（文件存在，`addToSidebar` 在 `:64`）与 `preview-bridge/preview-workspace.ts`（存在，`:107`）；`httpBridge.ts` 路径不变且正确。
- `preview-bridge/preview-workspace.ts:113-114` 已同步：「该能力仅桌面端提供；应用内当前无调用方（未知工作区改用内存隐藏工作区，见 ADR 0023），预览模式保持明确降级而不是假装成功」。
- 复算 diff：`workspace.ts` 本轮只有该 JSDoc 一个 hunk；`preview-workspace.ts` 只有这两行注释替换。

### F3 静态死代码 — 已关闭

**F3-1 `configBaseRef`（已彻底移除）**

- 全仓 `configBaseRef` 0 命中；`lastValueSignatureRef` 只剩 `AgentSiteRulesPanel.tsx:391/656/659/692`。
- `:692` 改为 `base: lastValueSignatureRef.current`；`:656-661` 仍在签名变化时同步更新该 ref，`:391` 初值 `configSignature(value)` 与旧 `configBaseRef` 初始值相同，两 ref 生命周期内恒等 → 零行为变化。
- 复算 diff 精确为 4 行：删除 `:388` 声明、`:661` 赋值、`:694` 使用，新增 `:692` 同一行替换，无其他改动。

**F3-2 `refreshOneWorkspaceTree` mock（已删）**

- `openByMethod.test.ts` 内 0 命中；store mock（`:20-41`）不再含该字段，`refreshOneWorkspaceTree` 亦不被实现导入或间接调用（`openByMethod.ts` 0 命中）。
- 复算 diff 精确为 2 行删除（`const refreshOneWorkspaceTree = vi.fn();` 与 mock 字段），无其他改动。

**F3-3 `settings.css`（已删，后段规则完整）**

- 复算 diff 显示本轮 CSS 改动**恰好 16 行删除、0 行新增**：
  - chevron 重复块 6 行（rev6 `851-856`，`.adl-agent-site-rules__chevron` / `.is-open`）；
  - tab 死声明 3 行（rev6 `890-892`：`gap` / `height:38px` / `padding`）；
  - icon 死声明 2 行（rev6 `920-921`：`width/height:26px`）；
  - switch 2 行（rev6 `1103-1104`：`28/16`）；
  - thumb 2 行（rev6 `1116-1117`：`10/10`）；
  - translate 1 行（rev6 `1127`：`translateX(12px)`）。
- 后段规则仍在（同为顶层选择器，无 `@media`/`@container` 包裹，文件 `2876-2882` 有「final workbench pass」说明）：
  - `settings.css:2915-2921` chevron（`flex-shrink` + `transition` + `rotate(180deg)`）；
  - `:2941-2946` tab（`height:34px`、`padding:0 6px`、`gap:0`）；
  - `:2987-2994` icon（24×24，svg 14×14）；
  - `:3069-3072` switch（26×15）；
  - `:3073-3076` thumb（9×9）；`:3077-3079` `translateX(11px)`。
- 与主代理 Chromium 采集值一致：switch 26×15、thumb 9×9 / translateX(11px)、icon 24×24、tab 34 / gap 0 / padding 0 6px；删除的前段行 100% 被后段同选择器、同特异性、更高源序覆盖，故删除不改变计算值。
- 全 `src/**/*.css` 搜索这四组选择器，仅 `settings.css` 出现，无第三处覆盖；chevron 已无重复块。

## 新增发现

无「需修复」级新问题。

## 记录不修（观察项，不计入需修复）

1. **Git 可视化除标签栏外还有多处消费全量 `recentWorkspaces`（与注释不矛盾）。** `GitVisualizationView.tsx:154/188/269` 仍按 id/rootPath 消费全量条目，但它们是标签选中后的派生计算，不是另一份「可见列表」；注释只点名标签栏，与其行为一致。属已知产品取舍（rev6 F1 建议②会改变既有「已移除工作区」展示，需单独确认）。
2. **书签导入的「导入目标」树未过滤隐藏工作区（预存面，措辞用「等」未构成绝对断言）。** `BookmarkTransferDialogs.tsx:698-704` 把原始 `recentWorkspaces` 传给 `buildBookmarkDirectoryTree`（`browserPanelHelpers.ts:27` 无条件 map），隐藏条目会在导入目标树里出现；导出侧因空子树剪枝（`collectExportTree.ts` + `ExportDialog` 剪枝）通常不显示。这是会前既有行为（已移除工作区同样如此），且新注释以「等可见列表」作非穷尽枚举、只点名 Git 标签栏一个例外，不构成绝对断言，故本轮不修。若要彻底措辞精确，可把例外扩为「Git 标签栏、书签导入目标树」。
3. **`preview-workspace.ts` 「该能力仅桌面端提供」在 mock 语境下不严格。** 运行时浏览器模式走 preview bridge（`main.tsx:48-52`），mock bridge（`mock/mock-workspace.ts:64`）主要服务测试/降级场景，故该注释在预览降级分支内成立；不修。
4. **`@see` 路径风格不一致。** 新增 `mock/mock-workspace.ts` / `preview-bridge/preview-workspace.ts` 是深层真实文件路径，而同文件相邻条目的 `mock-bridge.ts` / `preview-bridge/index.ts` 是入口聚合名；不影响可读性与正确性，不修。

## 结论

- 上轮 3 项 low 全部关闭，且复算确认本轮改动仅限预期行（AgentSiteRulesPanel 4 行、openByMethod.test 2 行、settings.css 16 行删除、externalWorkspace 3 行注释、workspace.ts/preview-workspace.ts 各 1 个注释 hunk）。
- 需修复项：0（critical 0 / high 0 / medium 0 / low 0）。
- 记录不修：4 条（均为观察/可选措辞，不改变行为或事实）。
- 本轮零问题？**是**。
