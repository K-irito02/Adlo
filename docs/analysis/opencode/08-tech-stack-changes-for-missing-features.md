# 补齐缺失能力所需的技术栈变更分析

> 生成日期：2026-07-05
> 前置文档：[07-missing-features-opencode-has.md](./07-missing-features-opencode-has.md)（缺失能力清单）
> 本文目的：逐项分析每项「应补齐」缺失能力是否需要修改/新增/更新技术栈、第三方库、依赖，并提供多方案对比

---

## 一、总体评估

| 类别 | 数量 | 需要新增依赖 | 仅架构变更 | 仅配置扩展 |
|------|------|-------------|-----------|-----------|
| P0（必须） | 3 | 1 项（MCP） | 1 项（多 Agent） | 0 |
| P1（重要） | 8 | 2 项（Compaction、WebFetch 可选） | 4 项 | 2 项 |
| P2（后续） | 7 | 1 项（LSP） | 5 项 | 1 项 |
| **合计** | **18** | **4 项需新增依赖** | **10 项纯架构/代码 + 1 项新建 crate** | **3 项纯配置** |

**核心结论**：绝大多数缺失能力**不需要引入重量级新框架**，现有技术栈（Rust + Tauri + React + Zustand + SQLite + reqwest）足够支撑。仅需新增 **3 个核心 Rust crate**（`rmcp`、`rmcp-macros`、`tokenizers`），其余为可选或 P2 后续。

---

## 二、实施约束

| 约束 | 说明 |
|------|------|
| **参考 OpenCode 源码** | 具体实现时优先参考 `references/opencode/` 下 OpenCode 源码，学习其设计模式与实现细节 |
| **不迁就旧代码** | 若本项目现有设计存在缺陷或与优秀方案冲突，可删除重构，不强制兼容 |
| **采用优秀设计** | 方案选择以架构合理性、可维护性、扩展性为优先，而非与现有代码的最小差异 |

---

## 三、P0 必须项技术方案分析

### 3.1 多 Agent 系统

| 维度 | 说明 |
|------|------|
| **是否需要新依赖** | ❌ 不需要 |
| **变更类型** | 架构变更 + 代码重构 |
| **涉及模块** | `crates/agent-runtime/`、`crates/model-gateway/`、`frontend/src/app/stores/slices/` |

**方案对比**：

| 方案 | 描述 | 优点 | 缺点 | 推荐 |
|------|------|------|------|------|
| **A: 自研（推荐）** | 扩展现有 `agent-runtime` crate，增加 Agent 类型注册表 + Agent 配置（name/mode/model/prompt/permission）+ 路由逻辑 | 完全可控、无外部依赖、与现有架构无缝集成、按需设计 | 需要自行设计 Agent 生命周期 | ✅ |
| B: 引入 OpenFang | 集成 `openfang` Rust Agent OS 框架（14 crate、137K 行代码） | 功能完善、生产级稳定性 | 太重（40MB 空闲内存不是瓶颈但引入大量无关代码）、与现有架构冲突、学习成本高 | ❌ |
| C: 引入 Rig | 集成 `rig-core` Rust LLM Agent 框架 | 有 Agent 抽象 | 与现有 `model-gateway` 冲突、需要大量适配 | ❌ |

**推荐方案 A 的实现要点**：

```
agent-runtime/
├── agent.rs          # Agent 定义（name/mode/model/prompt/permission）
├── registry.rs       # Agent 注册表（内置 + 自定义）
├── router.rs         # 路由逻辑（根据用户输入选择 Agent）
├── lifecycle.rs      # Agent 生命周期（spawn/run/complete/abort）
└── prompt.rs         # Agent-specific prompt 模板
```

**注意事项**：
- Agent 模式（primary/subagent）的权限隔离必须在 `agent-runtime` 层面实现
- 与现有 `task` crate 的审批流程解耦，Agent 切换不触发新的审批
- 前端需要新增 Agent 选择器 UI 组件（`components/agent/AgentSelector`）

---

### 3.2 Sub-agent / Task 工具

| 维度 | 说明 |
|------|------|
| **是否需要新依赖** | ❌ 不需要 |
| **变更类型** | 架构变更 + 代码扩展 |
| **涉及模块** | 新建 `crates/subagent/`、`crates/agent-runtime/`、`src-tauri/src/commands/agent.rs` |

**方案对比**：

| 方案 | 描述 | 优点 | 缺点 | 推荐 |
|------|------|------|------|------|
| A: 扩展 task crate | 在现有 `crates/task/` 基础上增加 `TaskMode::Background`、`TaskMode::Subagent`，复用现有审批流程 | 最小改动、复用现有基础设施 | 需要区分主 Agent 和 Sub-agent 的会话上下文，耦合度高 | ❌ |
| **B: 独立 subagent crate（已选）** | 新建 `crates/subagent/` 独立管理，可删除现有 `crates/task/` 中过时的旧代码 | 隔离性好、职责清晰、便于独立演进、可删除旧代码 | 增加 crate 数量 | ✅ |

**方案 B 的实现要点**：
- 新建 `crates/subagent/` crate，独立管理 Sub-agent 生命周期
- Sub-agent 复用 `agent-runtime` 的 Agent 定义，但 mode 标记为 `subagent`
- Background 模式：异步 spawn，立即返回 task_id，完成后通过事件通知前端
- Resume 机制：task_id 可复用，Sub-agent 恢复上次执行上下文
- 权限派生：`derive_subagent_permission(parent_agent_permission)` 函数
- **清理旧代码**：删除 `crates/task/` 中与 Sub-agent 无关的过时代码（如 `make_task`、`make_approval` 等旧逻辑），根据实际需求保留或重构审批相关功能

**注意事项**：
- Sub-agent 的 LLM 调用必须独立于主 Agent 的 token 计数
- Background 模式的输出需要缓冲机制，避免主 Agent 流被阻塞
- 前端需要 Sub-agent 状态指示器（`components/agent/SubagentIndicator`）
- 删除旧代码时需确认 `crates/task/` 中的审批逻辑是否被其他模块引用，避免误删

---

### 3.3 MCP 完整集成

| 维度 | 说明 |
|------|------|
| **是否需要新依赖** | ✅ 需要 |
| **变更类型** | 新增 Rust crate 依赖 + 新建 crate + 前端扩展 |
| **涉及模块** | 新建 `crates/mcp-client/`、`src-tauri/src/commands/mcp.rs`、`shared/ipc/mcp.ts` |

**方案对比**：

| 方案 | 描述 | 优点 | 缺点 | 推荐 |
|------|------|------|------|------|
| **A: rmcp 官方 SDK（推荐）** | 使用 `modelcontextprotocol/rust-sdk` 的 `rmcp` crate（v0.2.0） | 官方维护、支持 tokio 异步、内置 Client/Server 构建器、OAuth 支持、MCP 规范完整实现 | 依赖 tokio（已满足）、版本较新（0.2.0） | ✅ |
| B: mcp-sdk 社区版 | 使用 `mcp-sdk` crate（v0.0.3，AntigmaLabs） | 轻量（1K SLoC） | 版本过低（0.0.3）、维护不活跃、功能不完整 | ❌ |
| C: 自行实现 MCP 协议 | 基于 JSON-RPC 2.0 + serde 自行实现 | 无外部依赖 | 工作量巨大、需要实现 Stdio/SSE/StreamableHTTP 三种 transport + OAuth 完整流程 | ❌ |

**推荐方案 A 的详细说明**：

**新增 Cargo 依赖**（`Cargo.toml` workspace）：
```toml
rmcp = { version = "0.2", features = ["client", "server"] }
rmcp-macros = "0.2"
```

**新建 crate**：`crates/mcp-client/`

**crate 职责**：
```
mcp-client/
├── transport/        # 三种 transport 封装
│   ├── stdio.rs      # StdioClientTransport（子进程）
│   ├── sse.rs        # SSEClientTransport
│   └── streamable.rs # StreamableHTTPClientTransport
├── client.rs         # MCP Client 生命周期管理
├── catalog.rs        # 工具/资源/Prompt 目录缓存
├── oauth.rs          # OAuth 认证流程（动态客户端注册 + 回调 + Token 存储）
├── tools.rs          # MCP 工具 → Agent 工具转换适配器
└── registry.rs       # MCP Server 注册表（从配置加载）
```

**前端变更**：
- 新增 `features/mcp/` 功能模块（MCP Server 管理 UI）
- 新增 `shared/ipc/mcp.ts` IPC 接口
- 新增 `components/agent/McpToolsPopover`（MCP 工具列表展示）

**注意事项**：
- MCP Server 进程生命周期管理：启动、健康检查、崩溃重启、优雅关闭
- MCP 工具返回的 image/pdf 等附件需限制大小（建议 10MB）
- OAuth Token 需通过 `crates/credential/` 存储，复用现有 keyring 机制
- `.mcp.json` 配置格式需兼容 Claude Code / OpenCode 生态
- MCP 工具与内置工具的命名冲突检测

---

## 四、P1 重要项技术方案分析

### 4.1 Plan Mode

| 维度 | 说明 |
|------|------|
| **是否需要新依赖** | ❌ 不需要 |
| **变更类型** | 架构变更 + 配置扩展 |
| **涉及模块** | `crates/agent-runtime/`、`crates/workspace/` |

**方案**：作为多 Agent 系统的第一个应用——新增 `plan` agent（mode=primary, permission=read-only）。

**无需新依赖**，纯代码变更：
- Agent 注册表中新增 `plan` agent 定义
- `plan_enter` / `plan_exit` 作为 Agent 切换动作
- 计划文件持久化到 `.ai-digital-life/plans/*.md`

---

### 4.2 Compaction（会话压缩）

| 维度 | 说明 |
|------|------|
| **是否需要新依赖** | ✅ 需要（token 计数） |
| **变更类型** | 新增 Rust crate 依赖 |
| **涉及模块** | `crates/conversation/`、`crates/agent-runtime/` |

**Token 计数方案对比**：

| 方案 | 描述 | 优点 | 缺点 | 推荐 |
|------|------|------|------|------|
| **A: tokenizers（HuggingFace）（推荐）** | `tokenizers` crate（HuggingFace 官方） | 支持 20+ 模型 tokenizer（GPT/Claude/Llama/DeepSeek 等）、活跃维护、社区成熟、Rust 原生 | 包体积较大（~10MB）、编译时间较长 | ✅ |
| B: tiktoken | `tiktoken` crate v1.0.1 | 轻量（1.5MB）、OpenAI 兼容 | 仅支持 OpenAI 模型、最后更新 2023 年、依赖 pcre2（重量级正则引擎） | ❌ |
| C: 简单估算 | 4 字符 ≈ 1 token（粗估） | 零依赖、零开销 | 精度差（误差 30-50%）、无法按模型区分 | ❌ |
| D: 前端 tiktoken | 前端用 `js-tiktoken` 或 `gpt-tokenizer` | 不增加 Rust 编译时间 | 无法在 Rust 后端做 compaction 决策、前后端计数不一致风险 | ❌ |

**推荐方案 A 的详细说明**：

**新增 Cargo 依赖**（`Cargo.toml` workspace）：
```toml
tokenizers = { version = "0.21", default-features = false }
```

**实现要点**：
- 在 `crates/agent-runtime/` 中新增 `compaction.rs`，实现 token-aware pruning
- 阈值参考 OpenCode：PRUNE_MINIMUM = 20000 tokens、PRUNE_PROTECT = 40000 tokens
- 保护策略：保留最近 N 轮对话（DEFAULT_TAIL_TURNS = 2）、保护 skill 工具输出
- 按模型自动选择 tokenizer（通过 `model-gateway` 获取模型 ID）

**注意事项**：
- `tokenizers` 编译时间较长，建议在 CI 中启用 sccache 缓存；本地开发可用 `cargo check -p adl-agent-runtime` 避免全量 rebuild
- 不同模型的 tokenizer 差异较大，需要维护 model → tokenizer 映射表
- Compaction 后的摘要需保留足够上下文，避免 Agent 丢失关键信息

---

### 4.3 Snapshot / Revert

| 维度 | 说明 |
|------|------|
| **是否需要新依赖** | ❌ 不需要 |
| **变更类型** | 架构变更 + 代码扩展 |
| **涉及模块** | `crates/change-engine/`、`crates/workspace/src/git.rs` |

**方案**：扩展现有 `change-engine` crate，新增基于 git 的 message-level snapshot 功能。

**无需新依赖**，纯代码变更：
- 在 `crates/change-engine/` 中新增 `snapshot.rs`（独立 gitdir 快照）
- 在 `crates/change-engine/` 中新增 `revert.rs`（基于快照回滚）
- 复用现有 `crates/workspace/src/git.rs` 的 git 操作
- 自动 prune：7 天 + 2MB 限制

**注意事项**：
- 独立 gitdir 路径：`<app_data>/snapshot/<project_hash>/<message_id>`
- 快照操作不能阻塞 Agent 主流程
- 需要处理大文件（>2MB）的快照跳过策略

---

### 4.4 Provider-specific Prompts

| 维度 | 说明 |
|------|------|
| **是否需要新依赖** | ❌ 不需要 |
| **变更类型** | 配置扩展 |
| **涉及模块** | `crates/model-gateway/`、`frontend/src/app/` |

**方案**：在 `crates/model-gateway/` 中新增 prompt 模板系统，按模型选择 system prompt。

**无需新依赖**，纯配置 + 代码变更：
- 在 `crates/model-gateway/` 中新增 `prompts/` 目录（模板文件）
- 模型 → prompt 模板映射配置
- 前端不需要变更（对用户透明）

---

### 4.5 多 LLM Provider 支持

| 维度 | 说明 |
|------|------|
| **是否需要新依赖** | ✅ 需要（推荐）或不需要（自研） |
| **变更类型** | 新增 Rust crate 依赖 或 扩展 model-gateway |
| **涉及模块** | `crates/model-gateway/` |

**方案对比**：

| 方案 | 描述 | 优点 | 缺点 | 推荐 |
|------|------|------|------|------|
| **A: 自研扩展（推荐）** | 在现有 `model-gateway` 基础上，用适配器模式逐 Provider 扩展 | 完全可控、无外部依赖、与现有架构无缝集成、按需添加 | 需要逐个实现 Provider 适配 | ✅ |
| B: rllm/llm crate | 使用 `rllm` crate（v1.1.9）统一多 LLM 后端 | 开箱即用、支持 OpenAI/Anthropic/Ollama/DeepSeek/xAI/Google/Groq 等 8+ Provider、builder 模式、函数调用、vision、流式、结构化输出 | 与现有 `model-gateway` 架构冲突（需要替换而非扩展）、版本 1.1.9 依赖 `llm` 底层库、审计/fallback/secret 等自研逻辑需重写 | ❌ |
| C: async-openai | 使用 `async-openai` crate | OpenAI 兼容 API 完善 | 仅支持 OpenAI 兼容 Provider，Anthropic/Google 等非 OpenAI 兼容的需额外适配 | ❌ |

**推荐方案 A 的详细说明**：

**不引入新 crate**，在现有 `model-gateway` 中扩展：

```
model-gateway/
├── providers/
│   ├── deepseek.rs      # 已有
│   ├── minimax.rs       # 已有
│   ├── openai.rs        # 新增：OpenAI 兼容 API
│   ├── anthropic.rs     # 新增：Anthropic Messages API
│   ├── google.rs        # 新增：Google Gemini API
│   ├── ollama.rs        # 新增：Ollama 本地 API
│   └── openrouter.rs    # 新增：OpenRouter 统一网关
├── adapter.rs           # Provider 适配器 trait
├── router.rs            # 已有：模型路由
├── gateway.rs           # 已有：网关核心
└── audit.rs             # 已有：审计
```

**Provider 适配器 trait**：
```rust
#[async_trait]
pub trait ProviderAdapter: Send + Sync {
    fn provider_name(&self) -> &'static str;
    fn supported_models(&self) -> &[ModelId];
    async fn chat(
        &self,
        model: &ModelId,
        messages: &[ChatMessage],
        options: &ChatOptions,
    ) -> Result<ChatResponse, AppError>;
    async fn chat_stream(
        &self,
        model: &ModelId,
        messages: &[ChatMessage],
        options: &ChatOptions,
    ) -> Result<StreamReader, AppError>;
    fn token_count(&self, model: &ModelId, text: &str) -> Result<usize, AppError>;
}
```

**注意事项**：
- 每个 Provider 的 API 格式差异（Anthropic 的 Messages API vs OpenAI 的 Chat Completions API）需要在适配器内处理
- 流式响应格式差异（SSE 格式 vs JSON Lines 格式）
- 已有的 `reqwest`（rustls-tls）足够所有 HTTP 调用，无需额外 HTTP 客户端
- 建议优先实现 Anthropic（Claude）和 OpenAI 兼容 API，覆盖大部分需求

---

### 4.6 WebFetch / WebSearch 工具

| 维度 | 说明 |
|------|------|
| **是否需要新依赖** | ❌ 不需要 |
| **变更类型** | 代码新增 |
| **涉及模块** | `crates/agent-runtime/`、`src-tauri/src/commands/agent.rs` |

**方案**：复用现有 `reqwest` 实现 WebFetch 和 WebSearch 工具。

**无需新依赖**：
- WebFetch：使用 `reqwest` 的 HTTP GET，基础实现用简单正则解析 HTML（无需新依赖）；如需健壮 HTML 解析可引入 `scraper = "0.20"` 作为可选优化
- WebSearch：推荐 Tavily API（AI 搜索优化）或 SerpAPI，API key 复用 `crates/credential/` 存储；基础实现仅预留接口

**注意事项**：
- WebFetch 输出的内容需要限制大小（建议 50KB）
- 需要处理超时（建议 10s）、重定向、SSL 错误
- 遵守 robots.txt 不是必须的，但建议添加 User-Agent 标识

---

### 4.7 自定义命令配置

| 维度 | 说明 |
|------|------|
| **是否需要新依赖** | ❌ 不需要 |
| **变更类型** | 配置扩展 |
| **涉及模块** | `frontend/src/app/components/conversation/SlashCommandPopover.tsx`、config 系统 |

**无需新依赖**，纯配置 + 代码变更：
- 扩展 config 结构，支持 `commands: [{ name, description, template, agent?, model? }]`
- 模板变量支持 `$1`、`$ARGUMENTS`
- 前端 SlashCommandPopover 从配置动态加载

---

### 4.8 权限系统升级为 Ruleset

| 维度 | 说明 |
|------|------|
| **是否需要新依赖** | ❌ 不需要 |
| **变更类型** | 架构变更 |
| **涉及模块** | `crates/kernel/src/command_risk.rs`、`crates/task/` |

**无需新依赖**，纯代码变更：
- 将现有三级 RiskLevel（Low/Medium/High）升级为 Permission Ruleset（allow/ask/deny + Wildcard 通配）
- 评估逻辑：`evaluate(permission, pattern, ...rulesets)` 找最后一个匹配规则
- 新增特殊规则：`.env` ask、`doom_loop` ask、`external_directory` ask

---

## 五、P2 后续项技术方案简要分析

| 能力 | 需要新依赖？ | 方案 |
|------|------------|------|
| Session Fork / 分支 | ❌ | 在 `crates/conversation/` 中增加 `parent_id` 字段 + `fork` 操作 |
| LSP 集成 | ✅ 可选 | 使用 `lsp-server` + `lsp-types` crate 构建 LSP 客户端；或复用现有 `outline` 解析作为轻量替代 |
| Plugin 系统 | ❌ | 架构设计：Plugin trait + Hooks 事件 + 沙箱加载（wasm 或动态库） |
| HTTP API 服务器 | ❌ | 预留：Tauri 内嵌 HTTP server（如 `axum`），但当前阶段不需要 |
| CodeMode 沙箱 | ❌ | 预留：受限 JS 执行环境（可用 `boa` JS 引擎或 `deno_core`） |
| Reference 系统 | ❌ | 配置扩展 + 在 `crates/context/` 中注入额外目录 |
| 自定义 Agent 配置 | ❌ | 配置扩展 + Agent 注册表动态加载 |
| Hot Reloadable Config | ❌ | 使用 `notify`（已有）监听配置文件变更 + 触发 Agent 重建 |
| Durable Session Execution | ❌ | 架构变更：在 `crates/agent-runtime/` 中增加进程崩溃恢复 + Session 状态持久化 |

---

## 六、依赖变更汇总

### 6.1 需要新增的 Rust Crate 依赖

| 序号 | Crate | 版本 | 用途 | 对应能力 | 优先级 |
|------|-------|------|------|---------|--------|
| 1 | `rmcp` | 0.2.x | MCP 协议客户端/服务端 | MCP 完整集成 | P0 |
| 2 | `rmcp-macros` | 0.2.x | MCP 工具宏 | MCP 完整集成 | P0 |
| 3 | `tokenizers` | 0.21.x | 多模型 token 计数 | Compaction | P1 |
| 4 | `scraper`（可选） | 0.20.x | HTML 解析（基础实现用正则无需此依赖） | WebFetch | P1 |
| 5 | `lsp-server` | 0.7.x | LSP 服务器通信协议 | LSP 集成 | P2 |
| 6 | `lsp-types` | 0.97.x | LSP 类型定义 | LSP 集成 | P2 |

### 6.2 需要新增的前端依赖

| 序号 | 包 | 用途 | 对应能力 | 优先级 |
|------|-----|------|---------|--------|
| - | **无** | 所有前端变更均可基于现有技术栈实现 | - | - |

### 6.3 需要修改的现有依赖

| 依赖 | 当前版本 | 是否需要升级 | 原因 |
|------|---------|-------------|------|
| 所有现有依赖 | 见 `Cargo.toml` / `package.json` | ❌ 不需要 | 现有版本均满足需求 |

### 6.4 需要新建的 Rust Crate

| 序号 | Crate 名 | 职责 | 对应能力 | 优先级 |
|------|---------|------|---------|--------|
| 1 | `mcp-client` | MCP 协议客户端（transport/oauth/catalog/tools） | MCP 完整集成 | P0 |
| 2 | `subagent` | Sub-agent 生命周期管理（独立于 task crate） | Sub-agent / Task 工具 | P0 |
| 3 | `lsp-client` | LSP 协议客户端（服务器启动/符号解析/诊断/跳转定义） | LSP 集成 | P2 |

### 6.5 需要新建的前端模块

| 序号 | 模块路径 | 职责 | 对应能力 | 优先级 |
|------|---------|------|---------|--------|
| 1 | `features/mcp/` | MCP Server 管理 UI | MCP 完整集成 | P0 |
| 2 | `components/agent/AgentSelector.tsx` | Agent 切换选择器 | 多 Agent 系统 | P0 |
| 3 | `components/agent/SubagentIndicator.tsx` | Sub-agent 状态指示 | Sub-agent | P0 |
| 4 | `features/provider-manager/` | Provider 配置管理 UI（Key 录入/模型选择/健康检查） | 多 LLM Provider 支持 | P1 |
| 5 | `features/lsp-panel/` | LSP 诊断列表与符号面板 | LSP 集成 | P2 |

---

## 七、无需引入的依赖（明确排除）

以下依赖经评估后**不推荐**引入：

| 依赖 | 排除原因 |
|------|---------|
| `rllm` / `llm` crate | 与现有 `model-gateway` 架构冲突，替换成本高，自研适配器更可控 |
| `async-openai` | 仅支持 OpenAI 兼容 API，无法覆盖 Anthropic/Google 等非 OpenAI 兼容 Provider |
| `openfang` | 完整 Agent OS 框架，太重（14 crate、137K 行），与现有架构重复 |
| `rig-core` | 与现有 `agent-runtime` 功能重叠 |
| `mcp-sdk`（community） | 版本过低（0.0.3），维护不活跃 |
| `tiktoken` (Rust) | 最后更新 2023 年，仅支持 OpenAI，被 `tokenizers` 替代 |
| `@modelcontextprotocol/sdk` (npm) | MCP 客户端应在 Rust 后端实现，前端仅展示 |
| `langchain` / `langchain-rs` | 太重，与项目轻量级哲学不符 |
| `dify` / `n8n` | 完整的 AI 编排平台，非嵌入式库，与桌面应用形态不符 |

---

## 八、实施顺序建议

```
Phase 2-A（当前最优先）
├── 1. 多 Agent 系统（纯架构，无新依赖，风险最低）
├── 2. Sub-agent / Task 工具（依赖多 Agent 系统，新建 `crates/subagent/`，清理旧 task 代码）
└── 3. Plan Mode（多 Agent 系统的第一个应用）

Phase 2-B（Agent 生态扩展）
├── 4. MCP 完整集成（新增 rmcp 依赖）
├── 5. 多 LLM Provider 支持（纯架构扩展）
├── 6. Provider-specific Prompts（依赖多 Provider）

Phase 2-C（会话质量提升）
├── 7. Compaction（新增 tokenizers 依赖）
├── 8. Snapshot / Revert（纯架构）
├── 9. WebFetch / WebSearch 工具（纯代码）

Phase 2-D（用户自定义）
├── 10. 自定义命令配置（纯配置）
├── 11. 权限系统升级为 Ruleset（纯架构）
```

> **注**：MCP（第 4 项）与 Phase 2-A 无依赖关系，可与多 Agent / Sub-agent / Plan Mode 并行开发。Doc 07 将其列为 P0 与此处并不矛盾——P0 表示优先权级，Phase 2-A/B 仅表示实施批次。MCP 不依赖多 Agent 系统，理论上可独立先行。但考虑开发资源集中，建议在第 1-3 项稳定后尽快启动。

---

## 九、风险提示

| 风险 | 说明 | 缓解措施 |
|------|------|---------|
| `rmcp` 版本较新 | 0.2.0 可能有不稳定 API | 锁定版本，定期跟进更新 |
| `tokenizers` 编译时间长 | HuggingFace tokenizers 体积大 | CI 启用 sccache 缓存，本地开发可选 feature flag 关闭 |
| Provider API 变更 | LLM Provider API 可能不兼容 | 适配器模式隔离，每个 Provider 独立更新 |
| MCP Server 进程管理 | 子进程崩溃、僵尸进程 | 健康检查 + 自动重启 + 超时 kill |
| 多 Agent 权限混乱 | Sub-agent 权限可能越界 | 权限派生机制 + 沙箱隔离 |

---

## 十、相关文档

- [07-missing-features-opencode-has.md](./07-missing-features-opencode-has.md) — 缺失能力清单（含优先级）
- [06-comparison-with-ai-digital-life.md](./06-comparison-with-ai-digital-life.md) — 完整对比报告
- [01-overview-tech-stack.md](./01-overview-tech-stack.md) — OpenCode 技术栈概览
- [03-module-design.md](./03-module-design.md) — OpenCode 模块设计