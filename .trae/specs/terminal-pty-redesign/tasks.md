# Tasks — 实现记录

所有任务已在实际实现中完成（部分以与原始计划不同的方式）。

- [x] Task 1: 新增 xterm.js 前端依赖与基础终端组件
  - [x] SubTask 1.1: 安装 `@xterm/xterm`、`@xterm/addon-fit`、`@xterm/addon-web-links` 依赖
  - [x] SubTask 1.2: 创建 `XtermTerminal.tsx` 组件，封装 xterm.js 初始化、FitAddon、WebLinksAddon、主题配置、MutationObserver 同步、清理逻辑
  - [x] SubTask 1.3: 在 `TerminalPanel.tsx` 中用 XtermTerminal 替换 `<pre>` 元素

- [x] Task 2: 后端 PTY 模块实现（双端）
  - [x] SubTask 2.1: 创建 `previewTerminalService.ts`（浏览器模式），使用 Node.js `child_process.spawn` + SSE
  - [x] SubTask 2.2: Tauri 模式 `pty_commands.rs` 实现 `PtySession` 结构体
  - [x] SubTask 2.3: 注册到 Vite 中间件和 Tauri Command

- [x] Task 3: IPC 桥接层更新
  - [x] SubTask 3.1: 在 `ipc.ts` 的 `DigitalLifeBridge` 接口中新增 `pty` 命名空间 + `subscribePtyOutput`
  - [x] SubTask 3.2: `tauri-bridge.ts` 实现 `pty.*` 和 `subscribePtyOutput`
  - [x] SubTask 3.3: `preview-bridge.ts` 实现 `pty.*`（HTTP API 调用 + SSE 连接）
  - [x] SubTask 3.4: `mock-bridge.ts` 实现 `pty.*` mock 桩

- [x] Task 4: UI 状态重构（ui-store.ts）
  - [x] SubTask 4.1: `TerminalTabState` 重构：新增 `sessionId`/`status`，移除 `commandBinary`/`commandArgs`/`live`
  - [x] SubTask 4.2: 移除 `TerminalLayout` 类型和相关状态
  - [x] SubTask 4.3: `terminalCreateTab` 创建后端 PTY 会话
  - [x] SubTask 4.4: `terminalCloseTab` 调用 `pty.kill`

- [x] Task 5: TerminalPanel 重构
  - [x] SubTask 5.1: XtermTerminal `onData` 连接 `pty.input`
  - [x] SubTask 5.2: 订阅 `subscribePtyOutput`，写入 xterm.js
  - [x] SubTask 5.3: `sessionOutputsRef` Map 存储每个 session 输出历史，Tab 切换恢复内容
  - [x] SubTask 5.4: 空状态居中 Shell 选择按钮组
  - [x] SubTask 5.5: 一键关闭所有终端按钮
  - [x] SubTask 5.6: FitAddon resize 与窗口 resize 联动

- [x] Task 6: 红绿测试验证
  - [x] SubTask 6.1: `npm --prefix frontend run typecheck` 通过
  - [x] SubTask 6.2: `npm --prefix frontend test` 通过（181 tests, 0 errors）