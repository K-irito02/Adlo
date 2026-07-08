# Provider / Model Gateway

## model-gateway crate

> 路径: `crates/model-gateway/`

### 架构概览

```text
Agent Pipeline → ModelGateway.chat() / .chat_stream()
  → route::route_chain() → 优先级排序 Provider 链
  → provider::call_provider() → API Key 获取
    → dispatch_to_provider() → Registry 查找 Adapter
      → ProviderAdapter::chat() / chat_stream() → HTTP API 调用
    → 失败时 fallback → 下一 Provider
  → audit::audit_record() → 审计日志
  → 全失败 → deterministic_fallback() → 本地合成响应
```

### ProviderAdapter trait

| 方法 | 签名 | 说明 |
|------|------|------|
| `provider_name()` | `→ &'static str` | 人类可读名称 |
| `provider_id()` | `→ &'static str` | 唯一标识符 |
| `supported_models()` | `→ Vec<ModelDefinition>` | 静态模型列表 |
| `supports_dynamic_models()` | `→ bool` | 是否支持动态拉取模型 |
| `fetch_models()` | `→ Result<Vec<ModelDefinition>>` | 动态模型拉取 |
| `chat()` | `(model, messages, options, api_key) → Result<ModelResponse>` | 非流式聊天 |
| `chat_stream()` | `(model, messages, options, api_key) → Result<StreamReader>` | 流式聊天 |
| `test_connection()` | `(api_key, base_url) → Result<()>` | 连接测试 |

### 支持的 7 个 Provider

| Provider | ID | 文件 | API 类型 | 认证 | 动态模型 |
|----------|-----|------|----------|------|----------|
| **DeepSeek** | `deepseek` | `providers/openai.rs` | OpenAICompatible | API Key | 否 |
| **MiniMax** | `minimax` | `providers/openai.rs` | OpenAICompatible | API Key | 否 |
| **OpenAI** | `openai` | `providers/openai.rs` | OpenAICompatible | API Key | 是 |
| **Anthropic Claude** | `anthropic` | `providers/anthropic.rs` | AnthropicNative | API Key | 否 |
| **Google Gemini** | `google` | `providers/google.rs` | GoogleNative | API Key | 否 |
| **Ollama (Local)** | `ollama` | `providers/ollama.rs` | Ollama | 无 | 是 |
| **OpenRouter** | `openrouter` | `providers/openrouter.rs` | OpenAICompatible | API Key | 是 |

> 注: DeepSeek、MiniMax 使用 OpenAI 兼容适配器 (`openai.rs`)，因为它们的 API 与 OpenAI 格式兼容。

### ProviderRegistry

```rust
pub struct ProviderRegistry {
    providers: HashMap<String, ProviderDefinition>,
    adapters: HashMap<String, Arc<dyn ProviderAdapter + Send + Sync>>,
}
```

| 方法 | 用途 |
|------|------|
| `register(def, adapter)` | 注册 Provider + Adapter |
| `get(id)` | 获取 Provider 定义 |
| `get_adapter(id)` | 获取 Provider Adapter |
| `list_all()` | 列出所有已注册 Provider |
| `remove(id)` | 移除 Provider |
| `get_adapter_owned(id)` | 获取 Adapter 的 Arc 所有权 |

### ProviderDefinition

```rust
pub struct ProviderDefinition {
    pub id: String,
    pub name: String,
    pub description: String,
    pub api_type: ApiType,    // OpenAICompatible | AnthropicNative | GoogleNative | Ollama
    pub default_base_url: Option<String>,
    pub auth_type: AuthType,  // ApiKey | OAuth | None
    pub models: ModelSource,  // Static(Vec<ModelDefinition>) | Dynamic { endpoint }
    pub built_in: bool,
    pub default_model: Option<String>,
}
```

### API 类型对比

| API 类型 | 适配器位置 | 协议差异 |
|----------|-----------|----------|
| `OpenAICompatible` | `openai.rs` | `/v1/chat/completions`, messages 数组格式 |
| `AnthropicNative` | `anthropic.rs` | `/v1/messages`, Anthropic 消息格式 |
| `GoogleNative` | `google.rs` | Gemini API 格式 |
| `Ollama` | `ollama.rs` | `/api/chat`, 本地 HTTP |

### 路由与回退

```text
route_chain(): 按 ModelPreferences 中 priority 排序 enabled Provider

select_provider(): 依次尝试链中每个 Provider
  ├─ 成功 → 返回 (provider_id, model_id, ModelResponse)
  └─ 失败 → 继续下一 Provider

全部失败 → deterministic_fallback(): 本地合成响应
```

### SSE 流式

| 类型 | 文件 | 说明 |
|------|------|------|
| `StreamReader` | `adapter.rs` | `Pin<Box<dyn Stream<Item = Result<StreamChunk, AppError>> + Send>>` |
| `StreamChunk::Delta(String)` | `adapter.rs` | 文本增量 |
| `StreamChunk::ToolCallDelta` | `adapter.rs` | 工具调用增量 |
| `StreamChunk::Done(ModelTokenUsage)` | `adapter.rs` | 流结束 + Token 用量 |

## Tauri 命令

> 路径: `src-tauri/src/commands/provider.rs`

| 命令 | 参数 | 返回值 | 说明 |
|------|------|--------|------|
| `list_providers` | — | `Vec<ProviderStatus>` | 列出所有已注册 Provider 及其状态 |
| `list_supported_providers` | — | `Vec<ProviderInfo>` | 列出 7 个支持的 Provider ID/名称 |
| `test_provider_connection` | `provider_id` | `ConnectionTestResult` | 测试 Provider 连接 |
| `fetch_provider_models` | `provider_id` | `Vec<ModelDefinition>` | 拉取 Provider 模型列表 |
| `add_custom_provider` | `name, base_url, api_key, models` | `bool` | 添加自定义 OpenAI 兼容 Provider |
| `remove_custom_provider` | `provider_id` | `bool` | 移除自定义 Provider |
| `set_provider_api_key` | `provider_id, api_key` | `bool` | 设置 API Key（keyring 存储） |
| `clear_provider_api_key` | `provider_id` | `bool` | 清除 API Key |
| `has_provider_api_key` | `provider_id` | `bool` | 检查 API Key 是否存在 |
| `save_provider_config` | `provider_id, config` | `bool` | 保存 Provider 配置 |

## 前端

### ProviderSlice

> 路径: `frontend/src/app/stores/slices/providerSlice.ts`

| 字段 | 类型 | 说明 |
|------|------|------|
| `providers` | `ProviderStatus[]` | Provider 列表 |
| `selectedProviderId` | `string \| null` | 当前选中的 Provider |
| `selectedModelId` | `string \| null` | 当前选中的 Model |
| `recentModelIds` | `string[]` | 最近使用的 Model ID |
| `isFetchingProviders` | `boolean` | 是否正在加载 |
| `connectionTestResults` | `Record<string, ConnectionTestResult>` | 连接测试结果 |
| `testingProviderId` | `string \| null` | 正在测试的 Provider ID |

### ProviderActions

> 路径: `frontend/src/app/stores/actions/providerActions.ts`

`fetchProviders()`, `setApiKey()`, `clearApiKey()`, `testConnection()`, `addCustomProvider()`, `removeCustomProvider()`, `selectModel()`, `fetchModels()`

### UI 组件

| 组件 | 路径 | 用途 |
|------|------|------|
| `ProviderManager` | `features/provider-manager/` | Provider 管理面板 |
| `ProviderList` | `features/provider-manager/ProviderList.tsx` | Provider 列表 |
| `ProviderConfig` | `features/provider-manager/ProviderConfig.tsx` | Provider 配置表单 |
| `ProviderSettings` | `features/provider-manager/ProviderSettings.tsx` | Provider 设置页面 |
| `CustomProviderDialog` | `features/provider-manager/` | 自定义 Provider 对话框 |
| `ModelPicker` | `features/provider-manager/` | 模型选择器 |

## 文件参考

| 内容 | 路径 |
|------|------|
| ModelGateway 核心 | `crates/model-gateway/src/lib.rs` |
| Provider 注册表 | `crates/model-gateway/src/registry.rs` |
| ProviderAdapter trait | `crates/model-gateway/src/adapter.rs` |
| Provider 调用（API Key + 分发） | `crates/model-gateway/src/provider.rs` |
| 优先级路由 | `crates/model-gateway/src/route.rs` |
| Secret 管理 | `crates/model-gateway/src/secret.rs` |
| 审计日志 | `crates/model-gateway/src/audit.rs` |
| 回退逻辑 | `crates/model-gateway/src/fallback.rs` |
| Anthropic 适配器 | `crates/model-gateway/src/providers/anthropic.rs` |
| Google 适配器 | `crates/model-gateway/src/providers/google.rs` |
| Ollama 适配器 | `crates/model-gateway/src/providers/ollama.rs` |
| OpenAI 适配器 | `crates/model-gateway/src/providers/openai.rs` |
| OpenRouter 适配器 | `crates/model-gateway/src/providers/openrouter.rs` |
| Provider Tauri 命令 | `src-tauri/src/commands/provider.rs` |
| Store Provider 切片 | `frontend/src/app/stores/slices/providerSlice.ts` |
| Store Provider Actions | `frontend/src/app/stores/actions/providerActions.ts` |
| Provider 管理 UI | `frontend/src/app/features/provider-manager/` |
| kernel 模型类型 | `crates/kernel/src/types/model.rs` |
| kernel 配置类型 | `crates/kernel/src/types/config.rs` |
| Credential（keyring） | `crates/credential/src/lib.rs` |
