# 计划：模型设置面板（合并/重构/完善）— 已对齐批准规格

> 治理依据：`docs/superpowers/specs/2026-08-05-model-settings-design.md`（已批准，commit `02d1d8a7`）。本计划是该规格的执行契约。所有与规格冲突处以规格为准；下列条目已按实际代码库核实修正。

## Overview

1. 设置导航"模型供应商"→"模型"（内部分组 id 沿用 `providers`，i18n key 重命名 `settingsProviders`→`settingsModels`）
2. 删除右侧面板 `models` 工具标签，其全部能力并入设置"模型"页（两区式：上区供应商卡片 + 下区全局启用模型列表）
3. 逐模型启用/禁用 + 供应商总开关 + 默认模型，`ModelProviderPreference.enabled_models` 后端配置持久化
4. 双端一致：`preview-model.ts` provider 命令真实实现（localStorage 持久化），`mock-provider.ts` 真实形状，`preview-bridge/index.ts` 切换真实实现
5. `ModelPicker` / 状态栏只展示启用供应商下的启用模型

## Prerequisites

- [x] 设计规格已批准（commit `02d1d8a7`）
- [x] 分支 `model-settings` 已创建
- [x] 关键文件路径已核实

## 已核实事实（与规格的偏差修正）

- `useModelPanelProps.ts` 与 `types.ts` 的 `ModelPanelProps` **不存在**，规格 §6.1 删除列表中的这两项跳过
- `components/models/` 含：`ProviderManager.tsx`（删除）、`CustomProviderDialog.tsx`（保留复用）、`ModelPicker.tsx`（保留+过滤）
- `features/provider-manager/` 含：`ProviderSettings.tsx` / `ProviderList.tsx` / `ProviderConfig.tsx`（全部删除，能力并入新组件）
- `preview-bridge/index.ts:71-73`：`previewBridge = { ...mockDigitalLifeBridge, ... }`，`provider` 桥当前来自 mock spread → 需覆盖为 `modelBridge.provider`（规格 §4.3）
- 类型管线：`frontend/src/shared/ipc-types.generated.ts` 为**手动维护**共享类型真源
- `toolModels` i18n key 仅被 `ToolSwitcher` 使用，删除标签时一并删除

## File Map

| 层 | 文件 | 变更 |
|----|------|------|
| Rust | `crates/types/src/types/config.rs` | `enabled_models` 双字段 + Default 补全 7 供应商 |
| Rust | `src-tauri/src/commands/app.rs` | patch 合并 `enabled_models` |
| Rust | `src-tauri/src/commands/provider.rs` | `ProviderStatus` + `enabled/enabled_models`，`list_providers` 合并 config |
| TS 类型 | `frontend/src/shared/ipc-types.generated.ts` | `enabledModels` 双处 |
| TS 类型 | `frontend/src/shared/ipc/provider.ts` | `ProviderStatus` + `enabled/enabledModels` |
| TS 合并 | `frontend/src/shared/preferencesMerger.ts` | 校验/补全 `enabledModels` 合并 |
| Store | `frontend/src/app/stores/actions/providerActions.ts` | + `toggleModel` / `setProviderEnabled` / `setDefaultModel` |
| Store | `frontend/src/app/stores/slices/providerSlice.ts` | 状态承载（如需） |
| 工具 | `frontend/src/shared/modelUtils.ts`（或 app/utils） | `isModelEnabled` 纯函数 |
| 桥接 | `frontend/src/preview-bridge/preview-model.ts` | provider 命令真实实现 + 密钥/自定义供应商内存+localStorage |
| 桥接 | `frontend/src/preview-bridge/preview-storage.ts` | 扩展持久化 provider 状态（密钥/自定义供应商/enabled） |
| 桥接 | `frontend/src/preview-bridge/index.ts` | `provider` 覆盖为 `modelBridge.provider` |
| 桥接 | `frontend/src/mock/mock-provider.ts` | 真实形状（7 供应商 + 静态模型 + enabled/enabledModels） |
| UI 新 | `frontend/src/app/features/model-settings/ModelSettings.tsx` | 两区式组件 |
| UI 新 | `frontend/src/app/features/model-settings/`（如需要子组件） | 供应商卡片 / 模型列表 |
| UI 删 | `frontend/src/app/features/provider-manager/` | 整个目录删除 |
| UI 删 | `frontend/src/app/components/models/ProviderManager.tsx` | 删除 |
| UI 接 | `frontend/src/app/components/settings/SettingsPanel.tsx` | `providers` → `ModelSettings` |
| UI 接 | `frontend/src/app/components/settings/SettingsNav.tsx` | labelKey `settingsProviders`→`settingsModels` |
| UI 滤 | `frontend/src/app/components/models/ModelPicker.tsx` + `StatusBar.tsx` | isModelEnabled 过滤 |
| UI 删 | `types.ts` / `ToolSwitcher.tsx` / `RightPanel.tsx` / `useRightPanelViewProps.ts` / `uiSliceWidths.ts` / `uiSlice.ts` / `streamActions.ts` | 移除 models 工具 |
| i18n | `zh-CN/{settings,models}.ts` + en-US | key 重命名 + 新 key |
| CSS | `frontend/src/app/styles/` | 两区式样式（设计 Token） |

## 全局约束（binding）

1. 逐模型开关语义：`enabled_models` 空 = 全部启用；显式列表 = 仅列表内启用
2. 内部分组 id 保持 `providers`，不改 `SettingsGroupId`
3. `ModelDefinition` 不加 `enabled` 字段
4. 双端一致硬规则：Tauri 与浏览器行为一致；provider 桥接三端对齐
5. 凭据安全：Tauri 走 keyring（`crates/credential/`）；预览模式 API key 不写 localStorage（模块级内存）
6. 默认启用保持 deepseek/minimax（不改现状默认），deepseek `model_id` 修正为 `deepseek-chat`
7. UI 文案全部 i18n；无 `"all"` 通配权限；CSS 设计 Token
8. TDD 红绿先行（每任务先写测试）

## Tasks

### Task 1 — Rust 配置类型：`enabled_models` + 默认配置补全

文件：`crates/types/src/types/config.rs`

**测试先行**（`#[cfg(test)]` 新增）：
- `default_preferences_cover_all_builtin_providers`：Default 含 7 供应商（deepseek/minimax/openai/anthropic/google/ollama/openrouter），每项 `enabled && priority>0 && !model_id.is_empty()`
- `deepseek_default_model_matches_gateway`：`default().providers["deepseek"].model_id == "deepseek-chat"`
- `enabled_models_serde_roundtrip`：序列化→反序列化保持；无该字段的旧 JSON 反序列化后为 `[]`

**实现**：
- `ModelProviderPreference` 加 `#[serde(default)] pub enabled_models: Vec<String>`
- `ModelProviderPreferencePatch` 加 `#[ts(optional)] pub enabled_models: Option<Vec<String>>`
- `ModelPreferences::default()`：7 供应商全量，priority 1..7（deepseek=1,minimax=2,openai=3,anthropic=4,google=5,ollama=6,openrouter=7），`model_id = default_model_for_provider(id)`，deepseek 用 `deepseek-chat`

### Task 2 — Rust patch 合并：`enabled_models`

文件：`src-tauri/src/commands/app.rs`

**测试先行**：抽出纯函数 `fn apply_model_patch(entry: &mut ModelProviderPreference, patch: ModelProviderPreferencePatch)`；单测：`enabled_models` 整体替换、`Some(vec![])` 清空、`None` 不改动、其余字段不受影响

**实现**：`app_update_preferences` 的 `model_preferences` 分支增加：
```rust
if let Some(enabled_models) = patch.enabled_models {
    entry.enabled_models = enabled_models;
}
```

### Task 3 — Rust list_providers 合并启用状态

文件：`src-tauri/src/commands/provider.rs`

**测试先行**：抽纯函数 `fn merge_enabled(entry: Option<&ModelProviderPreference>) -> (bool, Vec<String>)`（无条目 → `(true, vec![])`；有条目 → `(entry.enabled, entry.enabled_models.clone())`）；单测有/无条目两分支

**实现**：
- `ProviderStatus` 加 `pub enabled: bool`、`pub enabled_models: Vec<String>`
- `map_def_to_status` 增加 config 条目参数，`list_providers` 读取 `state.config.model_preferences.providers` 传入

### Task 4 — 前端共享类型同步

文件：`frontend/src/shared/ipc-types.generated.ts`、`frontend/src/shared/ipc/provider.ts`、`frontend/src/shared/preferencesMerger.ts`

**测试先行**（`preferencesMerger.test.ts`）：patch 带 `enabledModels:['a']` 合并生效；带 `enabledModels:[]` 清空

**实现**：
- `ipc-types.generated.ts`：`ModelProviderPreference` + `enabledModels: string[]`；`ModelProviderPreferencePatch` + `enabledModels?: string[]`
- `shared/ipc/provider.ts`：`ProviderStatus` + `enabled: boolean`、`enabledModels: string[]`
- `preferencesMerger.ts`：确认 spread 覆盖（数组整体替换语义）

### Task 5 — Store actions + isModelEnabled 选择器

文件：`frontend/src/app/stores/actions/providerActions.ts`、`providerSlice.ts`（如需）、新建 `frontend/src/shared/modelUtils.ts`

**测试先行**：
- `isModelEnabled` 纯函数测试：`enabled=false`→false；`enabledModels=[]`→true；非空含 id→true；非空不含→false
- `providerActions.test.ts`（或新文件）：`toggleModel`（从空启用→禁用产生"全部减一"列表；从显式列表→启用 append、禁用 remove）、`setProviderEnabled`、`setDefaultModel` 生成的 patch 正确（mock bridge 断言 `app.updatePreferences` 调用参数）

**实现**（`modelUtils.ts`）：
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
`providerActions.ts` 新增三 action（调用 `window.digitalLife.app.updatePreferences` 后 `fetchProviders()`）：
- `toggleModel(providerId, modelId, enabled)`：读 `appInfo.config.modelPreferences.providers[providerId].enabledModels`，启用 append、禁用 remove，结果为显式列表
- `setProviderEnabled(providerId, enabled)`：patch `{ enabled }`
- `setDefaultModel(providerId, modelId)`：patch `{ modelId }`

### Task 6 — 桥接三端对齐

文件：`preview-model.ts`、`preview-storage.ts`、`preview-bridge/index.ts`、`mock-provider.ts`

**测试先行**：
- `preview-model.test.ts`（新建）：`listProviders` 返回 7 供应商、enabled/enabledModels 合并自偏好；`setProviderApiKey`/`hasProviderApiKey` 内存一致；`updatePreferences` 写 enabledModels 后 `createBaseAppInfo` 保留；`testProviderConnection` 有密钥→connected
- `mock-provider.test.ts`：`listProviders` 7 条含 enabled/enabledModels、`fetchProviderModels` 非空

**实现**：
- 新建 `frontend/src/shared/modelCatalog.ts`：7 供应商静态目录（id/name/description/requiresKey/models），模型镜像 `setup.rs`（deepseek: deepseek-chat；minimax: MiniMax-M2.7；openai/anthropic/google/ollama/openrouter 镜像 adapter `supported_models()` 或代表性列表，deepseek/minimax 必须与 setup.rs 完全一致）
- `preview-model.ts`：`provider` 桥真实实现——`listProviders` 从 `modelCatalog` + `loadPreviewPreferences()` 合并；`setProviderApiKey`/`clearProviderApiKey`/`hasProviderApiKey` 模块级内存 Map（不落盘）；`testProviderConnection` 有 key→`{connected:true}`，无→`{connected:false,error}`；`fetchProviderModels`→目录模型；`addCustomProvider`/`removeCustomProvider` 内存+localStorage
- `preview-storage.ts`：扩展持久化（自定义供应商、enabled 状态；密钥不落盘）
- `preview-bridge/index.ts`：`provider: modelBridge.provider` 覆盖 mock spread
- `mock-provider.ts`：`listProviders` 返回 7 供应商真实形状（含静态模型、enabled=true、enabledModels=[]），`fetchProviderModels` 返回目录

### Task 7 — 设置"模型"页两区式 UI

文件：新建 `frontend/src/app/features/model-settings/ModelSettings.tsx`（+ 子组件），删除 `features/provider-manager/`，`SettingsPanel.tsx`、`SettingsNav.tsx`、i18n、CSS

**测试先行**：
- `ModelSettings.test.tsx`：上区渲染供应商卡片（状态点/总开关/展开区密钥保存清除/测试连接/获取模型/移除自定义）；下区渲染模型开关行（空 enabledModels 显示"全部启用"提示，开关切换调 `toggleModel`）；批量全部启用/禁用调对应 action
- i18n `keys.test.ts`：`settingsModels`/`settingsModelsDesc` 双语对齐；无残留 `settingsProviders` 引用

**实现**：
- 上区供应商卡片（并入原 ProviderManager 全部能力）：状态点（hasKey/无需密钥→已连接）、供应商总开关（`setProviderEnabled`）、展开区（base URL、密钥状态 chip、API key 输入保存/清除 show/hide、`testConnection`、`fetchModels`、移除自定义供应商）、右上"添加自定义供应商"（复用 `CustomProviderDialog`）
- 下区全局启用模型列表：按供应商分组全部模型；每模型开关（`toggleModel`）+ "设为默认模型"（`setDefaultModel`，标记当前默认）；每供应商批量"全部启用/全部禁用"（全部启用=`enabledModels=[]`，全部禁用=`setProviderEnabled(false)`）
- `SettingsPanel.tsx`：`providers` 键 → `ModelSettings` 组件
- `SettingsNav.tsx`：`labelKey: 'settingsProviders'` → `'settingsModels'`
- i18n：zh/en `settings.ts` 的 `settingsProviders`→`settingsModels`（'模型'）、`settingsProvidersDesc`→`settingsModelsDesc`；`models.ts` 新增开关/默认模型/批量/全部启用等文案 key
- CSS：设计 Token 两区式（供应商卡片网格 + 模型开关行 + 状态点）

### Task 8 — 删除右侧面板 `models` 工具

文件：`types.ts`、`right-panel/ToolSwitcher.tsx`、`regions/RightPanel.tsx`、`right-panel/hooks/useRightPanelViewProps.ts`、`uiSliceWidths.ts`、`uiSlice.ts`、`streamActions.ts`、删除 `components/models/ProviderManager.tsx`、i18n `toolModels`

**测试先行**：
- `ToolSwitcher.test.tsx`：不再渲染 models 项
- `RightPanel.test.tsx`：`activeRightTool==='models'` 无 ProviderManager 区域
- `streamActions.test.ts`：`/model` 命令 → `activeRightTool==='settings'` 且 `activeSettingsGroup==='providers'`

**实现**：
- `types.ts`：`ToolId` 移除 `'models'`
- `ToolSwitcher.tsx`：移除 models TAB_META（`Ctrl+Shift+M`、IconCpu、`toolModels`）
- `RightPanel.tsx`：移除 models region + ProviderManager lazy import
- `useRightPanelViewProps.ts`：badges 移除 `models: 0`
- `uiSlice.ts`：`navigatorCollapsedByTool` 移除 `models: false`
- `uiSliceWidths.ts`：`readRightTool` 移除 `'models'`
- `streamActions.ts`：`/model` → `setActiveRightTool('settings')` + `setActiveSettingsGroup('providers')`
- 删除 `components/models/ProviderManager.tsx`；`toolModels` i18n key 删除
- 全局 grep `'models'` 确认无残留

### Task 9 — ModelPicker / 状态栏过滤

文件：`components/models/ModelPicker.tsx`、`regions/StatusBar.tsx`

**测试先行**：`ModelPicker` 过滤测试——仅展示 `isModelEnabled` 为真的模型，供应商级禁用整组隐藏

**实现**：
- `ModelPicker.tsx`：候选项过滤 `isModelEnabled(provider, model)`
- `StatusBar.tsx`：供应商展示过滤（仅启用供应商，模型用启用模型）

### Task 10 — 全量验证

```
cargo test --workspace
cargo clippy --workspace --all-targets -- -D warnings
pnpm --dir frontend run test
pnpm --dir frontend run lint
```
- 手动走查（run-project-surfaces）：设置"模型"页两区、开关持久化、`/model` 命令、双端一致

## Post-Execution Verification

1. 全部测试通过且计数增长（581+ Rust / 1072+ 前端）
2. clippy 0 警告、lint 0 errors
3. `grep "settingsProviders" frontend/src` 无残留（key 已重命名）
4. 双端手动走查通过

## Rollback / Completion

- 每 Task 独立小步提交（Conventional Commit）
- 完成后 closing-workflow 收尾
