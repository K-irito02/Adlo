# Rust Crates (22 个 member crates + 1 个 vendored 补丁目录)

> 路径前缀: `adlo/crates/`
> 内部依赖统一 `adl-` 前缀命名（如 `adl-errors`、`adl-kernel`、`adl-types`，见 `.agents/rules/rust-crate-adl-prefix-convention.md`）。
> 本页为实现快照（细节以源码为准）；包职责总表见 [03-package-index.md](../03-package-index.md)。

## 1. types（纯类型）

| 项目 | 值 |
|------|-----|
| 路径 | `crates/types/` |
| 用途 | 纯类型定义（无运行时依赖）：共享领域类型 + `doom_loop` + `types/` 子模块（`session`/`config`/`commands` 等） |
| 依赖 | serde、serde_json、uuid、chrono、ts-rs、adl-errors、adl-logging |

## 2. kernel（运行时）

| 项目 | 值 |
|------|-----|
| 路径 | `crates/kernel/` |
| 用途 | 运行时模块：`app_info`、`config`（`DEFAULT_LANGUAGE="system"`，OS 跟随）、`config_watcher`、`events`、`storage`（`StoragePaths` 统一路径解析） |
| 依赖 | adl-errors、adl-types、serde、serde_json、ts-rs、uuid、chrono、tokio、tracing、notify |

## 3. errors（错误枚举）

| 项目 | 值 |
|------|-----|
| 路径 | `crates/errors/` |
| 用途 | `AppError` 统一错误枚举（thiserror 派生），禁止 `Result<_, String>` |
| 依赖 | serde、thiserror |

## 4. storage（SQLite 存储）

| 项目 | 值 |
|------|-----|
| 路径 | `crates/storage/` |
| 用途 | SQLite 连接池、Schema 初始化、CRUD（`connection`/`entity_crud`/`entity_table`/`part_crud`/`purge`/`repository`/`session`/`durable`），WAL 模式 |

**依赖:** `rusqlite`, `serde_json`, `adl-errors`, `adl-kernel`

## 5. migration（Schema 版本管理）

| 项目 | 值 |
|------|-----|
| 路径 | `crates/migration/` |
| 用途 | SQLite Schema 版本管理、自动迁移 |

**依赖:** `adl-storage`, `adl-errors`

## 6. adl-logging（日志框架）

| 项目 | 值 |
|------|-----|
| 路径 | `crates/adl-logging/` |
| 用途 | `tracing` 集成、日志文件 Appender、会话日志管理器 |
| 关键模块 | `config.rs`, `error.rs`, `manager.rs`, `mode.rs`, `session.rs`, `overrides.rs` |

**依赖:** `tracing`, `tracing-subscriber`, `tracing-appender`, `adl-errors`

## 7. workspace（文件系统/Git/搜索）

| 项目 | 值 |
|------|-----|
| 路径 | `crates/workspace/` |
| 用途 | 文件系统操作、Git 操作、全文搜索、目录树、变更预览，多工作区管理 |

**依赖:** `adl-errors`, `adl-kernel`, `git2`, `ignore`, `walkdir`

## 8. pty（终端进程管理）

| 项目 | 值 |
|------|-----|
| 路径 | `crates/pty/` |
| 用途 | Rust 侧 PTY 进程生命周期管理、Shell 解析、会话管理 |
| 模块 | `traits.rs`, `rust_pty_impl.rs`, `session_manager`, `shell_resolver.rs` |

**依赖:** `adl-errors`, `serde_json`, `tokio`

## 9. fs-ops（文件操作）

| 项目 | 值 |
|------|-----|
| 路径 | `crates/fs-ops/` |
| 用途 | 文件读写/监控/观察 |

**依赖:** `adl-errors`, `notify`, `tokio`

## 10. outline（大纲解析）

| 项目 | 值 |
|------|-----|
| 路径 | `crates/outline/` |
| 用途 | 代码大纲/symbol 解析（`brace.rs` 覆盖 Rust/TypeScript 等大括号语言 + python/html/css/json/markdown/shell/sql/vue/yaml 专用解析器） |

**依赖:** `adl-errors`, `tree-sitter`

## 11. credential（密钥管理）

| 项目 | 值 |
|------|-----|
| 路径 | `crates/credential/` |
| 用途 | 系统 keyring + 加密文件降级两级凭据存储，禁入普通配置/日志 |

**依赖:** `adl-errors`, `keyring`

## 12. ci-status（GitHub Actions CI）

| 项目 | 值 |
|------|-----|
| 路径 | `crates/ci-status/` |
| 用途 | GitHub Actions CI 状态轮询、缓存、解析 |
| 模块 | `ci_client.rs`, `ci_cache.rs`, `ci_parser.rs` |

**依赖:** `adl-errors`, `reqwest`, `serde_json`

## 13. clipboard（剪贴板历史）

| 项目 | 值 |
|------|-----|
| 路径 | `crates/clipboard/` |
| 用途 | 剪贴板历史持久化 |

## 14. sysmon（系统监视器）

| 项目 | 值 |
|------|-----|
| 路径 | `crates/sysmon/` |
| 用途 | 系统状态监控 |

## 15. change-engine（Patch/Snapshot/Revert）

| 项目 | 值 |
|------|-----|
| 路径 | `crates/change-engine/` |
| 用途 | Patch 创建与应用、Snapshot 快照、Revert 回滚、校验、文件变更语言检测 |
| 模块 | `patch_create.rs`, `patch_apply.rs`, `snapshot.rs`, `revert.rs`, `validation.rs`, `language.rs`, `document_patch.rs` |

**依赖:** `adl-errors`, `adl-kernel`, `similar`

## 16. server（adl-server 后端引擎）

| 项目 | 值 |
|------|-----|
| 路径 | `crates/server/` |
| 用途 | 浏览器模式真实后端（HTTP API + WebSocket），与 Tauri 壳共用领域逻辑；集成测试位于 `crates/server/tests/`（`common/mod.rs` helpers） |

## 17. webapp-host（dsh 进程托管）

| 项目 | 值 |
|------|-----|
| 路径 | `crates/webapp-host/` |
| 用途 | 第三方 harness（DSH 与 OpenCode CLI）进程拉起与托管 |

## 18. harness-version（harness 版本管理）

| 项目 | 值 |
|------|-----|
| 路径 | `crates/harness-version/` |
| 用途 | 宿主版本目录管理（`<root>/installed/<v>/` + `selected.txt`）：已装版本枚举/查询最新/回退/卸载/升级/重装；npm registry 目录查询（正式版/预发布分桶，镜像优先，DSH 与 OpenCode 多包线合并）；真安装引擎（`install.rs`）/任务进度与取消（`task.rs`）；系统 PATH 探测（`where` → `--version` → semver 解析）；安装包不预置版本，所有版本均为普通宿主版本 |

**模块:** `install.rs`（真安装引擎）、`install_opencode.rs`（OpenCode 安装/多包线）、`spec.rs`（harness 描述符/包线/marker 定义）

## 19. adl-env（环境依赖源模型）

| 项目 | 值 |
|------|-----|
| 路径 | `crates/adl-env/` |
| 用途 | 六依赖 provider 检测与宿主安装/卸载（node/git/bash/webview2/adlserver/netprobe）；来源偏好（`env-sources.json`）与基线（`env-baseline.json` 资源）；纯函数 `resolve()` 解析实际来源（auto 宿主优先，强制来源不静默降级） |

## 20. adl-hosted（宿主版本/进程原语）

| 项目 | 值 |
|------|-----|
| 路径 | `crates/adl-hosted/` |
| 用途 | 通用托管安装层：版本目录布局 + 原子换装（残留备份告警）、adopt 既有安装、安装锁；子进程宿主（参数脱敏）+ 可轮询进度任务 |
| 入口 | `HostedVersions`、`swap_into_place`、`InstallLock`、`spawn_with_marker`/`HostedProcess`、`ProgressTask`/`ProgressSnapshot`/`ProgressPhase` |

## 21. download-source（下载源）

| 项目 | 值 |
|------|-----|
| 路径 | `crates/download-source/` |
| 用途 | npm 仓库地址/镜像源/代理配置 |

## 22. browser（WebView 生命周期管理）

| 项目 | 值 |
|------|-----|
| 路径 | `crates/browser/` |
| 用途 | WebView 标签页生命周期管理、导航、音频指示器、Favicon、标题同步、历史记录、消息桥接、Profile 管理、网站元数据缓存（`site_meta_cache.rs`）、下载管理 |

**模块:**

| 文件 | 功能 |
|------|------|
| `browser_pool.rs` | `BrowserPool` — WebView 实例池管理 |
| `browser_webview.rs` | `BrowserManager`, `Bounds` — 创建/销毁/尺寸 |
| `browser_navigation.rs` | 导航、前/后退、刷新、URL 变化处理 |
| `webview2_audio.rs` | 音频播放检测和静音控制 |
| `webview2_favicon.rs` | Favicon 提取和缓存 |
| `webview2_title.rs` | 页面标题同步 |
| `webview2_history.rs` | 浏览历史记录管理 |
| `webview2_message.rs` | 页面消息桥接 |
| `webview2_postmessage.rs` | `window.postMessage` 桥接 |
| `webview2_cleanup.rs` | 缓存和 Cookie 清除 |
| `webview2_profile.rs` | 颜色方案和 Profile 管理 |
| `browser_meta.rs` / `page_meta_service.rs` | 页面元数据服务 |
| `site_meta_cache.rs` / `meta_cache_bridge.rs` / `meta_merge.rs` | 网站元数据三层缓存 |
| `download_*.rs` | 下载管理（含断点续传） |
| `browser_events.rs` | 浏览器事件系统 |
| `webview_handle.rs` / `webview2_background.rs` | WebView 句柄与后台管理 |

**依赖:** `adl-errors`, `adl-kernel`, `serde_json`, `tokio`

## 23. tauri-runtime-wry-patched（运行时补丁，非 workspace member）

| 项目 | 值 |
|------|-----|
| 路径 | `crates/tauri-runtime-wry-patched/` |
| 用途 | Tauri 运行时补丁（wry 相关） |
