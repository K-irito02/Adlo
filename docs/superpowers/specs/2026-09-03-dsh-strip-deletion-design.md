# DSH 插件化剥离 — 一次性全删设计方案

**日期**: 2026-09-03  
**分支**: `refactor/strip-20260903`  
**目标**: 将 ADL 项目中被 dsh（DeepSeek Harness）接管的功能模块彻底删除，使 ADL 变为 dsh 的插件壳层

## 1. 架构目标

删除后保留的核心功能：
- 浏览器面板（browser）
- 终端面板（terminal / PTY）
- 工作区管理（workspace）
- 编辑器 / 补丁系统（editor / patch）
- Git 可视化（git）
- 设置系统（settings，已部分清理）
- i18n 国际化
- Tauri 桌面壳层

## 2. 依赖图分析

### 被删 Crate 及其依赖者

| 被删 Crate | 直接依赖者 |
|---|---|
| `agent-runtime` | `crates/server` |
| `subagent` | `crates/agent-runtime`, `crates/tools`, `crates/server` |
| `task` | `crates/server` |
| `conversation` | `crates/server` |
| `context` | `crates/agent-runtime`, `crates/server` |
| `model-gateway` | `crates/agent-runtime`, `crates/server`, `src-tauri` |
| `command` | `crates/tools`, `crates/server` |

### 受牵连的保留 Crate

- `crates/server` — 依赖全部 7 个被删 crate
- `src-tauri` — 依赖 `model-gateway`
- `crates/tools` — 依赖 `subagent` 和 `command`
- `crates/types` — 包含被删模块的类型定义
- `crates/kernel` — 引用 `permission_types` 和 `command_risk`

## 3. 删除清单

### 3.1 Rust Crates（整个目录删除）

| Crate | 路径 | 说明 |
|-------|------|------|
| `agent-runtime` | `crates/agent-runtime/` | Agent 运行时、LoopExecutor、Plan Mode、工具注册表 |
| `subagent` | `crates/subagent/` | 子 Agent 管理、Task 工具 |
| `task` | `crates/task/` | 任务状态机、审批流程 |
| `conversation` | `crates/conversation/` | 会话与消息持久化 |
| `context` | `crates/context/` | 上下文选择与 Prompt 组装 |
| `model-gateway` | `crates/model-gateway/` | 模型网关、Provider 路由、流式传输 |
| `command` | `crates/command/` | 命令执行、风险控制 |

### 3.2 Server 内部文件

**删除：**

| 文件 | 说明 |
|------|------|
| `crates/server/src/agent_loop.rs` | Server 端 Agent Loop |
| `crates/server/src/engine.rs` | Engine 核心（依赖 agent-runtime, model-gateway）|
| `crates/server/src/state.rs` | Server 状态管理（依赖 agent-runtime, subagent, model-gateway）|
| `crates/server/src/sse_server.rs` | SSE 服务端（依赖 agent-runtime）|
| `crates/server/src/sse.rs` | SSE 流处理（依赖 agent-runtime）|
| `crates/server/src/handlers/agent.rs` | Agent HTTP handler |
| `crates/server/src/handlers/agent_pipeline.rs` | Agent pipeline handler |
| `crates/server/src/handlers/subagent.rs` | Sub-agent handler |
| `crates/server/src/handlers/task.rs` | Task handler |
| `crates/server/src/handlers/custom_agent.rs` | 自定义 Agent handler |
| `crates/server/src/handlers/run_activity.rs` | 运行活动 handler |
| `crates/server/src/handlers/compaction.rs` | 压缩 handler |
| `crates/server/src/handlers/session_fork.rs` | 会话 Fork handler |
| `crates/server/src/handlers/command.rs` | Command handler |
| `crates/server/src/handlers/permission.rs` | Permission handler |
| `crates/server/src/handlers/provider.rs` | Provider handler |
| `crates/server/src/handlers/conversation.rs` | Conversation handler |

**清理（移除被删模块的引用）：**

| 文件 | 清理内容 |
|------|----------|
| `crates/server/src/handlers/mod.rs` | 移除已删 handler 的 `pub mod` 声明 |
| `crates/server/src/handlers/patch.rs` | 移除对 agent-runtime 的 `mark_applying`/`mark_verifying`/`complete_after_patch` |
| `crates/server/src/handlers/reference.rs` | 移除对 context crate 的 `references_prompt`/`validate_reference` |
| `crates/server/src/lib.rs` | 移除已删模块的 `mod` 声明 |
| `crates/server/Cargo.toml` | 移除对已删 crate 的 `[dependencies]` |

### 3.3 Server 测试文件

| 文件 | 说明 |
|------|------|
| `crates/server/tests/agent.rs` | Agent handler 测试 |
| `crates/server/tests/agent_pipeline.rs` | Agent pipeline 测试 |
| `crates/server/tests/subagent.rs` | Sub-agent 测试 |
| `crates/server/tests/task.rs` | Task 测试 |
| `crates/server/tests/command.rs` | Command 测试 |
| `crates/server/tests/permission.rs` | Permission 测试 |
| `crates/server/tests/conversation_api.rs` | Conversation API 测试 |
| `crates/server/tests/provider.rs` | Provider 测试 |
| `crates/server/tests/session_fork.rs` | Session Fork 测试 |
| `crates/server/tests/compaction.rs` | Compaction 测试 |
| `crates/server/tests/custom_agent.rs` | Custom Agent 测试 |
| `crates/server/tests/run_activity.rs` | Run Activity 测试 |
| `crates/server/tests/sse_stream.rs` | SSE Stream 测试 |

### 3.4 src-tauri 文件

**删除：**

| 文件 | 说明 |
|------|------|
| `src-tauri/src/commands/provider.rs` | Provider Tauri Command |

**清理：**

| 文件 | 清理内容 |
|------|----------|
| `src-tauri/src/state.rs` | 移除 `ProviderRegistry` 引用 |
| `src-tauri/src/setup.rs` | 移除 model-gateway 相关 import 和初始化逻辑 |
| `src-tauri/src/commands/app.rs` | 移除 `ModelGateway::new` 相关逻辑 |
| `src-tauri/Cargo.toml` | 移除 `adl-model-gateway` 依赖 |

### 3.5 crates/tools 文件

**删除：**

| 文件 | 说明 |
|------|------|
| `crates/tools/src/task.rs` | Task 工具（依赖 subagent）|

**清理：**

| 文件 | 清理内容 |
|------|----------|
| `crates/tools/src/bash.rs` | 移除 `adl_command::build_request`/`run_command` 引用 |
| `crates/tools/Cargo.toml` | 移除 `adl-subagent` 和 `adl-command` 依赖 |

### 3.6 crates/types 文件

**删除：**

| 文件 | 说明 |
|------|------|
| `crates/types/src/types/agent.rs` | AgentId、AgentConfig、AgentRunStatus 等 |
| `crates/types/src/types/model.rs` | ModelChatMessage、ModelResponse 等 |
| `crates/types/src/types/conversation.rs` | ConversationSessionRecord、Message 等 |
| `crates/types/src/types/command.rs` | CommandProfile、CommandRequest 等 |
| `crates/types/src/permission_types.rs` | PermissionDecision、PermissionRule 等 |

**清理：**

| 文件 | 清理内容 |
|------|----------|
| `crates/types/src/types/mod.rs` | 移除 `pub mod agent;`/`pub mod model;`/`pub mod conversation;`/`pub mod command;` 及对应 `pub use` |
| `crates/types/src/types/config.rs` | 移除 `ModelPreferences`/`ModelProviderPreference`/`ModelDefinition`/`ModelCapability`/`ModelTier`/`ModelCost`/`CustomProviderConfig`/`ModelProviderPreferencePatch` 及相关函数和测试 |

### 3.7 crates/kernel 文件

**删除：**

| 文件 | 说明 |
|------|------|
| `crates/kernel/src/command_risk.rs` | Command Risk 评估 |

**清理：**

| 文件 | 清理内容 |
|------|----------|
| `crates/kernel/src/config.rs` | 移除 `permission_types` 引用 |

### 3.8 Workspace Cargo.toml

清理 `ai-digital-life/Cargo.toml` 中的 `[workspace] members` 列表，移除已删 crate。

### 3.9 Frontend IPC 接口

| 文件 | 说明 |
|------|------|
| `frontend/src/shared/ipc/agent.ts` | Agent IPC 接口 |
| `frontend/src/shared/ipc/subagent.ts` | Sub-agent IPC 接口 |
| `frontend/src/shared/ipc/run-activity.ts` | Run Activity IPC 接口 |
| `frontend/src/shared/ipc/conversation.ts` | Conversation IPC 接口 |
| `frontend/src/shared/ipc/provider.ts` | Provider IPC 接口 |
| `frontend/src/shared/ipc/command.ts` | Command IPC 接口 |
| `frontend/src/shared/ipc/permission.ts` | Permission IPC 接口 |
| `frontend/src/shared/ipc/commands_config.ts` | 命令配置 IPC |
| `frontend/src/shared/ipc/compaction.ts` | Compaction IPC |
| `frontend/src/shared/ipc/custom_agent.ts` | Custom Agent IPC |
| `frontend/src/shared/ipc/session_fork.ts` | Session Fork IPC |
| `frontend/src/shared/ipc/index.ts` | 清理：移除已删 IPC 模块的 export |

### 3.10 Frontend 类型定义

| 文件 | 说明 |
|------|------|
| `frontend/src/kernel/types-agent.ts` | Agent 类型定义 |
| `frontend/src/kernel/types-task.ts` | Task 类型定义 |
| `frontend/src/kernel/types-conversation.ts` | Conversation 类型定义 |
| `frontend/src/kernel/types-model.ts` | Model 类型定义 |
| `frontend/src/kernel/types-command.ts` | Command 类型定义 |

### 3.11 Frontend Stores 切片

| 文件 | 说明 |
|------|------|
| `frontend/src/app/stores/slices/agentSlice.ts` | Agent 状态切片 |
| `frontend/src/app/stores/slices/permissionSlice.ts` | 权限状态切片 |
| `frontend/src/app/stores/slices/compactionSlice.ts` | 压缩状态切片 |
| `frontend/src/app/stores/slices/partStreamSlice.ts` | Part Stream 切片 |
| `frontend/src/app/stores/slices/providerSlice.ts` | Provider 状态切片 |
| `frontend/src/app/stores/slices/commandSlice.ts` | Command 状态切片 |
| `frontend/src/app/stores/slices/customCommandSlice.ts` | 自定义命令切片 |
| `frontend/src/app/stores/sessionSelectors.ts` | Session 选择器 |
| `frontend/src/app/stores/conversationUtils.ts` | 会话工具函数 |

### 3.12 Frontend 组件

| 文件/目录 | 说明 |
|-----------|------|
| `frontend/src/app/components/agent/` | Agent 相关组件目录 |
| `frontend/src/app/components/AgentSelector.tsx` | Agent 选择器 |
| `frontend/src/app/components/PlanModeBanner.tsx` | Plan Mode 横幅 |
| `frontend/src/app/components/SubagentIndicator.tsx` | 子 Agent 指示器 |
| `frontend/src/app/components/Composer.tsx` | 消息输入组件 |
| `frontend/src/app/components/MessageBubble.tsx` | 消息气泡组件 |
| `frontend/src/app/components/MessageStream.tsx` | 消息流组件 |
| `frontend/src/app/components/PromptInput.tsx` | 输入框（含斜杠命令）|
| `frontend/src/app/components/ConfirmDialog.tsx` | 确认对话框 |
| `frontend/src/app/components/EnvironmentControls.tsx` | 环境控制组件 |
| `frontend/src/app/components/session/` | Session 相关组件 |
| `frontend/src/app/components/conversation/` | 会话相关组件目录 |
| `frontend/src/app/components/conversation/SlashCommandPopover.tsx` | 斜杠命令弹出框 |

### 3.13 Frontend 功能模块

| 目录 | 说明 |
|------|------|
| `frontend/src/app/features/session-fork/` | 会话 Fork 功能 |
| `frontend/src/app/features/part-stream/` | Part Stream 功能 |
| `frontend/src/app/features/conversation/` | 会话功能模块目录 |

### 3.14 Frontend 模型相关共享模块

| 文件 | 说明 |
|------|------|
| `frontend/src/shared/modelCatalog.ts` | 模型目录 |
| `frontend/src/shared/modelUtils.ts` | 模型工具函数 |
| `frontend/src/shared/providerSort.ts` | Provider 排序 |
| `frontend/src/app/components/models/` | 模型相关组件目录 |

### 3.15 Mock 数据

| 文件 | 说明 |
|------|------|
| `frontend/src/mock/mock-agent.ts` | Agent Mock |
| `frontend/src/mock/mock-command.ts` | Command Mock |
| `frontend/src/mock/mock-commands-config.ts` | Commands Config Mock |
| `frontend/src/mock/mock-conversation.ts` | Conversation Mock |
| `frontend/src/mock/mock-permission.ts` | Permission Mock |
| `frontend/src/mock/mock-provider.ts` | Provider Mock |
| `frontend/src/mock/mock-custom-agent.ts` | Custom Agent Mock |
| `frontend/src/mock/mock-run-activity.ts` | Run Activity Mock |
| `frontend/src/mock/mock-session-fork.ts` | Session Fork Mock |
| `frontend/src/mock/mock-compaction.ts` | Compaction Mock |

### 3.16 Preview Bridge

| 文件 | 说明 |
|------|------|
| `frontend/src/preview-bridge/preview-model.ts` | Preview Model 桥接 |
| `frontend/src/preview-bridge/preview-command.ts` | Preview Command 桥接 |
| `frontend/src/preview-bridge/preview-context.ts` | Preview Context 桥接 |
| `frontend/src/preview-bridge/preview-conversation.ts` | Preview Conversation 桥接 |
| `frontend/src/preview-bridge/preview-task.ts` | Preview Task 桥接 |

## 4. 执行顺序

一次性全删，按以下顺序操作：

1. **删除 Rust crate 目录**（7 个）
2. **删除/清理 Server 内部文件**（handler、engine、state、sse、tests）
3. **删除/清理 src-tauri 文件**
4. **清理 crates/tools**
5. **清理 crates/types**（删除类型文件 + 清理 mod.rs + 清理 config.rs）
6. **清理 crates/kernel**
7. **更新 workspace Cargo.toml**
8. **删除 Frontend IPC/types/stores/components/features/mock/preview-bridge**
9. **清理 Frontend 残留引用**（import/export）
10. **验证编译**（`cargo check --workspace` + `pnpm --dir frontend run typecheck`）

## 5. 风险评估

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| Server 编译失败 | 高 | 逐步清理 lib.rs/handlers/mod.rs 的 mod 声明 |
| Frontend 编译失败 | 中 | 逐个清理 import/export |
| Tauri 编译失败 | 高 | 清理 state.rs/setup.rs/commands/ |
| Workspace 成员引用 | 低 | 更新 Cargo.toml members |
| i18n key 残留 | 低 | 非阻塞，后续清理 |

## 6. 验证标准

- `cargo check --workspace` 通过
- `cargo clippy --workspace --all-targets` 无新增 warning
- `pnpm --dir frontend run typecheck` 通过
- `pnpm --dir frontend run lint` 无新增 error
