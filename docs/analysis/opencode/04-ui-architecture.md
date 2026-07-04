# OpenCode 深度分析（四）：UI 架构分析

> 源码参考路径：`references/opencode/packages/tui/`、`references/opencode/packages/app/`、`references/opencode/packages/desktop/`

---

## 1. 三端 UI 总览

OpenCode 有三种客户端，共享同一个后端 API：

```
┌──────────────────────────────────────────────────────┐
│  @opencode-ai/tui    → 终端 UI (opentui + SolidJS)    │
├──────────────────────────────────────────────────────┤
│  @opencode-ai/app    → Web UI (SolidJS + Tailwind)    │
│  @opencode-ai/desktop → Electron 桌面壳               │
├──────────────────────────────────────────────────────┤
│  @opencode-ai/sdk    → API 客户端                      │
│  @opencode-ai/core   → 核心逻辑                        │
│  @opencode-ai/schema → 类型定义                        │
└──────────────────────────────────────────────────────┘
```

## 2. TUI 终端 UI (`packages/tui/`)

### 2.1 入口与启动流程

`packages/tui/src/app.tsx` → `run()`（Effect.fn）：

```
1. 创建 CliRenderer（60fps、鼠标支持、Kitty 键盘协议）
2. 创建键位映射 (Keymap) 并注册 OpenCode keymap
3. 挂载 SolidJS 组件树 (~20 层 Context Provider)
```

### 2.2 Provider 层级（核心架构）

```
ExitProvider → EpilogueProvider → ErrorBoundary
  → TuiPathsProvider → TuiTerminalEnvironmentProvider
    → TuiStartupProvider → ClipboardProvider
      → OpencodeKeymapProvider → ArgsProvider
        → KVProvider → ToastProvider → RouteProvider
          → TuiConfigProvider → PluginRuntimeProvider
            → SDKProvider (连接后端 API)
              → PermissionProvider → ProjectProvider
                → SyncProvider → DataProvider
                  → ThemeProvider → LocalProvider
                    → PromptStashProvider → DialogProvider
                      → FrecencyProvider → PromptHistoryProvider
                        → PromptRefProvider → EditorContextProvider
                          → LocationProvider → App
```

### 2.3 组件层次

```
App
├─ StartupLoading                     # 启动动画
├─ Home (routes/home.tsx)             # 首页
│   ├─ Logo
│   ├─ Prompt (输入框 + autocomplete)
│   └─ Plugin Slot (home_*)
├─ Session (routes/session/index.tsx) # 会话页
│   ├─ Sidebar                        # 文件树、MCP、LSP
│   ├─ MessageTimeline (ScrollBox)    # 消息时间线
│   │   ├─ UserMessage
│   │   ├─ AssistantMessage
│   │   │   ├─ ReasoningPart (思考折叠)
│   │   │   ├─ TextPart (Markdown)
│   │   │   └─ ToolPart (Shell/Write/Edit/Read...)
│   │   └─ RevertBar (撤销/重做)
│   ├─ PermissionPrompt / QuestionPrompt
│   └─ Prompt (Plugin Slot)
├─ DialogStack (20+ Modal)
└─ CommandPaletteDialog / Toast
```

### 2.4 状态管理：SyncProvider

TUI 使用集中式的 `SyncProvider`（SolidJS createStore + reconcile + produce 模式）：

```typescript
const [store, setStore] = createStore<{...}>({
  sessions: {},
  messages: {},
  parts: {},
  agents: {},
  providers: {},
  permissions: {},
  // ...
})

// 增量更新
setStore("session", reconcile(newSessionData))
```

**数据流**：后端 SSE 推送事件 → `SDKProvider` 批量收集 → `SyncProvider` 更新 store → SolidJS 细粒度更新组件。

### 2.5 键盘映射系统

基于 `@opentui/keymap`：
- 模态键位：输入框焦点时切换模式栈
- Leader 键：支持超时检测（2000ms），实现两级组合键
- 命令注册：30+ 全局命令 + 20+ 会话命令
- 命令面板：从注册命令提取 `slashName`/`slashAliases` 供 `/command` 触发

### 2.6 主题系统

34 套内置终端配色方案，日/夜模式自动切换，语法高亮颜色自动生成。

---

## 3. Web UI (`packages/app/`)

### 3.1 Provider 层级

```
PlatformProvider → AppBaseProviders
  ├─ MetaProvider | Font | ThemeProvider
  ├─ LanguageProvider (i18n: 18种语言)
  ├─ UiI18nBridge | ErrorBoundary (Sentry)
  ├─ QueryProvider (TanStack Query)
  ├─ MarkedProvider | FileComponentProvider
  └─ AppInterface
       ├─ ServerProvider | GlobalProvider
       ├─ ConnectionGate | TabsProvider
       ├─ NotificationProvider
       └─ SharedProviders (Command/Highlights)
```

### 3.2 双布局模式

| 布局 | 说明 |
|------|------|
| **LegacyLayout** | 传统侧边栏布局 |
| **NewLayout** | 现代设计系统，支持多标签拖拽 |

### 3.3 Session 页面组件树

```
SessionPage
├─ SessionHeader
│   ├─ TitlebarTabStrip (标签页条)
│   ├─ Model/Agent Selector
│   └─ Action Buttons (share/export/settings)
├─ SessionLayout
│   ├─ FileTabs (侧面板)
│   ├─ MessageTimeline (虚拟滚动)
│   │   ├─ timeline-row
│   │   └─ Row reconciliation
│   ├─ Composer (输入区域)
│   │   ├─ PromptInput (附件支持)
│   │   ├─ SessionComposerRegion
│   │   └─ SessionRevertDock / SessionTodoDock
│   ├─ TerminalPanel (ghostty-web)
│   └─ ReviewPanelV2 (diff 审查)
└─ SidePanel
```

### 3.4 状态管理

多层级 Context 策略：

| Context | 层级 | 持久化 |
|---------|------|--------|
| `ServerProvider` | 全局 | localStorage |
| `TabsProvider` | 窗口级 | localStorage (window key) |
| `ServerSyncProvider` | 服务器级 | 无（SSE 同步） |
| `FileProvider` | 目录级 | 无 |
| `ModelsProvider` | 目录级 | 无 |
| `PromptProvider` | 会话级 | 无 |
| `TerminalProvider` | 会话级 | 无 |

### 3.5 i18n 国际化

完整的 18 种语言支持，使用 `@solid-primitives/i18n`，语言通过 cookie 持久化。

---

## 4. Desktop 桌面应用 (`packages/desktop/`)

### 4.1 Sidecar 架构

```
Electron Main Process
├─ 启动 Sidecar 服务器（随机端口 + 密码认证）
├─ 管理 WSL Sidecar（Windows）
├─ IPC 通道（44 个 handler）
│   ├─ 服务器管理：kill-sidecar, await-initialization
│   ├─ 文件操作：open-directory-picker, read-picked-file
│   ├─ 剪贴板：read-clipboard-image
│   ├─ 窗口管理：zoom-factor, pinch-zoom
│   ├─ 更新：updater-check/install
│   └─ WSL：wsl-servers-*
└─ Electron Renderer Process
    ├─ 加载 Web UI
    ├─ contextBridge 暴露 window.api
    └─ HTTP 连接 Sidecar/WSL/SSH 服务器
```

### 4.2 服务器连接类型

| 类型 | 场景 |
|------|------|
| `Sidecar (base)` | 本地桌面 |
| `Sidecar (wsl)` | Windows 上 WSL 后端 |
| `SSH` | 远程 SSH 连接 |
| `HTTP` | 直接 HTTP 远程 |

---

## 5. TUI vs Web vs Desktop 对比

| 维度 | TUI | Web App | Desktop |
|------|-----|---------|---------|
| **运行时** | Node.js 终端 | 浏览器 | Electron Main+Renderer |
| **渲染引擎** | opentui 字符级 | DOM + Tailwind | 同 Web App |
| **输入模型** | 键盘为主(Keymap+Leader) | 鼠标+触摸 | 同Web+原生菜单 |
| **状态管理** | 集中式 SyncProvider | 多层级 Context+Query | 同Web+electron-store |
| **路由** | 自定义 RouteProvider | @solidjs/router | 同 Web |
| **主题** | 34套终端配色 | CSS变量+日夜模式 | 同Web+原生标题栏 |
| **i18n** | 英文 | 18种语言 | 同 Web |
| **API连接** | HTTP+SSE直连 | Sidecar或远程 | WSL/SSH/Sidecar |
| **终端** | 本身就是终端 | ghostty-web嵌入 | 同 Web |

---

## 6. 对当前项目的 UI 借鉴

| OpenCode 做法 | 可借鉴方向 |
|--------------|-----------|
| SolidJS Context 分层 | 你的 React + Zustand 项目可参考分层 Context 模式 |
| Provider 分层注入 | 每一层管理一个横切关注点，清晰且可测试 |
| SyncProvider 集中同步 | SSE → batch → reconcile 的数据流模式 |
| 双布局共存策略 | LegacyLayout + NewLayout 的平滑迁移方式 |
| Sidecar 架构 | 你已有 Tauri 原生支持，但移动端控制场景可参考 Sidecar |
| 命令面板 + Slash 命令 | 终端和 Web 统一使用 `/command` + 面板 |
| 34 套内置主题 | 你的项目已有一套主题系统，可参考扩展机制 |
