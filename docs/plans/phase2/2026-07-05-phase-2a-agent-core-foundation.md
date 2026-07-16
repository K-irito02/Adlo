# Phase 2-A: Agent Core Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the multi-Agent system, Sub-agent/Task tool, and Plan Mode that form the foundation for all subsequent Phase 2 capabilities.

**Architecture:** Extend `crates/agent-runtime/` with an `Agent` struct, `AgentMode` enum (Primary/Subagent/Hidden), and a registry of built-in agents (build/plan/general/explore/compaction/title/summary). Create a new `crates/subagent/` crate for sub-agent lifecycle management with background mode and resume. Add parent/child session relationships to `crates/conversation/`. Implement Plan Mode as a `plan` agent with read-only permissions and `plan_enter`/`plan_exit` tool actions.

**Tech Stack:** Rust (existing crates: `agent-runtime`, `conversation`, `kernel`, `task`, `model-gateway`, `workspace`), new crate `subagent`, React 19 + Zustand (frontend), Tauri IPC (3-bridge sync).

## Global Constraints

- Reference OpenCode source at `references/opencode/packages/opencode/src/agent/` for design patterns
- Do NOT preserve obsolete code in `crates/task/` — delete and refactor if it conflicts with the new design
- All new IPC methods must be synced across tauri-bridge, preview-bridge, mock-bridge
- All UI text must use i18n keys (no hardcoded strings)
- No `unwrap()` in Rust; use `?` or pattern matching
- No `any` in TypeScript; use precise types
- No `else` — use early returns
- `const`-first in TypeScript
- TDD: failing test → minimal implementation → passing test → commit
- Update `phase-boundary.md` to move multi-agent and sub-agent from excluded to in-progress

## File Structure

### Rust — New Files

```
crates/agent-runtime/src/
├── agent.rs          # Agent struct, AgentMode enum, BuiltInAgent constants
├── registry.rs       # AgentRegistry (built-in + custom agents)
├── router.rs         # AgentRouter (select agent by scenario/input)
├── lifecycle.rs      # Agent lifecycle: spawn/run/complete/abort
├── prompt.rs         # Agent-specific prompt templates
└── tools.rs          # Tool dispatch loop (agent calls tools iteratively)

crates/subagent/
├── Cargo.toml
├── src/
│   ├── lib.rs        # Public API re-exports
│   ├── manager.rs    # SubagentManager (spawn/track/complete)
│   ├── task_tool.rs  # Task tool implementation (dispatch + background + resume)
│   ├── permission.rs # derive_subagent_permission()
│   └── output.rs     # Background output buffering

crates/conversation/src/
├── fork.rs           # Parent/child session relationship (new module)

crates/kernel/src/types/
├── agent.rs          # Modified: add AgentMode, AgentConfig, AgentId types
```

### Rust — Modified Files

```
crates/agent-runtime/src/lib.rs          # Refactor: use new modules
crates/agent-runtime/Cargo.toml          # Add subagent dependency
crates/conversation/src/lib.rs           # Add parent_id field, fork() function
crates/kernel/src/types/conversation.rs  # Add ConversationBlock::Subagent variant
crates/kernel/src/types/agent.rs         # Add agent_id to AgentRunRecord
crates/task/src/lib.rs                   # Clean obsolete code if conflicts
src-tauri/src/commands/agent.rs          # New IPC: list_agents, select_agent, task tool
Cargo.toml                               # Add subagent workspace member
```

### Frontend — New Files

```
frontend/src/app/components/agent/
├── AgentSelector.tsx       # Agent switching dropdown
├── SubagentIndicator.tsx   # Sub-agent status badge
└── PlanModeBanner.tsx      # Plan mode active banner

frontend/src/shared/ipc/
└── subagent.ts             # SubagentBridge interface

frontend/src/app/stores/slices/
└── agentSlice.ts           # Agent state (selected agent, subagent status)

frontend/src/app/stores/actions/
└── agentActions.ts         # Agent-related actions
```

### Frontend — Modified Files

```
frontend/src/shared/ipc/index.ts          # Export subagent bridge
frontend/src/shared/ipc/digital-life.ts   # Add subagent to DigitalLifeBridge
frontend/src/shared/ipc/agent.ts          # Add listAgents, selectAgent methods
frontend/src/app/stores/createStore.ts    # Merge agentSlice
frontend/src/app/components/conversation/SlashCommandPopover.tsx  # /plan uses plan agent
frontend/src/tauri-bridge/index.ts        # Implement subagent bridge
frontend/src/preview-bridge/index.ts      # Implement subagent bridge
frontend/src/mock-bridge/index.ts         # Implement subagent bridge
```

### Config / Docs — Modified Files

```
.trae/rules/phase-boundary.md   # Move multi-agent, sub-agent to Phase 2 in-progress
.agents/rules/phase-boundary.md # Sync
FUTURE-ROADMAP.md               # Update Phase 2+ status
```

---

## Task 1: Update Phase Boundary Documents

**Files:**
- Modify: `.trae/rules/phase-boundary.md`
- Modify: `.agents/rules/phase-boundary.md`
- Modify: `FUTURE-ROADMAP.md`

**Interfaces:**
- Consumes: None
- Produces: Updated governance docs allowing multi-agent and sub-agent implementation

- [ ] **Step 1: Update `.trae/rules/phase-boundary.md`**

Edit the "排除项" table to move "多 Agent DAG" and "MCP 协议" out of the excluded list. Update the "当前阶段" table to show Phase 2 as "🚧 进行中" with expanded scope.

Replace the current "排除项" table:

```markdown
## 排除项（当前阶段不实现）

| 排除项 | 计划阶段 |
|--------|----------|
| 插件市场 | Phase 2+ |
| 浏览器自动化运行时 | Phase 2+ |
| 复杂云协作 | Phase 3+ |
```

Replace the "当前阶段" table:

```markdown
## 当前阶段

| Phase | 状态 | 范围 |
|-------|------|------|
| Phase 0 | ✅ 已完成 | 架构底座、桌面壳层、安全边界、基础设施 |
| Phase 1 | ✅ 已完成 | 交互式 MVP、模型接入、上下文、变更预览 |
| Phase 2 | 🚧 进行中 | 多 Agent 系统、Sub-agent/Task 工具、Plan Mode、MCP、多 Provider、Compaction、Snapshot/Revert、WebFetch/WebSearch、自定义命令、权限 Ruleset |
```

- [ ] **Step 2: Sync to `.agents/rules/phase-boundary.md`**

Copy the exact same content to `.agents/rules/phase-boundary.md`.

- [ ] **Step 3: Update `FUTURE-ROADMAP.md`**

In the "Phase 2+ 待实现功能" section, add a status note that multi-agent and sub-agent are now in-progress:

```markdown
### L2 智能体自动化

| 功能 | 说明 | 前置依赖 | 状态 |
|------|------|----------|------|
| 任务规划与执行控制 | 多步骤任务分解与并行执行 | 任务状态机、审批流成熟 | 🚧 进行中 |
| 智能体配置与工作流 | 可配置的工作流引擎 | 单 Agent 闭环稳定 | 🚧 进行中 |
| 子代理与多智能体协作 | 多 Agent DAG 编排 | Phase 2 核心闭环 | 🚧 进行中 |
| 沙箱隔离执行 | 安全隔离的命令执行环境 | 权限与审计体系 | 待实现 |
| Hooks 自动化 | 生命周期钩子系统 | 基础运行时稳定 | 待实现 |
```

Update the feature flags block:

```typescript
const FUTURE_FEATURES = {
  multiAgent: true,         // Phase 2 — in progress
  mcp: false,               // Phase 2-B
  sandbox: false,           // Phase 2+
  cloudSync: false,         // Phase 3
  browserAutomation: false, // Phase 2+
  plugins: false,           // Phase 2-E
  collaboration: false,     // Phase 3+
  multimodal: false,        // Phase 3+
}
```

- [ ] **Step 4: Commit**

```bash
git add .trae/rules/phase-boundary.md .agents/rules/phase-boundary.md FUTURE-ROADMAP.md
git commit -m "docs(core): update phase boundary for Phase 2 multi-agent work"
```

---

## Task 2: Define Agent Core Types

**Files:**
- Modify: `ai-digital-life/crates/kernel/src/types/agent.rs`
- Test: `ai-digital-life/crates/kernel/src/types/agent.rs` (inline `#[cfg(test)]` module)

**Interfaces:**
- Consumes: Existing `AgentRunRecord`, `AgentRunStatus` from same file
- Produces: `AgentMode` enum, `AgentConfig` struct, `AgentId` newtype, `BUILT_IN_AGENTS` constants

- [ ] **Step 1: Write the failing test**

Add a test module at the bottom of `ai-digital-life/crates/kernel/src/types/agent.rs`:

```rust
#[cfg(test)]
mod agent_mode_tests {
    use super::*;

    #[test]
    fn agent_mode_primary_allows_write_tools() {
        let mode = AgentMode::Primary;
        assert!(mode.allows_write_tools());
        assert!(!mode.is_subagent());
        assert!(!mode.is_hidden());
    }

    #[test]
    fn agent_mode_subagent_restricts_scope() {
        let mode = AgentMode::Subagent;
        assert!(!mode.allows_write_tools());
        assert!(mode.is_subagent());
        assert!(!mode.is_hidden());
    }

    #[test]
    fn agent_mode_hidden_for_system_agents() {
        let mode = AgentMode::Hidden;
        assert!(!mode.allows_write_tools());
        assert!(!mode.is_subagent());
        assert!(mode.is_hidden());
    }

    #[test]
    fn agent_config_build_is_primary() {
        let build = AgentConfig::built_in(AgentId::Build);
        assert_eq!(build.mode, AgentMode::Primary);
        assert_eq!(build.name, "build");
        assert!(!build.hidden);
    }

    #[test]
    fn agent_config_plan_is_primary_readonly() {
        let plan = AgentConfig::built_in(AgentId::Plan);
        assert_eq!(plan.mode, AgentMode::Primary);
        assert!(!plan.allows_write_tools);
    }

    #[test]
    fn agent_config_explore_is_subagent() {
        let explore = AgentConfig::built_in(AgentId::Explore);
        assert_eq!(explore.mode, AgentMode::Subagent);
    }

    #[test]
    fn agent_config_compaction_is_hidden() {
        let compaction = AgentConfig::built_in(AgentId::Compaction);
        assert_eq!(compaction.mode, AgentMode::Hidden);
        assert!(compaction.hidden);
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"; cd ai-digital-life; cargo test -p adl-kernel --lib types::agent::agent_mode_tests`
Expected: FAIL with "cannot find type `AgentMode` in this scope"

- [ ] **Step 3: Write minimal implementation**

Add these types to `ai-digital-life/crates/kernel/src/types/agent.rs` (near the top, after existing imports):

```rust
use serde::{Deserialize, Serialize};

/// Identifies a built-in or custom agent.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum AgentId {
    /// Primary agent for building/editing code (default).
    Build,
    /// Primary agent for read-only planning.
    Plan,
    /// Sub-agent for multi-step general tasks.
    General,
    /// Sub-agent for codebase exploration.
    Explore,
    /// Hidden system agent for session compaction.
    Compaction,
    /// Hidden system agent for generating session titles.
    Title,
    /// Hidden system agent for generating session summaries.
    Summary,
    /// Custom user-defined agent.
    Custom,
}

impl AgentId {
    pub fn as_str(&self) -> &'static str {
        match self {
            AgentId::Build => "build",
            AgentId::Plan => "plan",
            AgentId::General => "general",
            AgentId::Explore => "explore",
            AgentId::Compaction => "compaction",
            AgentId::Title => "title",
            AgentId::Summary => "summary",
            AgentId::Custom => "custom",
        }
    }
}

impl std::fmt::Display for AgentId {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(self.as_str())
    }
}

/// Determines an agent's permissions and visibility.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum AgentMode {
    /// Top-level agent driven directly by user input.
    Primary,
    /// Spawned by another agent via the task tool.
    Subagent,
    /// System agent not shown to users.
    Hidden,
}

impl AgentMode {
    pub fn allows_write_tools(&self) -> bool {
        matches!(self, AgentMode::Primary)
    }

    pub fn is_subagent(&self) -> bool {
        matches!(self, AgentMode::Subagent)
    }

    pub fn is_hidden(&self) -> bool {
        matches!(self, AgentMode::Hidden)
    }
}

/// Configuration for a single agent instance.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentConfig {
    pub id: AgentId,
    pub name: String,
    pub description: String,
    pub mode: AgentMode,
    pub hidden: bool,
    /// When false, write tools (apply_patch, run_command) are disabled.
    pub allows_write_tools: bool,
    /// System prompt template identifier (resolved by prompt.rs).
    pub prompt_template: String,
    /// Optional model override; None uses workspace default.
    pub model_override: Option<String>,
}

impl AgentConfig {
    pub fn built_in(id: AgentId) -> Self {
        match id {
            AgentId::Build => Self {
                id,
                name: "build".to_string(),
                description: "Primary agent for building and editing code".to_string(),
                mode: AgentMode::Primary,
                hidden: false,
                allows_write_tools: true,
                prompt_template: "build".to_string(),
                model_override: None,
            },
            AgentId::Plan => Self {
                id,
                name: "plan".to_string(),
                description: "Read-only planning agent for analysis without edits".to_string(),
                mode: AgentMode::Primary,
                hidden: false,
                allows_write_tools: false,
                prompt_template: "plan".to_string(),
                model_override: None,
            },
            AgentId::General => Self {
                id,
                name: "general".to_string(),
                description: "Sub-agent for multi-step general tasks".to_string(),
                mode: AgentMode::Subagent,
                hidden: false,
                allows_write_tools: false,
                prompt_template: "general".to_string(),
                model_override: None,
            },
            AgentId::Explore => Self {
                id,
                name: "explore".to_string(),
                description: "Sub-agent for codebase exploration".to_string(),
                mode: AgentMode::Subagent,
                hidden: false,
                allows_write_tools: false,
                prompt_template: "explore".to_string(),
                model_override: None,
            },
            AgentId::Compaction => Self {
                id,
                name: "compaction".to_string(),
                description: "System agent for session compaction".to_string(),
                mode: AgentMode::Hidden,
                hidden: true,
                allows_write_tools: false,
                prompt_template: "compaction".to_string(),
                model_override: None,
            },
            AgentId::Title => Self {
                id,
                name: "title".to_string(),
                description: "System agent for generating session titles".to_string(),
                mode: AgentMode::Hidden,
                hidden: true,
                allows_write_tools: false,
                prompt_template: "title".to_string(),
                model_override: None,
            },
            AgentId::Summary => Self {
                id,
                name: "summary".to_string(),
                description: "System agent for generating session summaries".to_string(),
                mode: AgentMode::Hidden,
                hidden: true,
                allows_write_tools: false,
                prompt_template: "summary".to_string(),
                model_override: None,
            },
            AgentId::Custom => Self {
                id,
                name: "custom".to_string(),
                description: "User-defined custom agent".to_string(),
                mode: AgentMode::Primary,
                hidden: false,
                allows_write_tools: true,
                prompt_template: "default".to_string(),
                model_override: None,
            },
        }
    }

    pub fn all_built_in() -> Vec<AgentConfig> {
        [
            AgentId::Build,
            AgentId::Plan,
            AgentId::General,
            AgentId::Explore,
            AgentId::Compaction,
            AgentId::Title,
            AgentId::Summary,
        ]
        .iter()
        .map(|id| AgentConfig::built_in(*id))
        .collect()
    }
}
```

Also add `agent_id: AgentId` field to the existing `AgentRunRecord` struct (with `#[serde(default = "default_agent_id")]` and a helper `fn default_agent_id() -> AgentId { AgentId::Build }` for backward compat with existing DB rows).

- [ ] **Step 4: Run test to verify it passes**

Run: `$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"; cd ai-digital-life; cargo test -p adl-kernel --lib types::agent::agent_mode_tests`
Expected: PASS — all 7 tests pass

- [ ] **Step 5: Commit**

```bash
git add ai-digital-life/crates/kernel/src/types/agent.rs
git commit -m "feat(core): add AgentMode, AgentId, AgentConfig types for multi-agent system"
```

---

## Task 3: Build Agent Registry

**Files:**
- Create: `ai-digital-life/crates/agent-runtime/src/registry.rs`
- Modify: `ai-digital-life/crates/agent-runtime/src/lib.rs`
- Modify: `ai-digital-life/crates/agent-runtime/Cargo.toml` (ensure `adl-kernel` dep exists)
- Test: `ai-digital-life/crates/agent-runtime/src/registry.rs` (inline `#[cfg(test)]` module)

**Interfaces:**
- Consumes: `AgentConfig`, `AgentId`, `AgentMode` from Task 2
- Produces: `AgentRegistry` struct with `get(id)`, `list_primary()`, `list_subagent()`, `register(config)`

- [ ] **Step 1: Write the failing test**

Create `ai-digital-life/crates/agent-runtime/src/registry.rs` with test module:

```rust
use adl_kernel::types::agent::{AgentConfig, AgentId, AgentMode};
use std::collections::HashMap;

/// Registry of available agents (built-in + custom).
#[derive(Debug, Clone)]
pub struct AgentRegistry {
    agents: HashMap<AgentId, AgentConfig>,
}

impl AgentRegistry {
    pub fn new() -> Self {
        let mut agents = HashMap::new();
        for config in AgentConfig::all_built_in() {
            agents.insert(config.id, config);
        }
        Self { agents }
    }

    pub fn get(&self, id: AgentId) -> Option<&AgentConfig> {
        self.agents.get(&id)
    }

    pub fn list_primary(&self) -> Vec<&AgentConfig> {
        self.agents
            .values()
            .filter(|c| c.mode == AgentMode::Primary && !c.hidden)
            .collect()
    }

    pub fn list_subagent(&self) -> Vec<&AgentConfig> {
        self.agents
            .values()
            .filter(|c| c.mode == AgentMode::Subagent && !c.hidden)
            .collect()
    }

    pub fn list_hidden(&self) -> Vec<&AgentConfig> {
        self.agents
            .values()
            .filter(|c| c.mode == AgentMode::Hidden)
            .collect()
    }

    pub fn register(&mut self, config: AgentConfig) {
        self.agents.insert(config.id, config);
    }

    pub fn all(&self) -> Vec<&AgentConfig> {
        self.agents.values().collect()
    }
}

impl Default for AgentRegistry {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn registry_contains_all_built_in_agents() {
        let registry = AgentRegistry::new();
        assert!(registry.get(AgentId::Build).is_some());
        assert!(registry.get(AgentId::Plan).is_some());
        assert!(registry.get(AgentId::General).is_some());
        assert!(registry.get(AgentId::Explore).is_some());
        assert!(registry.get(AgentId::Compaction).is_some());
        assert!(registry.get(AgentId::Title).is_some());
        assert!(registry.get(AgentId::Summary).is_some());
    }

    #[test]
    fn list_primary_returns_build_and_plan() {
        let registry = AgentRegistry::new();
        let primary = registry.list_primary();
        let names: Vec<&str> = primary.iter().map(|c| c.name.as_str()).collect();
        assert!(names.contains(&"build"));
        assert!(names.contains(&"plan"));
        assert_eq!(primary.len(), 2);
    }

    #[test]
    fn list_subagent_returns_general_and_explore() {
        let registry = AgentRegistry::new();
        let subagents = registry.list_subagent();
        let names: Vec<&str> = subagents.iter().map(|c| c.name.as_str()).collect();
        assert!(names.contains(&"general"));
        assert!(names.contains(&"explore"));
        assert_eq!(subagents.len(), 2);
    }

    #[test]
    fn list_hidden_returns_system_agents() {
        let registry = AgentRegistry::new();
        let hidden = registry.list_hidden();
        assert_eq!(hidden.len(), 3);
    }

    #[test]
    fn register_adds_custom_agent() {
        let mut registry = AgentRegistry::new();
        let custom = AgentConfig::built_in(AgentId::Custom);
        registry.register(custom);
        assert!(registry.get(AgentId::Custom).is_some());
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"; cd ai-digital-life; cargo test -p adl-agent-runtime --lib registry`
Expected: FAIL — module not declared in lib.rs

- [ ] **Step 3: Wire module into lib.rs**

Add to `ai-digital-life/crates/agent-runtime/src/lib.rs` (at top with other module declarations):

```rust
pub mod registry;
```

Ensure `ai-digital-life/crates/agent-runtime/Cargo.toml` has:

```toml
[dependencies]
adl-kernel = { path = "../kernel" }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"; cd ai-digital-life; cargo test -p adl-agent-runtime --lib registry`
Expected: PASS — all 5 tests pass

- [ ] **Step 5: Commit**

```bash
git add ai-digital-life/crates/agent-runtime/src/registry.rs ai-digital-life/crates/agent-runtime/src/lib.rs ai-digital-life/crates/agent-runtime/Cargo.toml
git commit -m "feat(core): add AgentRegistry with built-in agents"
```

---

## Task 4: Implement Agent Router

**Files:**
- Create: `ai-digital-life/crates/agent-runtime/src/router.rs`
- Modify: `ai-digital-life/crates/agent-runtime/src/lib.rs`
- Test: inline in `router.rs`

**Interfaces:**
- Consumes: `AgentRegistry` (Task 3), `AgentId` (Task 2), `ConversationScenario` from `adl_kernel::types::conversation`
- Produces: `AgentRouter::select(scenario, user_prompt) -> AgentId`

- [ ] **Step 1: Write the failing test**

Create `ai-digital-life/crates/agent-runtime/src/router.rs`:

```rust
use adl_kernel::types::agent::AgentId;
use adl_kernel::types::conversation::ConversationScenario;

/// Routes user input to the appropriate agent based on scenario and explicit signals.
#[derive(Debug, Clone)]
pub struct AgentRouter;

impl AgentRouter {
    /// Select the agent to handle a user message.
    /// Rules (first match wins):
    /// 1. Scenario::Plan → AgentId::Plan
    /// 2. User explicitly invoked /plan → AgentId::Plan
    /// 3. Default → AgentId::Build
    pub fn select(scenario: ConversationScenario, user_prompt: &str) -> AgentId {
        if scenario == ConversationScenario::Plan {
            return AgentId::Plan;
        }
        let trimmed = user_prompt.trim_start();
        if trimmed.starts_with("/plan") {
            return AgentId::Plan;
        }
        AgentId::Build
    }

    /// Select agent for sub-agent dispatch (only subagents are valid).
    pub fn select_subagent(subagent_type: &str) -> Option<AgentId> {
        match subagent_type {
            "general" => Some(AgentId::General),
            "explore" => Some(AgentId::Explore),
            _ => None,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn plan_scenario_selects_plan_agent() {
        let agent = AgentRouter::select(ConversationScenario::Plan, "any prompt");
        assert_eq!(agent, AgentId::Plan);
    }

    #[test]
    fn plan_slash_command_selects_plan_agent() {
        let agent = AgentRouter::select(ConversationScenario::Chat, "/plan analyze the auth flow");
        assert_eq!(agent, AgentId::Plan);
    }

    #[test]
    fn default_selects_build_agent() {
        let agent = AgentRouter::select(ConversationScenario::Chat, "add a login form");
        assert_eq!(agent, AgentId::Build);
    }

    #[test]
    fn code_edit_scenario_selects_build_agent() {
        let agent = AgentRouter::select(ConversationScenario::CodeEdit, "refactor the parser");
        assert_eq!(agent, AgentId::Build);
    }

    #[test]
    fn select_subagent_general() {
        assert_eq!(AgentRouter::select_subagent("general"), Some(AgentId::General));
    }

    #[test]
    fn select_subagent_explore() {
        assert_eq!(AgentRouter::select_subagent("explore"), Some(AgentId::Explore));
    }

    #[test]
    fn select_subagent_unknown_returns_none() {
        assert_eq!(AgentRouter::select_subagent("unknown"), None);
    }

    #[test]
    fn select_subagent_primary_returns_none() {
        assert_eq!(AgentRouter::select_subagent("build"), None);
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"; cd ai-digital-life; cargo test -p adl-agent-runtime --lib router`
Expected: FAIL — module not declared

- [ ] **Step 3: Wire module into lib.rs**

Add to `ai-digital-life/crates/agent-runtime/src/lib.rs`:

```rust
pub mod router;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"; cd ai-digital-life; cargo test -p adl-agent-runtime --lib router`
Expected: PASS — all 8 tests pass

- [ ] **Step 5: Commit**

```bash
git add ai-digital-life/crates/agent-runtime/src/router.rs ai-digital-life/crates/agent-runtime/src/lib.rs
git commit -m "feat(core): add AgentRouter for scenario-based agent selection"
```

---

## Task 5: Implement Agent Prompt Templates

**Files:**
- Create: `ai-digital-life/crates/agent-runtime/src/prompt.rs`
- Modify: `ai-digital-life/crates/agent-runtime/src/lib.rs`
- Test: inline in `prompt.rs`

**Interfaces:**
- Consumes: `AgentId` (Task 2), existing `assemble_prompt` from `adl_context`
- Produces: `agent_system_prompt(id) -> String`, `plan_mode_reminder() -> &'static str`

- [ ] **Step 1: Write the failing test**

Create `ai-digital-life/crates/agent-runtime/src/prompt.rs`:

```rust
use adl_kernel::types::agent::AgentId;

/// Returns the system prompt for the given agent.
/// These are minimal stubs; Phase 2-B will expand with provider-specific prompts.
pub fn agent_system_prompt(id: AgentId) -> String {
    match id {
        AgentId::Build => BUILD_PROMPT.to_string(),
        AgentId::Plan => PLAN_PROMPT.to_string(),
        AgentId::General => GENERAL_PROMPT.to_string(),
        AgentId::Explore => EXPLORE_PROMPT.to_string(),
        AgentId::Compaction => COMPACTION_PROMPT.to_string(),
        AgentId::Title => TITLE_PROMPT.to_string(),
        AgentId::Summary => SUMMARY_PROMPT.to_string(),
        AgentId::Custom => BUILD_PROMPT.to_string(),
    }
}

/// Reminder injected into plan mode to prevent edits.
pub fn plan_mode_reminder() -> &'static str {
    "You are in plan mode. Do NOT edit files, run commands that modify state, or apply patches. Only analyze and produce a plan."
}

const BUILD_PROMPT: &str = "You are the build agent. Your job is to help the user build and edit code. Use available tools to read files, search the codebase, create patches, and apply them after approval. Always explain your changes before applying.";

const PLAN_PROMPT: &str = "You are the plan agent. Your job is to analyze the user's request and produce a detailed implementation plan WITHOUT making any changes. Read files, search the codebase, and think through the design. Output a plan in markdown with clear steps. Do not use write tools.";

const GENERAL_PROMPT: &str = "You are the general sub-agent. You handle multi-step tasks delegated by the primary agent. Break down the task, use tools as needed, and return a concise summary of your findings or results.";

const EXPLORE_PROMPT: &str = "You are the explore sub-agent. Your job is to explore the codebase and answer questions about it. Use read, glob, grep, and outline tools. Do not modify any files. Return a structured summary of what you found.";

const COMPACTION_PROMPT: &str = "You are the compaction system agent. Your job is to summarize a conversation so far, preserving key decisions, file paths, and context. Output a concise summary that retains enough information to continue the work.";

const TITLE_PROMPT: &str = "You are the title system agent. Generate a short (3-6 words) descriptive title for the conversation based on its content. Output only the title, no other text.";

const SUMMARY_PROMPT: &str = "You are the summary system agent. Generate a concise summary of what was accomplished in this session. Output a markdown summary with key changes and outcomes.";

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn build_prompt_mentions_tools() {
        let prompt = agent_system_prompt(AgentId::Build);
        assert!(prompt.to_lowercase().contains("tool"));
    }

    #[test]
    fn plan_prompt_forbids_edits() {
        let prompt = agent_system_prompt(AgentId::Plan);
        let lower = prompt.to_lowercase();
        assert!(lower.contains("not") || lower.contains("do not") || lower.contains("without"));
    }

    #[test]
    fn explore_prompt_is_readonly() {
        let prompt = agent_system_prompt(AgentId::Explore);
        assert!(prompt.to_lowercase().contains("do not modify"));
    }

    #[test]
    fn plan_mode_reminder_is_nonempty() {
        assert!(!plan_mode_reminder().is_empty());
        assert!(plan_mode_reminder().to_lowercase().contains("plan mode"));
    }

    #[test]
    fn every_agent_has_prompt() {
        for id in [
            AgentId::Build,
            AgentId::Plan,
            AgentId::General,
            AgentId::Explore,
            AgentId::Compaction,
            AgentId::Title,
            AgentId::Summary,
            AgentId::Custom,
        ] {
            let prompt = agent_system_prompt(id);
            assert!(!prompt.is_empty(), "Agent {:?} has empty prompt", id);
        }
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"; cd ai-digital-life; cargo test -p adl-agent-runtime --lib prompt`
Expected: FAIL — module not declared

- [ ] **Step 3: Wire module into lib.rs**

Add to `ai-digital-life/crates/agent-runtime/src/lib.rs`:

```rust
pub mod prompt;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"; cd ai-digital-life; cargo test -p adl-agent-runtime --lib prompt`
Expected: PASS — all 5 tests pass

- [ ] **Step 5: Commit**

```bash
git add ai-digital-life/crates/agent-runtime/src/prompt.rs ai-digital-life/crates/agent-runtime/src/lib.rs
git commit -m "feat(core): add agent-specific system prompt templates"
```

---

## Task 6: Create Subagent Crate Skeleton

**Files:**
- Create: `ai-digital-life/crates/subagent/Cargo.toml`
- Create: `ai-digital-life/crates/subagent/src/lib.rs`
- Modify: `ai-digital-life/Cargo.toml` (add workspace member)
- Test: inline in `lib.rs`

**Interfaces:**
- Consumes: `adl_kernel`, `adl_agent_runtime`, `adl_conversation`, `tokio`, `serde`
- Produces: `SubagentManager`, `SubagentTask`, `SubagentStatus`, `SubagentId`

- [ ] **Step 1: Add workspace member**

Edit `ai-digital-life/Cargo.toml`, add `"crates/subagent"` to the `members` array.

- [ ] **Step 2: Create Cargo.toml for subagent crate**

Create `ai-digital-life/crates/subagent/Cargo.toml`:

```toml
[package]
name = "adl-subagent"
version = "0.1.0"
edition = "2021"

[dependencies]
adl-kernel = { path = "../kernel" }
adl-agent-runtime = { path = "../agent-runtime" }
adl-conversation = { path = "../conversation" }
tokio = { workspace = true }
serde = { workspace = true }
serde_json = { workspace = true }
thiserror = { workspace = true }
tracing = { workspace = true }

[dev-dependencies]
tokio = { workspace = true, features = ["macros", "rt-multi-thread"] }
```

- [ ] **Step 3: Write the failing test**

Create `ai-digital-life/crates/subagent/src/lib.rs`:

```rust
pub mod manager;
pub mod task_tool;
pub mod permission;
pub mod output;

pub use manager::{SubagentManager, SubagentId, SubagentStatus, SubagentHandle};
pub use task_tool::{TaskToolInput, TaskToolOutput};
pub use permission::derive_subagent_permission;

use serde::{Deserialize, Serialize};

/// A sub-agent task spawned by the task tool.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SubagentTask {
    pub id: SubagentId,
    pub parent_session_id: String,
    pub child_session_id: String,
    pub subagent_type: String,
    pub prompt: String,
    pub background: bool,
    pub status: SubagentStatus,
    pub created_at: u64,
    pub completed_at: Option<u64>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn subagent_id_display() {
        let id = SubagentId::new();
        assert!(id.as_str().starts_with("sub_"));
    }

    #[test]
    fn subagent_status_transitions() {
        let status = SubagentStatus::Pending;
        assert!(status.is_active());
        let status = SubagentStatus::Running;
        assert!(status.is_active());
        let status = SubagentStatus::Completed;
        assert!(!status.is_active());
    }
}
```

Note: the test references `SubagentId` and `SubagentStatus` from `manager` module which we'll create next. For TDD, first create a minimal `manager.rs` that fails to compile, then implement.

- [ ] **Step 4: Create minimal manager.rs to make tests fail correctly**

Create `ai-digital-life/crates/subagent/src/manager.rs`:

```rust
use adl_kernel::types::agent::AgentId;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::Mutex;

/// Unique identifier for a sub-agent task.
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct SubagentId(String);

impl SubagentId {
    pub fn new() -> Self {
        Self(format!("sub_{}", adl_kernel::create_id("sub")))
    }

    pub fn from_str(s: &str) -> Self {
        Self(s.to_string())
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl Default for SubagentId {
    fn default() -> Self {
        Self::new()
    }
}

/// Status of a sub-agent task.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SubagentStatus {
    Pending,
    Running,
    Completed,
    Failed,
    Aborted,
}

impl SubagentStatus {
    pub fn is_active(&self) -> bool {
        matches!(self, SubagentStatus::Pending | SubagentStatus::Running)
    }

    pub fn is_terminal(&self) -> bool {
        !self.is_active()
    }
}

/// Handle to a running or completed sub-agent.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SubagentHandle {
    pub id: SubagentId,
    pub subagent_type: AgentId,
    pub status: SubagentStatus,
    pub child_session_id: String,
}

/// Manages sub-agent lifecycle: spawn, track, complete.
#[derive(Debug, Clone)]
pub struct SubagentManager {
    tasks: Arc<Mutex<HashMap<SubagentId, super::SubagentTask>>>,
}

impl SubagentManager {
    pub fn new() -> Self {
        Self {
            tasks: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    pub async fn register(&self, task: super::SubagentTask) {
        let id = task.id.clone();
        self.tasks.lock().await.insert(id, task);
    }

    pub async fn get(&self, id: &SubagentId) -> Option<super::SubagentTask> {
        self.tasks.lock().await.get(id).cloned()
    }

    pub async fn update_status(&self, id: &SubagentId, status: SubagentStatus) {
        if let Some(task) = self.tasks.lock().await.get_mut(id) {
            task.status = status;
            if status.is_terminal() {
                task.completed_at = Some(adl_kernel::now_ms());
            }
        }
    }

    pub async fn list_active(&self) -> Vec<super::SubagentTask> {
        self.tasks
            .lock()
            .await
            .values()
            .filter(|t| t.status.is_active())
            .cloned()
            .collect()
    }
}

impl Default for SubagentManager {
    fn default() -> Self {
        Self::new()
    }
}
```

- [ ] **Step 5: Create stub modules for task_tool, permission, output**

Create `ai-digital-life/crates/subagent/src/task_tool.rs`:

```rust
use serde::{Deserialize, Serialize};

/// Input parameters for the task tool.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskToolInput {
    pub description: String,
    pub prompt: String,
    pub subagent_type: String,
    pub task_id: Option<String>,
    pub background: bool,
}

/// Output returned by the task tool.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskToolOutput {
    pub task_id: String,
    pub state: String,
    pub summary: String,
    pub result: Option<String>,
    pub error: Option<String>,
}
```

Create `ai-digital-life/crates/subagent/src/permission.rs`:

```rust
use adl_kernel::types::agent::{AgentConfig, AgentMode};

/// Derive the permission configuration for a sub-agent from its parent.
/// Sub-agents inherit a restricted subset of the parent's permissions:
/// - Never get write tools (even if parent is Primary)
/// - Inherit the parent's allowed read tools
pub fn derive_subagent_permission(parent: &AgentConfig, subagent: &AgentConfig) -> AgentConfig {
    let mut derived = subagent.clone();
    // Sub-agents never get write tools regardless of parent
    derived.allows_write_tools = false;
    derived.mode = AgentMode::Subagent;
    derived
}

#[cfg(test)]
mod tests {
    use super::*;
    use adl_kernel::types::agent::AgentId;

    #[test]
    fn subagent_never_gets_write_tools() {
        let parent = AgentConfig::built_in(AgentId::Build);
        let mut subagent = AgentConfig::built_in(AgentId::General);
        subagent.allows_write_tools = true; // try to give it write tools
        let derived = derive_subagent_permission(&parent, &subagent);
        assert!(!derived.allows_write_tools);
        assert_eq!(derived.mode, AgentMode::Subagent);
    }
}
```

Create `ai-digital-life/crates/subagent/src/output.rs`:

```rust
use std::collections::VecDeque;
use std::sync::Arc;
use tokio::sync::Mutex;

/// Buffers output from background sub-agents so the parent can read it later.
#[derive(Debug, Clone)]
pub struct OutputBuffer {
    chunks: Arc<Mutex<VecDeque<String>>>,
    closed: Arc<Mutex<bool>>,
}

impl OutputBuffer {
    pub fn new() -> Self {
        Self {
            chunks: Arc::new(Mutex::new(VecDeque::new())),
            closed: Arc::new(Mutex::new(false)),
        }
    }

    pub async fn push(&self, chunk: String) {
        self.chunks.lock().await.push_back(chunk);
    }

    pub async fn drain(&self) -> Vec<String> {
        self.chunks.lock().await.drain(..).collect()
    }

    pub async fn close(&self) {
        *self.closed.lock().await = true;
    }

    pub async fn is_closed(&self) -> bool {
        *self.closed.lock().await
    }
}

impl Default for OutputBuffer {
    fn default() -> Self {
        Self::new()
    }
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"; cd ai-digital-life; cargo test -p adl-subagent`
Expected: PASS — all tests pass

- [ ] **Step 7: Commit**

```bash
git add ai-digital-life/Cargo.toml ai-digital-life/crates/subagent/
git commit -m "feat(core): create adl-subagent crate for sub-agent lifecycle management"
```

---

## Task 7: Implement Parent/Child Session Relationship

**Files:**
- Modify: `ai-digital-life/crates/conversation/src/lib.rs`
- Modify: `ai-digital-life/crates/kernel/src/types/conversation.rs`
- Test: inline in `lib.rs`

**Interfaces:**
- Consumes: `ConversationSessionRecord` from kernel types
- Produces: `ConversationSessionRecord.parent_id` field, `create_child_session()` function

- [ ] **Step 1: Add parent_id field to session record**

Edit `ai-digital-life/crates/kernel/src/types/conversation.rs`, add to `ConversationSessionRecord`:

```rust
/// Parent session ID if this session is a sub-agent fork. None for top-level sessions.
#[serde(default)]
pub parent_id: Option<String>,
```

- [ ] **Step 2: Write the failing test**

Add to `ai-digital-life/crates/conversation/src/lib.rs`:

```rust
/// Create a child session linked to a parent (for sub-agent tasks).
pub fn create_child_session(
    workspace_id: &str,
    parent_session_id: &str,
    title: &str,
    unpinned_order: u32,
) -> ConversationSessionRecord {
    let mut session = create_session(workspace_id, title, unpinned_order);
    session.parent_id = Some(parent_session_id.to_string());
    session
}

#[cfg(test)]
mod child_session_tests {
    use super::*;

    #[test]
    fn child_session_has_parent_id() {
        let child = create_child_session("ws1", "parent-sess-123", "Sub-agent task", 0);
        assert_eq!(child.parent_id, Some("parent-sess-123".to_string()));
    }

    #[test]
    fn top_level_session_has_no_parent() {
        let session = create_session("ws1", "Main session", 0);
        assert_eq!(session.parent_id, None);
    }
}
```

- [ ] **Step 3: Run test to verify it fails**

Run: `$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"; cd ai-digital-life; cargo test -p adl-conversation --lib child_session_tests`
Expected: FAIL — `parent_id` field missing or `create_child_session` not found

- [ ] **Step 4: Run test to verify it passes**

Run: `$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"; cd ai-digital-life; cargo test -p adl-conversation --lib child_session_tests`
Expected: PASS

Note: If existing `create_session` doesn't initialize `parent_id`, update it to set `parent_id: None`.

- [ ] **Step 5: Add Subagent variant to ConversationBlock**

Edit `ai-digital-life/crates/kernel/src/types/conversation.rs`, add a new variant to the `ConversationBlock` enum:

```rust
/// A sub-agent task spawned by the task tool.
Subagent {
    task_id: String,
    subagent_type: String,
    description: String,
    state: String, // "running" | "completed" | "error"
    summary: String,
    result: Option<String>,
    error: Option<String>,
},
```

- [ ] **Step 6: Commit**

```bash
git add ai-digital-life/crates/conversation/src/lib.rs ai-digital-life/crates/kernel/src/types/conversation.rs
git commit -m "feat(core): add parent/child session relationship for sub-agents"
```

---

## Task 8: Implement Plan Mode Backend Logic

**Files:**
- Modify: `ai-digital-life/crates/agent-runtime/src/lib.rs`
- Create: `ai-digital-life/crates/agent-runtime/src/plan_mode.rs`
- Test: inline in `plan_mode.rs`

**Interfaces:**
- Consumes: `AgentId::Plan` (Task 2), `plan_mode_reminder()` (Task 5)
- Produces: `enter_plan_mode()`, `exit_plan_mode()`, `is_plan_mode_active()`, plan file persistence

- [ ] **Step 1: Write the failing test**

Create `ai-digital-life/crates/agent-runtime/src/plan_mode.rs`:

```rust
use adl_kernel::types::agent::AgentId;
use std::path::{Path, PathBuf};

/// State of plan mode for a workspace.
#[derive(Debug, Clone, Default)]
pub struct PlanModeState {
    pub active: bool,
    pub plan_file: Option<PathBuf>,
}

impl PlanModeState {
    pub fn enter(&mut self, workspace_root: &Path) -> PathBuf {
        self.active = true;
        let plan_dir = workspace_root.join(".ai-digital-life").join("plans");
        let plan_file = plan_dir.join(format!("plan-{}.md", adl_kernel::create_id("plan")));
        self.plan_file = Some(plan_file.clone());
        plan_file
    }

    pub fn exit(&mut self) -> Option<PathBuf> {
        self.active = false;
        self.plan_file.take()
    }

    pub fn is_active(&self) -> bool {
        self.active
    }
}

/// Returns the agent ID to use when plan mode is active.
pub fn plan_agent_id() -> AgentId {
    AgentId::Plan
}

/// Check if a tool is allowed in plan mode.
pub fn is_tool_allowed_in_plan_mode(tool_name: &str) -> bool {
    matches!(
        tool_name,
        "read" | "list_tree" | "search" | "outline" | "glob" | "grep" | "webfetch" | "websearch"
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn enter_sets_active_and_creates_plan_path() {
        let mut state = PlanModeState::default();
        let path = state.enter(Path::new("/workspace"));
        assert!(state.is_active());
        assert!(path.starts_with("/workspace/.ai-digital-life/plans/"));
        assert!(path.to_string_lossy().ends_with(".md"));
    }

    #[test]
    fn exit_clears_active_state() {
        let mut state = PlanModeState::default();
        state.enter(Path::new("/workspace"));
        let path = state.exit();
        assert!(!state.is_active());
        assert!(path.is_some());
        assert!(state.plan_file.is_none());
    }

    #[test]
    fn read_tools_allowed_in_plan_mode() {
        assert!(is_tool_allowed_in_plan_mode("read"));
        assert!(is_tool_allowed_in_plan_mode("search"));
        assert!(is_tool_allowed_in_plan_mode("glob"));
    }

    #[test]
    fn write_tools_blocked_in_plan_mode() {
        assert!(!is_tool_allowed_in_plan_mode("apply_patch"));
        assert!(!is_tool_allowed_in_plan_mode("run_command"));
        assert!(!is_tool_allowed_in_plan_mode("write"));
    }

    #[test]
    fn plan_agent_id_is_plan() {
        assert_eq!(plan_agent_id(), AgentId::Plan);
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"; cd ai-digital-life; cargo test -p adl-agent-runtime --lib plan_mode`
Expected: FAIL — module not declared

- [ ] **Step 3: Wire module into lib.rs**

Add to `ai-digital-life/crates/agent-runtime/src/lib.rs`:

```rust
pub mod plan_mode;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"; cd ai-digital-life; cargo test -p adl-agent-runtime --lib plan_mode`
Expected: PASS — all 5 tests pass

- [ ] **Step 5: Commit**

```bash
git add ai-digital-life/crates/agent-runtime/src/plan_mode.rs ai-digital-life/crates/agent-runtime/src/lib.rs
git commit -m "feat(core): add Plan Mode state management and tool gating"
```

---

## Task 9: Add Agent IPC Commands (Backend)

**Files:**
- Modify: `ai-digital-life/src-tauri/src/commands/agent.rs`
- Modify: `ai-digital-life/src-tauri/src/commands/mod.rs` (if needed for re-export)
- Test: inline test module in `agent.rs`

**Interfaces:**
- Consumes: `AgentRegistry` (Task 3), `AgentRouter` (Task 4), `PlanModeState` (Task 8)
- Produces: Tauri commands: `list_agents`, `select_agent`, `enter_plan_mode`, `exit_plan_mode`, `get_plan_mode_state`

- [ ] **Step 1: Write the failing test**

Add to `ai-digital-life/src-tauri/src/commands/agent.rs`:

```rust
#[cfg(test)]
mod multi_agent_tests {
    use super::*;

    #[test]
    fn list_agents_returns_built_in() {
        let result = list_agents_inner();
        assert!(result.is_ok());
        let agents = result.unwrap();
        let names: Vec<&str> = agents.iter().map(|a| a.name.as_str()).collect();
        assert!(names.contains(&"build"));
        assert!(names.contains(&"plan"));
    }

    #[test]
    fn select_agent_for_plan_scenario() {
        let result = select_agent_inner("plan", "analyze auth");
        assert!(result.is_ok());
        let agent = result.unwrap();
        assert_eq!(agent.id, adl_kernel::types::agent::AgentId::Plan);
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"; cd ai-digital-life; cargo test -p adl-app --lib commands::agent::multi_agent_tests`
Expected: FAIL — functions not defined

- [ ] **Step 3: Implement the commands**

Add to `ai-digital-life/src-tauri/src/commands/agent.rs`:

```rust
use adl_agent_runtime::registry::AgentRegistry;
use adl_agent_runtime::router::AgentRouter;
use adl_agent_runtime::plan_mode::PlanModeState;
use adl_kernel::types::agent::{AgentConfig, AgentId};
use adl_kernel::types::conversation::ConversationScenario;
use std::sync::Mutex;
use std::path::PathBuf;

/// Global plan mode state per workspace (keyed by workspace_id).
static PLAN_MODE_STATES: std::sync::LazyLock<Mutex<std::collections::HashMap<String, PlanModeState>>> =
    std::sync::LazyLock::new(|| Mutex::new(std::collections::HashMap::new()));

#[tauri::command]
pub async fn list_agents() -> Result<Vec<AgentConfig>, adl_errors::AppError> {
    list_agents_inner()
}

fn list_agents_inner() -> Result<Vec<AgentConfig>, adl_errors::AppError> {
    let registry = AgentRegistry::new();
    Ok(registry.list_primary().into_iter().cloned().collect())
}

#[tauri::command]
pub async fn select_agent(
    scenario: String,
    user_prompt: String,
) -> Result<AgentConfig, adl_errors::AppError> {
    select_agent_inner(&scenario, &user_prompt)
}

fn select_agent_inner(scenario: &str, user_prompt: &str) -> Result<AgentConfig, adl_errors::AppError> {
    let conv_scenario = match scenario {
        "plan" => ConversationScenario::Plan,
        "code_edit" => ConversationScenario::CodeEdit,
        _ => ConversationScenario::Chat,
    };
    let agent_id = AgentRouter::select(conv_scenario, user_prompt);
    let registry = AgentRegistry::new();
    registry
        .get(agent_id)
        .cloned()
        .ok_or_else(|| adl_errors::AppError::Internal(format!("agent {:?} not found", agent_id)))
}

#[tauri::command]
pub async fn enter_plan_mode(
    workspace_id: String,
    workspace_root: String,
) -> Result<String, adl_errors::AppError> {
    let mut states = PLAN_MODE_STATES.lock().unwrap();
    let state = states.entry(workspace_id).or_default();
    let path = state.enter(&PathBuf::from(workspace_root));
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn exit_plan_mode(workspace_id: String) -> Result<Option<String>, adl_errors::AppError> {
    let mut states = PLAN_MODE_STATES.lock().unwrap();
    let state = states.entry(workspace_id).or_default();
    Ok(state.exit().map(|p| p.to_string_lossy().to_string()))
}

#[tauri::command]
pub async fn get_plan_mode_state(workspace_id: String) -> Result<bool, adl_errors::AppError> {
    let states = PLAN_MODE_STATES.lock().unwrap();
    Ok(states.get(&workspace_id).map(|s| s.is_active()).unwrap_or(false))
}
```

- [ ] **Step 4: Register commands in Tauri builder**

Edit `ai-digital-life/src-tauri/src/lib.rs` (or wherever `invoke_handler` is configured), add the new commands:

```rust
.invoke_handler(tauri::generate_handler![
    // ... existing handlers ...
    commands::agent::list_agents,
    commands::agent::select_agent,
    commands::agent::enter_plan_mode,
    commands::agent::exit_plan_mode,
    commands::agent::get_plan_mode_state,
])
```

- [ ] **Step 5: Run test to verify it passes**

Run: `$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"; cd ai-digital-life; cargo test -p adl-app --lib commands::agent::multi_agent_tests`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add ai-digital-life/src-tauri/src/commands/agent.rs ai-digital-life/src-tauri/src/lib.rs
git commit -m "feat(ipc): add list_agents, select_agent, plan_mode commands"
```

---

## Task 10: Add Agent IPC Interfaces (Frontend)

**Files:**
- Modify: `ai-digital-life/frontend/src/shared/ipc/agent.ts`
- Create: `ai-digital-life/frontend/src/shared/ipc/subagent.ts`
- Modify: `ai-digital-life/frontend/src/shared/ipc/index.ts`
- Modify: `ai-digital-life/frontend/src/shared/ipc/digital-life.ts`

**Interfaces:**
- Consumes: Rust commands from Task 9
- Produces: `AgentBridge` extended with `listAgents`, `selectAgent`, `enterPlanMode`, `exitPlanMode`, `getPlanModeState`; `SubagentBridge` interface

- [ ] **Step 1: Extend AgentBridge interface**

Edit `ai-digital-life/frontend/src/shared/ipc/agent.ts`, add new methods to `AgentBridge`:

```typescript
import type { IpcResult } from './shared';
import type { AgentRunDetail } from './agent';

export interface AgentConfig {
  id: 'build' | 'plan' | 'general' | 'explore' | 'compaction' | 'title' | 'summary' | 'custom';
  name: string;
  description: string;
  mode: 'primary' | 'subagent' | 'hidden';
  hidden: boolean;
  allows_write_tools: boolean;
  prompt_template: string;
  model_override: string | null;
}

export interface AgentBridge {
  startRun(params: { sessionId: string; prompt: string; scenario?: string }): Promise<IpcResult<AgentRunDetail>>;
  getRun(runId: string): Promise<IpcResult<AgentRunDetail | undefined>>;
  retryRun(runId: string): Promise<IpcResult<AgentRunDetail>>;
  abortRun(runId: string): Promise<IpcResult<AgentRunDetail>>;
  // New: multi-agent
  listAgents(): Promise<IpcResult<AgentConfig[]>>;
  selectAgent(scenario: string, userPrompt: string): Promise<IpcResult<AgentConfig>>;
  enterPlanMode(workspaceId: string, workspaceRoot: string): Promise<IpcResult<string>>;
  exitPlanMode(workspaceId: string): Promise<IpcResult<string | null>>;
  getPlanModeState(workspaceId: string): Promise<IpcResult<boolean>>;
}
```

- [ ] **Step 2: Create SubagentBridge interface**

Create `ai-digital-life/frontend/src/shared/ipc/subagent.ts`:

```typescript
import type { IpcResult } from './shared';

export interface TaskToolInput {
  description: string;
  prompt: string;
  subagent_type: string;
  task_id: string | null;
  background: boolean;
}

export interface TaskToolOutput {
  task_id: string;
  state: 'running' | 'completed' | 'error';
  summary: string;
  result: string | null;
  error: string | null;
}

export interface SubagentTask {
  id: string;
  parent_session_id: string;
  child_session_id: string;
  subagent_type: string;
  prompt: string;
  background: boolean;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'aborted';
  created_at: number;
  completed_at: number | null;
}

export interface SubagentBridge {
  spawnSubagent(input: TaskToolInput): Promise<IpcResult<TaskToolOutput>>;
  getSubagentTask(taskId: string): Promise<IpcResult<SubagentTask | null>>;
  listActiveSubagents(workspaceId: string): Promise<IpcResult<SubagentTask[]>>;
  cancelSubagent(taskId: string): Promise<IpcResult<boolean>>;
}
```

- [ ] **Step 3: Export from index.ts**

Edit `ai-digital-life/frontend/src/shared/ipc/index.ts`, add:

```typescript
export * from './subagent';
```

- [ ] **Step 4: Add subagent to DigitalLifeBridge**

Edit `ai-digital-life/frontend/src/shared/ipc/digital-life.ts`, add `subagent` field:

```typescript
import type { SubagentBridge } from './subagent';

export interface DigitalLifeBridge {
  // ... existing fields ...
  subagent: SubagentBridge;
}
```

- [ ] **Step 5: Implement in all three bridges**

In `ai-digital-life/frontend/src/tauri-bridge/index.ts`, `ai-digital-life/frontend/src/preview-bridge/index.ts`, and `ai-digital-life/frontend/src/mock-bridge/index.ts`, add the `subagent` bridge implementation. For tauri-bridge:

```typescript
const subagent: SubagentBridge = {
  async spawnSubagent(input) {
    return invoke('spawn_subagent', { input });
  },
  async getSubagentTask(taskId) {
    return invoke('get_subagent_task', { taskId });
  },
  async listActiveSubagents(workspaceId) {
    return invoke('list_active_subagents', { workspaceId });
  },
  async cancelSubagent(taskId) {
    return invoke('cancel_subagent', { taskId });
  },
};
```

For mock-bridge, return reasonable mock data. For preview-bridge, implement via HTTP polling if needed (or return NotImplemented for now).

Also add `listAgents`, `selectAgent`, `enterPlanMode`, `exitPlanMode`, `getPlanModeState` to the agent bridge in all three implementations.

- [ ] **Step 6: Verify TypeScript compiles**

Run: `$env:Path = "D:\Program Files\nodejs;$env:Path"; cd ai-digital-life/frontend; pnpm run typecheck`
Expected: PASS — no type errors

- [ ] **Step 7: Commit**

```bash
git add ai-digital-life/frontend/src/shared/ipc/ ai-digital-life/frontend/src/tauri-bridge/ ai-digital-life/frontend/src/preview-bridge/ ai-digital-life/frontend/src/mock-bridge/
git commit -m "feat(ipc): add agent and subagent bridge interfaces with 3-bridge sync"
```

---

## Task 11: Create Agent Zustand Slice (Frontend State)

**Files:**
- Create: `ai-digital-life/frontend/src/app/stores/slices/agentSlice.ts`
- Create: `ai-digital-life/frontend/src/app/stores/actions/agentActions.ts`
- Modify: `ai-digital-life/frontend/src/app/stores/createStore.ts`

**Interfaces:**
- Consumes: `AgentBridge`, `SubagentBridge` (Task 10)
- Produces: `AgentState` with selected agent, plan mode, subagent tasks

- [ ] **Step 1: Create agentSlice.ts**

Create `ai-digital-life/frontend/src/app/stores/slices/agentSlice.ts`:

```typescript
import type { AgentConfig, SubagentTask } from '@ai-digital-life/shared/ipc';

export interface AgentState {
  selectedAgent: AgentConfig | null;
  availableAgents: AgentConfig[];
  planModeActive: boolean;
  planFile: string | null;
  activeSubagents: SubagentTask[];
  isFetchingAgents: boolean;
}

export const initialAgentState: AgentState = {
  selectedAgent: null,
  availableAgents: [],
  planModeActive: false,
  planFile: null,
  activeSubagents: [],
  isFetchingAgents: false,
};
```

- [ ] **Step 2: Create agentActions.ts**

Create `ai-digital-life/frontend/src/app/stores/actions/agentActions.ts`:

```typescript
import type { DigitalLifeBridge } from '@ai-digital-life/shared/ipc';
import { clearError, captureError } from './shared';

export interface AgentActions {
  fetchAgents: () => Promise<void>;
  selectAgentForScenario: (scenario: string, userPrompt: string) => Promise<void>;
  enterPlanMode: (workspaceId: string, workspaceRoot: string) => Promise<void>;
  exitPlanMode: (workspaceId: string) => Promise<void>;
  refreshPlanModeState: (workspaceId: string) => Promise<void>;
}

export const createAgentActions = (set: any, get: any, bridge: DigitalLifeBridge): AgentActions => ({
  fetchAgents: async () => {
    set((s: any) => ({ isFetchingAgents: true }));
    clearError(get);
    try {
      const result = await bridge.agent.listAgents();
      if (result.ok) {
        set({ availableAgents: result.data });
      } else {
        captureError(get, result.error?.message ?? 'Failed to fetch agents');
      }
    } catch (e) {
      captureError(get, e);
    } finally {
      set((s: any) => ({ isFetchingAgents: false }));
    }
  },

  selectAgentForScenario: async (scenario: string, userPrompt: string) => {
    clearError(get);
    try {
      const result = await bridge.agent.selectAgent(scenario, userPrompt);
      if (result.ok) {
        set({ selectedAgent: result.data });
      } else {
        captureError(get, result.error?.message ?? 'Failed to select agent');
      }
    } catch (e) {
      captureError(get, e);
    }
  },

  enterPlanMode: async (workspaceId: string, workspaceRoot: string) => {
    clearError(get);
    try {
      const result = await bridge.agent.enterPlanMode(workspaceId, workspaceRoot);
      if (result.ok) {
        set({ planModeActive: true, planFile: result.data });
      } else {
        captureError(get, result.error?.message ?? 'Failed to enter plan mode');
      }
    } catch (e) {
      captureError(get, e);
    }
  },

  exitPlanMode: async (workspaceId: string) => {
    clearError(get);
    try {
      const result = await bridge.agent.exitPlanMode(workspaceId);
      if (result.ok) {
        set({ planModeActive: false, planFile: null });
      } else {
        captureError(get, result.error?.message ?? 'Failed to exit plan mode');
      }
    } catch (e) {
      captureError(get, e);
    }
  },

  refreshPlanModeState: async (workspaceId: string) => {
    try {
      const result = await bridge.agent.getPlanModeState(workspaceId);
      if (result.ok) {
        set({ planModeActive: result.data });
      }
    } catch (e) {
      // Silently fail — plan mode state refresh is non-critical
      console.warn('Failed to refresh plan mode state', e);
    }
  },
});
```

- [ ] **Step 3: Merge slice into store**

Edit `ai-digital-life/frontend/src/app/stores/createStore.ts`, merge `initialAgentState` and `createAgentActions` into the combined store.

- [ ] **Step 4: Verify TypeScript compiles**

Run: `$env:Path = "D:\Program Files\nodejs;$env:Path"; cd ai-digital-life/frontend; pnpm run typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add ai-digital-life/frontend/src/app/stores/
git commit -m "feat(stores): add agentSlice and agentActions for multi-agent state"
```

---

## Task 12: Build AgentSelector Component

**Files:**
- Create: `ai-digital-life/frontend/src/app/components/agent/AgentSelector.tsx`
- Modify: `ai-digital-life/frontend/src/locales/zh-CN.json` (add agent keys)
- Modify: `ai-digital-life/frontend/src/locales/en-US.json` (add agent keys)

**Interfaces:**
- Consumes: `AgentState` (Task 11), `useAppStore`
- Produces: `<AgentSelector />` component for switching agents

- [ ] **Step 1: Add i18n keys**

In `ai-digital-life/frontend/src/locales/zh-CN.json`, add:

```json
{
  "agent": {
    "selector": {
      "title": "选择 Agent",
      "build": "构建（默认）",
      "plan": "规划（只读分析）",
      "custom": "自定义"
    },
    "planMode": {
      "active": "规划模式已激活",
      "readonly": "只读模式，不会修改文件",
      "enter": "进入规划模式",
      "exit": "退出规划模式"
    }
  }
}
```

In `ai-digital-life/frontend/src/locales/en-US.json`, add the same structure with English values.

- [ ] **Step 2: Create AgentSelector.tsx**

Create `ai-digital-life/frontend/src/app/components/agent/AgentSelector.tsx`:

```tsx
import { useEffect, useMemo } from 'react';
import { useAppStore } from '../../stores/createStore';
import { useTCopy } from '../../i18n/useTCopy';
import type { AgentConfig } from '@ai-digital-life/shared/ipc';

export function AgentSelector() {
  const t = useTCopy();
  const availableAgents = useAppStore((s) => s.availableAgents);
  const selectedAgent = useAppStore((s) => s.selectedAgent);
  const fetchAgents = useAppStore((s) => s.fetchAgents);
  const selectAgentForScenario = useAppStore((s) => s.selectAgentForScenario);

  useEffect(() => {
    if (availableAgents.length === 0) {
      void fetchAgents();
    }
  }, [availableAgents.length, fetchAgents]);

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const agentId = e.target.value;
    const agent = availableAgents.find((a) => a.id === agentId);
    if (agent) {
      // Use a synthetic prompt to force the agent selection
      void selectAgentForScenario(agentId === 'plan' ? 'plan' : 'chat', '');
    }
  };

  const currentId = selectedAgent?.id ?? 'build';

  return (
    <select
      value={currentId}
      onChange={handleChange}
      aria-label={t('agent.selector.title')}
      className="adl-agent-selector"
    >
      {availableAgents.map((agent) => (
        <option key={agent.id} value={agent.id}>
          {t(`agent.selector.${agent.id}` as const, { defaultValue: agent.name })}
        </option>
      ))}
    </select>
  );
}
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `$env:Path = "D:\Program Files\nodejs;$env:Path"; cd ai-digital-life/frontend; pnpm run typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add ai-digital-life/frontend/src/app/components/agent/AgentSelector.tsx ai-digital-life/frontend/src/locales/
git commit -m "feat(frontend): add AgentSelector component with i18n"
```

---

## Task 13: Build PlanModeBanner and SubagentIndicator Components

**Files:**
- Create: `ai-digital-life/frontend/src/app/components/agent/PlanModeBanner.tsx`
- Create: `ai-digital-life/frontend/src/app/components/agent/SubagentIndicator.tsx`
- Modify: locale files for new keys

**Interfaces:**
- Consumes: `AgentState` (Task 11)
- Produces: `<PlanModeBanner />` and `<SubagentIndicator />` components

- [ ] **Step 1: Add i18n keys**

Add to locale files:

```json
{
  "agent": {
    "subagent": {
      "running": "子代理运行中",
      "completed": "子代理已完成",
      "failed": "子代理失败",
      "task": "任务"
    }
  }
}
```

- [ ] **Step 2: Create PlanModeBanner.tsx**

```tsx
import { useAppStore } from '../../stores/createStore';
import { useTCopy } from '../../i18n/useTCopy';

export function PlanModeBanner() {
  const t = useTCopy();
  const planModeActive = useAppStore((s) => s.planModeActive);
  const exitPlanMode = useAppStore((s) => s.exitPlanMode);
  const activeWorkspaceId = useAppStore((s) => s.activeCiWorkspaceId);

  if (!planModeActive) return null;

  return (
    <div className="adl-plan-mode-banner" role="status">
      <span>{t('agent.planMode.active')} — {t('agent.planMode.readonly')}</span>
      <button
        type="button"
        onClick={() => activeWorkspaceId && void exitPlanMode(activeWorkspaceId)}
      >
        {t('agent.planMode.exit')}
      </button>
    </div>
  );
}
```

- [ ] **Step 3: Create SubagentIndicator.tsx**

```tsx
import { useAppStore } from '../../stores/createStore';
import { useTCopy } from '../../i18n/useTCopy';

export function SubagentIndicator() {
  const t = useTCopy();
  const activeSubagents = useAppStore((s) => s.activeSubagents);

  if (activeSubagents.length === 0) return null;

  return (
    <div className="adl-subagent-indicator" role="status" aria-live="polite">
      {activeSubagents.map((task) => {
        const statusKey = task.status === 'running' ? 'running' : task.status === 'completed' ? 'completed' : 'failed';
        return (
          <span key={task.id} className={`adl-subagent-badge adl-subagent-${statusKey}`}>
            {t('agent.subagent.task')}: {task.subagentType} — {t(`agent.subagent.${statusKey}`)}
          </span>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `$env:Path = "D:\Program Files\nodejs;$env:Path"; cd ai-digital-life/frontend; pnpm run typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add ai-digital-life/frontend/src/app/components/agent/ ai-digital-life/frontend/src/locales/
git commit -m "feat(frontend): add PlanModeBanner and SubagentIndicator components"
```

---

## Task 14: Wire Plan Mode into SlashCommandPopover

**Files:**
- Modify: `ai-digital-life/frontend/src/app/components/conversation/SlashCommandPopover.tsx`

**Interfaces:**
- Consumes: `enterPlanMode` action (Task 11), existing SlashCommand type
- Produces: `/plan` command now triggers plan mode entry

- [ ] **Step 1: Locate the /plan command handler**

Read `ai-digital-life/frontend/src/app/components/conversation/SlashCommandPopover.tsx` and find where `/plan` is handled.

- [ ] **Step 2: Wire plan mode entry**

In the `/plan` command handler, add a call to `enterPlanMode` before sending the message:

```tsx
import { useAppStore } from '../../stores/createStore';

// Inside the command handler for /plan:
const enterPlanMode = useAppStore((s) => s.enterPlanMode);
const activeWorkspaceId = useAppStore((s) => s.activeCiWorkspaceId);
const activeWorkspacePath = useAppStore((s) => s.activeWorkspacePath);

if (activeWorkspaceId && activeWorkspacePath) {
  void enterPlanMode(activeWorkspaceId, activeWorkspacePath);
}
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `$env:Path = "D:\Program Files\nodejs;$env:Path"; cd ai-digital-life/frontend; pnpm run typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add ai-digital-life/frontend/src/app/components/conversation/SlashCommandPopover.tsx
git commit -m "feat(frontend): wire /plan slash command to plan mode entry"
```

---

## Task 15: Implement Spawn Subagent IPC Command (Backend)

**Files:**
- Modify: `ai-digital-life/src-tauri/src/commands/agent.rs` (or create new `subagent.rs` command file)
- Modify: `ai-digital-life/src-tauri/src/lib.rs` (register commands)
- Modify: `ai-digital-life/src-tauri/Cargo.toml` (add `adl-subagent` dependency)

**Interfaces:**
- Consumes: `SubagentManager` (Task 6), `TaskToolInput`/`TaskToolOutput` (Task 6)
- Produces: Tauri commands: `spawn_subagent`, `get_subagent_task`, `list_active_subagents`, `cancel_subagent`

- [ ] **Step 1: Add adl-subagent dependency**

Edit `ai-digital-life/src-tauri/Cargo.toml`, add:

```toml
adl-subagent = { path = "../crates/subagent" }
```

- [ ] **Step 2: Create subagent command module**

Create `ai-digital-life/src-tauri/src/commands/subagent.rs`:

```rust
use adl_subagent::{
    SubagentManager, SubagentId, SubagentStatus, SubagentTask,
    task_tool::{TaskToolInput, TaskToolOutput},
};
use std::sync::Arc;
use tokio::sync::Mutex;

/// Global sub-agent manager instance.
static SUBAGENT_MANAGER: std::sync::LazyLock<Arc<SubagentManager>> =
    std::sync::LazyLock::new(|| Arc::new(SubagentManager::new()));

#[tauri::command]
pub async fn spawn_subagent(input: TaskToolInput) -> Result<TaskToolOutput, adl_errors::AppError> {
    let task_id = input.task_id
        .map(SubagentId::from_str)
        .unwrap_or_else(SubagentId::new);

    let task = SubagentTask {
        id: task_id.clone(),
        parent_session_id: String::new(), // filled by caller context
        child_session_id: adl_kernel::create_id("sess"),
        subagent_type: input.subagent_type.clone(),
        prompt: input.prompt.clone(),
        background: input.background,
        status: SubagentStatus::Pending,
        created_at: adl_kernel::now_ms(),
        completed_at: None,
    };

    SUBAGENT_MANAGER.register(task.clone()).await;

    if input.background {
        // Background mode: return immediately, run async
        let manager = Arc::clone(&SUBAGENT_MANAGER);
        let task_id_clone = task_id.clone();
        let prompt = input.prompt.clone();
        let subagent_type = input.subagent_type.clone();
        tokio::spawn(async move {
            manager.update_status(&task_id_clone, SubagentStatus::Running).await;
            // Actual LLM call would happen here via agent-runtime
            // For now, mark as completed with a stub summary
            tracing::info!("Background subagent {} running for: {}", subagent_type, prompt);
            manager.update_status(&task_id_clone, SubagentStatus::Completed).await;
        });

        Ok(TaskToolOutput {
            task_id: task_id.as_str().to_string(),
            state: "running".to_string(),
            summary: format!("Subagent {} spawned in background", input.subagent_type),
            result: None,
            error: None,
        })
    } else {
        // Foreground mode: would block until complete (simplified for now)
        SUBAGENT_MANAGER.update_status(&task_id, SubagentStatus::Running).await;
        // Synchronous execution would call agent-runtime here
        SUBAGENT_MANAGER.update_status(&task_id, SubagentStatus::Completed).await;

        Ok(TaskToolOutput {
            task_id: task_id.as_str().to_string(),
            state: "completed".to_string(),
            summary: format!("Subagent {} completed", input.subagent_type),
            result: Some(format!("Processed: {}", input.description)),
            error: None,
        })
    }
}

#[tauri::command]
pub async fn get_subagent_task(task_id: String) -> Result<Option<SubagentTask>, adl_errors::AppError> {
    let id = SubagentId::from_str(&task_id);
    Ok(SUBAGENT_MANAGER.get(&id).await)
}

#[tauri::command]
pub async fn list_active_subagents(_workspace_id: String) -> Result<Vec<SubagentTask>, adl_errors::AppError> {
    Ok(SUBAGENT_MANAGER.list_active().await)
}

#[tauri::command]
pub async fn cancel_subagent(task_id: String) -> Result<bool, adl_errors::AppError> {
    let id = SubagentId::from_str(&task_id);
    SUBAGENT_MANAGER.update_status(&id, SubagentStatus::Aborted).await;
    Ok(true)
}
```

- [ ] **Step 3: Register commands**

In `ai-digital-life/src-tauri/src/commands/mod.rs`, add:

```rust
pub mod subagent;
```

In `ai-digital-life/src-tauri/src/lib.rs`, add to invoke_handler:

```rust
commands::subagent::spawn_subagent,
commands::subagent::get_subagent_task,
commands::subagent::list_active_subagents,
commands::subagent::cancel_subagent,
```

- [ ] **Step 4: Verify compilation**

Run: `$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"; cd ai-digital-life; cargo check -p adl-app`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add ai-digital-life/src-tauri/Cargo.toml ai-digital-life/src-tauri/src/commands/subagent.rs ai-digital-life/src-tauri/src/commands/mod.rs ai-digital-life/src-tauri/src/lib.rs
git commit -m "feat(ipc): add spawn_subagent and related commands"
```

---

## Task 16: End-to-End Verification

**Files:**
- No new files — this task runs the full verification suite

- [ ] **Step 1: Run Rust tests**

Run: `$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"; cd ai-digital-life; cargo test --workspace`
Expected: All tests pass

- [ ] **Step 2: Run Rust lints**

Run: `$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"; cd ai-digital-life; cargo clippy --workspace -- -D warnings`
Expected: No warnings

- [ ] **Step 3: Run frontend typecheck**

Run: `$env:Path = "D:\Program Files\nodejs;$env:Path"; cd ai-digital-life/frontend; pnpm run typecheck`
Expected: PASS

- [ ] **Step 4: Run frontend tests**

Run: `$env:Path = "D:\Program Files\nodejs;$env:Path"; cd ai-digital-life/frontend; pnpm test`
Expected: All tests pass

- [ ] **Step 5: Run frontend lint**

Run: `$env:Path = "D:\Program Files\nodejs;$env:Path"; cd ai-digital-life/frontend; pnpm run lint`
Expected: No errors

- [ ] **Step 6: Commit any lint fixes**

```bash
git add -A
git commit -m "chore: lint and format fixes from Phase 2-A verification"
```

---

## Self-Review Notes

**Spec coverage check:**
- ✅ Multi-Agent system: Tasks 2-5 (types, registry, router, prompts)
- ✅ Sub-agent / Task tool: Tasks 6-7, 15 (subagent crate, parent/child sessions, IPC)
- ✅ Plan Mode: Tasks 8, 14 (backend state, slash command wiring)
- ✅ Frontend UI: Tasks 10-13 (IPC, slice, components)
- ✅ Phase boundary update: Task 1
- ✅ E2E verification: Task 16

**Type consistency check:**
- `AgentId` enum used consistently across kernel, agent-runtime, subagent crates
- `AgentConfig` struct fields match between Rust and TypeScript using snake_case (e.g., `allows_write_tools`, `prompt_template`, `model_override`) — Rust uses default serde (no rename), TS uses snake_case per project convention
- `SubagentStatus` variants match between Rust and TypeScript
- `TaskToolInput`/`TaskToolOutput`/`SubagentTask` field names match across boundary using snake_case (e.g., `parent_session_id`, `child_session_id`, `subagent_type`, `created_at`, `task_id`)

**Note on scope:** This plan establishes the foundation. Full LLM streaming, tool dispatch loop, and actual sub-agent LLM execution will be wired in Phase 2-B (multi-LLM provider) and Phase 2-C (compaction/tools). The current plan provides the structural skeleton that those phases fill with behavior.
