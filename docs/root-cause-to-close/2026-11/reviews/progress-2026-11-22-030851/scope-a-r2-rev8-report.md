# R2 rev8 — scope A 定向复核（仅 rev7 的 3 条 low）

## 范围

- 快照：`.review-diffs/*-rev8.diff`（base `b96a574`），只核对 rev7 报告 `.review-diffs/scope-a-r2-rev7-report.md` 的 F1–F3 及修复是否引入新问题。
- 复核文件：`adlo/frontend/src/app/App.tsx`、`regions/TitleBar.tsx`、`stores/slices/uiSlice.ts`、`stores/slices/uiSliceTypes.ts`、`stores/slices/__tests__/uiSliceAboutLicense.test.ts`、`crates/workspace/src/detect.rs`、`dev/previewWorkspaceService/files.ts`、`dev/previewWorkspaceService/openWorkspaceCreate.test.ts`、`regions/__tests__/titleBarLicense.test.tsx`。
- 未运行 dev server / 浏览器 / 测试套件，无端口占用，无临时文件。

## 上轮问题关闭情况（逐条）

- **F1（low，`openShortcutsSettings` 两份实现、键盘路径不清搜索）→ 已关闭**
  - `uiSlice.ts:199-202` 新增 `openShortcutsSettings`（`navigateRightTool('settings')` + `activeSettingsGroup: 'shortcuts'` + `settingsSearchQuery: ''`），类型登记在 `uiSliceTypes.ts:314-315`。
  - `App.tsx:133-135`（键盘路径）与 `TitleBar.tsx:64-66`（菜单路径）都改为调用该 action；全仓 grep 已无 `setActiveSettingsGroup('shortcuts')` 的内联副本。
  - 删除性推演：删掉 action 里的 `settingsSearchQuery: ''` → `uiSliceAboutLicense.test.ts:29-41` 的 `expect(state.settingsSearchQuery).toBe('')` 变红（前置 `'theme'`）；删掉 `activeSettingsGroup` 同理变红。
  - 残余（不阻塞）：两处仅剩 3 行 `useCallback` 转发（与既有 `openLicense`/`handleClose` 同形），属常规接线而非重复实现。

- **F2（low，`ensure_workspace_dir_with_root` 绝对分支生产不可达、用例走私有 helper）→ 已关闭**
  - `detect.rs:85-99` 只保留相对单段名称解析，`if input.is_absolute()` 分支已删除；绝对路径只在公开入口 `ensure_workspace_dir:77-83` 分流到 `ensure_dir_target`。
  - 三个绝对路径用例（`creates_an_absolute_missing_directory_recursively:184-194`、`accepts_an_existing_directory:196-206`、`rejects_an_existing_file:208-216`）改走公开 `ensure_workspace_dir`；`resolves_a_single_name_under_the_default_root:218-228` 仍用 helper 注入默认根，用途正当。
  - 删除性推演：删掉 `ensure_workspace_dir` 的绝对路径早退（:78-80）→ 绝对输入落入 `_with_root` 被当作非单段名称，`creates_an_absolute_missing_directory_recursively` 与 `accepts_an_existing_directory` 变红；即公开入口的绝对分支现在有回归保护（此前没有）。
  - 未发现残留注释/未用参数：`ensure_workspace_dir` 的 JSDoc 与「绝对递归创建 / 相对单段名 / 已存在非目录报错」三条行为一致。

- **F3（low，preview 默认根注释把差异写成同口径）→ 已关闭**
  - `files.ts:772-776` 明确「桌面用 `dirs::document_dir()`；预览取 `<home>/Documents` 近似，OneDrive 重定向时可能不同」；`resolveWorkspaceTarget` 的 JSDoc 改为「create 分支与桌面同口径；默认根取值见 `previewDefaultWorkspaceRoot`」。
  - 与实现逐句相符（`files.ts:775` 仍是 `path.join(os.homedir(), 'Documents', 'Adlo Workspaces')`），不再把默认根写成事实一致。

## 新增发现

无。三项修复均未改变对外行为契约：
- 前端：`openShortcutsSettings` 的三处写入（导航 + 切组 + 清查询）与旧 TitleBar 内联完全等价，键盘路径是补齐而非变更；`openAboutLicense` 未动。
- Rust：`ensure_workspace_dir` 公共行为不变（绝对递归创建 / 相对名落默认根 / 非目录报错），仅删除不可达分支。
- 预览：仅注释措辞，`resolveWorkspaceTarget`/`openWorkspace` 逻辑未动。

## 记录不修

- `titleBarLicense.test.tsx:28-40` mock store 仍缺 `openShortcutsSettings`（rev7 已记录）。当前用例只点 license 行，不触发；若后续补「快捷键菜单项接线」用例需同时补 `setSettingsSearchQuery`/`openShortcutsSettings` mock，否则会抛 `is not a function`。
- `uiSliceAboutLicense.test.ts` 现同时覆盖 `openAboutLicense` 与 `openShortcutsSettings`，文件名只提 about；两个 describe 标题与断言一致，属命名可读性，非失效文案。
- `files.ts:772` `previewDefaultWorkspaceRoot` 仍对外导出但无外部消费方（rev7 已记录，可选清理）。

## 结论

- 需修复项：0（本轮零问题）
  - rev7 的 3 条 low 全部关闭，且修复的删除性推演均能变红；未引入新问题。
