---
description: Common commands quick reference, scripts entry points
alwaysApply: true
---

# 常用命令

## 开发命令（`ai-digital-life/`）

| 命令 | 用途 |
|------|------|
| `pnpm run dev` | 启动 Tauri 开发模式 |
| `pnpm run dev:browser` | 浏览器预览模式（用于快速开发和 Agent 测试） |
| `pnpm run dev:tauri` | Tauri 桌面应用 |
| `pnpm run dev:both` | 同时启动浏览器 + Tauri（推荐用于双端一致性验证） |
| `pnpm run build` | 构建所有包 |
| `pnpm run start` | 启动已构建应用 |

## 双端验证命令

| 命令 | 用途 |
|------|------|
| `pnpm run dev:both` | 同时启动两种模式，方便并排对比功能一致性 |

**推荐工作流：**
1. 开发阶段：先用 `pnpm run dev:browser` 在浏览器中快速迭代（方便 Agent 测试）
2. 验证阶段：用 `pnpm run dev:both` 同时验证两种模式的一致性

## 测试命令

| 命令 | 用途 |
|------|------|
| `pnpm --dir frontend run test` | 前端单元/组件测试（Vitest，jsdom 环境） |
| `pnpm --dir frontend run test:watch` | 前端测试 watch 模式（开发时使用） |
| `pnpm --dir frontend run coverage` | 前端覆盖率收集 |
| `pnpm --dir frontend run typecheck` | 前端类型检查 |
| `cargo test --workspace` | Rust 全量测试 |
| `cargo test -p <crate>` | Rust 指定 crate 测试 |
| `cargo test <test_name>` | Rust 模糊匹配测试名称 |

### 受影响测试优先执行

日常开发中无需执行全量测试，优先运行受影响的测试：

```powershell
# Rust — 仅指定 crate
cargo test -p adl-server

# Rust — 仅指定集成测试文件
cargo test -p adl-server --test workspace_all

# Rust — 模糊匹配测试名称
cargo test reference_list

# 前端 — 仅指定测试文件
pnpm --dir frontend run test -- src/app/features/browser

# 前端 — watch 模式（开发时）
pnpm --dir frontend run test:watch
```

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

## 包管理

| 命令 | 用途 |
|------|------|
| `pnpm install` | 安装依赖 |
| `pnpm add <pkg> -w <ws>` | 添加依赖 |
| `pnpm list --depth 0` | 列出顶层依赖 |

## Rust 编译

执行 Rust 命令前必须设置 PATH:
> ⚠ **重要**：执行 Rust 命令前必须设置 PATH，否则 `cargo` 命令不可用。

```powershell
$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"
```

| 命令 | 用途 |
|------|------|
| `cargo check --workspace` | 编译检查（无二进制输出） |
| `cargo test --workspace` | 运行所有 Rust 测试 |
| `cargo build --workspace` | 完整编译（首次/新增依赖时较慢） |
| `cargo clippy --workspace --all-targets -- -D warnings` | Lint 检查 |

> 浏览器自动化工具选择、经验教训和快速参考见 [browser-automation.md](./browser-automation.md)。

## ⚠️ Node.js 环境变量

部分终端**不自动继承**系统/用户 PATH 环境变量。

**执行任何 `npm`/`node`/`pnpm`/`npx` 命令前，建议先运行：**

```powershell
# 按实际安装路径调整
$env:Path = "C:\Program Files\nodejs;$env:Path"
```

## 相关文件

- [browser-automation.md](./browser-automation.md) — 浏览器自动化
- [browser-automation 技能](../../.opencode/skills/browser-automation/SKILL.md)
