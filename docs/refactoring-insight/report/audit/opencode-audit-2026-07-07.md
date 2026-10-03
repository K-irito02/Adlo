# OpenCode 移植功能审计报告

**生成日期**: 2026-07-07
**审计范围**: Phase 2 全部 18 项参考实现对照功能（2-A ~ 2-E）
**审计方法**: 逐功能对比参考实现源码与项目实现

---

## 审计总览

| 域 | 后端状态 | 前端状态 | 发现缺陷数 |
|---|---------|---------|----------|
| 2-A Agent/Subagent/Plan | 功能完整 | UI 已实现 | 4 |
| 2-B Provider/MCP/SSE | 功能完整 | UI 已实现 | 6 |
| 2-C Compaction/Snapshot/WebTools | 功能完整 | 部分缺失 | 6 |
| 2-D Permission/Commands | 功能完整 | UI 已实现 | 2 |
| 2-E Fork/LSP/Plugin/Durable/... | 功能完整 | 全部未开始 | 5 |
| **合计** | | | **23** |

---

## 1. 架构与设计问题

### 1.1 Plan Mode `write` 工具自相矛盾

| 项目 | 值 |
|------|-----|
| 位置 | `crates/agent-runtime/src/plan_mode.rs:36-41` |
| 严重度 | 🔴 高 |
| 影响 | Plan Mode 功能实际不可用 |

**问题**: `is_tool_allowed_in_plan_mode()` 仅允许 `read | list_tree | search | outline | glob | grep | webfetch | websearch`，但系统提示词（第 50 行）明确指示 Agent "Write the plan to the plan file using the write tool"。`write` 不在白名单中，Agent 无法创建计划文件。

**参考实现对比**: 参考实现的 Plan agent 允许 `write` 工具专门用于写计划文件，其权限系统通过路径限制（仅允许写入 `.opencode/plans/` 目录）来约束。

**修复方向**: 将 `write` 加入 Plan Mode 白名单，并在 pipeline 中添加路径约束——仅允许写入计划文件路径。

---

### 1.2 SubagentPermission 不使用父 Agent 配置

| 项目 | 值 |
|------|-----|
| 位置 | `crates/subagent/src/permission.rs:7` |
| 严重度 | 🔴 高 |
| 影响 | 子代理权限继承机制失效 |

**问题**: `derive_subagent_permission(_parent, subagent)` 接收 `_parent` 参数但完全未使用（前缀 `_` 即标记为未使用）。函数仅设置 `allows_write_tools = false` 和 `mode = Subagent`，没有从父 Agent 继承任何权限规则（如允许的工具列表、deny 规则）。

**参考实现对比**: 参考实现的 `deriveSubagentSessionPermission` 会从父 session 的 permission ruleset 中提取子代理权限，子代理继承父级的 allow 规则但限制写入权限。

**修复方向**: 实际读取 `_parent` 的 permission ruleset，将父级的 allow 规则复制给子代理（但覆盖 write 为 deny）。

---

### 1.3 Compaction 阈值逻辑错误 — 永远不会触发

| 项目 | 值 |
|------|-----|
| 位置 | `crates/agent-runtime/src/compaction.rs:35` |
| 严重度 | 🔴 高 |
| 影响 | Compaction 功能实质上不会正常工作 |

**问题**: `compact_messages()` 用 `total_tokens < PRUNE_PROTECT`（40000）作为门控阈值。而 `token_counter.rs` 的 `needs_compaction()` 也用 `>= PRUNE_PROTECT`。但参考实现的设计是：
- `PRUNE_MINIMUM`（20000）: **触发** compaction 的最低阈值
- `PRUNE_PROTECT`（40000）: compaction 时要**保护**的 token 数量

即：当总 token >= 20000 时就应该开始 compaction，compaction 过程中保留最近 40000 token 不被裁剪。但当前实现把触发阈值设成了 40000，意味着需要更多 token 才能触发 compaction，且触发后保护区域与触发阈值相同，导致几乎没有内容可裁剪。

**参考实现对比**: `compaction.ts` 第 28-29 行明确定义 `PRUNE_MINIMUM = 20_000` 作为触发阈值，`PRUNE_PROTECT = 40_000` 作为保护区域。`needsCompaction` 用 `PRUNE_MINIMUM` 判断。

**修复方向**: 将 `compact_messages` 的门控改为 `PRUNE_MINIMUM`（20000），`PRUNE_PROTECT` 仅用于保留尾部消息的计算。

---

### 1.4 TokenCounter 完全忽略 provider 参数

| 项目 | 值 |
|------|-----|
| 位置 | `crates/agent-runtime/src/token_counter.rs:22` |
| 严重度 | 🟡 中 |
| 影响 | 跨 Provider 的 token 估算不准确 |

**问题**: `count(&self, text: &str, _provider: &str)` 接受 provider 参数但用 `_` 标记忽略。所有 Provider 共用同一个 `estimate_tokens` 估算函数，无法区分 tiktoken（OpenAI）、Anthropic tokenizer 等不同分词器。

**参考实现对比**: 参考实现使用 `@opencode-ai/core/token` 模块，根据 Provider 选择不同的 tokenizer（tiktoken for OpenAI, anthropic tokenizer for Anthropic 等）。

**修复方向**: 引入 `tokenizers` crate 支持不同 Provider 的分词器，至少在 Anthropic（BPE）和 OpenAI（tiktoken）之间区分。

---

### 1.5 Plugin Registry 全局单例 vs 参考实现的 InstanceState

| 项目 | 值 |
|------|-----|
| 位置 | `src-tauri/src/commands/plugin.rs` |
| 严重度 | 🟡 中 |
| 影响 | 多工作区间插件不隔离 |

**问题**: 插件注册表使用 `LazyLock<PluginRegistry>` 全局单例。这意味着所有打开的工作区共享同一套插件配置。

**参考实现对比**: 参考实现使用 `InstanceState`（per-directory ScopedCache），每个工作区有独立的插件实例和状态。

**修复方向**: 将 PluginRegistry 移入 AppState 作为 per-workspace 实例，或在 PluginRegistry 中添加 workspace_id 维度的隔离。

---

### 1.6 Plugin `fire_hook` 的 Modify 语义错误

| 项目 | 值 |
|------|-----|
| 位置 | `crates/agent-runtime/src/plugins/registry.rs:74-79` |
| 严重度 | 🟡 中 |
| 影响 | 多插件修改互相覆盖 |

**问题**: `fire_hook()` 中当多个插件返回 `HookResult::Modify(val)` 时，后面的直接覆盖前面的（`result = HookResult::Modify(val)`）。

**参考实现对比**: 参考实现的 `trigger()` 方法将 `(input, output)` 传递给每个 hook，允许链式修改——每个插件基于上一个插件的输出来修改。

**修复方向**: 让 `Modify` 结果作为下一个插件的输入传递，实现链式 transform。

---

### 1.7 Provider `fallback.rs:default_model` 对未知 Provider 返回 "unknown"

| 项目 | 值 |
|------|-----|
| 位置 | `crates/model-gateway/src/fallback.rs:5-11` |
| 严重度 | 🟡 中 |
| 影响 | 自定义 Provider 的 fallback 会失败 |

**问题**: `default_model()` 仅匹配 `"deepseek"` 和 `"minimax"`，其他所有 Provider（包括已注册的 OpenAI、Anthropic、Google、Ollama、OpenRouter 以及自定义 Provider）都返回 `"unknown"`，导致 fallback 响应使用无效模型 ID。

**修复方向**: 从 ProviderRegistry 查询对应 Provider 的第一个模型作为 fallback，或在 ProviderDefinition 中添加 `default_model` 字段。

---

## 2. WebFetch / WebSearch 与参考实现的显著差距

### 2.1 WebFetch 能力严重不足

| 项目 | 值 |
|------|-----|
| 位置 | `crates/agent-runtime/src/tools/webfetch.rs` |
| 严重度 | 🔴 高 |
| 影响 | WebFetch 工具的实用性极低 |

| 能力 | 参考实现 | 项目 | 差距 |
|------|---------|------|------|
| 响应大小限制 | 5MB | 50KB | 100倍 |
| 默认超时 | 30s（最大 120s） | 10s（硬编码） | 过短 |
| HTML→Markdown 转换 | TurndownService | 无 | 缺失 |
| HTML→text 提取 | htmlparser2 | 无 | 缺失 |
| 格式选择 | text/markdown/html | 无（原始文本） | 缺失 |
| Cloudflare 反爬检测 | 403 时重试带诚实 UA | 无 | 缺失 |
| 权限检查 | `ctx.ask({ permission: "webfetch" })` | 无 | 缺失 |
| 图片处理 | base64 编码为附件 | 无 | 缺失 |

**修复方向**: 按优先级依次补齐：(1) 增大限制到 5MB，(2) 增加 HTML→Markdown 转换（`readability` crate + `pulldown-cmark`），(3) 添加权限检查集成，(4) Cloudflare 重试逻辑。

---

### 2.2 WebSearch 仅支持单一 Provider

| 项目 | 值 |
|------|-----|
| 位置 | `crates/agent-runtime/src/tools/websearch.rs` |
| 严重度 | 🟡 中 |
| 影响 | 搜索可靠性不足 |

| 能力 | 参考实现 | 项目 |
|------|---------|------|
| Provider | Exa + Parallel（双 Provider） | 仅 Tavily |
| Provider 选择 | session hash mod 2 | 无 |
| 结果数量配置 | 可配置 numResults | 硬编码 10 |
| 搜索深度 | basic/advanced 可选 | 硬编码 basic |
| livecrawl | 支持 | 不支持 |

**修复方向**: 抽象 SearchProvider trait，支持多 Provider 注册和路由。

---

## 3. MCP 客户端缺陷

### 3.1 SSE 与 StreamableHTTP 未区分

| 项目 | 值 |
|------|-----|
| 位置 | `crates/mcp-client/src/client.rs:78` |
| 严重度 | 🟡 中 |
| 影响 | 旧版 SSE 服务器可能无法连接 |

**问题**: `McpTransportType::Sse | McpTransportType::StreamableHttp` 两种传输类型都映射到 `StreamableHttpClientTransport`。旧版 MCP 服务器仅支持 SSE（Server-Sent Events over GET），不支持 StreamableHTTP（POST-based），这会导致连接失败。

**修复方向**: 引入独立的 `SseClientTransport` 用于 `Sse` 类型，或确认 `rmcp` 的 `StreamableHttpClientTransport` 是否已包含 SSE 降级支持。

### 3.2 MCP OAuth 流程未实现

| 项目 | 值 |
|------|-----|
| 位置 | `crates/mcp-client/src/oauth.rs`（如果存在） |
| 严重度 | 🟡 中 |
| 影响 | 需要认证的远程 MCP 服务器无法使用 |

**参考实现对比**: 参考实现实现了完整的 OAuth 流程：动态客户端注册 → 授权码获取 → 回调处理 → token 存储和刷新。项目的 `McpServerConfig` 有 `oauth: bool` 字段但未见实际 OAuth 流程实现。

### 3.3 MCP 缺少重连和通知处理

| 项目 | 值 |
|------|-----|
| 位置 | `crates/mcp-client/src/client.rs` |
| 严重度 | 🟡 中 |
| 影响 | 服务器断连后工具列表不更新 |

**参考实现对比**: 参考实现处理 `ToolListChangedNotificationSchema` 通知，自动重新发现工具。项目无此机制。

---

## 4. 后端实现缺陷

### 4.1 AgentRegistry.register 静默覆盖

| 项目 | 值 |
|------|-----|
| 位置 | `crates/agent-runtime/src/registry.rs:35-37` |
| 严重度 | 🟢 低 |

`register()` 直接 `HashMap::insert`，同名 AgentId 会被静默覆盖。应至少记录警告或返回 Result 指示覆盖。

### 4.2 SubagentManager.update_status 静默 no-op

| 项目 | 值 |
|------|-----|
| 位置 | `crates/subagent/src/manager.rs:82-89` |
| 严重度 | 🟡 中 |

`update_status()` 对不存在的 ID 静默忽略（`if let Some(task) = ...`），应返回 `Result<(), Error>` 以便调用方感知更新失败。

### 4.3 DurableSession 全面吞掉错误

| 项目 | 值 |
|------|-----|
| 位置 | `crates/agent-runtime/src/durable.rs:47-85` |
| 严重度 | 🟡 中 |

`register_session`、`heartbeat`、`checkpoint`、`complete`、`fail` 全部使用 `let _ = self.db.execute(...)` 静默丢弃 SQL 错误。`find_crashed_sessions` 和 `start_recovery` 使用 `match ... { _ => return vec![]/false }` 模式吞掉所有数据库错误。在生产环境中，这意味着崩溃恢复机制可能静默失效。

### 4.4 Session Fork 标题继承问题

| 项目 | 值 |
|------|-----|
| 位置 | `crates/conversation/src/fork.rs:10` |
| 严重度 | 🟢 低 |

`format!("{} (fork #{})", parent_session.title, fork_number)` 当 parent 标题为空时会生成 `"(fork #1)"` 这样的孤立标题。应处理空标题情况。

### 4.5 Compaction 缺少 Context Epoch 管理

| 项目 | 值 |
|------|-----|
| 位置 | `crates/agent-runtime/src/compaction.rs` |
| 严重度 | 🟡 中 |

参考实现在 compaction 完成后启动新的 Context Epoch（新的 Baseline System Context），确保后续对话不受旧上下文影响。项目实现没有此机制，compaction 后旧的 system context 仍然保留。

### 4.6 Agent Router /plan 匹配 — 实际已修复

| 项目 | 值 |
|------|-----|
| 位置 | `crates/agent-runtime/src/router.rs:19-20` |
| 严重度 | ✅ 已修复 |

`trimmed == "/plan" || trimmed.starts_with("/plan ")` — 此模式已正确排除 `/planner`、`/planning` 等。测试 `planning_does_not_trigger_plan_mode` 也验证了这一点。之前记录的 "prefix matching also matches /planner" 问题已在此版本中修复。

---

## 5. 前端差距分析

### 5.1 桥接层一致性 ✅

三个桥接层（Tauri / Mock / Preview）对 Phase 2 功能的接口定义一致：
- Tauri bridge: 全部通过 `invokeIpc` 调用真实后端
- Mock bridge: 返回模拟数据
- Preview bridge: 对 2-E 功能委托到 mock bridge（snapshot/webTools/compaction/sessionFork/lsp/plugin/reference/durable 均用 mock）

接口契约（`satisfies *Bridge`）保证编译期类型一致，无遗漏方法。

### 5.2 Store/Action 链完整性

| 功能 | Store Slice | Actions | UI 组件 | 状态 |
|------|-----------|---------|---------|------|
| Compaction | ✅ compactionSlice | ✅ compactionActions | ❌ 无触发 UI | 断裂 |
| Snapshot/Revert | ❌ 无独立 slice | ✅ snapshotActions | ⚠️ RevertButton（仅 Tauri） | 不完整 |
| WebFetch/WebSearch | ✅ webToolsSlice | ✅ webToolsActions | ❌ 无结果展示 UI | 断裂 |
| Session Fork | ❌ 无独立 slice | ✅ sessionForkActions | ❌ 无 UI | 缺失 |
| LSP | ❌ 无独立 slice | ✅ lspActions | ❌ 无 UI | 缺失 |
| Plugin | ❌ 无独立 slice | ✅ pluginActions | ❌ 无 UI | 缺失 |
| Reference | ❌ 无独立 slice | ✅ referenceActions | ❌ 无 UI | 缺失 |
| Durable | ❌ 无独立 slice | ✅ durableActions | ❌ 无 UI | 缺失 |
| Custom Agent | ❌ 无独立 slice | ✅ customAgentActions | ✅ CustomAgentManager | 部分 |

### 5.3 功能间关联性缺陷

1. **Compaction 与 Plan Mode 的冲突**: Plan Mode 限制工具集，但 compaction 是由 agent pipeline 自动触发的（非用户操作），如果 Agent 处于 Plan Mode 期间触发了 compaction，LLM 摘要生成可能需要写工具。
2. **Snapshot 与 Compaction 的时序**: compaction 会删除消息，但 snapshot 是基于消息 ID 的。如果 compaction 后尝试 revert 到 compaction 前的 snapshot，消息已不存在。
3. **Session Fork 与 Snapshot 的交叉**: fork 后的子 session 共享父 session 的消息历史（截止到 fork 点），如果父 session 做了 snapshot revert，子 session 的状态不受影响。

---

## 6. 优先级汇总

### 🔴 高优先级（功能正确性影响）

| # | 问题 | 影响范围 | 预估工作量 |
|---|------|---------|----------|
| 1 | Plan Mode `write` 工具不在白名单 | Plan Mode 完全不可用 | 小（加白名单 + 路径约束） |
| 2 | Compaction 阈值逻辑错误（PRUNE_PROTECT 当 PRUNE_MINIMUM 用） | Compaction 不会正常触发 | 中（需重设计算法） |
| 3 | SubagentPermission 不使用父 Agent 配置 | 子代理权限继承失效 | 中（需重新设计函数） |
| 4 | WebFetch 能力严重不足（50KB 限制、无 HTML 转换） | WebFetch 工具实用性低 | 大（需多模块改造） |

### 🟡 中优先级（架构合理性 / 可靠性）

| # | 问题 | 影响范围 | 预估工作量 |
|---|------|---------|----------|
| 5 | TokenCounter 忽略 provider（统一估算） | 跨 Provider token 计算不准 | 中 |
| 6 | DurableSession 全面吞错误 | 崩溃恢复可能静默失败 | 小 |
| 7 | MCP SSE vs StreamableHTTP 未区分 | 旧版 SSE 服务器可能无法连接 | 小 |
| 8 | MCP 缺少重连和通知处理 | 断连后工具列表不更新 | 中 |
| 9 | MCP OAuth 未实现 | 认证的远程 MCP 不可用 | 大 |
| 10 | Plugin Registry 全局单例 | 多工作区插件不隔离 | 中 |
| 11 | Plugin fire_hook Modify 语义 | 多插件互相覆盖 | 小 |
| 12 | fallback.rs default_model "unknown" | 自定义 Provider fallback 失败 | 小 |
| 13 | SubagentManager.update_status 静默 no-op | 无法感知更新失败 | 小 |
| 14 | Compaction 缺少 Context Epoch | 旧上下文残留 | 中 |
| 15 | WebSearch 仅 Tavily 单 Provider | 搜索可靠性不足 | 中 |

### 🟢 低优先级（代码质量）

| # | 问题 | 预估工作量 |
|---|------|----------|
| 16 | AgentRegistry.register 静默覆盖 | 小 |
| 17 | Session Fork 空标题处理 | 小 |

---

## 7. 修复建议分组

### 组 A: 核心功能修复（后端，独立）

修复 Plan Mode、Compaction 阈值、SubagentPermission 三个高优先级后端缺陷。这些是功能正确性问题，修复后可立即提升 Phase 2 功能的实际可用性。

### 组 B: WebTools 增强（后端，独立）

WebFetch 大改造（增大限制、HTML→Markdown、Cloudflare 重试）+ WebSearch 多 Provider 抽象。这需要引入新依赖（`readability`/`pulldown-cmark`/`html2text` crate），工作量较大。

### 组 C: MCP 完善（后端，独立）

SSE 传输区分、重连机制、ToolListChanged 通知处理、OAuth 流程实现。

### 组 D: 可靠性与架构改进（后端，独立）

DurableSession 错误处理、Plugin Registry 工作区隔离、Plugin fire_hook 链式修改、TokenCounter provider-aware、fallback.rs 默认模型。

### 组 E: 前端 UI 补齐（前端，依赖组 A-D）

按功能重要性排序：WebFetch/WebSearch 结果展示 > Compaction UI > Snapshot/Revert UI > Session Fork UI > LSP UI > Plugin UI > Reference UI > Durable UI。

---

## 8. 参考实现 V2 架构差异说明

参考实现当前已进入 V2 Session 架构（durable prompt admission + process-local drains + Context Epoch + System Context algebra），这是一个根本性的架构演进。项目当前仍基于 V1 风格的直接 session loop 模型。以下 V2 概念在项目中没有对应物：

- **Durable prompt admission**: 输入先持久化再调度执行（项目是直接执行）
- **Session Run Coordinator**: 进程级执行序列化 + wake 合并（项目无此机制）
- **Context Epoch**: compaction 后的上下文新纪元（项目无此概念）
- **System Context algebra**: 独立可刷新的类型化上下文源（项目的 system prompt 是单次拼接）
- **EventV2 replay**: 持久化事件流用于重放（项目无事件溯源）

这些是远期架构方向，不在本次修复范围内，但值得在未来 Phase 3 中规划。
