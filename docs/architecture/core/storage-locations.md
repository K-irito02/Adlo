# 存储路径解析与存储设置组（`adl-kernel::storage`）

> 由 `adlo/AGENTS.md` 迁出的存储实现参考（2026-11-09 瘦身，内容原样保留，便于 AGENTS 常驻注入减负）。实现入口：`src-tauri/src/setup.rs`、`adl-server` `engine`、壳层 `app.rs` 命令。

## 存储路径解析

- 所有应用数据路径由 `adl-kernel::storage` 的 `StoragePaths` 统一解析；locator 文件为 `<dirs::config_dir()>/adlo/storage-locator.json`（Plan A 阶段只读，缺失时回退默认；Plan B 起由启动期迁移写入指针切换结果），默认统一根 = 优先「与安装目录同级的 `<安装目录名>-data`」，该路径不可写（如 Windows 拦截的 Program Files 只读位置）时回退系统用户数据目录（壳层 `app_data_dir()`，见 `src-tauri/src/setup.rs::default_data_root`）。
- 日志目录：debug（dev）构建写仓库根 `.adl-logs`，release 构建写 `<root>/logs`。
- **已知行为**：补丁快照路径为 adl-server 的 `storage.paths().snapshot_dir`；默认目录外的旧快照不自动迁移，需手动移动（Plan B 只处理用户发起的路径变更）。

## 启动期存储迁移（Plan B）

- **时机**：待迁移登记在 locator 的 `pendingMigration` 中（由设置页写入），真正的迁移在**下次进程启动、且任何 DB / 日志句柄打开之前**执行（壳层 `setup::run_startup_migration` 与 adl-server `engine::run_startup_migration` 均调用 `adl-kernel::storage::apply_pending`），因此不存在持有 SQLite 句柄时搬文件的问题；不做运行中热迁移。
- **成功**：按分类复制 → 校验（尺寸一致 + SQLite `PRAGMA quick_check`）→ **切换 locator 指针并落盘**（清理之前的最后一步）→ 清理旧源。清理只删除自有文件（base-aware 白名单），**外部文件永不删除、其所在目录保留**并记入 `lastReport.keptDirs`；`pendingMigration` 清空、`lastReport` 记为成功。`retainSource: true` 时跳过清理。
- **失败**：不切换指针、不删除源文件（旧路径数据完好），`pendingMigration.failed = true` 并记录 `error`，应用仍以旧路径正常启动；`lastReport` 记为失败，**不自动重试**，等待用户在设置中重试或取消。失败时会 best-effort 删除本次新建的目标文件。
- **幂等**：目标已存在且大小一致的副本会被跳过，中断后重跑安全。
- **locator 落点覆盖**：`locator_path()` 支持环境变量 `ADL_STORAGE_LOCATOR_PATH`（未设置时回退 `<dirs::config_dir()>/adlo/storage-locator.json`），供测试/开发把指针落点重定向到临时文件，避免读写真实 `%APPDATA%` locator。
- **派生路径跟随覆盖**：`locator_dir()` 在设了 `ADL_STORAGE_LOCATOR_PATH` 时返回该文件所在目录，因此由它派生的路径（如 `credentials_dir`）随实例走；多工作树并行时并发实例互不共享凭证回退目录。仍共享的只有 OS 密钥环条目（`keyring` 按 service 名存于系统凭据管理器，与进程身份无关）。

## 存储设置组（Plan C）

- 设置面板新增「存储」组：统一根 / 每类独立两种模式；浏览器默认下载路径已搬入该组统一管理，行为不变。
- 双端实现策略：Tauri 经 `storage_*` 命令直写 locator 并可 `app_restart` 立即迁移；浏览器（preview/http + mock 四端 `StorageBridge` 方法集一致——Tauri/Preview/Mock 三实现 + HTTP preview 传输形态，见 `frontend/src/shared/ipc/__tests__/storage-parity.test.ts`）手输路径，`restartApp` 返回 `NOT_SUPPORTED` 并提示下次启动生效。
- 可配置 10 条可迁移路径（`database`、`downloads_db`、`site_meta_db`、`tree_cache`、`config`、`clipboard`、`snapshot`、`harnesses`、`logs`、`credentials_fallback`，顺序与 `StorageCategory::key()` 一致）+ 1 个设置值路径（`downloads_default` 为用户文件落点，仅记录浏览器默认下载目录，不迁移、不统计占用、不扫描外部文件）与不可移动 6 项（keyring、机器身份、localStorage、IndexedDB、WebView2、工作区缓存）在 UI 中全部列出并附原因说明。
- 磁盘空间分歧（已接受）：服务端 `freeBytes` 恒为 0（"unknown"）；UI 不渲染空间 verdict，`freeBytes == 0` 即视为未知并跳过空间判定（与壳层 `free_bytes > 0` 门控同约定）。
- 预检非纯只读（B7）：`preflight` 会创建目标父目录并写入 `.adl-write-probe` 探测文件，供 UI 预检目标可写性。
