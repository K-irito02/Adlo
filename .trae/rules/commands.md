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
3. **Zustand 对象展开选择器导致无限循环** - 在 Zustand v5 中应避免使用 `useAppStore((state) => ({ ... }))`，应分别选择状态和动作
4. **终端光标位置重叠** - 需要确保 xterm.js 在写入内容后自动滚动到底部，添加 `onWriteParsed` 监听器并设置正确的容器样式
5. **多终端窗口切换** - 共享终端组件实例时，切换标签页需要延迟恢复内容、调整大小、滚动到底部并聚焦

## 包管理

| 命令 | 用途 |
|------|------|
| `pnpm install` | 安装依赖 |
| `pnpm add <pkg> -w <ws>` | 添加依赖 |
| `pnpm list --depth 0` | 列出顶层依赖 |

## Rust 编译

| 命令 | 用途 | 说明 |
|------|------|------|
| `cargo check` | 编译检查（不生成二进制） | 快速验证代码正确性 |
| `cargo test --workspace` | 运行所有 Rust 测试 | 红绿测试用 |
| `cargo build` | 完整编译 | 首次或新增依赖时较慢 |

> ⚠️ **Rust 编译注意事项**：
> - 首次编译或新增依赖时，`cargo check` / `cargo build` 可能需要较长时间（下载依赖 + 编译）
> - 系统配置了 Clash 代理（`127.0.0.1:7890`），运行前需确保代理已开启，否则依赖下载会失败
> - Rust 工具链位于 `%USERPROFILE%\.cargo\bin\`，可能不在系统 PATH 中，需手动指定路径或设置环境变量

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
