# AI Digital Life 架构设计

> 源码参考：`ai-digital-life/crates/`、`ai-digital-life/src-tauri/`、`ai-digital-life/frontend/src/`

## 双端架构

```
┌─────────────────────────────────────────────────────────┐
│                     双模式运行架构                       │
│                                                         │
│  Tauri 模式 (tauri-bridge)        浏览器模式 (preview)  │
│  ┌──────────────────────┐   ┌──────────────────────────┐│
│  │  Frontend (WebView2) │   │  Frontend (Browser)      ││
│  │  tauri-bridge.ts     │   │  preview-bridge/         ││
│  │  ↓ invoke()          │   │  ↓ HTTP Fetch            ││
│  │  Tauri IPC           │   │  Vite Dev Server         ││
│  │  ↓ #[tauri::command] │   │  ↓ previewTerminalSrv    ││
│  │  Rust Backend        │   │  Node.js 中间件          ││
│  └──────────────────────┘   └──────────────────────────┘│
│                                                         │
│  Mock 模式 (纯前端测试)                                  │
│  ┌──────────────────────────────────────────────────┐   │
│  │  Frontend → mock-bridge.ts → 纯内存模拟           │   │
│  └──────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

## Rust 后端 - Crate 依赖关系

```
┌──────────────────────────────────────────┐
│              kernel (核心类型)             │  ← 最底层，被所有 crate 依赖
├──────────────────────────────────────────┤
│  errors（AppError）  │  adl-logging       │  ← 基础设施
├──────────────────────────────────────────┤
│  storage  │  migration                   │  ← 数据持久化
├──────────────────────────────────────────┤
│  领域服务层                               │
│  workspace │ conversation │ command      │
│  pty       │ fs-ops       │ task         │
│  context   │ outline      │ credential   │
│  ci-status │                              │
├──────────────────────────────────────────┤
│  AI 层                                    │
│  agent-runtime │ model-gateway           │
│  subagent      │ change-engine           │
│  mcp-client    │ lsp-client              │
├──────────────────────────────────────────┤
│  Tauri 壳 (src-tauri)                     │
│  ├─ lib.rs (run())                       │
│  ├─ commands/ (33 模块)                  │
│  └─ capabilities/ (权限白名单)           │
└──────────────────────────────────────────┘
```

## 前端 - 组件层级

```
App.tsx (根组件)
├── Regions (布局)
│   ├── StatusBar           # 底部状态栏
│   ├── LeftSidebar         # 左侧边栏
│   ├── CenterPane          # 中央窗格（主内容区）
│   └── RightPanel          # 右侧面板（上下文/LSP/引用）
│
├── Composer                # 对话输入框
├── SessionManagement       # 会话管理
│
├── [Features] (26 功能域)  # 按功能域组织的面板
│   ├── browser/            # 内置浏览器
│   ├── terminal/           # 终端
│   ├── editor/             # CodeMirror 编辑器
│   ├── file-tree/          # 文件树
│   └── ...                 # 更多功能域
│
├── ContextBuilder          # 上下文构建器
├── AgentSelector           # Agent 选择器
├── PromptInput             # Prompt 输入
├── MessageStream           # 消息流
└── WelcomeState            # 欢迎页（无会话时）
```

## Zustand Store 切片依赖

```
slicedStore.ts (合并入口)
├── 核心切片 (基础数据)
│   ├── uiSlice              # UI 状态（侧边栏、聊天模式）
│   ├── workspaceSlice       # 工作区树
│   ├── sessionSlice         # 会话
│   └── editorSlice          # 编辑器打开文件
│
├── 工具切片 (Agent 工具)
│   ├── agentSlice           # Agent 配置与选择
│   ├── commandSlice         # 命令执行
│   ├── taskSlice            # 任务中心
│   ├── compactionSlice      # Token 压缩
│   ├── webToolsSlice        # 网络工具
│   └── permissionSlice      # 权限规则
│
├── 集成切片 (外部系统)
│   ├── mcpSlice             # MCP 服务器
│   ├── providerSlice        # 模型提供商
│   ├── referenceSlice       # 引用管理
│   ├── durableSlice         # 持久会话
│   └── lspActions(actions)  # LSP 操作
│
├── 面板切片 (UI 面板)
│   ├── browserSlice+        # 浏览器（5 切片）
│   ├── terminalSlice        # 终端
│   ├── ciSlice              # CI 状态
│   └── githubSlice+         # GitHub（3 切片）
│
└── 基础设施
    ├── toastSlice           # Toast 通知
    ├── clipboardSlice       # 剪贴板
    └── searchSlice          # 搜索
```

## 数据流

```
用户操作 (UI)
  │
  ▼
React Component → dispatch store action
  │
  ▼
Zustand Action → tauri-bridge.invoke()
  │                  │
  ▼                  ▼
(locally)      Tauri IPC ──→ Rust Command
  │                  │          │
  ▼                  ▼          ▼
IPC Result ←─── tauri-bridge ←─── Rust Command 执行
  │
  ▼
Zustand Store 更新 → UI 响应渲染

流式路径:
  Rust agent_pipeline_stream → Tauri Event → frontend onEvent → Store 增量更新 → UI 逐步渲染
```

## IPC 三桥接契约

```
shared/ipc/*.ts (接口定义)
  ├── 所有 IPC 方法的类型签名
  ├── `IpcResult<T>` 统一返回类型
  └── `AppError` 错误传播

tauri-bridge.ts        # 真实实现：wrapper 调用 window.__TAURI__?.invoke()
preview-bridge/        # 浏览器实现：HTTP 请求 → Vite 中间件
mock-bridge.ts         # 测试实现：纯内存对象，直接返回 mock 数据
```

## 关键设计模式

| 模式 | 描述 | 代码位置 |
|------|------|----------|
| **Zustand 切片合并** | 功能拆分为独立切片，通过 `slicedStore.ts` 合并 | `stores/slicedStore.ts` |
| **IPC 三桥接** | 同一接口定义，tauri/preview/mock 三实现 | `shared/ipc/` |
| **Action 模式** | 每个 mutation action 入口 clearError，结尾 catchError | `stores/cacheHelpers.ts` |
| **AppError 统一错误** | Rust 端 AppError → IpcResult → 前端 typedErrors | `errors/src/` ←→ `shared/typedErrors.ts` |
| **i18n 全覆盖** | useTCopy() hook + 26 域 x 2 语言 | `i18n/` |
| **设计 Token 驱动** | tokens.ts → theme.ts → CSS Variables | `design-system/` |
| **isFetching 模式** | Store 层 Record<string, boolean> 独立跟踪异步加载 | `StoreState.ts` |
| **命令注册表** | 前端命令通过 CommandRegistry 统一注册/路由 | `commands/commandRegistry.ts` |
