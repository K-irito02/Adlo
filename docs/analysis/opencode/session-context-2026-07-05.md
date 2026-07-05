# Session Context — AI Digital Life 补齐缺失能力

> **生成时间:** 2026-07-05 16:30 CST
> **工作目录:** `E:\AI-DIGITAL-LIFE\SourceWorkspace`
> **Git 分支:** `feature/phase-2-missing-features`
> **起始提交:** `52aa6c96` (Phase 2-A 起点)
> **当前提交:** `5652558a` (Phase 2-C 终点)
> **总提交数:** 31 commits (Phase 2-A: 16 + Phase 2-B: 13 + Phase 2-C: 2 额外)

---

## 一、总体概览

### 1.1 项目结构

```
ai-digital-life/
├── Cargo.toml                        # 工作区 Cargo.toml
├── crates/
│   ├── agent-runtime/                # Phase 2-A: Agent 运行时 (registry, router, prompt, plan_mode, token_counter, compaction, tools)
│   ├── change-engine/                # Phase 2-C: 变更引擎 (patch, snapshot, revert)
│   ├── command/                      # 命令执行模块
│   ├── context/                      # 上下文组装
│   ├── conversation/                 # 会话模块 (含 Phase 2-A 子会话)
│   ├── credential/                   # 凭据存储
│   ├── errors/                       # AppError 类型
│   ├── fs-ops/                       # 文件系统操作
│   ├── kernel/                       # 核心类型 (types, config, command_risk)
│   ├── mcp-client/                   # Phase 2-B: MCP 客户端 (registry, catalog, client, oauth, transport)
│   ├── subagent/                     # Phase 2-A: Sub-agent 生命周期管理
│   ├── task/                         # 任务执行模块
│   └── workspace/                    # 工作区管理 (git, preview, detect)
├── frontend/
│   └── src/
│       ├── app/
│       │   ├── components/
│       │   │   ├── conversation/
│       │   │   │   ├── CompactionIndicator.tsx      # 2-C
│       │   │   │   ├── RevertButton.tsx              # 2-C
│       │   │   │   └── SlashCommandPopover.tsx       # 待修改 (2-D)
│       │   │   ├── AgentSelector.tsx                 # 2-A
│       │   │   ├── PlanModeBanner.tsx                # 2-A
│       │   │   └── SubagentIndicator.tsx             # 2-A
│       │   ├── features/
│       │   │   ├── mcp/                              # 2-B: MCP 管理 UI
│       │   │   ├── provider-manager/                 # 2-B: Provider 管理 UI
│       │   │   └── ... (browser, editor, terminal 等已有模块)
│       │   ├── stores/
│       │   │   ├── StoreState.ts                     # 主状态类型
│       │   │   ├── slicedStore.ts                    # Store 组合
│       │   │   ├── slices.ts                         # Slice 导出
│       │   │   ├── slices/
│       │   │   │   ├── agentSlice.ts                 # 2-A
│       │   │   │   ├── mcpSlice.ts                   # 2-B
│       │   │   │   └── providerSlice.ts              # 2-B
│       │   │   └── actions/
│       │   │       ├── agentActions.ts               # 2-A
│       │   │       ├── mcpActions.ts                 # 2-B
│       │   │       └── providerActions.ts            # 2-B
│       │   └── i18n/zh-CN/, en-US/                   # 国际化
│       ├── shared/ipc/
│       │   ├── digital-life.ts                       # 主 Bridge 接口
│       │   ├── index.ts                              # 导出
│       │   ├── agent.ts, subagent.ts                 # 2-A
│       │   ├── mcp.ts, provider.ts                   # 2-B
│       │   ├── snapshot.ts, web_tools.ts             # 2-C
│       │   └── ipc-types.generated.ts                # 自动生成
│       ├── tauri-bridge.ts                           # Tauri IPC 实现
│       ├── mock-bridge.ts                            # Mock 实现
│       └── preview-bridge/index.ts                   # 预览 Bridge
├── src-tauri/
│   └── src/commands/
│       ├── agent.rs, subagent.rs                     # 2-A
│       ├── mcp.rs, provider.rs                       # 2-B
│       ├── snapshot.rs, web_tools.rs                 # 2-C
│       └── ... (agent_pipeline, browser, ci 等已有命令)
└── docs/superpowers/plans/
    ├── 2026-07-05-missing-features-index.md          # 总索引
    ├── 2026-07-05-phase-2a-agent-core-foundation.md  # 2-A 计划
    ├── 2026-07-05-phase-2b-protocol-provider-ecosystem.md # 2-B 计划
    ├── 2026-07-05-phase-2c-conversation-quality-tools.md  # 2-C 计划
    ├── 2026-07-05-phase-2d-user-customization-permission.md # 2-D 计划
    └── 2026-07-05-phase-2e-advanced-reserved.md      # 2-E 计划
```

### 1.2 18 项缺失能力总索引

| # | 能力 | 阶段 | 状态 |
|---|------|------|------|
| 1 | 多 Agent 系统 | 2-A | ✅ 完成 |
| 2 | Sub-agent / Task 工具 | 2-A | ✅ 完成 |
| 3 | Plan Mode | 2-A | ✅ 完成 |
| 4 | MCP 完整集成 | 2-B | ✅ 完成 |
| 5 | 多 LLM Provider 支持 | 2-B | ✅ 完成 |
| 6 | Provider-specific Prompts | 2-B | ✅ 完成 |
| 7 | Compaction (Token-aware pruning) | 2-C | ✅ 完成 |
| 8 | Snapshot / Revert | 2-C | ✅ 完成 |
| 9 | WebFetch / WebSearch 工具 | 2-C | ✅ 完成 |
| 10 | 自定义命令配置 | 2-D | ⏳ 未开始 |
| 11 | 权限系统升级为 Ruleset | 2-D | ⏳ 未开始 |
| 12 | Session Fork | 2-E | ⏳ 未开始 |
| 13 | LSP 集成 | 2-E | ⏳ 未开始 |
| 14 | Plugin 系统 | 2-E | ⏳ 未开始 |
| 15 | ACP 接口预留 | 2-E | ⏳ 未开始 |
| 16 | HTTP API 服务器 | 2-E | ⏳ 未开始 |
| 17 | CodeMode 沙箱 | 2-E | ⏳ 未开始 |
| 18 | Reference / Agent 配置 / Hot Reload | 2-E | ⏳ 未开始 |

---

## 二、Phase 2-A: Agent Core Foundation (已完成)

### 2.1 任务清单

| 任务 | 内容 | 提交范围 | 结果 |
|------|------|---------|------|
| Task 1 | 更新 Phase Boundary 文档 | `52aa6c96..40bd9bc1` | ✅ |
| Task 2 | 定义 Agent 核心类型 (AgentId, AgentMode, AgentConfig) | `40bd9bc1..aa1f8e8e` | ✅ 136 kernel tests |
| Task 3 | 构建 AgentRegistry (registry.rs) | `aa1f8e8e..505415d3` | ✅ 5 registry tests |
| Task 4 | 实现 AgentRouter (router.rs) | `505415d3..88a53673` | ✅ 8 router tests |
| Task 5 | 实现 Agent Prompt Templates (prompt.rs) | `88a53673..c2858601` | ✅ 5 prompt tests |
| Task 6 | 创建 Subagent Crate 骨架 | `c2858601..1e1f49dd` | ✅ 3 subagent tests |
| Task 7 | 实现父子会话关系 | `1e1f49dd..3549d726` | ✅ |
| Task 8 | 实现 Plan Mode 后端逻辑 | `f50d0616..4318b07f` | ✅ 5 plan_mode tests |
| Task 9 | 添加 Agent IPC 命令 (list_agents, select_agent, plan_mode) | `4318b07f..b06325f6` | ✅ |
| Task 10 | 添加前端 Agent IPC 接口 (3-bridge sync) | `b06325f6..ffcbb941` | ✅ typecheck |
| Task 11 | 创建 Agent Zustand Slice | `ffcbb941..6809698c` | ✅ typecheck |
| Task 12 | 构建 AgentSelector 组件 | `6809698c..9327dca0` | ✅ typecheck |
| Task 13 | 构建 PlanModeBanner + SubagentIndicator 组件 | `9327dca0..72ed2219` | ✅ typecheck |
| Task 14 | 将 /plan 斜杠命令接到 Plan Mode | `72ed2219..3e06bcc4` | ✅ typecheck |
| Task 15 | 实现 Spawn Subagent IPC 后端 | `3e06bcc4..f67256b2` | ✅ |
| Task 16 | 全量验证 (61 Rust tests + 326 frontend tests) | `f67256b2` | ✅ 全部通过 |

### 2.2 2-A 新增 Rust 文件

```
crates/agent-runtime/src/registry.rs     # AgentRegistry
crates/agent-runtime/src/router.rs      # AgentRouter
crates/agent-runtime/src/prompt.rs      # Agent-specific prompt templates
crates/agent-runtime/src/plan_mode.rs   # Plan Mode state gating
crates/kernel/src/types/agent.rs        # AgentId, AgentMode, AgentConfig
crates/subagent/src/lib.rs              # Subagent crate
crates/subagent/src/manager.rs          # SubagentManager
crates/subagent/src/output.rs           # OutputBuffer
crates/subagent/src/permission.rs       # SubagentPermission
crates/subagent/src/task_tool.rs        # Task tool
```

### 2.3 2-A 新增前端文件

```
frontend/src/shared/ipc/agent.ts        # AgentBridge
frontend/src/shared/ipc/subagent.ts     # SubagentBridge
frontend/src/app/stores/slices/agentSlice.ts
frontend/src/app/stores/actions/agentActions.ts
frontend/src/app/components/AgentSelector.tsx
frontend/src/app/components/PlanModeBanner.tsx
frontend/src/app/components/SubagentIndicator.tsx
frontend/src/app/i18n/zh-CN/agent.ts
frontend/src/app/i18n/en-US/agent.ts
```

### 2.4 2-A 新增 IPC 命令

```
src-tauri/src/commands/agent.rs          # list_agents, select_agent
src-tauri/src/commands/subagent.rs       # spawn_subagent, get_subagent_status, list_subagents
```

---

## 三、Phase 2-B: Protocol & Provider Ecosystem (已完成)

### 3.1 任务清单

| 任务 | 内容 | 提交范围 | 结果 |
|------|------|---------|------|
| Task 1 | 扩展 ModelProviderId (7 variants) | `f67256b2..5ad0d28d` | ✅ 3 tests |
| Task 2 | ProviderAdapter trait + Stream 类型 | `5ad0d28d..616488e5` | ✅ 2 tests |
| Task 3 | OpenAI 兼容 Provider | `616488e5..d7e05708` | ✅ 3 tests |
| Task 4 | Anthropic/Google/Ollama/OpenRouter | `d7e05708..53b5446e` | ✅ 12 tests |
| Task 5 | Provider-specific Prompt 模板 | `53b5446e..f14d3d93` | ✅ 3 tests |
| Task 6 | 添加 MCP 依赖 (rmcp) | `f14d3d93..8536c797` | ✅ cargo check |
| Task 7 | 创建 mcp-client crate | `8536c797..12b75985` | ✅ 12 mcp-client tests |
| Task 8 | MCP IPC 命令 (7 个 Tauri commands) | `12b75985..79e83e85` | ✅ cargo check |
| Task 9 | Provider IPC 命令 (4 个 Tauri commands) | `79e83e85..14d2fc50` | ✅ cargo check |
| Task 10 | 前端 MCP+Provider IPC 接口 (3-bridge sync) | `14d2fc50..5c07a7d4` | ✅ typecheck |
| Task 11 | MCP UI (3 组件 + slice/actions + i18n) | `5c07a7d4..89f78457` | ✅ typecheck |
| Task 12 | Provider UI (2 组件 + slice/actions + i18n) | `89f78457..e34ba44a` | ✅ typecheck |
| Task 13 | 全量验证 (267 Rust tests + 326 frontend tests) | `e34ba44a` | ✅ 全部通过 |

### 3.2 2-B 新增 Rust 文件

```
crates/mcp-client/Cargo.toml
crates/mcp-client/src/lib.rs
crates/mcp-client/src/registry.rs        # McpRegistry
crates/mcp-client/src/catalog.rs         # McpCatalog
crates/mcp-client/src/client.rs          # McpClient
crates/mcp-client/src/oauth.rs           # OAuth 认证
crates/mcp-client/src/tools.rs           # MCP 工具调用
crates/mcp-client/src/transport/mod.rs    # Transport trait
crates/mcp-client/src/transport/stdio.rs  # stdio 传输
crates/mcp-client/src/transport/sse.rs    # SSE 传输
crates/mcp-client/src/transport/streamable.rs # Streamable HTTP
```

### 3.3 2-B 新增前端文件

```
frontend/src/shared/ipc/mcp.ts           # McpBridge
frontend/src/shared/ipc/provider.ts      # ProviderBridge
frontend/src/app/stores/slices/mcpSlice.ts
frontend/src/app/stores/actions/mcpActions.ts
frontend/src/app/stores/slices/providerSlice.ts
frontend/src/app/stores/actions/providerActions.ts
frontend/src/app/features/mcp/McpServerList.tsx
frontend/src/app/features/mcp/McpServerConfig.tsx
frontend/src/app/features/mcp/McpStatusBadge.tsx
frontend/src/app/features/provider-manager/ProviderList.tsx
frontend/src/app/features/provider-manager/ProviderConfig.tsx
frontend/src/app/i18n/zh-CN/mcp.ts
frontend/src/app/i18n/en-US/mcp.ts
frontend/src/app/i18n/zh-CN/provider.ts
frontend/src/app/i18n/en-US/provider.ts
```

### 3.4 2-B 新增 IPC 命令

```
src-tauri/src/commands/mcp.rs            # list_mcp_servers, add_mcp_server, update_mcp_server, delete_mcp_server, connect_mcp_server, disconnect_mcp_server, call_mcp_tool
src-tauri/src/commands/provider.rs       # list_supported_providers, set_provider_api_key, clear_provider_api_key, has_provider_api_key
```

---

## 四、Phase 2-C: Conversation Quality Tools (已完成)

### 4.1 任务清单

| 任务 | 内容 | 提交范围 | 结果 |
|------|------|---------|------|
| Task 1 | 添加 tokenizers 依赖 (v0.21.4) | `e34ba44a..8ab1dd8b` | ✅ cargo check |
| Task 2 | 实现 TokenCounter (6 tests + 7 常量) | `8ab1dd8b..6ae15494` | ✅ 6 tests |
| Task 3 | 实现 Compaction (token-aware pruning) | `6ae15494..f235bca1` | ✅ 4 tests |
| Task 4 | 实现 SnapshotManager (snapshot CRUD + prune) | `f235bca1..eea4024d` | ✅ 3 tests |
| Task 5 | 实现 Revert (git checkout 方式回退) | `eea4024d..7f57b582` | ✅ 2 tests |
| Task 6 | 实现 WebFetch (50KB 限制, 10s 超时) | `7f57b582..0f618ad5` | ✅ 3 tests |
| Task 7 | 实现 WebSearch (Tavily API) | `0f618ad5..73be9011` | ✅ 3 tests |
| Task 8 | 添加 Snapshot/Web Tool IPC 命令 | `73be9011..ae5355db` | ✅ cargo check |
| Task 9 | 添加前端 IPC + UI (RevertButton + CompactionIndicator) | `ae5355db..d5e94079` | ✅ typecheck |
| Task 10 | 全量验证 (273 Rust tests + 326 frontend tests) | `d5e94079..5652558a` | ✅ 全部通过 |

### 4.2 2-C 新增 Rust 文件

```
crates/agent-runtime/src/token_counter.rs  # TokenCounter
crates/agent-runtime/src/compaction.rs     # compact_messages, truncate_tool_output
crates/agent-runtime/src/tools/mod.rs      # Tools module
crates/agent-runtime/src/tools/webfetch.rs # WebFetch tool
crates/agent-runtime/src/tools/websearch.rs # WebSearch tool (Tavily)
crates/change-engine/src/snapshot.rs       # SnapshotManager
crates/change-engine/src/revert.rs         # revert_to_snapshot
```

### 4.3 2-C 新增前端文件

```
frontend/src/shared/ipc/snapshot.ts        # SnapshotBridge
frontend/src/shared/ipc/web_tools.ts       # WebToolsBridge
frontend/src/app/components/conversation/RevertButton.tsx
frontend/src/app/components/conversation/CompactionIndicator.tsx
frontend/src/app/i18n/zh-CN/conversation.ts
frontend/src/app/i18n/en-US/conversation.ts
```

### 4.4 2-C 新增 IPC 命令

```
src-tauri/src/commands/snapshot.rs         # create_snapshot, list_snapshots, revert_to_snapshot_cmd, prune_snapshots
src-tauri/src/commands/web_tools.rs        # web_fetch, web_search
```

### 4.5 2-C 关键差异记录

| 计划假定 | 实际代码 | 说明 |
|---------|---------|------|
| `GitSnapshot.head_commit` | `GitSnapshot.head` | 结构体字段名为 `head` |
| `AppError::IO(...)` | `AppError::Io(...)` | 枚举变体名称为 `Io` |
| `adl_workspace::git::capture_git_snapshot` | `adl_workspace::capture_git_snapshot` | `git` 模块是私有的，在 crate 根重新导出 |
| `TokenCounter` 使用 tokenizers 库 | fallback 使用 `adl_kernel::estimate_tokens` | tokenizer 加载是 future work，当前使用 CJK-aware 估算 |
| `CredentialStore::new()` | `CredentialStore::new("ai-digital-life", "websearch-tavily")` | 真正的 API 需要 2 个参数 |

---

## 五、Phase 2-D: User Customization & Permission (即将开始)

### 5.1 计划概述

- **目标:** 用户自定义斜杠命令 (CommandConfig + 模板变量) + 权限系统升级为 Ruleset
- **架构:** 纯配置变更 (config.rs + command_risk.rs + types)，无新外部依赖
- **依赖:** Phase 2-A (AgentId 用于 command→agent 绑定)
- **参考源:** `references/opencode/packages/opencode/src/session/permission.ts` + `references/opencode/packages/schema/src/command.ts`

### 5.2 任务清单 (10 个)

| # | 任务 | 文件 | 描述 |
|---|------|------|------|
| 1 | 在 command_risk.rs 中原地重构 Permission Ruleset | `command_risk.rs`, `lib.rs` | 重命名 `PermissionEngine` → `PermissionRuleset`，添加 `always`/`reason` 字段，添加 `PermissionRulesetConfig`、`default_rules()`、`merge()`/`is_allow()` 方法 |
| 2 | 定义 CommandConfig 类型 | `types/commands.rs`, `types/mod.rs` | `CommandConfig` 含模板变量提取 ($1, $ARGUMENTS, $WORKSPACE) |
| 3 | 扩展 AppConfig | `config.rs`, `types/config.rs` | 添加 `commands: Vec<CommandConfig>` 和 `permissions: PermissionRulesetConfig` |
| 4 | 创建 Permission Ruleset 评估模块 | `permission_ruleset.rs` | `evaluate_permission()`, `risk_to_decision()`, `doom_loop_check()`, `is_external_directory()`, `build_ruleset()` |
| 5 | 添加 Custom Command + Permission IPC | `commands/commands_config.rs`, `commands/permission.rs` | Tauri 命令：CRUD 自定义命令 + 管理权限规则 |
| 6 | 添加前端 IPC interfaces | `ipc/commands_config.ts`, `ipc/permission.ts` | 3-bridge sync |
| 7 | 更新 SlashCommandPopover | `SlashCommandPopover.tsx` + `commandSlice.ts` | 从配置加载命令列表 |
| 8 | 构建 Command Editor UI | `features/command-editor/` | 表单：name, description, agent, model, template, subtask |
| 9 | 构建 Permission Ruleset Editor UI | `features/permission-settings/` | 规则列表 + 编辑表单 |
| 10 | 全量验证 | — | cargo test + clippy + typecheck |

### 5.3 关键接口 (已存在，Task 1 需引用)

```rust
// crates/kernel/src/command_risk.rs (当前状态)
pub enum PermissionDecision { Allow, Ask, Deny }
pub struct PermissionRule { pattern, decision, tool_type }
pub struct PermissionEngine { rules }
impl PermissionEngine { add_rule(), evaluate(command, args) -> PermissionDecision }
fn pattern_matches(pattern, command, args) -> bool
fn default_decision(command, args) -> PermissionDecision
fn assess_command_risk(command, args, shell) -> RiskLevel
fn requires_approval(risk) -> bool

// crates/kernel/src/types/agent.rs (Phase 2-A)
pub enum AgentId { Build, Plan, Chat, Compaction, Title, Summary }
```

### 5.4 Task 1 关键差异 (计划 vs 实际)

| 计划假定 | 实际 | 说明 |
|---------|------|------|
| `PermissionEngine` | 存在但需重命名为 `PermissionRuleset` | 计划要求原地重构 |
| `PermissionRule` 有 `#[serde(rename_all = "camelCase")]` | 已在 `command_risk.rs:49` | 需移除以兼容 snake_case |
| `PermissionRule` 无 `always`/`reason` | 需添加 | 新字段 |
| `evaluate(command, args)` | 需改为 `evaluate(tool_name, command, args)` | 新参数 |
| `pattern_matches(pattern, command, args)` | 需改为 `pattern_matches(pattern, text)` | 简化 API |
| `RiskLevel` | 在 `conversation.rs` 中定义 | 已有 `Low/Medium/High` |

---

## 六、关键常量与阈值

| 常量 | 值 | 文件 | 阶段 |
|------|-----|------|------|
| `PRUNE_MINIMUM` | 20,000 | `token_counter.rs` | 2-C |
| `PRUNE_PROTECT` | 40,000 | `token_counter.rs` | 2-C |
| `DEFAULT_TAIL_TURNS` | 2 | `token_counter.rs` | 2-C |
| `TOOL_OUTPUT_MAX_CHARS` | 2,000 | `token_counter.rs` | 2-C |
| `MIN_PRESERVE_RECENT_TOKENS` | 2,000 | `token_counter.rs` | 2-C |
| `MAX_PRESERVE_RECENT_TOKENS` | 8,000 | `token_counter.rs` | 2-C |
| `PRUNE_PROTECTED_TOOLS` | `["skill"]` | `token_counter.rs` | 2-C |
| `MAX_OUTPUT_BYTES` | 50,000 (50KB) | `webfetch.rs` | 2-C |
| `TIMEOUT_SECS` (WebFetch) | 10s | `webfetch.rs` | 2-C |
| `TIMEOUT_SECS` (WebSearch) | 15s | `websearch.rs` | 2-C |
| `MAX_RESULTS` (WebSearch) | 10 | `websearch.rs` | 2-C |
| `SNAPSHOT_MAX_AGE_DAYS` | 7 | `snapshot.rs` | 2-C |
| `SNAPSHOT_MAX_TOTAL_BYTES` | 2MB | `snapshot.rs` | 2-C |

---

## 七、Cargo 依赖汇总

| Crate | 版本 | 用途 | 阶段 |
|-------|------|------|------|
| `rmcp` | 1.x | MCP 协议客户端/服务端 | 2-B |
| `rmcp-macros` | 2.x | MCP 工具宏 | 2-B |
| `tokenizers` | 0.21.x | 多模型 token 计数 | 2-C |
| `dirs` | 5 | 系统数据目录 | 2-C |

---

## 八、测试统计

| 套件 | Phase 2-A | Phase 2-B | Phase 2-C | 当前总计 |
|------|-----------|-----------|-----------|---------|
| Rust tests | +61 | +206 | +6 | 273 |
| Frontend tests | — | — | — | 326 |

---

## 九、UI 组件索引 (已完成)

| 组件 | 阶段 | 路径 |
|------|------|------|
| AgentSelector | 2-A | `frontend/src/app/components/AgentSelector.tsx` |
| PlanModeBanner | 2-A | `frontend/src/app/components/PlanModeBanner.tsx` |
| SubagentIndicator | 2-A | `frontend/src/app/components/SubagentIndicator.tsx` |
| McpServerList | 2-B | `frontend/src/app/features/mcp/McpServerList.tsx` |
| McpServerConfig | 2-B | `frontend/src/app/features/mcp/McpServerConfig.tsx` |
| McpStatusBadge | 2-B | `frontend/src/app/features/mcp/McpStatusBadge.tsx` |
| ProviderList | 2-B | `frontend/src/app/features/provider-manager/ProviderList.tsx` |
| ProviderConfig | 2-B | `frontend/src/app/features/provider-manager/ProviderConfig.tsx` |
| RevertButton | 2-C | `frontend/src/app/components/conversation/RevertButton.tsx` |
| CompactionIndicator | 2-C | `frontend/src/app/components/conversation/CompactionIndicator.tsx` |

---

## 十、Store 架构索引 (已完成)

| Slice | 阶段 | 路径 |
|-------|------|------|
| agentSlice | 2-A | `frontend/src/app/stores/slices/agentSlice.ts` |
| agentActions | 2-A | `frontend/src/app/stores/actions/agentActions.ts` |
| mcpSlice | 2-B | `frontend/src/app/stores/slices/mcpSlice.ts` |
| mcpActions | 2-B | `frontend/src/app/stores/actions/mcpActions.ts` |
| providerSlice | 2-B | `frontend/src/app/stores/slices/providerSlice.ts` |
| providerActions | 2-B | `frontend/src/app/stores/actions/providerActions.ts` |

---

## 十一、Bridge 架构索引

| Interface | 文件 | 阶段 |
|-----------|------|------|
| `DigitalLifeBridge` (主接口) | `frontend/src/shared/ipc/digital-life.ts` | — |
| `AgentBridge` | `frontend/src/shared/ipc/agent.ts` | 2-A |
| `SubagentBridge` | `frontend/src/shared/ipc/subagent.ts` | 2-A |
| `McpBridge` | `frontend/src/shared/ipc/mcp.ts` | 2-B |
| `ProviderBridge` | `frontend/src/shared/ipc/provider.ts` | 2-B |
| `SnapshotBridge` | `frontend/src/shared/ipc/snapshot.ts` | 2-C |
| `WebToolsBridge` | `frontend/src/shared/ipc/web_tools.ts` | 2-C |

**三端实现:**
- `frontend/src/tauri-bridge.ts` — 生产环境 (Tauri invoke)
- `frontend/src/mock-bridge.ts` — 开发/测试 (mock 数据)
- `frontend/src/preview-bridge/index.ts` — Web 预览 (继承 mock-bridge 的 spread pattern)

---

## 十二、延迟处理的 Minor Findings

以下是在 Phase 2-A/B/C 实施过程收集的小问题，计划在整分支审查时统一处理：

1. **Task 3:** `register` 覆盖同名 AgentId — HashMap::insert 语义，无测试覆盖
2. **Task 4:** `/plan` 前缀匹配也会匹配 `/planner` — 应有词边界检查
3. **Task 6:** `SubagentManager::update_status` ID 不存在时静默 no-op — 应返回 Result
4. **Task 6:** `SubagentPermission` 文档说读取 `_parent` 但函数体从未使用
5. **Task 7:** `uuid` 的 `unpinned_order as i32` 可能截断 u32→i32
6. **Task 8:** `PlanModeState.active` 既有 public field 又有 `is_active()` — 封装缺口
7. **Task 11:** `refreshPlanModeState` 用 `console.warn` 而非 `captureError` — 不符合 action 模式
8. **Phase 2-B Task 2:** `fallback.rs:default_model` 对新增 Provider 返回 "unknown" — 应与 Task 1 合并
9. **Phase 2-B Task 2:** `default_model` 和 `default_model_for_provider` 重复逻辑
10. **Phase 2-B Task 10:** lint 驱动导入清理 — 安全优化
11. **Phase 2-B Task 11:** 相对路径导入而非 `@i18n` 别名 — 轻微不一致
12. **clippy.toml** 声明 MSRV 1.77，但 `project-overview.md` 要求 1.85+

---

## 十三、常见陷阱与注意事项

1. **AppError 枚举:** `Io` 不是 `IO`, `IO` 编译错误
2. **ConversationBlock::ToolCall:** 字段名 `tool_name` 不是 `tool`
3. **GitSnapshot:** 字段名 `head` 不是 `head_commit`
4. **CredentialStore API:** `new(service, account)` + `get_password()` 0 参数返回 `Result<String, AppError>`
5. **adl_workspace::capture_git_snapshot:** 在 crate 根导出的，不在 `::git::` 模块下
6. **`#[serde(rename_all = "camelCase")]`** 在现有 `PermissionRule` (command_risk.rs:49) 上 — Task 1 需移除它
7. **三端同步:** 所有新 bridge 方法必须同时在 tauri-bridge, mock-bridge, preview-bridge 实现
8. **Store 4 层架构:** StoreState → slices → actions → slicedStore
9. **i18n:** 所有 UI 文本需使用 i18n key，禁止硬编码
10. **IpcResult import:** 使用 `@ai-digital-life/kernel` 而非 `./shared`
