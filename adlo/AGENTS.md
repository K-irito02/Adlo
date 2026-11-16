# Adlo - 实现工作区规则

本目录是 `Adlo` 的真实实现工作区，基于 **Rust + Tauri 2.x**。

## 技术栈

| 层级      | 技术                                                                                                                                                                                                                             |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 后端      | Rust stable + Tauri 2.x + tokio + rusqlite + serde + tracing                                                                                                                                                                     |
| 前端      | React 19 + Vite + Zustand + TypeScript + CodeMirror 6 + xterm.js；Markdown 预览 markdown-it + starry-night（高亮）+ github-markdown-css                                                                                          |
| 桥接      | `#[tauri::command]` + `@tauri-apps/api`                                                                                                                                                                                          |
| 打包      | `cargo tauri build`                                                                                                                                                                                                              |
| 包管理    | pnpm（前端）/ Cargo（Rust）                                                                                                                                                                                                      |
| 质量      | `cargo clippy` + `cargo fmt` + ESLint v9（flat）+ Prettier + TypeScript-ESLint + React Hooks plugin                                                                                                                              |
| 桌面 E2E  | `@wdio/tauri-service`（embedded WebDriver，opt-in；`pnpm run e2e`，**不进** `check:all`，见技能 `desktop-e2e-wdio`）                                                                                                             |
| 门禁      | 唯一真源：[`.agents/rules/quality-gates.md`](../.agents/rules/quality-gates.md)。日常 `pnpm --dir frontend run check:changed`；合并/发布前 `pnpm run check:all`（含仓库卫生 `check:repo` 与前端 `check:full`）。全量必须先获用户批准 |
| 凭据存储  | `crates/credential/`（keyring + 加密文件降级）                                                                                                                                                                                   |

应用存储（Locator / 启动期迁移 Plan B / 设置组 Plan C）的实现参考见 [docs/architecture/core/storage-locations.md](../docs/architecture/core/storage-locations.md)；统一根、日志目录与 `ADL_STORAGE_LOCATOR_PATH` 落点也以该文为准。

## 项目形态

当前形态：**桌面应用宿主**（Rust + Tauri 2.x + React 19 WebView）。

- 能力清单与实现落点：[system-overview.md](../docs/architecture/core/system-overview.md#已实现能力清单详细)（AGENTS 不复制清单，只保留边界与约束）。
- 终端子系统文件地图与 PTY 生命周期：[terminal.md](../docs/architecture/features/terminal.md)。
- 架构概念与文件落点：[CONTEXT.md](../CONTEXT.md)；并行/运行/调试：技能 [parallel-branch-development](../.agents/skills/parallel-branch-development/SKILL.md)（唯一真源）。
- 测试计数不在此维护，运行 `pnpm run cargo:test` / `pnpm --dir frontend run test` 获取。

## 安全边界

| 层           | 允许                             | 禁止                             |
| ------------ | -------------------------------- | -------------------------------- |
| Rust Backend | 文件系统、SQLite、模型请求、凭据 | 直接操作 DOM                     |
| WebView      | UI 渲染、状态编排、订阅事件      | 直接访问系统能力、密钥、原始 SQL |

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

- 包装器清理 Windows 硬杀留下的 `adl-server.exe` 孤儿；结果摘要写入 `e2e/artifacts/last-run.json`；数据目录隔离在 `%APPDATA%\com.adlo.app.e2e`。
- 套件不进 `check:all`；用例规则、排障与从零重建见技能 `desktop-e2e-wdio`。

## 设计系统约束

| 约束    | 规则                                                                                            |
| ------- | ----------------------------------------------------------------------------------------------- |
| 颜色    | 必须使用 CSS 自定义属性 `var(--…)`                                                              |
| 图标    | SVG 格式，继承 `currentColor`，禁止 emoji。动画反馈场景可例外使用 `lucide-animated`（MIT 许可） |
| Tooltip | 自定义 Tooltip 组件与原生 `title` 均可使用，具体方案开发时由用户决策（见 [.agents/rules/design-system.md](../.agents/rules/design-system.md) 与 ui-patterns.md §9）                |
| 窗口    | 最小宽度 640px                                                                                  |

CSS 选择器/层叠/布局/主题变更：按 [desktop-ui-verification.md](../.agents/rules/desktop-ui-verification.md) 用 `ui-probe.mjs` 读取计算样式（亮暗两套）；主观 UI/UX 验收仍由用户完成。详见 [docs/design-system/](../docs/design-system/)。

## Stores 架构（Zustand 切片合并模式）

- 真源：`frontend/src/app/stores/slicedStore.ts`（切片合并 Store）；完整类型接口 `StoreState.ts`；性能选择器 `selectors.ts`（`useShallow`）。
- 切片（`slices/`）与跨切片 action 模块（`actions/`）的数量与清单以 `slicedStore.ts` 实测为准，本文件不复制；localStorage 持久化走 `persisted/registry.ts` 中心登记表。

## 调试工具

| 功能       | 说明                                                                                             |
| ---------- | ------------------------------------------------------------------------------------------------ |
| 日志收起器 | `frontend/src/app/utils/debugLogCollector.ts`，拦截所有 console 输出，自动收起存储               |
| 复制按钮   | 页面右上角可拖拽"复制调试日志"按钮                                                               |
| 自动写入   | `.adl-logs/`（debug 构建）；Tauri 桌面壳 `debug-logs*.txt`、浏览器模式 `debug-logs-browser*.txt` |
| 后端命令   | `src-tauri/src/commands/app.rs` → `write_debug_logs_to_project`                                  |
| 浏览器后端 | `frontend/dev/previewWorkspaceService/`（`logging.ts` → `writeDebugLogs`）                       |

**优先级**：调试日志收起器是最高优先级的调试手段，遇到 UI/交互问题时优先使用。详见 [仓库根 AGENTS.md](../AGENTS.md#问题排查与调试)。

日志 CLI 与三个进程的落点统一见 [docs/development/log-system-manual.md](../docs/development/log-system-manual.md)，本节不复述。

## 问题排查规范

先定位根因，禁止凭空猜测；调试手段与优先级见 [根目录 AGENTS.md](../AGENTS.md#问题排查与调试) 与 [dev-rules.md](../.agents/rules/dev-rules.md#问题排查规范)。

## 未发布阶段禁止兼容性代码

见根目录 [禁止项](../AGENTS.md#禁止项)。

## 文档入口

- [README.md](./README.md) / [CONTRIBUTING.md](./CONTRIBUTING.md)
- [system-overview.md](../docs/architecture/core/system-overview.md) · [docs/design-system/](../docs/design-system/) · [docs/operations/ui-manual/](../docs/operations/ui-manual/)（`check:repo` 校验选择器仍存在）
- [storage-locations.md](../docs/architecture/core/storage-locations.md) · [docs/analysis/adlo/](../docs/analysis/adlo/)（ADL 源码地图）
- 并行分支开发：[parallel-branch-development](../.agents/skills/parallel-branch-development/SKILL.md)（唯一真源）

## 磁盘空间管理

- 第三方依赖 `debug=1` + `opt-level=1`；自有 crate 白名单保留 `debug=2`（`.cargo/config.toml`）。
- **清理策略**：`target/debug` 超过 30 GB → 立即 `powershell -File .cargo\clean-target.ps1` 全量 `cargo clean`（脚本自身带 30GB 阈值判断，`-WhatIf` 干跑预览）。
- 所有删除均为**永久删除**：不进回收站/垃圾箱。

相关文件：`.cargo/config.toml`（alias `rebuild` = `clean && build`、`prune` = `clean`）。
