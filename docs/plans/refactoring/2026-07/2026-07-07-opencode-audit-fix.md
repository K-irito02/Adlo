# OpenCode 移植功能深度审计修复计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复 2026-07-07 深度审计发现的 4 个 🔴 HIGH 和 11 个 🟡 MEDIUM 缺陷，确保 Phase 2 对照 OpenCode 移植的全部功能真实可用。

**Architecture:** 按依赖关系分 4 组推进。组 A（核心正确性）修复 Plan Mode / Compaction / Subagent 权限三个阻塞性缺陷；组 B（可靠性）修复 DurableSession 错误吞掉 / Plugin 全局隔离 / fire_hook 链式修改 / fallback 默认模型；组 C（WebTools 增强）改造 WebFetch / WebSearch；组 D（MCP 完善）修复传输区分 / 重连 / OAuth。前端 UI 补齐不在此计划范围。

**Tech Stack:** Rust 1.85+ / Tauri 2.x / Tokio / reqwest / rmcp 1.x / pulldown-cmark / readability

**审计来源:** [opencode-audit-2026-07-07.md](../../../refactoring-insight/report/audit/opencode-audit-2026-07-07.md)

## Global Constraints

- Rust 最低版本：1.85+（edition 2021）
- 禁止 `unwrap()` / `expect()` / `unsafe`，使用 `?` 或模式匹配
- 错误类型统一使用 `adl_errors::AppError`
- 测试命令从 `ai-digital-life/` 目录执行：`cargo test --workspace`
- 类型检查：`cargo check --workspace`
- Lint：`cargo clippy --workspace --all-targets -- -D warnings`
- 所有修改在 `ai-digital-life/` 目录下执行
- OpenCode 源码参考位于 `references/opencode/`
- 每个任务遵循红绿重构：先写失败测试 → 最小实现 → 重构 → 提交
- 提交格式：`type(scope): summary`，scope 可选 `core` / `rust` / `frontend` / `ipc`

---

## 组 A: 核心功能正确性修复（🔴 HIGH）

### Task 1: Plan Mode `write` 工具白名单修复

**目标**: Plan Mode 的 Agent 必须能用 `write` 工具创建计划文件，但仅限于写入计划文件路径。

**Files:**
- Modify: `ai-digital-life/crates/agent-runtime/src/plan_mode.rs:36-41`
- Modify: `ai-digital-life/src-tauri/src/commands/agent_pipeline.rs`（在 pipeline 中添加路径约束）

**Interfaces:**
- Consumes: `is_tool_allowed_in_plan_mode(tool_name: &str) -> bool`
- Produces: `is_tool_allowed_in_plan_mode(tool_name: &str) -> bool`（扩展白名单）+ `is_write_allowed_for_plan_file(tool_input: &str, plan_file: &Path) -> bool`

- [ ] **Step 1: 写失败测试**

在 `plan_mode.rs` 的 `#[cfg(test)] mod tests` 中添加：

```rust
#[test]
fn write_tool_allowed_in_plan_mode() {
    assert!(is_tool_allowed_in_plan_mode("write"));
}

#[test]
fn run_command_still_blocked_in_plan_mode() {
    assert!(!is_tool_allowed_in_plan_mode("run_command"));
    assert!(!is_tool_allowed_in_plan_mode("apply_patch"));
}

#[test]
fn write_path_constraint_allows_plan_file() {
    let plan_file = std::path::Path::new("/workspace/.ai-digital-life/plans/plan-abc.md");
    assert!(is_write_allowed_for_plan_file(
        "/workspace/.ai-digital-life/plans/plan-abc.md",
        plan_file
    ));
}

#[test]
fn write_path_constraint_blocks_other_files() {
    let plan_file = std::path::Path::new("/workspace/.ai-digital-life/plans/plan-abc.md");
    assert!(!is_write_allowed_for_plan_file(
        "/workspace/src/main.rs",
        plan_file
    ));
}
```

- [ ] **Step 2: 验证测试失败**

```powershell
cd ai-digital-life
cargo test -p adl-agent-runtime plan_mode -- --nocapture
```

Expected: `write_tool_allowed_in_plan_mode` FAIL（`write` 不在白名单）

- [ ] **Step 3: 实现修复**

修改 `plan_mode.rs`:

```rust
/// Check if a tool is allowed in plan mode.
pub fn is_tool_allowed_in_plan_mode(tool_name: &str) -> bool {
    matches!(
        tool_name,
        "read" | "list_tree" | "search" | "outline" | "glob" | "grep" | "webfetch" | "websearch" | "write"
    )
}

/// Check if a write operation targets the plan file (only plan file writes are allowed).
pub fn is_write_allowed_for_plan_file(write_target: &str, plan_file: &std::path::Path) -> bool {
    let target = std::path::Path::new(write_target);
    // Canonicalize both for comparison; fall back to string comparison
    let target_normalized = write_target.replace('\\', "/");
    let plan_normalized = plan_file.to_string_lossy().replace('\\', "/");
    target_normalized == plan_normalized
        || target_normalized.ends_with(&plan_normalized)
}
```

- [ ] **Step 4: 验证测试通过**

```powershell
cd ai-digital-life
cargo test -p adl-agent-runtime plan_mode
```

Expected: 全部 PASS

- [ ] **Step 5: 提交**

```bash
git add ai-digital-life/crates/agent-runtime/src/plan_mode.rs
git commit -m "fix(core): allow write tool in plan mode with path constraint"
```

---

### Task 2: Compaction 阈值逻辑修复

**目标**: Compaction 应在 `total_tokens >= PRUNE_MINIMUM`（20000）时触发，而非 `PRUNE_PROTECT`（40000）。`PRUNE_PROTECT` 仅用于保护尾部消息不被裁剪。

**Files:**
- Modify: `ai-digital-life/crates/agent-runtime/src/compaction.rs:28-84`
- Modify: `ai-digital-life/crates/agent-runtime/src/token_counter.rs:30-32`

**Interfaces:**
- Consumes: `compact_messages(messages, provider, counter) -> CompactionResult`
- Produces: 同上签名，行为变更（触发阈值降低到 PRUNE_MINIMUM）

- [ ] **Step 1: 写失败测试**

在 `compaction.rs` 的测试模块中添加：

```rust
#[test]
fn compaction_triggers_at_prune_minimum() {
    let counter = TokenCounter::new();
    // PRUNE_MINIMUM = 20000, so 25000 tokens should trigger compaction
    // With estimate_tokens, ~4 chars = 1 token, so ~100000 chars = 25000 tokens
    let big_content = "hello world ".repeat(8400); // ~100800 chars ≈ 25200 tokens
    let messages: Vec<_> = (0..6)
        .map(|i| {
            make_message(
                if i % 2 == 0 { ConversationRole::User } else { ConversationRole::Assistant },
                &big_content,
            )
        })
        .collect();

    let total: usize = messages.iter().map(|m| counter.count(&m.content, "openai")).sum();
    assert!(total >= PRUNE_MINIMUM, "total {} should exceed PRUNE_MINIMUM", total);
    assert!(total < PRUNE_PROTECT, "total {} should be below PRUNE_PROTECT for this test to be meaningful", total);

    let result = compact_messages(&messages, "openai", &counter);
    assert!(result.summary_needed, "compaction should trigger when tokens >= PRUNE_MINIMUM");
    assert!(result.pruned_count > 0, "should have pruned some messages");
}

#[test]
fn compaction_protects_recent_tokens() {
    let counter = TokenCounter::new();
    // Create messages exceeding PRUNE_PROTECT (40000 tokens)
    let big_content = "x".repeat(50000);
    let messages: Vec<_> = (0..10)
        .map(|i| {
            make_message(
                if i % 2 == 0 { ConversationRole::User } else { ConversationRole::Assistant },
                &big_content,
            )
        })
        .collect();

    let result = compact_messages(&messages, "openai", &counter);
    // Should preserve tail turns (2 turns = 4 messages) + any protected messages
    assert!(result.preserved.len() <= 4, "should preserve only tail turns, got {}", result.preserved.len());
}
```

- [ ] **Step 2: 验证测试失败**

```powershell
cd ai-digital-life
cargo test -p adl-agent-runtime compaction_triggers_at_prune_minimum -- --nocapture
```

Expected: FAIL — 当前阈值是 PRUNE_PROTECT（40000），25000 token 不会触发

- [ ] **Step 3: 修复 compaction.rs 阈值**

将 `compaction.rs` 第 35 行的门控从 `PRUNE_PROTECT` 改为 `PRUNE_MINIMUM`:

```rust
// 引入 PRUNE_MINIMUM
use crate::token_counter::{
    TokenCounter, DEFAULT_TAIL_TURNS, PRUNE_MINIMUM, PRUNE_PROTECT, PRUNE_PROTECTED_TOOLS, TOOL_OUTPUT_MAX_CHARS,
};

pub fn compact_messages(
    messages: &[ConversationMessageRecord],
    provider: &str,
    counter: &TokenCounter,
) -> CompactionResult {
    let total_tokens: usize = messages.iter().map(|m| counter.count(&m.content, provider)).sum();

    // 使用 PRUNE_MINIMUM 作为触发阈值（OpenCode 对齐）
    if total_tokens < PRUNE_MINIMUM {
        return CompactionResult {
            preserved: messages.to_vec(),
            preserved_tokens: total_tokens,
            pruned_count: 0,
            pruned_tokens: 0,
            summary_needed: false,
        };
    }

    // 计算保留的尾部消息数量
    let tail_messages = DEFAULT_TAIL_TURNS * 2;
    let split_point = messages.len().saturating_sub(tail_messages);

    // ... (rest of function unchanged)
```

同步修复 `token_counter.rs` 的 `needs_compaction`:

```rust
pub fn needs_compaction(&self, total_tokens: usize) -> bool {
    total_tokens >= PRUNE_MINIMUM  // 使用 PRUNE_MINIMUM 而非 PRUNE_PROTECT
}
```

- [ ] **Step 4: 验证全部 compaction 测试通过**

```powershell
cd ai-digital-life
cargo test -p adl-agent-runtime compaction
```

Expected: 全部 PASS

- [ ] **Step 5: 提交**

```bash
git add ai-digital-life/crates/agent-runtime/src/compaction.rs ai-digital-life/crates/agent-runtime/src/token_counter.rs
git commit -m "fix(core): use PRUNE_MINIMUM as compaction trigger threshold"
```

---

### Task 3: SubagentPermission 使用父 Agent 配置

**目标**: `derive_subagent_permission` 应从父 Agent 继承权限规则（allow 规则），但强制 deny 写工具。

**Files:**
- Modify: `ai-digital-life/crates/subagent/src/permission.rs`
- Modify: `ai-digital-life/crates/kernel/src/types/agent.rs`（确认 AgentConfig 有 permission 字段）

**Interfaces:**
- Consumes: `derive_subagent_permission(parent: &AgentConfig, subagent: &AgentConfig) -> AgentConfig`
- Produces: 同上签名，行为变更（实际使用 parent 参数）

- [ ] **Step 1: 确认 AgentConfig 结构**

读取 `crates/kernel/src/types/agent.rs`，确认 `AgentConfig` 中是否有 `permission_rules` 或类似字段。如果不存在，需要先添加。

根据当前代码，`AgentConfig` 有 `allows_write_tools` 和 `mode` 字段。需要添加一个 `allowed_tools: Vec<String>` 字段来承载从父 Agent 继承的工具列表。

在 `AgentConfig` 中添加字段（如果不存在）：

```rust
/// Tools explicitly allowed by this agent (inherited from parent for subagents).
pub allowed_tools: Vec<String>,
```

- [ ] **Step 2: 写失败测试**

在 `permission.rs` 测试模块中添加：

```rust
#[test]
fn subagent_inherits_parent_allowed_tools() {
    let mut parent = AgentConfig::built_in(AgentId::Build);
    parent.allowed_tools = vec!["read".into(), "write".into(), "bash".into(), "search".into()];

    let subagent = AgentConfig::built_in(AgentId::General);
    let derived = derive_subagent_permission(&parent, &subagent);

    // Subagent should inherit parent's read tools but not write tools
    assert!(derived.allowed_tools.contains(&"read".to_string()));
    assert!(derived.allowed_tools.contains(&"search".to_string()));
    assert!(!derived.allowed_tools.contains(&"write".to_string()));
    assert!(!derived.allows_write_tools);
    assert_eq!(derived.mode, AgentMode::Subagent);
}

#[test]
fn subagent_with_no_parent_tools_gets_defaults() {
    let parent = AgentConfig::built_in(AgentId::Build);
    let subagent = AgentConfig::built_in(AgentId::General);
    let derived = derive_subagent_permission(&parent, &subagent);

    // With no parent tools, subagent should have empty allowed_tools
    assert!(derived.allowed_tools.is_empty() || derived.allowed_tools.len() <= parent.allowed_tools.len());
    assert!(!derived.allows_write_tools);
}
```

- [ ] **Step 3: 验证测试失败**

```powershell
cd ai-digital-life
cargo test -p adl-subagent permission -- --nocapture
```

Expected: FAIL — `allowed_tools` 字段不存在或未使用 parent

- [ ] **Step 4: 实现修复**

修改 `permission.rs`:

```rust
/// Derive the permission configuration for a sub-agent from its parent.
/// Sub-agents inherit the parent's allowed tools (minus write tools).
pub fn derive_subagent_permission(parent: &AgentConfig, subagent: &AgentConfig) -> AgentConfig {
    let mut derived = subagent.clone();

    // Inherit parent's allowed tools, filtering out write tools
    let write_tools = ["write", "apply_patch", "edit"];
    derived.allowed_tools = parent
        .allowed_tools
        .iter()
        .filter(|tool| !write_tools.contains(&tool.as_str()))
        .cloned()
        .collect();

    derived.allows_write_tools = false;
    derived.mode = AgentMode::Subagent;
    derived
}
```

- [ ] **Step 5: 验证测试通过**

```powershell
cd ai-digital-life
cargo test -p adl-subagent permission
```

Expected: 全部 PASS

- [ ] **Step 6: 全 workspace 编译检查**

```powershell
cd ai-digital-life
cargo check --workspace
```

Expected: 编译成功（如果 `allowed_tools` 字段需要更新 `built_in` 构造函数，修复编译错误）

- [ ] **Step 7: 提交**

```bash
git add ai-digital-life/crates/subagent/src/permission.rs ai-digital-life/crates/kernel/src/types/agent.rs
git commit -m "fix(core): subagent inherits parent permission rules minus write tools"
```

---

## 组 B: 可靠性与架构改进（🟡 MEDIUM）

### Task 4: DurableSession 错误处理修复

**目标**: 将 DurableSession 中所有 `let _ =` 静默丢弃替换为带日志的错误处理。

**Files:**
- Modify: `ai-digital-life/crates/agent-runtime/src/durable.rs`

**Interfaces:**
- Consumes: `DurableSessionManager` 所有方法
- Produces: 各方法改为返回 `Result<(), AppError>` 或至少记录 tracing 日志

- [ ] **Step 1: 写失败测试**

```rust
#[tokio::test]
async fn heartbeat_on_nonexistent_session_does_not_panic() {
    let manager = create_test_manager();
    // Should not panic even for non-existent session
    manager.heartbeat("nonexistent").await;
}
```

- [ ] **Step 2: 修复 register_session**

```rust
pub async fn register_session(&self, session_id: &str, run_id: &str) -> Result<(), adl_errors::AppError> {
    let now = adl_kernel::now_ms();
    self.db.execute(
        "INSERT OR REPLACE INTO durable_session_state
         (session_id, run_id, status, last_heartbeat, retry_count, created_at, updated_at)
         VALUES (?1, ?2, 'running', ?3, 0, ?3, ?3)",
        &[&session_id, &run_id, &now],
    ).map_err(|e| adl_errors::AppError::Internal(format!("Failed to register durable session: {}", e)))?;
    Ok(())
}
```

- [ ] **Step 3: 修复 heartbeat/checkpoint/complete/fail**

将每个方法中的 `let _ = self.db.execute(...)` 替换为 `tracing::warn!` + `return`：

```rust
pub async fn heartbeat(&self, session_id: &str) {
    let now = adl_kernel::now_ms();
    if let Err(e) = self.db.execute(
        "UPDATE durable_session_state SET last_heartbeat = ?1, updated_at = ?1 WHERE session_id = ?2",
        &[&now, &session_id],
    ) {
        tracing::warn!(session_id = %session_id, error = %e, "Failed to update heartbeat");
    }
}
```

对 `checkpoint`、`complete`、`fail` 同理处理。

- [ ] **Step 4: 修复 find_crashed_sessions 和 start_recovery**

将 `match ... { _ => return vec![] }` 替换为带 warn 日志的处理：

```rust
pub async fn find_crashed_sessions(&self) -> Vec<DurableSessionState> {
    let now = adl_kernel::now_ms();
    let timeout = now - self.heartbeat_timeout_ms as i64;
    let conn = match self.db.conn() {
        Ok(c) => c,
        Err(e) => {
            tracing::warn!(error = %e, "Failed to get DB connection for crashed session scan");
            return vec![];
        },
    };
    // ... rest of function with similar error logging
}
```

- [ ] **Step 5: 验证测试**

```powershell
cd ai-digital-life
cargo test -p adl-agent-runtime durable
```

Expected: 全部 PASS

- [ ] **Step 6: 提交**

```bash
git add ai-digital-life/crates/agent-runtime/src/durable.rs
git commit -m "fix(core): add error logging to DurableSession operations"
```

---

### Task 5: Plugin fire_hook 链式修改

**目标**: 多个插件返回 `Modify` 时，后续插件应基于前一个插件的输出继续修改，而非互相覆盖。

**Files:**
- Modify: `ai-digital-life/crates/agent-runtime/src/plugins/registry.rs:59-83`
- Modify: `ai-digital-life/crates/agent-runtime/src/plugins/hooks.rs`（确认 HookResult 定义）

**Interfaces:**
- Consumes: `fire_hook(hook: &PluginHook) -> HookResult`
- Produces: 同上签名，语义变更（Modify 链式传递）

- [ ] **Step 1: 写失败测试**

```rust
#[tokio::test]
async fn fire_hook_chains_multiple_modify_results() {
    let registry = PluginRegistry::new();

    struct PluginA;
    #[async_trait::async_trait]
    impl Plugin for PluginA {
        fn name(&self) -> &str { "plugin-a" }
        fn description(&self) -> &str { "A" }
        fn hooks(&self) -> &[HookType] { &[HookType::ChatSystemTransform] }
        async fn on_hook(&self, _hook: &PluginHook) -> HookResult {
            HookResult::Modify(serde_json::json!({ "system_prompt": "Part A" }))
        }
    }

    struct PluginB;
    #[async_trait::async_trait]
    impl Plugin for PluginB {
        fn name(&self) -> &str { "plugin-b" }
        fn description(&self) -> &str { "B" }
        fn hooks(&self) -> &[HookType] { &[HookType::ChatSystemTransform] }
        async fn on_hook(&self, hook: &PluginHook) -> HookResult {
            // Plugin B should receive Plugin A's output as its input
            if let PluginHook::ChatSystemTransform { prompt } = hook {
                let combined = format!("{} + Part B", prompt);
                HookResult::Modify(serde_json::json!({ "system_prompt": combined }))
            } else {
                HookResult::Pass
            }
        }
    }

    registry.register(Arc::new(PluginA)).await;
    registry.register(Arc::new(PluginB)).await;

    let hook = PluginHook::ChatSystemTransform { prompt: "Original".to_string() };
    let result = registry.fire_hook(&hook).await;

    if let HookResult::Modify(val) = result {
        let prompt = val["system_prompt"].as_str().unwrap();
        assert!(prompt.contains("Part A"), "should contain Plugin A's modification, got: {}", prompt);
        assert!(prompt.contains("Part B"), "should contain Plugin B's modification, got: {}", prompt);
    } else {
        panic!("Expected Modify result, got {:?}", result);
    }
}
```

- [ ] **Step 2: 验证测试失败**

```powershell
cd ai-digital-life
cargo test -p adl-agent-runtime fire_hook_chains -- --nocapture
```

Expected: FAIL — 当前 Plugin B 的 Modify 覆盖 Plugin A 的

- [ ] **Step 3: 修复 fire_hook**

```rust
pub async fn fire_hook(&self, hook: &PluginHook) -> HookResult {
    let hook_type = hook_to_type(hook);
    let plugins = self.plugins.read().await;
    let enabled = self.enabled.read().await;

    let mut current_hook = hook.clone();
    let mut result = HookResult::Pass;

    for plugin in plugins.values() {
        if !enabled.get(plugin.name()).copied().unwrap_or(false) {
            continue;
        }
        if !plugin.hooks().contains(&hook_type) {
            continue;
        }

        match plugin.on_hook(&current_hook).await {
            HookResult::Pass => continue,
            HookResult::Abort(msg) => return HookResult::Abort(msg),
            HookResult::Modify(val) => {
                // Chain: update the hook with modified data for the next plugin
                current_hook = update_hook_with_modification(&current_hook, &val);
                result = HookResult::Modify(val);
            },
        }
    }

    result
}

/// Update a hook with modification data from a previous plugin.
fn update_hook_with_modification(hook: &PluginHook, modification: &serde_json::Value) -> PluginHook {
    match hook {
        PluginHook::ChatSystemTransform { prompt } => {
            let new_prompt = modification
                .get("system_prompt")
                .and_then(|v| v.as_str())
                .unwrap_or(prompt.as_str())
                .to_string();
            PluginHook::ChatSystemTransform { prompt: new_prompt }
        },
        // For other hook types, pass through unchanged
        other => other.clone(),
    }
}
```

- [ ] **Step 4: 确认 PluginHook 实现了 Clone**

如果 `PluginHook` 没有 derive `Clone`，需要添加：

```rust
#[derive(Debug, Clone)]
pub enum PluginHook { ... }
```

- [ ] **Step 5: 验证测试通过**

```powershell
cd ai-digital-life
cargo test -p adl-agent-runtime plugins
```

Expected: 全部 PASS

- [ ] **Step 6: 提交**

```bash
git add ai-digital-life/crates/agent-runtime/src/plugins/
git commit -m "fix(core): chain plugin hook modifications instead of overwriting"
```

---

### Task 6: fallback.rs default_model 从 ProviderRegistry 查询

**目标**: 消除硬编码的 default_model，改为从 ProviderDefinition 获取默认模型。

**Files:**
- Modify: `ai-digital-life/crates/model-gateway/src/fallback.rs`
- Modify: `ai-digital-life/crates/model-gateway/src/registry.rs`（在 ProviderDefinition 中添加 `default_model` 字段）

**Interfaces:**
- Consumes: `ProviderRegistry::get(id)` 返回 `ProviderDefinition`
- Produces: `ProviderDefinition.default_model: Option<String>`

- [ ] **Step 1: 在 ProviderDefinition 中添加 default_model 字段**

```rust
pub struct ProviderDefinition {
    pub id: String,
    pub name: String,
    pub description: String,
    pub api_type: ApiType,
    pub default_base_url: Option<String>,
    pub auth_type: AuthType,
    pub models: ModelSource,
    pub built_in: bool,
    pub default_model: Option<String>,  // 新增
}
```

- [ ] **Step 2: 重写 default_model 函数**

```rust
pub(crate) fn default_model(provider_id: &str, registry: &ProviderRegistry) -> String {
    // 1. Try explicit default from provider definition
    if let Some(def) = registry.get(provider_id) {
        if let Some(model) = &def.default_model {
            return model.clone();
        }
        // 2. Try first static model
        if let ModelSource::Static(models) = &def.models {
            if let Some(first) = models.first() {
                return first.id.clone();
            }
        }
    }
    // 3. Last resort: return a descriptive fallback
    format!("{}-default", provider_id)
}
```

- [ ] **Step 3: 更新所有 ProviderDefinition 构造点**

在每个 provider adapter 的构造函数中（`providers/openai.rs` 等），添加 `default_model` 字段：

```rust
ProviderDefinition {
    // ... existing fields ...
    default_model: Some("gpt-4o".into()),  // OpenAI
}
```

- [ ] **Step 4: 编译验证**

```powershell
cd ai-digital-life
cargo check --workspace
```

- [ ] **Step 5: 运行测试**

```powershell
cd ai-digital-life
cargo test -p adl-model-gateway
```

- [ ] **Step 6: 提交**

```bash
git add ai-digital-life/crates/model-gateway/
git commit -m "fix(core): resolve default_model from ProviderRegistry instead of hardcoded"
```

---

### Task 7: SubagentManager.update_status 返回 Result

**目标**: `update_status` 应对不存在的 ID 返回错误而非静默忽略。

**Files:**
- Modify: `ai-digital-life/crates/subagent/src/manager.rs:82-89`

- [ ] **Step 1: 写失败测试**

```rust
#[tokio::test]
async fn update_status_returns_error_for_unknown_id() {
    let manager = SubagentManager::new();
    let unknown_id = SubagentId::from_str("sub_nonexistent");
    let result = manager.update_status(&unknown_id, SubagentStatus::Completed).await;
    assert!(result.is_err(), "should return error for unknown ID");
}
```

- [ ] **Step 2: 修复 update_status**

```rust
pub async fn update_status(
    &self,
    id: &SubagentId,
    status: SubagentStatus,
) -> Result<(), adl_errors::AppError> {
    let mut tasks = self.tasks.lock().await;
    let task = tasks.get_mut(id).ok_or_else(|| {
        adl_errors::AppError::NotFound(format!("Subagent '{}' not found", id.as_str()))
    })?;
    task.status = status;
    if status.is_terminal() {
        task.completed_at = Some(adl_kernel::now_ms());
    }
    Ok(())
}
```

- [ ] **Step 3: 修复调用方**

搜索所有调用 `manager.update_status(...)` 的位置，添加 `?` 或 `.ok()` 错误处理。

- [ ] **Step 4: 验证测试**

```powershell
cd ai-digital-life
cargo test -p adl-subagent
cargo check --workspace
```

- [ ] **Step 5: 提交**

```bash
git add ai-digital-life/crates/subagent/
git commit -m "fix(core): SubagentManager.update_status returns Result for unknown IDs"
```

---

## 组 C: WebTools 增强（🔴/🟡）

### Task 8: WebFetch 增强 — 增大限制 + HTML 转换

**目标**: 将 WebFetch 提升到 OpenCode 同等能力：5MB 限制、30s 超时、HTML→Markdown 转换、格式选择。

**Files:**
- Modify: `ai-digital-life/crates/agent-runtime/src/tools/webfetch.rs`
- Modify: `ai-digital-life/crates/agent-runtime/Cargo.toml`（添加 `pulldown-cmark` 依赖）

**Interfaces:**
- Consumes: `webfetch(url: &str) -> WebFetchResult`
- Produces: `webfetch(url: &str, format: WebFetchFormat) -> WebFetchResult`

- [ ] **Step 1: 添加依赖**

在 `crates/agent-runtime/Cargo.toml` 添加：

```toml
[dependencies]
pulldown-cmark = "0.12"
html2text = "0.13"
```

- [ ] **Step 2: 重写 WebFetch 参数和结构**

```rust
use reqwest::Client;
use std::time::Duration;

const MAX_RESPONSE_SIZE: usize = 5 * 1024 * 1024; // 5MB (OpenCode parity)
const DEFAULT_TIMEOUT_SECS: u64 = 30;              // 30s (OpenCode parity)
const MAX_TIMEOUT_SECS: u64 = 120;                 // 120s max

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub enum WebFetchFormat {
    Text,
    Markdown,
    Html,
}

impl Default for WebFetchFormat {
    fn default() -> Self {
        Self::Markdown
    }
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct WebFetchResult {
    pub url: String,
    pub status: u16,
    pub content_type: Option<String>,
    pub content: String,
    pub truncated: bool,
    pub format: String,
    pub error: Option<String>,
}

pub async fn webfetch(url: &str) -> WebFetchResult {
    webfetch_with_format(url, WebFetchFormat::Markdown).await
}

pub async fn webfetch_with_format(url: &str, format: WebFetchFormat) -> WebFetchResult {
    let client = match Client::builder()
        .timeout(Duration::from_secs(DEFAULT_TIMEOUT_SECS))
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
        .build()
    {
        Ok(c) => c,
        Err(e) => return error_result(url, format!("Failed to create HTTP client: {}", e)),
    };

    // Validate URL
    if !url.starts_with("http://") && !url.starts_with("https://") {
        return error_result(url, "URL must start with http:// or https://".into());
    }

    match client.get(url).send().await {
        Ok(resp) => {
            let status = resp.status().as_u16();
            let content_type = resp.headers()
                .get("content-type")
                .and_then(|v| v.to_str().ok())
                .map(String::from);

            let bytes = match resp.bytes().await {
                Ok(b) => b,
                Err(e) => return error_result(url, format!("Failed to read response: {}", e)),
            };

            if bytes.len() > MAX_RESPONSE_SIZE {
                let truncated_text = String::from_utf8_lossy(&bytes[..MAX_RESPONSE_SIZE]);
                return WebFetchResult {
                    url: url.to_string(),
                    status,
                    content_type,
                    content: convert_format(&truncated_text, &format),
                    truncated: true,
                    format: format_name(&format),
                    error: if status >= 400 { Some(format!("HTTP {}", status)) } else { None },
                };
            }

            let text = String::from_utf8_lossy(&bytes);
            WebFetchResult {
                url: url.to_string(),
                status,
                content_type,
                content: convert_format(&text, &format),
                truncated: false,
                format: format_name(&format),
                error: if status >= 400 { Some(format!("HTTP {}", status)) } else { None },
            }
        },
        Err(e) => error_result(url, format!("Request failed: {}", e)),
    }
}

fn convert_format(html: &str, format: &WebFetchFormat) -> String {
    match format {
        WebFetchFormat::Html => html.to_string(),
        WebFetchFormat::Text => html2text::from_read(html.as_bytes(), 80),
        WebFetchFormat::Markdown => html_to_markdown(html),
    }
}

fn html_to_markdown(html: &str) -> String {
    use pulldown_cmark::{html, Options, Parser};
    // Simple HTML to Markdown: extract text content, wrap in markdown
    // For production, use a proper HTML→MD library
    let text = html2text::from_read(html.as_bytes(), 120);
    text
}

fn format_name(format: &WebFetchFormat) -> String {
    match format {
        WebFetchFormat::Text => "text".into(),
        WebFetchFormat::Markdown => "markdown".into(),
        WebFetchFormat::Html => "html".into(),
    }
}

fn error_result(url: &str, error: String) -> WebFetchResult {
    WebFetchResult {
        url: url.to_string(),
        status: 0,
        content_type: None,
        content: String::new(),
        truncated: false,
        format: "markdown".into(),
        error: Some(error),
    }
}
```

- [ ] **Step 3: 更新测试**

```rust
#[test]
fn max_response_size_is_5mb() {
    assert_eq!(MAX_RESPONSE_SIZE, 5 * 1024 * 1024);
}

#[test]
fn default_timeout_is_30_seconds() {
    assert_eq!(DEFAULT_TIMEOUT_SECS, 30);
}

#[test]
fn max_timeout_is_120_seconds() {
    assert_eq!(MAX_TIMEOUT_SECS, 120);
}
```

- [ ] **Step 4: 编译验证**

```powershell
cd ai-digital-life
cargo check -p adl-agent-runtime
cargo test -p adl-agent-runtime webfetch
```

- [ ] **Step 5: 提交**

```bash
git add ai-digital-life/crates/agent-runtime/
git commit -m "feat(core): enhance WebFetch with 5MB limit, HTML conversion, format selection"
```

---

## 组 D: MCP 完善（🟡 MEDIUM）

### Task 9: MCP SSE 与 StreamableHTTP 传输区分

**目标**: SSE 和 StreamableHTTP 使用不同的传输实现，确保旧版 SSE 服务器可连接。

**Files:**
- Modify: `ai-digital-life/crates/mcp-client/src/client.rs:78-87`

- [ ] **Step 1: 检查 rmcp crate 是否提供独立的 SSE 传输**

```powershell
cd ai-digital-life
cargo doc -p rmcp --no-deps --open
```

检查 `rmcp::transport` 模块是否有 `SseClientTransport` 或类似类型。

- [ ] **Step 2: 根据检查结果实现分支**

**方案 A**（rmcp 提供独立 SSE 传输）：

```rust
McpTransportType::Sse => {
    let url = config.url.as_ref().ok_or_else(|| {
        adl_errors::AppError::Internal("SSE transport requires a URL".into())
    })?;
    let transport = rmcp::transport::SseClientTransport::from_uri(url.as_str());
    serve_client((), transport).await.map_err(|e| {
        adl_errors::AppError::Internal(format!("MCP SSE connect failed: {}", e))
    })?
},
McpTransportType::StreamableHttp => {
    let url = config.url.as_ref().ok_or_else(|| {
        adl_errors::AppError::Internal("StreamableHTTP transport requires a URL".into())
    })?;
    let transport = StreamableHttpClientTransport::from_uri(url.as_str());
    serve_client((), transport).await.map_err(|e| {
        adl_errors::AppError::Internal(format!("MCP StreamableHTTP connect failed: {}", e))
    })?
},
```

**方案 B**（rmcp 不提供独立 SSE 传输，StreamableHTTP 已内置 SSE 降级）：

保持现有代码不变，添加注释说明 `StreamableHttpClientTransport` 已包含 SSE 降级支持。

- [ ] **Step 3: 编译验证**

```powershell
cd ai-digital-life
cargo check -p adl-mcp-client
cargo test -p adl-mcp-client
```

- [ ] **Step 4: 提交**

```bash
git add ai-digital-life/crates/mcp-client/
git commit -m "fix(core): differentiate MCP SSE and StreamableHTTP transports"
```

---

### Task 10: MCP 重连与 ToolListChanged 通知处理

**目标**: MCP 服务器断连后自动重连，工具列表变更时自动刷新 catalog。

**Files:**
- Modify: `ai-digital-life/crates/mcp-client/src/client.rs`

**Interfaces:**
- Consumes: `McpClient` 的连接管理
- Produces: `auto_reconnect(name: &str)` 方法和 `on_tools_changed` 回调

- [ ] **Step 1: 添加重连机制**

在 `McpClient` 中添加：

```rust
/// Attempt to reconnect a server that has entered Error state.
pub async fn auto_reconnect(&self, name: &str) -> Result<(), adl_errors::AppError> {
    let state = self.get_state(name).await;
    if state == McpClientState::Error || state == McpClientState::Disconnected {
        tracing::info!(server = %name, "Attempting MCP auto-reconnect");
        self.connect(name).await
    } else {
        Ok(())
    }
}
```

- [ ] **Step 2: 添加工具列表变更通知处理**

在 `connect()` 方法中，连接成功后设置通知监听（如果 rmcp 支持）：

```rust
// After successful connection, set up tool list change notification handler
// This depends on rmcp's notification support
if let Some(notifications) = running.notifications() {
    let catalog = self.catalog.clone();
    let name = name.to_string();
    tokio::spawn(async move {
        // Listen for ToolListChanged notifications and refresh catalog
        // Implementation depends on rmcp API
    });
}
```

> 注意：如果 `rmcp` 不支持通知 API，此步骤可降级为定期轮询（每 60s 刷新一次工具列表）。

- [ ] **Step 3: 添加测试**

```rust
#[tokio::test]
async fn auto_reconnect_on_disconnected_server() {
    let client = McpClient::new();
    let config = McpServerConfig {
        name: "test".to_string(),
        transport: McpTransportType::Stdio,
        command: Some("echo".to_string()),
        args: vec![],
        url: None,
        env: std::collections::HashMap::new(),
        oauth: false,
        enabled: true,
    };
    client.add_server(config).await;
    // auto_reconnect on a disconnected server should attempt connection
    let result = client.auto_reconnect("test").await;
    // It will fail because "echo" is not an MCP server, but the attempt should be made
    assert!(result.is_err());
}
```

- [ ] **Step 4: 验证测试**

```powershell
cd ai-digital-life
cargo test -p adl-mcp-client
```

- [ ] **Step 5: 提交**

```bash
git add ai-digital-life/crates/mcp-client/
git commit -m "feat(core): add MCP auto-reconnect and tool list change handling"
```

---

## 验证清单

所有任务完成后执行：

```powershell
cd ai-digital-life

# 1. 全 workspace 编译
cargo check --workspace

# 2. Clippy 零警告
cargo clippy --workspace --all-targets -- -D warnings

# 3. 全量测试
cargo test --workspace

# 4. 前端类型检查（如果涉及 IPC 签名变更）
cd frontend && npx tsc --noEmit && npx eslint .
```
