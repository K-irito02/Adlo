---
description: Multi-dimensional architecture design overview (code, deployment, data, security, interface, performance) and the single source of truth for architecture facts
globs: adlo/**
alwaysApply: false
---

# 多维度架构设计

## 规则描述

本项目是一个**单仓库、多维度**的桌面应用：Rust 后端 + Tauri 2.x 桌面壳 + React 19 WebView 前端。本规则从六个维度（代码 / 数据 / 安全 / 部署 · 运行 / 接口 · 网络 / 性能 · 可维护性）给出架构**事实总览**，并作为各维度详细规则的汇聚入口。

**核心约束**：本规则与 `agents/rules/*` 其它规则共同构成架构的单一事实来源。架构事实只在本规则（或对应维度详细规则）中维护一份，**禁止在其他规则文件中复制粘贴本节内容**；新增/修改架构后，同步更新本规则或对应维度规则，而非就地重复。

## 运行形态

| 模式 | 引擎 | 终端 | 桥接层 |
|------|------|------|--------|
| Tauri 桌面 | Tauri WebView2 | node-pty (rust-pty) | `tauri-bridge.ts` |
| 浏览器预览 | Vite dev server | polling HTTP（PTY_POLL_INTERVAL_MS=1000） | `preview-bridge/` |
| 开发/测试 | - | mock | `mock-bridge.ts` |

双根结构：仓库根目录（规划与治理） + `adlo/`（实现工作区）。详见 [project-overview.md](./project-overview.md)。

## 代码维度

- **进程/层**：Tauri 壳（`src-tauri/`，窗口/命令/capabilities）+ 独立服务端 `adl-server`（`crates/server`，axum HTTP 二进制）+ 前端 WebView（`frontend/`）。
- **Rust crate 分层**：依赖方向固定 `kernel → errors/events → config/fs-ops/storage → business → business`，禁止反向；crate 统一 `adl-` 前缀；20+ workspace members（types/kernel/errors/storage/workspace/pty/change-engine/server/credential/...）。详见 [rust-patterns.md](./rust-patterns.md)、[rust-crate-adl-prefix-convention.md](./rust-crate-adl-prefix-convention.md)。
- **前端分层**：`components/` + `hooks/` + `stores/`(slices+actions) + `features/` + `regions/`（region 布局壳）。
- **共享纯逻辑层（依赖注入）**：被多处复用的「执行序列」下沉到 `shared/` 的纯模块（如 `shared/settings-reset/`），**禁止 import React / `@i18n` / `@stores`**，store action 与桥能力一律以参数注入；UI 组件与聚合编排器共用同一实现。约束来源：`stores → shared` 已存在运行时依赖，shared 反向 import stores 会成环。类型契约（step 码、deps 形状）集中声明在层内，消费方不得就地复写。
- **状态**：Zustand 切片合并模式（切片与 action 数量以 `slicedStore.ts` 实测为准），选择器用 `useShallow`。详见 [zustand-patterns.md](./zustand-patterns.md)、[region-layout-shell-architecture.md](./region-layout-shell-architecture.md)。
- **桥接**：`DigitalLifeBridge` 域拆分子接口 + Tauri/Preview/HTTP/Mock 四端一致。详见 [bridge-four-implementation-pattern.md](./bridge-four-implementation-pattern.md)。
- **harness 集成**：进程托管与拉起（`crates/webapp-host`）、harness 版本管理（`crates/harness-version`）、环境依赖源模型（`crates/adl-env`）、宿主版本/进程原语（`crates/adl-hosted`）、下载源/镜像（`crates/download-source`）。

## 数据维度

- **SQLite**（rusqlite bundled + `r2d2` 连接池，`EntityTable` 宏，`PRAGMA journal_mode=WAL; foreign_keys=ON`）。核心实体表：`workspaces`/`sessions`/`tasks`/`approvals`/`patch_sets`/`file_patches`/`patch_hunks`/`checkpoints`/`audit_records`/`tool_invocations`/`clipboard_items`/`model_call_audit`/`run_activity_events`/`validation_results` + 站点元数据/剪贴板等。schema 变更必须带迁移脚本（`crates/migration/`）。详见 [rust-patterns.md](./rust-patterns.md)。
- **本地非结构化**：`localStorage` 持久化走中心登记表（registry）架构（`stores/persisted/`），唯一写盘入口 + 构造期同步水合。详见 [localstorage-central-registry-persistence-architecture.md](./localstorage-central-registry-persistence-architecture.md)。
- **存储治理**：`adl-kernel::storage` 统一路径解析 + `storage-locator.json` 指针 + 启动期迁移（Plan B）+ 设置面板存储组（Plan C；10 条可迁移路径 + 6 条不可移动项）。详见 [storage-locations.md](../../docs/architecture/core/storage-locations.md)。

## 安全维度

- **分层边界**：Rust Backend 允许文件系统/SQLite/模型请求/凭据，禁止直接操作 DOM；WebView 允许 UI 渲染/状态编排/订阅事件，禁止直接访问系统能力、密钥、原始 SQL。
- **capability 白名单**：`capabilities/default.json`（core:default + dialog + shell + digital-life-commands）、`dsh-webview.json`、`browser-remote.json`；**禁止 `"all"` / `"**"` 通配权限**。
- **凭据存储**：`crates/credential`（keyring + 加密文件降级）。
- **基线**：CSP 显式声明、`withGlobalTauri` 关闭、WebView 不得直连文件系统/子进程/SQLite/模型密钥。详见 [tauri-shell.md](./tauri-shell.md)。

## 部署 · 运行维度

- **构建**：前端 pnpm/Vite 构建 + Rust Cargo；打包命令 `cargo tauri build`（release: `codegen-units=1, lto=true, strip=true`）。
- **开发**：`pnpm run dev:both` 双端并行；浏览器模式终端用轮询替代 SSE（Vite 会中断长连接，改中间件需重启 dev server）。
- **质量门禁**：仅本地执行（无远程 CI）——前端 `check:static` / `check:full`，Rust 走 `cargo` 命令，pre-push 钩子见 `.githooks/`。
- **harness 下载**：`crates/download-source` 管理 npm 仓库/镜像源/代理与连通性测试。
- **磁盘治理**：`target/debug` > 30 GB 触发全量 `cargo clean`；`.cargo/config.toml` 控制调试符号体积。详见 `commands.md`、`quality-gates.md`、`mandatory-testing.md`。

## 接口 · 网络维度

- **Tauri invoke**：命令统一登记到 `capabilities/*.json`，返回 `Result<T, AppError>` 结构化错误，用 `ipc()`/`ipc_try()` 包装。详见 [tauri-command-ipc-wrapper-pattern.md](./tauri-command-ipc-wrapper-pattern.md)。
- **HTTP 服务**：`adl-server`（axum）140+ handler，统一四步配方（State 提取 → body 解析 → `run_blocking` 阻塞 I/O → `ipc::to_response`）。详见 [rust-server-handler-recipe-pattern.md](./rust-server-handler-recipe-pattern.md)。
- **契约对齐**：跨 IPC 边界 `DigitalLifeBridge` 四端（Tauri/Preview/HTTP/Mock）一致；共享类型 serde 双注解 + 跨语言类型生成。UI 层（`src/app/**`）**不得直接 import `@adlo/kernel`**（含 type-only，由 ESLint 强制），需先在 `shared/ipc/` 补 re-export 再从 `@shared/ipc` 消费。详见 [bridge-four-implementation-pattern.md](./bridge-four-implementation-pattern.md)、[serde-default-rename-all-convention.md](./serde-default-rename-all-convention.md)、[ts-rs-type-generation-barrel-import.md](./ts-rs-type-generation-barrel-import.md)。
- **事件通道**（Tauri 模式）：`digital-life://model-stream`、`digital-life://pty-output`、`digital-life://workspace-file-changed`、`digital-life://browser-url-changed`。

## 性能 · 可维护性维度

- **PTY 阻塞治理**：所有涉及 I/O 的 Tauri 命令必须 `async fn + spawn_blocking`，禁止主线程执行文件遍历/git 子进程/SQLite 查询（阻塞 tao 事件循环 → 窗口"未响应"）。PTY 生命周期由 `adl-pty` crate 管理。详见 [tauri-shell.md](./tauri-shell.md)。
- **懒加载**：持久化大对象（单条 > 32KB）构造期跳过、按需读取；按工作区 ID 分片懒加载（`createLazyLoader` 工厂）。详见 [localstorage-central-registry-persistence-architecture.md](./localstorage-central-registry-persistence-architecture.md)、[createlazyloader-factory-pattern.md](./createlazyloader-factory-pattern.md)。
- **双端一致性**：所有功能必须在 Tauri 与浏览器双端可用；`isTauriShell()` 运行时检测 + `data-shell` 适配。

## 各维度详细规则索引

| 维度 | 权威规则 |
|------|----------|
| 代码 | project-overview / codebase-map / rust-patterns / zustand-patterns / component-architecture / bridge-four-implementation |
| 数据 | rust-patterns（数据库）/ localstorage-central-registry-persistence-architecture / migration |
| 安全 | tauri-shell（安全基线） |
| 部署·运行 | commands / quality-gates / mandatory-testing |
| 接口·网络 | tauri-shell（IPC/事件）/ rust-server-handler-recipe / tauri-command-ipc-wrapper / serde / bridge-four-implementation |
| 性能·可维护性 | tauri-shell（async 规范）/ createlazyloader / css-architecture / component-architecture |

## 约束

- 本规则为架构**总览**，具体实现约定以对应维度详细规则为准。
- 架构事实**单点维护**：展示性/索引性内容可引用本规则；功能性约定写入对应维度规则。禁止把本规则的大段架构内容复制到其他规则。
- 任何跨维度架构变更（新增 crate、新 IPC/路由、新持久化、能力暴露、部署流程）完成后，须同步本规则对应维度小节。