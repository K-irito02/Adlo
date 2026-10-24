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
```
// 浏览器模式经 adl-server 真实后端（preview-bridge http 优先，可回退），非 Node.js 中间件
│  │  tauri-bridge.ts     │   │  preview-bridge/         ││
│  │  ↓ invoke()          │   │  ↓ HTTP Fetch            ││
│  │  Tauri IPC           │   │  adl-server 真实后端     ││
│  │  ↓ #[tauri::command] │   │  ↓ preview-bridge 12 文件 ││
│  │  Rust Backend        │   │  (http 优先，可回退)      ││
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
│  kernel (共享内核：app_info/config/events/storage/types) │ ← 最底层
├──────────────────────────────────────────┤
│  errors（AppError）  │  adl-logging       │  ← 基础设施
├──────────────────────────────────────────┤
│  types（共享类型）    │  storage/migration │  ← 类型与数据持久化
├──────────────────────────────────────────┤
│  领域服务层                               │
│  workspace │ pty          │ fs-ops        │
│  outline   │ credential   │ ci-status     │
│  clipboard │ sysmon       │ change-engine │
│  server（adl-server 后端引擎）             │
├──────────────────────────────────────────┤
│  环境依赖层                               │
│  adl-env（providers/来源偏好/基线）        │
│  adl-hosted（版本托管/原子换装/进度任务）  │
├──────────────────────────────────────────┤
│  dsh 宿主集成层（第三方 harness 由 dsh 提供）│
│  webapp-host │ dsh-bundle │ dsh-version   │
│  download-source                          │
├──────────────────────────────────────────┤
│  Tauri 壳 (src-tauri)                     │
│  ├─ main.rs / lib.rs / setup.rs / state.rs│
│  ├─ commands/ (13 文件：12 领域 + mod.rs)  │
│  └─ capabilities/ (default + browser-remote)│
└──────────────────────────────────────────┘
```

## 前端 - 组件层级

```
App.tsx (根组件，TCopyProvider 注入)
├── Regions (布局)
│   ├── TitleBar            # 标题栏（含汉堡菜单/中心标签条/窗口控制）
│   ├── CenterPane          # 中央多标签宿主（CenterEntryPage：dsh/浏览器/终端）
│   ├── LeftSidebar         # 左侧边栏（剪切看板 + 系统监控）
  │   └── RightPanel          # 右侧面板（5 工具切换：files/changes/browser/terminal/settings；communicate 已删除）
│
├── [Features] (25 功能域)  # 按功能域组织的面板，详见 00-quick-reference.md
│   ├── browser/            # 内置浏览器
│   ├── terminal/           # 终端（多窗格）
│   ├── editor/             # CodeMirror 编辑器
│   ├── center/             # 中心宿主
│   ├── dsh/                # dsh 宿主集成
│   └── ...                 # 更多功能域
│
└── 通用组件/错误边界/延迟加载（LazyComponents）
```

## Zustand Store 切片依赖

```
slicedStore.ts (合并入口，32 切片)
├── 核心切片 (基础数据)
│   ├── uiSlice              # UI 状态（侧边栏/面板显隐/宽度）
│   ├── workspaceSlice       # 工作区树
│   └── editorSlice          # 编辑器打开文件
│
├── 面板切片 (UI 面板)
│   ├── browserSlice 系列    # 浏览器（8 切片：browser/tabs/bookmark/history/folders/landing/searchEngines/downloads）
│   ├── terminalSlice        # 终端
│   ├── centerTabsSlice      # 中心标签
│   └── dshSlice             # dsh 宿主
│
├── 功能切片
│   ├── patchSlice           # 补丁审查
│   ├── searchSlice          # 搜索
│   ├── diagnosticSlice      # 诊断
│   ├── clipboardSlice 系列  # 剪贴板
│   ├── referenceSlice       # 引用管理
│   └── systemMonitorSlice   # 系统监视器
│
└── 基础设施
    ├── toastSlice 系列      # Toast 通知（含 errorToast）
    ├── notificationSlice    # 通知
    └── gitSlice 系列        # Git（含 gitVis）
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
  Rust 命令执行/pty 输出 → Tauri Event → frontend onEvent → Store 增量更新 → UI 逐步渲染
```

## 环境依赖层数据流

环境依赖管理走 **adl-server HTTP 路由**（非 Tauri command），Tauri 壳的 `tauri-env.ts` 仅转发到同一组 `/env/*` 端点，双端共用一套后端逻辑：

```
EnvironmentSettings / EnvWizard（features/environment、features/network）
  → env 桥（tauri-env.ts 转发 / preview httpBridge env 域）
  → adl-server  GET /env/status
                POST /env/install|uninstall|select-source|set-custom-path|recheck
  → adl-env     providers（node/git/bash/webview2/adlserver/netprobe）
                env-sources.json（来源偏好）+ env-baseline.json（基线）
  → adl-hosted  HostedVersions / AtomicSwap / InstallLock / ProcHost / ProgressTask
  → <data>/env-hosted/<dep>/installed/<v>（selected.txt 记当前选中版）
```

`EnvStatus` 返回六依赖状态 + 进行中任务快照（`task`）+ 数据根（`dataDir`）+ `dshReady`（= node 达标）；安装/卸载进度由前端 3s 轮询 `GET /env/status` 读取，响应有 2s TTL 且活动任务期间不触网。

## IPC 三桥接契约

```
shared/ipc/*.ts (接口定义)
  ├── 所有 IPC 方法的类型签名
  ├── `IpcResult<T>` 统一返回类型
  └── `AppError` 错误传播

tauri-bridge.ts        # 真实实现：wrapper 调用 window.__TAURI__?.invoke()
preview-bridge/        # 浏览器实现：HTTP 请求 → adl-server 真实后端（http 优先，可回退）
mock-bridge.ts         # 测试实现：纯内存对象，直接返回 mock 数据（+ mock/ 按域模块）
```

## 关键设计模式

| 模式 | 描述 | 代码位置 |
|------|------|----------|
| **Zustand 切片合并** | 功能拆分为独立切片，通过 `slicedStore.ts` 合并 | `stores/slicedStore.ts` |
| **IPC 三桥接** | 同一接口定义，tauri/preview/mock 三实现 | `shared/ipc/` |
| **Action 模式** | 每个 mutation action 入口 clearError，结尾 catchError | `stores/cacheHelpers.ts` |
| **AppError 统一错误** | Rust 端 AppError → IpcResult → 前端 typedErrors | `errors/src/` ←→ `shared/typedErrors.ts` |
| **i18n 全覆盖** | useTCopy() hook + 22 域 x 2 语言 | `i18n/` |
| **设计 Token 驱动** | tokens.ts → theme.ts → CSS Variables | `design-system/` |
| **isFetching 模式** | Store 层 Record<string, boolean> 独立跟踪异步加载 | `StoreState.ts` |
| **命令注册表** | 前端命令通过 defaultCommands.ts 统一注册/路由 | `commands/defaultCommands.ts` |
