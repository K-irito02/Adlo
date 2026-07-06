# Phase 2 审计问题修复 — 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复 Phase 2 审计中发现的 2 个严重权限问题 + 约 15 个代码质量问题，确保所有 Phase 2-E 功能实际可用且符合代码规范。

**Architecture:** 13 个任务覆盖 Rust 权限白名单修复、Plugin 系统加载补全、LSP 状态清理、前端 i18n 硬编码消除、Store 架构对齐。按严重性排序，权限修复（P0）优先，UI 规范修复随后。

**Tech Stack:** Rust (Tauri 2.x) + TypeScript (React 19 + Zustand) + i18n (zh-CN/en-US)

## Global Constraints

- 双端一致性：所有修改须确保 Tauri 桌面 + Browser Mock 两端行为一致
- i18n 全覆盖：禁止任何 UI 展示文本硬编码，必须使用 `useTCopy()` + `t.xxx` 模式
- 设计系统：禁止 emoji 图标，必须使用 SVG `currentColor` 图标
- Store 架构：组件状态变更通过 Zustand store action，不应直接调用 `window.digitalLife.*`
- 权限白名单：所有 Tauri Command 必须在 `permissions/digital-life.toml` 注册
- Clippy zero-warning / ESLint zero-warning / Prettier / rustfmt 全部 pass
- 未发布阶段禁止兼容性代码

---

### Task 1: Fix Tauri Permission Whitelist — Command Name Mismatches

**Files:**
- Modify: `ai-digital-life/src-tauri/permissions/digital-life.toml`

**Issue:** 9 commands in `main.rs` use different names than `permissions/digital-life.toml`, causing Tauri runtime permission denials.

- [x] **Step 1: Fix 9 command name mismatches in permissions.toml**

The correct names (from `main.rs`) are:
- `list_custom_commands` (not `list_commands_config`)
- `add_custom_command` (not `add_command_config`)
- `delete_custom_command` (not `remove_command_config`)
- `update_custom_command` (not `update_command_config`)
- `list_permission_rules` (not `list_permission_rulesets`)
- `add_permission_rule` (not `add_permission_ruleset`)
- `delete_permission_rule` (not `remove_permission_ruleset`)
- `web_fetch` (not `fetch_web_tool`)
- `web_search` (not `search_web_tool`)

In `ai-digital-life/src-tauri/permissions/digital-life.toml`, replace lines 145-154:

```toml
  "list_commands_config",
  "add_command_config",
  "remove_command_config",
  "update_command_config",
  "evaluate_permission",
  "list_permission_rulesets",
  "add_permission_ruleset",
  "remove_permission_ruleset",
  "fetch_web_tool",
  "search_web_tool",
```

With:

```toml
  "list_custom_commands",
  "add_custom_command",
  "delete_custom_command",
  "update_custom_command",
  "render_command_template",
  "evaluate_permission",
  "list_permission_rules",
  "add_permission_rule",
  "delete_permission_rule",
  "set_permission_include_defaults",
  "web_fetch",
  "web_search",
```

- [ ] **Step 2: Add missing commands to permissions.toml**

Insert before line 155 (`"acp_get_status"`):

```toml
  "lsp_start_server",
  "lsp_stop_server",
  "list_session_forks",
  "update_custom_agent",
```

- [ ] **Step 3: Verify the file**

Run: `cargo check --manifest-path ai-digital-life/src-tauri/Cargo.toml`
Expected: Compilation succeeds.

- [ ] **Step 4: Commit**

```bash
git add ai-digital-life/src-tauri/permissions/digital-life.toml
git commit -m "fix(permissions): correct 9 command name mismatches + add 6 missing Phase 2-E commands"
```

---

### Task 2: Add Plugin Register/Unregister Commands

**Files:**
- Modify: `ai-digital-life/src-tauri/src/commands/plugin.rs`
- Modify: `ai-digital-life/src-tauri/src/main.rs`
- Modify: `ai-digital-life/src-tauri/permissions/digital-life.toml`

**Issue:** Plugin registry is forever empty — no `register_plugin` / `unregister_plugin` commands exist.

- [ ] **Step 1: Add `register_plugin` and `unregister_plugin` commands to plugin.rs**

Replace `ai-digital-life/src-tauri/src/commands/plugin.rs`:

```rust
use crate::commands::ipc;
use adl_agent_runtime::plugins::hooks::HookResult;
use adl_agent_runtime::plugins::registry::{PluginInfo, PluginRegistry};
use adl_agent_runtime::plugins::{HookType, Plugin, PluginHook};
use adl_errors::AppError;
use adl_kernel::IpcResult;
use async_trait::async_trait;
use std::sync::Arc;

#[allow(clippy::incompatible_msrv)]
pub(crate) static PLUGIN_REGISTRY: std::sync::LazyLock<Arc<PluginRegistry>> =
    std::sync::LazyLock::new(|| Arc::new(PluginRegistry::new()));

struct SimplePlugin {
    name: String,
    description: String,
    hooks: Vec<HookType>,
}

#[async_trait]
impl Plugin for SimplePlugin {
    fn name(&self) -> &str {
        &self.name
    }
    fn description(&self) -> &str {
        &self.description
    }
    fn hooks(&self) -> &[HookType] {
        &self.hooks
    }
    async fn on_hook(&self, _hook: &PluginHook) -> HookResult {
        HookResult::Pass
    }
}

#[tauri::command]
pub async fn list_plugins() -> Result<IpcResult<Vec<PluginInfo>>, AppError> {
    Ok(ipc(Ok(PLUGIN_REGISTRY.list_plugins().await)))
}

#[tauri::command]
pub async fn set_plugin_enabled(name: String, enabled: bool) -> Result<IpcResult<()>, AppError> {
    Ok(ipc({
        PLUGIN_REGISTRY.set_enabled(&name, enabled).await;
        Ok(())
    }))
}

#[tauri::command]
pub async fn register_plugin(
    name: String,
    description: String,
    hooks: Vec<String>,
) -> Result<IpcResult<()>, AppError> {
    Ok(ipc({
        let hook_types: Vec<HookType> = hooks
            .iter()
            .filter_map(|h| match h.as_str() {
                "ToolExecuteBefore" => Some(HookType::ToolExecuteBefore),
                "ToolExecuteAfter" => Some(HookType::ToolExecuteAfter),
                "ChatSystemTransform" => Some(HookType::ChatSystemTransform),
                "ChatMessageBefore" => Some(HookType::ChatMessageBefore),
                "ChatResponseAfter" => Some(HookType::ChatResponseAfter),
                "SessionCreateBefore" => Some(HookType::SessionCreateBefore),
                "SessionCreateAfter" => Some(HookType::SessionCreateAfter),
                _ => None,
            })
            .collect();
        let plugin = SimplePlugin {
            name: name.clone(),
            description,
            hooks: hook_types,
        };
        PLUGIN_REGISTRY.register(Arc::new(plugin)).await;
        Ok(())
    }))
}

#[tauri::command]
pub async fn unregister_plugin(name: String) -> Result<IpcResult<()>, AppError> {
    Ok(ipc({
        PLUGIN_REGISTRY.unregister(&name).await;
        Ok(())
    }))
}
```

- [ ] **Step 2: Register new commands in main.rs**

In `ai-digital-life/src-tauri/src/main.rs`, after line 238 (`commands::plugin::set_plugin_enabled`), add:

```rust
            commands::plugin::register_plugin,
            commands::plugin::unregister_plugin,
```

- [ ] **Step 3: Add new permissions**

In `ai-digital-life/src-tauri/permissions/digital-life.toml`, add after `"set_plugin_enabled"`:

```toml
  "register_plugin",
  "unregister_plugin",
```

- [ ] **Step 4: Add frontend IPC interface**

Modify `ai-digital-life/frontend/src/shared/ipc/plugin.ts` to add the two new methods:

```typescript
export interface PluginBridge {
  listPlugins: () => Promise<IpcResult<PluginInfo[]>>;
  setPluginEnabled: (name: string, enabled: boolean) => Promise<IpcResult<void>>;
  registerPlugin: (name: string, description: string, hooks: string[]) => Promise<IpcResult<void>>;
  unregisterPlugin: (name: string) => Promise<IpcResult<void>>;
}
```

- [ ] **Step 5: Add bridge implementations in tauri-bridge.ts**

Add to the plugin bridge block:

```typescript
    registerPlugin: (name, description, hooks) =>
      invoke('register_plugin', { name, description, hooks }),
    unregisterPlugin: (name) =>
      invoke('unregister_plugin', { name }),
```

- [ ] **Step 6: Add bridge implementations in mock-bridge.ts**

Add to the plugin bridge block:

```typescript
    registerPlugin: async () => ({ ok: true }),
    unregisterPlugin: async () => ({ ok: true }),
```

- [ ] **Step 7: Verify**

Run: `cargo clippy --workspace --all-targets`
Run: `cd frontend && npx eslint . && npx tsc --noEmit`
Expected: All pass.

- [ ] **Step 8: Commit**

```bash
git add ai-digital-life/src-tauri/src/commands/plugin.rs ai-digital-life/src-tauri/src/main.rs ai-digital-life/src-tauri/permissions/digital-life.toml
git add ai-digital-life/frontend/src/shared/ipc/plugin.ts ai-digital-life/frontend/src/tauri-bridge.ts ai-digital-life/frontend/src/mock-bridge.ts
git commit -m "feat(plugin): add register/unregister commands to enable plugin loading"
```

---

### Task 3: Fix LSP Stop — Clean Up Static Map

**Files:**
- Modify: `ai-digital-life/src-tauri/src/commands/lsp.rs`

**Issue:** `lsp_stop_server` does not remove the client from `LSP_CLIENTS` map. `lsp_start_server` replaces without shutting down old client.

- [ ] **Step 1: Fix stop_server_inner to remove from map**

Replace the `stop_server_inner` function (lines 40-47):

```rust
async fn stop_server_inner(workspace_id: String, server: String) -> Result<(), AppError> {
    let server_enum = parse_server(&server);
    let mut clients = LSP_CLIENTS.lock().await;
    if let Some(client) = clients.remove(&workspace_id) {
        client.stop_server(&server_enum).await?;
    }
    Ok(())
}
```

- [ ] **Step 2: Fix start_server_inner to shut down old client**

Replace the `start_server_inner` function (lines 27-38):

```rust
async fn start_server_inner(
    workspace_id: String,
    workspace_root: String,
    server: String,
) -> Result<(), AppError> {
    let server_enum = parse_server(&server);
    let mut clients = LSP_CLIENTS.lock().await;
    if let Some(old) = clients.remove(&workspace_id) {
        drop(clients);
        let _ = old.stop_server(&server_enum).await;
        clients = LSP_CLIENTS.lock().await;
    }
    let client = LspClient::new(PathBuf::from(&workspace_root));
    client.start_server(server_enum).await?;
    clients.insert(workspace_id, Arc::new(client));
    Ok(())
}
```

- [ ] **Step 3: Verify**

Run: `cargo clippy --workspace --all-targets`
Expected: All pass.

- [ ] **Step 4: Commit**

```bash
git add ai-digital-life/src-tauri/src/commands/lsp.rs
git commit -m "fix(lsp): clean up static map on stop and shut down old client on restart"
```

---

### Task 4: Fix SnapshotList i18n — 3 Hardcoded Strings

**Files:**
- Modify: `ai-digital-life/frontend/src/app/components/conversation/SnapshotList.tsx`
- Modify: `ai-digital-life/frontend/src/app/i18n/en-US/conversation.ts`
- Modify: `ai-digital-life/frontend/src/app/i18n/zh-CN/conversation.ts`

**Issue:** Hardcoded `<h3>Snapshots</h3>`, `"No snapshots yet"`, `snap.created_at.toLocaleString()`.

- [ ] **Step 1: Add i18n keys to en-US/conversation.ts**

After `snapshotRevert` block (line 126), add:

```typescript
  snapshotListTitle: 'Snapshots',
  snapshotListEmpty: 'No snapshots yet',
```

- [ ] **Step 2: Add i18n keys to zh-CN/conversation.ts**

After `snapshotRevert` block, add:

```typescript
  snapshotListTitle: '快照列表',
  snapshotListEmpty: '暂无快照',
```

- [ ] **Step 3: Fix SnapshotList.tsx component**

Replace the component (lines 1-32):

```tsx
import { useEffect, useState } from 'react';
import { useAppStore } from '../../stores/slicedStore';
import { useTCopy } from '../../i18n/useTCopy';
import type { SnapshotRecord } from '@shared/ipc/snapshot';

export function SnapshotList() {
  const { t } = useTCopy();
  const listSnapshots = useAppStore((s) => s.listSnapshots);
  const appInfo = useAppStore((s) => s.appInfo);
  const workspaceId = appInfo?.currentWorkspace?.id;
  const workspaceRoot = appInfo?.currentWorkspace?.rootPath;
  const [snapshots, setSnapshots] = useState<SnapshotRecord[]>([]);

  useEffect(() => {
    if (!workspaceId || !workspaceRoot) {
      return;
    }
    listSnapshots(workspaceId, workspaceRoot)
      .then(setSnapshots)
      .catch(() => {});
  }, [workspaceId, workspaceRoot, listSnapshots]);

  return (
    <div className="adl-snapshot-list">
      <h3>{t.snapshotListTitle}</h3>
      {snapshots.length === 0 && <p className="adl-empty-state">{t.snapshotListEmpty}</p>}
      {snapshots.map((snap) => (
        <div key={snap.id} className="adl-snapshot-item">
          <span>{new Date(snap.created_at).toLocaleString()}</span>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Verify**

Run: `cd frontend && npx eslint . && npx tsc --noEmit`
Expected: All pass.

- [ ] **Step 5: Commit**

```bash
git add ai-digital-life/frontend/src/app/components/conversation/SnapshotList.tsx
git add ai-digital-life/frontend/src/app/i18n/en-US/conversation.ts ai-digital-life/frontend/src/app/i18n/zh-CN/conversation.ts
git commit -m "fix(i18n): replace 3 hardcoded strings in SnapshotList with i18n keys"
```

---

### Task 5: Fix McpServerConfig i18n — 4 Hardcoded Placeholders

**Files:**
- Modify: `ai-digital-life/frontend/src/app/features/mcp/McpServerConfig.tsx`
- Modify: `ai-digital-life/frontend/src/app/i18n/en-US/mcp.ts`
- Modify: `ai-digital-life/frontend/src/app/i18n/zh-CN/mcp.ts`

**Issue:** 4 input placeholders are hardcoded English strings.

- [ ] **Step 1: Add i18n keys to en-US/mcp.ts**

```typescript
  mcpConfigNamePlaceholder: 'e.g. my-mcp-server',
  mcpConfigCommandPlaceholder: 'e.g. npx',
  mcpConfigArgsPlaceholder: 'e.g. -y, @modelcontextprotocol/server-filesystem',
  mcpConfigUrlPlaceholder: 'e.g. http://localhost:3000/sse',
```

- [ ] **Step 2: Add i18n keys to zh-CN/mcp.ts**

```typescript
  mcpConfigNamePlaceholder: '例如 my-mcp-server',
  mcpConfigCommandPlaceholder: '例如 npx',
  mcpConfigArgsPlaceholder: '例如 -y, @modelcontextprotocol/server-filesystem',
  mcpConfigUrlPlaceholder: '例如 http://localhost:3000/sse',
```

- [ ] **Step 3: Fix McpServerConfig.tsx placeholders**

Line 70: `placeholder="e.g. my-mcp-server"` → `placeholder={t.mcpConfigNamePlaceholder}`
Line 96: `placeholder="e.g. npx"` → `placeholder={t.mcpConfigCommandPlaceholder}`
Line 106: `placeholder="e.g. -y, @modelcontextprotocol/server-filesystem"` → `placeholder={t.mcpConfigArgsPlaceholder}`
Line 119: `placeholder="e.g. http://localhost:3000/sse"` → `placeholder={t.mcpConfigUrlPlaceholder}`

- [ ] **Step 4: Verify**

Run: `cd frontend && npx eslint . && npx tsc --noEmit`
Expected: All pass.

- [ ] **Step 5: Commit**

```bash
git add ai-digital-life/frontend/src/app/features/mcp/McpServerConfig.tsx
git add ai-digital-life/frontend/src/app/i18n/en-US/mcp.ts ai-digital-life/frontend/src/app/i18n/zh-CN/mcp.ts
git commit -m "fix(i18n): replace 4 hardcoded placeholders in McpServerConfig with i18n keys"
```

---

### Task 6: Fix CommandEditor i18n — 6 Hardcoded Strings

**Files:**
- Modify: `ai-digital-life/frontend/src/app/features/command-editor/CommandEditor.tsx`
- Modify: `ai-digital-life/frontend/src/app/i18n/en-US/commands.ts`
- Modify: `ai-digital-life/frontend/src/app/i18n/zh-CN/commands.ts`

**Issue:** Hardcoded `placeholder="my-command"`, `placeholder="optional"`, and 4 hardcoded `<option>` labels (Build/Plan/General/Explore).

- [ ] **Step 1: Add i18n keys to en-US/commands.ts**

```typescript
  commandsEditorNamePlaceholder: 'my-command',
  commandsEditorModelPlaceholder: 'optional',
  commandsEditorAgentBuild: 'Build',
  commandsEditorAgentPlan: 'Plan',
  commandsEditorAgentGeneral: 'General',
  commandsEditorAgentExplore: 'Explore',
```

- [ ] **Step 2: Add i18n keys to zh-CN/commands.ts**

```typescript
  commandsEditorNamePlaceholder: '自定义命令名',
  commandsEditorModelPlaceholder: '可选',
  commandsEditorAgentBuild: '构建',
  commandsEditorAgentPlan: '规划',
  commandsEditorAgentGeneral: '通用',
  commandsEditorAgentExplore: '探索',
```

- [ ] **Step 3: Fix CommandEditor.tsx**

Line 63: `placeholder="my-command"` → `placeholder={t.commandsEditorNamePlaceholder}`
Line 80: `placeholder="optional"` → `placeholder={t.commandsEditorModelPlaceholder}`
Lines 72-75: Replace option labels with i18n keys:

```tsx
            <option value="build">{t.commandsEditorAgentBuild}</option>
            <option value="plan">{t.commandsEditorAgentPlan}</option>
            <option value="general">{t.commandsEditorAgentGeneral}</option>
            <option value="explore">{t.commandsEditorAgentExplore}</option>
```

- [ ] **Step 4: Verify**

Run: `cd frontend && npx eslint . && npx tsc --noEmit`
Expected: All pass.

- [ ] **Step 5: Commit**

```bash
git add ai-digital-life/frontend/src/app/features/command-editor/CommandEditor.tsx
git add ai-digital-life/frontend/src/app/i18n/en-US/commands.ts ai-digital-life/frontend/src/app/i18n/zh-CN/commands.ts
git commit -m "fix(i18n): replace 6 hardcoded strings in CommandEditor with i18n keys"
```

---

### Task 7: Fix PermissionRulesetEditor i18n — 2 Hardcoded + 1 Wrong Domain

**Files:**
- Modify: `ai-digital-life/frontend/src/app/features/permission-settings/PermissionRulesetEditor.tsx`
- Modify: `ai-digital-life/frontend/src/app/i18n/en-US/permission.ts`
- Modify: `ai-digital-life/frontend/src/app/i18n/zh-CN/permission.ts`

**Issue:** Hardcoded `placeholder="bash, write, read"`, `placeholder="Why this rule exists"`, and Cancel button uses `t.commandsEditorCancel` from wrong domain.

- [ ] **Step 1: Add i18n keys to en-US/permission.ts**

```typescript
  permissionRulesToolTypePlaceholder: 'bash, write, read',
  permissionRulesReasonPlaceholder: 'Why this rule exists',
  permissionRulesCancel: 'Cancel',
```

- [ ] **Step 2: Add i18n keys to zh-CN/permission.ts**

```typescript
  permissionRulesToolTypePlaceholder: 'bash, write, read',
  permissionRulesReasonPlaceholder: '添加规则原因',
  permissionRulesCancel: '取消',
```

- [ ] **Step 3: Fix PermissionRulesetEditor.tsx**

Line 60: `placeholder="bash, write, read"` → `placeholder={t.permissionRulesToolTypePlaceholder}`
Line 72: `placeholder="Why this rule exists"` → `placeholder={t.permissionRulesReasonPlaceholder}`
Line 80: `{t.commandsEditorCancel}` → `{t.permissionRulesCancel}`

- [ ] **Step 4: Verify**

Run: `cd frontend && npx eslint . && npx tsc --noEmit`
Expected: All pass.

- [ ] **Step 5: Commit**

```bash
git add ai-digital-life/frontend/src/app/features/permission-settings/PermissionRulesetEditor.tsx
git add ai-digital-life/frontend/src/app/i18n/en-US/permission.ts ai-digital-life/frontend/src/app/i18n/zh-CN/permission.ts
git commit -m "fix(i18n): replace 2 hardcoded placeholders + fix wrong domain key in PermissionRulesetEditor"
```

---

### Task 8: Fix RevertButton — Use Store Action Instead of Direct Bridge

**Files:**
- Modify: `ai-digital-life/frontend/src/app/components/conversation/RevertButton.tsx`

**Issue:** `RevertButton` calls `window.digitalLife.snapshot.revertToSnapshot()` directly, bypassing Zustand store.

- [ ] **Step 1: Import and use the store action**

Replace `ai-digital-life/frontend/src/app/components/conversation/RevertButton.tsx`:

```tsx
import { useState } from 'react';
import { useAppStore } from '../../stores/slicedStore';
import { useTCopy } from '../../i18n/useTCopy';

export function RevertButton({
  snapshotId,
  workspaceId,
  workspaceRoot,
  onReverted,
}: {
  snapshotId: string;
  workspaceId?: string;
  workspaceRoot?: string;
  onReverted?: () => void;
}) {
  const { t } = useTCopy();
  const revertToSnapshot = useAppStore((s) => s.revertToSnapshot);
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    if (!workspaceId || !workspaceRoot) {
      return;
    }
    setLoading(true);
    const result = await revertToSnapshot(workspaceId, workspaceRoot, snapshotId);
    setLoading(false);
    setConfirming(false);
    if (result.ok) {
      onReverted?.();
    }
  };

  return (
    <button
      type="button"
      className={`adl-revert-button ${confirming ? 'adl-revert-confirming' : ''}`}
      onClick={handleClick}
      disabled={loading}
      aria-label={t.snapshotRevert}
    >
      {confirming ? t.snapshotRevertConfirm : t.snapshotRevert}
    </button>
  );
}
```

- [ ] **Step 2: Verify**

Run: `cd frontend && npx eslint . && npx tsc --noEmit`
Expected: All pass.

- [ ] **Step 3: Commit**

```bash
git add ai-digital-life/frontend/src/app/components/conversation/RevertButton.tsx
git commit -m "fix(snapshot): use store action instead of direct bridge call in RevertButton"
```

---

### Task 9: Fix PlanCard — Replace Emoji with SVG Icons

**Files:**
- Modify: `ai-digital-life/frontend/src/app/components/agent/PlanCard.tsx`

**Issue:** `STEP_TYPE_ICON` map uses emoji, violating design system SVG icon rule.

**Available SVG icons** (all exported from `../../icons` barrel): `IconTarget`, `IconSearch`, `IconFileText`, `IconPencil`, `IconTerminal`, `IconCheck`.

- [ ] **Step 1: Replace STEP_TYPE_ICON with SVG component map**

In `ai-digital-life/frontend/src/app/components/agent/PlanCard.tsx`, update lines 1-28.

Update import (line 4):
```diff
-import { IconChevronDown, IconChevronRight, IconTarget } from '../../icons';
+import { IconChevronDown, IconChevronRight, IconTarget, IconSearch, IconFileText, IconPencil, IconTerminal, IconCheck } from '../../icons';
```

Replace the `STEP_TYPE_ICON` constant (lines 21-28):
```diff
-const STEP_TYPE_ICON: Record<AgentStepType, string> = {
-  analyze: '🔍',
-  search: '🔎',
-  read: '📖',
-  edit: '✏️',
-  command: '⌨️',
-  verify: '✅',
-};
```

Replace on line 82-84:
```diff
               <span className="adl-plan-card__step-icon" aria-hidden="true">
-                {STEP_TYPE_ICON[step.stepType]}
+                {step.stepType === 'analyze' && <IconTarget size={14} decorative />}
+                {step.stepType === 'search' && <IconSearch size={14} decorative />}
+                {step.stepType === 'read' && <IconFileText size={14} decorative />}
+                {step.stepType === 'edit' && <IconPencil size={14} decorative />}
+                {step.stepType === 'command' && <IconTerminal size={14} decorative />}
+                {step.stepType === 'verify' && <IconCheck size={14} decorative />}
               </span>
```

- [ ] **Step 2: Verify**

Run: `cd frontend && npx eslint . && npx tsc --noEmit`
Expected: All pass.

- [ ] **Step 3: Commit**

```bash
git add ai-digital-life/frontend/src/app/components/agent/PlanCard.tsx
git commit -m "fix(ui): replace emoji icons with SVG icons in PlanCard STEP_TYPE_ICON"
```

- [ ] **Step 3: Verify**

Run: `cd frontend && npx eslint . && npx tsc --noEmit`
Expected: All pass.

- [ ] **Step 4: Commit**

```bash
git add ai-digital-life/frontend/src/app/components/agent/PlanCard.tsx
git commit -m "fix(ui): replace emoji icons with SVG icons in PlanCard STEP_TYPE_ICON"
```

---

### Task 10: Fix DurableStatusIndicator — Per-Status Label

**Files:**
- Modify: `ai-digital-life/frontend/src/app/components/session/DurableStatusIndicator.tsx`
- Modify: `ai-digital-life/frontend/src/app/i18n/en-US/durable.ts`
- Modify: `ai-digital-life/frontend/src/app/i18n/zh-CN/durable.ts`

**Issue:** Always shows `t.durableSessionRunning` regardless of actual status.

- [ ] **Step 1: Add i18n keys**

en-US/durable.ts:
```typescript
  durableSessionCompleted: 'Completed',
  durableSessionFailed: 'Failed',
  durableSessionCrashed: 'Crashed',
```

zh-CN/durable.ts:
```typescript
  durableSessionCompleted: '已完成',
  durableSessionFailed: '失败',
  durableSessionCrashed: '已崩溃',
```

- [ ] **Step 2: Fix DurableStatusIndicator.tsx**

Replace line 14:

```tsx
export function DurableStatusIndicator({ sessionId }: { sessionId: string }) {
  const { t } = useTCopy();
  const info = useAppStore((s) => s.durableSessions[sessionId]);

  if (!info) {
    return null;
  }

  const statusLabels: Record<string, string> = {
    running: t.durableSessionRunning,
    completed: t.durableSessionCompleted,
    failed: t.durableSessionFailed,
    crashed: t.durableSessionCrashed,
  };

  return (
    <span className={`adl-durable-status adl-durable-status--${info.status}`} role="status">
      {statusLabels[info.status] ?? t.durableSessionRunning}
    </span>
  );
}
```

- [ ] **Step 3: Verify**

Run: `cd frontend && npx eslint . && npx tsc --noEmit`
Expected: All pass.

- [ ] **Step 4: Commit**

```bash
git add ai-digital-life/frontend/src/app/components/session/DurableStatusIndicator.tsx
git add ai-digital-life/frontend/src/app/i18n/en-US/durable.ts ai-digital-life/frontend/src/app/i18n/zh-CN/durable.ts
git commit -m "fix(durable): show per-status labels instead of always 'Running'"
```

---

### Task 11: Fix Session Fork — Server-Side Fork Count

**Files:**
- Modify: `ai-digital-life/src-tauri/src/commands/session_fork.rs`
- Modify: `ai-digital-life/crates/conversation/src/fork.rs`
- Modify: `ai-digital-life/frontend/src/shared/ipc/session_fork.ts`
- Modify: `ai-digital-life/frontend/src/tauri-bridge.ts`
- Modify: `ai-digital-life/frontend/src/mock-bridge.ts`

**Issue:** `fork_session_cmd` trusts the frontend for `existing_fork_count`, risking duplicate fork numbers on concurrent calls.

- [ ] **Step 1: Update Rust command to compute fork count server-side**

Replace `ai-digital-life/src-tauri/src/commands/session_fork.rs`:

```rust
use crate::commands::ipc;
use crate::state::AppState;
use adl_conversation::fork::fork_session;
use adl_errors::AppError;
use adl_kernel::types::conversation::ConversationSessionRecord;
use adl_kernel::IpcResult;
use adl_storage::EntityTable;

#[tauri::command]
pub async fn fork_session_cmd(
    state: tauri::State<'_, AppState>,
    parent_session: ConversationSessionRecord,
    fork_message_id: String,
) -> Result<IpcResult<ConversationSessionRecord>, AppError> {
    let existing_fork_count = state
        .db
        .list_entities_by_workspace::<ConversationSessionRecord>(
            EntityTable::Sessions,
            &parent_session.workspace_id,
        )?
        .into_iter()
        .filter(|s| s.parent_id.as_deref() == Some(&parent_session.id))
        .count() as u32;
    Ok(ipc(Ok(fork_session(&parent_session, &fork_message_id, existing_fork_count))))
}

#[tauri::command]
pub async fn list_session_forks(
    state: tauri::State<'_, AppState>,
    workspace_id: String,
    parent_session_id: String,
) -> Result<IpcResult<Vec<ConversationSessionRecord>>, AppError> {
    let forks: Vec<ConversationSessionRecord> = state
        .db
        .list_entities_by_workspace::<ConversationSessionRecord>(
            EntityTable::Sessions,
            &workspace_id,
        )?
        .into_iter()
        .filter(|s| s.parent_id.as_deref() == Some(&parent_session_id))
        .collect();
    Ok(ipc(Ok(forks)))
}
```

- [ ] **Step 2: Update frontend IPC interface to remove `existing_fork_count`**

In `ai-digital-life/frontend/src/shared/ipc/session_fork.ts`, change:

```typescript
export interface SessionForkBridge {
  forkSession: (parentSession: ConversationSessionRecord, forkMessageId: string) => Promise<IpcResult<ConversationSessionRecord>>;
  listSessionForks: (workspaceId: string, parentSessionId: string) => Promise<IpcResult<ConversationSessionRecord[]>>;
}
```

- [ ] **Step 3: Update tauri-bridge.ts**

```typescript
    forkSession: (parentSession, forkMessageId) =>
      invoke('fork_session_cmd', { parentSession, forkMessageId }),
```

- [ ] **Step 4: Update mock-bridge.ts**

```typescript
    forkSession: async (parentSession, _forkMessageId) => ({
      ok: true,
      data: {
        ...parentSession,
        id: `${parentSession.id}-fork-${Date.now()}`,
        title: `${parentSession.title} (fork)`,
        parent_id: parentSession.id,
      },
    }),
```

- [ ] **Step 5: Update ForkButton.tsx, StoreState.ts, and sessionForkActions.ts**

**ForkButton.tsx** — remove `existingForkCount` prop (line 9) and from the `forkSession` call (line 21):
```diff
-  existingForkCount,
```
```diff
-    await forkSession(parentSession, forkMessageId, existingForkCount);
+    await forkSession(parentSession, forkMessageId);
```

**StoreState.ts** (line 258-263) — change `SessionForkActions.forkSession` signature:
```diff
   forkSession: (
     parentSession: ConversationSessionRecord,
     forkMessageId: string,
-    existingForkCount: number
   ) => Promise<ConversationSessionRecord | null>;
```

**sessionForkActions.ts** — remove `existingForkCount` parameter (line 14) and stop passing it to bridge (line 20):
```diff
     forkSession: async (
       parentSession: ConversationSessionRecord,
       forkMessageId: string,
-      existingForkCount: number
     ) => {
       clearError(get);
       const result = await window.digitalLife.sessionFork.forkSession(
         parentSession,
         forkMessageId,
-        existingForkCount
       );
```

- [ ] **Step 6: Verify**

Run: `cd frontend && npx eslint . && npx tsc --noEmit`
Run: `cargo clippy --workspace --all-targets`
Expected: All pass.

- [ ] **Step 7: Commit**

```bash
git add ai-digital-life/src-tauri/src/commands/session_fork.rs
git add ai-digital-life/frontend/src/shared/ipc/session_fork.ts ai-digital-life/frontend/src/tauri-bridge.ts ai-digital-life/frontend/src/mock-bridge.ts
git add ai-digital-life/frontend/src/app/features/session-fork/ForkButton.tsx
git commit -m "fix(session-fork): compute fork count server-side to prevent race conditions"
```

---

### Task 12: Fix Preview Bridge — Explicit Phase 2 Bridge Declarations

**Files:**
- Modify: `ai-digital-life/frontend/src/preview-bridge/index.ts`

**Issue:** 10 Phase 2 bridges inherited implicitly via `...mockDigitalLifeBridge` spread.

- [ ] **Step 1: Add explicit Phase 2 bridge declarations**

In the preview bridge construction, after the spread, explicitly list the inherited bridges with comments for clarity:

```typescript
  // Phase 2 bridges (inherited from mock — add preview-specific overrides here if needed)
  snapshot: mockDigitalLifeBridge.snapshot,
  webTools: mockDigitalLifeBridge.webTools,
  compaction: mockDigitalLifeBridge.compaction,
  sessionFork: mockDigitalLifeBridge.sessionFork,
  lsp: mockDigitalLifeBridge.lsp,
  plugin: mockDigitalLifeBridge.plugin,
  reference: mockDigitalLifeBridge.reference,
  durable: mockDigitalLifeBridge.durable,
  reserved: mockDigitalLifeBridge.reserved,
  customAgent: mockDigitalLifeBridge.customAgent,
```

- [ ] **Step 2: Verify**

Run: `cd frontend && npx tsc --noEmit`
Expected: All pass.

- [ ] **Step 3: Commit**

```bash
git add ai-digital-life/frontend/src/preview-bridge/index.ts
git commit -m "refactor(preview-bridge): explicitly declare Phase 2 bridges for maintainability"
```

---

### Task 13: Final Verification — Full Quality Gates

**Files:** None (verification only)

- [ ] **Step 1: Run Rust quality gates**

```bash
cargo clippy --workspace --all-targets --manifest-path ai-digital-life/Cargo.toml
cargo fmt --all --manifest-path ai-digital-life/Cargo.toml -- --check
cargo test --workspace --manifest-path ai-digital-life/Cargo.toml
```

Expected: clippy zero warnings, fmt clean, all tests pass.

- [ ] **Step 2: Run frontend quality gates**

```bash
cd ai-digital-life/frontend && npx eslint . && npx tsc --noEmit
```

Expected: ESLint zero warnings, TypeScript zero errors.

- [ ] **Step 3: Run frontend tests**

```bash
cd ai-digital-life/frontend && npx vitest run
```

Expected: All 326+ tests pass.

- [ ] **Step 4: Final commit if any changes from quality gates**

```bash
git add -A
git diff --cached --stat
git commit -m "chore: final quality gate verification after Phase 2 audit fixes"
```
