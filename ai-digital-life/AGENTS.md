# AI Digital Life - 实现工作区规则

本目录是 `AI Digital Life` 的真实实现工作区，基于 **Rust + Tauri 2.x**。

## 技术栈

| 层级 | 技术 |
|------|------|
| 后端 | Rust stable + Tauri 2.x + tokio + rusqlite + serde + tracing |
| 前端 | React 19 + Vite + Zustand + TypeScript + CodeMirror 6 + xterm.js；Markdown 预览 markdown-it + starry-night（语法高亮）+ github-markdown-css（变量驱动单表，见 `frontend/scripts/generate-md-theme-vars.mjs`） |
| 桥接 | `#[tauri::command]` + `@tauri-apps/api` |
| 打包 | `cargo tauri build` |
| 包管理 | pnpm（前端）/ Cargo（Rust） |
| Rust 质量 | `cargo clippy` + `cargo fmt` + `rustfmt.toml` + `clippy.toml` |
| 前端质量 | ESLint v9（flat config）+ Prettier + TypeScript-ESLint + React Hooks plugin |
| Rust Lint | `pnpm run cargo:clippy` |
| 前端 Lint | `cd frontend && npx eslint . && npx tsc --noEmit` |
| 桌面 E2E | `@wdio/tauri-service`（embedded WebDriver，opt-in；`pnpm run e2e`，**不进** `check:all`，见技能 `desktop-e2e-wdio`） |
| 门禁 | 唯一真源：[`.agents/rules/quality-gates.md`](../.agents/rules/quality-gates.md)。日常 `pnpm --dir frontend run check:changed`；合并/发布前 `pnpm run check:all`（含前端 `check:full`）。全量必须先获用户批准；hooks 启用：`pnpm --dir ai-digital-life run setup:worktree` |
| 凭据存储 | `crates/credential/`（keyring + 加密文件降级） |

### 存储路径解析（`adl-kernel::storage`）

- 所有应用数据路径由 `adl-kernel::storage` 的 `StoragePaths` 统一解析；locator 文件为 `<dirs::config_dir()>/ai-digital-life/storage-locator.json`（Plan A 阶段只读，缺失时回退默认；Plan B 起由启动期迁移写入指针切换结果），默认统一根 = 优先「与安装目录同级的 `&lt;安装目录名&gt;-data`」，该路径不可写（如 Windows 拦截的 Program Files 只读位置）时回退系统用户数据目录（壳层 `app_data_dir()`，见 `src-tauri/src/setup.rs::default_data_root`）。
- 日志目录：debug（dev）构建写仓库根 `.adl-logs`，release 构建写 `<root>/logs`。
- **已知行为**：补丁快照路径为 adl-server 的 `storage.paths().snapshot_dir`；默认目录外的旧快照不自动迁移，需手动移动（Plan B 只处理用户发起的路径变更）。

#### 启动期存储迁移（Plan B）

- **时机**：待迁移登记在 locator 的 `pendingMigration` 中（由设置页写入），真正的迁移在**下次进程启动、且任何 DB / 日志句柄打开之前**执行（壳层 `setup::run_startup_migration` 与 adl-server `engine::run_startup_migration` 均调用 `adl-kernel::storage::apply_pending`），因此不存在持有 SQLite 句柄时搬文件的问题；不做运行中热迁移。
- **成功**：按分类复制 → 校验（尺寸一致 + SQLite `PRAGMA quick_check`）→ **切换 locator 指针并落盘**（清理之前的最后一步）→ 清理旧源。清理只删除自有文件（base-aware 白名单），**外部文件永不删除、其所在目录保留**并记入 `lastReport.keptDirs`；`pendingMigration` 清空、`lastReport` 记为成功。`retainSource: true` 时跳过清理。
- **失败**：不切换指针、不删除源文件（旧路径数据完好），`pendingMigration.failed = true` 并记录 `error`，应用仍以旧路径正常启动；`lastReport` 记为失败，**不自动重试**，等待用户在设置中重试或取消。失败时会 best-effort 删除本次新建的目标文件。
- **幂等**：目标已存在且大小一致的副本会被跳过，中断后重跑安全。
- **locator 落点覆盖**：`locator_path()` 支持环境变量 `ADL_STORAGE_LOCATOR_PATH`（未设置时回退 `<dirs::config_dir()>/ai-digital-life/storage-locator.json`），供测试/开发把指针落点重定向到临时文件，避免读写真实 `%APPDATA%` locator。
- **派生路径跟随覆盖**：`locator_dir()` 在设了 `ADL_STORAGE_LOCATOR_PATH` 时返回该文件所在目录，因此由它派生的路径（如 `credentials_dir`）随实例走；多工作树并行时并发实例互不共享凭证回退目录。仍共享的只有 OS 密钥环条目（`keyring` 按 service 名存于系统凭据管理器，与进程身份无关）。

#### 存储设置组（Plan C）

- 设置面板新增「存储」组：统一根 / 每类独立两种模式；浏览器默认下载路径已搬入该组统一管理，行为不变。
- 双端实现策略：Tauri 经 `storage_*` 命令直写 locator 并可 `app_restart` 立即迁移；浏览器（preview/http + mock 四端 `StorageBridge` 方法集一致——Tauri/Preview/Mock 三实现 + HTTP preview 传输形态，见 `frontend/src/shared/ipc/__tests__/storage-parity.test.ts`）手输路径，`restartApp` 返回 `NOT_SUPPORTED` 并提示下次启动生效。
- 可配置 10 条可迁移路径（`database`、`downloads_db`、`site_meta_db`、`tree_cache`、`config`、`clipboard`、`snapshot`、`harnesses`、`logs`、`credentials_fallback`，顺序与 `StorageCategory::key()` 一致）+ 1 个设置值路径（`downloads_default` 为用户文件落点，仅记录浏览器默认下载目录，不迁移、不统计占用、不扫描外部文件）与不可移动 6 项（keyring、机器身份、localStorage、IndexedDB、WebView2、工作区缓存）在 UI 中全部列出并附原因说明。
- 磁盘空间分歧（已接受）：服务端 `freeBytes` 恒为 0（"unknown"）；UI 不渲染空间 verdict，`freeBytes == 0` 即视为未知并跳过空间判定（与壳层 `free_bytes > 0` 门控同约定）。
- 预检非纯只读（B7）：`preflight` 会创建目标父目录并写入 `.adl-write-probe` 探测文件，供 UI 预检目标可写性。

## 项目形态

当前形态：**桌面应用宿主 + 第三方 Agent harness 集成**。Agent 对话、模型接入与编排由接入的外部 harness 提供，本仓只负责宿主集成（进程托管、版本管理、宿主渲染）。

- 能力清单与实现落点：[system-overview.md](../docs/architecture/core/system-overview.md#已实现能力清单详细)（AGENTS 不再复制清单，只保留边界与约束）。
- 架构概念与文件落点：[CONTEXT.md](../CONTEXT.md)；并行/运行/调试：技能 [parallel-branch-development](../.agents/skills/parallel-branch-development/SKILL.md)（唯一真源）。
- 测试计数不在此维护，运行 `pnpm run cargo:test` / `pnpm --dir frontend run test` 获取。

## 安全边界

| 层 | 允许 | 禁止 |
|----|------|------|
| Rust Backend | 文件系统、SQLite、模型请求、凭据 | 直接操作 DOM |
| WebView | UI 渲染、状态编排、订阅事件 | 直接访问系统能力、密钥、原始 SQL |

跨进程能力通过 `#[tauri::command]` + `capabilities/*.json` 白名单暴露。

## 双端一致性

所有功能必须双端可用；规范见 [根目录 AGENTS.md](../AGENTS.md#双端一致性)。

## 命令规范

- 新 Tauri Command 必须类型化（`serde`）、登记到 `capabilities/*.json`
- 返回 `Result<T, AppError>` 结构化错误
- SQLite schema 变更必须附带迁移脚本

### 桌面 E2E（按需）

```powershell
pnpm run e2e:build   # 内置 stage:sidecar；debug + --features e2e，不要改用 release
pnpm run e2e         # 必须经 e2e/run-e2e.mjs 包装器
```

- 包装器负责清理 Windows 硬杀留下的 `adl-server.exe` 孤儿（否则锁二进制、下次构建 `PermissionDenied`）；结果摘要写入 `e2e/artifacts/last-run.json`。
- 数据目录隔离在 `%APPDATA%\com.ai-digital-life.app.e2e`；生产 `tauri.conf.json` 的 `withGlobalTauri:false` 不变。
- 套件不进 `check:all`；`pnpm run e2e:typecheck` 由 pre-push 执行。用例规则、已知坑与从零重建见技能 `desktop-e2e-wdio`。

## 设计系统约束

| 约束 | 规则 |
|------|------|
| 颜色 | 必须使用 CSS 自定义属性 `var(--…)` |
| 图标 | SVG 格式，继承 `currentColor`，禁止 emoji。动画反馈场景可例外使用 `lucide-animated`（MIT 许可）|
| Tooltip | 统一使用自定义 Tooltip 组件；原生 `title` 仅用于无交互的补充说明 |
| 窗口 | 最小宽度 640px |

详见 [docs/design-system/](../docs/design-system/)

## Stores 架构（Zustand 切片合并模式）

```
app/stores/
├── slicedStore.ts               # 切片合并 Store（真源）
├── StoreState.ts                # 完整类型接口
├── types.ts                     # 共享类型（ToolId/ChatMode/TerminalProfile/ContextChip）
├── shared.ts                    # 共享工具 barrel（re-export）
├── storageHelpers.ts            # localStorage 读写工具
├── cacheHelpers.ts              # 缓存系统（TTL/LRU）、请求序列
├── selectors.ts                 # 性能选择器（useShallow）
├── slices/                      # 27 个独立切片（含 8 浏览器，以 slicedStore.ts 实测为准）
│   ├── uiSlice.ts / workspaceSlice.ts / gitSlice.ts（含 gitVisSlice）
│   ├── editorSlice.ts / patchSlice.ts
│   ├── searchSlice.ts / diagnosticSlice.ts
│   ├── clipboardSlice.ts（含 clipboardHistorySlice）/ terminalSlice.ts
│   ├── centerTabsSlice.ts           # 中心标签
│   ├── dshSlice.ts                  # dsh 宿主
│   ├── referenceSlice.ts            # 引用管理
│   ├── systemMonitorSlice.ts        # 系统监视器
│   ├── notificationSlice.ts / errorToastSlice.ts / toastSlice.ts / fileOpNoticeSlice.ts
│   ├── browserSlice.ts              # 浏览器核心（导航布局、持久化、跨领域）
│   ├── browserTabsSlice.ts          # 浏览器标签页
│   ├── browserBookmarkSlice.ts      # 浏览器书签
│   ├── browserHistorySlice.ts       # 浏览器历史记录
│   ├── browserFoldersSlice.ts       # 浏览器标签文件夹
│   ├── browserLandingSlice.ts       # 浏览器着陆页（快捷站点、端口、背景）
│   ├── browserSearchEnginesSlice.ts # 搜索引擎管理
│   └── browserDownloadsSlice.ts     # 下载记录与设置
└── actions/                     # 18 个跨切片 action 模块（*Actions.ts，+ helpers/类型文件）
    ├── workspaceActions.ts / workspaceLifecycleActions.ts / workspaceTreeActions.ts
    ├── editorActions.ts / patchActions.ts
    ├── gitActions.ts / gitBranchActions.ts / gitFileOpsActions.ts / gitSnapshotActions.ts / gitVisActions.ts
    ├── fetchActions.ts / generalActions.ts / searchActions.ts
    ├── referenceActions.ts / utilitiesActions.ts
    ├── centerActions.ts / dshActions.ts / browserCleanupActions.ts
```

### 关键文件

| 文件 | 职责 |
|------|------|
| `frontend/src/app/stores/slicedStore.ts` | 切片合并 Store（真源） |
| `frontend/src/app/stores/StoreState.ts` | 完整类型接口 |
| `frontend/src/app/stores/slices/browserFoldersSlice.ts` | `BookmarkTabItem`（`TabFolderState.tabs` 元素类型：`{ tabId, url, title }`） |
| `frontend/src/app/stores/selectors.ts` | 性能选择器（useShallow） |

## 文档入口

- [README.md](./README.md)
- [CONTRIBUTING.md](./CONTRIBUTING.md)
- [parallel-branch-development](../.agents/skills/parallel-branch-development/SKILL.md) — 并行分支开发技能（唯一真源；工作树/槽位、开工自检）
- [docs/architecture/core/system-overview.md](../docs/architecture/core/system-overview.md)
- [docs/design-system/README.md](../docs/design-system/README.md)

## 调试工具

| 功能 | 说明 |
|------|------|
| 日志收起器 | `frontend/src/app/utils/debugLogCollector.ts`，拦截所有 console 输出，自动收起存储 |
| 复制按钮 | 页面右上角可拖拽"复制调试日志"按钮 |
| 自动写入 | `.adl-logs/`（debug 构建）；Tauri 桌面壳 `debug-logs*.txt`、浏览器模式 `debug-logs-browser*.txt` |
| 后端命令 | `src-tauri/src/commands/app.rs` → `write_debug_logs_to_project` |
| 浏览器后端 | `frontend/dev/previewWorkspaceService/`（目录，`logging.ts` → `writeDebugLogs`） |

**优先级**：调试日志收起器是最高优先级的调试手段，遇到 UI/交互问题时优先使用。详见 [仓库根 AGENTS.md](../AGENTS.md#问题排查与调试)。

### 日志 CLI 与落点

日志级别与写入模式的 CLI 覆盖（`--log-level`、`--terminal-log-mode`、`--debug-log-mode`、`--log-mode`）、优先级与 `RUST_LOG` 硬顶、`session-only` 语义、运行期同步，以及壳 / 浏览器 / `adl-server` 三个进程的日志文件落点，统一见 [docs/development/log-system-manual.md](../docs/development/log-system-manual.md)。本节不复述，避免手册与文档漂移。

## 问题排查规范

先定位根因，禁止凭空猜测；调试手段与优先级见 [根目录 AGENTS.md](../AGENTS.md#问题排查与调试) 与 [dev-rules.md](../../.agents/rules/dev-rules.md#问题排查规范)。

## 未发布阶段禁止兼容性代码

见根目录 [禁止项](../AGENTS.md#禁止项)。

## 相关文件

- [仓库根 AGENTS.md](../AGENTS.md) — 项目治理规则
- [FUTURE-ROADMAP.md](../FUTURE-ROADMAP.md) — 未来想法
- [docs/analysis/ai-digital-life/](../docs/analysis/ai-digital-life/) — ADL 源码地图（本项目的渐进式索引）

## 磁盘空间管理

### target/debug 成因与现状

`target/debug/deps` 以 `.pdb`（Windows 调试符号）为主 —— `[profile.dev]` 默认 `debug=2`（全量类型调试信息）为每个 exe/测试二进制生成约 300MB PDB。已通过 `.cargo/config.toml` 治理：

- 第三方依赖 `debug=1`（行号级）+ `opt-level=1`
- 自己 24 个包 `[profile.dev.package.X]` 白名单保留 `debug=2`（可断点查变量类型，见 `.cargo/config.toml` 白名单实测 24 个）
- 重开增量编译（`incremental=false` 已移除，ICE 于 1.97.1 修复）

### 清理策略（空间阈值触发全量清理）

| 条件 | 阈值 | 说明 |
|------|------|------|
| 空间 | `target/debug` > 30 GB | 超过即执行 `cargo clean` 全量删除 |

不再按时间窗口判断；超过 30 GB 直接全量清理。

> 清理脚本 `clean-target.ps1` 自身带 30GB 阈值判断（`$Threshold = 30`，未超阈即跳过）；本项目无远程 CI，清理只在本地按需执行。

> 所有删除均为**永久删除**：`cargo clean`（及 `clean-target.ps1`）直接物理删除构建产物，**不进入回收站/垃圾箱**，删除后无需清空回收站。

### 预防措施

```powershell
# 干跑预览（不实际删除）
powershell -File .cargo\clean-target.ps1 -WhatIf

# 执行清理（target/debug 超 30 GB 时全量 cargo clean）
powershell -File .cargo\clean-target.ps1
```

相关文件：`.cargo/config.toml`（alias `rebuild` = `clean && build`、`prune` = `clean`）。
