# Provider / Model / Conversation 三域重构实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 Provider 系统改造为动态注册 + 模型级选择 + 真流式对话

**Architecture:** 三段式依赖链：动态 Provider 注册表 → 模型级选择 → 流式对话链路。每段独立可测，但顺序不可逆。

**Tech Stack:** Rust (tauri, tokio, reqwest, serde, sqlite), TypeScript (React, Zustand, Tailwind)

## Global Constraints

- 使用字符串 ID 替代 `ModelProviderId` 枚举
- 7 个内置 provider 保留，注册方式改为动态
- API key 仍通过 `adl_credential` 安全存储
- 前端所有 IPC 调用必须同时实现 `tauri-bridge.ts`、`preview-bridge/`、`mock-bridge.ts`
- 所有 Rust 新代码需通过 `cargo clippy` 零警告
- 所有前端新组件需通过 `npm run lint`
- 新增/修改功能必须包含测试
- `RunScenario::Plan` 不使用 `run.summary` 传递标记

---

## Phase A：Provider 动态注册系统

### Task A1: 核心类型定义 — ProviderDefinition + ProviderRegistry

**Files:**
- Create: `crates/model-gateway/src/registry.rs`
- Modify: `crates/model-gateway/src/lib.rs` (mod registry; pub use)

**Interfaces:**
- Produces: `ProviderDefinition`, `ApiType`, `AuthType`, `ModelSource`, `ProviderRegistry` struct + impl

- [ ] **Step 1: Write failing test for ProviderRegistry**

```rust
// tests/registry_test.rs or in-module test
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_register_and_get() {
        let mut reg = ProviderRegistry::new();
        let def = ProviderDefinition {
            id: "test-provider".into(),
            name: "Test".into(),
            description: "".into(),
            api_type: ApiType::OpenAICompatible,
            default_base_url: Some("https://api.test.com".into()),
            auth_type: AuthType::ApiKey,
            models: ModelSource::Static(vec![]),
            built_in: true,
        };
        reg.register(def.clone(), TestAdapter);
        assert!(reg.get("test-provider").is_some());
        assert!(reg.get_adapter("test-provider").is_some());
    }
}
```

Run: `cd ai-digital-life && cargo test -p adl_model_gateway test_register_and_get -- --nocapture`
Expected: FAIL (compile error, no registry module)

- [ ] **Step 2: Write ProviderDefinition + ProviderRegistry**

```rust
// crates/model-gateway/src/registry.rs
use std::collections::HashMap;
use crate::adapter::ProviderAdapter;

#[derive(Clone, Debug)]
pub enum ApiType {
    OpenAICompatible,
    AnthropicNative,
    GoogleNative,
    Ollama,
}

#[derive(Clone, Debug)]
pub enum AuthType {
    ApiKey,
    OAuth,
    None,
}

#[derive(Clone, Debug)]
pub enum ModelSource {
    Static(Vec<ModelDefinition>),
    Dynamic { endpoint: Option<String> },
}

// 临时导入 ModelDefinition（将在 Phase B Task B1 完善）
pub type ModelDefinition = crate::fallback::ModelDef; // placeholder

#[derive(Clone, Debug)]
pub struct ProviderDefinition {
    pub id: String,
    pub name: String,
    pub description: String,
    pub api_type: ApiType,
    pub default_base_url: Option<String>,
    pub auth_type: AuthType,
    pub models: ModelSource,
    pub built_in: bool,
}

pub struct ProviderRegistry {
    providers: HashMap<String, ProviderDefinition>,
    adapters: HashMap<String, Box<dyn ProviderAdapter + Send + Sync>>,
}

impl ProviderRegistry {
    pub fn new() -> Self {
        Self { providers: HashMap::new(), adapters: HashMap::new() }
    }

    pub fn register(
        &mut self,
        def: ProviderDefinition,
        adapter: Box<dyn ProviderAdapter + Send + Sync>,
    ) {
        let id = def.id.clone();
        self.providers.insert(id.clone(), def);
        self.adapters.insert(id, adapter);
    }

    pub fn get(&self, id: &str) -> Option<&ProviderDefinition> {
        self.providers.get(id)
    }

    pub fn get_adapter(&self, id: &str) -> Option<&dyn ProviderAdapter> {
        self.adapters.get(id).map(|b| b.as_ref())
    }

    pub fn list_all(&self) -> Vec<&ProviderDefinition> {
        self.providers.values().collect()
    }

    pub fn remove(&mut self, id: &str) {
        self.providers.remove(id);
        self.adapters.remove(id);
    }
}
```

- [ ] **Step 3: Run test to verify it passes**

Run: `cd ai-digital-life && cargo test -p adl_model_gateway test_register_and_get -- --nocapture`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add crates/model-gateway/src/registry.rs crates/model-gateway/src/lib.rs
git commit -m "feat(core): add ProviderRegistry with ProviderDefinition types"
```

---

### Task A2: 替代 ModelDefinition 类型 + 更新 ProviderAdapter trait

**Files:**
- Modify: `crates/kernel/src/types/config.rs` (add ModelDefinition, ModelCapability, ModelTier)
- Modify: `crates/model-gateway/src/adapter.rs` (use new ModelDefinition)
- Modify: `crates/model-gateway/src/fallback.rs` (use new types)
- Delete placeholder in registry.rs

**Interfaces:**
- Consumes: ProviderRegistry (Task A1)
- Produces: `ModelDefinition`, `ModelCapability`, `ModelTier`

- [ ] **Step 1: Add ModelDefinition types in kernel**

```rust
// crates/kernel/src/types/config.rs

#[derive(Clone, Debug, Serialize, Deserialize)]
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

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub enum ModelCapability {
    Text,
    Vision,
    ToolUse,
    Streaming,
    Reasoning,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub enum ModelTier {
    Free,
    LowCost,
    Standard,
    Premium,
}
```

- [ ] **Step 2: Update ProviderAdapter trait**

```rust
// crates/model-gateway/src/adapter.rs
use adl_kernel::types::config::{ModelDefinition, ModelCapability};

pub trait ProviderAdapter: Send + Sync {
    fn supported_models(&self) -> Vec<ModelDefinition>;
    fn supports_dynamic_models(&self) -> bool { false }
    fn fetch_models(&self, _api_key: &str, _base_url: &str) -> Result<Vec<ModelDefinition>> {
        Err(anyhow::anyhow!("dynamic model fetch not supported"))
    }
    // ... rest stays same: chat(), chat_stream()
}
```

- [ ] **Step 3: Update registry.rs to use kernel::ModelDefinition**

Remove `pub type ModelDefinition = ...` placeholder, import from `adl_kernel::types::config::ModelDefinition`.

- [ ] **Step 4: Update fallback.rs to use new ModelDefinition**

```rust
// crates/model-gateway/src/fallback.rs
use adl_kernel::types::config::ModelDefinition;

pub fn default_models_for_provider(provider_id: &str) -> Vec<ModelDefinition> {
    match provider_id {
        "openai" => vec![
            ModelDefinition { id: "gpt-4o".into(), provider_id: "openai".into(), name: "GPT-4o".into(), capabilities: vec![ModelCapability::Text, ModelCapability::Vision, ModelCapability::ToolUse], tier: Some(ModelTier::Premium), ..Default::default() },
            ModelDefinition { id: "gpt-4o-mini".into(), provider_id: "openai".into(), name: "GPT-4o Mini".into(), capabilities: vec![ModelCapability::Text, ModelCapability::ToolUse], tier: Some(ModelTier::Standard), ..Default::default() },
        ],
        // ... other providers
        _ => vec![],
    }
}
```

- [ ] **Step 5: Commit**

```bash
git add crates/kernel/src/types/config.rs crates/model-gateway/src/adapter.rs crates/model-gateway/src/fallback.rs
git commit -m "feat(core): replace hardcoded model list with ModelDefinition types"
```

---

### Task A3: 删除 ModelProviderId 枚举 — 所有引用替换为字符串

**Files:**
- Modify: `crates/kernel/src/types/config.rs` (delete `ModelProviderId` enum)
- Modify: `crates/model-gateway/src/route.rs` (string IDs)
- Modify: `crates/model-gateway/src/provider.rs` (registry lookup)
- Modify: `crates/model-gateway/src/lib.rs` (adjust signatures)
- Modify: `crates/model-gateway/src/providers/*.rs` (return ProviderDefinition)
- Modify: `crates/model-gateway/src/fallback.rs` (use string IDs)

- [ ] **Step 1: Delete ModelProviderId enum in config.rs**

Remove the entire `ModelProviderId` enum. Replace with type alias if needed:
```rust
pub type ProviderId = String;
```

- [ ] **Step 2: Update route.rs — replace enum matching with string logic**

```rust
// Before: match provider_id { ModelProviderId::OpenAI => ... }
// After: match provider_id.as_str() { "openai" => ... }
// Better: use registry.get(provider_id) to lookup adapter
```

- [ ] **Step 3: Update provider.rs — use registry lookup**

```rust
// Before: let adapter = match provider_id { ... }
// After: let adapter = registry.get_adapter(provider_id)?;
```

- [ ] **Step 4: Update each provider adapter to export ProviderDefinition**

Each provider's `mod.rs` or a `definition()` function:
```rust
impl OpenAIProvider {
    pub fn definition() -> ProviderDefinition {
        ProviderDefinition {
            id: "openai".into(),
            name: "OpenAI".into(),
            description: "OpenAI GPT series models".into(),
            api_type: ApiType::OpenAICompatible,
            default_base_url: Some("https://api.openai.com/v1".into()),
            auth_type: AuthType::ApiKey,
            models: ModelSource::Static(default_models_for_provider("openai")),
            built_in: true,
        }
    }
}
```

- [ ] **Step 5: Build and run tests**

Run: `cd ai-digital-life && cargo build -p adl_model_gateway && cargo test -p adl_model_gateway`
Expected: Build + tests pass

- [ ] **Step 6: Commit**

```bash
git add crates/kernel/src/types/config.rs crates/model-gateway/src/
git commit -m "refactor(core): remove ModelProviderId enum, use string IDs + registry"
```

---

### Task A4: Provider 启动注册 + 删除 model.rs 冗余命令

**Files:**
- Modify: `src-tauri/src/setup.rs` (register built-in providers)
- Delete: `src-tauri/src/commands/model.rs`
- Modify: `src-tauri/src/commands/mod.rs`

- [ ] **Step 1: Add startup registration in setup.rs**

```rust
// src-tauri/src/setup.rs — in app setup / state initialization
fn register_builtin_providers(registry: &mut ProviderRegistry) {
    registry.register(
        OpenAIProvider::definition(),
        Box::new(OpenAIProvider),
    );
    registry.register(
        AnthropicProvider::definition(),
        Box::new(AnthropicProvider),
    );
    registry.register(
        GoogleProvider::definition(),
        Box::new(GoogleProvider),
    );
    registry.register(
        OllamaProvider::definition(),
        Box::new(OllamaProvider),
    );
    registry.register(
        OpenRouterProvider::definition(),
        Box::new(OpenRouterProvider),
    );
    registry.register(
        DeepSeekProvider::definition(),
        Box::new(DeepSeekProvider),
    );
    registry.register(
        MiniMaxProvider::definition(),
        Box::new(MiniMaxProvider),
    );
}
```

- [ ] **Step 2: Add ProviderRegistry to app state (Tauri managed)**

```rust
// setup.rs or main.rs
app.manage(ProviderRegistry::new());
// after state creation:
let registry = app.state::<ProviderRegistry>();
register_builtin_providers(&mut *registry.lock().unwrap());
```

Note: Need `Arc<RwLock<ProviderRegistry>>` for thread-safe shared state.

- [ ] **Step 3: Delete model.rs**

Remove `src-tauri/src/commands/model.rs` and its registration in `mod.rs`.

- [ ] **Step 4: Build to verify**

Run: `cd ai-digital-life && cargo build`
Expected: Build passes

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/setup.rs src-tauri/src/commands/
git commit -m "feat(core): register built-in providers at startup, remove redundant model.rs"
```

---

### Task A5: 新增 Provider Tauri 命令

**Files:**
- Rewrite: `src-tauri/src/commands/provider.rs`
- Modify: `frontend/src/shared/ipc/provider.ts` (bridge interface)
- Modify: `frontend/src/tauri-bridge.ts` (bridge mapping)

**Interfaces:**
- Produces: `list_providers`, `save_provider_config`, `add_custom_provider`, `remove_custom_provider`, `test_provider_connection`, `fetch_provider_models`

- [ ] **Step 1: Write failing frontend tests**

```typescript
// frontend/src/__tests__/provider.test.ts
import { describe, it, expect } from 'vitest';

describe('Provider Bridge', () => {
  it('list_providers returns provider array', async () => {
    const providers = await window.digitalLife.provider.listProviders();
    expect(Array.isArray(providers)).toBe(true);
    expect(providers[0]).toHaveProperty('id');
    expect(providers[0]).toHaveProperty('name');
  });
});
```

- [ ] **Step 2: Implement provider.rs Tauri commands**

```rust
#[tauri::command]
async fn list_providers(
    registry: tauri::State<'_, Arc<RwLock<ProviderRegistry>>>,
    configs: tauri::State<'_, ProviderConfigMap>,
) -> Result<Vec<ProviderStatus>, String> {
    let reg = registry.read().unwrap();
    Ok(reg.list_all().into_iter().map(|def| {
        ProviderStatus {
            id: def.id.clone(),
            name: def.name.clone(),
            built_in: def.built_in,
            configured: configs.get(&def.id).map(|c| c.enabled).unwrap_or(false),
            has_key: false, // will be filled by per-provider key check
        }
    }).collect())
}

#[tauri::command]
async fn test_provider_connection(
    provider_id: String,
    api_key: String,
    registry: tauri::State<'_, Arc<RwLock<ProviderRegistry>>>,
) -> Result<ConnectionTestResult, String> {
    let reg = registry.read().unwrap();
    let def = reg.get(&provider_id).ok_or("provider not found")?;
    let adapter = reg.get_adapter(&provider_id).ok_or("adapter not found")?;
    match adapter.test_connection(&api_key, def.default_base_url.as_deref().unwrap_or("")).await {
        Ok(()) => Ok(ConnectionTestResult { connected: true, error: None }),
        Err(e) => Ok(ConnectionTestResult { connected: false, error: Some(e.to_string()) }),
    }
}

// add_custom_provider, save_provider_config, remove_custom_provider similarly
```

- [ ] **Step 3: Update bridge interface**

```typescript
// frontend/src/shared/ipc/provider.ts
export interface ProviderBridge {
  listProviders(): Promise<ProviderStatus[]>;
  saveProviderConfig(config: ProviderConfig): Promise<void>;
  addCustomProvider(config: CustomProviderConfig): Promise<void>;
  removeCustomProvider(id: string): Promise<void>;
  testProviderConnection(providerId: string, apiKey: string): Promise<ConnectionTestResult>;
  fetchProviderModels(providerId: string): Promise<ModelDefinition[]>;
  setProviderApiKey(provider: string, key: string): Promise<void>;
  clearProviderApiKey(provider: string): Promise<void>;
  hasProviderApiKey(provider: string): Promise<boolean>;
}
```

- [ ] **Step 4: Update tauri-bridge.ts and mock-bridge.ts mappings**

```typescript
// frontend/src/tauri-bridge.ts — add mappings for new commands
listProviders: () => invoke('list_providers'),
saveProviderConfig: (config) => invoke('save_provider_config', { config }),
// ...
```

- [ ] **Step 5: Run frontend tests**

Run: `cd ai-digital-life/frontend && npm run test`
Expected: PASS

- [ ] **Step 6: Run backend build + tests**

Run: `cd ai-digital-life && cargo build && cargo test`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src-tauri/src/commands/provider.rs frontend/src/shared/ipc/provider.ts frontend/src/tauri-bridge.ts
git commit -m "feat(ipc): add dynamic provider commands (list, test, custom)"
```

---

### Task A6: 前端 ProviderManager UI

**Files:**
- Create: `frontend/src/app/components/models/ProviderManager.tsx`
- Create: `frontend/src/app/components/models/CustomProviderDialog.tsx`
- Rewrite: `frontend/src/app/stores/slices/providerSlice.ts`
- Rewrite: `frontend/src/app/stores/actions/providerActions.ts`
- Delete: `frontend/src/app/components/models/ModelHealthPanel.tsx`

- [ ] **Step 1: Write failing store test**

```typescript
// frontend/src/__tests__/providerSlice.test.ts
describe('providerSlice', () => {
  it('loads providers from IPC', async () => {
    const { result } = renderHook(() => useProviderStore());
    await act(async () => {
      await result.current.actions.fetchProviders();
    });
    expect(result.current.providers.length).toBeGreaterThan(0);
    expect(result.current.providers[0]).toHaveProperty('id');
  });
});
```

- [ ] **Step 2: Implement providerSlice**

```typescript
// frontend/src/app/stores/slices/providerSlice.ts
import { createSlice } from '../createSlice';

interface ProviderState {
  providers: ProviderStatus[];
  configuredProviders: string[];
  selectedProviderId: string | null;
  selectedModelId: string | null;
  recentModelIds: string[];
  isFetchingProviders: boolean;
  connectionTestResult: Record<string, ConnectionTestResult>;
}

// Actions: fetchProviders, testConnection, addCustomProvider, removeCustomProvider, selectModel
```

- [ ] **Step 3: Implement ProviderManager component**

```tsx
// ProviderManager.tsx — full provider list + config panel
// Layout:
// ┌──────────────────────┐
// │ Provider List        │
// │ [●] OpenAI     ✅ ⚡ │ — green dot = connected, Configured icon, Test button
// │ [○] Anthropic   ❌  │ — red dot = not connected
// │ [＋] Add Custom...   │
// └──────────────────────┘
// Clicking a provider expands inline panel with:
// - API Key input (masked)
// - Base URL override (for OpenAI-compatible)
// - Test Connection button + result indicator
// - Models list
// - Enable/disable toggle
```

- [ ] **Step 4: Implement CustomProviderDialog**

```tsx
// Modal form: name, base URL, API key, model list (csv input)
// On submit → add_custom_provider IPC → refresh list
```

- [ ] **Step 5: Update app routing to integrate ProviderManager**

Replace `ModelHealthPanel` usage with `ProviderManager`.

- [ ] **Step 6: Run frontend tests + lint**

Run: `cd ai-digital-life/frontend && npm run test && npm run lint`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add frontend/src/app/components/models/ frontend/src/app/stores/slices/providerSlice.ts frontend/src/app/stores/actions/providerActions.ts
git commit -m "feat(ui): ProviderManager with dynamic provider list, config, and connection test"
```

---

## Phase B：模型级选择

### Task B1: 动态模型获取

**Files:**
- Modify: `crates/model-gateway/src/lib.rs` (add fetch_models)
- Modify: `src-tauri/src/commands/provider.rs` (fetch_provider_models command)
- Modify: `crates/model-gateway/src/providers/openai.rs` (fetch_models impl)
- Modify: `frontend/src/tauri-bridge.ts`
- Modify: `frontend/src/shared/ipc/provider.ts`

- [ ] **Step 1: Add fetch_models to ModelGateway**

```rust
// crates/model-gateway/src/lib.rs
impl ModelGateway {
    pub async fn fetch_models(&self, provider_id: &str) -> Result<Vec<ModelDefinition>> {
        let registry = self.registry.read().unwrap();
        let def = registry.get(provider_id).ok_or(anyhow!("unknown provider"))?;
        let adapter = registry.get_adapter(provider_id).ok_or(anyhow!("no adapter"))?;

        if !adapter.supports_dynamic_models() {
            // Return static list from the definition
            return match &def.models {
                ModelSource::Static(models) => Ok(models.clone()),
                ModelSource::Dynamic { .. } => Err(anyhow!("dynamic fetch unsupported")),
            };
        }

        let api_key = get_provider_secret(provider_id).await?;
        let base_url = get_base_url(provider_id, def);
        adapter.fetch_models(&api_key, &base_url).await
    }
}
```

- [ ] **Step 2: Implement fetch_models for OpenAI**

```rust
// crates/model-gateway/src/providers/openai.rs
impl ProviderAdapter for OpenAIProvider {
    fn supports_dynamic_models(&self) -> bool { true }

    fn fetch_models(&self, api_key: &str, base_url: &str) -> Result<Vec<ModelDefinition>> {
        let client = reqwest::blocking::Client::new();
        let resp = client
            .get(format!("{}/models", base_url))
            .header("Authorization", format!("Bearer {}", api_key))
            .send()?;
        let data: OpenAI_ModelsResponse = resp.json()?;
        Ok(data.data.into_iter().map(|m| ModelDefinition {
            id: m.id,
            provider_id: "openai".into(),
            name: m.id.clone(), // use ID as fallback name
            capabilities: vec![ModelCapability::Text], // refine from model metadata
            ..Default::default()
        }).collect())
    }
}
```

- [ ] **Step 3: Add fetch_provider_models Tauri command**

```rust
#[tauri::command]
async fn fetch_provider_models(
    provider_id: String,
    gateway: tauri::State<'_, Arc<ModelGateway>>,
) -> Result<Vec<ModelDefinition>, String> {
    gateway.fetch_models(&provider_id).await.map_err(|e| e.to_string())
}
```

- [ ] **Step 4: Test**

Run: `cd ai-digital-life && cargo build && cargo test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add crates/model-gateway/src/lib.rs crates/model-gateway/src/providers/openai.rs src-tauri/src/commands/provider.rs
git commit -m "feat(core): dynamic model fetching from provider API"
```

---

### Task B2: 路由系统改为 (provider, model) 对匹配

**Files:**
- Rewrite: `crates/model-gateway/src/route.rs`

- [ ] **Step 1: Write failing test**

```rust
#[cfg(test)]
mod tests {
    #[test]
    fn test_select_model_uses_preferred() {
        let mut reg = ProviderRegistry::new();
        reg.register(openai_def(), Box::new(TestAdapter::new(vec!["gpt-4o", "gpt-4o-mini"])));
        reg.register(anthropic_def(), Box::new(TestAdapter::new(vec!["claude-3-5-sonnet"])));

        let pref = ModelPreference {
            selected_provider_id: "openai".into(),
            selected_model_id: "gpt-4o".into(),
        };
        let result = select_model(&reg, &pref, &HashMap::new()).unwrap();
        assert_eq!(result.0.id, "openai");
        assert_eq!(result.1.id, "gpt-4o");
    }
}
```

- [ ] **Step 2: Rewrite route.rs**

```rust
pub fn select_model(
    registry: &ProviderRegistry,
    preference: &ModelPreference,
    configs: &ProviderConfigMap,
) -> Result<(ProviderDefinition, ModelDefinition)> {
    // 1. Try preferred provider + model
    if let Some(provider) = registry.get(&preference.selected_provider_id) {
        if let Some(model) = find_model(provider, &preference.selected_model_id) {
            return Ok((provider.clone(), model.clone()));
        }
    }

    // 2. Fallback: iterate enabled providers by priority
    let chain = route_chain(registry, configs);
    for provider_id in chain {
        let provider = registry.get(&provider_id).unwrap();
        if let Some(model) = provider.default_model() {
            return Ok((provider.clone(), model.clone()));
        }
    }

    // 3. Deterministic fallback
    Ok(deterministic_fallback())
}

fn route_chain(registry: &ProviderRegistry, configs: &ProviderConfigMap) -> Vec<String> {
    // Return enabled providers sorted by priority
    configs.iter()
        .filter(|(_, c)| c.enabled)
        .sorted_by_key(|(_, c)| c.priority)
        .map(|(id, _)| id.clone())
        .collect()
}
```

- [ ] **Step 3: Test**

Run: `cd ai-digital-life && cargo test -p adl_model_gateway test_select_model`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add crates/model-gateway/src/route.rs
git commit -m "refactor(core): select_model by (provider, model) pair with fallback chain"
```

---

### Task B3: 前端 ModelPicker UI 组件

**Files:**
- Create: `frontend/src/app/components/models/ModelPicker.tsx`
- Create: `frontend/src/app/components/models/ModelPickerGroup.tsx`
- Create: `frontend/src/app/components/models/ModelPickerItem.tsx`
- Create: `frontend/src/app/components/models/ModelTooltip.tsx`
- Modify: `frontend/src/app/stores/slices/providerSlice.ts` (model selection state)
- Delete: `frontend/src/app/components/models/ModelSelector.tsx`
- Modify: `frontend/src/app/regions/CenterPane.tsx` (integrate ModelPicker)

- [ ] **Step 1: Write failing component test**

```typescript
// frontend/src/__tests__/ModelPicker.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';

describe('ModelPicker', () => {
  it('filters models on search input', async () => {
    render(<ModelPicker providers={mockProviders} onSelect={vi.fn()} />);
    const input = screen.getByPlaceholderText(/search/i);
    fireEvent.change(input, { target: { value: 'gpt-4' } });
    expect(screen.getByText('GPT-4o')).toBeInTheDocument();
    expect(screen.queryByText('Claude 3.5')).not.toBeInTheDocument();
  });

  it('selects model on click', async () => {
    const onSelect = vi.fn();
    render(<ModelPicker providers={mockProviders} onSelect={onSelect} />);
    fireEvent.click(screen.getByText('GPT-4o'));
    expect(onSelect).toHaveBeenCalledWith('openai', 'gpt-4o');
  });
});
```

- [ ] **Step 2: Implement ModelPicker**

```tsx
// ModelPicker.tsx
interface ModelPickerProps {
  providers: ProviderStatus[];     // with pre-fetched models
  selectedProviderId: string | null;
  selectedModelId: string | null;
  onSelect: (providerId: string, modelId: string) => void;
  onManageModels: () => void;     // open ProviderManager
}

// State:
// - searchQuery: string
// - searchResults: filtered model list
// - selectedIndex: keyboard nav position

// Renders:
// - Search input at top
// - "Recent" section (from recentModelIds)
// - Provider-grouped model list
// - "Manage models" link at bottom
```

- [ ] **Step 3: Implement ModelPickerGroup (collapsible provider group)**

```tsx
// Groups model items under provider name header with collapse toggle
```

- [ ] **Step 4: Implement ModelPickerItem**

```tsx
// Single model row: name + provider badge + tier tag
// Hover shows ModelTooltip
```

- [ ] **Step 5: Implement ModelTooltip**

```tsx
// Positioned tooltip on hover showing:
// - Context window: 128K tokens
// - Capabilities: Text, Vision, Tool Use
// - Released: 2024-05
// - Tier: Premium
```

- [ ] **Step 6: Integrate into CenterPane**

Replace old `ModelSelector` usage with new `ModelPicker`. The header area shows current `(provider/ model)`.

```tsx
// CenterPane.tsx — handleSelectModel → handleSelectModelId
const handleSelectModelId = (providerId: string, modelId: string) => {
  actions.selectModel(providerId, modelId);
};
```

- [ ] **Step 7: Update store for model selection**

```typescript
// providerSlice.ts additions
selectModel: (providerId: string, modelId: string) => {
  set({ selectedProviderId: providerId, selectedModelId: modelId });
  // Also update recentModelIds (dedup + push front + slice to 10)
  set((state) => ({
    recentModelIds: [
      modelId,
      ...state.recentModelIds.filter((id) => id !== modelId),
    ].slice(0, 10),
  }));
}
```

- [ ] **Step 8: Run tests**

Run: `cd ai-digital-life/frontend && npm run test && npm run lint`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add frontend/src/app/components/models/ frontend/src/app/regions/CenterPane.tsx frontend/src/app/stores/slices/providerSlice.ts
git commit -m "feat(ui): ModelPicker with search, grouping, keyboard nav, and tooltips"
```

---

## Phase C：真流式对话链路

### Task C1: StreamEvent 枚举 + 流事件契约

**Files:**
- Create: `crates/model-gateway/src/stream.rs`
- Modify: `crates/model-gateway/src/lib.rs`

- [ ] **Step 1: Write StreamEvent enum**

```rust
// crates/model-gateway/src/stream.rs

#[derive(Debug, Clone, Serialize, Deserialize)]
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
    Error {
        message: String,
        code: Option<String>,
    },
    // Tool-use reservation
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

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum FinishReason {
    Stop,
    Length,
    Error,
}

pub type StreamResult = Result<StreamEvent, crate::Error>;
```

- [ ] **Step 2: Test StreamEvent serde**

```rust
#[test]
fn test_stream_event_serde() {
    let event = StreamEvent::Delta { text: "Hello".into() };
    let json = serde_json::to_string(&event).unwrap();
    let back: StreamEvent = serde_json::from_str(&json).unwrap();
    assert_eq!(format!("{:?}", back), format!("{:?}", event));
}
```

- [ ] **Step 3: Commit**

```bash
git add crates/model-gateway/src/stream.rs crates/model-gateway/src/lib.rs
git commit -m "feat(core): StreamEvent enum with SSE-compatible types"
```

---

### Task C2: 补全所有 Provider Adapter 的 chat_stream 实现

**Files:**
- Modify: `crates/model-gateway/src/providers/openai.rs`
- Modify: `crates/model-gateway/src/providers/anthropic.rs`
- Modify: `crates/model-gateway/src/providers/google.rs`
- Modify: `crates/model-gateway/src/providers/ollama.rs`
- Modify: `crates/model-gateway/src/providers/openrouter.rs`
- Modify: `crates/model-gateway/src/providers/deepseek.rs` (if separate, else shared)
- Modify: `crates/model-gateway/src/providers/minimax.rs` (if separate, else shared)

- [ ] **Step 1: Implement OpenAI chat_stream**

```rust
// crates/model-gateway/src/providers/openai.rs
use futures::stream::Stream;
use crate::stream::{StreamEvent, FinishReason};

impl ProviderAdapter for OpenAIProvider {
    fn chat_stream(
        &self,
        model_id: &str,
        messages: &[Message],
        api_key: &str,
        base_url: &str,
    ) -> Pin<Box<dyn Stream<Item = StreamResult> + Send>> {
        let client = reqwest::Client::new();
        let body = build_openai_body(model_id, messages, true); // stream: true

        let stream = async_stream::try_stream! {
            let response = client
                .post(format!("{}/chat/completions", base_url))
                .header("Authorization", format!("Bearer {}", api_key))
                .json(&body)
                .send()
                .await?;

            let mut buffer = String::new();
            let mut stream = response.bytes_stream();

            while let Some(chunk) = stream.next().await {
                let chunk = chunk?;
                let text = String::from_utf8_lossy(&chunk);
                buffer.push_str(&text);

                // Parse SSE events from buffer
                for line in buffer.lines() {
                    if line.starts_with("data: ") {
                        let data = &line[6..];
                        if data == "[DONE]" {
                            yield StreamEvent::Done { finish_reason: FinishReason::Stop };
                            return Ok(());
                        }
                        if let Ok(chat_chunk) = serde_json::from_str::<OpenAIChatChunk>(data) {
                            if let Some(choice) = chat_chunk.choices.first() {
                                if let Some(content) = &choice.delta.content {
                                    yield StreamEvent::Delta { text: content.clone() };
                                }
                                if let Some(reason) = &choice.finish_reason {
                                    yield StreamEvent::Done {
                                        finish_reason: match reason.as_str() {
                                            "length" => FinishReason::Length,
                                            _ => FinishReason::Stop,
                                        }
                                    };
                                }
                            }
                        }
                    }
                }
                // Keep only unprocessed data in buffer
                if let Some(pos) = buffer.rfind('\n') {
                    buffer = buffer[pos + 1..].to_string();
                }
            }
        };

        Box::pin(stream)
    }
}
```

- [ ] **Step 2: Implement Anthropic chat_stream**

Anthropic Messages API SSE format: `event: content_block_delta\n data: {...}\n\n`

```rust
// Similar pattern but parse Anthropic SSE format
// event: message_start → Route
// event: content_block_delta → Delta
// event: message_delta → Usage
// event: message_stop → Done
```

- [ ] **Step 3: Implement Google chat_stream**

Google Gemini SSE: each line is JSON with `candidates[0].content.parts[0].text`.

- [ ] **Step 4: Implement Ollama chat_stream**

Ollama NDJSON: each line is `{"response": "token", "done": false}`.

- [ ] **Step 5: Implement OpenRouter chat_stream**

OpenRouter is OpenAI-compatible, shares same SSE format.

DeepSeek and MiniMax also use OpenAI-compatible format.

- [ ] **Step 6: Write adapter stream tests**

```rust
#[tokio::test]
async fn test_openai_stream_parsing() {
    let provider = OpenAIProvider;
    // Mock HTTP with simulated SSE chunks
    // Verify each yielded StreamEvent matches expectations
}
```

- [ ] **Step 7: Build + test**

Run: `cd ai-digital-life && cargo build && cargo test -p adl_model_gateway`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add crates/model-gateway/src/providers/
git commit -m "feat(core): implement true SSE chat_stream for all providers"
```

---

### Task C3: Gateway.chat_stream 公共方法

**Files:**
- Modify: `crates/model-gateway/src/lib.rs`
- Modify: `crates/model-gateway/src/provider.rs` (call_provider_stream)

- [ ] **Step 1: Add chat_stream to ModelGateway**

```rust
// crates/model-gateway/src/lib.rs
impl ModelGateway {
    pub async fn chat_stream(
        &self,
        messages: &[Message],
        preference: &ModelPreference,
        configs: &ProviderConfigMap,
    ) -> Result<impl Stream<Item = StreamResult>> {
        let (provider, model) = select_model(&self.registry, preference, configs)?;
        let adapter = self.registry.get_adapter(&provider.id).unwrap();

        // Emit route event first
        let route_event = StreamEvent::Route {
            provider_id: provider.id.clone(),
            model_id: model.id.clone(),
            reason: "preferred".into(),
        };

        let api_key = if provider.auth_type != AuthType::None {
            Some(get_provider_secret(&provider.id).await?)
        } else {
            None
        };

        let base_url = get_base_url_for_provider(&provider);
        let model_stream = adapter.chat_stream(
            &model.id,
            messages,
            api_key.as_deref().unwrap_or(""),
            &base_url,
        );

        // Prepend route event then chain the adapter stream
        let stream = futures::stream::once(async { Ok(route_event) }).chain(model_stream);
        Ok(stream)
    }
}
```

- [ ] **Step 2: Update call_provider to use stream**

```rust
// crates/model-gateway/src/provider.rs
pub async fn call_provider_stream(
    registry: &ProviderRegistry,
    credential_store: &CredentialStore,
    provider_id: &str,
    model_id: &str,
    messages: &[Message],
) -> Result<impl Stream<Item = StreamResult>> {
    let adapter = registry.get_adapter(provider_id)?;
    let def = registry.get(provider_id)?;
    let api_key = get_secret(credential_store, provider_id).await?;
    let base_url = resolve_base_url(def);

    adapter.chat_stream(model_id, messages, &api_key, &base_url).await
}
```

- [ ] **Step 3: Test**

Run: `cd ai-digital-life && cargo build && cargo test`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add crates/model-gateway/src/lib.rs crates/model-gateway/src/provider.rs
git commit -m "feat(core): Gateway.chat_stream public method with route events"
```

---

### Task C4: 对话历史注入

**Files:**
- Modify: `crates/conversation/src/lib.rs` (add get_session_messages)
- Modify: `crates/agent-runtime/src/lib.rs` (build_model_messages with history)

- [ ] **Step 1: Write failing tests**

```rust
#[test]
fn test_get_session_messages_returns_latest() {
    // Insert test messages into in-memory DB
    // Query with limit=5
    // Assert returns most recent 5 message pairs
}

#[test]
fn test_build_model_messages_includes_history() {
    let history = vec![
        HistoryMessage { role: Role::User, content: "hello".into() },
        HistoryMessage { role: Role::Assistant, content: "hi there".into() },
    ];
    let messages = build_model_messages(&history, "what's up?", &[], false);
    assert_eq!(messages.len(), 4); // System + hist_user + hist_assistant + cur_user
}
```

- [ ] **Step 2: Implement get_session_messages**

```rust
// crates/conversation/src/lib.rs
pub fn get_session_messages(
    conn: &Connection,
    session_id: &str,
    limit: u32,
) -> Result<Vec<HistoryMessage>> {
    let mut stmt = conn.prepare(
        "SELECT cm1.content as user_content, cm2.content as assistant_content
         FROM conversation_messages cm1
         LEFT JOIN conversation_messages cm2 ON cm2.reply_to = cm1.id
         WHERE cm1.session_id = ?1 AND cm1.role = 'user'
         ORDER BY cm1.created_at DESC
         LIMIT ?2"
    )?;

    let messages: Vec<HistoryMessage> = stmt.query_map(params![session_id, limit], |row| {
        Ok(HistoryMessage {
            role: Role::User,
            content: row.get(0)?,
        })
    })?.filter_map(|r| r.ok()).collect();

    messages.reverse(); // chronological order
    Ok(messages)
}
```

- [ ] **Step 3: Rewrite build_model_messages**

```rust
// crates/agent-runtime/src/lib.rs
pub fn build_model_messages(
    session_messages: &[HistoryMessage],
    user_message: &str,
    context_entries: &[ContextEntry],
    is_plan_mode: bool,
) -> Vec<Message> {
    let mut messages = Vec::new();

    // 1. System
    let mut system = assemble_prompt(context_entries);
    if is_plan_mode {
        system = format!("{}\n\n{}", system, PLAN_MODE_PROMPT);
    }
    messages.push(Message::System(system));

    // 2. History
    for msg in session_messages {
        match msg.role {
            Role::User => messages.push(Message::User(msg.content.clone())),
            Role::Assistant => messages.push(Message::Assistant(msg.content.clone())),
        }
    }

    // 3. Current user input
    messages.push(Message::User(user_message.to_string()));

    messages
}
```

- [ ] **Step 4: Integrate in agent_pipeline call_model**

```rust
// Before calling gateway.chat_stream(), fetch session messages:
let session_messages = conversation::get_session_messages(&conn, &session_id, 50)?;
let messages = build_model_messages(&session_messages, &user_message, &context, is_plan_mode);
```

- [ ] **Step 5: Test**

Run: `cd ai-digital-life && cargo build && cargo test`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add crates/conversation/src/lib.rs crates/agent-runtime/src/lib.rs
git commit -m "feat(core): inject conversation history into model context"
```

---

### Task C5: Plan Mode 修复 + call_model 流式改写

**Files:**
- Modify: `src-tauri/src/commands/agent.rs` (is_plan_mode parameter)
- Rewrite: `src-tauri/src/commands/agent_pipeline.rs` (call_model → streaming)
- Rewrite: `src-tauri/src/commands/agent_pipeline_stream.rs` (stream events)

- [ ] **Step 1: Remove PLAN_MODE_PROMPT from run.summary**

```rust
// agent.rs — start_run_inner
// DELETE: if run_scenario == RunScenario::Plan { run.summary = Some("[PLAN_MODE_PROMPT]"); }
// ADD: pass is_plan_mode as parameter
```

- [ ] **Step 2: Rewrite call_model in agent_pipeline.rs**

```rust
// agent_pipeline.rs
async fn call_model(ctx: &mut CallModelContext, is_plan_mode: bool) -> Result<()> {
    let session_messages = conversation::get_session_messages(
        &ctx.conn, &ctx.session_id, 50
    )?;
    let messages = build_model_messages(
        &session_messages,
        &ctx.user_message,
        &ctx.context_entries,
        is_plan_mode,
    );

    emit_activity(ctx, "model-call-start").await?;

    let mut stream = ctx.gateway.chat_stream(
        &messages,
        &ctx.model_preference,
        &ctx.provider_configs,
    ).await?;

    let mut full_response = String::new();

    // Process stream events
    while let Some(event) = stream.next().await {
        let event = event?;
        match &event {
            StreamEvent::Route { provider_id, model_id, reason } => {
                emit_model_stream_event(ctx, StreamEvent::Route {
                    provider_id: provider_id.clone(),
                    model_id: model_id.clone(),
                    reason: reason.clone(),
                }).await?;
            }
            StreamEvent::Delta { text } => {
                full_response.push_str(text);
                emit_model_stream_event(ctx, event).await?;
            }
            StreamEvent::Done { .. } => {
                emit_model_stream_event(ctx, event).await?;
                break;
            }
            StreamEvent::Error { message, .. } => {
                return Err(anyhow!("model error: {}", message));
            }
            _ => {}
        }
    }

    ctx.assistant_text = full_response;
    Ok(())
}
```

- [ ] **Step 3: Clean up agent_pipeline_stream.rs**

Remove old chunking logic. Keep only the `emit_model_stream_event` function that sends events via Tauri event bus.

```rust
// agent_pipeline_stream.rs simplified
pub async fn emit_model_stream_event(
    ctx: &CallModelContext,
    event: StreamEvent,
) -> Result<()> {
    let payload = DigitalLifeModelStreamEventV1 {
        v: 1,
        run_id: ctx.run_id.clone(),
        seq: ctx.seq_counter.fetch_add(1, Ordering::SeqCst),
        event: event.clone(),
    };
    ctx.app_handle.emit("digital-life://model-stream", &payload)?;
    Ok(())
}
```

- [ ] **Step 4: Test**

Run: `cd ai-digital-life && cargo build && cargo test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/commands/agent.rs src-tauri/src/commands/agent_pipeline.rs src-tauri/src/commands/agent_pipeline_stream.rs
git commit -m "feat(core): true SSE streaming in call_model, fix Plan Mode injection"
```

---

### Task C6: 前端流式事件适配 + 取消支持

**Files:**
- Modify: `frontend/src/tauri-bridge.ts` (cancel stream event channel)
- Modify: `frontend/src/app/stores/actions/streamActions.ts`

- [ ] **Step 1: Add cancel stream IPC**

```typescript
// tauri-bridge.ts
cancelModelStream: (runId: string) => invoke('cancel_model_stream', { runId })
```

```rust
#[tauri::command]
async fn cancel_model_stream(
    run_id: String,
    active_streams: tauri::State<'_, ActiveStreams>,
) -> Result<(), String> {
    active_streams.cancel(&run_id);
    Ok(())
}
```

- [ ] **Step 2: Adapt streamActions.ts for new event format**

The existing `subscribeModelStream` already handles `route | delta | done` events. Remove any code that expected pre-chunked batches (if any). Ensure `appendStreamingText` RAF batching works with single-token deltas.

- [ ] **Step 3: Frontend test**

Run: `cd ai-digital-life/frontend && npm run test && npm run lint`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add frontend/src/tauri-bridge.ts frontend/src/app/stores/actions/streamActions.ts
git commit -m "feat(ui): stream cancellation support, adapt to true token-by-token deltas"
```

---

## 验证清单

### Rust 后端
- [ ] `cargo build` — 零警告
- [ ] `cargo clippy` — 零警告
- [ ] `cargo test` — 所有测试通过
- [ ] ProviderRegistry 单元测试
- [ ] select_model 路由测试
- [ ] 各 adapter chat_stream 解析测试
- [ ] get_session_messages DB 查询测试
- [ ] build_model_messages 历史注入测试
- [ ] StreamEvent serde 测试

### 前端
- [ ] `npm run lint` — 零警告
- [ ] `npm run test` — 所有测试通过
- [ ] ProviderManager 列表渲染 + 配置测试
- [ ] ModelPicker 搜索 + 选择测试
- [ ] 自定义 Provider 创建/删除流程测试
- [ ] 流式事件接收 + 文本累积测试

### 集成
- [ ] 应用启动后 ProviderManager 显示 7 个内置 provider
- [ ] 新增自定义 OpenAI 兼容 provider → 出现在列表中
- [ ] 测试连接显示成功/失败
- [ ] ModelPicker 显示各 provider 的模型列表
- [ ] 选择模型后 Header 更新
- [ ] 发送消息 → 流式逐 token 显示
- [ ] 对话历史在消息中正确携带
