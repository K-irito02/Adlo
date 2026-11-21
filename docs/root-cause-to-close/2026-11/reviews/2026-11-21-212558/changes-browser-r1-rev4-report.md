# R1 定向复核报告 — changes-browser / rev4

- 基线：`b96a5747f4a2ab23fde6ddc8a9748a7cdefb87f7`
- 快照：`.review-diffs/*-rev4.diff`（仅 rev4 全量 diff）
- 约束遵守：未运行 `git diff/log/show`，未改源码/配置，未跑测试；未启动 dev server / 浏览器（无端口占用）。

## 范围

只确认 r1-rev3 的唯一需修复项（`useBrowserFolderReorder.test.tsx` 非空历史用例假绿），并快速确认 rev4 未改动本 scope 其它实现。不审 `docs/**`。

## 上轮问题关闭情况

- **r1-rev3 F1（非空历史用例假绿）— 已关闭**。
  - 位置：`adlo/frontend/src/app/features/browser/useBrowserFolderReorder.test.tsx:40-51`。
  - 修复：用例已补一个已展开的非历史条目 —— `browserBookmarkFolders: [{ id: 'f1', parentId: undefined }]` + `browserTabTreeExpanded: { 'history:root': false, 'folder:f1': true }`，不再走「空集合提前返回」分支。
  - 删除性推演：当前实现（`useBrowserFolderReorder.ts:35-41`）非空历史恒 push `history:root` → `allEntryPaths = ['folder:f1','history:root']` → `every(true,false)=false`，断言 `false` 通过；还原为修复前逻辑（`historyExpanded = browserHistory.length === 0 || expanded['history:root']`，root 收起时不 push）→ `['folder:f1']` → `every=true` → 断言 `false` **变红**。若完全删掉 push 分支同样变红（`every=true`）。
  - 用例独立性：`afterEach` 复原 `browserBookmarkFolders/browserHistory/browserTabTreeExpanded`，无跨用例泄漏；同文件的三条用例（全部展开含 root / 非空折叠 false / 空历史不参与 true）互不覆盖，均保留区分能力。
- **rev4 其它实现未改动 — 已确认**。本 scope 相关文件在 rev3/rev4 快照中的 diff 字节数逐一相同，说明 rev4 仅改了 `useBrowserFolderReorder.test.tsx`（2555 → 2758）：
  - `features/browser/useBrowserFolderReorder.ts`（1244）
  - `features/browser-tree/BrowserTreeEntry.tsx`（3911）及其测试（3355）
  - `stores/browserHistoryRetention.ts`（1134）/ `.test.ts`（2298）
  - `stores/slices/browserHistorySlice.ts`（1329）/ 测试（14116）
  - `stores/persisted/registry.ts`（1030）
  - `stores/actions/gitSnapshotActions.ts`（4345）/ 测试（5201）
  - `stores/actions/editorActions.ts`（1009）/ `editorSaveActions.test.ts`（1959）
  - `hooks/useAppStartup.ts`（2543）/ 测试（2278）
  - `regions/right-panel/hooks/useChangesAutoRefresh.ts`（1542）/ 测试（2431）
  - `regions/right-panel/panels/ChangesPanel/useChangesActions.ts`（973）/ 测试（2670）、`useChangesPanelStateUtils.ts`（1055）
  - `regions/RightPanel.tsx`（1296）

因此 rev3 已确认的结论（R1-F1/F2/F3 关闭、R2 `allTreeExpanded` 实现正确、8 类回归用例可删红、并发 3 用例确定）在 rev4 继续成立。

## 新增发现

无。

## 结论

- 需修复项：0

## 记录不修（不进主表）

- rev3 报告中已记录的措辞/可选清理项在本轮未变化，仍维持「记录不修」：`useAppStartup.ts:113`「仅额外跳过 5s 新鲜期」建议改为「仅额外应用 5s 新鲜期」；空历史顶层展开按钮仍以启用态渲染（点击有意忽略）；`useAppStartup.test.ts` 标题的「全部可用工作区」只断言调用次数；`browserEntrySubEntriesUtils.test.tsx:71-76` 恒真用例；`useChangesAutoRefresh` 隐藏时定时器空转的注释措辞；`refreshAllChanges` 恒等 `targetWorkspaceIds` 参数；手动刷新无并发上限；静默批次无 in-flight 去重；watcher 未排除 `available:false`；`gitSnapshotSync.ts:41-45` 旧注释；`browserHistoryRetention.ts:9` 与手册的 P5 同步；空历史分类计数 1；`HISTORY_RETENTION_DAYS` 可降为非导出。
