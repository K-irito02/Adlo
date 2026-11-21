# frontend R2 定向复核 — rev8

## 范围

- 只核对 rev7 报告 F1 一项：`onOpenFile` 是否已从 `ChangesPanelProps`、`useChangesPanelProps`（含 `handleOpenFile`）与 `useChangesPanelState`（destructure / hook 入参 / 返回值）移除，以及是否留下残余引用。
- 依据：`.review-diffs/manifest-rev8.md`、`frontend-r2-rev7-report.md`、rev8 快照（`*_hooks_useChangesPanelProps.ts` / `*_types.ts` / `*_useChangesPanelState.tsx` / `*_panels_ChangesPanel.tsx` / `*_panels_DiffEditorSection.tsx`）与当前工作区源码。
- 未运行测试 / dev server / 浏览器，未占用端口；未写源码，只写本报告。

## 上轮问题关闭情况

1. **F1 `onOpenFile` 死 prop 链 —— 已关闭。**
   - `types.ts:193-233` 的 `ChangesPanelProps` Pick 列表已无 `'onOpenFile'`（rev8 hunk `@@ -217,7 +218,6 @@` 只删这一行）；`RightPanelViewProps.onOpenFile` 仍保留在 `types.ts:79`，并被 `FilesPanelProps`（`types.ts:165`）与 `EditorSurfaceShell`（`EditorSurfaceShell.tsx:60、104、223`）继续消费。
   - `useChangesPanelProps.ts`：`handleOpenFile` 及其 `useCallback`（原 `:86-91`）已删；返回对象与依赖数组也都不再出现 `onOpenFile` / `handleOpenFile`（现 `:100-140` 返回、`:141-180` 依赖）。文件内 `onOpenFile` / `handleOpenFile` 0 命中。
   - `useChangesPanelState.tsx`：props destructure（`:16-48`）无 `onOpenFile`；`useFileContextMenuItems` 入参（`:200-214`）只余 `includeOpenInFiles: false`，不再传 `onOpenFile`；返回对象（`:254-366`）无该字段。整个 `panels/ChangesPanel/` 目录 grep `openFile` 0 命中。
   - **无残留引用**：`props.onOpenFile` 全 `frontend/src` 0 命中；`ChangesPanel.tsx` 全文无 `onOpenFile`，其 `LazyDiffEditor` 调用（`:250-267`）不再透传；`DiffEditorSection` 的 `Pick` 列表、解构与 `binary` 占位按钮同轮已删（rev8 diff），该组件 props 也已不含此项。
   - **spread 无类型/行为问题**：`RightPanel.tsx:181` 的 `changesProps = useChangesPanelProps(...)` 返回类型即 `ChangesPanelProps`，`:117` `<ChangesPanel {...changesProps} />` 展开的属性集合与组件 props 完全一致；`ChangesPanelProps` 已不含 `onOpenFile`，运行时返回对象也不再带该键，不会多传或漏传。回调侧 `ChangesPanel` 只使用 `props.onJumpPatchHunk` / `props.diffSideBySide` / `props.onOpenChangePreview` 等仍在 Pick 内的字段。
   - **FilesPanel 链路未受影响**：`useFilesPanelProps.ts:178-183` 自建 `handleOpenFile`，`:348` 提供给 `FilesPanelProps`；`FilesPanel.tsx:59、125、463、730、769` 正常消费。

## 新增发现

无。

## 记录不修

- `useFileContextMenuItems.tsx:31-32、48-49、74-83` 仍保留可选 `includeOpenInFiles` / `onOpenFile` 与 `open-in-files` 分支；现唯一生产调用方（`ChangesPanel/useChangesPanelState.tsx:200-214`）传 `false` 且不传 `onOpenFile`，`FileNavigatorContextMenu.tsx:47-59` 不传，故该分支不可达。此项在 rev7 报告已明确列为「可选一并清理」，不改变行为、无类型影响，本轮按可选优化保留（若后续确认不需要该通用能力，可在下一轮连同 `i18n/{zh-CN,en-US}/file.ts` 的 `fileContextOpenWith` 与 `WorkspaceChangesActions.test.tsx:76` 入参一起删）。不影响双端行为与本轮结论。

## 结论

- 需修复项：0（critical 0 / high 0 / medium 0 / low 0）；本轮零问题。
