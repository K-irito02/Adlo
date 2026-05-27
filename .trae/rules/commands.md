---
description: Common commands quick reference, scripts entry points
alwaysApply: true
---

# 常用命令

## 开发命令（`ai-digital-life/`）

| 命令 | 用途 |
|------|------|
| `npm run dev` | 启动 Tauri 开发模式 |
| `npm run dev:browser` | 浏览器预览模式（用于快速开发和 Agent 测试） |
| `npm run dev:tauri` | Tauri 桌面应用 |
| `npm run dev:both` | 同时启动浏览器 + Tauri（推荐用于双端一致性验证） |
| `npm run build` | 构建所有包 |
| `npm run start` | 启动已构建应用 |

## 双端验证命令

| 命令 | 用途 |
|------|------|
| `npm run dev:both` | 同时启动两种模式，方便并排对比功能一致性 |

**推荐工作流：**
1. 开发阶段：先用 `npm run dev:browser` 在浏览器中快速迭代（方便 Agent 测试）
2. 验证阶段：用 `npm run dev:both` 同时验证两种模式的一致性

## 测试命令

| 命令 | 用途 |
|------|------|
| `npm test` | 单元测试（Vitest） |
| `npm run test:e2e` | E2E 测试（Playwright） |
| `npm run typecheck` | 类型检查 |
| `npx vitest run` | 直接运行 Vitest |

## 终端调试

| 命令 | 用途 |
|------|------|
| `npm run dev:browser` | 浏览器预览模式（终端通过 `previewTerminalService.ts` + `child_process.spawn` 运行真实 Shell） |

### 浏览器模式终端功能说明

由于 Vite 开发服务器会主动中断长时间运行的 SSE（Server-Sent Events）连接，浏览器模式下的终端功能使用**轮询（polling）机制**替代 SSE：

- **轮询间隔**：100ms（确保良好的响应性）
- **实现位置**：`frontend/src/preview-bridge/ptyBridge.ts`
- **服务器端**：`frontend/dev/previewTerminalService.ts`（缓存终端输出）
- **注意事项**：修改中间件代码后必须**重启开发服务器**才能生效

### 相关问题与经验教训

1. **Vite 中间件修改必须重启服务器** - 任何对 `vite.config.ts` 或 `dev/` 目录下文件的修改都需要完全停止并重新启动 `npm run dev:browser`
2. **SSE 在 Vite 中不稳定** - Vite 的热更新机制会中断长连接，轮询是更可靠的备选方案

## 包管理

| 命令 | 用途 |
|------|------|
| `pnpm install` | 安装依赖 |
| `pnpm add <pkg> -w <ws>` | 添加依赖 |
| `pnpm list --depth 0` | 列出顶层依赖 |

## Rust 编译

执行 Rust 命令前必须设置 PATH:
```powershell
$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"
```

| 命令 | 用途 |
|------|------|
| `cargo check --workspace` | 编译检查（无二进制输出） |
| `cargo test --workspace` | 运行所有 Rust 测试 |
| `cargo build --workspace` | 完整编译（首次/新增依赖时较慢） |
| `cargo clippy --workspace -- -D warnings` | Lint 检查 |

> 系统配置了 Clash 代理 (`127.0.0.1:7890`)，执行前确保代理已开启。

## 浏览器自动化

> 浏览器自动化工具选择、经验教训和快速参考已迁移至 [browser-automation.md](./browser-automation.md)

### integrated_browser 快速参考（Trae 内置浏览器）

```powershell
# 标准流程
browser_navigate -url "http://localhost:5173/" -take_screenshot_afterwards true
browser_snapshot -interactive true
browser_click -ref "e0" -element "提交按钮"
browser_type -ref "e1" -element "搜索框" -text "Hello" -submit true
browser_unlock
```

### agent-browser 快速参考（终端自动化）

```powershell
agent-browser --session test open http://127.0.0.1:5173
agent-browser --session test eval "window.digitalLife.workspace.open('E:\\path').then(() => location.reload())"
agent-browser --session test wait 3000
agent-browser --session test snapshot -i
agent-browser --session test close --all
```

> 详细文档：[browser-automation 技能](../skills/browser-automation/SKILL.md)

## ⚠️ Node.js 环境变量

Trae 的 PowerShell 终端**不自动继承**系统/用户 PATH 环境变量。

**执行任何 `npm`/`node`/`pnpm`/`npx` 命令前，必须先运行：**

```powershell
$env:Path = "D:\Program Files\nodejs;$env:Path"
```

Node.js 安装路径：`D:\Program Files\nodejs`（v24.15.0）

## 相关文件

- [ai-digital-life/package.json](/E:/Programs/Obsidian/notes/ai-digital-life/package.json)
- [ai-digital-life/vitest.config.ts](/E:/Programs/Obsidian/notes/ai-digital-life/vitest.config.ts)
- [browser-automation.md](./browser-automation.md)
- [browser-automation 技能](../skills/browser-automation/SKILL.md)

## 相关规则文件

- [rust-patterns.md](./rust-patterns.md) — Rust 性能与架构模式
- [zustand-patterns.md](./zustand-patterns.md) — Zustand 状态管理模式
- [component-architecture.md](./component-architecture.md) — 组件拆分阈值
- [css-architecture.md](./css-architecture.md) — CSS 架构规范
- [error-handling.md](./error-handling.md) — 错误处理与加载状态
