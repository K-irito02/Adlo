# 设计 — 模型设置 UI 优化与缺陷修复

日期：2026-08-05
分支：`model-settings`（在 per-model enable/disable 功能之上）

## 背景

模型设置页（`features/model-settings/`：`ModelSettings.tsx`、`ProviderCard.tsx`、`ModelToggleList.tsx`）已实现两区式 UI（上区供应商卡片、下区已启用模型）。本设计针对 15 项 UI 优化与缺陷修复，其中 4 项为缺陷（root-cause-resolution 已确认根因），11 项为设计调整。

## 已确认决策

| 决策点 | 结论 |
|--------|------|
| 第1项 默认展示卡片 | 按当前顺序取前 5，不固定集合 |
| 第12项 "全部关闭"数据模型 | 三态数据模型扩展（enabledModels: string[] \| null） |
| 第7项 小圆角范围 | 仅模型设置区域 |
| 第15项 弹窗形态 | 居中模态弹窗 |
| 第2项 搜索范围 | 仅过滤"供应商"上区 |
| 第10项 setDefaultModel | 彻底移除该 action |

## A. 三态数据模型

`enabledModels` 语义（`string[] | null`）：

| 值 | 含义 |
|----|------|
| `null` | 全部启用（默认态） |
| `[]` | 全部关闭 |
| `[ids]` | 白名单子集 |

### Rust 改动

- `crates/types/src/types/config.rs`
  - `ModelProviderPreference.enabled_models: Vec<String>` → `Option<Vec<String>>`（保留 `#[serde(default)]`）
  - `ModelProviderPreferencePatch.enabled_models: Option<Vec<String>>` → `Option<Option<Vec<String>>>`（`Option<Option<>>` 使 serde 能区分"JSON 缺省"→外层 `None` 与"JSON null"→`Some(None)`）
  - `ModelPreferences::default()` 中 `enabled_models: Vec::new()` → `None`
- `src-tauri/src/commands/app.rs` `apply_model_patch`（约 99-100 行）：`if let Some(enabled_models) = patch.enabled_models { entry.enabled_models = Some(enabled_models); }`（`Option<Option<>>` 解包后赋 `Option<Vec>`）；`or_insert_with` 默认创建 `enabled_models: None`
- `src-tauri/src/commands/provider.rs`
  - `ProviderStatus.enabled_models: Vec<String>` → `Option<Vec<String>>`
  - `merge_enabled`：`Some(e) => (e.enabled, e.enabled_models.clone())`、`None => (true, None)`

### 前端类型

- `frontend/src/shared/ipc-types.generated.ts`（手工维护真源）
  - `ModelProviderPreference.enabledModels: string[]` → `string[] | null`
  - `ModelProviderPreferencePatch.enabledModels?: string[]` → `string[] | null`
- `frontend/src/shared/ipc/provider.ts` `ProviderStatus.enabledModels: string[]` → `string[] | null`

### 前端合并与工具

- `frontend/src/shared/preferencesMerger.ts`
  - 默认创建条目 `enabledModels: []` → `null`
  - 合并 `enabledModels: providerPatch.enabledModels ?? existing.enabledModels` → 需区分显式 null：`'enabledModels' in providerPatch ? providerPatch.enabledModels : existing.enabledModels`（`??` 会吞掉 null，必须用 in/undefined 判断）
- `frontend/src/shared/modelUtils.ts`
  - `isModelEnabled`：`provider.enabled===false → false`；`provider.enabledModels === null → true`；否则 `enabledModels.includes(modelId)`
  - `filterEnabledOptions` 复用 isModelEnabled（自动正确）
- `frontend/src/preview-bridge/preview-model.ts`
  - `defaultModelPreferences`（约 46 行）`enabledModels: []` → `null`
  - `catalogToStatus`（约 71 行）`pref?.enabledModels ?? []` → `?? null`
  - `customToStatus`（约 94 行）`enabledModels: []` → `null`（自定义供应商无三态配置 → 全启用）

### Mock 与测试数据

- `frontend/src/mock/mock-shared-workspace.ts`、`mock-provider.ts`：`enabledModels: []`（原意"全启用"）→ `null`；显式表达"全部关闭"用 `[]`
- 相关测试（Rust `config.rs` serde 测试、`app.rs` patch 测试、`provider.rs` ProviderStatus 测试；前端 `preferencesMerger.test.ts`、`modelUtils.test.ts`、`preview-model.test.ts`、`providerActions.test.ts`、`mock-provider.test.ts`）同步三态断言

## B. 供应商上区卡片

1. **单列 + 前5 + 查看更多**：`.adl-model-settings__provider-grid` 改 `grid-template-columns: 1fr`；默认渲染 `providers.slice(0, 5)`；当 `providers.length > 5` 显示"查看更多供应商"文字按钮，点击切换展开全部；展开后容器 `max-height`（约容纳 8-10 张卡）+ `overflow-y: auto`
2. **搜索框**：`ModelSettings.tsx` "供应商"区标题行右侧加搜索输入（图标+input，i18n placeholder）；`query` 过滤 `providers`（name/id 不区分大小写），仅作用于上区卡片；有搜索词时忽略前5限制（显示全部匹配）
3. **整卡可点展开/折叠**：`ProviderCard` header 重构——可点击区域（`role="button"`/`onClick`，含状态点/名称/meta/箭头）占满除开关外的整行，`onClick` 切换 `expanded`；开关按钮独立且 `stopPropagation`（避免点击开关触发展开）；`.adl-provider-card__header:hover`（或 `.__expand:hover`）灰底覆盖整行除开关区域
4. **密钥输入框**：`.adl-provider-card__key-input` 去边框（`border: none; background: var(--bg-input)`）；`.adl-provider-card__key-input-group` 改 `position: relative`，眼睛按钮绝对定位右侧、输入框 `padding-right` 留空间
5. **获取最新模型**：从展开区 actions 移除；`ModelToggleList` 分组 header 供应商名右侧加图标按钮（`IconRefreshCw`），`onClick` 调 `fetchModels`，仅图标 + 原生 `title`（用 i18n key 值）
6. **测试连接 + 保存同一行**：展开区布局调整为"测试连接 + 保存密钥"在同一行（`key-actions` 与 `actions` 合并或并排）
7. **小圆角**：模型设置区域内 `.adl-btn` 统一 `border-radius: var(--radius)`（4px），作用域限定 `.adl-provider-card .adl-btn, .adl-model-settings .adl-btn`，不改全局
15. **添加自定义 Provider**：
    - 按钮样式：从 `adl-btn--primary` 改 ghost/次级样式（非蓝色背景）、4px 圆角
    - 弹窗：补齐 `.adl-dialog-overlay`/`.adl-dialog` 等类 CSS——`position: fixed` 全屏遮罩（`var(--bg-overlay)` + blur）+ 居中卡片（`surface-elevated`、圆角、shadow、z-index），复用 `CustomProviderDialog` 现有 role=dialog 结构
    - i18n：zh `providerManagerAddCustom` 中 "Provider" → "供应商"（zh 文案调整）

## C. 已启用模型下区

8. `ModelToggleList` 只渲染 `providers.filter((p) => p.enabled)` 的分组；删除 `modelProviderDisabledHint` 徽章（含 i18n key）
9. 删除 `modelAllEnabledHint` 提示行（含 i18n key）
10. 删除"设为默认模型"按钮 + "默认"徽章；**彻底移除 `setDefaultModel` action**：
    - `providerActions.ts` 删除 `setDefaultModel`
    - `StoreState.ts` 删除签名
    - `ModelToggleList.tsx` 删除 `setDefaultModel`/`defaultModelId`/`isDefault`/徽章
    - 测试清理：`providerActions.test.ts`、`ModelSettings.test.tsx`
    - i18n 删除 `modelSetDefault`、`modelSetDefaultAria`、`modelDefaultBadge`
    - 保留 `modelId` 字段（内部路由默认模型用）
12. 文案 `modelDisableAll`："全部禁用" → "全部关闭"（zh/en 同步）；`ModelToggleList` 批量按钮改调新 action `setAllModelsEnabled(providerId, enableAll)`：
    - `enableAll=true` → `enabledModels: null`
    - `enableAll=false` → `enabledModels: []`
    - **不动** provider.enabled

## D. 卡顿/加载修复（缺陷 #11）

- `providerActions.ts`：
  - 新增 `setAllModelsEnabled(providerId, enableAll)`：`updatePreferences({ modelPreferences: { [providerId]: { enabledModels: enableAll ? null : [] } } })` + 乐观补丁
  - `toggleModel`、`setProviderEnabled`：`updatePreferences` 后改为**乐观补丁**本地 `providers`（enabled/enabledModels），**删除** `await fetchProviders()`
  - 乐观补丁逻辑：`set((s) => ({ providers: s.providers.map((p) => p.id === providerId ? { ...p, ...computed } : p) }))`；`computed` 与 updatePreferences 后 appInfo.config.modelPreferences 保持一致
- `ModelSettings.tsx`：LoadingRow 条件改 `isFetchingProviders && providers.length === 0`（仅首次加载）；后台刷新不卸载两区 UI

## E. 开关配色（设计项 14）

- `.adl-settings-toggle.is-on .adl-settings-toggle__track`：`background: var(--accent)` → `var(--text-primary)`（暗色主题 `#d8d8d8`≈白、亮色主题 `#222222`≈黑）
- `.adl-settings-toggle.is-on .adl-settings-toggle__thumb`：保持 `var(--text-inverse)` 不变（亮色主题 `#ffffff`、暗色主题 `#141414`），与黑白轨道形成正确对比

## F. 测试与门禁

- TDD 红→绿，涉及：`ModelSettings.test.tsx`（前5+查看更多、搜索、整卡点击、密钥框、批量按钮、关闭供应商不显示）、`providerActions.test.ts`（三态 toggleModel、setAllModelsEnabled、乐观补丁、无 fetchProviders 调用、setDefaultModel 移除）、`preferencesMerger.test.ts`、`modelUtils.test.ts`、`preview-model.test.ts`、`mock-provider.test.ts`、Rust `config.rs`/`app.rs`/`provider.rs`
- 门禁：`cargo test --workspace`、`cargo clippy --workspace --all-targets -- -D warnings`、`pnpm --dir frontend run test`、`pnpm --dir frontend run lint`、`pnpm --dir frontend run check:i18n`
- 手动走查（run-project-surfaces）：两区 UI、开关持久化、`/model` 命令、双端一致
