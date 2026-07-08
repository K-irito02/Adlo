# AI Digital Life 包索引

> 每个 crate/包/目录的职责、关键文件、依赖。

## Rust 后端 Crates

### 基础设施层

#### `kernel` — 核心类型与常量
- **路径**：`crates/kernel/src/`
- **职责**：所有 crate 共享的公共类型（agent/ci/command/config/model/workspace/hotkeys）
- **依赖**：`serde`, `serde_json`, `thiserror`

#### `errors` — 统一错误类型
- **路径**：`crates/errors/src/lib.rs`
- **职责**：`AppError` 枚举（~30 变体），包含 `thiserror` 宏
- **核心类型**：`AppError`（NotFoundError/InvalidInputError/StorageError/WorkspaceError/...）
- **依赖**：`thiserror`

#### `storage` — SQLite 持久化
- **路径**：`crates/storage/src/`
- **职责**：SQLite 连接池 + CRUD + 会话/工作区/偏好持久化
- **依赖**：`rusqlite`(bundled), `kernel`, `migration`

#### `migration` — 数据库迁移
- **路径**：`crates/migration/src/`
- **职责**：SQLite schema 版本化迁移
- **依赖**：`rusqlite`, `kernel`

#### `adl-logging` — 日志系统
- **路径**：`crates/adl-logging/src/`
- **职责**：tracing 日志配置 + 文件 appender + 日志会话管理
- **依赖**：`tracing`, `tracing-subscriber`, `tracing-appender`

### 领域服务层

#### `workspace` — 工作区管理
- **路径**：`crates/workspace/src/`
- **职责**：文件系统/Git/搜索/树/预览，多工作区管理
- **子模块**：git, tree, search, preview, sidebar
- **依赖**：`kernel`, `storage`, `git2`, `ignore`

#### `conversation` — 会话消息
- **路径**：`crates/conversation/src/`
- **职责**：会话创建/查询/Fork/消息管理
- **依赖**：`kernel`, `storage`

#### `command` — 命令执行
- **路径**：`crates/command/src/`
- **职责**：系统命令执行 + 解析 + 治理
- **依赖**：`kernel`

#### `pty` — 伪终端
- **路径**：`crates/pty/src/`
- **职责**：node-pty 进程管理 + IPC 通信
- **依赖**：`kernel`, `tokio`

#### `fs-ops` — 文件系统操作
- **路径**：`crates/fs-ops/src/`
- **职责**：文件读写/监听/元数据
- **依赖**：`kernel`, `notify`

#### `task` — 任务状态机
- **路径**：`crates/task/src/`
- **职责**：任务生命周期管理（创建/执行/完成/失败）
- **依赖**：`kernel`

#### `context` — 上下文
- **路径**：`crates/context/src/`
- **职责**：上下文选择、组装与注入
- **依赖**：`kernel`, `workspace`

#### `outline` — 大纲解析
- **路径**：`crates/outline/src/`
- **职责**：11 种语言的源码大纲解析（function/class/symbol 提取）
- **依赖**：`kernel`, `tree-sitter`

#### `credential` — 凭据存储
- **路径**：`crates/credential/src/`
- **职责**：API Key 安全存储（keyring + 加密文件 fallback）
- **依赖**：`kernel`, `keyring`

#### `ci-status` — CI 状态
- **路径**：`crates/ci-status/src/`
- **职责**：GitHub Actions CI 状态轮询 + 日志获取
- **依赖**：`kernel`, `reqwest`

### AI 服务层

#### `agent-runtime` — Agent 运行时
- **路径**：`crates/agent-runtime/src/`
- **职责**：Agent 注册/路由/Plan Mode/Compaction/Token 计数/工具注册表
- **依赖**：`kernel`, `command`, `workspace`

#### `model-gateway` — 模型网关
- **路径**：`crates/model-gateway/src/`
- **职责**：多 Provider 路由（Anthropic/OpenAI/Google/Azure/xAI/Local/github-copilot）+ SSE 真实流式 + ProviderRegistry
- **依赖**：`kernel`, `reqwest`, `tokio-stream`

#### `subagent` — 子代理
- **路径**：`crates/subagent/src/`
- **职责**：Task 工具 + 权限派生 + 子 Agent 生命周期
- **依赖**：`kernel`, `agent-runtime`

#### `change-engine` — 变更引擎
- **路径**：`crates/change-engine/src/`
- **职责**：Patch 应用/预览/回滚 + Snapshot + Revert
- **依赖**：`kernel`, `fs-ops`, `git2`

#### `mcp-client` — MCP 客户端
- **路径**：`crates/mcp-client/src/`
- **职责**：3 Transport（Stdio/SSE/StreamableHTTP）+ OAuth + Client/Registry/Catalog
- **依赖**：`kernel`, `reqwest`, `rmcp`

#### `lsp-client` — LSP 客户端
- **路径**：`crates/lsp-client/src/`
- **职责**：LSP 服务器管理 + 诊断/符号/定义/引用
- **依赖**：`kernel`, `lsp-server`, `lsp-types`

### Tauri 壳

#### `browser` — 内置浏览器
- **路径**：`crates/browser/src/`
- **职责**：Tauri 子 WebView2 生命周期管理（创建/导航/销毁/嵌入）
- **依赖**：`kernel`, `tauri`

## Tauri 入口（src-tauri）

### 33 个 Command 模块

| 模块 | 职责 | 对应前端功能 |
|------|------|-------------|
| `app.rs` | 应用信息/调试日志/偏好 | App |
| `workspace.rs` | 工作区 CRUD/树 | Workspace |
| `workspace_git.rs` | Git 操作 | Git |
| `workspace_sidebar.rs` | 侧边栏 | Sidebar |
| `agent.rs` | Agent 配置 | AgentSelector |
| `agent_pipeline.rs` | Agent 执行管道 | Chat |
| `agent_pipeline_stream.rs` | 流式执行 | Streaming |
| `agent_pipeline_types.rs` | 类型定义 | Shared |
| `browser.rs` | 浏览器导航/管理 | BrowserPanel |
| `ci.rs` | CI 状态 | GITHUB CI |
| `command.rs` | 命令执行 | Terminal/Command |
| `commands_config.rs` | 命令配置 | Settings |
| `compaction.rs` | 会话压缩 | Compaction |
| `conversation.rs` | 会话消息 | Session |
| `custom_agent.rs` | 自定义 Agent | CustomAgent |
| `durable.rs` | 持久会话 | DurableSession |
| `lsp.rs` | LSP 操作 | LSPPanel |
| `mcp.rs` | MCP 操作 | MCP Manager |
| `patch.rs` | Patch CRUD | PatchReview |
| `permission.rs` | 权限请求 | PermissionSettings |
| `platform.rs` | 平台信息 | App |
| `plugin.rs` | 插件管理 | PluginManager |
| `provider.rs` | Provider CRUD | ProviderManager |
| `pty_commands.rs` | PTY 控制 | Terminal |
| `reference.rs` | 引用管理 | ReferenceManager |
| `reserved.rs` | 保留接口 | Future |
| `retrieval.rs` | 知识检索 | Retrieval |
| `run_activity.rs` | 运行活动 | Activity |
| `session_fork.rs` | 会话分支 | SessionFork |
| `snapshot.rs` | 快照管理 | Snapshot |
| `subagent.rs` | 子代理 | Subagent |
| `task.rs` | 任务管理 | Task |
| `web_tools.rs` | 网络工具 | WebSearch |

## 前端包

### Features（26 功能域）

| 功能域 | 目录 | 核心文件 |
|--------|------|----------|
| 浏览器 | `features/browser/` | BrowserView, BrowserToolbar, TabBar, BookmarkTree |
| 浏览器树 | `features/browser-tree/` | BrowserFolderTree, BrowserBookmarkTree |
| 终端 | `features/terminal/` | TerminalPanel, TerminalTabs, TerminalEmptyState |
| 差异查看 | `features/diff-viewer/` | DiffViewer, SideBySideDiffViewer, InlineDiffViewer |
| 编辑器 | `features/editor/` | CodeEditor, EditorToolbar |
| 对话 | `features/conversation/` | MessageBlock |
| 文件树 | `features/file-tree/` | FileTree, FileTreeItem |
| 工作区文件树 | `features/workspace-file-tree/` | WorkspaceFileTree |
| 工作区变更树 | `features/workspace-changes-tree/` | ChangesTree |
| 工作区终端 | `features/workspace-terminal/` | WorkspaceTerminal |
| 多工作区 | `features/multi-workspace/` | MultiWorkspaceContainer |
| GitHub 树 | `features/github-tree/` | GitHubTree |
| 大纲 | `features/outline/` | OutlineTree |
| 预览 | `features/preview/` | MarkdownPreview, PDFPreview, DocxPreview |
| 补丁审查 | `features/patch-review/` | PatchFileCard, PatchChunkCard |
| MCP | `features/mcp/` | MCPServerList, MCPConfig |
| LSP | `features/lsp-panel/` | LSPDiagnostics, LSPSymbols |
| Provider | `features/provider-manager/` | ProviderList, ProviderConfig |
| 权限 | `features/permission-settings/` | RulesetEditor |
| 插件 | `features/plugin-manager/` | PluginList |
| 自定义 Agent | `features/custom-agent/` | CustomAgentForm |
| 引用 | `features/reference-manager/` | ReferenceList |
| Session Fork | `features/session-fork/` | SessionForkButton |
| Web 搜索 | `features/web-search/` | WebSearchPanel |
| 命令编辑 | `features/command-editor/` | CommandEditor |
| 通用树 | `features/tree/` | MultiTreeEntryShell |

### Zustand Store

| 切片 | 文件 | 状态字段 |
|------|------|----------|
| `uiSlice` | `slices/uiSlice.ts` | 侧边栏、聊天模式 |
| `workspaceSlice` | `slices/workspaceSlice.ts` | 工作区列表 |
| `sessionSlice` | `slices/sessionSlice.ts` | 会话 ID |
| `editorSlice` | `slices/editorSlice.ts` | 打开标签页 |
| `browserSlice` | `slices/browserSlice.ts` | 导航布局 |
| `browserTabsSlice` | `slices/browserTabsSlice.ts` | 标签页 |
| `browserBookmarkSlice` | `slices/browserBookmarkSlice.ts` | 书签 |
| `browserHistorySlice` | `slices/browserHistorySlice.ts` | 历史 |
| `browserFoldersSlice` | `slices/browserFoldersSlice.ts` | 文件夹 |
| `browserLandingSlice` | `slices/browserLandingSlice.ts` | 着陆页 |
| `terminalSlice` | `slices/terminalSlice.ts` | 终端会话 |
| `agentSlice` | `slices/agentSlice.ts` | Agent 选择 |
| `providerSlice` | `slices/providerSlice.ts` | Provider |
| `mcpSlice` | `slices/mcpSlice.ts` | MCP 服务器 |
| `permissionSlice` | `slices/permissionSlice.ts` | 权限规则 |
| `compactionSlice` | `slices/compactionSlice.ts` | 压缩状态 |
| `referenceSlice` | `slices/referenceSlice.ts` | 引用 |
| `durableSlice` | `slices/durableSlice.ts` | 持久会话 |
| `ciSlice` | `slices/ciSlice.ts` | CI 状态 |
| `githubRepoSlice` | `slices/githubRepoSlice.ts` | GitHub 仓库 |
| `githubTreeSlice` | `slices/githubTreeSlice.ts` | GitHub 树 |
| `patchSlice` | `slices/patchSlice.ts` | 补丁 |
| `taskSlice` | `slices/taskSlice.ts` | 任务 |
| `toastSlice` | `slices/toastSlice.ts` | Toast |
| `clipboardSlice` | `slices/clipboardSlice.ts` | 剪贴板 |

### IPC 接口域（30 个）

```
shared/ipc/agent.ts           shared/ipc/app.ts
shared/ipc/browser.ts         shared/ipc/command.ts
shared/ipc/commands_config.ts shared/ipc/compaction.ts
shared/ipc/conversation.ts    shared/ipc/custom_agent.ts
shared/ipc/digital-life.ts    shared/ipc/durable.ts
shared/ipc/github.ts          shared/ipc/lsp.ts
shared/ipc/mcp.ts             shared/ipc/patch.ts
shared/ipc/permission.ts      shared/ipc/plugin.ts
shared/ipc/provider.ts        shared/ipc/pty.ts
shared/ipc/reference.ts       shared/ipc/reserved.ts
shared/ipc/retrieval.ts       shared/ipc/run-activity.ts
shared/ipc/session_fork.ts    shared/ipc/shared.ts
shared/ipc/snapshot.ts        shared/ipc/subagent.ts
shared/ipc/task.ts            shared/ipc/web_tools.ts
shared/ipc/window.ts          shared/ipc/workspace.ts
```
