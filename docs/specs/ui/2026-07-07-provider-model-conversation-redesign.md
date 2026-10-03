# Provider、Model Selection、Conversation 链路重建设计文档

## 概述

对 AI 数字生命的三个核心领域进行全面重构，借鉴参考实现的架构设计模式：

1. **Provider 动态注册系统** — 将硬编码提供商列表改造为运行时动态注册表
2. **模型级选择 UI** — 从"选提供商"升级为"选具体模型"，带搜索/分组/元数据
3. **真流式对话链路** — SSE 逐 token 流式 + 完整对话历史上下文

## Section 1：Provider 动态注册系统

### 目标

- 移除 `ModelProviderId` 枚举，替换为字符串 ID + 运行时 `ProviderRegistry`
- 支持运行时动态添加/移除/配置提供商
- 支持自定义 OpenAI 兼容提供商（用户输入 base_url + key + 模型列表）
- 真实 API 连通性检测（health check 不再仅检查 key 是否存在）
- 清除冗余命令（删除 `model.rs`）

### 架构

#### ProviderRegistry

```rust
// crates/model-gateway/src/registry.rs

pub struct ProviderRegistry {
    providers: HashMap<String, ProviderDefinition>,
    adapters: HashMap<String, Box<dyn ProviderAdapter>>,
}

pub struct ProviderDefinition {
    pub id: String,                     // "openai", "anthropic", "my-custom-llm"
    pub name: String,                   // "OpenAI", "我的自定义 LLM"
    pub description: String,
    pub api_type: ApiType,              // OpenAICompatible | AnthropicNative | GoogleNative | Ollama
    pub default_base_url: Option<String>,
    pub auth_type: AuthType,            // ApiKey | OAuth | None
    pub models: ModelSource,            // Static(Vec<ModelDef>) | Dynamic { endpoint }
    pub built_in: bool,                 // true 为内置，false 为用户自定义
}

pub enum ApiType {
    OpenAICompatible,   // 含 DeepSeek、MiniMax、OpenRouter 等
    AnthropicNative,
    GoogleNative,
    Ollama,
}

pub enum AuthType {
    ApiKey,
    OAuth,
    None,
}

pub enum ModelSource {
    Static(Vec<ModelDefinition>),
    Dynamic { endpoint: Option<String> },
}

impl ProviderRegistry {
    pub fn register(&mut self, def: ProviderDefinition, adapter: Box<dyn ProviderAdapter>);
    pub fn register_custom(&mut self, id: String, base_url: String, models: Vec<ModelDefinition>);
    pub fn get(&self, id: &str) -> Option<&ProviderDefinition>;
    pub fn get_adapter(&self, id: &str) -> Option<&dyn ProviderAdapter>;
    pub fn list_all(&self) -> Vec<&ProviderDefinition>;
    pub fn list_enabled(&self, configs: &ProviderConfigMap) -> Vec<&ProviderDefinition>;
    pub fn remove(&mut self, id: &str);
}
```

#### 内置 Provider 注册（启动时）

```rust
// src-tauri/src/setup.rs 或 crates/model-gateway/src/lib.rs

let mut registry = ProviderRegistry::new();

registry.register(
    ProviderDefinition::openai(),
    Arc::new(OpenAIProvider),
);
registry.register(
    ProviderDefinition::anthropic(),
    Arc::new(AnthropicProvider),
);
registry.register(
    ProviderDefinition::google(),
    Arc::new(GoogleProvider),
);
registry.register(
    ProviderDefinition::ollama(),
    Arc::new(OllamaProvider),
);
registry.register(
    ProviderDefinition::openrouter(),
    Arc::new(OpenRouterProvider),
);
registry.register(
    ProviderDefinition::deepseek(),
    Arc::new(DeepSeekProvider),    // uses OpenAI-compatible adapter
);
registry.register(
    ProviderDefinition::minimax(),
    Arc::new(MiniMaxProvider),     // uses OpenAI-compatible adapter
);
```

注意：DeepSeek 和 MiniMax 的 `api_type = OpenAICompatible`，与 OpenAI 共用同一套 HTTP 请求逻辑。适配器只负责处理不同的 base_url 和模型列表。

#### 用户自定义 Provider 持久化

```rust
// crates/kernel/src/types/config.rs

pub struct CustomProviderConfig {
    pub id: String,
    pub name: String,
    pub base_url: String,
    pub api_key_type: ApiKeyType,    // Header | Bearer
    pub custom_models: Vec<ModelDefinition>,
}
```

自定义 provider 配置存入 `adl_storage`（SQLite），应用启动时加载到 registry。

#### Tauri 命令

| 命令 | 方法 | 说明 |
|------|------|------|
| `list_providers` | GET | 返回所有注册 provider + 配置状态 |
| `save_provider_config` | PATCH | 更新 provider 配置（启用、base_url 等） |
| `add_custom_provider` | POST | 创建自定义提供商 |
| `remove_custom_provider` | DELETE | 移除自定义提供商 |
| `test_provider_connection` | POST | 发一次 ping 请求验证连通性 |
| `fetch_provider_models` | GET | 从 provider API 动态获取模型列表 |
| `set_provider_api_key` | POST | 存储 API key 到 credential store |
| `clear_provider_api_key` | DELETE | 删除 API key |
| `has_provider_api_key` | GET | 检查 key 是否存在 |

#### 连通性检测

```rust
// 新方法：调用 provider 的轻量端点验证
fn test_connection(provider_id: &str, api_key: &str) -> Result<ConnectionStatus> {
    let def = registry.get(provider_id)?;
    match def.api_type {
        OpenAICompatible => ping_models_endpoint(def.base_url, api_key),
        AnthropicNative => ping_messages_endpoint(api_key),
        GoogleNative => ping_generative_endpoint(api_key),
        Ollama => ping_ollama_endpoint(def.base_url),
    }
}

enum ConnectionStatus {
    Connected,
    Unauthorized,
    Timeout,
    Error(String),
}
```

#### ProviderManager 前端 UI

- 完整 provider 列表页：每个条目显示名称、logo、连接状态指示灯
- 点击展开配置：API Key 输入 / Test Connection 按钮
- "Add Custom Provider" 按钮 → 弹出表单（名称、base URL、API key、模型列表）
- 删除自定义 provider

### 影响文件清单

| 文件 | 操作 |
|------|------|
| `crates/model-gateway/src/lib.rs` | 重构：集成 ProviderRegistry |
| `crates/model-gateway/src/registry.rs` | **新建**：ProviderRegistry + ProviderDefinition |
| `crates/model-gateway/src/route.rs` | 重构：字符串 ID 替代 ModelProviderId |
| `crates/model-gateway/src/provider.rs` | 重构：registry 查找替代硬编码分发 |
| `crates/model-gateway/src/fallback.rs` | 重构：动态 default model |
| `crates/model-gateway/src/adapter.rs` | 调整：`supported_models` 返回 Vec<ModelDefinition> |
| `crates/model-gateway/src/providers/mod.rs` | 调整：适配 registry |
| `crates/model-gateway/src/providers/*.rs` | 调整：扩展 `supported_models()` + 注册信息 |
| `crates/kernel/src/types/config.rs` | 删除 `ModelProviderId` 枚举；新增 `ModelDefinition`、`CustomProviderConfig`、`ProviderConfigMap` |
| `crates/kernel/src/types/mod.rs` | 调整导出 |
| `crates/credential/src/lib.rs` | 无变化（secret store 不受影响） |
| `src-tauri/src/commands/provider.rs` | 重写：新命令列表 |
| `src-tauri/src/commands/mod.rs` | 调整：移除 model.rs 注册 |
| `src-tauri/src/commands/model.rs` | **删除** |
| `src-tauri/src/setup.rs` | 新增：内置 provider 注册 |
| `frontend/src/shared/ipc/provider.ts` | 更新 bridge 接口 |
| `frontend/src/tauri-bridge.ts` | 更新 bridge 映射 |
| `frontend/src/app/stores/slices/providerSlice.ts` | 重写：动态 provider state |
| `frontend/src/app/stores/actions/providerActions.ts` | 重写：新 API 调用 |
| `frontend/src/app/components/models/ModelSelector.tsx` | 重构为 ProviderManager 组件 |
| `frontend/src/app/components/models/ModelHealthPanel.tsx` | 重构为 ProviderManager 集成面板 |
| `frontend/src/app/components/models/ModelPicker.tsx` | **新建**：弹出式模型选择器（见 Section 2） |
| `frontend/src/app/components/models/CustomProviderDialog.tsx` | **新建**：自定义 provider 表单弹窗 |

---

## Section 2：模型级选择 UI

### 目标

- 用户可选择具体模型（如 GPT-4o 而非 OpenAI）
- 模型列表优先从 API 动态获取，fallback 静态列表
- 弹窗式 ModelPicker 带搜索、分组、键盘导航、hover 元数据
- 偏好持久化（最近使用、可见性）

### 架构

#### 模型数据模型

```rust
// crates/kernel/src/types/config.rs

pub struct ModelDefinition {
    pub id: String,
    pub provider_id: String,
    pub name: String,
    pub description: Option<String>,
    pub context_window: Option<u32>,
    pub max_output: Option<u32>,
    pub capabilities: Vec<ModelCapability>,
    pub tier: Option<ModelTier>,
    pub released: Option<String>,
}

pub enum ModelCapability {
    Text,
    Vision,
    ToolUse,
    Streaming,
    Reasoning,
}

pub enum ModelTier {
    Free,
    LowCost,
    Standard,
    Premium,
}
```

#### 模型获取策略

```
用户打开 ModelPicker
    → 检查缓存 TTL（默认 5 分钟）
        ├─ 未过期 → 使用缓存
        └─ 已过期 → 后台静默刷新 fetchProviderModels(provider_id)
                    → 调用 provider API 获取模型列表
                    → 存入 SQLite 缓存
                    → 合并用户自定义模型
                    → 返回
```

Provider 适配器报告是否支持动态模型获取：

```rust
impl ProviderAdapter for OpenAIProvider {
    fn supports_dynamic_models(&self) -> bool { true }
    fn fetch_models(&self, api_key: &str, base_url: &str) -> Result<Vec<ModelDefinition>> {
        // GET https://api.openai.com/v1/models
    }
}

impl ProviderAdapter for AnthropicProvider {
    fn supports_dynamic_models(&self) -> bool { false }  // Anthropic 无模型列表 API
}
```

#### 新的 ModelPicker UI

```
┌───────────────────────────────────────┐
│  🔍 Search models...   [xxx]          │  ← 实时搜索
├───────────────────────────────────────┤
│  🔥 Recent                             │
│  ├─ GPT-4o ─────────── OpenAI       👁 │
│  ├─ Claude 3.5 Sonnet ─ Anthropic   👁 │
│                                       │
│  All Models                           │
│  ├─ ▼ OpenAI                          │  ← 可折叠 provider 分组
│  │  ├─ GPT-4o               Premium   │
│  │  ├─ GPT-4o-mini          Standard  │
│  │  └─ o3-mini              Premium   │
│  ├─ ▼ Anthropic                       │
│  │  ├─ Claude 3.5 Sonnet     Premium  │
│  │  └─ Claude 3.5 Haiku      Standard │
│  └─ ...                               │
│                                       │
├───────────────────────────────────────┤
│  Manage models →                       │  ← 跳转到 ProviderManager
└───────────────────────────────────────┘
```

- 搜索实时过滤模型名、provider 名、ID
- 键盘导航 ↑↓ + Enter；Escape 关闭
- Hover tooltip：context window、capabilities tags、release date
- 最近使用列表持久化到本地 store
- 选中后 header 显示当前模型名 + provider

#### 偏好持久化

```rust
// frontend store: providerSlice

interface ModelSelectionState {
    selectedModelId: string | null;
    selectedProviderId: string | null;
    recentModelIds: string[];       // 最多 10 个
}
```

存入 Zustand store + `persist` middleware（localStorage），同时同步到 Rust backend `ModelPreference`。

#### 路由调整

`route.rs` 的 `select_provider` 改为 `select_model`：

```rust
fn select_model(
    registry: &ProviderRegistry,
    preference: &ModelPreference,
    configs: &ProviderConfigMap,
) -> Result<(ProviderDefinition, ModelDefinition)> {
    // 1. 优先使用 preference.selected_model_id + selected_provider_id
    // 2. 如果模型不可用 → fallback 到该 provider 的默认模型
    // 3. 如果 provider 不可用 → fallback chain（按优先级）
    // 4. 全不可用 → deterministic_fallback
}
```

### 影响文件清单

| 文件 | 操作 |
|------|------|
| `crates/kernel/src/types/config.rs` | 新增 `ModelDefinition`、`ModelCapability`、`ModelTier` |
| `crates/model-gateway/src/adapter.rs` | 新增 `supports_dynamic_models()`、`fetch_models()` |
| `crates/model-gateway/src/providers/*.rs` | 实现动态获取（OpenAI、Google）+ 更新模型列表 |
| `crates/model-gateway/src/lib.rs` | 新增 `fetch_models(provider_id)` |
| `crates/model-gateway/src/route.rs` | 重写：`select_provider` → `select_model` |
| `src-tauri/src/commands/provider.rs` | 新增 `fetch_provider_models` |
| `frontend/src/shared/ipc/provider.ts` | 新增 `fetchProviderModels` |
| `frontend/src/tauri-bridge.ts` | 新增映射 |
| `frontend/src/app/stores/slices/providerSlice.ts` | 新增 `models`、`selectedModelId`、`recentModelIds`、`modelCache` |
| `frontend/src/app/stores/actions/providerActions.ts` | 新增 `fetchModels`、`selectModel` |
| `frontend/src/app/components/models/ModelSelector.tsx` | 重构为弹窗式 ModelPicker |
| `frontend/src/app/components/models/ModelPicker.tsx` | **新建**：主要弹窗组件 |
| `frontend/src/app/components/models/ModelPickerGroup.tsx` | **新建**：provider 分组折叠 |
| `frontend/src/app/components/models/ModelPickerItem.tsx` | **新建**：模型条目 |
| `frontend/src/app/components/models/ModelTooltip.tsx` | **新建**：hover 元数据提示 |
| `frontend/src/app/regions/CenterPane.tsx` | 调整：`handleSelectModel` → `handleSelectModelId` |

---

## Section 3：真流式对话链路

### 目标

- 真 SSE 流式：`gateway.chat_stream()` 逐 token 推送
- 完整对话历史注入 `build_model_messages`
- 清除 Plan Mode 的 `run.summary` 脆弱注入
- 工具调用事件预留

### 架构

#### 流式调用链

```
前端 sendMessage()
  → tauri-bridge invoke conversation_send_message
    → agent_start_run (agent.rs)
      → agent_pipeline::prepare_run()
      → agent_pipeline::collect_context()
      → agent_pipeline::call_model()  // 改写为流式
        ├─ session_messages = conversation::get_session_messages(session_id, limit=50)
        ├─ messages = build_model_messages(session_messages, user_message, context)
        ├─ is_plan_mode 直接作为参数传递
        ├─ gateway.chat_stream(messages, is_plan_mode)
        │   ├─ route::select_model(registry, preference) → (provider_def, model_def)
        │   ├─ credential = credential_store.get(provider_id)
        │   ├─ adapter = registry.get_adapter(provider_id)
        │   └─ adapter.chat_stream(model_id, messages, credential)
        │       └─ SSE 逐 token 解析 → yield StreamEvent
        ├─ for each StreamEvent → emit_model_stream_event() → Tauri event
        │   ├─ type:"route"  → { providerId, modelId }
        │   ├─ type:"delta"  → { text }  // 真逐 token
        │   ├─ type:"usage"  → { promptTokens, completionTokens }
        │   └─ type:"done"   → { finishReason }
        └─ 流结束后 → finalize_run() 创建 assistant message
```

#### StreamEvent 枚举

```rust
// crates/model-gateway/src/stream.rs

pub enum StreamEvent {
    Route {
        provider_id: String,
        model_id: String,
        reason: String,
    },
    Delta {
        text: String,
    },
    Usage {
        prompt_tokens: u32,
        completion_tokens: u32,
    },
    Done {
        finish_reason: FinishReason,
    },
    // 预留
    ToolUseStart {
        id: String,
        name: String,
        input: serde_json::Value,
    },
    ToolUseDelta {
        id: String,
        delta: String,
    },
    ToolUseEnd {
        id: String,
    },
}
```

#### 各 Provider Adapter 的 `chat_stream` 实现

| Provider | 协议 | 当前状态 | 改造动作 |
|----------|------|---------|---------|
| OpenAI / DeepSeek / MiniMax / OpenRouter | SSE (data: [DONE]) | 已有骨架 | 解析 `choices[0].delta.content` 逐 token yield |
| Anthropic | SSE (event: content_block_delta) | 已有骨架 | 解析 `delta.text` 逐 token yield |
| Google | SSE (server-sent-events) | 已有骨架 | 解析 `candidates[0].content.parts[0].text` |
| Ollama | NDJSON (stream: true) | 已有骨架 | 解析 `response` 字段逐 token |

关键注意事项：
- 所有 adapter 的 `chat_stream` 返回 `Pin<Box<dyn Stream<Item = Result<StreamEvent>> + Send>>`
- 超时控制：每个 token 间隔超过 30s 触发生成超时事件
- 错误恢复：网络错误时 emit `type:"error"` 事件让前端展示错误状态
- 取消逻辑：前端发送取消信号 → Tauri event → `Stream::abort()`

#### 对话历史接入

```rust
// crates/conversation/src/lib.rs

pub fn get_session_messages(
    conn: &Connection,
    session_id: &str,
    limit: u32,
) -> Result<Vec<HistoryMessage>> {
    // 按 created_at ASC 查询最近 limit 条用户+助手消息对
    // 返回 Vec<HistoryMessage { role: User|Assistant, content: String }>
    // 如果总 token 估算超过模型 context_window，从最早的消息开始丢弃
}

// crates/agent-runtime/src/lib.rs

pub fn build_model_messages(
    session_messages: &[HistoryMessage],
    user_message: &str,
    context_entries: &[ContextEntry],
    is_plan_mode: bool,
) -> Result<Vec<Message>> {
    let mut messages = Vec::new();
    
    // 1. System prompt with context
    let system = assemble_prompt(context_entries);
    if is_plan_mode {
        system += "\n\n" + PLAN_MODE_PROMPT;
    }
    messages.push(Message::System(system));
    
    // 2. Conversation history (omit system messages, keep only User/Assistant pairs)
    for msg in session_messages {
        messages.push(match msg.role {
            Role::User => Message::User(msg.content.clone()),
            Role::Assistant => Message::Assistant(msg.content.clone()),
            _ => continue,
        });
    }
    
    // 3. Current user message
    messages.push(Message::User(user_message.to_string()));
    
    Ok(messages)
}
```

token 估算：使用 `tiktoken-rs` 进行快速 token 计数，在达到 context window 85% 时触发截断（丢弃最早消息对）。

#### Plan Mode 修复

现有 `start_run_inner` 中，`[PLAN_MODE_PROMPT]` 标记通过 `run.summary` 传递：

```rust
// 当前（问题代码）
if run_scenario == RunScenario::Plan {
    run.summary = Some("[PLAN_MODE_PROMPT]".to_string());
}
// agent_pipeline.rs 中解析 summary 查找标记
```

改为：

```rust
// agent.rs - start_run_inner
let is_plan_mode = run_scenario == RunScenario::Plan;

// 直接传入 call_model，不再经过 run.summary
agent_pipeline::call_model(ctx, is_plan_mode).await?;

// agent_pipeline.rs
async fn call_model(ctx: &mut CallModelContext, is_plan_mode: bool) -> Result<()> {
    let messages = build_model_messages(
        &ctx.session_messages,
        &ctx.user_message,
        &ctx.context_entries,
        is_plan_mode,  // 直接传递
    )?;
    // ...
}
```

#### 工具调用预留

`ProviderAdapter` trait 新增：

```rust
fn supports_tool_use(&self) -> bool { false }

fn chat_stream_with_tools(
    &self,
    model_id: &str,
    messages: &[Message],
    tools: &[ToolDefinition],
) -> Pin<Box<dyn Stream<Item = Result<StreamEvent>> + Send>> {
    // 默认 fallback 到 chat_stream（忽略 tools）
    self.chat_stream(model_id, messages)
}
```

前端保留 `tool_use_start/delta/end` 事件的处理能力（当前仅 log，不执行）。

### 影响文件清单

| 文件 | 操作 |
|------|------|
| `crates/model-gateway/src/lib.rs` | 新增 `chat_stream()` 公共方法 |
| `crates/model-gateway/src/stream.rs` | **新建**：`StreamEvent` 枚举 |
| `crates/model-gateway/src/provider.rs` | 重构：`call_provider` 返回 `Stream<Item=StreamEvent>` |
| `crates/model-gateway/src/providers/*.rs` | 补全/修复各 `chat_stream()` 实现 |
| `crates/model-gateway/src/adapter.rs` | 新增 `supports_tool_use`、`chat_stream_with_tools` |
| `crates/agent-runtime/src/lib.rs` | 重构 `build_model_messages`：增加历史参数 |
| `crates/conversation/src/lib.rs` | 新增 `get_session_messages(conn, session_id, limit)` |
| `crates/kernel/src/types/config.rs` | `RunScenario` 确认含 `Plan` 变体 |
| `src-tauri/src/commands/agent.rs` | 调整：`is_plan_mode` 直接传参 |
| `src-tauri/src/commands/agent_pipeline.rs` | 重写 `call_model` 为流式 |
| `src-tauri/src/commands/agent_pipeline_stream.rs` | 重写：SSE 解析 + 逐 token emit |
| `frontend/src/app/stores/actions/streamActions.ts` | 适配新流事件格式（若变化） |
| `frontend/src/tauri-bridge.ts` | 新增取消流式的事件通道 |

---

## 执行顺序

1. **Section 1：Provider 动态注册** — 基础依赖，优先实施
   - 新建 `registry.rs`、`ProviderDefinition`、`CustomProviderConfig`
   - 删除 `ModelProviderId` 枚举，替换所有引用
   - 删除 `model.rs` 冗余命令
   - 新增 `test_provider_connection`、`save_provider_config`、`add/remove_custom_provider`
   - 前端 ProviderManager UI

2. **Section 2：模型级选择** — 依赖 Section 1
   - 扩展模型数据模型
   - 实现 `fetch_provider_models`
   - 重构 `ModelSelector` → `ModelPicker`
   - 路由系统改为按 `(provider, model)` 对

3. **Section 3：流式对话链路** — 部分依赖 Section 2
   - 补全各 adapter `chat_stream`
   - 重写 `call_model` 为流式
   - 实现 `get_session_messages` + 历史注入
   - 修复 Plan Mode

---

## 回退方案

若某个 Section 上线后出现严重问题：
- Section 1：旧 `ModelProviderId` 枚举和 provider 命令保留为兼容层（不删除，标记 deprecate），新代码通过 feature flag 切换
- Section 2：`ModelPicker` 和旧 `ModelSelector` 共存，通过标志位切换
- Section 3：`gateway.chat()` 保留为非流式 fallback，`chat_stream` 失败时自动降级
