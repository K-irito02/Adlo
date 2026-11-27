# R2 cleanup review — settings-i18n-tests（rev2）

## 范围

仅 owner scope 的 20 个文件（manifest `settings-i18n-tests`）；已逐一读完 `*-rev2.diff`，未查看 `-rev1.diff` 或增量。快照基线 `49f76551`（23 commits / 59 files）。按契约未运行 `git diff/log/show`、未跑测试套件、未改源码/配置、未派发子代理、未启动 dev server / 浏览器（无端口需关闭）。

R2 聚焦清理项：死代码、冗余守卫、根因修复后不再需要的防御性检查、诊断/临时日志（`[DBG-` 前缀 / 调试 console 输出）、孤儿 i18n 键、本 diff 引入的未用 import。

只读上下文核对：`downloadResetFailureCopy` / `useDownloadPathReset` 当前源码、`shared/settings-reset/downloadPathReset.ts` 与 `types.ts` 当前源码、i18n 键消费点 `grep`。

## 上轮问题关闭情况（逐条）

1. **R1 F1：`downloads_active` 哨兵严格相等永不命中（medium）——已关闭**。
   - `BrowserDownloadPathSection.tsx:120` 为 `result.error.message?.includes(DOWNLOAD_ACTIVE)`；`features/storage-settings/downloadPathReset.ts:58` 为 `error?.message?.includes(DOWNLOAD_ACTIVE)`。两处 `DOWNLOAD_REFRESH_FAILED` 仍是 `===`（第 121、54 行），符合 R1「前端生成、无后端前缀、严格相等 by design」裁定，不属本轮清理范围。
   - 测试用真实带前缀消息：`BrowserDownloadPathSection.test.tsx:72` `{ code: 'Internal', message: 'Internal error: downloads_active' }` 并带负向断言（84–87 行）；`downloadResetFailureCopy.test.ts:23` zh/en 均用带前缀消息。删除性推演成立：退回 `===` 则两个专项用例必变红。R2 不重审 R1 已关闭项。
2. **R1 rev2 已关闭项：多余 `failed: 0` 属性**——rev2 全部改为 `{ migrated, missing }`，`DownloadMigrationResult` 仅含两字段；R2 不重审。
3. **本 scope 无其它上轮主表 finding**（R1 rev2 报告结论为 0）。

## 新增发现

对 rev2 改动逐条做清理扫描，未发现需修复项：

- **无诊断/临时日志**：全 `frontend/src` `grep '\[DBG-'` 零命中；本 diff 未引入任何 `console.*`。`StorageSettings.tsx:372-516` 的 `console.warn('[storage] …')` 为既有生产 warn 日志，既不在本 diff 改动行，也属简报明确不旗的生产 warn/error，忽略。
- **无未用 import**：新增 `DOWNLOAD_ACTIVE` / `formatT` / `IpcResult` / `DownloadMigrationResult`（BrowserDownloadPathSection.tsx）、`IpcResult` / `DownloadMigrationResult`（BrowserDownloadPathSection.test.tsx）、`DOWNLOAD_ACTIVE`（downloadPathReset.ts）、`DownloadMigrationResult`（types.ts）、`zhCN`（BrowserSettings.test.tsx）均有实际读取点。
- **无死代码 / 冗余提取**：`reportChangeResult` 两个调用点（`commitPath`、`handlePickDirectory`）均接入，无遗留旧 toast 分支。
- **无孤儿 i18n 键**：新增 `storageDownloadMigrateBlockedActive` / `storageDownloadMigrateResult` 双端齐备且被组件与测试消费；`en-US/browser.ts` / `zh-CN/browser.ts` 新增 5 个重新下载键均在 frontend-ui / frontend-core 有消费方（只读核对：`BrowserDownloadItem.tsx`、`BrowserDownloadContextMenu.tsx`、`browserDownloadsSlice.ts`）。被删的 `browserDownloadActive` / `browserDownloadCompleted` 仅在 frontend-ui 测试 mock 中作额外字段残留，不构成悬空引用（该 scope 只读，不产出 finding）。占位符 `{migrated}/{missing}/{error}` 双端一致。

### 记录不修（low / 风格 / 可选，不进主表）

- `migrate && result.migration` 守卫（features/storage-settings/downloadPathReset.ts:94）与 `DownloadPathResetResult` 的 `migration?` 可选字段（types.ts:33）：`resetDownloadPathToDefault` 成功时恒返回 `migration: pathResult.data`（ok 分支 `data` 非空），理论上可收紧为必填并去掉 `result.migration` 判断。R1 rev2 已核对该守卫对新旧 mock 都安全并放行；本轮按「复审收敛」不重挖，且收紧会改变类型契约，留作可选优化。
- `downloadResetFailureCopy` 文档注释（features/storage-settings/downloadPathReset.ts:42-47）仍列「路径步三分支：刷新失败 / 迁移失败 / 选取失败」，未提及 rev2 新增的 `BlockedActive` 专用分支。R1 rev2 已记为 low 并放记录不修；新分支可视作「迁移失败」的细化，非行为/事实破坏，不重审。
- `result.error.message === DOWNLOAD_REFRESH_FAILED` 严格相等（两处）：R1 已裁定 by design，不属清理项。

## 结论

R2 清理聚焦项全部通过：无 `[DBG-]`/调试日志、无本 diff 引入的未用 import、无死代码或冗余守卫（R1 已关闭的哨兵修复不在本轮重审）、无孤儿 i18n 键。记录不修项均为 R1 已核过的可选/风格项或跨 scope 只读观察，不进入需修复主表。本 scope rev2 收敛为零问题。

- 需修复项：0
