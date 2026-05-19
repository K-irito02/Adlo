# 终端 PTY 重设计 Spec — 实现记录

## Why

当前终端是一个"非交互式命令执行器"：使用 `<pre>` 元素渲染输出、无 PTY 集成、所有交互功能（复制/粘贴/清空/终止）均为 disabled 状态，Tab 会话仅在前端 localStorage 中管理，不与后端 PTY 进程绑定。用户需要一个真正的交互式终端，支持多会话、多 Shell 类型、真实命令执行。

## What Changed (实际实现)

- **BREAKING**: 用 xterm.js 替换 `<pre>` 元素作为终端渲染引擎
- **BREAKING**: 后端新增 PTY 实现（Tauri 模式：Rust PTY Command；浏览器模式：Node.js `child_process.spawn` + SSE）
- 终端画布区域 (`adl-terminal-canvas`) 为完整终端窗口，不再嵌入任何卡片式 UI
- Shell 类型选择按钮支持 PowerShell / CMD / Bash 三种 Shell 切换，可新建多个会话
- 会话标签列表与后端 PTY 进程生命周期绑定
- 实现交互式终端操作：键盘输入、复制、粘贴（直接发送到 PTY stdin）
- 主题同步：xterm 颜色从 CSS 变量动态读取，MutationObserver 监听 data-theme 变化

### 与原始 Spec 设计的偏离

| 原始设计 | 实际实现 | 原因 |
|---------|---------|------|
| Rust `portable-pty` crate | Tauri: 标准 Rust PTY；浏览器: Node.js `child_process.spawn` | `portable-pty` 在浏览器模式无法使用，双端架构需要各自独立的 PTY 后端 |
| WebSocket 通信 | SSE (Server-Sent Events) | Vite 中间件天然支持 SSE，无需额外依赖，实现更简单 |
| Block 模型（命令块分割） | 未实现 | xterm.js 直接渲染原始 PTY 输出，Block 模型对交互式终端的实际价值有限 |
| PTY 命令审批门控 | 未在 PTY 中实现 | 交互式终端中拦截命令会破坏用户体验，保留原有非交互式命令执行的门控 |

## Impact

- Affected specs: 无（新 spec）
- Affected code:
  - 新增: `previewTerminalService.ts`（浏览器模式 PTY 服务）、`XtermTerminal.tsx`（xterm.js 封装）
  - 重写: `TerminalPanel.tsx`、`ui-store.ts`（终端状态）
  - 修改: `preview-bridge.ts`（PTY SSE 连接）、`mock-bridge.ts`（PTY mock 桩）、`ipc.ts`（PTY 类型）、`regions.css`（终端样式）
  - Tauri: `pty_commands.rs`（PTY Command）、`tauri-bridge.ts`（PTY 桥接）

## 架构

### 双端 PTY 架构

```
┌──────────────────────────────────────────────────────────────────┐
│                    前端 (React + xterm.js)                        │
│  ┌──────────────┐  ┌──────────────────┐  ┌───────────────────┐   │
│  │ XtermTerminal │  │  TerminalPanel   │  │  preview-bridge   │   │
│  │  (xterm.js)   │  │  (Tab 管理/SHELL)│  │  / tauri-bridge   │   │
│  └──────┬───────┘  └────────┬─────────┘  └────────┬──────────┘   │
│         │  onData(output)    │                      │              │
│         │  write(data)       │  PTY API calls       │ IPC/SSE     │
└─────────┼────────────────────┼──────────────────────┼──────────────┘
          │                    │                      │
          ▼                    ▼                      ▼
┌──────────────────────────────────────────────────────────────────┐
│                         后端                                       │
│  ┌────────────────────┐  ┌──────────────────────────────────┐     │
│  │ Tauri 模式          │  │ 浏览器模式 (Vite Dev Server)      │     │
│  │ pty_commands.rs     │  │ previewTerminalService.ts        │     │
│  │ (Rust PTY)          │  │ (child_process.spawn + SSE)      │     │
│  │ Event: pty-output   │  │ GET /pty/output (SSE)            │     │
│  └────────┬───────────┘  │ POST /pty/create                  │     │
│           │              │ POST /pty/input                   │     │
│           │              │ POST /pty/kill                    │     │
│           │              └──────────────────────────────────┘     │
│           ▼                                                       │
│  ┌────────────────────────────────────────────────────────────┐   │
│  │                  真实 Shell 进程                             │   │
│  │         (PowerShell / CMD / WSL Bash)                      │   │
│  └────────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────┘
```

## 已验证

- [x] xterm.js 组件创建并可挂载到 `adl-terminal-canvas` 容器
- [x] xterm.js 启用 FitAddon 和 WebLinksAddon
- [x] `adl-terminal-canvas` 容器内部无卡片式 UI
- [x] 浏览器模式: `previewTerminalService.ts` 使用 `child_process.spawn` 启动真实 Shell
- [x] 浏览器模式: SSE 端点 `/__adl_preview_api__/pty/output` 实时推送 PTY 输出
- [x] Tauri 模式: `pty_commands.rs` 实现 PTY 创建/输入/resize/kill/列表
- [x] `DigitalLifeBridge` 接口新增 `pty` 命名空间 + `subscribePtyOutput`
- [x] `tauri-bridge.ts` / `preview-bridge.ts` / `mock-bridge.ts` 同步实现
- [x] `TerminalTabState` 重构：`sessionId`/`status`，移除 `commandBinary`/`commandArgs`/`live`
- [x] `TerminalLayout` 已移除
- [x] 多会话独立 PTY 进程，切换 Tab 不中断
- [x] Tab 关闭时 kill PTY 进程
- [x] xterm 主题跟随 CSS 变量 + MutationObserver
- [x] 空状态居中显示 Shell 选择按钮组
- [x] 一键关闭所有终端按钮
- [x] 类型检查通过 (npm run typecheck)
- [x] 前端测试通过 (npm test: 181 tests, 0 errors)