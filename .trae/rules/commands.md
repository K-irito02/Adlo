---
description: Common commands quick reference, scripts entry points
globs: adlo/**
alwaysApply: false
---

# 常用命令

> 本文件命令默认在 `adlo/` 执行（`frontend/` 相对 `adlo/`）。在仓库根执行时改用 `pnpm --dir adlo/frontend ...`；仓库根没有 `package.json`。

## 开发命令（`adlo/`）

| 命令 | 用途 |
|------|------|
| `pnpm run dev` | 启动 Tauri 开发模式 |
| `pnpm run dev:browser` | 浏览器预览模式（用于快速开发和 Agent 测试） |
| `pnpm run dev:tauri` | Tauri 桌面应用 |
| `pnpm run dev:both` | 同时启动浏览器 + Tauri（推荐用于双端一致性验证） |
| `pnpm run dev:status` | 列出本机各工作树实例（端口 / 令牌 / PID / 后端） |
| `pnpm run dev:stop` | 停止本工作树的 dev 实例，释放 `target/debug` 构建产物锁 |
| `pnpm run prototype:serve` | 起原型静态服务（根目录 `adlo/frontend/`，固定 5200 端口，Ctrl+C 退出；不放宽端口） |
| `pnpm run worktree:env` | 输出并行开发所需的 `[ENV]` 快照（分支 / base / dirty / instance / hooks / graph）；加 `-- --all` 追加 `[WORKTREES]` 全仓对照表 |
| `pnpm run worktree:disk` | 跨工作树磁盘报告（target / debug / release / `.adl-instance` / node_modules）；`-- --clean` 清产物，`-- --dry-run` 预览 |
| `pnpm run worktree:sessions` | 会话注册表巡检；`-- --reap --older-than 3d` 把 stale `active` 改为 `paused`（人类运行） |
| `pnpm run build` | 构建所有包 |
| `pnpm run start` | 启动已构建应用 |
| `pnpm run notices:generate` | 重新生成「关于 → 第三方声明」的全量依赖许可清单（离线加 `-- --offline`；缺元数据默认拒绝写盘，`-- --allow-partial` 显式放行） |
| `pnpm run notices:check` | 离线校验生成物与锁文件是否一致（`release:build` 前自动执行） |

> `cargo check/build/clippy` 报 `PermissionDenied` 时，先 `pnpm run dev:stop`：桌面实例会锁住 `target/debug/adlo.exe` 与 `adl-server.exe`。

## 双端验证命令

| 命令 | 用途 |
|------|------|
| `pnpm run dev:both` | 同时启动两种模式，方便并排对比功能一致性 |

**推荐工作流：**
1. 开发阶段：先用 `pnpm run dev:browser` 在浏览器中快速迭代（方便 Agent 测试）
2. 验证阶段：用 `pnpm run dev:both` 同时验证两种模式的一致性

> **启动前先查实例（Agent 自动化验证 P3 必做）**：跑 `dev:preview` / `dev:browser` / `playwright-cli` 前先执行 `pnpm run dev:status`。
> 本工作树已有运行实例（含用户手动启动的 `dev:tauri`）时：优先复用其 URL；需要重启先征得用户同意。
> **禁止并行起第二个 adl-server**——同一数据目录会 `database is locked`。
> `pnpm run dev:stop` 会按工作树路径终止 `adlo.exe` / `adl-server.exe`，用户正在测试的窗口会被一并关闭；执行前先确认实例归属。

## 开发阶段日志 CLI 覆盖（session-only）

在启动命令后用 `--` 透传日志 flag，可在本次运行中覆盖「日志级别 / 终端日志模式 / 调试日志模式」，**不写回 `config.json`**：

```powershell
pnpm dev:tauri   -- --log-level trace --terminal-log-mode multi --debug-log-mode append
pnpm dev:browser -- --log-level debug
pnpm dev:preview -- --log-mode multi          # 兼容简写：同时设两个模式
```

| flag | 环境变量 | 取值 |
|------|----------|------|
| `--log-level` | `ADL_LOG_LEVEL` | `error` / `warn` / `info` / `debug` / `trace` |
| `--terminal-log-mode` | `ADL_TERMINAL_LOG_MODE` | `overwrite` / `append` / `multi` |
| `--debug-log-mode` | `ADL_DEBUG_LOG_MODE` | `overwrite` / `append` / `multi` |
| `--log-mode` | `ADL_CLI_LOG_MODE` | 同时设终端与调试 |

- 优先级：CLI flag > `ADL_*` env > `config.json` > 默认；另有 `RUST_LOG` 为**硬顶**（设了就掐住两层，CLI 也顶不开；调高前先 unset）
- **传递通道只有 env**：flag 由启动脚本转成 `ADL_*` 环境变量（`cargo tauri dev` 会把 `--` 之后的参数当成 cargo 参数而报错，不依赖 argv 透传）
- 运行期同步：桌面 UI 改设置 → 壳生效并落盘 + 推送 adl-server `/app/log-settings`（仅运行时）；浏览器模式经 `/app/preferences`（含落盘）
- 会话覆盖锁定：CLI/env 锁定的字段，UI 改后运行期保持 CLI 值、仅落盘（下次启动生效），前端弹"下次启动生效"提示；落盘失败回滚运行期
- `--log-level` 控制 stdout；**文件层下限恒为 `debug`**（可调高到 trace，不会低于 debug）
- 启动自证行：`[ADL-LOG] logger ready level=… prefix=…` / `[ADL-CLI] … (session override, not persisted)`
- 日志文件按进程分离：shell → `terminal-logs*.txt`，adl-server → `adl-server-logs*.txt`
- 浏览器模式（`dev:browser`，无 adl-server）下 `--log-level` / `--terminal-log-mode` 无后端可作用；需完整后端日志请用 `dev:preview` / `dev:tauri` / `dev:both`
- adl-server 不可达时 `app` 域**失败即失败**（不再回退 mock，以错误卡呈现）；若页面日志出现兜底地址 `127.0.0.1:61234`，说明该页面来自**未注入 `VITE_ADL_SERVER_URL` 的 Vite 实例**（请打开启动脚本打印的那个地址）

## 测试命令

| 命令 | 用途 |
|------|------|
| `pnpm --dir frontend run test` | 前端单元/组件测试（Vitest，jsdom 环境） |
| `pnpm --dir frontend run test:watch` | 前端测试 watch 模式（开发时使用） |
| `pnpm --dir frontend run test:one -- <文件…>` | 定向跑指定测试文件；固定 `--reporter=dot --silent=passed-only`，避免刷屏与 ANSI 噪声 |
| `pnpm --dir frontend run coverage` | 前端覆盖率收集 |
| `pnpm --dir frontend run typecheck` | 前端类型检查 |
| `pnpm --dir frontend run typecheck:dev` | 前端 dev 工具链类型检查（CI 门禁） |
| `pnpm --dir frontend run lint` | 前端 Lint 检查（**修复用 `lint:changed:fix`，只改本轮改动文件**；仓库级 `lint:fix` 仅用于显式全量清理，会改写无关配置） |
| `pnpm --dir frontend run format:check` | 前端格式检查（修复用 `format`） |
| `pnpm --dir frontend run check:i18n` | 前端 i18n 覆盖检查（CI 门禁） |
| `pnpm --dir frontend run check:changed` | 受影响范围门禁（前端 + 自动带 Rust 受影响 crate 的 fmt/clippy/test） |
| `pnpm --dir frontend run check:changed -- --base HEAD` | 修复循环只查本轮改动；最终提交前去掉 `--base` |
| `pnpm run cargo:test` | Rust 全量测试（内部先 `stage:sidecar`；裸 `cargo test --workspace` 需先 staging） |
| `cargo test -p <crate>` | Rust 指定 crate 测试 |
| `cargo test -p <crate> <test_name>` | Rust 按名称过滤测试（限定 crate，避免编译壳层） |
| `target/debug/adl-server --print-env --data-dir <临时目录>` | 初始化环境依赖 PATH 后打印 `ADL_ENV_JSON={path,pathDirs}` 并退出（诊断 PATH 注入） |
| `pnpm --dir adlo run serve:server -- --data-dir <数据根> --port 0` | 用**真实数据根**起 `adl-server`（打印 `url=`），复现 `/env/*`、`/dsh/*` 等接口的线上状态；`Ctrl+C` 退出 |
| 搬目录 / 改仓库名 | 先关应用与占用该目录的终端、停 codegraph，再按 [改名踩坑记录](../../docs/knowledge-base/toolchain/project-rename-and-hosted-path-detection-2026-11-05.md) 清扫 `target/debug/build/*/output` 里的旧绝对路径 |
| `pnpm run e2e:build` | 构建桌面 E2E 调试产物（内部先 `stage:sidecar`；`--features e2e`，**不要**换 release 构建） |
| `pnpm run e2e` | 桌面 E2E 全量冒烟（真实 Tauri 窗口，整轮 ~15s） |
| `pnpm run e2e:typecheck` | e2e 包 TypeScript 检查（pre-push 自动执行） |
| `pnpm --dir e2e run test:smoke` | 只跑 `specs/smoke.spec.ts` |

**桌面 E2E（opt-in）**：需 `pnpm install`（`e2e` 为独立 workspace 包）且端口 4445 空闲；**不进** `check:all`，仅在桌面-only 改动或用户要求时跑。排障与用例规则见技能 `desktop-e2e-wdio`。

### 受影响测试优先执行

日常开发中无需执行全量测试，优先运行受影响的测试：

```powershell
# Rust — 仅指定 crate
cargo test -p adl-server

# Rust — 仅指定集成测试文件
cargo test -p adl-server --test workspace_all

# Rust — 模糊匹配测试名称（限定 crate，避免编译壳层）
cargo test -p adl-server reference_list

# 前端 — 仅指定测试文件（紧凑输出，避免 ANSI/中文刷屏）
pnpm --dir frontend run test:one -- src/app/features/browser

# 前端 — watch 模式（开发时）
pnpm --dir frontend run test:watch
```

### 门禁调用策略（省时）

```powershell
# 中间修复轮：只跑 lint/format/typecheck，不跑 vitest
pnpm --dir frontend run check:changed -- --skip-tests

# 落盘 / 提交前：必须跑一次完整受影响门禁（含 vitest related）
pnpm --dir frontend run check:changed
```

- 门禁 / 构建是 5–10 分钟级长命令：用**后台执行 + 输出文件**，再用 `Wait-Process` 等进程结束；不要前台缓冲输出等超时（超时会丢掉全部输出，只剩失败尾巴）。
- 只看末尾用 `Select-Object -Last <N>`；**不要**用 `Select-String`/`rg` 过滤命令输出（内容检索一律用 `grep` 工具，见 shell-encoding 规则）。
- 单次任务里不要把完整门禁跑成每一轮修复的固定动作：中间轮 `--skip-tests`，只在生成审查快照前与提交前跑完整版。

## 终端调试

| 命令 | 用途 |
|------|------|
| `pnpm run dev:browser` | 浏览器预览模式（终端通过 `previewTerminalService.ts` + `child_process.spawn` 运行真实 Shell） |

### 浏览器模式终端功能说明

由于 Vite 开发服务器会主动中断长时间运行的 SSE（Server-Sent Events）连接，浏览器模式下的终端功能使用**轮询（polling）机制**替代 SSE：

- **轮询间隔**：1000ms（`preview-pty-bridge.ts` 中 `PTY_POLL_INTERVAL_MS`）
- **实现位置**：`frontend/src/preview-bridge/preview-pty-bridge.ts`
- **服务器端**：`frontend/dev/previewTerminalService.ts`（缓存终端输出，提供 `/pty/output-since` 增量接口）
- **注意事项**：修改中间件代码后必须**重启开发服务器**才能生效

### 相关问题与经验教训

1. **Vite 中间件修改必须重启服务器** - 任何对 `vite.config.ts` 或 `dev/` 目录下文件的修改都需要完全停止并重新启动 `pnpm run dev:browser`
2. **SSE 在 Vite 中不稳定** - Vite 的热更新机制会中断长连接，轮询是更可靠的备选方案

## 跨文件重命名（store 字段 / 类型 / 持久化 key）

重命名 store 字段会跨六层：**类型定义 → 切片实现 → `persisted/registry.ts` 与持久化 key → 树构建 → 特性/hook → 测试**。
顺序错了会反复回滚；优先用现成工具，不要手工逐个 `edit`：

| 命令 | 用途 |
|------|------|
| `node frontend/scripts/replace-term.mjs --pairs <pairs.json> [--dry-run]` | 字节级批量替换（保 UTF-8、按文件校验、支持干跑）；`pairs.json` 形如 `{ "replacements": [{"from":"旧","to":"新"}], "files": ["src/app/..."] }` |
| `node scripts/check-stale-terms.mjs` | 旧标识符 denylist 守卫（pre-commit 与 `check:repo` 自动执行） |
| `node scripts/check-no-new-any.mjs` | 禁止在 store 改动里**新增** `as any` / `as unknown as`（pre-commit 跑暂存 diff 的新增行） |
| `node scripts/check-docs-links.mjs` | `docs/**/README.md` 相对链接存在性（`check:repo` 自动执行） |
| `node frontend/scripts/check-css-architecture.mjs` | CSS 机械禁令：`@keyframes` 只许 transform/opacity、禁 `*` 与 `!important`（`check:changed` 扫新增行） |

收尾顺序：每层结束跑 `pnpm --dir frontend run typecheck`；全部改完后把旧名字加进
`adlo/scripts/check-stale-terms.mjs` 的 `STALE_TERMS`，防止旧名回潮。

## 包管理

| 命令 | 用途 |
|------|------|
| `pnpm install` | 安装依赖 |
| `pnpm add <pkg> -w <ws>` | 添加依赖 |
| `pnpm list --depth 0` | 列出顶层依赖 |

## Rust 编译

执行 Rust 命令前必须设置 PATH:
> ⚠ **重要**：执行 Rust 命令前必须设置 PATH，否则 `cargo` 命令不可用；且 MSVC `link.exe` 必须排在 msys64/Git 的 coreutils `link.exe` 之前，否则链接失败。

```powershell
$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"
# MSVC 工具链（BuildTools 主体在 D:\VSBuildTools；WinSDK 按微软约定在 C，改不了）：
$msvc = 'D:\VSBuildTools\VC\Tools\MSVC\14.44.35207' # 版本号以实际安装为准
$sdk = 'C:\Program Files (x86)\Windows Kits\10'; $sdkv = '10.0.22621.0'
$env:Path = "$msvc\bin\Hostx64\x64;" + $env:Path
$env:INCLUDE = "$msvc\include;$sdk\Include\$sdkv\um;$sdk\Include\$sdkv\shared;$sdk\Include\$sdkv\ucrt;$sdk\Include\$sdkv\winrt;$sdk\Include\$sdkv\cppwinrt"
$env:LIB = "$msvc\lib\x64;$sdk\Lib\$sdkv\um\x64;$sdk\Lib\$sdkv\ucrt\x64"
# 自证：cmd /c where link.exe 首行须为 MSVC link.exe
```

| 现象 | 原因 | 处理 |
|------|------|------|
| `link: missing operand` / `extra operand 'symbols.o'` | `link` 解析到了 coreutils，而非 MSVC | 按上设会话 PATH（MSVC 在前） |
| 已卸载 VS 的残留 PATH 条目 | 指向不存在的目录 | 从系统 PATH 删除（需管理员） |

| 命令 | 用途 |
|------|------|
| `pnpm run cargo:check` | 编译检查（无二进制输出；内部先 `stage:sidecar`） |
| `cargo fmt --all -- --check` | Rust 格式检查（修复用 `cargo fmt --all`；不触发生成物，无需 staging） |
| `pnpm run cargo:test` | 运行所有 Rust 测试（内部先 `stage:sidecar`） |
| `pnpm run cargo:build` | 完整编译（debug profile；内部先 `stage:sidecar`。release 打包用 `pnpm run release:build`，需签名私钥） |
| `pnpm run cargo:clippy` | Lint 检查（内部先 `stage:sidecar`） |

> **工作区级 cargo 命令前置条件**：`src-tauri` 含 `bundle.externalBin`，tauri-build 构建脚本会在每次构建时校验
> `src-tauri/binaries/adl-server-<triple>.exe`，缺失即 `resource path ... doesn't exist` 并直接失败。
> 裸 `cargo build` / `cargo check --workspace` / `cargo test --workspace` / `cargo clippy --workspace`
> **不会**触发 staging 钩子，干净工作树首次执行前必须先 `pnpm run stage:sidecar`；按名称过滤的
> `cargo test <name>` 与 `-p adlo` 同属会编译壳层的形态。
> 直接用上表的 `pnpm run cargo:build` / `cargo:check` / `cargo:clippy` / `cargo:test` 可免记该步骤
> （`cargo:fmt` / `cargo:fmt:check` 不编译，不在此列；详见 [adlo/CONTRIBUTING.md](../../adlo/CONTRIBUTING.md)）。

## ⚠️ Node.js 环境变量

部分终端**不自动继承**系统/用户 PATH 环境变量。

**执行任何 `npm`/`node`/`pnpm`/`npx` 命令前，建议先运行：**

```powershell
# 按实际安装路径调整
$env:Path = "C:\Program Files\nodejs;$env:Path"
```
