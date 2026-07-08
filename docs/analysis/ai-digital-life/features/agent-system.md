# Agent 系统

## agent-runtime crate

> 路径: `crates/agent-runtime/`

### 模块概览

| 模块 | 文件 | 核心类型/函数 | 职责 |
|------|------|---------------|------|
| Router | `router.rs` | `AgentRouter::select()`, `AgentRouter::select_subagent()` | 根据 ConversationScenario 和用户 prompt 选择 Agent (Plan 场景→Plan Agent；`/plan` 命令→Plan Agent；默认→Build Agent)；子 Agent 调度 (general/explore) |
| Permission Check | `permission_check.rs` | `PermissionCheckResult` (Allow/Deny/Ask), `check_tool_permission()` | 工具执行前集中权限拦截。集成 `command_risk::evaluate_permission` + doom loop 检测 (连续失败≥3次升级为 Ask)。替代 OpenCode 的去中心化 `ctx.ask` |
| Plan Mode | `plan_mode.rs` | `PlanModeState`, `plan_mode_system_prompt()`, `filter_tools_for_plan_mode()`, `is_tool_allowed_in_plan_mode()`, `is_write_allowed_for_plan_file()` | Plan 模式激活/退出状态管理、只读工具白名单 (read/list_tree/search/outline/glob/grep/webfetch/websearch/write)、Plan system prompt 生成、write 路径约束（仅允许写入 plan file） |
| Compaction | `compaction.rs` | `CompactionResult`, `compact_messages()`, `truncate_tool_output()` | 会话消息压缩：超出 `PRUNE_MINIMUM=20000` tokens 时触发，保留最后 2 轮对话 + 受保护的 skill 工具输出，摘要标记 |
| Compaction Summary | `compaction_summary.rs` | — | Compaction 摘要清理辅助 |
| Token Counter | `token_counter.rs` | `TokenCounter`, `global_counter()` | Token 计数（基于 `adl_kernel::estimate_tokens`），阈值常量 (`PRUNE_MINIMUM`, `PRUNE_PROTECT`, `DEFAULT_TAIL_TURNS`, `TOOL_OUTPUT_MAX_CHARS` 等) |
| Tool Registry | `tools/registry.rs` | `ToolRegistry`, `ToolDefinition`, `ToolExecutionResult`, `global_registry()` | 5 个内置工具注册和执行：`webfetch`、`websearch`、`read`、`glob`、`grep`。Plan Mode 时对非白名单工具返回错误，write 工具仅允许写入 plan file |
| Plugins | `plugins/registry.rs`, `hooks.rs` | `PluginHook` trait, `PluginRegistry` | 插件 Hook 注册表和调用链 |
| Agent Registry | `registry.rs` | `AgentRegistry` | 7 个内置 Agent 注册和查找 (`AgentRegistry::new()`) |
| Prompt | `prompt.rs` | Prompt 模板解析和组装 | Agent 系统 prompt 模板管理 |
| Durable | `durable.rs` | 持久化会话管理 | Session 崩溃恢复注册 |
| `lib.rs` | `lib.rs` | `create_run()`, `complete_plan()`, `abort_run()`, `build_model_messages()`, `target_file_from_prompt()`, `target_symbol_from_prompt()`, `create_patch_from_document()`, `assistant_blocks()`, `inject_plan_mode_prompt()`, `complete_after_patch()`, `mark_applying()`, `mark_verifying()` | Agent 运行生命周期管理 |

### 核心流程

```text
用户输入 → AgentRouter::select() → Agent 选择
  → (Plan Mode 激活时注入 plan_mode_system_prompt)
  → create_run() → AgentRunDetail
  → collect_context() → 上下文组装
  → call_model() → ModelGateway.chat() / chat_stream()
  → generate_patches() → change-engine
  → complete_plan() / finalize_run()
```

### 工具权限拦截链条

```text
agent_pipeline::generate_patches()
  → check_tool_permission() (集中拦截)
    → PermissionCheckResult::Allow → 继续执行
    → PermissionCheckResult::Deny  → 拒绝并通知 Agent
    → PermissionCheckResult::Ask   → 请求用户批准
```

## subagent crate

> 路径: `crates/subagent/`

| 文件 | 核心类型 | 职责 |
|------|----------|------|
| `manager.rs` | `SubagentManager`, `SubagentHandle`, `SubagentId`, `SubagentStatus` | 子 Agent 管理：创建/中止/状态跟踪 |
| `task_tool.rs` | `TaskToolInput`, `TaskToolOutput` | 供 Agent 调用的 Task tool 定义和 I/O 格式 |
| `permission.rs` | `derive_subagent_permission()` | 从父 Agent 派生子 Agent 的权限（只读+受限工具集） |
| `output.rs` | — | 子任务输出格式化 |
| `lib.rs` | `SubagentTask` | 子 Agent 任务数据结构（id/parent_session_id/child_session_id/subagent_type/prompt/status/created_at） |

### 子 Agent 权限派生

| 父 Agent | 子 Agent 权限 |
|----------|--------------|
| Build (Primary, 有写权限) | General/Explore → 只读 + 受限工具 |
| Plan (Primary, 只读) | Explore → 只读 + 受限工具 |

## Tauri 命令

| 文件 | 命令 | 职责 |
|------|------|------|
| `commands/agent.rs` | `agent_start_run`, `agent_get_run`, `agent_retry_run`, `agent_abort_run`, `list_agents`, `select_agent`, `enter_plan_mode`, `exit_plan_mode`, `get_plan_mode_state` | Agent 运行启动/Polling/重试/中止；Agent 列表/选择；Plan 模式进入/退出/状态查询 |
| `commands/agent_pipeline.rs` | `prepare_run()`, `collect_context()`, `call_model()`, `generate_patches()`, `finalize_run()` | Agent pipeline 内部步骤（上下文收集→模型调用→Patch 生成→完成） |
| `commands/agent_pipeline_stream.rs` | `consume_stream_to_response()` | SSE 流式消息处理引擎 |
| `commands/agent_pipeline_types.rs` | `CallModelContext`, `FinalizeRunContext` | Pipeline 步骤的上下文数据结构 |
| `commands/subagent.rs` | 子 Agent 相关命令 | 子 Agent 创建/管理 |

## 前端组件

| 组件 | 路径 | 用途 |
|------|------|------|
| `features/custom-agent/CustomAgentManager.tsx` | `features/custom-agent/` | 自定义 Agent 管理面板 |
| `features/custom-agent/CustomAgentSettings.tsx` | `features/custom-agent/` | 自定义 Agent 设置表单 |

（AgentSelector、SubagentIndicator、PlanModeBanner 等 UI 组件可能在 `features/conversation/` 或其他目录中，按需查找）

## 前端 Store

| 模块 | 路径 | 关键字段 |
|------|------|----------|
| `AgentSlice` | `stores/slices/agentSlice.ts` | `selectedAgent`, `availableAgents`, `planModeActive`, `planFile`, `activeSubagents` |
| `agentActions` | `stores/actions/agentActions.ts` | `fetchAgents()`, `selectAgentForScenario()`, `enterPlanMode()`, `exitPlanMode()`, `refreshPlanModeState()` |
| `customAgentActions` | `stores/actions/customAgentActions.ts` | `fetchCustomAgents()`, `addCustomAgent()`, `deleteCustomAgent()` |
| `durableSlice` | `stores/slices/durableSlice.ts` | 持久化会话状态 |
| `durableActions` | `stores/actions/durableActions.ts` | `registerDurableSession()`, `durableHeartbeat()` |
| `compactionSlice` | `stores/slices/compactionSlice.ts` | 压缩状态 |
| `compactionActions` | `stores/actions/compactionActions.ts` | `compactSession()` |

## Session 生命周期

```text
 ┌──────────┐      ┌──────────┐      ┌──────────┐
 │sessionSlice│◄────►│sessionAct.│◄────►│durableSlice│
 └──────────┘      └──────────┘      └──────────┘
      │                                    │
      │ Agent 依赖 activeSessionId         │ 崩溃恢复
      ▼                                    ▼
 ┌──────────┐      ┌──────────┐
 │agentSlice │◄────►│agentAct. │
 └──────────┘      └──────────┘
```

### sessionSlice 关键字段
`activeSessionId`, `sessions`, `sessionOrder`, `pinnedSessions`, `archivedSessions`

### durableSlice 关键字段
`durableSessions` (注册 active run 用于崩溃恢复), heartbeats

## 文件参考

| 内容 | 路径 |
|------|------|
| Agent 核心运行时 | `crates/agent-runtime/src/lib.rs` |
| Agent 路由 | `crates/agent-runtime/src/router.rs` |
| 权限检查 | `crates/agent-runtime/src/permission_check.rs` |
| Plan 模式 | `crates/agent-runtime/src/plan_mode.rs` |
| 会话压缩 | `crates/agent-runtime/src/compaction.rs` |
| Token 计数 | `crates/agent-runtime/src/token_counter.rs` |
| 工具注册表 | `crates/agent-runtime/src/tools/registry.rs` |
| 子 Agent | `crates/subagent/src/` |
| Tauri Agent 命令 | `src-tauri/src/commands/agent.rs` |
| Tauri Pipeline | `src-tauri/src/commands/agent_pipeline.rs` |
| Tauri Stream | `src-tauri/src/commands/agent_pipeline_stream.rs` |
| Tauri Pipeline Types | `src-tauri/src/commands/agent_pipeline_types.rs` |
| Tauri Subagent 命令 | `src-tauri/src/commands/subagent.rs` |
| Tauri Durable 命令 | `src-tauri/src/commands/durable.rs` |
| Store Agent 切片 | `frontend/src/app/stores/slices/agentSlice.ts` |
| Store Agent Actions | `frontend/src/app/stores/actions/agentActions.ts` |
| Store Compaction 切片 | `frontend/src/app/stores/slices/compactionSlice.ts` |
| Store Durable 切片 | `frontend/src/app/stores/slices/durableSlice.ts` |
| 自定义 Agent 管理 UI | `frontend/src/app/features/custom-agent/` |
| Agent 类型定义 | `crates/kernel/src/types/agent.rs` |
