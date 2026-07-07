# Provider/Model/Streaming 重构总结 (2026-07-07)

## 概述

三项深度重构：Provider 动态注册系统 → Model 选择路由 → SSE 真实流式传输。

## 架构变化

### 1. Provider 动态注册系统

- `ModelProviderId` enum → `String`（全量 25+ 文件）
- `ProviderRegistry` 注册中心（`Arc<RwLock<ProviderRegistry>>` 注入 `AppState`）
- `ProviderDefinition` + `ApiType`/`AuthType`/`ModelSource` 类型
- 7 个 built-in provider 启动时注册（openai/anthropic/google/ollama/openrouter/deepseek/minimax）
- `dispatch_to_provider` 硬编码 `match` → registry lookup
- 6 个新 Tauri 命令 + 桥接层

### 2. Model 选择

- `ModelGateway.fetch_models` + `ModelGateway.chat_stream` + `chat_stream_for_model`
- ProviderAdapter 新增 `fetch_models`（async）、`test_connection`
- 路由改为 `(provider, model)` 对匹配（直接 dispatch 替代 priority chain）
- `SendMessageInput` 新增 `providerId`/`modelId` 可选字段
- ModelPicker UI 组件（composer 区域下拉）
- `handleSelectModel` 类型从 `ModelProviderId` 改为 `string`

### 3. SSE 真实流式传输

- 所有 5 个 adapter 原有真实 `chat_stream` 实现（OpenAI/Anthropic/Google/Ollama/OpenRouter）
- 新增 `call_provider_stream` 函数
- `consume_stream_to_response` 替代 `emit_model_stream_events` chunk 模拟
- `AgentRuntime`/`Subagent` 创建 gateway 时传入 provider_registry

## 关键经验

1. **`Box<dyn ProviderAdapter>` 导致 `RwLockReadGuard` 跨 `.await` 生命周期问题** → `get_adapter_owned` 返回 `Arc<dyn ProviderAdapter>`，锁释放后再 await
2. **`fetch_models` 内部 `Runtime::new().block_on()` 嵌套 tokio 运行时崩溃** → 改为 async fn（trait 已有 `#[async_trait]`）
3. **`chat_stream` 的 `StreamReader` 在 `call_model` 中消费需 `tokio::pin!`** → 用 `tokio_stream::StreamExt::next()` 逐项消费
4. **`save_provider_config` 从 no-op 改为实际持久化** → 至少保存 apiKey 到 credential store
5. **`health()` 硬编码 7 个 provider 遗漏自定义 provider** → 改用 `registry.list_all()` 动态遍历

## 文件变化

| 文件 | 变更 |
|------|------|
| `crates/model-gateway/src/registry.rs` | 新增（ProviderRegistry + ProviderDefinition + ApiType/AuthType/ModelSource） |
| `crates/model-gateway/src/adapter.rs` | ProviderAdapter trait 新增 fetch_models/test_connection |
| `crates/model-gateway/src/provider.rs` | dispatch_to_provider registry 化 + call_provider_stream |
| `crates/model-gateway/src/lib.rs` | 新增 chat_stream/chat_stream_for_model/resolve_route/fetch_models |
| `crates/model-gateway/src/route.rs` | 新增 select_provider_for_model |
| `crates/model-gateway/src/wire.rs` | 删除（不再需要） |
| `src-tauri/src/commands/provider.rs` | 新增 6 个 provider 命令 |
| `src-tauri/src/commands/model.rs` | 删除（移动至 provider.rs） |
| `src-tauri/src/commands/agent_pipeline_stream.rs` | consume_stream_to_response 替代 emit_model_stream_events |
| `src-tauri/src/commands/agent_pipeline.rs` | call_model 流式改写 |
| `src-tauri/src/commands/agent.rs` | StartRunInput 新增 provider_id/model_id |
| `src-tauri/src/commands/conversation.rs` | SendMessageInput 新增 provider_id/model_id |
| `src-tauri/src/commands/agent_pipeline_types.rs` | CallModelContext 新增 provider_id/model_id |
| `src-tauri/src/setup.rs` | register_builtin_providers 函数 |
| `frontend/src/app/components/models/ModelPicker.tsx` | 新增（composer 模型选择） |
| `frontend/src/app/components/models/ProviderManager.tsx` | 新增（provider 管理面板） |
| `frontend/src/app/components/models/CustomProviderDialog.tsx` | 新增 |
| `frontend/src/app/components/models/ModelSelector.tsx` | 删除（死代码） |
| `frontend/src/shared/ipc/provider.ts` | ProviderStatus 接口 + ProviderBridge |
| `frontend/src/shared/ipc/conversation.ts` | SendMessageInput 新增 providerId/modelId |
| `frontend/src/app/stores/actions/providerActions.ts` | 重写（provider CRUD + selectModel） |
| `frontend/src/app/stores/slices/providerSlice.ts` | 重写（ProviderSlice） |
| `frontend/src/app/stores/actions/streamActions.ts` | sendMessage 传递 selectedProviderId/selectedModelId |
