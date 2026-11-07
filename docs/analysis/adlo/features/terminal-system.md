# 终端系统

## 整体架构

```
┌───────────────────────────────────────────────────────┐
│                  前端（React + xterm）                   │
│                                                        │
│  features/terminal/                                     │
│  ├── TerminalPanel.tsx         ← 终端面板主组件          │
│  ├── TerminalTabBar.tsx        ← 标签栏                  │
│  ├── TerminalShellSelector.tsx ← Shell 选择              │
│  ├── TerminalEmptyState.tsx    ← 空态                  │
│  ├── TerminalNavigator.tsx     ← 导航器                  │
│  ├── TerminalContextMenu.tsx   ← 右键菜单                │
│  ├── TerminalMenuDropdown.tsx  ← 菜单下拉                │
│  └── 11 个 use* Hook 驱动                                  │
│                                                        │
│  components/terminal/                                    │
│  ├── XtermTerminal.tsx        ← xterm.js 封装            │
│  └── CommandOutputBlock.tsx   ← 命令输出块              │
│                                                        │
│  features/workspace-terminal/                            │
│  ├── MultiWorkspaceTerminal.tsx  ← 多工作区终端容器      │
│  └── WorkspaceTerminalEntry.tsx  ← 工作区终端条目        │
│                                                        │
│  stores/                                                 │
│  ├── slices/terminalSlice.ts      ← 终端状态切片         │
│  ├── slices/terminalSliceTypes.ts ← 类型定义/常量        │
│  └── terminalSelectors.ts        ← 终端选择器           │
└───────────────────────────────────────────────────────┘
                        │
                        ▼ IPC (tauri-bridge / preview-bridge / mock-bridge)
                        │
┌───────────────────────────────────────────────────────┐
│                PTY 通道                                   │
│                                                        │
│  旧 src-tauri/src/commands/pty_commands.rs 已移除；     │
│  现经 shared/ipc/pty.ts + pty-ws.ts（adl-server/壳）     │
└───────────────────────────────────────────────────────┘
                        │
┌───────────────────────────────────────────────────────┐
│                pty Crate（Rust）                        │
│                                                        │
│  crates/pty/src/                                       │
│  ├── traits.rs            ← PTY 抽象 trait                     │
│  ├── rust_pty_impl.rs     ← Rust PTY 实现                      │
│  ├── session_manager/     ← 会话管理器                          │
│  └── shell_resolver.rs    ← Shell 解析器                        │
└───────────────────────────────────────────────────────┘
```

## pty Crate

| 文件                             | 说明                                                                                                                                                      |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `traits.rs` + `rust_pty_impl.rs` | PTY 核心实现（Rust 原生，非 node-pty）                                                                                                                    |
| `session_manager/`               | 会话管理器：管理多个 PTY 会话的生命周期                                                                                                                   |
| `shell_resolver.rs`              | Shell 解析器：`ShellResolver`、`ShellKind`、`ShellResolution`、`ShellNotFound`、`is_shell_available()`。检测系统中可用的 Shell（PowerShell / Bash / CMD） |

### 数据结构

```
PtyConfig {
    profile: String,           // 终端 Profile
    initialCwd?: String,       // 初始工作目录
}

PtySession {
    id: String,
    pid: u32,
    status: PtyStatus,
}

PtyStatus:
  - Running
  - Exited(i32)

PtySessionHandle {
    id: String,
    write(data: &str),         // 写入 PTY
    resize(cols: u16, rows: u16), // 调整大小
    kill(),                    // 终止
}

ShellKind:
  - PowerShell
  - Bash
  - Cmd
```

## PTY 通道

> PTY 经 `shared/ipc/pty.ts` + `pty-ws.ts`（WebSocket 通道）由 adl-server/壳提供，浏览器模式经 `preview-bridge/preview-pty-bridge.ts`（轮询 1000ms）。

| 命令                 | 参数                        | 返回                  | 说明              |
| -------------------- | --------------------------- | --------------------- | ----------------- |
| `create_pty_session` | `workspaceId`, `profile?`   | `PtySessionInfo`      | 创建新 PTY 会话   |
| `write_pty_input`    | `sessionId`, `data`         | `void`                | 写入 PTY 输入     |
| `resize_pty`         | `sessionId`, `cols`, `rows` | `void`                | 调整终端尺寸      |
| `kill_pty_session`   | `sessionId`                 | `void`                | 终止 PTY 会话     |
| `list_pty_sessions`  | -                           | `Vec<PtySessionInfo>` | 列出所有 PTY 会话 |

### IPC 接口 (`shared/ipc/pty.ts`)

```typescript
interface PtyBridge {
  createPtySession(input: {
    workspaceId: string;
    profile?: string;
  }): Promise<IpcResult<PtySessionInfo>>;
  writePtyInput(input: {
    sessionId: string;
    data: string;
  }): Promise<IpcResult<void>>;
  resizePty(input: {
    sessionId: string;
    cols: number;
    rows: number;
  }): Promise<IpcResult<void>>;
  killPtySession(input: { sessionId: string }): Promise<IpcResult<void>>;
  listPtySessions(): Promise<IpcResult<PtySessionInfo[]>>;
}
```

## 前端终端切片

### terminalSliceTypes.ts

```
TerminalTabState {
    id: string,
    workspaceId: string,
    title: string,
    profile: TerminalProfile,     // 'powershell' | 'bash' | 'cmd'
    sessionId?: string,
    status: 'idle' | 'running' | 'terminated',
    isPinned: boolean,
    pinnedAt?: number,
    sortOrder: number,
}

常量:
  TERMINAL_TABS_KEY           = 'adl-ui:terminal-tabs'
  TERMINAL_ACTIVE_TAB_KEY     = 'adl-ui:terminal-active-tab'
  TERMINAL_DEFAULT_PROFILE_KEY = 'adl-ui:terminal-default-profile'
  TERMINAL_WORKSPACE_DEFAULT_PROFILES_KEY = 'adl-ui:terminal-workspace-default-profiles'
  TERMINAL_NAVIGATOR_WIDTH_KEY = 'adl-ui:terminal-navigator-width'
  TERMINAL_NAVIGATOR_COLLAPSED_KEY = 'adl-ui:navigator-collapsed'
  TERMINAL_WORKSPACE_EXPANDED_KEY = 'adl-ui:terminal-workspace-expanded'

布局常量:
  TERMINAL_NAVIGATOR_WIDTH_MIN  = 180
  TERMINAL_NAVIGATOR_WIDTH_MAX  = 300
  DEFAULT_TERMINAL_NAVIGATOR_WIDTH = 180
```

### terminalSlice.ts

管理终端标签页的状态切片。关键功能：

- 标签 CRUD：创建/关闭/重命名/固定/排序标签页
- Shell Profile 管理：默认 Profile、工作区级 Profile
- 导航器状态：展开/折叠、宽度调整
- localStorage 持久化：所有终端状态通过 `createDebouncedWrite` 自动持久化
- 标题派生：`deriveTerminalTitle()` 根据 Profile 和计数自动生成标签标题

支持的 Shell Profile：`powershell` / `bash` / `cmd`

## 终端面板组件

### features/terminal/

| 组件                        | 说明                                                   |
| --------------------------- | ------------------------------------------------------ |
| `TerminalPanel.tsx`         | 终端面板主组件，组合标签栏 + xterm 终端 + 其他 UI 元素 |
| `TerminalEmptyState.tsx`    | 空态：无终端标签页时显示，引导用户创建                 |
| `TerminalTabBar.tsx`        | 标签栏：标签导航、PIN 标记、关闭按钮                   |
| `TerminalShellSelector.tsx` | Shell 选择器：选择默认/工作区 Profile                  |
| `TerminalNavigator.tsx`     | 导航器：工作区级终端列表，支持多工作区                 |
| `TerminalContextMenu.tsx`   | 右键菜单：标签操作（关闭/重命名/固定/复制）            |
| `TerminalMenuDropdown.tsx`  | 菜单下拉：终端管理操作                                 |

### features/terminal/ Hooks

| Hook                            | 说明                                    |
| ------------------------------- | --------------------------------------- |
| `useTerminalPanel.ts`           | 终端面板主逻辑：标签切换、终端事件绑定  |
| `useTerminalPtyLifecycle.ts`    | PTY 生命周期管理：创建/终止/重连        |
| `useTerminalShellManagement.ts` | Shell 管理：Profile 变更、默认值        |
| `useTerminalTabActions.ts`      | 标签操作：创建/关闭/固定/排序           |
| `useTerminalContextMenu.ts`     | 右键菜单逻辑：菜单项构建和事件处理      |
| `useTerminalDragDrop.ts`        | 拖放支持：标签拖拽排序                  |
| `useTerminalMenus.ts`           | 菜单管理：下拉菜单构建                  |
| `useTerminalViewport.ts`        | 视口管理：终端滚动和尺寸调整            |
| `useGitPushAutoRefresh.ts`      | Git Push 自动刷新：检测远程推送自动更新 |

### 核心终端组件 (components/terminal/)

| 组件                     | 路径                                         | 说明                                                                               |
| ------------------------ | -------------------------------------------- | ---------------------------------------------------------------------------------- |
| `XtermTerminal.tsx`      | `components/terminal/XtermTerminal.tsx`      | xterm.js 封装：终端实例创建、WebGL 渲染器、IPC 输入/输出绑定、尺寸自适应、复制粘贴 |
| `CommandOutputBlock.tsx` | `components/terminal/CommandOutputBlock.tsx` | 命令输出块：在对话中展示终端命令执行的输出内容                                     |

### workspace-terminal 功能

| 组件                         | 路径                                                     | 说明                                       |
| ---------------------------- | -------------------------------------------------------- | ------------------------------------------ |
| `MultiWorkspaceTerminal.tsx` | `features/workspace-terminal/MultiWorkspaceTerminal.tsx` | 多工作区终端容器：按工作区分组显示终端标签 |
| `WorkspaceTerminalEntry.tsx` | `features/workspace-terminal/WorkspaceTerminalEntry.tsx` | 工作区终端条目：单个工作区的终端列表       |

## 终端选择器

```
terminalSelectors.ts
  selectTerminalTabs(state): TerminalTabState[]
  selectActiveTab(state): TerminalTabState | undefined
  selectDefaultProfile(state): TerminalProfile
  selectWorkspaceProfiles(state): Record<string, TerminalProfile>
  selectNavigatorCollapsed(state): boolean
  selectNavigatorWidth(state): number
```

## 桥接层实现

每个桥接层都实现了 `PtyBridge` 接口：

| 桥接  | 路径                                                | 说明                                          |
| ----- | --------------------------------------------------- | --------------------------------------------- |
| Tauri | `frontend/src/tauri-bridge.ts`                      | 调用 `window.__TAURI__?.invoke()`，Tauri 模式 |
| 预览  | `frontend/src/preview-bridge/preview-pty-bridge.ts` | HTTP polling 到 Vite 中间件，浏览器模式       |
| Mock  | `frontend/src/mock-bridge.ts`                       | 纯内存模拟，测试模式                          |

## 文件参考指南

| 路径                                                                      | 说明                                    |
| ------------------------------------------------------------------------- | --------------------------------------- |
| `crates/pty/src/lib.rs`                                                   | pty crate 入口，导出所有公共类型        |
| `crates/pty/src/traits.rs` + `rust_pty_impl.rs`                           | PTY 核心实现（Rust 原生）               |
| `crates/pty/src/session_manager/`                                         | 会话管理器                              |
| `crates/pty/src/shell_resolver.rs`                                        | Shell 解析器（ShellResolver/ShellKind） |
| `crates/pty/Cargo.toml`                                                   | pty crate 依赖配置                      |
| `crates/pty/tests/windows_compat.rs`                                      | Windows 兼容性测试                      |
| `shared/ipc/pty.ts` + `pty-ws.ts`                                         | PTY IPC 接口与 WebSocket 通道           |
| `frontend/src/app/stores/slices/terminalSlice.ts`                         | 终端状态切片                            |
| `frontend/src/app/stores/slices/terminalSliceTypes.ts`                    | 终端类型定义与常量                      |
| `frontend/src/app/stores/terminalSelectors.ts`                            | 终端选择器                              |
| `frontend/src/app/features/terminal/TerminalPanel.tsx`                    | 终端面板主组件                          |
| `frontend/src/app/features/terminal/TerminalTabBar.tsx`                   | 终端标签栏                              |
| `frontend/src/app/features/terminal/TerminalShellSelector.tsx`            | Shell 选择器                            |
| `frontend/src/app/features/terminal/TerminalNavigator.tsx`                | 终端导航器                              |
| `frontend/src/app/features/terminal/TerminalContextMenu.tsx`              | 终端右键菜单                            |
| `frontend/src/app/features/terminal/TerminalMenuDropdown.tsx`             | 终端菜单下拉                            |
| `frontend/src/app/features/terminal/index.ts`                             | terminal feature 统一导出               |
| `frontend/src/app/features/terminal/useTerminalPanel.ts`                  | 终端面板 Hook                           |
| `frontend/src/app/features/terminal/useTerminalPtyLifecycle.ts`           | PTY 生命周期 Hook                       |
| `frontend/src/app/features/terminal/useTerminalShellManagement.ts`        | Shell 管理 Hook                         |
| `frontend/src/app/features/terminal/useTerminalTabActions.ts`             | 标签操作 Hook                           |
| `frontend/src/app/features/terminal/useTerminalContextMenu.ts`            | 右键菜单 Hook                           |
| `frontend/src/app/features/terminal/useTerminalDragDrop.ts`               | 拖放操作 Hook                           |
| `frontend/src/app/features/terminal/useTerminalMenus.ts`                  | 菜单管理 Hook                           |
| `frontend/src/app/features/terminal/useTerminalViewport.ts`               | 视口管理 Hook                           |
| `frontend/src/app/features/terminal/useGitPushAutoRefresh.ts`             | Git Push 自动刷新 Hook                  |
| `frontend/src/app/components/terminal/XtermTerminal.tsx`                  | xterm.js 终端组件                       |
| `frontend/src/app/components/terminal/CommandOutputBlock.tsx`             | 命令输出块                              |
| `frontend/src/app/features/workspace-terminal/MultiWorkspaceTerminal.tsx` | 多工作区终端容器                        |
| `frontend/src/app/features/workspace-terminal/WorkspaceTerminalEntry.tsx` | 工作区终端条目                          |
| `frontend/src/shared/ipc/pty.ts`                                          | PTY IPC 接口定义                        |
| `frontend/src/preview-bridge/preview-pty-bridge.ts`                       | 浏览器模式 PTY 桥接                     |
| `frontend/src/tauri-bridge.ts`                                            | Tauri 模式桥接                          |
| `frontend/src/mock-bridge.ts`                                             | Mock 模式桥接                           |
