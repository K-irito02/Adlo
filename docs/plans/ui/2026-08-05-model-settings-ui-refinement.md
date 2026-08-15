# Model Settings UI Refinement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 完成模型设置页 15 项 UI 优化与缺陷修复（单列卡片/搜索/整卡展开/密钥框/批量按钮三态/无卡顿加载/开关配色/居中弹窗等）。

**Architecture:** 三态数据模型（`enabledModels: string[] | null`：null=全部启用、[]=全部关闭、[ids]=白名单）贯穿 Rust config/merge/list_providers、前端类型/合并器/工具、preview 与 mock 桥；动作层改为乐观本地补丁消除卡顿；UI 层两区重构。

**Tech Stack:** Rust（serde + tauri command）、React 19 + Zustand + TypeScript、CSS 设计 Token、i18n 双语、Vitest / cargo test。

## Global Constraints

- 三态语义：`enabledModels === null` = 全部启用；`[]` = 全部关闭；`[ids]` = 白名单子集
- Rust `ModelProviderPreference.enabled_models: Option<Vec<String>>`（`#[serde(default)]`）
- Rust `ModelProviderPreferencePatch.enabled_models: Option<Option<Vec<String>>>`（外层区分"缺省"vs"显式 null"）
- 前端合并器对 `enabledModels` 必须用 `'enabledModels' in patch` 判断（`??` 会吞掉 null）
- 所有 UI 展示文本用 i18n key（禁硬编码）；`check:i18n` 必须通过
- 双端一致（Tauri + preview 桥行为一致）
- 每个任务 TDD：先红后绿，聚焦测试循环，提交前全量 typecheck
- 门禁命令：`cargo test --workspace`、`cargo clippy --workspace --all-targets -- -D warnings`、`pnpm --dir frontend run test`、`pnpm --dir frontend run lint`、`pnpm --dir frontend run check:i18n`
- 设计文档：`docs/superpowers/specs/2026-08-05-model-settings-ui-refinement-design.md`

---

### Task 1: Rust 三态数据模型

**Files:**
- Modify: `crates/types/src/types/config.rs:129-135`（`ModelProviderPreference`）、`:196-205`（`ModelProviderPreferencePatch`）、`:157`（`ModelPreferences::default`）、`:332-352`（serde tests）
- Modify: `src-tauri/src/commands/app.rs:99-101`（`apply_model_patch`）、`:134-141`（`or_insert_with` 默认）、`:372-455`（patch tests）
- Modify: `src-tauri/src/commands/provider.rs:13-26`（`ProviderStatus`）、`:34-39`（`merge_enabled`）、`:377-450`（tests）

**Interfaces:**
- Consumes: 无
- Produces: `ModelProviderPreference { enabled, priority, model_id, enabled_models: Option<Vec<String>> }`；`ModelProviderPreferencePatch.enabled_models: Option<Option<Vec<String>>>`；`ProviderStatus.enabled_models: Option<Vec<String>>`（JSON camelCase `enabledModels`，`null` 序列化为 JSON null）

- [ ] **Step 1: 改 config.rs 结构并更新 serde 测试（红）**

`crates/types/src/types/config.rs`：
```rust
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct ModelProviderPreference {
    pub enabled: bool,
    pub priority: i32,
    pub model_id: String,
    #[serde(default)]
    pub enabled_models: Option<Vec<String>>,
}
```
`ModelPreferences::default()` 中（`:157`）：`enabled_models: Vec::new()` → `enabled_models: None`。

`ModelProviderPreferencePatch`（`:196-205`）：
```rust
pub struct ModelProviderPreferencePatch {
    #[ts(optional)]
    pub enabled: Option<bool>,
    #[ts(optional)]
    pub priority: Option<i32>,
    #[ts(optional)]
    pub model_id: Option<String>,
    #[ts(optional)]
    pub enabled_models: Option<Option<Vec<String>>>,
}
```

serde 测试段（`:332-352`）改为：
```rust
mod enabled_models_serde_tests {
    use super::*;

    #[test]
    fn enabled_models_serde_roundtrip() {
        let pref = ModelProviderPreference {
            enabled: true,
            priority: 1,
            model_id: "deepseek-chat".to_string(),
            enabled_models: Some(vec!["a".to_string(), "b".to_string()]),
        };
        let json = serde_json::to_string(&pref).unwrap();
        let back: ModelProviderPreference = serde_json::from_str(&json).unwrap();
        assert_eq!(back.enabled_models, Some(vec!["a".to_string(), "b".to_string()]));
    }

    #[test]
    fn missing_enabled_models_defaults_to_none() {
        let json = r#"{"enabled":true,"priority":1,"modelId":"deepseek-chat"}"#;
        let pref: ModelProviderPreference = serde_json::from_str(json).unwrap();
        assert!(pref.enabled_models.is_none());
    }

    #[test]
    fn explicit_null_enabled_models_serializes_as_null() {
        let pref = ModelProviderPreference {
            enabled: true,
            priority: 1,
            model_id: "deepseek-chat".to_string(),
            enabled_models: None,
        };
        let json = serde_json::to_value(&pref).unwrap();
        assert_eq!(json["enabledModels"], serde_json::Value::Null);
    }
}
```

- [ ] **Step 2: 运行确认失败**

Run: `cargo test -p adl-types enabled_models_serde_tests`
Expected: FAIL（类型/断言不匹配）

- [ ] **Step 3: 改 app.rs `apply_model_patch` 与默认创建**

`src-tauri/src/commands/app.rs:99-101`：
```rust
    if let Some(enabled_models) = patch.enabled_models {
        entry.enabled_models = enabled_models;
    }
```
（`patch.enabled_models` 外层 `Some` 解出 `Option<Vec<String>>` 直接赋给 `entry.enabled_models`，编译即可——无需改行。）

`:134-141` `or_insert_with` 默认：
```rust
                let entry =
                    config.model_preferences.providers.entry(provider).or_insert_with(|| {
                        adl_types::ModelProviderPreference {
                            enabled: true,
                            priority: 10,
                            model_id: provider_id.clone(),
                            enabled_models: None,
                        }
                    });
```

- [ ] **Step 4: 改 app.rs 测试（`:372-455`）**

`entry()`（`:375-382`）：
```rust
    fn entry() -> ModelProviderPreference {
        ModelProviderPreference {
            enabled: true,
            priority: 5,
            model_id: "default".into(),
            enabled_models: Some(vec!["old".into()]),
        }
    }
```
`enabled_models_some_replaces_list_entirely`（`:393`）：`enabled_models: Some(Some(vec!["a".into(), "b".into()]))`，断言 `assert_eq!(entry.enabled_models, Some(vec!["a".to_string(), "b".to_string()]));`
`enabled_models_some_empty_clears_list`（`:411`）：`Some(Some(vec![]))`，断言 `assert_eq!(entry.enabled_models, Some(vec![]));`
`enabled_models_none_leaves_list_unchanged`（`:429`）：`None`，断言 `assert_eq!(entry.enabled_models, Some(vec!["old".to_string()]));`
`other_fields_apply_independently_alongside_enabled_models`（`:447`）：`Some(Some(vec!["gpt-4".into()]))`，断言 `Some(vec!["gpt-4".to_string()])`
新增一个显式 null 用例：
```rust
    #[test]
    fn enabled_models_explicit_none_sets_all_enabled() {
        let mut entry = entry();
        apply_model_patch(
            &mut entry,
            ModelProviderPreferencePatch {
                enabled: None,
                priority: None,
                model_id: None,
                enabled_models: Some(None),
            },
        );
        assert!(entry.enabled_models.is_none());
        assert_eq!(entry.enabled_models, None);
    }
```

- [ ] **Step 5: 改 provider.rs `ProviderStatus` / `merge_enabled` / 测试**

`:13-26`：
```rust
    pub enabled: bool,
    pub enabled_models: Option<Vec<String>>,
```
`:34-39`：
```rust
fn merge_enabled(entry: Option<&adl_types::ModelProviderPreference>) -> (bool, Option<Vec<String>>) {
    match entry {
        Some(e) => (e.enabled, e.enabled_models.clone()),
        None => (true, None),
    }
}
```
`:378` `merge_enabled_no_entry_means_enabled_with_no_models`：`assert!(models.is_none());`
`:386-395` `merge_enabled_uses_entry_fields_when_present`：entry `enabled_models: Some(vec!["a".to_string()])`，断言 `assert_eq!(models, Some(vec!["a".to_string()]));`
`:399-408` `merge_enabled_disabled_provider`：entry `enabled_models: Some(vec![])`，断言 `assert_eq!(models, Some(vec![]));`
`:434` `provider_status_serializes_camel_case`：`enabled_models: Some(vec!["deepseek-chat".to_string()])`；camelCase 键断言循环已有 `enabledModels`，无需改。

- [ ] **Step 6: 运行 Rust 相关测试确认通过**

Run: `cargo test -p adl-types` 和 `cargo test -p ai-digital-life`
Expected: PASS（0 failed）

- [ ] **Step 7: Commit**

```bash
git add crates/types/src/types/config.rs src-tauri/src/commands/app.rs src-tauri/src/commands/provider.rs
git commit -m "feat(rust): tri-state enabled_models (null=all, []=none, ids=allowlist)"
```

---

### Task 2: 前端类型 / 合并器 / 工具 / 预览与 mock 三态

**Files:**
- Modify: `frontend/src/shared/ipc-types.generated.ts:25-37`
- Modify: `frontend/src/shared/ipc/provider.ts:23`
- Modify: `frontend/src/shared/preferencesMerger.ts:39-50`
- Modify: `frontend/src/shared/modelUtils.ts:3-26`
- Modify: `frontend/src/preview-bridge/preview-model.ts:46,71,94`
- Modify: `frontend/src/mock/mock-shared-workspace.ts:107-114`
- Modify: `frontend/src/mock/mock-provider.ts:26`
- Test: `frontend/src/shared/preferencesMerger.test.ts`、`frontend/src/shared/modelUtils.test.ts`、`frontend/src/preview-bridge/preview-model.test.ts`、`frontend/src/mock/mock-provider.test.ts`、`frontend/src/app/utils/settingsViewModel.test.ts`、`frontend/src/app/utils/sidebarViewModel.test.ts`

**Interfaces:**
- Consumes: Task 1 的 Rust 三态
- Produces: TS `ModelProviderPreference.enabledModels: string[] | null`；`ModelProviderPreferencePatch.enabledModels?: string[] | null`；`ProviderStatus.enabledModels: string[] | null`；`isModelEnabled(provider, modelId)` 三态实现

- [ ] **Step 1: 改类型文件（红先）**

`ipc-types.generated.ts`：
```ts
export interface ModelProviderPreference {
  enabled: boolean;
  priority: number;
  modelId: string;
  enabledModels: string[] | null;
}

export interface ModelProviderPreferencePatch {
  enabled?: boolean;
  priority?: number;
  modelId?: string;
  enabledModels?: string[] | null;
}
```
`ipc/provider.ts:23`：`enabledModels: string[];` → `enabledModels: string[] | null;`

- [ ] **Step 2: 改 preferencesMerger（默认 null + in 判断）**

`:39-50`：
```ts
      const key = providerId as keyof typeof nextProviders;
      const existing = nextProviders[key] ?? {
        enabled: true,
        priority: 10,
        modelId: providerId,
        enabledModels: null,
      };
      nextProviders[key] = {
        enabled: providerPatch.enabled ?? existing.enabled,
        priority: providerPatch.priority ?? existing.priority,
        modelId: providerPatch.modelId ?? existing.modelId,
        enabledModels:
          'enabledModels' in providerPatch ? providerPatch.enabledModels : existing.enabledModels,
      };
```

- [ ] **Step 3: 改 modelUtils 三态**

`modelUtils.ts`：
```ts
export function isModelEnabled(
  provider: Pick<ProviderStatus, 'enabled' | 'enabledModels'>,
  modelId: string,
): boolean {
  return (
    provider.enabled &&
    (provider.enabledModels === null || provider.enabledModels.includes(modelId))
  );
}
```
（`filterEnabledOptions` 复用 `isModelEnabled`，自动正确。）

- [ ] **Step 4: 改 preview 桥与 mock**

`preview-model.ts:46`：`enabledModels: []` → `enabledModels: null`
`preview-model.ts:71`：`enabledModels: pref?.enabledModels ?? [],` → `enabledModels: pref?.enabledModels ?? null,`
`preview-model.ts:94`：`enabledModels: [],` → `enabledModels: null,`
`mock-shared-workspace.ts:107-114`：所有 `enabledModels: []`（原意"全启用"）→ `enabledModels: null`
`mock-provider.ts:26`：同上的 `[]` → `null`

- [ ] **Step 5: 更新测试（红→绿）**

`modelUtils.test.ts`：新增/更新用例——`enabledModels: null` → true；`[]` → false；`['m1']` 只含 m1；`provider.enabled=false` → false。
`preferencesMerger.test.ts`：新增——patch `{ modelPreferences: { openai: { enabledModels: null } } }` 对已存在条目应显式置 null；对不存在条目创建 `enabledModels: null`；patch 缺省 `enabledModels` 保留 existing。
`preview-model.test.ts`、`mock-provider.test.ts`：`enabledModels` 断言改为 null（默认全启用）。
`settingsViewModel.test.ts`、`sidebarViewModel.test.ts`：引用 `enabledModels: []` 的 fixture/断言改为 `null`（若语义为全启用）。
先写断言 → 运行 `pnpm --dir frontend exec vitest run` 相关文件确认红 → 实现/修正 → 绿。

- [ ] **Step 6: 全量 typecheck + 聚焦测试**

Run: `pnpm --dir frontend run typecheck` 和聚焦 vitest 相关文件
Expected: typecheck 无错误，相关测试全绿

- [ ] **Step 7: Commit**

```bash
git add frontend/src/shared frontend/src/preview-bridge frontend/src/mock frontend/src/app/utils
git commit -m "feat(frontend): tri-state enabledModels types, merger, modelUtils, preview/mock"
```

---

### Task 3: providerActions 重构（setAllModelsEnabled + 乐观补丁）

**Files:**
- Modify: `frontend/src/app/stores/actions/providerActions.ts:104-142`
- Test: `frontend/src/app/stores/actions/providerActions.test.ts`

**Interfaces:**
- Consumes: Task 2 的三态类型与 `isModelEnabled`
- Produces: `setAllModelsEnabled(providerId: string, enableAll: boolean)`；`toggleModel`/`setProviderEnabled` 改为乐观本地补丁（patch 前置、去掉 `await fetchProviders()`）；模块级 `applyProviderStatusPatch(set, get, providerId, fields)` 辅助函数

- [ ] **Step 1: 写失败测试（红）**

`providerActions.test.ts` 新增/更新：
- `setAllModelsEnabled('deepseek', true)` → 调 `updatePreferences` 且 patch 的 `enabledModels === null`；store.providers 中 deepseek 的 `enabledModels === null`
- `setAllModelsEnabled('deepseek', false)` → patch `enabledModels === []`；providers 同步 `[]`
- `toggleModel('deepseek','deepseek-chat',false)`（当前 null=全启用）→ patch `enabledModels` 为"全部模型 id 去掉 deepseek-chat"；providers 同步
- `toggleModel('deepseek','deepseek-reasoner',true)`（当前 `['deepseek-chat']`）→ patch `['deepseek-chat','deepseek-reasoner']`
- `toggleModel` 在 `[]`（全关闭）时 disable 某模型 → no-op（不调 updatePreferences）
- `setProviderEnabled('deepseek', false)` → patch `enabled:false`；providers 同步 enabled=false
- **断言这些动作不再调用 `fetchProviders`**（mock 中 fetchProviders 应为未调用）
- 保留并适配已有用例的 fixture（`makeAppInfo` 的 `enabledModels: []` → `null`，见 `:17,:30`）

- [ ] **Step 2: 运行确认失败**

Run: `pnpm --dir frontend exec vitest run src/app/stores/actions/providerActions.test.ts`
Expected: FAIL

- [ ] **Step 3: 实现 providerActions**

`providerActions.ts` 顶部加 import 与辅助函数：
```ts
import type { ProviderStatus } from '../../../shared/ipc/provider';

function applyProviderStatusPatch(
  set: StoreApi<StoreState>['setState'],
  get: () => StoreState,
  providerId: string,
  fields: Partial<Pick<ProviderStatus, 'enabled' | 'enabledModels'>>,
) {
  set({
    providers: get().providers.map((p) => (p.id === providerId ? { ...p, ...fields } : p)),
  });
}
```
替换 `toggleModel`/`setProviderEnabled`（`:104-134`），新增 `setAllModelsEnabled`：
```ts
    setAllModelsEnabled: async (providerId: string, enableAll: boolean) => {
      clearError(get);
      const next: string[] | null = enableAll ? null : [];
      applyProviderStatusPatch(set, get, providerId, { enabledModels: next });
      await get().updatePreferences({
        modelPreferences: { [providerId]: { enabledModels: next } },
      });
    },

    toggleModel: async (providerId: string, modelId: string, enabled: boolean) => {
      clearError(get);
      const pref = get().appInfo?.config.modelPreferences.providers[providerId];
      const current: string[] | null = pref?.enabledModels ?? null;
      let next: string[] | null;
      if (enabled) {
        if (current === null) {
          next = [modelId];
        } else if (current.includes(modelId)) {
          return;
        } else {
          next = [...current, modelId];
        }
      } else {
        if (current === null) {
          const provider = get().providers.find((p) => p.id === providerId);
          next = (provider?.models ?? []).map((m) => m.id).filter((id) => id !== modelId);
        } else if (current.length === 0) {
          return;
        } else {
          next = current.filter((id) => id !== modelId);
        }
      }
      applyProviderStatusPatch(set, get, providerId, { enabledModels: next });
      await get().updatePreferences({
        modelPreferences: { [providerId]: { enabledModels: next } },
      });
    },

    setProviderEnabled: async (providerId: string, enabled: boolean) => {
      clearError(get);
      applyProviderStatusPatch(set, get, providerId, { enabled });
      await get().updatePreferences({
        modelPreferences: { [providerId]: { enabled } },
      });
    },
```
`setDefaultModel`（`:136-142`）**本任务保留不动**（Task 6 移除）。

- [ ] **Step 4: 运行确认通过**

Run: `pnpm --dir frontend exec vitest run src/app/stores/actions/providerActions.test.ts`
Expected: PASS

- [ ] **Step 5: 全量 typecheck + 相关测试**

Run: `pnpm --dir frontend run typecheck` + 聚焦 vitest（providerActions/ModelSettings 相关）
Expected: 无错误、全绿

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/stores/actions/providerActions.ts frontend/src/app/stores/actions/providerActions.test.ts
git commit -m "feat(stores): setAllModelsEnabled + optimistic provider patch, drop refetch on toggles"
```

---

### Task 4: ModelSettings 上区结构（单列/前5/查看更多/搜索/加载条件/添加按钮+弹窗）

**Files:**
- Modify: `frontend/src/app/features/model-settings/ModelSettings.tsx`
- Modify: `frontend/src/styles/components/settings.css:651-656,632-649`（provider-grid 单列 + 展开 max-height）
- Modify: `frontend/src/styles/components/dialog.css`（新增 `.adl-dialog-overlay`/`.adl-dialog` 居中模态）
- Modify: `frontend/src/app/i18n/en-US/models.ts`、`frontend/src/app/i18n/zh-CN/models.ts`（新增查看更多/收起、搜索 keys）
- Modify: `frontend/src/app/i18n/zh-CN/provider.ts`（`providerManagerAddCustom` 中 Provider→供应商）
- Test: `frontend/src/app/features/model-settings/ModelSettings.test.tsx`

**Interfaces:**
- Consumes: Task 3 动作
- Produces: `ModelSettings` 状态——`searchQuery`、`showMoreProviders`；上区渲染 `displayProviders`（搜索时=全部匹配；否则 `showMoreProviders ? providers : providers.slice(0,5)`）；`isFetchingProviders && providers.length===0` 才显示 LoadingRow

- [ ] **Step 1: 写失败测试（红）**

`ModelSettings.test.tsx` 新增：
- 渲染 providers>5 时默认只显示前 5 张卡（`queryByTestId` 第 6 张为 null），且出现"查看更多供应商"按钮
- 点击"查看更多供应商"后显示全部卡片，容器带 expanded class
- 搜索框输入过滤上区卡片（只显示匹配项），搜索时不受前5限制
- 初始加载 `isFetchingProviders=true && providers.length===0` 显示 LoadingRow；已有 providers 时后台 `isFetchingProviders=true` **不**显示 LoadingRow
- "添加自定义 Provider"按钮存在；点击后出现 `role="dialog"` 的居中模态（断言弹窗元素/遮罩渲染）

- [ ] **Step 2: 运行确认失败**

Run: `pnpm --dir frontend exec vitest run src/app/features/model-settings/ModelSettings.test.tsx`
Expected: FAIL

- [ ] **Step 3: 实现 ModelSettings.tsx**

```tsx
import { useEffect, useMemo, useState } from 'react';
import { useAppStore } from '@stores/slicedStore';
import { useTCopy } from '@i18n/useTCopy';
import { SettingsHeader } from '../../components/settings/SettingsHeader';
import { CustomProviderDialog } from '../../components/models/CustomProviderDialog';
import { LoadingRow } from '../../components/LoadingRow';
import { IconPlus, IconSearch } from '../../icons';
import { ProviderCard } from './ProviderCard';
import { ModelToggleList } from './ModelToggleList';

const INITIAL_VISIBLE_PROVIDERS = 5;

export function ModelSettings() {
  const { t } = useTCopy();
  const providers = useAppStore((s) => s.providers);
  const isFetchingProviders = useAppStore((s) => s.isFetchingProviders);
  const fetchProviders = useAppStore((s) => s.fetchProviders);
  const [showDialog, setShowDialog] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showMoreProviders, setShowMoreProviders] = useState(false);

  useEffect(() => {
    void fetchProviders();
  }, [fetchProviders]);

  const displayProviders = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (query) {
      return providers.filter(
        (p) =>
          p.name.toLowerCase().includes(query) || p.id.toLowerCase().includes(query),
      );
    }
    return showMoreProviders ? providers : providers.slice(0, INITIAL_VISIBLE_PROVIDERS);
  }, [providers, searchQuery, showMoreProviders]);

  const showMoreButton =
    !searchQuery.trim() && providers.length > INITIAL_VISIBLE_PROVIDERS;

  return (
    <div className="adl-settings-section">
      <SettingsHeader
        title={t.settingsModels}
        description={t.settingsModelsDesc}
        action={
          <button
            type="button"
            className="adl-btn adl-btn--sm adl-btn--secondary"
            onClick={() => setShowDialog(true)}
          >
            <IconPlus size={14} decorative />
            {t.providerManagerAddCustom}
          </button>
        }
      />
      {isFetchingProviders && providers.length === 0 ? (
        <LoadingRow variant="center" />
      ) : (
        <>
          <section className="adl-model-settings__zone" aria-label={t.modelSettingsProvidersZone}>
            <div className="adl-model-settings__zone-title-row">
              <h4 className="adl-model-settings__zone-title">{t.modelSettingsProvidersZone}</h4>
              <div className="adl-model-settings__search">
                <IconSearch size={12} decorative />
                <input
                  type="search"
                  className="adl-model-settings__search-input"
                  placeholder={t.modelSettingsSearchProviders}
                  aria-label={t.modelSettingsSearchProviders}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            </div>
            <div
              className={`adl-model-settings__provider-grid${showMoreProviders ? ' is-expanded' : ''}`}
            >
              {displayProviders.map((provider) => (
                <ProviderCard key={provider.id} provider={provider} />
              ))}
              {displayProviders.length === 0 && (
                <p className="adl-model-settings__empty">{t.providerManagerNoProviders}</p>
              )}
            </div>
            {showMoreButton && (
              <button
                type="button"
                className="adl-model-settings__more-btn"
                onClick={() => setShowMoreProviders((v) => !v)}
              >
                {showMoreProviders ? t.modelSettingsCollapseProviders : t.modelSettingsShowMoreProviders}
              </button>
            )}
          </section>
          <section
            className="adl-model-settings__zone"
            aria-label={t.modelSettingsEnabledModelsZone}
          >
            <h4 className="adl-model-settings__zone-title">{t.modelSettingsEnabledModelsZone}</h4>
            <ModelToggleList providers={providers} />
          </section>
        </>
      )}
      {showDialog && <CustomProviderDialog onClose={() => setShowDialog(false)} />}
    </div>
  );
}
```

- [ ] **Step 4: 改 CSS（settings.css + dialog.css）**

`settings.css` `.adl-model-settings__zone-title` 区追加标题行/搜索样式，`:651-656` provider-grid 改单列：
```css
.adl-model-settings__zone-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
}
.adl-model-settings__zone-title {
  margin: 0;
  font-size: var(--text-sm);
  font-weight: var(--font-semibold);
  color: var(--text-primary);
}
.adl-model-settings__search {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  padding: var(--space-1) var(--space-2);
  background: var(--bg-input);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  color: var(--text-muted);
}
.adl-model-settings__search-input {
  background: none;
  border: none;
  outline: none;
  color: var(--text-primary);
  font-size: var(--text-xs);
  width: 160px;
}
.adl-model-settings__provider-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: var(--space-2);
  align-items: start;
}
.adl-model-settings__provider-grid.is-expanded {
  max-height: 520px;
  overflow-y: auto;
  padding-right: var(--space-1);
}
.adl-model-settings__more-btn {
  align-self: center;
  background: none;
  border: none;
  cursor: pointer;
  color: var(--accent);
  font-size: var(--text-xs);
  padding: var(--space-1) var(--space-2);
  border-radius: var(--radius);
}
.adl-model-settings__more-btn:hover {
  background: var(--bg-muted);
}
```
（原 `.adl-model-settings__zone-title` 规则被上面合并替换，删除重复定义。）

`dialog.css` 追加（居中模态，供 CustomProviderDialog 复用）：
```css
.adl-dialog-overlay {
  position: fixed;
  inset: 0;
  background: var(--bg-overlay);
  -webkit-backdrop-filter: blur(4px);
  backdrop-filter: blur(4px);
  z-index: var(--z-modal-backdrop);
  display: grid;
  place-items: center;
  padding: var(--space-6);
}
.adl-dialog {
  background: var(--surface-elevated);
  border-radius: var(--radius-2xl);
  box-shadow: var(--shadow-2xl);
  padding: var(--space-5);
  max-width: 480px;
  width: 100%;
  z-index: var(--z-modal);
}
.adl-dialog__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--space-3);
}
.adl-dialog__header h3 {
  margin: 0;
  font-size: var(--text-base);
  font-weight: var(--font-semibold);
}
.adl-dialog__body {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}
.adl-dialog__footer {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-2);
  margin-top: var(--space-4);
}
```

- [ ] **Step 5: i18n keys**

en-US `models.ts` 追加：
```ts
  modelSettingsSearchProviders: 'Search providers',
  modelSettingsShowMoreProviders: 'Show more providers',
  modelSettingsCollapseProviders: 'Show fewer',
```
zh-CN `models.ts` 追加：
```ts
  modelSettingsSearchProviders: '搜索供应商',
  modelSettingsShowMoreProviders: '查看更多供应商',
  modelSettingsCollapseProviders: '收起',
```
zh-CN `provider.ts`：`providerManagerAddCustom` 值中 "Provider" → "供应商"（即 '添加自定义供应商'）。

- [ ] **Step 6: 运行确认通过 + typecheck + check:i18n**

Run: `pnpm --dir frontend exec vitest run src/app/features/model-settings/ModelSettings.test.tsx`、`pnpm --dir frontend run typecheck`、`pnpm --dir frontend run check:i18n`
Expected: PASS / 无错误 / 一致

- [ ] **Step 7: Commit**

```bash
git add frontend/src/app/features/model-settings/ModelSettings.tsx frontend/src/styles/components/settings.css frontend/src/styles/components/dialog.css frontend/src/app/i18n frontend/src/app/features/model-settings/ModelSettings.test.tsx
git commit -m "feat(settings): single-column provider grid, first-5 + more link, search, centered add-provider modal"
```

---

### Task 5: ProviderCard 改造（整卡展开/密钥框/同行/去获取按钮/小圆角）

**Files:**
- Modify: `frontend/src/app/features/model-settings/ProviderCard.tsx`
- Modify: `frontend/src/styles/components/settings.css`（`.adl-provider-card*` 相关）
- Test: `frontend/src/app/features/model-settings/ModelSettings.test.tsx`

**Interfaces:**
- Consumes: Task 4 的 ModelSettings 传递 `provider`
- Produces: ProviderCard 交互——整卡头（除开关）可点击展开/折叠且悬停整卡灰底；密钥输入框无边框+眼睛内置；"测试连接"+"保存"同行；移除"获取最新模型"按钮（移至 Task 6）；展开区按钮小圆角

- [ ] **Step 1: 写失败测试（红）**

`ModelSettings.test.tsx` ProviderCard 部分新增：
- 点击卡片名区域（非开关）→ 展开 body 显示；再点 → 收起
- 点击开关按钮 → 只切换 enabled，**不**触发展开（`aria-checked` 变化而 body 不出现）
- 展开后密钥输入框存在且眼睛按钮在输入框容器内
- "获取最新模型"按钮**不在**展开区（`queryByText` fetchModels 为 null）
- "测试连接"与"保存"按钮在同一行容器内（断言同一 flex 行）

- [ ] **Step 2: 运行确认失败**

Run: `pnpm --dir frontend exec vitest run src/app/features/model-settings/ModelSettings.test.tsx`
Expected: FAIL

- [ ] **Step 3: 重构 ProviderCard.tsx**

关键结构（header 改为可点击区 + 独立开关；密钥框眼睛内置；action 行合并）：
```tsx
    <article className="adl-provider-card" data-testid={`provider-card-${provider.id}`}>
      <div className="adl-provider-card__header">
        <button
          type="button"
          className="adl-provider-card__expand"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          aria-label={t.modelProviderDetailsAria}
        >
          <span className={`adl-provider-card__status-dot${connected ? ' is-connected' : ' is-missing'}`}>
            {connected ? <IconCheckCircle size={14} decorative /> : <IconCircle size={14} decorative />}
          </span>
          <span className="adl-provider-card__name">{provider.name}</span>
          <span className="adl-provider-card__meta">
            {provider.builtIn ? (
              <span className="adl-chip adl-chip--xs adl-chip--muted">{t.providerManagerBuiltIn}</span>
            ) : (
              <span className="adl-chip adl-chip--xs adl-chip--info">{t.providerManagerCustom}</span>
            )}
          </span>
          {expanded ? <IconChevronUp size={14} decorative /> : <IconChevronDown size={14} decorative />}
        </button>
        <div className="adl-provider-card__controls">
          <button
            type="button"
            role="switch"
            aria-checked={provider.enabled}
            className={`adl-settings-toggle${provider.enabled ? ' is-on' : ''}`}
            aria-label={formatT(t, provider.enabled ? 'modelProviderDisableAria' : 'modelProviderEnableAria', { provider: provider.name })}
            onClick={(e) => {
              e.stopPropagation();
              void setProviderEnabled(provider.id, !provider.enabled);
            }}
          >
            <span className="adl-settings-toggle__track">
              <span className="adl-settings-toggle__thumb" />
            </span>
          </button>
        </div>
      </div>
```
密钥输入框组（眼睛绝对定位内置）：
```tsx
              <div className="adl-provider-card__key-input-group">
                <input
                  id={keyInputId}
                  type={showKey ? 'text' : 'password'}
                  className="adl-provider-card__key-input"
                  placeholder={t.providerManagerApiKeyPlaceholder}
                  value={apiKeyInput}
                  onChange={(e) => setApiKeyInput(e.target.value)}
                />
                <button
                  type="button"
                  className="adl-provider-card__key-toggle"
                  onClick={() => setShowKey((v) => !v)}
                  aria-label={showKey ? t.providerHideKey : t.providerShowKey}
                >
                  {showKey ? <IconEyeOff size={12} decorative /> : <IconEye size={12} decorative />}
                </button>
              </div>
```
动作区（测试连接 + 保存密钥同一行；移除获取模型按钮）：
```tsx
              <div className="adl-provider-card__actions">
                <button type="button" className="adl-btn adl-btn--ghost adl-btn--xs" onClick={() => void handleSaveApiKey()} disabled={!apiKeyInput.trim()}>
                  {t.providerManagerSaveKey}
                </button>
                <button type="button" className="adl-btn adl-btn--ghost adl-btn--xs" onClick={() => void testConnection(provider.id)} disabled={isTesting}>
                  {isTesting ? t.processing : t.providerManagerTestConnection}
                </button>
                {provider.hasKey && (
                  <button type="button" className="adl-btn adl-btn--ghost adl-btn--xs" onClick={() => void clearApiKey(provider.id)}>
                    {t.providerClear}
                  </button>
                )}
                {!provider.builtIn && (
                  <button type="button" className="adl-btn adl-btn--ghost adl-btn--xs adl-provider-card__remove-btn" onClick={() => void removeCustomProvider(provider.id)}>
                    {t.providerManagerRemoveProvider}
                  </button>
                )}
              </div>
```
移除 `handleFetchModels`、`fetchingModels` 状态、`IconRefreshCw` import 与"获取最新模型"按钮（移至 Task 6）。

- [ ] **Step 4: 改 CSS（settings.css）**

```css
.adl-provider-card__expand {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex: 1;
  min-width: 0;
  padding: var(--space-2) var(--space-3);
  background: none;
  border: none;
  cursor: pointer;
  color: var(--text-primary);
  font-size: var(--text-xs);
  text-align: left;
}
.adl-provider-card__header:hover .adl-provider-card__expand {
  background: var(--bg-hover);
}
.adl-provider-card__controls {
  flex-shrink: 0;
  padding: 0 var(--space-3);
  display: flex;
  align-items: center;
}
```
密钥输入组（眼睛内置）：
```css
.adl-provider-card__key-input-group {
  position: relative;
  display: flex;
  align-items: center;
}
.adl-provider-card__key-input {
  flex: 1;
  padding: var(--space-1) var(--space-6) var(--space-1) var(--space-2);
  border: none;
  background: var(--bg-input);
  color: var(--text-primary);
  font-size: var(--text-xs);
  font-family: var(--font-mono, monospace);
  border-radius: var(--radius-sm);
}
.adl-provider-card__key-input::placeholder {
  color: var(--text-muted);
}
.adl-provider-card__key-toggle {
  position: absolute;
  right: var(--space-1);
  top: 50%;
  transform: translateY(-50%);
  background: none;
  border: none;
  cursor: pointer;
  color: var(--text-muted);
  padding: var(--space-1);
  display: inline-flex;
  align-items: center;
  border-radius: var(--radius);
}
.adl-provider-card__key-toggle:hover {
  background: var(--bg-muted);
  color: var(--text-primary);
}
```
动作区（同行 + 小圆角作用域）：
```css
.adl-provider-card__actions {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  flex-wrap: wrap;
}
.adl-provider-card .adl-btn {
  border-radius: var(--radius);
}
```
删除不再使用的 `.adl-provider-card__key-actions` 规则（若已无引用）。

- [ ] **Step 5: 运行确认通过 + typecheck**

Run: `pnpm --dir frontend exec vitest run src/app/features/model-settings/ModelSettings.test.tsx`、`pnpm --dir frontend run typecheck`
Expected: PASS / 无错误

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/features/model-settings/ProviderCard.tsx frontend/src/styles/components/settings.css frontend/src/app/features/model-settings/ModelSettings.test.tsx
git commit -m "feat(settings): provider card whole-header expand, inline key toggle, combined action row"
```

---

### Task 6: ModelToggleList 改造 + 移除 setDefaultModel

**Files:**
- Modify: `frontend/src/app/features/model-settings/ModelToggleList.tsx`
- Modify: `frontend/src/app/stores/actions/providerActions.ts:136-142`（删除 setDefaultModel）
- Modify: `frontend/src/app/stores/StoreState.ts:328`（删除签名）
- Modify: `frontend/src/styles/components/settings.css`（model-group 相关）
- Modify: `frontend/src/app/i18n/en-US/models.ts`、`frontend/src/app/i18n/zh-CN/models.ts`
- Test: `frontend/src/app/features/model-settings/ModelSettings.test.tsx`、`frontend/src/app/stores/actions/providerActions.test.ts`

**Interfaces:**
- Consumes: Task 3 的 `setAllModelsEnabled`、Task 5 移除的"获取最新模型"按钮
- Produces: 分组仅渲染启用供应商；批量按钮调 `setAllModelsEnabled`；新增 `fetchModels` 图标按钮（原生 title）；删除 setDefaultModel/默认徽章/全部启用提示/供应商禁用徽章；i18n 键清理

- [ ] **Step 1: 写失败测试（红）**

`ModelSettings.test.tsx` 更新：
- `provider.enabled=false` 的供应商**不**渲染分组（`queryByTestId('model-group-xxx')` 为 null）
- 不再出现"设为默认模型"按钮与"默认"徽章文本
- 不再出现"全部模型已启用"提示
- "全部关闭"按钮调 `setAllModelsEnabled(id,false)`（patch enabledModels=[]）
- "全部启用"按钮调 `setAllModelsEnabled(id,true)`（patch enabledModels=null）
- 分组 header 供应商名右侧有"获取最新模型"图标按钮（title/aria 存在）

`providerActions.test.ts`：删除 `setDefaultModel` 相关用例（`:175-178`）；新增 `setAllModelsEnabled` 用例（若 Task 3 未加）。

- [ ] **Step 2: 运行确认失败**

Run: `pnpm --dir frontend exec vitest run src/app/features/model-settings/ModelSettings.test.tsx src/app/stores/actions/providerActions.test.ts`
Expected: FAIL

- [ ] **Step 3: 改 ModelToggleList.tsx**

```tsx
import { useAppStore } from '@stores/slicedStore';
import { useTCopy } from '@i18n/useTCopy';
import type { ProviderStatus } from '@shared/ipc/provider';
import type { ModelDefinition } from '@shared/ipc/provider';
import { isModelEnabled } from '../../../shared/modelUtils';
import { IconRefreshCw } from '../../icons';

interface ModelRowProps {
  providerId: string;
  model: ModelDefinition;
  enabled: boolean;
}

function ModelRow({ providerId, model, enabled }: ModelRowProps) {
  const { t, formatT } = useTCopy();
  const toggleModel = useAppStore((s) => s.toggleModel);

  return (
    <li className={`adl-model-settings__model-row${enabled ? '' : ' is-disabled'}`}>
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        className={`adl-settings-toggle${enabled ? ' is-on' : ''}`}
        aria-label={formatT(t, 'modelModelToggleAria', { model: model.name })}
        onClick={() => void toggleModel(providerId, model.id, !enabled)}
      >
        <span className="adl-settings-toggle__track">
          <span className="adl-settings-toggle__thumb" />
        </span>
      </button>
      <span className="adl-model-settings__model-name">{model.name}</span>
      {model.description && (
        <span className="adl-model-settings__model-desc">{model.description}</span>
      )}
    </li>
  );
}

export function ModelToggleList({ providers }: ModelToggleListProps) {
  const { t } = useTCopy();
  const setAllModelsEnabled = useAppStore((s) => s.setAllModelsEnabled);
  const fetchModels = useAppStore((s) => s.fetchModels);
  const enabledProviders = providers.filter((p) => p.enabled);

  if (enabledProviders.length === 0) {
    return <p className="adl-model-settings__empty">{t.providerManagerNoProviders}</p>;
  }

  return (
    <div className="adl-model-settings__model-list">
      {enabledProviders.map((provider) => (
        <section
          key={provider.id}
          className="adl-model-settings__model-group"
          data-testid={`model-group-${provider.id}`}
        >
          <header className="adl-model-settings__model-group-header">
            <span className="adl-model-settings__model-group-name">{provider.name}</span>
            <button
              type="button"
              className="adl-model-settings__fetch-models-btn"
              title={t.providerManagerFetchModels}
              aria-label={t.providerManagerFetchModels}
              onClick={() => void fetchModels(provider.id)}
            >
              <IconRefreshCw size={12} decorative />
            </button>
            <div className="adl-model-settings__model-group-actions">
              <button
                type="button"
                className="adl-btn adl-btn--ghost adl-btn--xs"
                onClick={() => void setAllModelsEnabled(provider.id, true)}
              >
                {t.modelEnableAll}
              </button>
              <button
                type="button"
                className="adl-btn adl-btn--ghost adl-btn--xs"
                onClick={() => void setAllModelsEnabled(provider.id, false)}
              >
                {t.modelDisableAll}
              </button>
            </div>
          </header>

          {provider.models.length === 0 ? (
            <p className="adl-model-settings__model-empty">{t.modelNoModels}</p>
          ) : (
            <ul className="adl-model-settings__model-rows">
              {provider.models.map((model) => (
                <ModelRow
                  key={model.id}
                  providerId={provider.id}
                  model={model}
                  enabled={isModelEnabled(provider, model.id)}
                />
              ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}
```
（删除 `modelPrefs`/`defaultModelId`/`isDefault`/`setDefaultModel`/"默认"徽章/"全部模型已启用"提示/"供应商已禁用"徽章。）

- [ ] **Step 4: 删除 setDefaultModel 动作与签名**

`providerActions.ts` 删除 `setDefaultModel`（`:136-142`）。
`StoreState.ts:328` 删除 `setDefaultModel: (providerId: string, modelId: string) => Promise<void>;` 对应签名。
grep 确认 `setDefaultModel` 无残留（除测试已删）。

- [ ] **Step 5: i18n 键清理**

en-US + zh-CN `models.ts`：
- 删除：`modelSetDefault`、`modelSetDefaultAria`、`modelDefaultBadge`、`modelAllEnabledHint`、`modelProviderDisabledHint`
- 改值：`modelDisableAll` en 'Disable all'→'Turn off all'、zh '全部禁用'→'全部关闭'

- [ ] **Step 6: CSS（settings.css）**

新增/调整：
```css
.adl-model-settings__model-group-header {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  background: var(--bg-subtle);
  border-bottom: 1px solid var(--border-subtle);
}
.adl-model-settings__fetch-models-btn {
  background: none;
  border: none;
  cursor: pointer;
  color: var(--text-muted);
  padding: var(--space-1);
  display: inline-flex;
  align-items: center;
  border-radius: var(--radius);
}
.adl-model-settings__fetch-models-btn:hover {
  background: var(--bg-muted);
  color: var(--text-primary);
}
.adl-model-settings .adl-btn {
  border-radius: var(--radius);
}
```
删除：`.adl-model-settings__set-default`、`.adl-model-settings__all-enabled-hint` 规则。

- [ ] **Step 7: 运行确认通过 + typecheck + check:i18n**

Run: `pnpm --dir frontend exec vitest run src/app/features/model-settings/ModelSettings.test.tsx src/app/stores/actions/providerActions.test.ts`、`pnpm --dir frontend run typecheck`、`pnpm --dir frontend run check:i18n`
Expected: PASS / 无错误 / 一致

- [ ] **Step 8: Commit**

```bash
git add frontend/src/app/features/model-settings/ModelToggleList.tsx frontend/src/app/stores/actions/providerActions.ts frontend/src/app/stores/StoreState.ts frontend/src/styles/components/settings.css frontend/src/app/i18n frontend/src/app/features/model-settings/ModelSettings.test.tsx frontend/src/app/stores/actions/providerActions.test.ts
git commit -m "feat(settings): filter enabled provider groups, batch tri-state actions, remove set-default"
```

---

### Task 7: 开关配色 + 全量门禁

**Files:**
- Modify: `frontend/src/styles/components/settings.css:182-196`（toggle is-on 配色）

- [ ] **Step 1: 改 toggle 配色**

`:182-196`：
```css
.adl-settings-toggle.is-on .adl-settings-toggle__track {
  background: var(--text-primary);
}
.adl-settings-toggle.is-on .adl-settings-toggle__thumb {
  transform: translateX(16px);
}
```
（thumb 颜色保持 `var(--text-inverse)`，仅轨道改 `var(--text-primary)`。）

- [ ] **Step 2: 全量门禁**

Run:
```
cargo test --workspace
cargo clippy --workspace --all-targets -- -D warnings
pnpm --dir frontend run test
pnpm --dir frontend run lint
pnpm --dir frontend run check:i18n
```
Expected: 全绿；clippy 0 警告；lint 0 errors；check:i18n 一致

- [ ] **Step 3: 残留检查**

Run:
```
grep -rn "setDefaultModel" frontend/src
grep -rn "modelAllEnabledHint\|modelProviderDisabledHint\|modelSetDefault\|modelDefaultBadge" frontend/src
grep -rn "settingsProviders" frontend/src
```
Expected: 仅测试负向断言或无残留

- [ ] **Step 4: Commit**

```bash
git add frontend/src/styles/components/settings.css
git commit -m "style(settings): on-state toggle track uses text-primary (white in dark / black in light)"
```

---

## Post-Execution Verification

1. 全部测试通过（Rust 581+ 增长、前端 1147+ 增长）
2. `cargo clippy --workspace --all-targets -- -D warnings` 0 警告；`pnpm --dir frontend run lint` 0 errors
3. `grep "settingsProviders" frontend/src` 无残留（既有校验）
4. `grep "setDefaultModel" frontend/src` 无残留
5. 双端手动走查（run-project-surfaces）：两区 UI、开关持久化、`/model` 命令、双端一致

## Rollback / Completion

- 每 Task 独立小步提交（Conventional Commit）
- 完成后 closing-workflow 收尾
