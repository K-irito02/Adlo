# R1 confirmation review — settings-i18n-tests（rev2）

## 范围

仅 owner scope 的 20 个文件（manifest `settings-i18n-tests`）；已逐一读完 `*-rev2.diff`。快照基线 `49f76551`（23 commits / 59 files）。按契约未运行 `git diff/log/show`、未跑测试套件、未改源码/配置。上下文只读核对：`formatT.ts`、`shared/ipc/download.ts`、`browserDownloadsSlice.ts`(rev2 diff)、`BrowserDownloadPathSection.tsx`、`downloadPathReset.ts`、`DownloadPathBlock.tsx` 当前源码，以及 `grep` 复核 i18n 键与哨兵消费点。文档类（progress / plan / spec）按简报 §审查范围不审，留 P5。

## 上轮问题关闭情况（逐条）

1. **`downloads_active` 哨兵严格相等永不命中（rev1 F1 / fix-report item 5）——已关闭**。
   - `BrowserDownloadPathSection.tsx:119` 改为 `result.error.message?.includes(DOWNLOAD_ACTIVE)`；`downloadPathReset.ts:58` 改为 `error?.message?.includes(DOWNLOAD_ACTIVE)`。两处 `DOWNLOAD_REFRESH_FAILED` 仍是 `===`（`BrowserDownloadPathSection.tsx:124`、`downloadPathReset.ts:54`），符合「前端生成、无后端前缀、严格相等 by design」。
   - 测试用真实消息形状：`BrowserDownloadPathSection.test.tsx:72` 的 `{ code: 'Internal', message: 'Internal error: downloads_active' }` 并带负向断言（第 84–87 行断言不再弹 `迁移文件失败：Internal error: downloads_active`）；`downloadResetFailureCopy.test.ts:23` 对 zh/en 均用带前缀消息。删除性推演成立：若退回 `===`，两个专项 toast 用例必变红。
   - 跨 scope 依赖已核对：`browserDownloadsSlice.ts`(rev2) 导出 `DOWNLOAD_ACTIVE` 并用 `ipcRejectionMessage` 保留非 `Error` 拒绝对象的带前缀 `.message`（第 43–55、247 行），`browserDownloadsSlice.test.ts:501/513` 同样用真实前缀消息——端到端闭环成立（该 slice 属 frontend-core scope，本 scope 不产出 finding）。
   - 全仓 `downloads_active` 出现点复核：backend `Err("downloads_active")` 与测试断言保留；前端仅上述带前缀 mock 与 `DOWNLOAD_ACTIVE` 常量定义，无残留裸哨兵 mock。

2. **TS 多余 `failed: 0` 属性（fix-report item 7）——已关闭**。
   - rev1 里 8 处测试对象字面量的 `failed: 0`（resetAllSettings ×2、ResetAllDialog、BrowserDownloadPathSection ×2、StorageSettings ×8、browserReset、downloadPathReset、storageReset，以及 frontend-core 的 browserDownloadsSlice）在 rev2 全部消失，改为 `{ migrated: 0, missing: 0 }` / `{ migrated: 3, missing: 1 }`。
   - `DownloadMigrationResult` TS 接口（`shared/ipc/download.ts:51-54`）现仅 `migrated` / `missing`，Rust 侧 `failed` 字段保留供部分失败统计，符合裁定 I-5。
   - 本 scope 源码 grep `.failed\b|failed:` 仅命中其它域字段：`downloadPathReset.ts` 的 `failedStep`（恢复步骤枚举，非迁移计数字段）、`StorageSettings` 的 `pending.failed`、`settingsResetAllFailedSummary` / dsh `failed: true` mock——均非悬空引用。

## 新增发现

本轮 fix 引入的改动逐条核对，未发现 Critical/Important 回归或契约错误：

- `reportChangeResult` 抽取（BrowserDownloadPathSection.tsx）：`commitPath` 与 `handlePickDirectory` 两个调用点均改为统一入口（第 151、182 行），无遗漏；`formatT(t, key, vars)` 签名与 `Object.hasOwn(vars, name)` 占位符替换已核对（`formatT.ts:3-11`），`{migrated}/{missing}/{error}` 均能正确替换；成功 toast 仅 `autoMigrate` 时展示，与测试 mock 一致。
- `DownloadPathResetResult` / `DownloadPathResetDeps` 类型调整（types.ts）与 `resetDownloadPathToDefault` 返回 `migration: pathResult.data`（shared/settings-reset/downloadPathReset.ts）配套；`useDownloadPathReset` 的 `migrate && result.migration` 守卫对新旧 mock（`data: undefined` 与 `{ migrated: 0, missing: 0 }`）都安全。
- `BackgroundSettingsDialog.test.tsx` 把 wheel 触发移入 `waitFor` 并等 `scale > 1.5`，消除了「effect 未挂载先读到种子值 1.5」的竞态；与实现（preview 上非 passive listener、`[mode, drafts]` 依赖）相符，非空断言。
- `BrowserSettings.test.tsx` 新增用例断言 `data-testid="download-migrate-row"` 的 `storageDownloadMigrateHint`（组件 `BrowserDownloadPathSection.tsx:206/213` 实有该行与文案），删除性推演成立。
- i18n：zh/en 的 `settings.ts` 同步新增 `BlockedActive` / `Result`，占位符两侧一致；`browser.ts` 同步删除 `browserDownloadActive` / `browserDownloadCompleted`、同步新增 5 个重新下载键；全仓无对已删键的真实消费（仅 frontend-ui 的测试 mock 残留两个同名字段，属额外键、不触发悬空，且 typecheck 已过）。

### 记录不修（low / 风格 / 可选，不进主表）

- 注释（低）：`downloadPathReset.ts:42-47` 的文档注释仍写「路径步三分支：刷新失败 / 迁移失败 / 选取失败；…与改造前逐字一致」，但 fix 新增了 `storageDownloadMigrateBlockedActive` 这一专用分支。新分支可视为「迁移失败」的细化，且注释非本轮 diff 改动行；不产生行为/事实破坏，按 §复审收敛留记录。
- 文案（低，pre-existing，rev1 已记）：`storageDownloadMigrateLabel` 仍为「更改路径时自动迁移文件」/「Migrate files when path changes」，而 en 确认文案引用了「Only move files recorded in downloads」；措辞不一致但不改变行为，rev1 未列为主表项，本轮不新挖。
- 反馈噪音（低，rev1 已记）：`migrated = missing = 0` 时仍弹结果 toast；pre-existing，留产品决定。

## 结论

rev1 主表唯一 finding（哨兵严格相等）与本轮 fix-report item 2（多余 `failed: 0`）均已关闭，关闭证据来自 rev2 快照中的实际代码与用例，且删除性推演成立。本 scope 的 rev2 改动未引入新的 Critical/Important 回归或契约错误；i18n 键位、占位符与删除键的消费方均无回归。上述低危项按复审收敛放「记录不修」，不进入需修复主表。

- 需修复项：0
