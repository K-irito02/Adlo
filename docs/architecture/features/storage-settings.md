# 存储设置与数据迁移架构

> **2026-09-15 落地**：设置面板「存储」组、10 类数据路径自定义、迁移引擎、IPC 三端桥接（tauri/preview/mock + server http 路由）。
> 完整设计见 [storage-path-settings-design.md](../../superpowers/specs/2026-09-14-storage-path-settings-design.md)；
> 实施计划见 [storage-foundation-and-wiring.md](../../superpowers/plans/2026-09-14-storage-foundation-and-wiring.md)、
> [storage-migration-engine.md](../../superpowers/plans/2026-09-14-storage-migration-engine.md)、
> [storage-ipc-and-ui.md](../../superpowers/plans/2026-09-14-storage-ipc-and-ui.md)；
> 无限 loading 根因见 [progress-2026-09-15-134108.md](../../root-cause-resolution/2026-09/progress-2026-09-15-134108.md)。

## 摘要

用户可在设置面板「存储」组查看并自定义 10 类应用数据的落点（默认统一根目录，可切换为每类独立）。
改路径后用户二选一：立即迁移并重启，或下次启动时迁移。迁移按自有文件白名单复制→校验→
切换指针→清理旧源；外部文件永不触碰。Tauri 桌面与浏览器预览双端行为一致。

## 架构变化

### 新增模块

| 模块 | 类型 | 说明 |
|------|------|------|
| `adl-kernel::storage` | Rust（`crates/kernel/src/storage/`） | `StorageCategory`（10 类）、`StorageLocator`（指针文件类型）、`StoragePaths`/`StorageService`（解析）、`whitelist`（base-aware 自有判定）、`migration`（预检/复制/校验/清理/编排） |
| `src-tauri/src/commands/storage.rs` | Rust commands | 6 个 IPC 命令（status/scan-foreign/preflight/set-paths/cancel-pending/app_restart），一律返回 `Result<IpcResult<T>, AppError>` |
| `crates/server/src/handlers/storage.rs` | Rust handlers | 同名 5 路由（无重启端点），DTO 与壳层字段级一致 |
| `StorageBridge` | TypeScript 接口 | `shared/ipc/storage.ts`，在 `DigitalLifeBridge` 中新增 `storage` 域；tauri/preview/mock 三端 + server http 路由 |
| `StorageSettings` 等 | React 组件 | `features/storage-settings/`（组装 + 分类行 + 迁移对话框 + 搬入的终端预算/下载路径区段） |

### 关键设计决策

1. **指针文件独立于数据**：`storage-locator.json` 常驻系统配置目录（`dirs::config_dir()/ai-digital-life/`），不随数据迁移，避免"根路径存进被移动的 config"的循环依赖。写入采用 tmp + rename 原子替换；测试/开发可用 `ADL_STORAGE_LOCATOR_PATH` 覆盖。
2. **迁移只在启动早期执行**：`run_startup_migration` 在任何 DB/日志句柄打开前运行；`run()` 顺序严格为 复制→校验→切换指针→清理，切换后清理失败不得删除新数据、不得重跑复制（`MigrationReport.switched` 标记）。
3. **每类覆盖语义统一为目录**：含三个 SQLite 库（覆盖值视为目录，库文件名为固定名拼接），与"选目录" UI 一致。
4. **白名单是迁移与清理的唯一依据**：base-aware 判定（相对基目录结构），凭据回退仅 `<service>.<account>.enc` 形态；`preflight` 在设置时与启动迁移前各执行一次。
5. **浏览器模式无重启能力**：`restartApp` 返回 `NOT_SUPPORTED`，"立即迁移"退化为写 pending + 提示下次启动生效。
6. **路径分类（Plan C）**：10 条可迁移路径（`database`、`downloads_db`、`site_meta_db`、`tree_cache`、`config`、`clipboard`、`snapshot`、`dsh`、`logs`、`credentials_fallback`）+ 1 个设置值路径（`downloads_default`，仅记录不迁移）+ 6 项不可移动（keyring、机器身份、localStorage、IndexedDB、WebView2、工作区缓存，UI 附原因说明）。
7. **快照路径收敛**：补丁快照路径由旧硬编码收敛到 adl-server 的 `storage.paths().snapshot_dir`；遗留目录旧快照不自动迁移。

## 经验教训（根因复盘摘要）

- Tauri 命令必须按 [`tauri-command-ipc-wrapper-pattern.md`](../../../.agents/rules/tauri-command-ipc-wrapper-pattern.md) 返回 `IpcResult` 信封；裸值在成功时被决议为裸对象，前端 `result.ok` 判失败后若再读 `result.error.message` 即抛错卡死 loading。本次 6 个新命令全部遗漏，靠用户实测日志定位。
- 前端 IPC 错误分支必须防御畸形响应（`?.` + 本地化回退），且失败路径必须解除 `loading`；成功处理函数体本身也要有 `.catch` 兜底。
- 状态查询类命令的目录遍历必须有界（深度/数量/符号链接跳过/循环去重），否则超大目录或循环挂载可卡死 IPC；用量统计与外部扫描共用同一有界 walk。
