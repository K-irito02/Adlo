# Agent 残留全量清除设计（Design Spec）

> 日期：2026-09-05
> 状态：已评审设计（待复核书面 spec）
> 前置：`2026-09-03-dsh-strip-deletion-design.md`（7 主 crate 已删）、`2026-09-05-dsh-host-shell-design.md`（纯宿主壳方向）
> 方式：一次性全删 Big-Bang（Architectural 路径，设计已分节确认 ①②③④⑤ 全 OK）

***

## 0. 背景与目标

**背景**：AI Digital Life 正转型为“以 dsh（DeepSeek Harness）为灵魂的纯宿主壳”。7 个主 crate（`agent-runtime / subagent / task / conversation / context / model-gateway / command`）已按 09-03 spec 删除，`ai-digital-life/Cargo.toml`、`crates/server/src/handlers/*`、`src-tauri/src/commands/*` 已干净。dsh 宿主接入（`webapp-host / dsh-version / server dsh handler / features/dsh / CenterPane dsh 占位`）已落地。

**目标**：删除项目中所有与 agent 相关的残留功能代码。项目自身不实现、也不准备实现 agent 相关内容；agent 能力由 dsh 内置或实现。宿主只做两件事：a) 拉起 dsh 进程（空闲端口），b) 把 dsh URL 显示在中间区（浏览器模式 iframe / Tauri 模式独立 WebView2 + 避让）。

**用户已确认决策**：

1. 删除范围 = 全量残留清除（残留会话/模型/任务/权限/命令/压缩/分支等类型、存储表、事件、mock、i18n、generated 类型全部清除，仅保留宿主壳必需）。
2. `mcp-client / lsp-client / tools / commandRegistry` 全删（dsh 自带实现，宿主不保留）。
3. DB 表（`agent_runs / agent_steps / conversation_messages / sessions` 相关）直接删除，含迁移与测试数据，不做数据兼容。
4. 验收 = `cargo check + clippy + 前端 typecheck + lint + Rust/前端测试` 全过（删对应用例后）。

***

## 1. 架构（删后终态）

Rust 保留：`types（瘦身后） / kernel（瘦身后） / storage（去会话表） / server（仅 dsh / workspace / workspace_git / workspace_sidebar / workspace_git_vis / snapshot / patch / reference（去 context 引用） / retrieval / ci / clipboard / durable / health / lsp（宿主 LSP 直连，若判定为 agent 专属则随 lsp-client 一并删除，见 2.3） / mcp（若为 dsh 前置则删除，见 2.3） / system_monitor / web_tools / commands_config（若为 agent 命令配置则删除，见 2.3）） / webapp-host / dsh-version / workspace / pty / browser / change-engine / fs-ops / outline / ci-status / credential / clipboard / sysmon / adl-logging / migration / errors` + `src-tauri（去 provider，已完成）`。

前端保留：浏览器 / 终端 / 工作区 / 编辑器-补丁 / Git / 设置宿主部分 / dsh 宿主区 / 桥接基建 / i18n 宿主部分。中间区固定为 dsh（打开 = dsh 铺满 / 关闭 = 欢迎引导页），不留 conversation 面板入口。

宿主与 dsh 边界：仅“拉进程 + 开 URL”，不 import、不触达、不改动 dsh 内部（模型/工具/会话/插件/更新 UI）。dsh 升版本、API 变化，只要仍可“起进程 + 开 URL”，宿主零影响。

***

## 2. 组件与删除清单

### 2.1 Rust 类型与存储

| 位置 | 删除内容 | 说明 |
|------|----------|------|
| `crates/types/src/types/conversation.rs` | 整文件删除 | `ConversationSessionRecord / ConversationMessageRecord / ConversationRole / ConversationScenario / ConversationBlock / ConversationDetail / PlanConversationItem`（含 Subagent 变体） |
| `crates/types/src/types/patch_types.rs` | 删除 Agent 段 | `AgentId / AgentRunStatus / AgentPlanStep` 及引用 `conversation::{ConversationScenario, DiagnosticSummary, RiskLevel}` 的 agent 相关部分；保留纯补丁结构 |
| `crates/types/src/types/commands.rs` | 整文件删除或去 Agent 化 | `AgentId / default_agent_id / subtask` 语义；若文件仅服务 agent 则整文件删除 |
| `crates/types/src/types/config.rs` | 删除模型偏好段 | `ModelPreferences / ModelProviderPreference / ModelDefinition / ModelCapability / ModelTier / ModelCost / CustomProviderConfig / ModelProviderPreferencePatch` 及相关函数与测试 |
| `crates/types/src/types/mod.rs` | 清理 `pub mod / pub use` | 移除 `agent / model / conversation / command` 及 `permission_types`（若属 agent） |
| `crates/types/src/permission_types.rs` | 整文件删除（若仅服务 agent 权限链） | `PermissionDecision / PermissionRule` 等；`kernel/config.rs` 同步去引用 |
| `crates/storage/src/session_crud.rs` | 整文件删除 | `save_session / load_session / list_sessions`（`ConversationSessionRecord` 依赖） |
| `crates/storage/src/crud.rs` | 删除 agent/会话测试与代码 | `AgentRunRecord / AgentRunStatus / AgentPlanStep / ConversationSessionRecord / ConversationMessageRecord / ConversationBlock` 相关 CRUD 与测试 |
| `crates/storage/src/entity_table.rs` | 删除三表映射 | `ConversationMessages / AgentRuns / AgentSteps` |
| `crates/storage/src/purge.rs` | 删除三表 | 与 `entity_table` 同步 |
| `crates/storage/src/lib.rs` | 清理表名引用 | `"conversation_messages"` 等 |
| 迁移（`crates/migration` 与 `storage` 内迁移） | 删除建表迁移 | `agent_runs / agent_steps / conversation_messages / sessions` 建表语句与配套测试数据；不写数据兼容迁移（未发布阶段治理禁令） |

### 2.2 Rust 内核与工具类 crate

| 位置 | 删除内容 | 说明 |
|------|----------|------|
| `crates/kernel/src/events.rs` | 删除 `AgentRunChanged` | 含 `"agent.run-changed"` 映射 |
| `crates/kernel/src/config.rs` | 去 `permission_types` 引用 | 与 types 侧同步 |
| `crates/kernel/src/command_risk.rs` | 整文件删除（若残留） | Command Risk 评估 |
| `crates/tools` | 整个 crate 删除 | `write / edit / bash / apply_patch` 头注释自述“consumed by Agent Loop”；宿主编辑器走 `change-engine / fs-ops`，不依赖它；`Cargo.toml` workspace members 同步移除 |
| `crates/mcp-client` | 整个 crate 删除 | `AgentToolAdapter` 等；`server/handlers/mcp.rs` 若仅服务 agent 则一并删除，否则去 agent 引用后保留宿主直连（以 2.3 判定为准） |
| `crates/lsp-client` | 整个 crate 删除 | 用户已确认全删；`server/handlers/lsp.rs` 同上处理 |
| `crates/server` 残留引用 | 清理 | `handlers/patch.rs` 的 `mark_applying / mark_verifying / complete_after_patch`（若残留）、`handlers/reference.rs` 的 `references_prompt / validate_reference`（context 引用，若残留）；`handlers/mod.rs / lib.rs / Cargo.toml` 同步清理 |
| `ai-digital-life/Cargo.toml` | 清理 members | 移除 `tools / mcp-client / lsp-client`（7 主 crate 已移除，本次追加三者） |
| `ai-digital-life/.cargo/config.toml` | 清理白名单 | 删除 `adl-agent-runtime / adl-command / adl-context / adl-conversation / adl-model-gateway / adl-subagent / adl-task` 7 节；追加删除 `adl-tools / adl-mcp-client / adl-lsp-client` 3 节（若存在） |

### 2.3 待实现时二判定的 handler（实现阶段按“全删”默认执行，遇宿主直连则收窄）

- `server/handlers/mcp.rs`、`server/handlers/lsp.rs`、`server/handlers/commands_config.rs`：默认随 `mcp-client / lsp-client / commandRegistry` 全删；仅当证实其服务宿主原生能力（非 agent 循环调用）时，才改为“去 agent 引用后保留”，并在实现记录中说明保留理由与调用链证据。

### 2.4 前端类型、IPC 与状态

| 位置 | 删除内容 | 说明 |
|------|----------|------|
| `frontend/src/shared/ipc/generated/SubagentTask.ts / SubagentStatus.ts / SubagentId.ts / AgentMode.ts / AgentConfig.ts / TaskToolInput.ts` | 删除（ts-rs 源删后连带消失，手删兜底） | 不手改生成器输出，删 Rust `TS` 导出即自动消除；手删仅用于源删后残留文件 |
| `frontend/src/kernel/types-legacy.ts` | 删除会话段 | Conversation Blocks / Sessions / Messages 段 |
| `frontend/src/kernel/types-agent.ts / types-task.ts / types-conversation.ts / types-model.ts / types-command.ts` | 删除（若残留） | 按 09-03 清单收尾 |
| `frontend/src/shared/ipc/agent.ts / subagent.ts / run-activity.ts / conversation.ts / provider.ts / command.ts / permission.ts / commands_config.ts / compaction.ts / custom_agent.ts / session_fork.ts` | 删除（若残留） | 含 `shared/ipc/index.ts` 的 export 清理 |
| `frontend/src/app/commands/commandRegistry.ts(+test)` | 删除 | 含引用方清理 |
| `frontend/src/app/stores/slices/agentSlice / permissionSlice / compactionSlice / partStreamSlice / providerSlice / commandSlice / customCommandSlice` 及 `sessionSelectors.ts / conversationUtils.ts` | 删除（若残留） | 含 `slicedStore.ts / StoreState.ts` 注册清理 |
| `frontend/src/app/stores/actions` 内会话 action | 删除（若残留） | 与 slice 同步 |

### 2.5 前端组件、mock、桥接、i18n、样式

| 位置 | 删除内容 | 说明 |
|------|----------|------|
| `frontend/src/app/components/agent/ / AgentSelector.tsx / PlanModeBanner.tsx / SubagentIndicator.tsx / Composer.tsx / MessageBubble.tsx / MessageStream.tsx / PromptInput.tsx / ConfirmDialog.tsx / EnvironmentControls.tsx / session/ / conversation/(SlashCommandPopover) / models/` | 删除（若残留） | 按 09-03 清单收尾 |
| `frontend/src/app/features/session-fork/ / part-stream/ / conversation/` | 删除（若残留） | 同上 |
| `frontend/src/mock/mock-agent.ts / mock-command.ts / mock-commands-config.ts / mock-conversation.ts / mock-permission.ts / mock-provider.ts / mock-custom-agent.ts / mock-run-activity.ts / mock-session-fork.ts / mock-compaction.ts / mock-shared-conversation.ts` | 删除 | 含 `mock-shared.ts / mock-shared-patch.ts` 的 import 清理、`generalActions.test.ts` 的 `conversation:` 夹具清理 |
| `frontend/src/preview-bridge/preview-model.ts / preview-command.ts / preview-context.ts / preview-conversation.ts / preview-task.ts` | 删除（若残留） | 双端一致性：`tauri-bridge / preview-bridge / mock-bridge` 三实现同步裁剪对应 domain |
| `frontend/src/app/i18n/zh-CN+en-US/conversation.ts / agent.ts / provider.ts / permission.ts / commands.ts / sessionFork.ts` | 删除 | 含 `i18n/*/index.ts` 的 import/spread 清理、`common.ts` 的 `conversationMessageStream / conversationStatus / resizeConversation` key 清理、`workspace.ts` 的 `conversations / conversationEmpty / sessionMenuExport` 清理、`keys.test.ts` 的 conversation 域断言清理；全 UI 文案保持 i18n key（禁硬编码治理） |
| `frontend/src/styles/part-stream.css(+test)` | 删除 | 含引用方清理 |
| `frontend/src/app/regions/right-panel/editor-support/agentDecorations.ts` | 删除 | 含引用方清理 |
| `frontend/src/app/regions/left-sidebar/ResizeHandle.tsx(+utils)` | 去 conversation 化 | `conversationPanelHeight / conversationResizeCleanupRef / CONVERSATION_PANEL_HEIGHT_KEY / adl-leftbar__conversation-resize` 改为 dsh 语义或删除（以 dsh 宿主区布局为准） |
| `frontend/src/app/regions/CenterPane.tsx` | 去 conversation 化 | `aria-label={t.conversation}` 改为 dsh key；中间区固定为 dsh（打开 = dsh 铺满 / 关闭 = 欢迎引导页） |
| `frontend/src/shared/modelCatalog.ts / modelUtils.ts / providerSort.ts` | 删除（若残留） | 模型目录/工具/排序 |

***

## 3. 数据流与执行顺序

一次性全删，按逆依赖序执行：

1. Rust 底层：`types`（2.1）→ `storage`（2.1，含迁移）→ `kernel`（2.2）。
2. 工具类 crate：`tools / mcp-client / lsp-client` 整目录删除（2.2）。
3. `server` 残留引用清理 + `src-tauri` 复查（provider 已删，本次只做残留复查）。
4. `Cargo.toml` members + `.cargo/config.toml` 白名单清理。
5. 前端：`generated / kernel-types / shared/ipc` → `commands/commandRegistry` → `stores/slices+actions` → `components/features` → `mock/preview-bridge(+tauri-bridge/mock-bridge 对应 domain)` → `i18n` → `styles` → `CenterPane/ResizeHandle` dsh 化。
6. 验证：`cargo check --workspace` → `cargo clippy --workspace --all-targets` → `cargo test --workspace` → `pnpm --dir frontend run typecheck(lint: tsc --noEmit)` → `pnpm --dir frontend run lint` → `pnpm --dir frontend run test`。

`generated/*.ts` 不手改生成器：删 Rust `#[derive(TS)]` 导出即自动消除，手删仅作源删后残留兜底。`shared/ipc/index`、`slicedStore/StoreState` 的 export/slice 注册与删除同步裁剪。DB 表删除不写数据兼容迁移。

***

## 4. 错误处理

不加防御性代码与预防措施。删出的编译错误按第 3 节验证链顺序修复；迁移失败直接删除对应迁移与测试数据，不做旧版本兼容（未发布阶段治理禁令：禁止数据格式兼容/旧版本迁移代码，禁止向后兼容重导出）。问题排查先定位根本原因，必要时使用调试日志收起器与复制调试日志按钮，禁止凭空猜测。

***

## 5. 测试与验收

- `cargo check --workspace` 通过。
- `cargo clippy --workspace --all-targets -- -D warnings` 零警告（以 `ai-digital-life/AGENTS.md` 质量门为准）。
- `pnpm --dir frontend run lint` 零 error、`tsc --noEmit`（`typecheck`）通过。
- `cargo test --workspace` 与 `pnpm --dir frontend run test` 在删对应用例后全过（基线约 629 Rust / 1260 前端，最新计数以实际运行为准）。
- 新增残留断言：`agent-runtime|model-gateway|conversation|subagent|AgentRun|ConversationSession|AgentToolAdapter|commandRegistry|mock-shared-conversation` 在 `crates/ src-tauri/ frontend/src/` 零引用（注释/文档豁免项在实现记录中列明）。
- dsh 宿主验收不受影响：中间区打开 = dsh 铺满、关闭 = 欢迎引导页；浏览器 iframe 与 Tauri WebView2（`browser-remote.json` 最小权限）行为不变；版本管理（查更新/升级/回退/卸载/重装/重启）可用。

***

## 6. 风险与边界

| 风险 | 缓解 |
|------|------|
| 单次 diff 大、编译错误集中 | 严格按第 3 节逆依赖序删除，每步后即跑 `cargo check` 与 `tsc --noEmit`，不攒到最后 |
| `mcp/lsp/commands_config` handler 误删宿主直连 | 实现阶段先查调用链，按 2.3 二判定执行并记录证据 |
| i18n key 误删宿主文案 | 仅删 2.5 所列 agent 域 key，`keys.test.ts` 同步更新，lint/typecheck 兜底 |
| 双端不一致 | 三桥（`tauri-bridge / preview-bridge / mock-bridge`）同 domain 同步裁剪 |

**保留边界**：浏览器面板、终端（PTY）、工作区管理、编辑器/补丁系统（`change-engine / fs-ops`）、Git 可视化、设置宿主部分、i18n 宿主部分、Tauri 桌面壳层、dsh 宿主（`webapp-host / dsh-version / server dsh handler / features/dsh / 桥接 dsh domain`）、双端桥接基建。删除不得破坏上述保留功能。

**非目标**：dsh 版本源地址、版本目录存储格式、就绪探测超时重试、欢迎页/关闭对话框视觉细节（属 dsh 宿主 spec 范畴，本 spec 不展开）。
