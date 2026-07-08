# Rust Crates (22 个)

> 路径前缀: `ai-digital-life/crates/`

## 1. kernel（核心类型）

| 项目 | 值 |
|------|-----|
| 路径 | `crates/kernel/` |
| 用途 | 核心类型定义、ID 生成、Token 估算、Config Watcher、命令风险评估、事件系统、日志初始化 |
| 文件数 | ~15 |

**关键类型/模块:**

| 模块 | 主要类型 |
|------|----------|
| `types/agent.rs` | `AgentId` (Build/Plan/General/Explore/Compaction/Title/Summary/Custom), `AgentMode`, `AgentConfig`, `AgentRunRecord`, `AgentRunStatus` (11 variants), `AgentPlanStep`, `AgentRunDetail`, `PatchSet`, `PatchHunk`, `FilePatch`, `PatchHunkDecision`, `PatchSetStatus`, `ValidationResult`, `PatchApplicationResult` |
| `types/workspace.rs` | `AppInfo`, `WorkspaceMeta`, `ConfigSnapshot`, `RecentWorkspaceEntry`, `WorkspaceFileDocument`, `WorkspaceChangePreview` |
| `types/conversation.rs` | `ConversationSessionRecord`, `ConversationMessageRecord`, `ConversationRole`, `ConversationScenario`, `ConversationBlock`, `ConversationSendResult`, `ContextEntry` |
| `types/config.rs` | `ModelPreferences`, `ModelDefinition`, `ModelCapability`, `ModelTier`, `ThemeMode`, `Theme`, `LogMode`, `FontPreferences` |
| `types/model.rs` | `ModelChatMessage`, `ModelResponse`, `ModelTokenUsage`, `ModelRouteDecision`, `ModelCallAuditRecord`, `ModelGatewayHealthSnapshot`, `ProviderHealthStatus` |
| `types/ci.rs` | `CiStatus`, `CiWorkflow`, `CiJob` |
| `types/command.rs` | `CommandExecutionResult`, `RiskLevel` |
| `types/commands.rs` | `CommandConfig`, `CommandHint` |
| `types/reference.rs` | `ReferenceConfig`, `ReferenceSource` |
| `types/reserved.rs` | `AcpConfig`, `CodeModeConfig`, `HttpApiConfig` |
| `command_risk.rs` | `PermissionRule`, `PermissionRuleset`, `PermissionRulesetConfig`, `PermissionDecision`, `assess_command_risk`, `evaluate_permission` |
| `config_watcher.rs` | `ConfigWatcher` (基于 notify) |
| `events.rs` | `DigitalLifeRunActivityEventV1`, `run_activity_event()` |
| `lib.rs` | `IpcResult<T>`, `IpcError`, `create_id()`, `now_ms()`, `estimate_tokens()`, `APP_NAME` |

**依赖:** `adl-errors`, `serde`, `serde_json`, `ts-rs`, `uuid`, `chrono`, `tokio`, `tracing`, `tracing-subscriber`, `tracing-appender`, `notify`, `regex`

## 2. errors（错误枚举）

| 项目 | 值 |
|------|-----|
| 路径 | `crates/errors/` |
| 用途 | `AppError` 枚举，~17 个变体，统一错误处理 |
| 文件数 | ~2 |

**关键类型:**

```rust
pub enum AppError {
    NotFound(String),       InvalidInput(String),
    Storage(String),        Workspace(String),
    Config(String),         Io(String),
    Migration(String),      Security(String),
    ApprovalRequired(String),  Patch(String),
    Terminal(String),       Model(String),
    Timeout(String),        RateLimit(String),
    AuthError(String),      Network(String),
    Internal(String),
}
```

**依赖:** `serde`, `thiserror`

## 3. storage（SQLite 存储）

| 项目 | 值 |
|------|-----|
| 路径 | `crates/storage/` |
| 用途 | SQLite 连接池、Schema 初始化、CRUD、EntityTable 枚举、工作区清理 |
| 文件数 | ~9 |

**关键类型:**

| 文件 | 内容 |
|------|------|
| `connection.rs` | `Database` struct (SQLite 连接封装) |
| `crud.rs` | `save_entity`, `load_entity`, `list_entities`, `delete_entity` |
| `entity_table.rs` | `EntityTable` 枚举 (18+ 表) |
| `session.rs` | 会话相关查询 |
| `purge.rs` | `WorkspacePurgeReport`, `purge_workspace` 级联删除 |
| `repository/` | `workspace_repo.rs` — 工作区仓库方法 |
| `sql/` | `init_schema.sql`, `init_indexes.sql` |

**EntityTable 枚举值:** `AppState`, `Workspaces`, `RecentWorkspaces`, `RetrievalSnapshots`, `Tasks`, `Approvals`, `AuditRecords`, `Checkpoints`, `ConversationMessages`, `AgentRuns`, `AgentSteps`, `ToolInvocations`, `PatchSets`, `FilePatches`, `PatchHunks`, `CommandRequests`, `CommandExecutions`, `ValidationResults`, `ModelPreferences`, `ModelCallAudit`, `RunActivityEvents`

**依赖:** `rusqlite`, `serde_json`, `adl-errors`, `adl-kernel`

## 4. migration（Schema 版本管理）

| 项目 | 值 |
|------|-----|
| 路径 | `crates/migration/` |
| 用途 | SQLite Schema 版本管理、自动迁移 |
| 文件数 | ~2 |

**依赖:** `adl-storage`, `adl-errors`

## 5. adl-logging（日志框架）

| 项目 | 值 |
|------|-----|
| 路径 | `crates/adl-logging/` |
| 用途 | `tracing` 集成、日志文件 Appender、会话日志管理器 |
| 文件数 | ~7 |

**关键模块:** `config.rs`, `error.rs`, `manager.rs`, `mode.rs`, `session.rs`

**依赖:** `tracing`, `tracing-subscriber`, `tracing-appender`, `adl-errors`

## 6. workspace（文件系统/Git/搜索）

| 项目 | 值 |
|------|-----|
| 路径 | `crates/workspace/` |
| 用途 | 文件系统操作、Git 操作、全文搜索、目录树、变更预览 |
| 文件数 | ~8 |

**模块:**

| 文件 | 功能 |
|------|------|
| `fs.rs` | 文件读写、创建、删除、重命名、移动、复制 |
| `git.rs` | Git status、diff、branch、commit、checkout |
| `search.rs` | 文件内容搜索 (grep-like) |
| `tree.rs` | 目录树生成与遍历 |
| `preview.rs` | 变更预览 patch 生成 |
| `detect.rs` | 工作区检测 |

**依赖:** `adl-errors`, `adl-kernel`, `git2`, `ignore`, `walkdir`

## 7. conversation（会话 CRUD/Fork）

| 项目 | 值 |
|------|-----|
| 路径 | `crates/conversation/` |
| 用途 | 会话和消息 CRUD、上下文构建、会话 Fork |
| 文件数 | ~3 |

**模块:** `lib.rs` (create_message, create_session 等), `fork.rs` (fork_session, list_session_forks)

**依赖:** `adl-errors`, `adl-storage`, `adl-kernel`

## 8. command（系统命令执行）

| 项目 | 值 |
|------|-----|
| 路径 | `crates/command/` |
| 用途 | 系统命令执行封装 |
| 文件数 | ~2 |

**依赖:** `adl-errors`, `tokio`

## 9. pty（终端进程管理）

| 项目 | 值 |
|------|-----|
| 路径 | `crates/pty/` |
| 用途 | node-pty 进程生命周期管理、Shell 解析、会话管理 |
| 文件数 | ~5 |

**模块:** `pty.rs`, `session_manager.rs`, `shell_resolver.rs`

**依赖:** `adl-errors`, `portpicker`, `serde_json`, `tokio`

## 10. fs-ops（文件操作）

| 项目 | 值 |
|------|-----|
| 路径 | `crates/fs-ops/` |
| 用途 | 文件读写/监控/观察 |
| 文件数 | ~2 |

**依赖:** `adl-errors`, `notify`, `tokio`

## 11. task（任务状态机）

| 项目 | 值 |
|------|-----|
| 路径 | `crates/task/` |
| 用途 | 任务状态机定义 |
| 文件数 | ~2 |

**依赖:** `adl-errors`, `adl-kernel`

## 12. context（上下文选择/组装）

| 项目 | 值 |
|------|-----|
| 路径 | `crates/context/` |
| 用途 | 工作区上下文收集、文件引用上下文、符号引用上下文生成、Prompt 组装 |
| 文件数 | ~3 |

**模块:** `lib.rs` (workspace_context, file_context, symbol_context, assemble_prompt), `references.rs` (reference workspace context)

**依赖:** `adl-errors`, `adl-kernel`, `adl-outline`

## 13. outline（11 语言大纲解析）

| 项目 | 值 |
|------|-----|
| 路径 | `crates/outline/` |
| 用途 | 11 种语言的代码大纲/symbol 解析 |
| 文件数 | ~12 |

**支持的解析器:**

| 语言 | 文件 |
|------|------|
| Rust | `brace.rs` (通用大括号语言) |
| TypeScript/JavaScript | `brace.rs` |
| Python | `python.rs` |
| HTML | `html.rs` |
| CSS | `css.rs` |
| JSON | `json.rs` |
| Markdown | `markdown.rs` |
| Shell | `shell.rs` |
| SQL | `sql.rs` |
| Vue | `vue.rs` |
| YAML | `yaml.rs` |

**依赖:** `adl-errors`, `tree-sitter` (若干 language crates)

## 14. credential（密钥管理）

| 项目 | 值 |
|------|-----|
| 路径 | `crates/credential/` |
| 用途 | 系统 keyring + 加密文件回退两级凭据存储 |
| 文件数 | ~2 |

**依赖:** `adl-errors`, `keyring`

## 15. ci-status（GitHub Actions CI）

| 项目 | 值 |
|------|-----|
| 路径 | `crates/ci-status/` |
| 用途 | GitHub Actions CI 状态轮询、缓存、解析 |
| 文件数 | ~4 |

**模块:** `ci_client.rs`, `ci_cache.rs`, `ci_parser.rs`

**依赖:** `adl-errors`, `reqwest`, `serde_json`

## 16. agent-runtime（Agent 路由/权限/Plan/Compaction）

| 项目 | 值 |
|------|-----|
| 路径 | `crates/agent-runtime/` |
| 用途 | Agent 核心运行时：路由、权限检查、Plan 模式、会话压缩、Token 计数、工具注册表、插件 Hook、Prompt 模板 |
| 文件数 | ~18 |

**模块:**

| 文件 | 功能 |
|------|------|
| `router.rs` | `AgentRouter` — 场景/命令驱动的 Agent 选择 |
| `permission_check.rs` | `PermissionCheckResult` — 工具执行权限拦截（含 doom loop 检测） |
| `plan_mode.rs` | `PlanModeState` — Plan 模式激活/退出、只读工具白名单、Plan system prompt 生成 |
| `compaction.rs` | `CompactionResult`, `compact_messages()` — 会话消息修剪（保护尾部轮次 + skill 工具输出） |
| `compaction_summary.rs` | Compaction 摘要清理 |
| `token_counter.rs` | `TokenCounter` — Token 计数、压缩阈值 (`PRUNE_MINIMUM=20000`, `PRUNE_PROTECT=40000`) |
| `tools/registry.rs` | `ToolRegistry`, `ToolDefinition`, `ToolExecutionResult` — 5 个内置工具 (webfetch/websearch/read/glob/grep)，Plan Mode gate |
| `plugins/` | `registry.rs` (插件注册表), `hooks.rs` (PluginHook trait), `mod.rs` |
| `registry.rs` | `AgentRegistry` — 内置 7 个 Agent 注册 + 自定义 Agent |
| `prompt.rs` | Prompt 模板解析和组装 |
| `durable.rs` | 持久化会话管理 |
| `lib.rs` | `create_run()`, `complete_plan()`, `abort_run()`, `build_model_messages()`, `target_file_from_prompt()`, `assistant_blocks()` |

**依赖:** `adl-errors`, `adl-kernel`, `adl-context`, `adl-change-engine`, `adl-storage`, `reqwest`, `serde_json`, `tokio`

## 17. model-gateway（7 个 Provider + SSE）

| 项目 | 值 |
|------|-----|
| 路径 | `crates/model-gateway/` |
| 用途 | 7 个 LLM Provider 适配器、Provider 注册表、优先级路由、SSE 流式、审计日志、确定性回退 |
| 文件数 | ~18 |

**模块:**

| 文件 | 功能 |
|------|------|
| `registry.rs` | `ProviderRegistry`, `ProviderDefinition`, `ApiType` (4 种), `AuthType` (3 种), `ModelSource` |
| `providers/anthropic.rs` | Anthropic Claude (AnthropicNative API) |
| `providers/google.rs` | Google Gemini (GoogleNative API) |
| `providers/ollama.rs` | Ollama (本地, 无 API Key) |
| `providers/openai.rs` | OpenAI (OpenAICompatible) |
| `providers/openrouter.rs` | OpenRouter (OpenAICompatible) |
| `adapter.rs` | `ProviderAdapter` trait, `StreamReader`, `StreamChunk`, `ChatOptions` |
| `provider.rs` | `call_provider()`, `call_provider_stream()`, `dispatch_to_provider()` |
| `route.rs` | `route_chain()`, `select_provider()` — 优先级排序 Provider 链 |
| `secret.rs` | `set_provider_secret()`, `get_provider_secret()`, `clear_provider_secret()` |
| `audit.rs` | 模型调用审计记录 |
| `fallback.rs` | 全 Provider 失败时的确定性回退 (`deterministic_fallback`) |
| `prompts/` | 各 Provider 的 system prompt 模板 |

**依赖:** `adl-errors`, `adl-kernel`, `adl-credential`, `reqwest`, `tokio`, `tokio-stream`, `serde_json`, `async-trait`

## 18. subagent（任务工具 + 权限派生）

| 项目 | 值 |
|------|-----|
| 路径 | `crates/subagent/` |
| 用途 | 子 Agent 管理器、Task Tool 定义、权限派生、子 Agent 生命周期 |
| 文件数 | ~5 |

**模块:**

| 文件 | 功能 |
|------|------|
| `manager.rs` | `SubagentManager`, `SubagentHandle`, `SubagentStatus` (Pending/Running/Completed/Failed) |
| `task_tool.rs` | `TaskToolInput`, `TaskToolOutput` — Task tool 定义 |
| `permission.rs` | `derive_subagent_permission()` — 从父 Agent 派生子 Agent 权限 |
| `output.rs` | 子任务输出格式化 |
| `lib.rs` | `SubagentTask` struct |

**依赖:** `adl-errors`, `adl-kernel`, `adl-agent-runtime`

## 19. change-engine（Patch/Snapshot/Revert）

| 项目 | 值 |
|------|-----|
| 路径 | `crates/change-engine/` |
| 用途 | Patch 创建与应用、Snapshot 快照、Revert 回滚、校验、文件变更语言检测 |
| 文件数 | ~7 |

**模块:** `patch_create.rs`, `patch_apply.rs`, `snapshot.rs`, `revert.rs`, `validation.rs`, `language.rs`

**依赖:** `adl-errors`, `adl-kernel`, `similar`

## 20. mcp-client（MCP 协议客户端）

| 项目 | 值 |
|------|-----|
| 路径 | `crates/mcp-client/` |
| 用途 | MCP 协议客户端：3 种传输层 (stdio/SSE/Streamable HTTP)、OAuth 认证、工具目录、工具执行 |
| 文件数 | ~8 |

**模块:**

| 文件 | 功能 |
|------|------|
| `transport/stdio.rs` | Stdio 传输层 |
| `transport/sse.rs` | SSE 传输层 |
| `transport/streamable.rs` | Streamable HTTP 传输层 |
| `client.rs` | MCP 客户端核心 |
| `catalog.rs` | MCP 服务器目录 |
| `oauth.rs` | OAuth 认证流程 |
| `registry.rs` | MCP 服务器注册表 |
| `tools.rs` | MCP 工具调用封装 |

**依赖:** `adl-errors`, `adl-kernel`, `reqwest`, `tokio`, `serde_json`

## 21. lsp-client（LSP 客户端）

| 项目 | 值 |
|------|-----|
| 路径 | `crates/lsp-client/` |
| 用途 | LSP 协议客户端：Diagnostics/Symbols/Definitions/References、Server 生命周期管理 |
| 文件数 | ~5 |

**模块:** `client.rs`, `server_manager.rs`, `diagnostics.rs`, `symbols.rs`

**依赖:** `adl-errors`, `adl-kernel`, `tokio`, `serde_json`, `lsp-types`

## 22. browser（WebView2 生命周期管理）

| 项目 | 值 |
|------|-----|
| 路径 | `crates/browser/` |
| 用途 | WebView2 标签页生命周期管理、导航、音视频指示器、Favicon、标题同步、历史记录、消息桥接、Profile 管理 |
| 文件数 | ~15 |

**模块:**

| 文件 | 功能 |
|------|------|
| `browser_pool.rs` | `BrowserPool` — WebView2 实例池管理 |
| `browser_webview.rs` | `BrowserManager`, `Bounds` — WebView2 创建/销毁/尺寸 |
| `browser_navigation.rs` | 导航、前/后退、刷新、URL 变化处理 |
| `webview2_audio.rs` | 音频播放检测和静音控制 |
| `webview2_favicon.rs` | Favicon 提取和缓存 |
| `webview2_title.rs` | 页面标题同步 |
| `webview2_history.rs` | 浏览历史记录管理 |
| `webview2_message.rs` | 页面消息桥接 |
| `webview2_postmessage.rs` | `window.postMessage` 桥接 |
| `webview2_cleanup.rs` | 缓存和 Cookie 清除 |
| `webview2_profile.rs` | WebView2 颜色方案和 Profile 管理 |
| `browser_meta.rs` | `PageMeta` — 页面元数据 |
| `browser_events.rs` | 浏览器事件系统 |

**依赖:** `adl-errors`, `adl-kernel`, `serde_json`, `tokio`, `webview2` (Tauri 内联)
