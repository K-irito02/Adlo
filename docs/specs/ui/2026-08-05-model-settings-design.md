# 设计文档：合并模型管理到设置面板 + 逐模型启用/禁用

> 日期：2026-08-05
> 状态：已评审（brainstorming 通过）
> 范围：ai-digital-life（前端 React + 后端 Rust + Tauri 桥接）
> 参考实现（历史参考，本地副本已移除，MIT）

---

## 1. 背景与目标

### 现状问题

1. **两套重叠的 Provider UI**：
   - 右侧面板"模型"标签（`models`）→ `components/models/ProviderManager.tsx`，功能全（API 密钥、测试连接、获取模型、添加/移除自定义供应商）
   - 设置面板"模型供应商"分组（`providers`）→ `features/provider-manager/`（`ProviderSettings`/`ProviderList`/`ProviderConfig`），简化版，功能弱、与前者重复
2. **无逐模型启用/禁用能力**：配置中只有供应商级 `enabled`（`ModelPreferences.providers.*.enabled`），且默认仅含 deepseek/minimax，几乎未使用。
3. **浏览器预览模式模型系统完全不可用**：`preview-model.ts` 的 provider 命令全部返回空 stub（`listProviders → []`），违反双端一致性硬规则。

### 目标

1. 设置面板"模型供应商"分组改名为"模型"，删除右侧面板独立"模型"标签，其全部功能并入设置"模型"分组。
2. 新增**逐模型启用/禁用开关**与**默认模型**设置，后端配置持久化、跨重启保留、双端一致。
3. 确保 API 密钥**真实接入**（Tauri 桌面：keyring 存储 + 真实 HTTP 测试连接/获取模型），并修复浏览器预览模式的 provider stub，使模型管理在双端一致可用。
4. 对话区 `ModelPicker` / 状态栏只展示**启用**供应商下的**启用**模型。

---

## 2. 设计决策

| 决策 | 选择 | 理由 |
|------|------|------|
| 启用模型语义 | **逐模型启用/禁用开关** | 用户确认 |
| 设置页布局 | **全新两区式**：上区供应商卡片 + 下区全局启用模型列表 | 用户确认 |
| 持久化 | **后端配置持久化**（`ModelPreferences` 扩展） | 用户确认 |
| 存储架构 | **方案 A**：扩展 `ModelProviderPreference` 追加 `enabled_models: Vec<String>` | 用户确认；与现有配置模型自然融合，供应商级 + 模型级双层控制 |
| 内部分组 id | 沿用 `providers`，仅改展示文案 | 避免 `SettingsGroupId` 类型连锁改动 |
| 浏览器预览 | 真实形状的 localStorage 持久化实现，连接/获取模型返回确定性模拟 | 浏览器无 keyring 与后端，模拟是安全且双端一致的做法 |

---

## 3. 第 1 节 · 后端（Rust）

### 3.1 配置结构扩展

文件：`crates/types/src/types/config.rs`

- `ModelProviderPreference` 追加字段：
  ```rust
  pub enabled_models: Vec<String>,  // 空 = 该供应商全部模型启用
  ```
- `ModelProviderPreferencePatch` 追加字段：
  ```rust
  #[ts(optional)]
  pub enabled_models: Option<Vec<String>>,
  ```
- `ModelPreferences::default()` 补全 7 个内置供应商条目（deepseek/minimax/openai/anthropic/google/ollama/openrouter），并修正 `model_id` 与各供应商静态模型真实 id 对齐（当前 `deepseek` 默认 `deepseek-v4-pro` 与静态列表 `deepseek-chat` 不一致）。
- 依赖 ts-rs 自动生成前端类型（跑生成脚本）。

### 3.2 `app_update_preferences` 合并补丁

文件：`src-tauri/src/commands/app.rs`

在 `model_preferences` 合并分支中处理 `enabled_models`：
```rust
if let Some(enabled_models) = patch.enabled_models {
    entry.enabled_models = enabled_models;
}
```
其余（enabled/priority/model_id）保持不变。

### 3.3 `list_providers` 合并启用状态

文件：`src-tauri/src/commands/provider.rs`

- `ProviderStatus` 追加字段：
  ```rust
  pub enabled: bool,             // 供应商总开关（config 缺省 true）
  pub enabled_models: Vec<String>, // config 缺省 []
  ```
- `map_def_to_status` 增加 `&AppState` 上下文读取 `state.config.model_preferences.providers.get(id)`：
  - 有条目 → 使用条目 `enabled` / `enabled_models`
  - 无条目 → `enabled = true`、`enabled_models = []`
- `list_providers` 同步传入 config。

> 决策点：后端下发 enabled/enabledModels，前端据此过滤；`ModelDefinition` 类型不添加 `enabled` 字段，避免污染路由等消费方。

---

## 4. 第 2 节 · 桥接层（三端对齐）

### 4.1 `preview-model.ts` 重写 provider 部分

文件：`frontend/src/preview-bridge/preview-model.ts`

将 `provider` 对象从空 stub 改为真实可用的浏览器实现：

- **内置供应商镜像**：7 个内置供应商（deepseek/minimax/openai/anthropic/google/ollama/openrouter）+ 静态模型列表，镜像后端 `list_providers` 形状。
- **状态持久化**：API 密钥（`setProviderApiKey`/`clearProviderApiKey`）、自定义供应商（`addCustomProvider`/`removeCustomProvider`）、启用状态统一存 localStorage（`preview-storage.ts` 扩展）。
- **连接/获取模型**：`testProviderConnection` 返回确定性模拟（有密钥 → connected，无 → 失败）；`fetchProviderModels` 返回该供应商静态模型。
- `listProviders` 合并预览偏好里的 enabled/enabledModels 返回 `ProviderStatus[]`。

### 4.2 `mock-provider.ts` 更新

文件：`frontend/src/mock/mock-provider.ts`

`listProviders` 返回含 `enabled`/`enabledModels` 的真实形状 mock 数据（含 7 个内置供应商 + 静态模型），供测试与演示。

### 4.3 `preview-bridge/index.ts`

`provider` 桥接从 `warnMockBridge('provider', mockDigitalLifeBridge.provider)` 改为使用 `preview-model.ts` 的真实实现。

---

## 5. 第 3 节 · 前端 Store / Action

文件：`frontend/src/app/stores/actions/providerActions.ts`、`frontend/src/app/stores/slices/providerSlice.ts`、`frontend/src/app/stores/StoreState.ts`

新增 action：

1. `toggleModel(providerId: string, modelId: string, enabled: boolean)`：
   - 从 `appInfo.config.modelPreferences.providers[providerId]` 读取当前 `enabledModels`
   - 启用 → append；禁用 → remove；结果为显式列表
   - 调用 `updatePreferences({ modelPreferences: { [providerId]: { enabledModels } } })`
2. `setProviderEnabled(providerId: string, enabled: boolean)`：
   - `updatePreferences({ modelPreferences: { [providerId]: { enabled } } })`
3. `setDefaultModel(providerId: string, modelId: string)`：
   - `updatePreferences({ modelPreferences: { [providerId]: { modelId } } })`

新增纯函数选择器（`frontend/src/app/utils/` 或 `shared/`）：

```ts
export function isModelEnabled(
  provider: Pick<ProviderStatus, 'enabled' | 'enabledModels'>,
  modelId: string,
): boolean {
  return (
    provider.enabled &&
    (provider.enabledModels.length === 0 || provider.enabledModels.includes(modelId))
  );
}
```

`updatePreferences` 已内置：modelPreferences 补丁 → `refreshModelHealth()`（现有逻辑，复用）。

`fetchProviders()` 在 toggle 后刷新，使 `providers` store 的 enabled 标志更新。

---

## 6. 第 4 节 · 前端 UI

### 6.1 删除右侧面板"模型"标签（波及面已排查）

| 文件 | 改动 |
|------|------|
| `frontend/src/app/stores/types.ts` | `ToolId` 移除 `'models'` |
| `frontend/src/app/regions/right-panel/ToolSwitcher.tsx` | 移除 `models` TAB_META 条目与 `IconCpu` 引用 |
| `frontend/src/app/regions/RightPanel.tsx` | 移除 `activeTool !== 'models'` 渲染块与 `ProviderManager` lazy import |
| `frontend/src/app/regions/right-panel/hooks/useRightPanelViewProps.ts` | `badges` 移除 `models: 0` |
| `frontend/src/app/stores/slices/uiSliceWidths.ts` | `readRightTool` 移除 `'models'` 分支 |
| `frontend/src/app/stores/slices/uiSlice.ts` | `navigatorCollapsedByTool` 默认移除 `models: false` |
| `frontend/src/app/stores/actions/streamActions.ts` | `/model` 命令：改为 `setActiveRightTool('settings')` + `setActiveSettingsGroup('providers')` |
| 删除 | `useModelPanelProps.ts`、`ModelPanelProps`（types.ts）、`components/models/ProviderManager.tsx` |

### 6.2 设置"模型"分组

- **i18n**：`settingsProviders` → `settingsModels`（值 `'模型'`），`settingsProvidersDesc` → `settingsModelsDesc`；zh-CN 与 en-US 同步；新增开关、默认模型、批量操作等文案 key。
- **`SettingsNav.tsx`**：`providers` 分组的 `labelKey` 改为 `settingsModels`。
- **新组件** `frontend/src/app/features/model-settings/ModelSettings.tsx`（两区式）：

  **上区 · 供应商卡片**（并入原 `ProviderManager` 全部能力）：
  - 状态点（hasKey/无需密钥 → 已连接图标）
  - 供应商启用**总开关**（→ `setProviderEnabled`）
  - 展开区：base URL、密钥状态 chip、API 密钥输入（保存/清除，show/hide）、测试连接、获取最新模型、移除自定义供应商
  - 右上"添加自定义供应商"按钮（复用 `CustomProviderDialog`）

  **下区 · 全局启用模型列表**：
  - 按供应商分组列出全部模型
  - 每个模型一个启用/禁用开关（→ `toggleModel`）
  - "设为默认模型"（→ `setDefaultModel`，标记当前默认）
  - 每供应商批量"全部启用 / 全部禁用"

- **`ModelPicker.tsx`**（状态栏/底部栏使用）：
  - 过滤：只展示 `isModelEnabled(provider, model)` 为真的模型；供应商级禁用则整组隐藏。
- **删除** `features/provider-manager/`（`ProviderSettings.tsx`/`ProviderList.tsx`/`ProviderConfig.tsx`）。
- **`SettingsPanel.tsx`**：`SETTINGS_COMPONENTS` 的 `providers` 键改为渲染 `ModelSettings`。

> 决策点：`CustomProviderDialog`（`components/models/`）保留复用；`ModelPicker` 保留在 `components/models/`。

---

## 7. 第 5 节 · 测试与质量

### Rust
- `config.rs`：默认值、`enabled_models` 序列化往返
- `app.rs`：`enabled_models` 补丁合并
- `provider.rs`：`list_providers` 合并逻辑（有/无 config 条目）

### 前端
- `ModelSettings` 组件测试：开关切换、默认模型标记、供应商卡片展开/密钥/测试连接/移除
- `providerActions` 测试：`toggleModel`/`setProviderEnabled`/`setDefaultModel` 生成的 patch 正确
- `isModelEnabled` 纯函数测试
- `ModelPicker` 过滤测试
- `preview-model` bridge 测试（listProviders/testConnection/enabled 合并）
- i18n `keys.test.ts` 校验（新 key 双语对齐）

### 质量门禁
```
cargo test --workspace
cargo clippy --workspace --all-targets -- -D warnings
pnpm --dir frontend run lint
pnpm --dir frontend run test
```

---

## 8. 风险与对策

| 风险 | 对策 |
|------|------|
| `ToolId` 移除 `models` 后残留引用导致编译失败 | 全局搜索 `'models'`/`toolModels`/`ModelPanelProps`，逐项清理（已列波及面） |
| 浏览器预览与桌面行为差异 | `preview-model.ts` 与 `mock-provider.ts` 形状完全对齐后端；预览模拟连接仅作为开发/QA 面 |
| 启用状态与既有 `selectedModelId` 冲突 | `selectModel` 运行时选择不变；`setDefaultModel` 写 config `model_id` 作为持久默认，两套并存不冲突 |
| 默认配置改动影响现状 | 仅补全 7 供应商条目 + 修正 `model_id` 对齐，不改启用默认值（deepseek/minimax 保持 enabled） |

---

## 9. 非目标（YAGNI）

- 不改 `ModelDefinition` 结构（不加 `enabled` 字段）
- 不引入"供应商优先级" UI（`priority` 保持 config 字段，不在设置页暴露）
- 不做 Provider 配置热重载之外的代码级热重载
- 不做模型分组/标签等附加组织能力
