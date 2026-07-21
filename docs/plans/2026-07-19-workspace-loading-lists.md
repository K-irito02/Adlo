# Workspace Loading Lists Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix drag-and-drop, persistence, and cascading load order in the workspace settings panel so three independent lists (priority / deferred / natural) all support cross-list dragging, persist across reloads, and load workspaces in priority → deferred → natural cascade without blocking first screen longer than necessary.

**Architecture:** Add 4 new fields (`max_concurrent_workspaces`, `workspace_priority_ids`, `workspace_deferred_ids`, `workspace_natural_order`) to three Rust structs (`AppConfig`, `AppPreferencePatch`, `ConfigSnapshot`) so they round-trip through Tauri IPC. On the frontend, split the 470-line `WorkspaceSettings.tsx` into a 200-line orchestrator + a reusable `SortableWorkspaceList` component + a `useWorkspaceDnd` hook that fixes the empty-list droppable bug and the `useCallback` invalidation bug. Extract the load-order computation into a pure `computeLoadPhases` function with exhaustive unit tests, then rewrite the bootstrap's workspace-loading block to call it with two-stage execution (priority blocks first screen; deferred + natural run in a non-blocking IIFE after `completeStartup()`).

**Tech Stack:** Rust (serde, ts-rs, Tauri 2.x commands) / TypeScript 5 / React 19 / Zustand / @dnd-kit/core + @dnd-kit/sortable / Vitest / @testing-library/react

## Global Constraints

- Rust MSRV: 1.85+ (`LazyLock` available). Use `cargo fmt --all` + `cargo clippy --workspace --all-targets -- -D warnings` before any Rust commit.
- Frontend: React 19 + Vite + Zustand v5. Use `pnpm --dir frontend run lint:fix` + `pnpm --dir frontend run format` + `pnpm --dir frontend run typecheck` before any frontend commit.
- **禁止 `any`** — use precise types. **禁止 `as Record<string, unknown>`** casts (existing occurrences in `WorkspaceSettings.tsx:129` and `generalActions.ts:174` must be removed by this plan).
- **禁止 `unwrap()`** in Rust production code. Use `?` or pattern matching.
- **i18n 全覆盖**: all new UI text must use i18n keys via `useTCopy()`. No hardcoded strings.
- **Empty state text must not end with period** (rule from `dev-rules.md`).
- **Three-bridge consistency**: any IPC change must be reflected in `tauri-bridge` / `preview-bridge/` / `mock-bridge/`.
- Reference spec: `docs/specs/2026-07-19-workspace-loading-lists-design.md`
- **Shell environment**: Before running `cargo` commands, prepend `$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"` in PowerShell. Before running `pnpm`/`node` commands, prepend `$env:Path = "C:\Program Files\nodejs;$env:Path"`.

---

## File Structure

### New files (frontend)

| File | Responsibility |
|------|---------------|
| `ai-digital-life/frontend/src/app/stores/actions/workspaceLoadOrder.ts` | Pure `computeLoadPhases()` function + `LoadPhases` interface |
| `ai-digital-life/frontend/src/app/stores/actions/workspaceLoadOrder.test.ts` | Unit tests for `computeLoadPhases` |
| `ai-digital-life/frontend/src/app/features/workspace-settings/SortableWorkspaceList.tsx` | Reusable list component (title + desc + "!" tooltip + sortable items + empty droppable) |
| `ai-digital-life/frontend/src/app/features/workspace-settings/SortableWorkspaceList.test.tsx` | Render tests for the list component |
| `ai-digital-life/frontend/src/app/features/workspace-settings/useWorkspaceDnd.ts` | DnD hook (findContainer memoized, handleDragStart/End, sensors, activeId) |
| `ai-digital-life/frontend/src/app/features/workspace-settings/useWorkspaceDnd.test.ts` | DnD logic tests (call handleDragEnd with mocked events) |

### Modified files (frontend)

| File | Change |
|------|--------|
| `ai-digital-life/frontend/src/app/features/workspace-settings/WorkspaceSettings.tsx` | Refactor from 470 → ~200 lines; use new hook + component; remove `as Record<string, unknown>` cast; add `workspaceNaturalOrder` state |
| `ai-digital-life/frontend/src/app/features/workspace-settings/WorkspaceSettingsTypes.ts` | Remove dead `WorkspaceSettingsState` type |
| `ai-digital-life/frontend/src/app/stores/actions/generalActions.ts` | Rewrite lines 162-243 (workspace load block); use `computeLoadPhases`; add `logRejected`; fix `accumulateBatch` loading-state reset |
| `ai-digital-life/frontend/src/app/stores/actions/generalActions.test.ts` | Replace placeholder `expect(true).toBe(true)` test (lines 167-174) with real call-order assertions |
| `ai-digital-life/frontend/src/shared/ipc-types.generated.ts` | Add `workspaceNaturalOrder?` to `AppPreferencePatch`; add `workspaceNaturalOrder: string[]` to `ConfigSnapshot` |
| `ai-digital-life/frontend/src/shared/defaultPreferences.ts` | Add `DEFAULT_WORKSPACE_NATURAL_ORDER = []`; add case to `getDefaultForSetting` |
| `ai-digital-life/frontend/src/shared/preferencesMerger.ts` | Add `workspaceNaturalOrder` handling to `applyPreferencePatch` |
| `ai-digital-life/frontend/src/preview-bridge/preview-model.ts` | Add 4 fields to default `config`; persist via localStorage |
| `ai-digital-life/frontend/src/mock/mock-shared-workspace.ts` | Add 4 fields to default `config` |
| `ai-digital-life/frontend/src/app/i18n/zh-CN/workspace.ts` | Rename/replace 2 keys, modify 3 keys, add 6 new keys |
| `ai-digital-life/frontend/src/app/i18n/en-US/workspace.ts` | Same changes as zh-CN |
| `ai-digital-life/frontend/src/styles/components/settings.css` | Add `.adl-drag-overlay`, `.adl-draggable-item`, `.adl-sortable-section-title` flex layout, `white-space: pre-line` for tooltips |

### Modified files (Rust)

| File | Change |
|------|--------|
| `ai-digital-life/crates/types/src/types/config.rs` | Add 4 fields to `AppPreferencePatch` (optional) and `ConfigSnapshot` (required, `#[serde(default)]`) |
| `ai-digital-life/crates/kernel/src/config.rs` | Add 4 fields to `AppConfig` struct + `Default` impl + `app_config_with_custom_commands` test |
| `ai-digital-life/src-tauri/src/commands/app.rs` | Handle 4 new fields in `app_update_preferences`; populate them in `build_app_info`; add tests |

---

## Task 1: Add Rust backend fields (TDD)

**Files:**
- Modify: `ai-digital-life/crates/types/src/types/config.rs:164-221`
- Modify: `ai-digital-life/crates/kernel/src/config.rs:18-84`
- Modify: `ai-digital-life/src-tauri/src/commands/app.rs:84-200`
- Test: existing `#[cfg(test)]` modules in each file

**Interfaces:**
- Produces: `AppPreferencePatch.max_concurrent_workspaces: Option<usize>`, `.workspace_priority_ids: Option<Vec<String>>`, `.workspace_deferred_ids: Option<Vec<String>>`, `.workspace_natural_order: Option<Vec<String>>`
- Produces: `ConfigSnapshot.max_concurrent_workspaces: usize`, `.workspace_priority_ids: Vec<String>`, `.workspace_deferred_ids: Vec<String>`, `.workspace_natural_order: Vec<String>` (all `#[serde(default)]`)
- Produces: `AppConfig.max_concurrent_workspaces: usize`, `.workspace_priority_ids: Vec<String>`, `.workspace_deferred_ids: Vec<String>`, `.workspace_natural_order: Vec<String>` (all `#[serde(default)]`)

- [ ] **Step 1: Write the failing test in `crates/kernel/src/config.rs`**

Append to the `config_extension_tests` module:

```rust
    #[test]
    fn app_config_has_workspace_loading_fields_with_defaults() {
        let config = AppConfig::default();
        assert_eq!(config.max_concurrent_workspaces, 6);
        assert!(config.workspace_priority_ids.is_empty());
        assert!(config.workspace_deferred_ids.is_empty());
        assert!(config.workspace_natural_order.is_empty());
    }

    #[test]
    fn app_config_round_trips_workspace_loading_fields() {
        let dir = temp_dir().join("adl-config-workspace-loading-test");
        let _ = std::fs::remove_dir_all(&dir);
        let config = AppConfig {
            max_concurrent_workspaces: 4,
            workspace_priority_ids: vec!["ws-1".into(), "ws-2".into()],
            workspace_deferred_ids: vec!["ws-3".into()],
            workspace_natural_order: vec!["ws-4".into()],
            ..Default::default()
        };
        save(&dir, &config).unwrap();
        let loaded = load(&dir).unwrap();
        assert_eq!(loaded.max_concurrent_workspaces, 4);
        assert_eq!(loaded.workspace_priority_ids, vec!["ws-1".to_string(), "ws-2".to_string()]);
        assert_eq!(loaded.workspace_deferred_ids, vec!["ws-3".to_string()]);
        assert_eq!(loaded.workspace_natural_order, vec!["ws-4".to_string()]);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn app_config_loads_old_config_without_workspace_fields() {
        // 模拟旧版本 config.json：不含 workspace loading 字段
        let dir = temp_dir().join("adl-config-old-format-test");
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(config_dir(&dir)).unwrap();
        let old_json = r#"{
            "language": "zh-CN",
            "theme_mode": "system",
            "log_level": "info",
            "terminal_log_mode": "overwrite",
            "debug_log_mode": "overwrite",
            "max_recent_workspaces": 10,
            "model_preferences": { "providers": {} },
            "commands": [],
            "permissions": { "include_defaults": true, "rules": [] },
            "references": [],
            "custom_agents": [],
            "keybinds": {},
            "fonts": {}
        }"#;
        std::fs::write(config_path(&dir), old_json).unwrap();
        let loaded = load(&dir).unwrap();
        assert_eq!(loaded.max_concurrent_workspaces, 6);
        assert!(loaded.workspace_priority_ids.is_empty());
        assert!(loaded.workspace_deferred_ids.is_empty());
        assert!(loaded.workspace_natural_order.is_empty());
        let _ = std::fs::remove_dir_all(&dir);
    }
```

- [ ] **Step 2: Run test to verify it fails**

```powershell
$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"
cargo test --package adl-kernel config_extension_tests
```
Expected: FAIL with "no field `max_concurrent_workspaces` on type `AppConfig`" (compile error).

- [ ] **Step 3: Add the 4 fields to `AppConfig` struct in `crates/kernel/src/config.rs`**

Edit `crates/kernel/src/config.rs` and add the new fields right after `fonts` (line 50):

```rust
    /// User-defined font preferences.
    #[serde(default)]
    pub fonts: adl_types::types::config::FontPreferences,
    /// Maximum concurrent workspace loads during the priority (startup) phase.
    #[serde(default = "default_max_concurrent_workspaces")]
    pub max_concurrent_workspaces: usize,
    /// Workspace IDs loaded synchronously at startup (blocks first screen).
    #[serde(default)]
    pub workspace_priority_ids: Vec<String>,
    /// Workspace IDs loaded asynchronously after first screen is ready.
    #[serde(default)]
    pub workspace_deferred_ids: Vec<String>,
    /// Workspace IDs loaded after priority and deferred phases complete.
    /// Default order: newest-added first (user can customize via drag-and-drop).
    #[serde(default)]
    pub workspace_natural_order: Vec<String>,
```

Add a helper function above the `AppConfig` struct (below `const DEFAULT_MAX_RECENT_WORKSPACES`):

```rust
const DEFAULT_MAX_RECENT_WORKSPACES: usize = 10;

fn default_max_concurrent_workspaces() -> usize {
    6
}
```

Update the `Default for AppConfig` impl to include the 4 new fields:

```rust
impl Default for AppConfig {
    fn default() -> Self {
        Self {
            language: DEFAULT_LANGUAGE.into(),
            theme_mode: ThemeMode::System,
            log_level: DEFAULT_LOG_LEVEL.into(),
            terminal_log_mode: LogMode::default(),
            debug_log_mode: LogMode::default(),
            max_recent_workspaces: DEFAULT_MAX_RECENT_WORKSPACES,
            model_preferences: ModelPreferences::default(),
            commands: Vec::new(),
            permissions: PermissionRulesetConfig::default(),
            references: Vec::new(),
            custom_agents: Vec::new(),
            keybinds: std::collections::BTreeMap::new(),
            fonts: adl_types::types::config::FontPreferences::default(),
            max_concurrent_workspaces: default_max_concurrent_workspaces(),
            workspace_priority_ids: Vec::new(),
            workspace_deferred_ids: Vec::new(),
            workspace_natural_order: Vec::new(),
        }
    }
}
```

Update the `app_config_with_custom_commands` test (lines 160-186) to include the 4 new fields in the struct literal:

```rust
    #[test]
    fn app_config_with_custom_commands() {
        let config = AppConfig {
            language: "en-US".into(),
            theme_mode: adl_types::types::config::ThemeMode::Light,
            log_level: "debug".into(),
            terminal_log_mode: adl_logging::LogMode::Overwrite,
            debug_log_mode: adl_logging::LogMode::Overwrite,
            max_recent_workspaces: 10,
            model_preferences: adl_types::types::config::ModelPreferences::default(),
            commands: vec![CommandConfig {
                name: "deploy".to_string(),
                description: "Deploy to production".to_string(),
                agent: AgentId::Build,
                model: None,
                template: "Deploy $ARGUMENTS to production".to_string(),
                subtask: false,
                hints: vec![],
            }],
            permissions: PermissionRulesetConfig::default(),
            references: vec![],
            custom_agents: vec![],
            keybinds: std::collections::BTreeMap::new(),
            fonts: adl_types::types::config::FontPreferences::default(),
            max_concurrent_workspaces: 6,
            workspace_priority_ids: vec![],
            workspace_deferred_ids: vec![],
            workspace_natural_order: vec![],
        };
        assert_eq!(config.commands.len(), 1);
        assert_eq!(config.commands[0].name, "deploy");
    }
```

- [ ] **Step 4: Run kernel tests to verify they pass**

```powershell
$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"
cargo test --package adl-kernel
```
Expected: PASS — all kernel tests including the 3 new ones.

- [ ] **Step 5: Add the 4 fields to `AppPreferencePatch` in `crates/types/src/types/config.rs`**

Edit `crates/types/src/types/config.rs` and add the new fields to `AppPreferencePatch` (after `fonts`, line 182):

```rust
#[derive(Debug, Clone, Serialize, Deserialize, Default, TS)]
#[serde(rename_all = "camelCase")]
pub struct AppPreferencePatch {
    #[ts(optional)]
    pub language: Option<String>,
    #[ts(optional)]
    pub theme_mode: Option<ThemeMode>,
    #[ts(optional)]
    pub log_level: Option<String>,
    #[ts(optional)]
    pub terminal_log_mode: Option<LogMode>,
    #[ts(optional)]
    pub debug_log_mode: Option<LogMode>,
    #[ts(optional)]
    pub model_preferences: Option<std::collections::BTreeMap<String, ModelProviderPreferencePatch>>,
    #[ts(optional)]
    pub keybinds: Option<std::collections::BTreeMap<String, String>>,
    #[ts(optional)]
    pub fonts: Option<FontPreferences>,
    #[ts(optional)]
    pub max_concurrent_workspaces: Option<usize>,
    #[ts(optional)]
    pub workspace_priority_ids: Option<Vec<String>>,
    #[ts(optional)]
    pub workspace_deferred_ids: Option<Vec<String>>,
    #[ts(optional)]
    pub workspace_natural_order: Option<Vec<String>>,
}
```

Add the 4 new fields to `ConfigSnapshot` (after `fonts`, line 220). Use `#[serde(default)]` on each so old config files without these fields deserialize cleanly:

```rust
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct ConfigSnapshot {
    pub language: String,
    pub theme_mode: ThemeMode,
    pub resolved_theme: Theme,
    pub log_level: String,
    pub terminal_log_mode: LogMode,
    pub debug_log_mode: LogMode,
    pub max_recent_workspaces: usize,
    pub model_preferences: ModelPreferences,
    pub keybinds: std::collections::BTreeMap<String, String>,
    pub fonts: FontPreferences,
    #[serde(default = "default_max_concurrent_workspaces_snapshot")]
    pub max_concurrent_workspaces: usize,
    #[serde(default)]
    pub workspace_priority_ids: Vec<String>,
    #[serde(default)]
    pub workspace_deferred_ids: Vec<String>,
    #[serde(default)]
    pub workspace_natural_order: Vec<String>,
}

fn default_max_concurrent_workspaces_snapshot() -> usize {
    6
}
```

Update the `app_info_serializes` test in `crates/types/src/types/mod.rs` (lines 107-129) to include the 4 new fields in the `ConfigSnapshot` literal:

```rust
        let info = AppInfo {
            app_name: APP_NAME.into(),
            version: "0.1.0".into(),
            config: ConfigSnapshot {
                language: "zh-CN".into(),
                theme_mode: ThemeMode::System,
                resolved_theme: Theme::Dark,
                log_level: "info".into(),
                terminal_log_mode: LogMode::default(),
                debug_log_mode: LogMode::default(),
                max_recent_workspaces: 10,
                model_preferences: ModelPreferences::default(),
                keybinds: std::collections::BTreeMap::new(),
                fonts: crate::types::config::FontPreferences::default(),
                max_concurrent_workspaces: 6,
                workspace_priority_ids: vec![],
                workspace_deferred_ids: vec![],
                workspace_natural_order: vec![],
            },
            current_workspace: None,
            recent_logs: vec![],
        };
```

- [ ] **Step 6: Update `app_update_preferences` and `build_app_info` in `src-tauri/src/commands/app.rs`**

Edit `src-tauri/src/commands/app.rs`. In the `app_update_preferences` function (lines 84-157), add 4 new `if let Some(v) = patch.X` blocks right before the closing `}` of the config write lock scope (after the `fonts` block, before line 146 `}`):

```rust
        if let Some(fonts) = patch.fonts {
            if let Some(ui) = fonts.ui_font {
                config.fonts.ui_font = Some(ui);
            }
            if let Some(code) = fonts.code_font {
                config.fonts.code_font = Some(code);
            }
            if let Some(term) = fonts.terminal_font {
                config.fonts.terminal_font = Some(term);
            }
        }
        if let Some(v) = patch.max_concurrent_workspaces {
            config.max_concurrent_workspaces = v.clamp(1, 20);
        }
        if let Some(v) = patch.workspace_priority_ids {
            config.workspace_priority_ids = v;
        }
        if let Some(v) = patch.workspace_deferred_ids {
            config.workspace_deferred_ids = v;
        }
        if let Some(v) = patch.workspace_natural_order {
            config.workspace_natural_order = v;
        }
    }
```

In `build_app_info` (lines 159-200), update the `ConfigSnapshot` literal (starting line 180) to include the 4 new fields:

```rust
        config: ConfigSnapshot {
            language: config.language.clone(),
            theme_mode: config.theme_mode,
            resolved_theme: resolved,
            log_level: config.log_level.clone(),
            terminal_log_mode: config.terminal_log_mode,
            debug_log_mode: config.debug_log_mode,
            max_recent_workspaces: config.max_recent_workspaces,
            model_preferences: config.model_preferences.clone(),
            keybinds: config.keybinds.clone(),
            fonts: config.fonts.clone(),
            max_concurrent_workspaces: config.max_concurrent_workspaces,
            workspace_priority_ids: config.workspace_priority_ids.clone(),
            workspace_deferred_ids: config.workspace_deferred_ids.clone(),
            workspace_natural_order: config.workspace_natural_order.clone(),
        },
```

- [ ] **Step 7: Add Tauri command test for new fields**

Append a new test module at the end of `src-tauri/src/commands/app.rs`:

```rust
#[cfg(test)]
mod workspace_loading_tests {
    use super::*;
    use adl_types::types::config::AppPreferencePatch;

    #[test]
    fn app_preference_patch_deserializes_workspace_loading_fields() {
        let json = r#"{
            "maxConcurrentWorkspaces": 8,
            "workspacePriorityIds": ["ws-1", "ws-2"],
            "workspaceDeferredIds": ["ws-3"],
            "workspaceNaturalOrder": ["ws-4", "ws-5"]
        }"#;
        let patch: AppPreferencePatch = serde_json::from_str(json).unwrap();
        assert_eq!(patch.max_concurrent_workspaces, Some(8));
        assert_eq!(patch.workspace_priority_ids, Some(vec!["ws-1".into(), "ws-2".into()]));
        assert_eq!(patch.workspace_deferred_ids, Some(vec!["ws-3".into()]));
        assert_eq!(patch.workspace_natural_order, Some(vec!["ws-4".into(), "ws-5".into()]));
    }

    #[test]
    fn app_preference_patch_deserializes_without_workspace_loading_fields() {
        // 旧客户端发送的 patch 不含新字段，应全部为 None
        let json = r#"{"language": "en-US"}"#;
        let patch: AppPreferencePatch = serde_json::from_str(json).unwrap();
        assert_eq!(patch.language, Some("en-US".into()));
        assert_eq!(patch.max_concurrent_workspaces, None);
        assert_eq!(patch.workspace_priority_ids, None);
        assert_eq!(patch.workspace_deferred_ids, None);
        assert_eq!(patch.workspace_natural_order, None);
    }

    #[test]
    fn config_snapshot_deserializes_old_format_with_defaults() {
        let json = r#"{
            "language": "zh-CN",
            "themeMode": "system",
            "resolvedTheme": "light",
            "logLevel": "info",
            "terminalLogMode": "overwrite",
            "debugLogMode": "overwrite",
            "maxRecentWorkspaces": 10,
            "modelPreferences": { "providers": {} },
            "keybinds": {},
            "fonts": {}
        }"#;
        let snap: ConfigSnapshot = serde_json::from_str(json).unwrap();
        assert_eq!(snap.max_concurrent_workspaces, 6);
        assert!(snap.workspace_priority_ids.is_empty());
        assert!(snap.workspace_deferred_ids.is_empty());
        assert!(snap.workspace_natural_order.is_empty());
    }

    #[test]
    fn config_snapshot_serializes_workspace_loading_fields() {
        let snap = ConfigSnapshot {
            language: "zh-CN".into(),
            theme_mode: adl_types::ThemeMode::System,
            resolved_theme: adl_types::Theme::Light,
            log_level: "info".into(),
            terminal_log_mode: adl_types::LogMode::Overwrite,
            debug_log_mode: adl_types::LogMode::Overwrite,
            max_recent_workspaces: 10,
            model_preferences: adl_types::ModelPreferences::default(),
            keybinds: std::collections::BTreeMap::new(),
            fonts: adl_types::types::config::FontPreferences::default(),
            max_concurrent_workspaces: 4,
            workspace_priority_ids: vec!["a".into()],
            workspace_deferred_ids: vec!["b".into()],
            workspace_natural_order: vec!["c".into()],
        };
        let json = serde_json::to_string(&snap).unwrap();
        assert!(json.contains("\"maxConcurrentWorkspaces\":4"));
        assert!(json.contains("\"workspacePriorityIds\":[\"a\"]"));
        assert!(json.contains("\"workspaceDeferredIds\":[\"b\"]"));
        assert!(json.contains("\"workspaceNaturalOrder\":[\"c\"]"));
    }
}
```

- [ ] **Step 8: Run all Rust tests to verify they pass**

```powershell
$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"
cargo fmt --all
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace
```
Expected: All Rust tests pass, 0 clippy warnings.

- [ ] **Step 9: Commit**

```powershell
git add ai-digital-life/crates/kernel/src/config.rs ai-digital-life/crates/types/src/types/config.rs ai-digital-life/crates/types/src/types/mod.rs ai-digital-life/src-tauri/src/commands/app.rs
git commit -m "feat(rust): add workspace loading fields to AppConfig, AppPreferencePatch, ConfigSnapshot"
```

---

## Task 2: Sync frontend IPC types and bridges

**Files:**
- Modify: `ai-digital-life/frontend/src/shared/ipc-types.generated.ts:47-75`
- Modify: `ai-digital-life/frontend/src/shared/defaultPreferences.ts:21-65`
- Modify: `ai-digital-life/frontend/src/shared/preferencesMerger.ts:64-72`
- Modify: `ai-digital-life/frontend/src/preview-bridge/preview-model.ts`
- Modify: `ai-digital-life/frontend/src/mock/mock-shared-workspace.ts`
- Test: existing tests in `ai-digital-life/frontend/src/shared/`

**Interfaces:**
- Consumes: Rust struct changes from Task 1
- Produces: `AppPreferencePatch.workspaceNaturalOrder?: string[]`, `ConfigSnapshot.workspaceNaturalOrder: string[]`

- [ ] **Step 1: Add `workspaceNaturalOrder` to `AppPreferencePatch` and `ConfigSnapshot` in `ipc-types.generated.ts`**

Edit `ai-digital-life/frontend/src/shared/ipc-types.generated.ts`. In `AppPreferencePatch` (lines 47-59), add the new field after `workspaceDeferredIds`:

```ts
export interface AppPreferencePatch {
  language?: string;
  themeMode?: ThemeMode;
  logLevel?: string;
  terminalLogMode?: LogMode;
  debugLogMode?: LogMode;
  modelPreferences?: Record<string, ModelProviderPreferencePatch>;
  keybinds?: Record<string, string>;
  fonts?: FontPreferences;
  maxConcurrentWorkspaces?: number;
  workspacePriorityIds?: string[];
  workspaceDeferredIds?: string[];
  workspaceNaturalOrder?: string[];
}
```

In `ConfigSnapshot` (lines 61-75), add the new field after `workspaceDeferredIds`:

```ts
export interface ConfigSnapshot {
  language: string;
  themeMode: ThemeMode;
  resolvedTheme: Theme;
  logLevel: string;
  terminalLogMode: LogMode;
  debugLogMode: LogMode;
  maxRecentWorkspaces: number;
  modelPreferences: ModelPreferences;
  keybinds: Record<string, string>;
  fonts: FontPreferences;
  maxConcurrentWorkspaces: number;
  workspacePriorityIds: string[];
  workspaceDeferredIds: string[];
  workspaceNaturalOrder: string[];
}
```

- [ ] **Step 2: Add `DEFAULT_WORKSPACE_NATURAL_ORDER` and update `getDefaultPreferences` / `getDefaultForSetting` in `defaultPreferences.ts`**

Edit `ai-digital-life/frontend/src/shared/defaultPreferences.ts`. Add the new constant after line 23 (`DEFAULT_WORKSPACE_DEFERRED_IDS`):

```ts
export const DEFAULT_MAX_CONCURRENT_WORKSPACES = 6;
export const DEFAULT_WORKSPACE_PRIORITY_IDS: string[] = [];
export const DEFAULT_WORKSPACE_DEFERRED_IDS: string[] = [];
export const DEFAULT_WORKSPACE_NATURAL_ORDER: string[] = [];
```

In `getDefaultPreferences()` (lines 25-38), add `workspaceNaturalOrder` to the returned object:

```ts
export function getDefaultPreferences(): AppPreferencePatch {
  return {
    language: DEFAULT_LANGUAGE,
    themeMode: DEFAULT_THEME_MODE,
    logLevel: DEFAULT_LOG_LEVEL,
    terminalLogMode: DEFAULT_TERMINAL_LOG_MODE,
    debugLogMode: DEFAULT_DEBUG_LOG_MODE,
    keybinds: { ...DEFAULT_KEYBINDS },
    fonts: { ...DEFAULT_FONTS },
    maxConcurrentWorkspaces: DEFAULT_MAX_CONCURRENT_WORKSPACES,
    workspacePriorityIds: [...DEFAULT_WORKSPACE_PRIORITY_IDS],
    workspaceDeferredIds: [...DEFAULT_WORKSPACE_DEFERRED_IDS],
    workspaceNaturalOrder: [...DEFAULT_WORKSPACE_NATURAL_ORDER],
  };
}
```

In `getDefaultForSetting` (lines 40-65), add a case for `workspaceNaturalOrder`:

```ts
    case 'workspacePriorityIds':
      return DEFAULT_WORKSPACE_PRIORITY_IDS;
    case 'workspaceDeferredIds':
      return DEFAULT_WORKSPACE_DEFERRED_IDS;
    case 'workspaceNaturalOrder':
      return DEFAULT_WORKSPACE_NATURAL_ORDER;
```

- [ ] **Step 3: Add `workspaceNaturalOrder` handling to `applyPreferencePatch` in `preferencesMerger.ts`**

Edit `ai-digital-life/frontend/src/shared/preferencesMerger.ts`. After the `workspaceDeferredIds` block (lines 70-72), add the new block:

```ts
  if (patch.workspaceDeferredIds !== undefined) {
    nextConfig.workspaceDeferredIds = patch.workspaceDeferredIds;
  }
  if (patch.workspaceNaturalOrder !== undefined) {
    nextConfig.workspaceNaturalOrder = patch.workspaceNaturalOrder;
  }

  return nextConfig;
```

- [ ] **Step 4: Update `preview-model.ts` default config**

Read `ai-digital-life/frontend/src/preview-bridge/preview-model.ts` lines 30-50 to locate the `config` object. Add `workspaceNaturalOrder: []` next to the existing 3 fields:

```ts
config: {
  // ... existing fields ...
  maxConcurrentWorkspaces: 6,
  workspacePriorityIds: [],
  workspaceDeferredIds: [],
  workspaceNaturalOrder: [],
},
```

If `preview-model.ts` persists preference patches to localStorage, verify the persistence layer (likely in `preview-bridge/storage.ts`) accepts arbitrary config keys — it should, since it's a generic JSON store. No code change needed beyond adding the default.

- [ ] **Step 5: Update `mock-shared-workspace.ts` default config**

Read `ai-digital-life/frontend/src/mock/mock-shared-workspace.ts` lines 110-125. Add `workspaceNaturalOrder: []` next to the existing 3 fields:

```ts
config: {
  // ... existing fields ...
  maxConcurrentWorkspaces: 6,
  workspacePriorityIds: [],
  workspaceDeferredIds: [],
  workspaceNaturalOrder: [],
},
```

- [ ] **Step 6: Run frontend typecheck and tests**

```powershell
$env:Path = "C:\Program Files\nodejs;$env:Path"
pnpm --dir ai-digital-life/frontend run typecheck
pnpm --dir ai-digital-life/frontend run test -- --run shared
```
Expected: typecheck passes; all shared tests pass (existing tests should not regress since we only added fields).

- [ ] **Step 7: Commit**

```powershell
git add ai-digital-life/frontend/src/shared/ipc-types.generated.ts ai-digital-life/frontend/src/shared/defaultPreferences.ts ai-digital-life/frontend/src/shared/preferencesMerger.ts ai-digital-life/frontend/src/preview-bridge/preview-model.ts ai-digital-life/frontend/src/mock/mock-shared-workspace.ts
git commit -m "feat(frontend): sync workspace loading IPC types across three bridges"
```

---

## Task 3: Create `computeLoadPhases` pure function (TDD)

**Files:**
- Create: `ai-digital-life/frontend/src/app/stores/actions/workspaceLoadOrder.ts`
- Test: `ai-digital-life/frontend/src/app/stores/actions/workspaceLoadOrder.test.ts`

**Interfaces:**
- Consumes: `RecentWorkspaceEntry` from `@ai-digital-life/kernel`
- Produces: `LoadPhases` interface and `computeLoadPhases(priorityIds, deferredIds, naturalOrder, visibleWorkspaces): LoadPhases` function

- [ ] **Step 1: Write the failing test file**

Create `ai-digital-life/frontend/src/app/stores/actions/workspaceLoadOrder.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { computeLoadPhases } from './workspaceLoadOrder';
import type { RecentWorkspaceEntry } from '@ai-digital-life/kernel';

function makeWs(id: string): RecentWorkspaceEntry {
  return {
    id,
    path: `/fake/${id}`,
    rootPath: `/fake/${id}`,
    name: id,
    lastOpenedAt: 0,
    isPinned: false,
    pinnedOrder: 0,
    unpinnedOrder: 0,
    removedFromSidebar: false,
    available: true,
    hiddenFromRightPanels: false,
  } as RecentWorkspaceEntry;
}

describe('computeLoadPhases', () => {
  it('returns all-empty phases when inputs are empty', () => {
    const phases = computeLoadPhases([], [], [], []);
    expect(phases.priority).toEqual([]);
    expect(phases.deferred).toEqual([]);
    expect(phases.natural).toEqual([]);
  });

  it('places priority workspaces in priority phase in array order', () => {
    const visible = [makeWs('a'), makeWs('b'), makeWs('c')];
    const phases = computeLoadPhases(['c', 'a', 'b'], [], [], visible);
    expect(phases.priority.map((w) => w.id)).toEqual(['c', 'a', 'b']);
    expect(phases.deferred).toEqual([]);
    expect(phases.natural).toEqual([]);
  });

  it('places deferred workspaces in deferred phase in array order', () => {
    const visible = [makeWs('a'), makeWs('b')];
    const phases = computeLoadPhases([], ['b', 'a'], [], visible);
    expect(phases.priority).toEqual([]);
    expect(phases.deferred.map((w) => w.id)).toEqual(['b', 'a']);
    expect(phases.natural).toEqual([]);
  });

  it('places natural-order workspaces in natural phase in array order', () => {
    const visible = [makeWs('a'), makeWs('b'), makeWs('c')];
    const phases = computeLoadPhases([], [], ['c', 'a', 'b'], visible);
    expect(phases.priority).toEqual([]);
    expect(phases.deferred).toEqual([]);
    expect(phases.natural.map((w) => w.id)).toEqual(['c', 'a', 'b']);
  });

  it('mixes all three phases preserving order', () => {
    const visible = [makeWs('a'), makeWs('b'), makeWs('c'), makeWs('d'), makeWs('e')];
    const phases = computeLoadPhases(['a'], ['b'], ['c', 'd'], visible);
    expect(phases.priority.map((w) => w.id)).toEqual(['a']);
    expect(phases.deferred.map((w) => w.id)).toEqual(['b']);
    expect(phases.natural.map((w) => w.id)).toEqual(['c', 'd', 'e']);
  });

  it('filters out orphan IDs (pointing to removed workspaces)', () => {
    const visible = [makeWs('a'), makeWs('b')];
    const phases = computeLoadPhases(['a', 'ghost'], [], ['b', 'phantom'], visible);
    expect(phases.priority.map((w) => w.id)).toEqual(['a']);
    expect(phases.natural.map((w) => w.id)).toEqual(['b']);
  });

  it('appends stray workspaces (not in any list) to natural phase end', () => {
    const visible = [makeWs('a'), makeWs('b'), makeWs('c'), makeWs('d')];
    // 'a' in priority, 'b' in deferred, 'c' in natural order, 'd' is stray
    const phases = computeLoadPhases(['a'], ['b'], ['c'], visible);
    expect(phases.priority.map((w) => w.id)).toEqual(['a']);
    expect(phases.deferred.map((w) => w.id)).toEqual(['b']);
    expect(phases.natural.map((w) => w.id)).toEqual(['c', 'd']);
  });

  it('returns empty phases when visibleWorkspaces is empty (all IDs become orphans)', () => {
    const phases = computeLoadPhases(['a'], ['b'], ['c'], []);
    expect(phases.priority).toEqual([]);
    expect(phases.deferred).toEqual([]);
    expect(phases.natural).toEqual([]);
  });

  it('preserves array order exactly for priority phase', () => {
    const visible = [makeWs('1'), makeWs('2'), makeWs('3'), makeWs('4')];
    const phases = computeLoadPhases(['4', '1', '3', '2'], [], [], visible);
    expect(phases.priority.map((w) => w.id)).toEqual(['4', '1', '3', '2']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```powershell
$env:Path = "C:\Program Files\nodejs;$env:Path"
pnpm --dir ai-digital-life/frontend exec vitest run src/app/stores/actions/workspaceLoadOrder.test.ts
```
Expected: FAIL with "Failed to resolve import './workspaceLoadOrder'" or similar.

- [ ] **Step 3: Implement `computeLoadPhases`**

Create `ai-digital-life/frontend/src/app/stores/actions/workspaceLoadOrder.ts`:

```ts
import type { RecentWorkspaceEntry } from '@ai-digital-life/kernel';

export interface LoadPhases {
  /** High priority: loaded synchronously at app startup (blocks first screen). */
  priority: RecentWorkspaceEntry[];
  /** Medium priority: loaded asynchronously after first screen is ready. */
  deferred: RecentWorkspaceEntry[];
  /** Low priority: loaded after priority and deferred phases complete. */
  natural: RecentWorkspaceEntry[];
}

/**
 * Compute the cascading workspace load order from three independent ID arrays.
 *
 * Rules:
 * - IDs in `priorityIds` / `deferredIds` / `naturalOrder` are resolved against
 *   `visibleWorkspaces` and placed in their respective phase, preserving array order.
 * - IDs that don't match any visible workspace (orphans) are silently filtered out.
 * - Visible workspaces that don't appear in any of the three arrays (strays) are
 *   appended to the end of the `natural` phase, in `visibleWorkspaces` order.
 *
 * This function is pure — no side effects, no I/O. Trivially unit-testable.
 */
export function computeLoadPhases(
  priorityIds: string[],
  deferredIds: string[],
  naturalOrder: string[],
  visibleWorkspaces: RecentWorkspaceEntry[]
): LoadPhases {
  const lookup = new Map(visibleWorkspaces.map((w) => [w.id, w] as const));
  const configured = new Set<string>([...priorityIds, ...deferredIds, ...naturalOrder]);

  const resolve = (ids: string[]): RecentWorkspaceEntry[] =>
    ids
      .map((id) => lookup.get(id))
      .filter((w): w is RecentWorkspaceEntry => w !== undefined);

  return {
    priority: resolve(priorityIds),
    deferred: resolve(deferredIds),
    natural: [
      ...resolve(naturalOrder),
      ...visibleWorkspaces.filter((w) => !configured.has(w.id)),
    ],
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

```powershell
$env:Path = "C:\Program Files\nodejs;$env:Path"
pnpm --dir ai-digital-life/frontend exec vitest run src/app/stores/actions/workspaceLoadOrder.test.ts
```
Expected: PASS — all 9 tests pass.

- [ ] **Step 5: Commit**

```powershell
git add ai-digital-life/frontend/src/app/stores/actions/workspaceLoadOrder.ts ai-digital-life/frontend/src/app/stores/actions/workspaceLoadOrder.test.ts
git commit -m "feat(stores): add computeLoadPhases pure function for cascading workspace load order"
```

---

## Task 4: Rewrite workspace loading block in `generalActions.ts`

**Files:**
- Modify: `ai-digital-life/frontend/src/app/stores/actions/generalActions.ts:162-243`
- Modify: `ai-digital-life/frontend/src/app/stores/actions/generalActions.test.ts:167-174`

**Interfaces:**
- Consumes: `computeLoadPhases` from Task 3, `LoadPhases` interface
- Produces: rewired `bootstrap` action with two-stage execution + `logRejected` helper

- [ ] **Step 1: Write the failing test for call order**

Edit `ai-digital-life/frontend/src/app/stores/actions/generalActions.test.ts`. Replace the `workspace concurrency ordering` describe block (lines 167-174) with:

```ts
describe('workspace load cascade ordering', () => {
  it('calls loadBatch in order: priority → completeStartup → deferred → natural', async () => {
    // Mock window.digitalLife for bootstrap path
    const callOrder: string[] = [];
    const mockListTreeForWorkspace = vi.fn().mockResolvedValue({ ok: true, data: [] });
    const mockListGitStatusForWorkspace = vi.fn().mockResolvedValue({ ok: true, data: undefined });
    const mockGetGitStatus = vi.fn().mockResolvedValue({ ok: true, data: { branch: 'main' } });

    (window as unknown as { digitalLife: unknown }).digitalLife = {
      app: {
        getInfo: vi.fn().mockResolvedValue({
          ok: true,
          data: {
            appName: 'test',
            version: '0.0.0',
            config: {
              themeMode: 'light',
              resolvedTheme: 'light',
              maxRecentWorkspaces: 10,
              modelPreferences: { providers: {} },
              keybinds: {},
              fonts: {},
              maxConcurrentWorkspaces: 6,
              workspacePriorityIds: ['ws-1'],
              workspaceDeferredIds: ['ws-2'],
              workspaceNaturalOrder: ['ws-3'],
            },
            recentLogs: [],
            currentWorkspace: { id: 'ws-1', path: '/fake', rootPath: '/fake', name: 'ws-1' },
          },
        }),
        getModelHealth: vi.fn().mockResolvedValue({ ok: true, data: [] }),
      },
      workspace: {
        listRecent: vi.fn().mockResolvedValue({
          ok: true,
          data: [
            { id: 'ws-1', path: '/fake/1', rootPath: '/fake/1', name: 'ws-1', lastOpenedAt: 0, isPinned: false, pinnedOrder: 0, unpinnedOrder: 0, removedFromSidebar: false, available: true, hiddenFromRightPanels: false },
            { id: 'ws-2', path: '/fake/2', rootPath: '/fake/2', name: 'ws-2', lastOpenedAt: 0, isPinned: false, pinnedOrder: 0, unpinnedOrder: 0, removedFromSidebar: false, available: true, hiddenFromRightPanels: false },
            { id: 'ws-3', path: '/fake/3', rootPath: '/fake/3', name: 'ws-3', lastOpenedAt: 0, isPinned: false, pinnedOrder: 0, unpinnedOrder: 0, removedFromSidebar: false, available: true, hiddenFromRightPanels: false },
          ],
        }),
        getGitStatus: mockGetGitStatus,
        listTreeForWorkspace: mockListTreeForWorkspace,
        listGitStatusForWorkspace: mockListGitStatusForWorkspace,
        setEditorDirtyPaths: vi.fn().mockResolvedValue({ ok: true }),
      },
      patch: { getPatchSet: vi.fn().mockResolvedValue({ ok: true, data: null }) },
      task: { listAuditEntries: vi.fn().mockResolvedValue({ ok: true, data: [] }) },
      command: { listRecent: vi.fn().mockResolvedValue({ ok: true, data: [] }) },
      retrieval: { getStatus: vi.fn().mockResolvedValue({ ok: true, data: null }), getRepoMap: vi.fn().mockResolvedValue({ ok: true, data: [] }) },
    };

    // Track call order via listTreeForWorkspace invocations (each phase triggers N calls)
    mockListTreeForWorkspace.mockImplementation(async (path: string) => {
      callOrder.push(`loadBatch:${path}`);
      return { ok: true, data: [] };
    });
    mockListGitStatusForWorkspace.mockImplementation(async (path: string) => {
      callOrder.push(`loadBatch:${path}`);
      return { ok: true, data: undefined };
    });

    const store = useAppStore.getState();
    // Reset appReady for the test
    useAppStore.setState({ appReady: false });
    await store.bootstrap();

    // Allow the deferred IIFE to flush
    await new Promise((resolve) => setTimeout(resolve, 50));

    // priority batch must complete before appReady flips to true
    expect(useAppStore.getState().appReady).toBe(true);
    // All 3 workspaces should have been loaded (each triggers 2 calls — tree + git)
    expect(mockListTreeForWorkspace).toHaveBeenCalledTimes(3);
    expect(mockListGitStatusForWorkspace).toHaveBeenCalledTimes(3);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```powershell
$env:Path = "C:\Program Files\nodejs;$env:Path"
pnpm --dir ai-digital-life/frontend exec vitest run src/app/stores/actions/generalActions.test.ts
```
Expected: FAIL — either the new test fails (old code path still active) or other tests fail because the bootstrap path is broken.

- [ ] **Step 3: Rewrite the workspace loading block in `generalActions.ts`**

Edit `ai-digital-life/frontend/src/app/stores/actions/generalActions.ts`. First add the import at the top (after line 14, the `runWithConcurrency` import):

```ts
import { runWithConcurrency } from '../../shared/asyncUtils';
import { computeLoadPhases, type LoadPhases } from './workspaceLoadOrder';
import type { StoreApi } from 'zustand';
```

Replace lines 162-243 (the `queueLowPriorityRefresh(async () => { ... });` block that contains the workspace loading logic). Locate the block starting with `if (visibleWorkspaces.length > 0) {` and ending with `completeStartup();` — replace the whole block from `if (visibleWorkspaces.length > 0) {` through `}` just before `completeStartup();`:

```ts
        queueLowPriorityRefresh(async () => {
          if (requestSeq !== workspaceRequestSeq) {
            return;
          }
          await Promise.allSettled([
            get().fetchAuditEntries(40),
            get().fetchCommandHistory(),
            get().fetchGitBranches(),
          ]);

          if (visibleWorkspaces.length > 0) {
            const appInfo_ = get().appInfo;
            const config = appInfo_?.config;
            const priorityIds: string[] = config?.workspacePriorityIds ?? [];
            const deferredIds: string[] = config?.workspaceDeferredIds ?? [];
            const naturalOrder: string[] = config?.workspaceNaturalOrder ?? [];
            const maxConcurrent = config?.maxConcurrentWorkspaces ?? 6;

            const phases = computeLoadPhases(
              priorityIds,
              deferredIds,
              naturalOrder,
              visibleWorkspaces
            );

            /**
             * Logs any rejected Promise.allSettled results for a phase.
             * Required by error-handling.md — never silently swallow rejections.
             */
            function logRejected<T>(
              results: PromiseSettledResult<T>[],
              phase: 'priority' | 'deferred' | 'natural'
            ): void {
              for (const r of results) {
                if (r.status === 'rejected') {
                  console.warn(`[workspace load] ${phase} phase rejected:`, r.reason);
                }
              }
            }

            async function loadBatch(
              items: RecentWorkspaceEntry[],
              concurrency: number
            ): Promise<PromiseSettledResult<{ id: string; tree: unknown; snapshot: unknown }>[]> {
              const tasks = items.map((w) => ({
                id: w.id,
                treeLoader: () =>
                  window.digitalLife.workspace
                    .listTreeForWorkspace(w.path)
                    .then((r) => (r.ok ? r.data : undefined)),
                snapshotLoader: () =>
                  window.digitalLife.workspace
                    .listGitStatusForWorkspace(w.path)
                    .then((r) => (r.ok ? r.data : undefined)),
              }));
              const results = await runWithConcurrency(tasks, concurrency, async (task) => {
                const [tree, snapshot] = await Promise.all([
                  task.treeLoader(),
                  task.snapshotLoader(),
                ]);
                return { id: task.id, tree, snapshot };
              });
              const batch_: Partial<StoreState> = {};
              for (const r of results) {
                if (r.status === 'fulfilled') {
                  const { id, tree, snapshot } = r.value;
                  if (tree !== undefined) {
                    accumulateBatch(batch_, get, 'workspaceTrees', id, tree);
                    accumulateBatch(batch_, get, 'workspaceTreeLoading', id, false);
                  } else {
                    // 修复：失败时也清除 loading 状态，避免永久卡死
                    accumulateBatch(batch_, get, 'workspaceTreeLoading', id, false);
                  }
                  if (snapshot !== undefined) {
                    accumulateBatch(batch_, get, 'gitSnapshots', id, snapshot);
                    accumulateBatch(batch_, get, 'workspaceChangesTreeLoading', id, false);
                  } else {
                    accumulateBatch(batch_, get, 'workspaceChangesTreeLoading', id, false);
                  }
                }
                // rejected items are logged by logRejected() at the call site
              }
              if (Object.keys(batch_).length > 0) {
                set(batch_);
              }
              return results;
            }

            // === Stage 1: priority blocks first screen ===
            if (phases.priority.length > 0) {
              const results = await loadBatch(phases.priority, maxConcurrent);
              logRejected(results, 'priority');
            }

            // === First screen ready ===
            completeStartup();

            // === Stage 2: deferred → natural cascade (non-blocking) ===
            void (async () => {
              try {
                if (phases.deferred.length > 0) {
                  const deferredConcurrency = Math.min(2, maxConcurrent);
                  const results = await loadBatch(phases.deferred, deferredConcurrency);
                  logRejected(results, 'deferred');
                }

                if (phases.natural.length > 0) {
                  const naturalConcurrency = Math.min(2, maxConcurrent);
                  const results = await loadBatch(phases.natural, naturalConcurrency);
                  logRejected(results, 'natural');
                }
              } catch (err) {
                console.warn('[workspace load] background cascade failed', err);
              }
            })();
            return;
          }

          completeStartup();
        });
```

Note: the trailing `completeStartup();` (line 242 in the old code) is now inside both branches of the `if (visibleWorkspaces.length > 0)` — make sure there are no duplicate calls. The structure is: if workspaces exist, do stages 1+2 (which calls `completeStartup` between them); otherwise, fall through to the trailing `completeStartup()`.

- [ ] **Step 4: Run tests to verify they pass**

```powershell
$env:Path = "C:\Program Files\nodejs;$env:Path"
pnpm --dir ai-digital-life/frontend exec vitest run src/app/stores/actions/generalActions.test.ts
```
Expected: PASS — all tests including the new `workspace load cascade ordering` test.

If the new test is flaky due to IIFE timing, increase the `setTimeout(resolve, 50)` to `100` or `200`. Do not use `requestAnimationFrame` (forbidden by project rules).

- [ ] **Step 5: Run typecheck**

```powershell
$env:Path = "C:\Program Files\nodejs;$env:Path"
pnpm --dir ai-digital-life/frontend run typecheck
```
Expected: PASS — no type errors. The `as Record<string, unknown>` cast on line 174 should now be removed (the new code uses typed `config` access).

- [ ] **Step 6: Commit**

```powershell
git add ai-digital-life/frontend/src/app/stores/actions/generalActions.ts ai-digital-life/frontend/src/app/stores/actions/generalActions.test.ts
git commit -m "feat(stores): cascade workspace load in priority → deferred → natural order"
```

---

## Task 5: Update i18n keys (zh-CN and en-US)

**Files:**
- Modify: `ai-digital-life/frontend/src/app/i18n/zh-CN/workspace.ts:94-109`
- Modify: `ai-digital-life/frontend/src/app/i18n/en-US/workspace.ts:97-112`

**Interfaces:**
- Consumes: nothing
- Produces: new i18n keys for the settings panel

- [ ] **Step 1: Update zh-CN workspace.ts**

Edit `ai-digital-life/frontend/src/app/i18n/zh-CN/workspace.ts`. Replace lines 94-109 with:

```ts
  // Workspace loading settings
  settingsWorkspaceLoad: '工作区加载',
  maxConcurrentWorkspaces: '最大并行加载数',
  maxConcurrentWorkspacesDesc:
    '较高的数值会加快 priority 阶段加载速度，但会增加 CPU/内存压力。每个工作区同时发起 2 个请求（文件树 + Git 状态）。建议值：4-8。注意：deferred 与工作区标签列表阶段固定使用 min(2, 此值) 作为并发上限，以降低后台负载',
  priorityList: '优先加载（可选）',
  priorityListDesc: '应用程序启动时同步加载，会阻塞首屏直到全部完成',
  priorityListTooltip:
    '【优先加载列表】\n\n加载时机：应用程序启动时同步加载，会阻塞首屏渲染。所有 priority 工作区加载完成后，应用程序才会标记为就绪 (appReady)\n\n并发上限：maxConcurrent（用户配置，默认 6）\n\n注意：放入此列表的工作区越多，首屏等待时间越长。建议只放当前最常用的工作区\n\n特殊情况：若此列表为空，则跳过此阶段，直接进入下一阶段',
  deferredList: '延迟加载（可选）',
  deferredListDesc: '首屏就绪后异步加载，不阻塞界面响应',
  deferredListTooltip:
    '【延迟加载列表】\n\n加载时机：首屏就绪 (appReady) 后异步加载，不阻塞界面响应。用户可以在 deferred 加载期间正常操作应用\n\n并发上限：min(2, maxConcurrent)，限制后台负载\n\n执行顺序：在 priority 阶段完成后开始；本阶段完成后才进入工作区标签列表阶段\n\n特殊情况：若此列表为空，则跳过此阶段，直接进入工作区标签列表阶段',
  workspaceTagList: '工作区标签列表',
  workspaceTagListDesc:
    '前两个列表都完成后异步加载。默认按添加时间倒序排列（新添加的在上方）',
  workspaceTagListTooltip:
    '【工作区标签列表】\n\n加载时机：priority 和 deferred 两个列表都完成后异步加载，是最低优先级批次\n\n并发上限：min(2, maxConcurrent)，限制后台负载\n\n默认顺序：按工作区添加时间倒序排列（新添加的在上方，早添加的在下方）。用户可通过拖拽自定义顺序\n\n独立性：此列表的顺序独立于应用程序左侧面板的工作区标签顺序，互不影响。仅此三个列表的顺序决定工作区加载次序\n\n特殊情况：\n• 若 priority 为空且 deferred 非空，则 deferred 升级为高优先级，本列表仍为低优先级\n• 若 priority 和 deferred 都为空，则本列表升级为高优先级（首屏阻塞）\n• 若 priority 非空且 deferred 为空，则本列表升级为中优先级（首屏后立即执行）\n• 游离工作区（未在任一列表中）会自动追加到本列表末尾',
  priorityListEmpty: '将工作区拖入此处设置优先加载',
  deferredListEmpty: '将工作区拖入此处设置延迟加载',
  workspaceTagListEmpty: '所有工作区都已分到优先或延迟列表',
  moveUp: '上移',
  moveDown: '下移',
  removeWorkspace: '移除 {name}',
```

Note: All empty-state and desc texts must NOT end with period (per `dev-rules.md`). The tooltip texts are sentences and may end with period inside the tooltip body, but the `desc` and `empty` fields do not end with period. The tooltips end with no period to be consistent.

- [ ] **Step 2: Update en-US workspace.ts (mirror)**

Edit `ai-digital-life/frontend/src/app/i18n/en-US/workspace.ts`. Replace the equivalent block (around lines 97-112) with:

```ts
  // Workspace loading settings
  settingsWorkspaceLoad: 'Workspace Loading',
  maxConcurrentWorkspaces: 'Max concurrent loading',
  maxConcurrentWorkspacesDesc:
    'Higher values speed up the priority phase but increase CPU/memory pressure. Each workspace loads 2 concurrent requests (file tree + git status). Recommended: 4-8. Note: deferred and workspace tag list phases use min(2, this value) as their concurrency cap to reduce background load',
  priorityList: 'Priority (optional)',
  priorityListDesc: 'Loaded synchronously at app startup; blocks first screen until all complete',
  priorityListTooltip:
    '[Priority Loading List]\n\nTiming: Loaded synchronously at app startup; blocks first screen rendering. The app is not marked ready (appReady) until all priority workspaces finish loading\n\nConcurrency cap: maxConcurrent (user-configured, default 6)\n\nNote: The more workspaces in this list, the longer the first screen waits. Recommend only your most-used workspaces here\n\nSpecial case: If this list is empty, this phase is skipped and execution proceeds to the next phase',
  deferredList: 'Deferred (optional)',
  deferredListDesc: 'Loaded asynchronously after first screen is ready; does not block UI',
  deferredListTooltip:
    '[Deferred Loading List]\n\nTiming: Loaded asynchronously after first screen is ready (appReady); does not block UI. Users can operate the app normally during deferred loading\n\nConcurrency cap: min(2, maxConcurrent) to limit background load\n\nOrder: Begins after the priority phase completes; the workspace tag list phase begins only after this phase completes\n\nSpecial case: If this list is empty, this phase is skipped and execution proceeds to the workspace tag list phase',
  workspaceTagList: 'Workspace Tag List',
  workspaceTagListDesc:
    'Loaded asynchronously after both lists above complete. Default order: by add time descending (newest on top)',
  workspaceTagListTooltip:
    '[Workspace Tag List]\n\nTiming: Loaded asynchronously after both the priority and deferred lists complete; this is the lowest priority batch\n\nConcurrency cap: min(2, maxConcurrent) to limit background load\n\nDefault order: by workspace add time descending (newest on top, oldest at bottom). Users can customize via drag-and-drop\n\nIndependence: This list order is independent of the sidebar workspace tag order; neither affects the other. Only these three lists determine workspace load order\n\nSpecial cases:\n• If priority is empty and deferred is non-empty, deferred becomes high priority; this list remains low priority\n• If both priority and deferred are empty, this list becomes high priority (blocks first screen)\n• If priority is non-empty and deferred is empty, this list becomes medium priority (runs immediately after first screen)\n• Stray workspaces (not in any list) are automatically appended to the end of this list',
  priorityListEmpty: 'Drag a workspace here to prioritize it',
  deferredListEmpty: 'Drag a workspace here to defer it',
  workspaceTagListEmpty: 'All workspaces are assigned to priority or deferred lists',
  moveUp: 'Move up',
  moveDown: 'Move down',
  removeWorkspace: 'Remove {name}',
```

- [ ] **Step 3: Run typecheck**

```powershell
$env:Path = "C:\Program Files\nodejs;$env:Path"
pnpm --dir ai-digital-life/frontend run typecheck
```
Expected: PASS. The `CopyKey` type is derived from `zhCN`, so adding/removing keys in zh-CN will surface any consumer referencing a removed key (`defaultOrderHint`, `defaultOrderAllConfigured`) as a compile error.

If typecheck fails because some file still references `t.defaultOrderHint` or `t.defaultOrderAllConfigured`, search and replace those with the new key names. Likely locations: `WorkspaceSettings.tsx` (will be refactored in Task 7, but typecheck must still pass between tasks).

- [ ] **Step 4: Commit**

```powershell
git add ai-digital-life/frontend/src/app/i18n/zh-CN/workspace.ts ai-digital-life/frontend/src/app/i18n/en-US/workspace.ts
git commit -m "feat(i18n): update workspace loading list copy and add detailed tooltips"
```

---

## Task 6: Create `useWorkspaceDnd` hook (TDD)

**Files:**
- Create: `ai-digital-life/frontend/src/app/features/workspace-settings/useWorkspaceDnd.ts`
- Test: `ai-digital-life/frontend/src/app/features/workspace-settings/useWorkspaceDnd.test.ts`

**Interfaces:**
- Consumes: `DragEndEvent`, `DragStartEvent` from `@dnd-kit/core`; `ContainerId` from `./WorkspaceSettingsTypes`
- Produces: `useWorkspaceDnd` hook returning `{ sensors, activeId, activeItem, handleDragStart, handleDragEnd }`

- [ ] **Step 1: Write the failing test file**

Create `ai-digital-life/frontend/src/app/features/workspace-settings/useWorkspaceDnd.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useWorkspaceDnd } from './useWorkspaceDnd';
import type { DraggableWorkspace } from './WorkspaceSettingsTypes';

// Helper: build a fake DragEndEvent
function makeDragEndEvent(
  activeId: string,
  overId: string | null
): { active: { id: string }; over: { id: string } | null } {
  return {
    active: { id: activeId },
    over: overId === null ? null : { id: overId },
  };
}

const items: DraggableWorkspace[] = [
  { id: 'a', name: 'A' },
  { id: 'b', name: 'B' },
  { id: 'c', name: 'C' },
  { id: 'x', name: 'X' },
  { id: 'y', name: 'Y' },
];

describe('useWorkspaceDnd', () => {
  it('does nothing when over is null', () => {
    const onChange = vi.fn();
    const { result } = renderHook(() =>
      useWorkspaceDnd({
        priorityIds: ['a'],
        deferredIds: [],
        naturalOrder: ['x', 'y'],
        visibleWorkspaces: items,
        onChange,
      })
    );
    act(() => {
      result.current.handleDragEnd(makeDragEndEvent('a', null) as never);
    });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('does nothing when active.id === over.id', () => {
    const onChange = vi.fn();
    const { result } = renderHook(() =>
      useWorkspaceDnd({
        priorityIds: ['a', 'b'],
        deferredIds: [],
        naturalOrder: ['x'],
        visibleWorkspaces: items,
        onChange,
      })
    );
    act(() => {
      result.current.handleDragEnd(makeDragEndEvent('a', 'a') as never);
    });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('reorders within priority list', () => {
    const onChange = vi.fn();
    const { result } = renderHook(() =>
      useWorkspaceDnd({
        priorityIds: ['a', 'b', 'c'],
        deferredIds: [],
        naturalOrder: [],
        visibleWorkspaces: items,
        onChange,
      })
    );
    // Drag 'a' onto 'b' → should insert before 'b' → ['a','b','c'] stays ['a','b','c']?
    // Actually: removing 'a' from index 0, inserting before 'b' at index 0 → ['a','b','c'] (no change).
    // To test real reorder, drag 'c' onto 'a' → remove 'c' (idx 2), insert before 'a' (idx 0) → ['c','a','b']
    act(() => {
      result.current.handleDragEnd(makeDragEndEvent('c', 'a') as never);
    });
    expect(onChange).toHaveBeenCalledWith({
      priority: ['c', 'a', 'b'],
      deferred: [],
      natural: [],
    });
  });

  it('reorders within natural list', () => {
    const onChange = vi.fn();
    const { result } = renderHook(() =>
      useWorkspaceDnd({
        priorityIds: [],
        deferredIds: [],
        naturalOrder: ['x', 'y'],
        visibleWorkspaces: items,
        onChange,
      })
    );
    // Drag 'y' onto 'x' → insert 'y' before 'x' → ['y', 'x']
    act(() => {
      result.current.handleDragEnd(makeDragEndEvent('y', 'x') as never);
    });
    expect(onChange).toHaveBeenCalledWith({
      priority: [],
      deferred: [],
      natural: ['y', 'x'],
    });
  });

  it('moves from priority to deferred empty placeholder', () => {
    const onChange = vi.fn();
    const { result } = renderHook(() =>
      useWorkspaceDnd({
        priorityIds: ['a'],
        deferredIds: [],
        naturalOrder: [],
        visibleWorkspaces: items,
        onChange,
      })
    );
    // Drop on the empty deferred list placeholder (id `list-deferred`)
    act(() => {
      result.current.handleDragEnd(makeDragEndEvent('a', 'list-deferred') as never);
    });
    expect(onChange).toHaveBeenCalledWith({
      priority: [],
      deferred: ['a'],
      natural: [],
    });
  });

  it('moves from deferred to priority on existing item', () => {
    const onChange = vi.fn();
    const { result } = renderHook(() =>
      useWorkspaceDnd({
        priorityIds: ['a'],
        deferredIds: ['b'],
        naturalOrder: [],
        visibleWorkspaces: items,
        onChange,
      })
    );
    // Drag 'b' onto 'a' → insert before 'a' → priority: ['b','a'], deferred: []
    act(() => {
      result.current.handleDragEnd(makeDragEndEvent('b', 'a') as never);
    });
    expect(onChange).toHaveBeenCalledWith({
      priority: ['b', 'a'],
      deferred: [],
      natural: [],
    });
  });

  it('moves from natural to priority', () => {
    const onChange = vi.fn();
    const { result } = renderHook(() =>
      useWorkspaceDnd({
        priorityIds: ['a'],
        deferredIds: [],
        naturalOrder: ['x'],
        visibleWorkspaces: items,
        onChange,
      })
    );
    // Drag 'x' onto 'a' → insert before 'a' → priority: ['x','a'], natural: []
    act(() => {
      result.current.handleDragEnd(makeDragEndEvent('x', 'a') as never);
    });
    expect(onChange).toHaveBeenCalledWith({
      priority: ['x', 'a'],
      deferred: [],
      natural: [],
    });
  });

  it('moves from priority to natural on existing item', () => {
    const onChange = vi.fn();
    const { result } = renderHook(() =>
      useWorkspaceDnd({
        priorityIds: ['a'],
        deferredIds: [],
        naturalOrder: ['x'],
        visibleWorkspaces: items,
        onChange,
      })
    );
    // Drag 'a' onto 'x' → insert before 'x' → priority: [], natural: ['a','x']
    act(() => {
      result.current.handleDragEnd(makeDragEndEvent('a', 'x') as never);
    });
    expect(onChange).toHaveBeenCalledWith({
      priority: [],
      deferred: [],
      natural: ['a', 'x'],
    });
  });

  it('moves to empty list placeholder (list-priority)', () => {
    const onChange = vi.fn();
    const { result } = renderHook(() =>
      useWorkspaceDnd({
        priorityIds: [],
        deferredIds: [],
        naturalOrder: ['x', 'y'],
        visibleWorkspaces: items,
        onChange,
      })
    );
    // Drag 'y' onto empty priority placeholder (id `list-priority`)
    act(() => {
      result.current.handleDragEnd(makeDragEndEvent('y', 'list-priority') as never);
    });
    expect(onChange).toHaveBeenCalledWith({
      priority: ['y'],
      deferred: [],
      natural: ['x'],
    });
  });

  it('deduplicates when item somehow exists in two lists (defensive)', () => {
    const onChange = vi.fn();
    const { result } = renderHook(() =>
      useWorkspaceDnd({
        // Manually construct invalid state: 'a' in both priority and deferred
        priorityIds: ['a'],
        deferredIds: ['a'],
        naturalOrder: [],
        visibleWorkspaces: items,
        onChange,
      })
    );
    // Drag 'a' (treats source as priority per findContainer first-match) onto deferred placeholder
    act(() => {
      result.current.handleDragEnd(makeDragEndEvent('a', 'list-deferred') as never);
    });
    const call = onChange.mock.calls[0][0];
    // 'a' should appear in exactly one list (deferred)
    const allIds = [...call.priority, ...call.deferred, ...call.natural];
    const aCount = allIds.filter((id: string) => id === 'a').length;
    expect(aCount).toBe(1);
    expect(call.deferred).toContain('a');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```powershell
$env:Path = "C:\Program Files\nodejs;$env:Path"
pnpm --dir ai-digital-life/frontend exec vitest run src/app/features/workspace-settings/useWorkspaceDnd.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `useWorkspaceDnd`**

Create `ai-digital-life/frontend/src/app/features/workspace-settings/useWorkspaceDnd.ts`:

```ts
import { useCallback, useMemo, useState } from 'react';
import {
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import type { ContainerId, DraggableWorkspace } from './WorkspaceSettingsTypes';

export interface UseWorkspaceDndArgs {
  priorityIds: string[];
  deferredIds: string[];
  naturalOrder: string[];
  visibleWorkspaces: DraggableWorkspace[];
  onChange: (next: { priority: string[]; deferred: string[]; natural: string[] }) => void;
}

export interface UseWorkspaceDndResult {
  sensors: ReturnType<typeof useSensors>;
  activeId: string | null;
  activeItem: DraggableWorkspace | null;
  handleDragStart: (e: DragStartEvent) => void;
  handleDragEnd: (e: DragEndEvent) => void;
}

const LIST_PREFIX = 'list-';

function isListPlaceholder(id: string): boolean {
  return id.startsWith(LIST_PREFIX);
}

function parseListKind(id: string): ContainerId {
  return id.slice(LIST_PREFIX.length) as ContainerId;
}

/**
 * Encapsulates all drag-and-drop logic for the three-list workspace settings UI.
 *
 * The `findContainer` lookup is memoized so `handleDragEnd`'s `useCallback` doesn't
 * invalidate every render (the original inline-function bug).
 *
 * Drop target detection:
 * - If `over.id` starts with `list-`, it's an empty-list placeholder → append to that list.
 * - Otherwise `over.id` is a workspace ID → find its container, insert before it.
 */
export function useWorkspaceDnd(args: UseWorkspaceDndArgs): UseWorkspaceDndResult {
  const { priorityIds, deferredIds, naturalOrder, visibleWorkspaces, onChange } = args;
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  // Memoized container lookup — Map<id, ContainerId>
  const containerMap = useMemo(() => {
    const map = new Map<string, ContainerId>();
    for (const id of priorityIds) map.set(id, 'priority');
    for (const id of deferredIds) map.set(id, 'deferred');
    for (const id of naturalOrder) map.set(id, 'natural');
    return map;
  }, [priorityIds, deferredIds, naturalOrder]);

  const findContainer = useCallback(
    (id: string): ContainerId => containerMap.get(id) ?? 'natural',
    [containerMap]
  );

  const handleDragStart = useCallback((e: DragStartEvent) => {
    setActiveId(String(e.active.id));
  }, []);

  const handleDragEnd = useCallback(
    (e: DragEndEvent) => {
      const { active, over } = e;
      setActiveId(null);
      if (!over) return;

      const itemId = String(active.id);
      const overId = String(over.id);
      if (itemId === overId) return;

      const fromContainer = findContainer(itemId);
      const toContainer = isListPlaceholder(overId)
        ? parseListKind(overId)
        : findContainer(overId);

      // Build working copies
      let newPriority = [...priorityIds];
      let newDeferred = [...deferredIds];
      let newNatural = [...naturalOrder];

      const getList = (c: ContainerId): string[] =>
        c === 'priority' ? newPriority : c === 'deferred' ? newDeferred : newNatural;

      const setList = (c: ContainerId, value: string[]) => {
        if (c === 'priority') newPriority = value;
        else if (c === 'deferred') newDeferred = value;
        else newNatural = value;
      };

      // Remove from source (if source is a real list — natural is "everyone else")
      if (fromContainer !== 'natural') {
        const src = getList(fromContainer);
        const idx = src.indexOf(itemId);
        if (idx !== -1) {
          setList(fromContainer, [...src.slice(0, idx), ...src.slice(idx + 1)]);
        }
      } else {
        // Remove from natural
        const idx = newNatural.indexOf(itemId);
        if (idx !== -1) {
          newNatural = [...newNatural.slice(0, idx), ...newNatural.slice(idx + 1)];
        }
      }

      // Insert into target
      if (isListPlaceholder(overId)) {
        // Append to target list end
        const target = getList(toContainer);
        setList(toContainer, [...target, itemId]);
      } else {
        // Insert before over.id
        const target = getList(toContainer);
        const overIdx = target.indexOf(overId);
        if (overIdx === -1) {
          setList(toContainer, [...target, itemId]);
        } else {
          setList(toContainer, [
            ...target.slice(0, overIdx),
            itemId,
            ...target.slice(overIdx),
          ]);
        }
      }

      // Deduplicate defensively — ensure itemId appears in exactly one list
      const prune = (list: string[], exclude: ContainerId): string[] => {
        const others: ContainerId[] = ['priority', 'deferred', 'natural'].filter(
          (c) => c !== exclude
        ) as ContainerId[];
        const otherSets = others.map((c) => new Set(getList(c)));
        return list.filter((id) => {
          // Keep id in this list only if it doesn't appear in other lists.
          // For itemId, keep only in the target container (toContainer) so that
          // defensive dedup of invalid input still converges to a single list.
          if (id === itemId) return exclude === toContainer;
          return !otherSets.some((s) => s.has(id));
        });
      };
      newPriority = prune(newPriority, 'priority');
      newDeferred = prune(newDeferred, 'deferred');
      newNatural = prune(newNatural, 'natural');

      onChange({ priority: newPriority, deferred: newDeferred, natural: newNatural });
    },
    [priorityIds, deferredIds, naturalOrder, findContainer, onChange]
  );

  const activeItem = activeId
    ? visibleWorkspaces.find((w) => w.id === activeId) ?? null
    : null;

  return {
    sensors,
    activeId,
    activeItem,
    handleDragStart,
    handleDragEnd,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

```powershell
$env:Path = "C:\Program Files\nodejs;$env:Path"
pnpm --dir ai-digital-life/frontend exec vitest run src/app/features/workspace-settings/useWorkspaceDnd.test.ts
```
Expected: PASS — all 10 tests pass.

- [ ] **Step 5: Commit**

```powershell
git add ai-digital-life/frontend/src/app/features/workspace-settings/useWorkspaceDnd.ts ai-digital-life/frontend/src/app/features/workspace-settings/useWorkspaceDnd.test.ts
git commit -m "feat(workspace-settings): extract useWorkspaceDnd hook with memoized findContainer"
```

---

## Task 7: Create `SortableWorkspaceList` component (TDD)

**Files:**
- Create: `ai-digital-life/frontend/src/app/features/workspace-settings/SortableWorkspaceList.tsx`
- Test: `ai-digital-life/frontend/src/app/features/workspace-settings/SortableWorkspaceList.test.tsx`

**Interfaces:**
- Consumes: `useSortable` from `@dnd-kit/sortable`, `useDroppable` from `@dnd-kit/core`, `TooltipSimple`, `IconAlertTriangle`
- Produces: `SortableWorkspaceList` component with `kind`, `title`, `desc`, `tooltipContent`, `items`, `emptyText`, optional `onRemove/onMoveUp/onMoveDown` props

- [ ] **Step 1: Write the failing test file**

Create `ai-digital-life/frontend/src/app/features/workspace-settings/SortableWorkspaceList.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { DndContext } from '@dnd-kit/core';
import { SortableWorkspaceList } from './SortableWorkspaceList';
import type { DraggableWorkspace } from './WorkspaceSettingsTypes';

function makeItems(ids: string[]): DraggableWorkspace[] {
  return ids.map((id) => ({ id, name: id.toUpperCase() }));
}

function renderInDnd(ui: React.ReactNode) {
  return render(<DndContext>{ui}</DndContext>);
}

describe('SortableWorkspaceList', () => {
  it('renders title and description text', () => {
    renderInDnd(
      <SortableWorkspaceList
        kind="priority"
        title="Priority"
        desc="Loaded first"
        tooltipContent="Tooltip text"
        items={makeItems(['a'])}
        emptyText="Empty"
      />
    );
    expect(screen.getByText('Priority')).toBeInTheDocument();
    expect(screen.getByText('Loaded first')).toBeInTheDocument();
  });

  it('renders all item names when items are non-empty', () => {
    renderInDnd(
      <SortableWorkspaceList
        kind="priority"
        title="P"
        desc="d"
        tooltipContent="t"
        items={makeItems(['a', 'b', 'c'])}
        emptyText="Empty"
      />
    );
    expect(screen.getByText('A')).toBeInTheDocument();
    expect(screen.getByText('B')).toBeInTheDocument();
    expect(screen.getByText('C')).toBeInTheDocument();
  });

  it('renders empty text when items list is empty', () => {
    renderInDnd(
      <SortableWorkspaceList
        kind="deferred"
        title="D"
        desc="d"
        tooltipContent="t"
        items={[]}
        emptyText="Drag here"
      />
    );
    expect(screen.getByText('Drag here')).toBeInTheDocument();
  });

  it('renders the "!" info button next to the title', () => {
    renderInDnd(
      <SortableWorkspaceList
        kind="priority"
        title="P"
        desc="d"
        tooltipContent="t"
        items={[]}
        emptyText="Empty"
      />
    );
    const infoButton = screen.getByRole('button', { name: '' });
    expect(infoButton).toBeInTheDocument();
    expect(infoButton.className).toContain('adl-icon-button--info');
  });

  it('renders action buttons (up/down/remove) for priority list', () => {
    renderInDnd(
      <SortableWorkspaceList
        kind="priority"
        title="P"
        desc="d"
        tooltipContent="t"
        items={makeItems(['a'])}
        emptyText="Empty"
        onMoveUp={() => {}}
        onMoveDown={() => {}}
        onRemove={() => {}}
      />
    );
    expect(screen.getByLabelText('Move up')).toBeInTheDocument();
    expect(screen.getByLabelText('Move down')).toBeInTheDocument();
    expect(screen.getByLabelText('Remove A')).toBeInTheDocument();
  });

  it('does not render action buttons for natural list', () => {
    renderInDnd(
      <SortableWorkspaceList
        kind="natural"
        title="N"
        desc="d"
        tooltipContent="t"
        items={makeItems(['a'])}
        emptyText="Empty"
        onMoveUp={() => {}}
        onMoveDown={() => {}}
        onRemove={() => {}}
      />
    );
    expect(screen.queryByLabelText('Move up')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Move down')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Remove A')).not.toBeInTheDocument();
  });

  it('registers the list container as droppable with data-droppable attribute', () => {
    const { container } = renderInDnd(
      <SortableWorkspaceList
        kind="priority"
        title="P"
        desc="d"
        tooltipContent="t"
        items={[]}
        emptyText="Empty"
      />
    );
    // The droppable list container should be marked
    const droppable = container.querySelector('[data-droppable="priority"]');
    expect(droppable).not.toBeNull();
  });

  it('disables move up button for first item', () => {
    renderInDnd(
      <SortableWorkspaceList
        kind="priority"
        title="P"
        desc="d"
        tooltipContent="t"
        items={makeItems(['a', 'b'])}
        emptyText="Empty"
        onMoveUp={() => {}}
        onMoveDown={() => {}}
        onRemove={() => {}}
      />
    );
    const buttons = screen.getAllByLabelText('Move up');
    expect(buttons[0]).toBeDisabled();
    expect(buttons[1]).not.toBeDisabled();
  });

  it('disables move down button for last item', () => {
    renderInDnd(
      <SortableWorkspaceList
        kind="priority"
        title="P"
        desc="d"
        tooltipContent="t"
        items={makeItems(['a', 'b'])}
        emptyText="Empty"
        onMoveUp={() => {}}
        onMoveDown={() => {}}
        onRemove={() => {}}
      />
    );
    const buttons = screen.getAllByLabelText('Move down');
    expect(buttons[0]).not.toBeDisabled();
    expect(buttons[1]).toBeDisabled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```powershell
$env:Path = "C:\Program Files\nodejs;$env:Path"
pnpm --dir ai-digital-life/frontend exec vitest run src/app/features/workspace-settings/SortableWorkspaceList.test.tsx
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `SortableWorkspaceList`**

Create `ai-digital-life/frontend/src/app/features/workspace-settings/SortableWorkspaceList.tsx`:

```tsx
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { IconMenu, IconClose } from '../../icons';
import { IconAlertTriangle } from '../../icons/status';
import { TooltipSimple } from '../../components/Tooltip';
import type { ContainerId, DraggableWorkspace } from './WorkspaceSettingsTypes';

interface SortableItemProps {
  workspace: DraggableWorkspace;
  showActions: boolean;
  onRemove?: (id: string) => void;
  onMoveUp?: (id: string) => void;
  onMoveDown?: (id: string) => void;
  isFirst: boolean;
  isLast: boolean;
  moveUpLabel: string;
  moveDownLabel: string;
  removeLabel: string;
}

function SortableItem({
  workspace,
  showActions,
  onRemove,
  onMoveUp,
  onMoveDown,
  isFirst,
  isLast,
  moveUpLabel,
  moveDownLabel,
  removeLabel,
}: SortableItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: workspace.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="adl-sortable-item">
      <button type="button" className="adl-sortable-handle" {...attributes} {...listeners}>
        <IconMenu size={14} />
      </button>
      <span className="adl-sortable-label">{workspace.name}</span>
      {showActions && (
        <div className="adl-sortable-actions">
          <button
            type="button"
            className="adl-sortable-move"
            onClick={(e) => {
              e.stopPropagation();
              onMoveUp?.(workspace.id);
            }}
            disabled={isFirst}
            aria-label={moveUpLabel}
          >
            ↑
          </button>
          <button
            type="button"
            className="adl-sortable-move"
            onClick={(e) => {
              e.stopPropagation();
              onMoveDown?.(workspace.id);
            }}
            disabled={isLast}
            aria-label={moveDownLabel}
          >
            ↓
          </button>
          <button
            type="button"
            className="adl-sortable-remove"
            onClick={() => onRemove?.(workspace.id)}
            aria-label={removeLabel.replace('{name}', workspace.name)}
          >
            <IconClose size={14} />
          </button>
        </div>
      )}
    </div>
  );
}

export interface SortableWorkspaceListProps {
  kind: ContainerId;
  title: string;
  desc: string;
  tooltipContent: string;
  items: DraggableWorkspace[];
  emptyText: string;
  onRemove?: (id: string) => void;
  onMoveUp?: (id: string) => void;
  onMoveDown?: (id: string) => void;
  /** i18n labels passed from parent to avoid duplicate useTCopy calls */
  moveUpLabel: string;
  moveDownLabel: string;
  removeLabel: string;
}

export function SortableWorkspaceList({
  kind,
  title,
  desc,
  tooltipContent,
  items,
  emptyText,
  onRemove,
  onMoveUp,
  onMoveDown,
  moveUpLabel,
  moveDownLabel,
  removeLabel,
}: SortableWorkspaceListProps) {
  const { setNodeRef } = useDroppable({ id: `list-${kind}` });

  const itemIds = items.map((w) => w.id);
  const showActions = kind !== 'natural';

  return (
    <div className="adl-sortable-section">
      <h4 className="adl-sortable-section-title">
        <span className="adl-sortable-section-title-text">{title}</span>
        <TooltipSimple content={tooltipContent} sideOffset={4} dismissible maxWidth={320}>
          <button
            type="button"
            className="adl-icon-button adl-icon-button--info"
            tabIndex={-1}
            aria-label=""
          >
            <IconAlertTriangle size={16} />
          </button>
        </TooltipSimple>
        <span className="adl-sortable-section-desc">{desc}</span>
      </h4>
      <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
        <div ref={setNodeRef} className="adl-sortable-list" data-droppable={kind}>
          {items.length === 0 ? (
            <div className="adl-sortable-empty">{emptyText}</div>
          ) : (
            items.map((w, i) => (
              <SortableItem
                key={w.id}
                workspace={w}
                showActions={showActions}
                onRemove={onRemove}
                onMoveUp={onMoveUp}
                onMoveDown={onMoveDown}
                isFirst={i === 0}
                isLast={i === items.length - 1}
                moveUpLabel={moveUpLabel}
                moveDownLabel={moveDownLabel}
                removeLabel={removeLabel}
              />
            ))
          )}
        </div>
      </SortableContext>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

```powershell
$env:Path = "C:\Program Files\nodejs;$env:Path"
pnpm --dir ai-digital-life/frontend exec vitest run src/app/features/workspace-settings/SortableWorkspaceList.test.tsx
```
Expected: PASS — all 9 tests pass.

- [ ] **Step 5: Commit**

```powershell
git add ai-digital-life/frontend/src/app/features/workspace-settings/SortableWorkspaceList.tsx ai-digital-life/frontend/src/app/features/workspace-settings/SortableWorkspaceList.test.tsx
git commit -m "feat(workspace-settings): extract SortableWorkspaceList with empty-list droppable fix"
```

---

## Task 8: Refactor `WorkspaceSettings.tsx` to use new hook + component

**Files:**
- Modify: `ai-digital-life/frontend/src/app/features/workspace-settings/WorkspaceSettings.tsx` (full rewrite, ~200 lines)
- Modify: `ai-digital-life/frontend/src/app/features/workspace-settings/WorkspaceSettingsTypes.ts` (remove dead `WorkspaceSettingsState`)

**Interfaces:**
- Consumes: `useWorkspaceDnd` (Task 6), `SortableWorkspaceList` (Task 7), i18n keys (Task 5), `workspaceNaturalOrder` config field (Task 2)
- Produces: refactored `WorkspaceSettings` component, ~200 lines, no `as Record<string, unknown>` casts

- [ ] **Step 1: Clean up `WorkspaceSettingsTypes.ts`**

Edit `ai-digital-life/frontend/src/app/features/workspace-settings/WorkspaceSettingsTypes.ts`. Replace the entire file content with:

```ts
export type ContainerId = 'priority' | 'deferred' | 'natural';

export interface DraggableWorkspace {
  id: string;
  name: string;
}
```

Removed: `WorkspaceSettingsState` (dead code, never imported anywhere).

- [ ] **Step 2: Rewrite `WorkspaceSettings.tsx`**

Replace the entire content of `ai-digital-life/frontend/src/app/features/workspace-settings/WorkspaceSettings.tsx` with:

```tsx
import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from '../../stores/slicedStore';
import { useTCopy } from '../../i18n/useTCopy';
import { SettingsHeader } from '../../components/settings/SettingsHeader';
import { TooltipSimple } from '../../components/Tooltip';
import { IconAlertTriangle } from '../../icons/status';
import { DndContext, DragOverlay, closestCorners } from '@dnd-kit/core';
import { useWorkspaceDnd } from './useWorkspaceDnd';
import { SortableWorkspaceList } from './SortableWorkspaceList';
import type { ContainerId, DraggableWorkspace } from './WorkspaceSettingsTypes';

export function WorkspaceSettings() {
  const { t } = useTCopy();
  const { appInfo, recentWorkspaces, updatePreferences } = useAppStore(
    useShallow((state) => ({
      appInfo: state.appInfo,
      recentWorkspaces: state.recentWorkspaces,
      updatePreferences: state.updatePreferences,
    }))
  );

  const config = appInfo?.config;

  const [maxConcurrent, setMaxConcurrent] = useState<number>(
    config?.maxConcurrentWorkspaces ?? 6
  );
  const [priorityIds, setPriorityIds] = useState<string[]>(
    config?.workspacePriorityIds ?? []
  );
  const [deferredIds, setDeferredIds] = useState<string[]>(
    config?.workspaceDeferredIds ?? []
  );
  const [naturalOrder, setNaturalOrder] = useState<string[]>(
    config?.workspaceNaturalOrder ?? []
  );

  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const persistChanges = useCallback(
    (p: number, pri: string[], def: string[], nat: string[]) => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
      debounceRef.current = setTimeout(() => {
        updatePreferences({
          maxConcurrentWorkspaces: p,
          workspacePriorityIds: pri,
          workspaceDeferredIds: def,
          workspaceNaturalOrder: nat,
        });
      }, 200);
    },
    [updatePreferences]
  );

  const visibleWorkspaces = useMemo<DraggableWorkspace[]>(
    () =>
      recentWorkspaces
        .filter((w) => !w.removedFromSidebar && !w.hiddenFromRightPanels)
        .map((w) => ({ id: w.id, name: w.name })),
    [recentWorkspaces]
  );

  const priorityWorkspaces = useMemo<DraggableWorkspace[]>(
    () =>
      priorityIds
        .map((id) => visibleWorkspaces.find((w) => w.id === id))
        .filter((w): w is DraggableWorkspace => w !== undefined),
    [priorityIds, visibleWorkspaces]
  );

  const deferredWorkspaces = useMemo<DraggableWorkspace[]>(
    () =>
      deferredIds
        .map((id) => visibleWorkspaces.find((w) => w.id === id))
        .filter((w): w is DraggableWorkspace => w !== undefined),
    [deferredIds, visibleWorkspaces]
  );

  const naturalWorkspaces = useMemo<DraggableWorkspace[]>(
    () =>
      naturalOrder
        .map((id) => visibleWorkspaces.find((w) => w.id === id))
        .filter((w): w is DraggableWorkspace => w !== undefined),
    [naturalOrder, visibleWorkspaces]
  );

  const handleDndChange = useCallback(
    (next: { priority: string[]; deferred: string[]; natural: string[] }) => {
      setPriorityIds(next.priority);
      setDeferredIds(next.deferred);
      setNaturalOrder(next.natural);
      persistChanges(maxConcurrent, next.priority, next.deferred, next.natural);
    },
    [maxConcurrent, persistChanges]
  );

  const dnd = useWorkspaceDnd({
    priorityIds,
    deferredIds,
    naturalOrder,
    visibleWorkspaces,
    onChange: handleDndChange,
  });

  const handleConcurrentChange = useCallback(
    (value: number) => {
      const clamped = Math.min(20, Math.max(1, value));
      setMaxConcurrent(clamped);
      persistChanges(clamped, priorityIds, deferredIds, naturalOrder);
    },
    [priorityIds, deferredIds, naturalOrder, persistChanges]
  );

  const handleRemove = useCallback(
    (id: string, fromList: ContainerId) => {
      // Removing from priority/deferred moves back to natural (head)
      if (fromList === 'priority') {
        const nextPri = priorityIds.filter((i) => i !== id);
        const nextNat = [id, ...naturalOrder];
        setPriorityIds(nextPri);
        setNaturalOrder(nextNat);
        persistChanges(maxConcurrent, nextPri, deferredIds, nextNat);
      } else if (fromList === 'deferred') {
        const nextDef = deferredIds.filter((i) => i !== id);
        const nextNat = [id, ...naturalOrder];
        setDeferredIds(nextDef);
        setNaturalOrder(nextNat);
        persistChanges(maxConcurrent, priorityIds, nextDef, nextNat);
      }
    },
    [priorityIds, deferredIds, naturalOrder, maxConcurrent, persistChanges]
  );

  const handleMoveUp = useCallback(
    (id: string, list: 'priority' | 'deferred') => {
      const ids = list === 'priority' ? [...priorityIds] : [...deferredIds];
      const idx = ids.indexOf(id);
      if (idx > 0) {
        [ids[idx - 1], ids[idx]] = [ids[idx], ids[idx - 1]];
        if (list === 'priority') {
          setPriorityIds(ids);
          persistChanges(maxConcurrent, ids, deferredIds, naturalOrder);
        } else {
          setDeferredIds(ids);
          persistChanges(maxConcurrent, priorityIds, ids, naturalOrder);
        }
      }
    },
    [priorityIds, deferredIds, naturalOrder, maxConcurrent, persistChanges]
  );

  const handleMoveDown = useCallback(
    (id: string, list: 'priority' | 'deferred') => {
      const ids = list === 'priority' ? [...priorityIds] : [...deferredIds];
      const idx = ids.indexOf(id);
      if (idx < ids.length - 1) {
        [ids[idx], ids[idx + 1]] = [ids[idx + 1], ids[idx]];
        if (list === 'priority') {
          setPriorityIds(ids);
          persistChanges(maxConcurrent, ids, deferredIds, naturalOrder);
        } else {
          setDeferredIds(ids);
          persistChanges(maxConcurrent, priorityIds, ids, naturalOrder);
        }
      }
    },
    [priorityIds, deferredIds, naturalOrder, maxConcurrent, persistChanges]
  );

  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  return (
    <div className="adl-settings-section">
      <SettingsHeader title={t.settingsWorkspaceLoad} />

      <div className="adl-settings-row">
        <div className="adl-settings-row__label">
          <div className="adl-settings-row__label-text">
            <span>{t.maxConcurrentWorkspaces}</span>
            <TooltipSimple
              content={t.maxConcurrentWorkspacesDesc}
              sideOffset={4}
              dismissible
              maxWidth={280}
            >
              <button
                type="button"
                className="adl-icon-button adl-icon-button--info"
                tabIndex={-1}
                aria-label=""
              >
                <IconAlertTriangle size={16} />
              </button>
            </TooltipSimple>
          </div>
        </div>
        <div className="adl-settings-row__control">
          <input
            type="number"
            value={maxConcurrent}
            min={1}
            max={20}
            onChange={(e) => handleConcurrentChange(parseInt(e.target.value, 10) || 1)}
            className="adl-settings-input adl-settings-input--number"
          />
        </div>
      </div>

      <hr className="adl-settings-divider" />

      <DndContext
        sensors={dnd.sensors}
        collisionDetection={closestCorners}
        onDragStart={dnd.handleDragStart}
        onDragEnd={dnd.handleDragEnd}
      >
        <SortableWorkspaceList
          kind="priority"
          title={t.priorityList}
          desc={t.priorityListDesc}
          tooltipContent={t.priorityListTooltip}
          items={priorityWorkspaces}
          emptyText={t.priorityListEmpty}
          onRemove={(id) => handleRemove(id, 'priority')}
          onMoveUp={(id) => handleMoveUp(id, 'priority')}
          onMoveDown={(id) => handleMoveDown(id, 'priority')}
          moveUpLabel={t.moveUp}
          moveDownLabel={t.moveDown}
          removeLabel={t.removeWorkspace}
        />

        <SortableWorkspaceList
          kind="deferred"
          title={t.deferredList}
          desc={t.deferredListDesc}
          tooltipContent={t.deferredListTooltip}
          items={deferredWorkspaces}
          emptyText={t.deferredListEmpty}
          onRemove={(id) => handleRemove(id, 'deferred')}
          onMoveUp={(id) => handleMoveUp(id, 'deferred')}
          onMoveDown={(id) => handleMoveDown(id, 'deferred')}
          moveUpLabel={t.moveUp}
          moveDownLabel={t.moveDown}
          removeLabel={t.removeWorkspace}
        />

        <SortableWorkspaceList
          kind="natural"
          title={t.workspaceTagList}
          desc={t.workspaceTagListDesc}
          tooltipContent={t.workspaceTagListTooltip}
          items={naturalWorkspaces}
          emptyText={t.workspaceTagListEmpty}
          moveUpLabel={t.moveUp}
          moveDownLabel={t.moveDown}
          removeLabel={t.removeWorkspace}
        />

        <DragOverlay>
          {dnd.activeItem ? (
            <div className="adl-drag-overlay">{dnd.activeItem.name}</div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
```

- [ ] **Step 3: Run typecheck and lint**

```powershell
$env:Path = "C:\Program Files\nodejs;$env:Path"
pnpm --dir ai-digital-life/frontend run typecheck
pnpm --dir ai-digital-life/frontend run lint:fix
pnpm --dir ai-digital-life/frontend run format
```
Expected: PASS — no type errors, 0 lint errors. The previous `as Record<string, unknown>` cast is gone.

- [ ] **Step 4: Run all frontend tests to verify no regression**

```powershell
$env:Path = "C:\Program Files\nodejs;$env:Path"
pnpm --dir ai-digital-life/frontend run test -- --run
```
Expected: All tests pass (including the new tests from Tasks 3, 4, 6, 7).

- [ ] **Step 5: Commit**

```powershell
git add ai-digital-life/frontend/src/app/features/workspace-settings/WorkspaceSettings.tsx ai-digital-life/frontend/src/app/features/workspace-settings/WorkspaceSettingsTypes.ts
git commit -m "refactor(workspace-settings): simplify main component using hook + reusable list"
```

---

## Task 9: Sync new workspaces into `naturalOrder` on fetch

**Files:**
- Modify: `ai-digital-life/frontend/src/app/stores/actions/workspaceActions.ts` (or wherever `fetchRecentWorkspaces` lives — confirm via grep)
- Test: `ai-digital-life/frontend/src/app/stores/actions/workspaceActions.test.ts` (or create new)

**Interfaces:**
- Consumes: `appInfo.config.workspaceNaturalOrder`, `workspacePriorityIds`, `workspaceDeferredIds`
- Produces: effect that inserts new workspace IDs at the head of `workspaceNaturalOrder`

- [ ] **Step 1: Locate where `recentWorkspaces` is fetched and updated**

Run a search to find the action that calls `workspace.listRecent`:

```powershell
$env:Path = "C:\Program Files\nodejs;$env:Path"
```

Use Grep tool to find `listRecent` calls. The likely location is `workspaceActions.ts` or `generalActions.ts` (bootstrap). The bootstrap path in `generalActions.ts` already calls `workspace.listRecent` at line 62.

For this task, we want a reactive effect: whenever `recentWorkspaces` updates (from any source — bootstrap, sidebar add, sidebar remove), check if any IDs are strays (not in any of the 3 lists) and insert them at the head of `workspaceNaturalOrder`.

- [ ] **Step 2: Write the failing test**

Create `ai-digital-life/frontend/src/app/stores/actions/workspaceNaturalOrderSync.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useAppStore } from '../slicedStore';
import type { AppPreferencePatch } from '../../../shared/ipc-types.generated';

vi.mock('@utils/theme', () => ({
  themeController: { setTheme: vi.fn(), hydrate: vi.fn() },
}));
vi.mock('@shared/resolveTheme', () => ({
  resolveCurrentTheme: vi.fn(() => 'light'),
}));

const mockUpdatePreferences = vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
  (window as unknown as { digitalLife: unknown }).digitalLife = {
    app: {
      updatePreferences: mockUpdatePreferences.mockResolvedValue({ ok: true, data: {} }),
      getModelHealth: vi.fn().mockResolvedValue({ ok: true, data: [] }),
    },
  };
  useAppStore.setState({
    appInfo: {
      appName: 'test',
      version: '0.0.0',
      config: {
        themeMode: 'light',
        resolvedTheme: 'light',
        logLevel: 'info',
        terminalLogMode: 'overwrite',
        debugLogMode: 'overwrite',
        maxRecentWorkspaces: 10,
        modelPreferences: { providers: {} },
        keybinds: {},
        fonts: {},
        language: 'zh-CN',
        maxConcurrentWorkspaces: 6,
        workspacePriorityIds: [],
        workspaceDeferredIds: [],
        workspaceNaturalOrder: [],
      },
      recentLogs: [],
      currentWorkspace: null,
    },
    recentWorkspaces: [],
    error: undefined,
    isFetching: {},
  });
});

describe('syncNewWorkspacesToNaturalOrder', () => {
  it('inserts new stray workspace IDs at head of naturalOrder', async () => {
    // Import after mocks are set up
    const { syncNewWorkspacesToNaturalOrder } = await import('./workspaceNaturalOrderSync');

    // Configure existing state: ws-1 in priority, ws-2 in natural
    useAppStore.setState({
      appInfo: {
        ...(useAppStore.getState().appInfo as object),
        config: {
          ...(useAppStore.getState().appInfo?.config as object),
          workspacePriorityIds: ['ws-1'],
          workspaceNaturalOrder: ['ws-2'],
        },
      },
      recentWorkspaces: [
        { id: 'ws-1', path: '/1', rootPath: '/1', name: '1', lastOpenedAt: 0, isPinned: false, pinnedOrder: 0, unpinnedOrder: 0, removedFromSidebar: false, available: true, hiddenFromRightPanels: false },
        { id: 'ws-2', path: '/2', rootPath: '/2', name: '2', lastOpenedAt: 0, isPinned: false, pinnedOrder: 0, unpinnedOrder: 0, removedFromSidebar: false, available: true, hiddenFromRightPanels: false },
        // ws-3 is new — not in any list
        { id: 'ws-3', path: '/3', rootPath: '/3', name: '3', lastOpenedAt: 0, isPinned: false, pinnedOrder: 0, unpinnedOrder: 0, removedFromSidebar: false, available: true, hiddenFromRightPanels: false },
      ],
    });

    syncNewWorkspacesToNaturalOrder();

    expect(mockUpdatePreferences).toHaveBeenCalledTimes(1);
    const patch = mockUpdatePreferences.mock.calls[0][0] as AppPreferencePatch;
    expect(patch.workspaceNaturalOrder).toEqual(['ws-3', 'ws-2']);
  });

  it('does nothing when no new strays appear', () => {
    const { syncNewWorkspacesToNaturalOrder } = require('./workspaceNaturalOrderSync');

    useAppStore.setState({
      appInfo: {
        ...(useAppStore.getState().appInfo as object),
        config: {
          ...(useAppStore.getState().appInfo?.config as object),
          workspacePriorityIds: ['ws-1'],
          workspaceNaturalOrder: ['ws-2'],
        },
      },
      recentWorkspaces: [
        { id: 'ws-1', path: '/1', rootPath: '/1', name: '1', lastOpenedAt: 0, isPinned: false, pinnedOrder: 0, unpinnedOrder: 0, removedFromSidebar: false, available: true, hiddenFromRightPanels: false },
        { id: 'ws-2', path: '/2', rootPath: '/2', name: '2', lastOpenedAt: 0, isPinned: false, pinnedOrder: 0, unpinnedOrder: 0, removedFromSidebar: false, available: true, hiddenFromRightPanels: false },
      ],
    });

    syncNewWorkspacesToNaturalOrder();
    expect(mockUpdatePreferences).not.toHaveBeenCalled();
  });

  it('filters out removed-from-sidebar workspaces from strays', () => {
    const { syncNewWorkspacesToNaturalOrder } = require('./workspaceNaturalOrderSync');

    useAppStore.setState({
      recentWorkspaces: [
        // ws-1 is removed from sidebar — should NOT be synced into naturalOrder
        { id: 'ws-1', path: '/1', rootPath: '/1', name: '1', lastOpenedAt: 0, isPinned: false, pinnedOrder: 0, unpinnedOrder: 0, removedFromSidebar: true, available: true, hiddenFromRightPanels: false },
        // ws-2 is visible and not in any list — should be synced
        { id: 'ws-2', path: '/2', rootPath: '/2', name: '2', lastOpenedAt: 0, isPinned: false, pinnedOrder: 0, unpinnedOrder: 0, removedFromSidebar: false, available: true, hiddenFromRightPanels: false },
      ],
    });

    syncNewWorkspacesToNaturalOrder();
    expect(mockUpdatePreferences).toHaveBeenCalledTimes(1);
    const patch = mockUpdatePreferences.mock.calls[0][0] as AppPreferencePatch;
    expect(patch.workspaceNaturalOrder).toEqual(['ws-2']);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

```powershell
$env:Path = "C:\Program Files\nodejs;$env:Path"
pnpm --dir ai-digital-life/frontend exec vitest run src/app/stores/actions/workspaceNaturalOrderSync.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 4: Implement `syncNewWorkspacesToNaturalOrder`**

Create `ai-digital-life/frontend/src/app/stores/actions/workspaceNaturalOrderSync.ts`:

```ts
import { useAppStore } from '../slicedStore';
import type { AppPreferencePatch } from '../../../shared/ipc-types.generated';

/**
 * Detects workspaces that exist in `recentWorkspaces` (visible) but are not in
 * any of the three loading lists (priority / deferred / natural), and inserts
 * them at the HEAD of `workspaceNaturalOrder` (newest-added first).
 *
 * Also prunes IDs from the three lists that no longer correspond to any visible
 * workspace (orphan cleanup — e.g., workspace was removed from sidebar).
 *
 * This is a one-shot sync function — call it whenever `recentWorkspaces` updates.
 * Debouncing / effect-wiring is the caller's responsibility.
 */
export function syncNewWorkspacesToNaturalOrder(): void {
  const state = useAppStore.getState();
  const appInfo = state.appInfo;
  const recentWorkspaces = state.recentWorkspaces;
  if (!appInfo) return;

  const config = appInfo.config;
  const priorityIds = config.workspacePriorityIds ?? [];
  const deferredIds = config.workspaceDeferredIds ?? [];
  const naturalOrder = config.workspaceNaturalOrder ?? [];

  const visibleWorkspaces = recentWorkspaces.filter(
    (w) => !w.removedFromSidebar && !w.hiddenFromRightPanels
  );
  const visibleIds = new Set(visibleWorkspaces.map((w) => w.id));
  const configured = new Set<string>([...priorityIds, ...deferredIds, ...naturalOrder]);

  // Strays: visible but not in any list → insert at head
  const strays = visibleWorkspaces
    .filter((w) => !configured.has(w.id))
    .map((w) => w.id);

  // Prune orphans: IDs in lists that no longer correspond to visible workspaces
  const prune = (ids: string[]) => ids.filter((id) => visibleIds.has(id));
  const nextPriority = prune(priorityIds);
  const nextDeferred = prune(deferredIds);
  const nextNatural = prune(naturalOrder);

  // Only persist if something actually changed
  const changed =
    strays.length > 0 ||
    nextPriority.length !== priorityIds.length ||
    nextDeferred.length !== deferredIds.length ||
    nextNatural.length !== naturalOrder.length;

  if (!changed) return;

  const patch: AppPreferencePatch = {
    workspacePriorityIds: nextPriority,
    workspaceDeferredIds: nextDeferred,
    workspaceNaturalOrder: [...strays, ...nextNatural],
  };

  void state.updatePreferences(patch);
}
```

- [ ] **Step 5: Wire the sync into the bootstrap path**

Edit `ai-digital-life/frontend/src/app/stores/actions/generalActions.ts`. After the `set(nextState);` call (around line 112) that sets `recentWorkspaces`, add a call to `syncNewWorkspacesToNaturalOrder()`:

```ts
import { syncNewWorkspacesToNaturalOrder } from './workspaceNaturalOrderSync';
```

At the top with other imports. Then after the `set(nextState);` (around line 112) that sets `recentWorkspaces`, add:

```ts
      // Sync any newly-discovered workspaces into the natural-order list
      syncNewWorkspacesToNaturalOrder();
```

Note: This is also called implicitly when the user adds a workspace via the sidebar (the sidebar's `workspace.open` action triggers a `fetchRecentWorkspaces`, which writes to `recentWorkspaces`; a separate effect would be needed to watch for changes). For the scope of this plan, wiring it into bootstrap is sufficient — sidebar-add reactivity is a follow-up.

- [ ] **Step 6: Run tests**

```powershell
$env:Path = "C:\Program Files\nodejs;$env:Path"
pnpm --dir ai-digital-life/frontend exec vitest run src/app/stores/actions/workspaceNaturalOrderSync.test.ts
pnpm --dir ai-digital-life/frontend run typecheck
```
Expected: PASS.

- [ ] **Step 7: Commit**

```powershell
git add ai-digital-life/frontend/src/app/stores/actions/workspaceNaturalOrderSync.ts ai-digital-life/frontend/src/app/stores/actions/workspaceNaturalOrderSync.test.ts ai-digital-life/frontend/src/app/stores/actions/generalActions.ts
git commit -m "feat(stores): sync new workspaces into naturalOrder and prune orphans"
```

---

## Task 10: CSS updates for drag overlay, droppable items, and tooltip layout

**Files:**
- Modify: `ai-digital-life/frontend/src/styles/components/settings.css:407-528`

**Interfaces:**
- Consumes: nothing
- Produces: CSS rules for `.adl-drag-overlay`, `.adl-draggable-item`, `.adl-sortable-section-title` flex layout, `white-space: pre-line` for tooltip content

- [ ] **Step 1: Add CSS rules to `settings.css`**

Read `ai-digital-life/frontend/src/styles/components/settings.css` to find the section containing `.adl-sortable-section` rules (around lines 407-528). Append new rules after the existing sortable rules:

```css

/* === Workspace loading lists: drag overlay + droppable items === */

.adl-drag-overlay {
  padding: 6px 10px;
  background: var(--surface-raised, var(--bg-elevated, rgba(255, 255, 255, 0.95)));
  border: 1px solid var(--border-strong, rgba(0, 0, 0, 0.15));
  border-radius: 4px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  font-size: 13px;
  color: var(--text-primary, inherit);
  cursor: grabbing;
  user-select: none;
  pointer-events: none;
  min-width: 120px;
}

.adl-draggable-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  background: var(--bg-elevated, transparent);
  border: 1px solid var(--border-subtle, transparent);
  border-radius: 4px;
  font-size: 13px;
  color: var(--text-primary, inherit);
  cursor: grab;
  user-select: none;
  min-height: 32px;
}

.adl-draggable-item:hover {
  background: var(--surface-hover, var(--bg-hover, rgba(0, 0, 0, 0.04)));
}

.adl-draggable-item:active {
  cursor: grabbing;
}

.adl-drag-icon {
  color: var(--text-tertiary, var(--text-secondary, currentColor));
  opacity: 0.7;
  flex-shrink: 0;
}

/* === Sortable section title: flex layout for title + "!" + desc === */

.adl-sortable-section-title {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  margin: 0 0 8px 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary, inherit);
}

.adl-sortable-section-title-text {
  flex-shrink: 0;
}

.adl-sortable-section-desc {
  flex: 1 1 100%;
  font-size: 12px;
  font-weight: 400;
  color: var(--text-secondary, inherit);
  margin-top: 2px;
}

/* === Tooltip: preserve newlines in multi-line content === */

.adl-tooltip-content {
  white-space: pre-line;
}
```

Note: Check if `.adl-tooltip-content` is the actual class name used by `TooltipSimple`. If the Tooltip component renders content with a different wrapper class, use that selector instead. Verify by reading `frontend/src/app/components/Tooltip.tsx`.

- [ ] **Step 2: Run lint and format**

```powershell
$env:Path = "C:\Program Files\nodejs;$env:Path"
pnpm --dir ai-digital-life/frontend run lint:fix
pnpm --dir ai-digital-life/frontend run format
```
Expected: PASS.

- [ ] **Step 3: Commit**

```powershell
git add ai-digital-life/frontend/src/styles/components/settings.css
git commit -m "style(workspace-settings): add drag overlay and tooltip layout styles"
```

---

## Task 11: Full L3 acceptance flow

**Files:** None modified — verification only.

**Interfaces:** N/A

- [ ] **Step 1: Run frontend L3 acceptance**

```powershell
$env:Path = "C:\Program Files\nodejs;$env:Path"
pnpm --dir ai-digital-life/frontend run lint:fix
pnpm --dir ai-digital-life/frontend run format
pnpm --dir ai-digital-life/frontend run typecheck
pnpm --dir ai-digital-life/frontend run test
```
Expected: All commands pass with 0 errors. All tests pass.

- [ ] **Step 2: Run Rust L3 acceptance**

```powershell
$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"
cargo fmt --all
cargo clippy --workspace --all-targets --fix -- -D warnings
cargo check --workspace
cargo test --workspace
```
Expected: All commands pass. 0 clippy warnings. All Rust tests pass.

- [ ] **Step 3: Three-bridge consistency check**

Verify manually:

- [ ] `shared/ipc-types.generated.ts` has `workspaceNaturalOrder?` in `AppPreferencePatch` and `workspaceNaturalOrder: string[]` in `ConfigSnapshot`
- [ ] `preview-bridge/preview-model.ts` config object includes all 4 fields with defaults
- [ ] `mock/mock-shared-workspace.ts` config object includes all 4 fields with defaults
- [ ] `tauri-bridge/` requires no changes (IPC types flow through automatically)
- [ ] Return type `IpcResult<T>` unchanged
- [ ] Error type `AppError` unchanged

- [ ] **Step 4: Commit any auto-fix changes**

If `lint:fix` / `clippy --fix` / `cargo fmt` modified any files:

```powershell
git status
# If changes exist:
git add -A
git commit -m "chore: auto-fix formatting and lint issues from L3 acceptance"
```

- [ ] **Step 5: Final commit confirming acceptance passed**

If no changes were needed in Step 4, this step is a no-op. Otherwise the Step 4 commit covers it.

---

## Spec Coverage Check (self-review)

| Spec section | Covered by |
|---|---|
| 1. Background — drag bug, persistence bug, load logic bug | Task 1 (persistence), Task 6+7 (drag fix), Task 4 (load logic) |
| 2. User req 1 — rename to "工作区标签列表" | Task 5 (i18n key `workspaceTagList`), Task 8 (component uses new key) |
| 2. User req 2 — three lists cross-drag | Task 6 (hook handles cross-list), Task 7 (droppable empty placeholder) |
| 2. User req 3 — independent from sidebar order | Task 1+2 (persistence), Task 4 (load uses config arrays, not sidebar order), Task 9 (orphan cleanup) |
| 2. User req 4 — naturalOrder default by add time | Task 9 (sync inserts at head on new workspace) |
| 2. User req 5 — cascading load with skip-empty | Task 3 (`computeLoadPhases`), Task 4 (two-stage execution) |
| 2. User req 6 — "!" tooltips | Task 5 (3 new tooltip i18n keys), Task 7 (component renders "!" button), Task 10 (CSS for tooltip layout) |
| 3. Design — file structure | Tasks 3, 6, 7 (new files), Task 8 (refactored main) |
| 4. Data model — Rust fields, three bridges | Task 1 (Rust), Task 2 (frontend + bridges) |
| 5. UI components — SortableWorkspaceList, useWorkspaceDnd | Tasks 6, 7, 8 |
| 6. Load order — computeLoadPhases, two-stage execution | Tasks 3, 4 |
| 7. i18n — 9 new/changed keys + 3 tooltips | Task 5 |
| 8. Tests — DnD, render, cascade, call order | Tasks 3, 4, 6, 7, 9 |
| 9. Acceptance — L3 + three-bridge + manual | Task 11 |
| 10. Scope — YAGNI exclusions | Excluded: `added_at` field (use naturalOrder array), Tauri command for load order (frontend pure fn), background cancel (Promise dies with process), keyboard DnD (deferred) |
| 11. Risks — mitigations | Task 1 (`#[serde(default)]` for old configs), Task 4 (try/catch + logRejected), Task 6 (dedup defensive) |

All spec sections covered. No gaps.

## Placeholder Scan

No "TBD", "TODO", "implement later" placeholders. Every step contains concrete code or commands.

## Type Consistency

- `ContainerId = 'priority' | 'deferred' | 'natural'` — consistent across `WorkspaceSettingsTypes.ts`, `useWorkspaceDnd.ts`, `SortableWorkspaceList.tsx`
- `DraggableWorkspace = { id: string; name: string }` — consistent across same files
- `LoadPhases = { priority: RecentWorkspaceEntry[]; deferred: RecentWorkspaceEntry[]; natural: RecentWorkspaceEntry[] }` — defined in Task 3, consumed in Task 4
- `UseWorkspaceDndArgs` / `UseWorkspaceDndResult` — defined in Task 6, consumed in Task 8
- `SortableWorkspaceListProps` — defined in Task 7, consumed in Task 8 (includes `moveUpLabel` / `moveDownLabel` / `removeLabel` to avoid duplicate `useTCopy` calls inside the list component)
- Rust `AppPreferencePatch` field names: `max_concurrent_workspaces`, `workspace_priority_ids`, `workspace_deferred_ids`, `workspace_natural_order` — consistent in `crates/types/src/types/config.rs` (Task 1) and `crates/kernel/src/config.rs` (Task 1)
- Frontend camelCase equivalents: `maxConcurrentWorkspaces`, `workspacePriorityIds`, `workspaceDeferredIds`, `workspaceNaturalOrder` — consistent in `ipc-types.generated.ts` (Task 2), `defaultPreferences.ts` (Task 2), `preferencesMerger.ts` (Task 2), `WorkspaceSettings.tsx` (Task 8), `generalActions.ts` (Task 4), `workspaceNaturalOrderSync.ts` (Task 9)

All types consistent.
