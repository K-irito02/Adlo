# 交互式终端功能 — 经验教训

## 最终决策
方案二（Xterm.js + PTY）已在 Phase 2 实施完成。

## 经验教训

### 1. xterm.js 不做 local echo
所有字符回显依赖后端 PTY 进程，前端不做本地回显。

### 2. Mock Bridge 不可用于真实终端
mock-bridge 的假终端无法满足用户需求，必须用真实 Shell 进程驱动。

### 3. 双端架构的 PTY 实现差异
Tauri 模式和浏览器模式需要各自独立的 PTY 后端实现：
- Tauri: Rust `std::process::Command` 封装（`pty_commands.rs`）
- 浏览器: Node.js `child_process.spawn` + SSE 通信

但前端 IPC 接口保持一致。

### 4. Tab 切换内容恢复
使用 `sessionOutputsRef` (Map) 存储每个 session 的输出历史，切换 Tab 时写入 xterm.js，实现会话切换的连续体验。

## 实际实现偏离
| 讨论方案 | 实际实现 |
|---------|---------|
| `portable-pty` crate | 未使用；Tauri 用 Rust PTY Command，浏览器用 Node.js spawn |
| WebSocket 通信 | 使用 SSE（Vite 中间件天然支持，无需额外依赖） |
| Block 模型（命令块分割） | 未实施，xterm.js 直接渲染原始 PTY 输出 |
| PTY 命令审批门控 | 未在交互式终端实现，保留非交互式执行的门控 |
