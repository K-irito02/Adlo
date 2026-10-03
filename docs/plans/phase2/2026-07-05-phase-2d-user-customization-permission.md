# Phase 2-D: User Customization & Permission Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement user-defined custom slash commands with template variables ($1, $ARGUMENTS) and upgrade the permission system from simple RiskLevel to a Ruleset-based model (allow/ask/deny with wildcard patterns, per-tool rules, and session-level memory).

**Architecture:** Extend the config system with `commands: Vec<CommandConfig>` and `permissions: PermissionRulesetConfig`. Refactor `crates/kernel/src/command_risk.rs` to add `PermissionRuleset` with `allow`/`ask`/`deny` decisions, wildcard pattern matching on tool names and arguments, and special rules for `.env`/`doom_loop`/`external_directory`. Update `SlashCommandPopover.tsx` to load commands from config dynamically with template variable substitution.

**Tech Stack:** Rust (existing `kernel`, `task` crates), React 19 + Zustand (frontend command editor UI).

## Global Constraints

- No new external dependencies — pure architecture/config changes
- Backward compatible: existing RiskLevel-based code must continue to work (mapped to Ruleset decisions)
- Permission rules support `*` (single segment) and `**` (multi-segment) wildcards
- Special rules: `.env` files → ask, `doom_loop` (repeated failures) → ask, `external_directory` → ask
- Template variables: `$1`, `$2`, ... `$ARGUMENTS` (all args), `$WORKSPACE` (workspace path)
- All UI text uses i18n keys
- TDD throughout; 3-bridge sync for new IPC
- Depends on Phase 2-A (Agent registry for command→agent binding)

## File Structure

### Rust — New Files

```
crates/kernel/src/types/commands.rs       # CommandConfig type
```

> **REVISION NOTE (2026-07-05):** Task 1 originally planned to create `crates/kernel/src/types/permission.rs` and `crates/kernel/src/permission_ruleset.rs`. Pre-flight review found that `crates/kernel/src/command_risk.rs` (commit `d62083fa`) already implements `PermissionDecision`, `PermissionRule`, `PermissionEngine`, and `pattern_matches` with nearly identical semantics. Per user decision, Task 1 now **refactors `command_risk.rs` in place** instead of creating new files. The `permission.rs` and `permission_ruleset.rs` files are NOT created.

### Rust — Modified Files

```
crates/kernel/src/lib.rs                  # Wire new modules
crates/kernel/src/command_risk.rs         # Refactor in place: rename PermissionEngine → PermissionRuleset, add always/reason fields, add PermissionRulesetConfig, remove camelCase serde
crates/kernel/src/config.rs              # Add commands + permissions to AppConfig
crates/kernel/src/types/config.rs        # Add CommandConfig, PermissionRulesetConfig
crates/kernel/src/types/mod.rs           # Re-export new types
crates/task/src/lib.rs                   # Use PermissionRuleset for approval decisions
src-tauri/src/commands/
├── commands_config.rs                   # Custom command CRUD IPC
├── permission.rs                        # Permission ruleset IPC
src-tauri/src/commands/mod.rs
src-tauri/src/lib.rs
```

### Frontend — New Files

```
frontend/src/app/features/command-editor/
├── CommandEditor.tsx         # Create/edit custom commands
├── CommandList.tsx           # List user-defined commands

frontend/src/app/features/permission-settings/
├── PermissionRulesetEditor.tsx  # Edit permission rules
├── PermissionRulesetList.tsx    # List current rules

frontend/src/shared/ipc/
├── commands_config.ts        # CommandsConfigBridge interface
├── permission.ts             # PermissionBridge interface
```

### Frontend — Modified Files

```
frontend/src/app/components/conversation/SlashCommandPopover.tsx  # Load from config
frontend/src/shared/ipc/index.ts
frontend/src/shared/ipc/digital-life.ts
frontend/src/app/stores/slices/  # new commandSlice.ts, permissionSlice.ts
frontend/src/tauri-bridge/index.ts
frontend/src/preview-bridge/index.ts
frontend/src/mock-bridge/index.ts
frontend/src/locales/zh-CN.json
frontend/src/locales/en-US.json
```

---

## Task 1: Refactor Permission Ruleset Types in command_risk.rs

> **REVISION (2026-07-05):** This task was originally "Create `types/permission.rs`". Pre-flight review found `command_risk.rs` (commit `d62083fa`) already implements `PermissionDecision`, `PermissionRule`, `PermissionEngine`, and `pattern_matches` with nearly identical semantics. Per user decision, this task now **refactors `command_risk.rs` in place** — no new file is created. The implementer must: (a) rename `PermissionEngine` → `PermissionRuleset`, (b) add `always: bool` + `reason: String` fields to `PermissionRule`, (c) remove `#[serde(rename_all = "camelCase")]` from `PermissionRule` (project rule: snake_case), (d) add `PermissionRulesetConfig` type, (e) add `default_rules()` method, (f) add `merge()`/`is_allow()`/`is_ask()`/`is_deny()` helpers to `PermissionDecision`, (g) update `evaluate()` signature to take `tool_name`, (h) update all existing callers and tests.

**Files:**
- Modify: `ai-digital-life/crates/kernel/src/command_risk.rs` (refactor in place)
- Modify: `ai-digital-life/crates/kernel/src/lib.rs` (re-export `PermissionRulesetConfig`)
- Test: inline in `command_risk.rs`

**Interfaces:**
- Consumes: Existing `PermissionDecision`, `PermissionRule`, `PermissionEngine`, `pattern_matches` from `command_risk.rs`
- Produces: Refactored `PermissionDecision` (with `merge`/`is_*` helpers), `PermissionRule` (with `always`/`reason`), `PermissionRuleset` (renamed from `PermissionEngine`, with `default_rules`), `PermissionRulesetConfig`

**Migration impact:** The implementer must `grep` for all callers of `PermissionEngine` and `pattern_matches` (especially in `crates/command/src/lib.rs` and `crates/task/src/lib.rs`) and update them to the new API. The `evaluate()` signature change (adding `tool_name: &str`) is the most disruptive — callers that previously passed `(command, args)` must now pass `(tool_name, command, args)`.

- [ ] **Step 1: Write the failing tests**

Add new test cases to the existing `#[cfg(test)] mod tests` block in `ai-digital-life/crates/kernel/src/command_risk.rs`. These exercise the NEW fields and methods that don't exist yet:

```rust
// Add these NEW test cases to the existing `#[cfg(test)] mod tests` block
// in ai-digital-life/crates/kernel/src/command_risk.rs.
// They exercise fields and methods that do NOT exist yet, so they will fail
// until Step 3 refactors the file.

#[test]
fn decision_merge_deny_wins() {
    use super::PermissionDecision;
    assert_eq!(PermissionDecision::Allow.merge(PermissionDecision::Deny), PermissionDecision::Deny);
    assert_eq!(PermissionDecision::Deny.merge(PermissionDecision::Allow), PermissionDecision::Deny);
}

#[test]
fn decision_merge_ask_over_allow() {
    use super::PermissionDecision;
    assert_eq!(PermissionDecision::Allow.merge(PermissionDecision::Ask), PermissionDecision::Ask);
    assert_eq!(PermissionDecision::Ask.merge(PermissionDecision::Allow), PermissionDecision::Ask);
}

#[test]
fn decision_is_helpers() {
    use super::PermissionDecision;
    assert!(PermissionDecision::Allow.is_allow());
    assert!(PermissionDecision::Ask.is_ask());
    assert!(PermissionDecision::Deny.is_deny());
    assert!(!PermissionDecision::Allow.is_deny());
}

#[test]
fn ruleset_default_rules_has_safety_rules() {
    use super::{PermissionRuleset, PermissionDecision};
    let ruleset = PermissionRuleset::default_rules();
    assert!(ruleset.rules.len() >= 3);
    // Should have .env protection
    assert!(ruleset.rules.iter().any(|r| r.pattern.contains(".env")));
    // All default rules should have `always: true` and a non-empty `reason`
    assert!(ruleset.rules.iter().all(|r| r.always));
    assert!(ruleset.rules.iter().all(|r| !r.reason.is_empty()));
}

#[test]
fn ruleset_default_evaluates_env_write_as_ask() {
    use super::{PermissionRuleset, PermissionDecision};
    let ruleset = PermissionRuleset::default_rules();
    let decision = ruleset.evaluate("write", "write", &[".env".to_string()]);
    assert_eq!(decision, PermissionDecision::Ask);
}

#[test]
fn ruleset_default_evaluates_rm_rf_as_deny() {
    use super::{PermissionRuleset, PermissionDecision};
    let ruleset = PermissionRuleset::default_rules();
    let decision = ruleset.evaluate("bash", "rm", &["-rf".to_string(), "/".to_string()]);
    assert_eq!(decision, PermissionDecision::Deny);
}

#[test]
fn ruleset_default_allows_normal_read() {
    use super::{PermissionRuleset, PermissionDecision};
    let ruleset = PermissionRuleset::default_rules();
    let decision = ruleset.evaluate("read", "read", &["src/main.rs".to_string()]);
    assert_eq!(decision, PermissionDecision::Allow);
}

#[test]
fn ruleset_custom_rule_overrides_default_last_wins() {
    use super::{PermissionRuleset, PermissionRule, PermissionDecision};
    let mut ruleset = PermissionRuleset::default_rules();
    // Add a custom allow rule for .env (after defaults, so it takes precedence — last match wins)
    ruleset.add_rule(PermissionRule {
        pattern: "**/.env".to_string(),
        decision: PermissionDecision::Allow,
        tool_type: "write".to_string(),
        always: true,
        reason: "User override".to_string(),
    });
    let decision = ruleset.evaluate("write", "write", &[".env".to_string()]);
    assert_eq!(decision, PermissionDecision::Allow);
}

#[test]
fn permission_rule_serializes_snake_case() {
    use super::PermissionRule;
    use super::PermissionDecision;
    // Verify NO camelCase — project rule requires snake_case to match Rust serde default
    let rule = PermissionRule {
        pattern: "test".to_string(),
        decision: PermissionDecision::Allow,
        tool_type: "bash".to_string(),
        always: false,
        reason: "test reason".to_string(),
    };
    let json = serde_json::to_string(&rule).expect("serialize");
    // snake_case fields
    assert!(json.contains("\"tool_type\""), "expected snake_case tool_type, got: {}", json);
    assert!(!json.contains("\"toolType\""), "camelCase toolType leaked: {}", json);
}

#[test]
fn permission_ruleset_config_default_includes_defaults() {
    use super::PermissionRulesetConfig;
    let config = PermissionRulesetConfig::default();
    assert!(config.include_defaults);
    assert!(config.custom_rules.is_empty());
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"; cd ai-digital-life; cargo test -p adl-kernel --lib command_risk`
Expected: FAIL — `PermissionRuleset` not found (type is still named `PermissionEngine`), `merge`/`is_allow`/`is_ask`/`is_deny` methods don't exist on `PermissionDecision`, `default_rules()` doesn't exist, `always`/`reason` fields don't exist on `PermissionRule`, `PermissionRulesetConfig` type doesn't exist, `evaluate` signature mismatch (missing `tool_name` parameter)

- [ ] **Step 3: Refactor `command_risk.rs` in place**

Edit `ai-digital-life/crates/kernel/src/command_risk.rs` to apply these changes. The TARGET state of the refactored sections is shown below — the implementer should merge these into the existing file, preserving the existing `assess_command_risk` and `requires_approval` functions unchanged, and updating the existing `PermissionEngine`/`PermissionRule`/`pattern_matches`/tests to match the new API.

**3a. Add helpers to `PermissionDecision`:**

```rust
impl PermissionDecision {
    /// Precedence: Deny > Ask > Allow. Returns the higher-precedence decision.
    pub fn merge(self, other: PermissionDecision) -> PermissionDecision {
        match (self, other) {
            (PermissionDecision::Deny, _) | (_, PermissionDecision::Deny) => PermissionDecision::Deny,
            (PermissionDecision::Ask, _) | (_, PermissionDecision::Ask) => PermissionDecision::Ask,
            (PermissionDecision::Allow, PermissionDecision::Allow) => PermissionDecision::Allow,
        }
    }
    pub fn is_allow(&self) -> bool { matches!(self, PermissionDecision::Allow) }
    pub fn is_ask(&self) -> bool { matches!(self, PermissionDecision::Ask) }
    pub fn is_deny(&self) -> bool { matches!(self, PermissionDecision::Deny) }
}
```

**3b. Update `PermissionRule` — remove `camelCase` serde, add `always` and `reason` fields:**

```rust
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../frontend/src/shared/ipc-types.generated.ts")]
// NOTE: removed #[serde(rename_all = "camelCase")] — project rule requires snake_case
pub struct PermissionRule {
    pub pattern: String,
    pub decision: PermissionDecision,
    #[serde(default)]
    pub tool_type: String,
    /// Whether this rule always applies (persists across session).
    #[serde(default)]
    pub always: bool,
    /// Human-readable reason for this rule (shown in UI).
    #[serde(default)]
    pub reason: String,
}
```

**3c. Rename `PermissionEngine` → `PermissionRuleset`, update `evaluate` signature, add `default_rules()`:**

```rust
#[derive(Debug, Clone, Default)]
pub struct PermissionRuleset {
    pub rules: Vec<PermissionRule>,
}

impl PermissionRuleset {
    pub fn add_rule(&mut self, rule: PermissionRule) {
        self.rules.push(rule);
    }

    /// Evaluate a permission request against the ruleset.
    /// Returns the decision from the LAST matching rule (reference implementation behavior).
    /// If no rule matches, returns the default decision (derived from RiskLevel).
    pub fn evaluate(&self, tool_name: &str, command: &str, args: &[String]) -> PermissionDecision {
        let mut decision = default_decision(command, args); // default
        for rule in &self.rules {
            if rule_matches(rule, tool_name, command, args) {
                decision = rule.decision; // last match wins
            }
        }
        decision
    }

    /// Get the default ruleset with built-in safety rules.
    pub fn default_rules() -> Self {
        let mut ruleset = Self::default();
        ruleset.add_rule(PermissionRule {
            pattern: "**/.env".to_string(),
            decision: PermissionDecision::Ask,
            tool_type: "write".to_string(),
            always: true,
            reason: "Protecting environment files".to_string(),
        });
        ruleset.add_rule(PermissionRule {
            pattern: "**/.env.*".to_string(),
            decision: PermissionDecision::Ask,
            tool_type: "write".to_string(),
            always: true,
            reason: "Protecting environment files".to_string(),
        });
        ruleset.add_rule(PermissionRule {
            pattern: "rm -rf /**".to_string(),
            decision: PermissionDecision::Deny,
            tool_type: "bash".to_string(),
            always: true,
            reason: "Preventing destructive recursive deletion".to_string(),
        });
        ruleset.add_rule(PermissionRule {
            pattern: "git push --force*".to_string(),
            decision: PermissionDecision::Ask,
            tool_type: "bash".to_string(),
            always: true,
            reason: "Force push can overwrite remote history".to_string(),
        });
        ruleset.add_rule(PermissionRule {
            pattern: "**/external/**".to_string(),
            decision: PermissionDecision::Ask,
            tool_type: "write".to_string(),
            always: true,
            reason: "External directory access".to_string(),
        });
        ruleset
    }
}
```

**3d. Update `rule_matches` to take `tool_name` and match against tool name OR full command:**

```rust
fn rule_matches(rule: &PermissionRule, tool_name: &str, command: &str, args: &[String]) -> bool {
    // Check tool_type filter
    if !rule.tool_type.is_empty() && rule.tool_type != tool_name {
        return false;
    }
    // Build the full command string
    let full_command = if args.is_empty() {
        command.to_string()
    } else {
        format!("{} {}", command, args.join(" "))
    };
    // Match pattern against tool name OR full command
    pattern_matches(&rule.pattern, tool_name) || pattern_matches(&rule.pattern, &full_command)
}
```

**3e. Update `pattern_matches` signature to `(pattern: &str, text: &str) -> bool` (simpler API matching against a single text):**

```rust
/// Check if a pattern matches a string.
/// Supports `*` (single segment) and `**` (multi-segment) wildcards.
pub fn pattern_matches(pattern: &str, text: &str) -> bool {
    if pattern == "**" {
        return true;
    }
    let pattern_parts: Vec<&str> = pattern.split('*').collect();
    if pattern_parts.len() == 1 {
        return pattern == text;
    }
    let mut text_idx = 0;
    for (i, part) in pattern_parts.iter().enumerate() {
        if part.is_empty() {
            continue; // * or ** — matches anything
        }
        if i == 0 {
            if !text[text_idx..].starts_with(part) {
                return false;
            }
            text_idx += part.len();
        } else if i == pattern_parts.len() - 1 {
            return text[text_idx..].ends_with(part);
        } else if let Some(pos) = text[text_idx..].find(part) {
            text_idx += pos + part.len();
        } else {
            return false;
        }
    }
    true
}
```

**3f. Add `PermissionRulesetConfig` type** (place it after `PermissionRuleset`):

```rust
/// Configuration for the permission ruleset (stored in app config).
#[derive(Debug, Clone, Default, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../frontend/src/shared/ipc-types.generated.ts")]
pub struct PermissionRulesetConfig {
    /// Custom rules added by the user.
    #[serde(default)]
    pub custom_rules: Vec<PermissionRule>,
    /// Whether to include the default safety rules.
    #[serde(default = "default_true")]
    pub include_defaults: bool,
}

fn default_true() -> bool {
    true
}
```

**3g. Update `lib.rs` to re-export `PermissionRulesetConfig`:**

Add to `ai-digital-life/crates/kernel/src/lib.rs` (alongside existing re-exports):

```rust
pub use command_risk::{
    assess_command_risk, requires_approval,
    PermissionDecision, PermissionRule, PermissionRuleset, PermissionRulesetConfig,
    pattern_matches as permission_pattern_matches,
};
```

**3h. Update existing tests in `command_risk.rs`** to use the new API:
- Rename all `PermissionEngine` references to `PermissionRuleset`
- Update `evaluate(command, args)` calls to `evaluate(tool_name, command, args)` — for command-tool cases, use `"command"` as `tool_name`
- Update `PermissionRule { pattern, decision, tool_type }` literals to include `always: false, reason: String::new()` (or use `..Default::default()` if `PermissionRule` derives `Default`)
- Remove or update tests that asserted camelCase serialization behavior

**3i. Update all callers** of `PermissionEngine` and `pattern_matches` across the codebase:
- `grep -r "PermissionEngine" ai-digital-life/` — rename to `PermissionRuleset`
- `grep -r "\.evaluate(" ai-digital-life/crates/` — update call sites to pass `tool_name`
- `grep -r "pattern_matches(" ai-digital-life/crates/` — update call sites to use new `(pattern, text)` signature
- Check `crates/command/src/lib.rs` and `crates/task/src/lib.rs` specifically (they are known callers from commit `d62083fa`)

- [ ] **Step 4: Run tests to verify they pass**

Run: `$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"; cd ai-digital-life; cargo test -p adl-kernel --lib command_risk`
Expected: PASS — all tests pass (existing tests updated + new tests pass)

Then run the full kernel suite to verify no regressions:
Run: `$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"; cd ai-digital-life; cargo test -p adl-kernel`
Expected: PASS

Then run the command and task crate tests (known callers):
Run: `$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"; cd ai-digital-life; cargo test -p adl-command -p adl-task`
Expected: PASS

Then run `cargo check --workspace` to catch any other broken callers:
Run: `$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"; cd ai-digital-life; cargo check --workspace`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add ai-digital-life/crates/kernel/src/command_risk.rs ai-digital-life/crates/kernel/src/lib.rs
# Also add any other files updated in Step 3i (callers in command/, task/, etc.)
git commit -m "refactor(core): upgrade PermissionEngine to PermissionRuleset with always/reason fields, default_rules, PermissionRulesetConfig, and snake_case serde"
```

---

## Task 2: Define Custom Command Config Types

**Files:**
- Create: `ai-digital-life/crates/kernel/src/types/commands.rs`
- Modify: `ai-digital-life/crates/kernel/src/types/mod.rs`
- Test: inline in `commands.rs`

**Interfaces:**
- Consumes: `AgentId` from Phase 2-A
- Produces: `CommandConfig`, `CommandTemplate`, `CommandHint`

- [ ] **Step 1: Write the failing test**

Create `ai-digital-life/crates/kernel/src/types/commands.rs`:

```rust
use serde::{Deserialize, Serialize};
use super::agent::AgentId;

/// Configuration for a user-defined slash command.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommandConfig {
    /// The command name (without leading /). E.g., "refactor", "deploy".
    pub name: String,
    /// Human-readable description shown in the command palette.
    #[serde(default)]
    pub description: String,
    /// The agent to use for this command. Defaults to Build.
    #[serde(default = "default_agent_id")]
    pub agent: AgentId,
    /// Optional model override for this command.
    #[serde(default)]
    pub model: Option<String>,
    /// The prompt template with variables ($1, $ARGUMENTS, $WORKSPACE).
    pub template: String,
    /// Whether this command runs as a subtask (hidden from main conversation).
    #[serde(default)]
    pub subtask: bool,
    /// Hints extracted from the template (auto-generated).
    #[serde(default)]
    pub hints: Vec<CommandHint>,
}

fn default_agent_id() -> AgentId {
    AgentId::Build
}

/// A hint about a command parameter.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommandHint {
    /// The variable name (e.g., "1", "ARGUMENTS", "WORKSPACE").
    pub variable: String,
    /// Human-readable description of what this variable expects.
    pub description: String,
    /// Whether this variable is required.
    pub required: bool,
}

impl CommandConfig {
    /// Extract template variables ($1, $2, $ARGUMENTS, $WORKSPACE) from the template.
    pub fn extract_variables(template: &str) -> Vec<String> {
        let mut vars = Vec::new();
        let mut remaining = template;
        while let Some(start) = remaining.find('$') {
            remaining = &remaining[start + 1..];
            // Read variable name (alphanumeric and underscore)
            let end = remaining
                .find(|c: char| !c.is_alphanumeric() && c != '_')
                .unwrap_or(remaining.len());
            if end > 0 {
                let var = &remaining[..end];
                if !var.is_empty() && !vars.contains(&var.to_string()) {
                    vars.push(var.to_string());
                }
            }
            remaining = &remaining[end..];
        }
        vars
    }

    /// Substitute template variables with provided values.
    pub fn render_template(template: &str, args: &[String], workspace: &str) -> String {
        let mut result = template.to_string();
        let arguments = args.join(" ");

        // Replace $ARGUMENTS
        result = result.replace("$ARGUMENTS", &arguments);

        // Replace $WORKSPACE
        result = result.replace("$WORKSPACE", workspace);

        // Replace $1, $2, etc.
        for (i, arg) in args.iter().enumerate() {
            let placeholder = format!("${}", i + 1);
            result = result.replace(&placeholder, arg);
        }

        result
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extract_variables_finds_numbered() {
        let vars = CommandConfig::extract_variables("Fix the bug in $1 related to $2");
        assert!(vars.contains(&"1".to_string()));
        assert!(vars.contains(&"2".to_string()));
    }

    #[test]
    fn extract_variables_finds_arguments() {
        let vars = CommandConfig::extract_variables("Review the following: $ARGUMENTS");
        assert!(vars.contains(&"ARGUMENTS".to_string()));
    }

    #[test]
    fn extract_variables_finds_workspace() {
        let vars = CommandConfig::extract_variables("Analyze $WORKSPACE for issues");
        assert!(vars.contains(&"WORKSPACE".to_string()));
    }

    #[test]
    fn extract_variables_dedupes() {
        let vars = CommandConfig::extract_variables("$1 and $1 again");
        assert_eq!(vars.iter().filter(|v| v == &&"1".to_string()).count(), 1);
    }

    #[test]
    fn render_template_substitutes_numbered_args() {
        let result = CommandConfig::render_template(
            "Fix $1 in $2",
            &["auth".to_string(), "login.ts".to_string()],
            "/workspace",
        );
        assert_eq!(result, "Fix auth in login.ts");
    }

    #[test]
    fn render_template_substitutes_arguments() {
        let result = CommandConfig::render_template(
            "Review: $ARGUMENTS",
            &["file1.rs".to_string(), "file2.rs".to_string()],
            "/workspace",
        );
        assert_eq!(result, "Review: file1.rs file2.rs");
    }

    #[test]
    fn render_template_substitutes_workspace() {
        let result = CommandConfig::render_template(
            "Analyze $WORKSPACE",
            &[],
            "/home/user/project",
        );
        assert_eq!(result, "Analyze /home/user/project");
    }

    #[test]
    fn render_template_handles_missing_args() {
        let result = CommandConfig::render_template(
            "Fix $1 and $2",
            &["only_one".to_string()],
            "/workspace",
        );
        // $2 should remain unsubstituted
        assert_eq!(result, "Fix only_one and $2");
    }

    #[test]
    fn command_config_serializes() {
        let config = CommandConfig {
            name: "refactor".to_string(),
            description: "Refactor selected code".to_string(),
            agent: AgentId::Build,
            model: None,
            template: "Refactor $ARGUMENTS following best practices".to_string(),
            subtask: false,
            hints: vec![],
        };
        let json = serde_json::to_string(&config).unwrap();
        let deserialized: CommandConfig = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.name, "refactor");
        assert_eq!(deserialized.agent, AgentId::Build);
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"; cd ai-digital-life; cargo test -p adl-kernel --lib types::commands`
Expected: FAIL — module not declared

- [ ] **Step 3: Wire into types/mod.rs**

Add to `ai-digital-life/crates/kernel/src/types/mod.rs`:

```rust
pub mod commands;
pub use commands::{CommandConfig, CommandHint};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"; cd ai-digital-life; cargo test -p adl-kernel --lib types::commands`
Expected: PASS — all 8 tests pass

- [ ] **Step 5: Commit**

```bash
git add ai-digital-life/crates/kernel/src/types/commands.rs ai-digital-life/crates/kernel/src/types/mod.rs
git commit -m "feat(core): add CommandConfig with template variable support"
```

---

## Task 3: Extend AppConfig with Commands and Permissions

**Files:**
- Modify: `ai-digital-life/crates/kernel/src/config.rs`
- Modify: `ai-digital-life/crates/kernel/src/types/config.rs`
- Test: inline test module

- [ ] **Step 1: Write the failing test**

Add to `ai-digital-life/crates/kernel/src/config.rs`:

```rust
#[cfg(test)]
mod config_extension_tests {
    use super::*;
    use crate::types::commands::CommandConfig;
    use crate::types::agent::AgentId;
    use crate::types::permission::PermissionRulesetConfig;

    #[test]
    fn app_config_has_commands_field() {
        let config = AppConfig {
            language: crate::types::config::LanguageCode::EnUs,
            theme_mode: crate::types::config::ThemeMode::System,
            log_level: crate::types::config::LogLevel::Info,
            terminal_log_mode: crate::types::config::LogMode::Overwrite,
            debug_log_mode: crate::types::config::LogMode::Overwrite,
            max_recent_workspaces: 10,
            model_preferences: Default::default(),
            commands: vec![],
            permissions: PermissionRulesetConfig::default(),
        };
        assert!(config.commands.is_empty());
        assert!(config.permissions.include_defaults);
    }

    #[test]
    fn app_config_with_custom_commands() {
        let config = AppConfig {
            language: crate::types::config::LanguageCode::EnUs,
            theme_mode: crate::types::config::ThemeMode::System,
            log_level: crate::types::config::LogLevel::Info,
            terminal_log_mode: crate::types::config::LogMode::Overwrite,
            debug_log_mode: crate::types::config::LogMode::Overwrite,
            max_recent_workspaces: 10,
            model_preferences: Default::default(),
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
        };
        assert_eq!(config.commands.len(), 1);
        assert_eq!(config.commands[0].name, "deploy");
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"; cd ai-digital-life; cargo test -p adl-kernel --lib config::config_extension_tests`
Expected: FAIL — `commands` and `permissions` fields don't exist

- [ ] **Step 3: Add fields to AppConfig**

Edit `ai-digital-life/crates/kernel/src/config.rs`, add to `AppConfig` struct:

```rust
use crate::types::commands::CommandConfig;
use crate::types::permission::PermissionRulesetConfig;

// Add these fields to AppConfig:
#[serde(default)]
pub commands: Vec<CommandConfig>,
#[serde(default)]
pub permissions: PermissionRulesetConfig,
```

- [ ] **Step 4: Run test to verify it passes**

Run: `$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"; cd ai-digital-life; cargo test -p adl-kernel --lib config::config_extension_tests`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add ai-digital-life/crates/kernel/src/config.rs
git commit -m "feat(core): add commands and permissions to AppConfig"
```

---

## Task 4: Create PermissionRuleset Evaluation Module

**Files:**
- Create: `ai-digital-life/crates/kernel/src/permission_ruleset.rs`
- Modify: `ai-digital-life/crates/kernel/src/lib.rs`
- Modify: `ai-digital-life/crates/kernel/src/command_risk.rs` (bridge old and new systems)
- Test: inline in `permission_ruleset.rs`

**Interfaces:**
- Consumes: `PermissionRuleset` (Task 1), `RiskLevel` (existing)
- Produces: `evaluate_permission()`, `risk_to_decision()`, `doom_loop_check()`

- [ ] **Step 1: Write the failing test**

Create `ai-digital-life/crates/kernel/src/permission_ruleset.rs`:

```rust
use crate::types::permission::{PermissionDecision, PermissionRuleset, PermissionRule};
use crate::types::conversation::RiskLevel;

/// Convert a legacy RiskLevel to a PermissionDecision.
pub fn risk_to_decision(risk: RiskLevel) -> PermissionDecision {
    match risk {
        RiskLevel::Low => PermissionDecision::Allow,
        RiskLevel::Medium => PermissionDecision::Ask,
        RiskLevel::High => PermissionDecision::Deny,
    }
}

/// Evaluate a permission request using both the ruleset and legacy risk assessment.
/// The ruleset takes precedence; if no rule matches, falls back to risk-based decision.
pub fn evaluate_permission(
    ruleset: &PermissionRuleset,
    tool_name: &str,
    command: &str,
    args: &[String],
    risk: RiskLevel,
) -> PermissionDecision {
    let ruleset_decision = ruleset.evaluate(tool_name, command, args);

    // If ruleset explicitly allows or denies, use that
    if ruleset_decision != PermissionDecision::Allow || ruleset.rules.is_empty() {
        // If ruleset has rules and produces a non-default decision, use it
        if !ruleset.rules.is_empty() {
            return ruleset_decision;
        }
    }

    // Fall back to risk-based decision
    risk_to_decision(risk)
}

/// Check for doom loop pattern (repeated failures).
/// Returns Ask if the same command has failed more than 3 times in a row.
pub fn doom_loop_check(
    recent_failures: &[String],
    command: &str,
) -> PermissionDecision {
    let consecutive_failures = recent_failures
        .iter()
        .rev()
        .take_while(|c| c.as_str() == command)
        .count();

    if consecutive_failures >= 3 {
        PermissionDecision::Ask
    } else {
        PermissionDecision::Allow
    }
}

/// Check if a path is external to the workspace.
pub fn is_external_directory(path: &str, workspace_root: &str) -> bool {
    let normalized_path = std::path::Path::new(path)
        .canonicalize()
        .unwrap_or_else(|_| std::path::PathBuf::from(path));
    let normalized_root = std::path::Path::new(workspace_root)
        .canonicalize()
        .unwrap_or_else(|_| std::path::PathBuf::from(workspace_root));

    !normalized_path.starts_with(&normalized_root)
}

/// Build a permission ruleset from config.
pub fn build_ruleset(
    custom_rules: &[PermissionRule],
    include_defaults: bool,
) -> PermissionRuleset {
    let mut ruleset = if include_defaults {
        PermissionRuleset::default_rules()
    } else {
        PermissionRuleset::new()
    };

    for rule in custom_rules {
        ruleset.add_rule(rule.clone());
    }

    ruleset
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn risk_low_to_allow() {
        assert_eq!(risk_to_decision(RiskLevel::Low), PermissionDecision::Allow);
    }

    #[test]
    fn risk_medium_to_ask() {
        assert_eq!(risk_to_decision(RiskLevel::Medium), PermissionDecision::Ask);
    }

    #[test]
    fn risk_high_to_deny() {
        assert_eq!(risk_to_decision(RiskLevel::High), PermissionDecision::Deny);
    }

    #[test]
    fn doom_loop_allows_under_threshold() {
        let failures = vec!["npm install".to_string(), "npm install".to_string()];
        assert_eq!(doom_loop_check(&failures, "npm install"), PermissionDecision::Allow);
    }

    #[test]
    fn doom_loop_asks_at_threshold() {
        let failures = vec![
            "npm install".to_string(),
            "npm install".to_string(),
            "npm install".to_string(),
        ];
        assert_eq!(doom_loop_check(&failures, "npm install"), PermissionDecision::Ask);
    }

    #[test]
    fn doom_loop_resets_on_different_command() {
        let failures = vec![
            "npm install".to_string(),
            "npm install".to_string(),
            "npm install".to_string(),
            "git status".to_string(),
        ];
        // After git status, the consecutive npm failures are broken
        assert_eq!(doom_loop_check(&failures, "npm install"), PermissionDecision::Allow);
    }

    #[test]
    fn build_ruleset_with_defaults() {
        let ruleset = build_ruleset(&[], true);
        assert!(!ruleset.rules.is_empty());
    }

    #[test]
    fn build_ruleset_without_defaults() {
        let ruleset = build_ruleset(&[], false);
        assert!(ruleset.rules.is_empty());
    }

    #[test]
    fn build_ruleset_with_custom_rules() {
        let custom = vec![PermissionRule {
            pattern: "**/*.test.rs".to_string(),
            decision: PermissionDecision::Allow,
            tool_type: "write".to_string(),
            always: false,
            reason: "Test files".to_string(),
        }];
        let ruleset = build_ruleset(&custom, false);
        assert_eq!(ruleset.rules.len(), 1);
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"; cd ai-digital-life; cargo test -p adl-kernel --lib permission_ruleset`
Expected: FAIL — module not declared

- [ ] **Step 3: Wire into lib.rs**

Add to `ai-digital-life/crates/kernel/src/lib.rs`:

```rust
pub mod permission_ruleset;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"; cd ai-digital-life; cargo test -p adl-kernel --lib permission_ruleset`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add ai-digital-life/crates/kernel/src/permission_ruleset.rs ai-digital-life/crates/kernel/src/lib.rs
git commit -m "feat(core): add permission ruleset evaluation with doom loop detection"
```

---

## Task 5: Add Custom Command and Permission IPC Commands

**Files:**
- Create: `ai-digital-life/src-tauri/src/commands/commands_config.rs`
- Create: `ai-digital-life/src-tauri/src/commands/permission.rs`
- Create: `ai-digital-life/src-tauri/src/commands/commands_config_tests.rs`
- Modify: `ai-digital-life/src-tauri/src/commands/mod.rs`
- Modify: `ai-digital-life/src-tauri/src/lib.rs`

- [ ] **Step 1: Write failing test for command and permission IPC logic**

Create `ai-digital-life/src-tauri/src/commands/commands_config_tests.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::super::commands_config::*;
    use super::super::permission::*;
    use adl_kernel::types::commands::CommandConfig;
    use adl_kernel::types::permission::{PermissionRule, PermissionDecision};
    use tempfile::TempDir;

    fn fresh_data_dir() -> TempDir {
        tempfile::tempdir().expect("failed to create temp dir")
    }

    #[tokio::test]
    async fn list_custom_commands_returns_empty_for_fresh_config() {
        let dir = fresh_data_dir();
        let result = list_custom_commands(dir.path().to_string_lossy().to_string()).await;
        assert!(result.is_ok());
        assert!(result.unwrap().is_empty());
    }

    #[tokio::test]
    async fn add_custom_command_rejects_duplicate_name() {
        let dir = fresh_data_dir();
        let dir_path = dir.path().to_string_lossy().to_string();
        let cmd = CommandConfig {
            name: "review".to_string(),
            description: "Review code".to_string(),
            template: "Please review $ARGUMENTS".to_string(),
            agent: None,
            model: None,
        };
        // First add succeeds
        let first = add_custom_command(dir_path.clone(), cmd.clone()).await;
        assert!(first.is_ok());
        // Second add with same name fails
        let second = add_custom_command(dir_path.clone(), cmd).await;
        assert!(second.is_err());
        let err = second.unwrap_err();
        assert!(matches!(err, adl_errors::AppError::InvalidInput(_)));
    }

    #[tokio::test]
    async fn evaluate_permission_returns_allow_for_safe_command_by_default() {
        let dir = fresh_data_dir();
        let dir_path = dir.path().to_string_lossy().to_string();
        // Reading a file with read tool should be allowed by default
        let decision = evaluate_permission(
            dir_path,
            "read_file".to_string(),
            "cat".to_string(),
            vec!["README.md".to_string()],
        ).await;
        assert!(decision.is_ok());
        // Default ruleset should allow safe read operations
        assert_eq!(decision.unwrap(), PermissionDecision::Allow);
    }

    #[tokio::test]
    async fn delete_permission_rule_rejects_out_of_bounds_index() {
        let dir = fresh_data_dir();
        let dir_path = dir.path().to_string_lossy().to_string();
        let result = delete_permission_rule(dir_path, 999).await;
        assert!(result.is_err());
        assert!(matches!(result.unwrap_err(), adl_errors::AppError::NotFound(_)));
    }
}
```

- [ ] **Step 2: Verify test fails to compile (commands don't exist yet)**

Run: `$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"; cd ai-digital-life; cargo test -p adl-app commands_config_tests --no-run`
Expected: FAIL — compilation error (`unresolved module commands_config`)

- [ ] **Step 3: Create commands_config.rs**

Create `ai-digital-life/src-tauri/src/commands/commands_config.rs`:

```rust
use adl_kernel::types::commands::CommandConfig;
use adl_kernel::config::{load, save};
use std::sync::Mutex;

static COMMANDS_LOCK: std::sync::LazyLock<Mutex<()>> = std::sync::LazyLock::new(|| Mutex::new(()));

#[tauri::command]
pub async fn list_custom_commands(data_dir: String) -> Result<Vec<CommandConfig>, adl_errors::AppError> {
    let config = load(std::path::Path::new(&data_dir))?;
    Ok(config.commands)
}

#[tauri::command]
pub async fn add_custom_command(
    data_dir: String,
    command: CommandConfig,
) -> Result<Vec<CommandConfig>, adl_errors::AppError> {
    let _lock = COMMANDS_LOCK.lock().unwrap();
    let mut config = load(std::path::Path::new(&data_dir))?;

    // Check for name conflict
    if config.commands.iter().any(|c| c.name == command.name) {
        return Err(adl_errors::AppError::InvalidInput(format!("Command '{}' already exists", command.name)));
    }

    config.commands.push(command);
    save(std::path::Path::new(&data_dir), &config)?;
    Ok(config.commands)
}

#[tauri::command]
pub async fn update_custom_command(
    data_dir: String,
    name: String,
    command: CommandConfig,
) -> Result<Vec<CommandConfig>, adl_errors::AppError> {
    let _lock = COMMANDS_LOCK.lock().unwrap();
    let mut config = load(std::path::Path::new(&data_dir))?;

    if let Some(pos) = config.commands.iter().position(|c| c.name == name) {
        config.commands[pos] = command;
    } else {
        return Err(adl_errors::AppError::NotFound(format!("Command '{}' not found", name)));
    }

    save(std::path::Path::new(&data_dir), &config)?;
    Ok(config.commands)
}

#[tauri::command]
pub async fn delete_custom_command(
    data_dir: String,
    name: String,
) -> Result<Vec<CommandConfig>, adl_errors::AppError> {
    let _lock = COMMANDS_LOCK.lock().unwrap();
    let mut config = load(std::path::Path::new(&data_dir))?;

    config.commands.retain(|c| c.name != name);
    save(std::path::Path::new(&data_dir), &config)?;
    Ok(config.commands)
}

#[tauri::command]
pub async fn render_command_template(
    template: String,
    args: Vec<String>,
    workspace: String,
) -> Result<String, adl_errors::AppError> {
    Ok(CommandConfig::render_template(&template, &args, &workspace))
}
```

- [ ] **Step 4: Create permission.rs**

Create `ai-digital-life/src-tauri/src/commands/permission.rs`:

```rust
use adl_kernel::types::permission::{PermissionRule, PermissionRulesetConfig, PermissionRuleset, PermissionDecision};
use adl_kernel::permission_ruleset::build_ruleset;
use adl_kernel::config::{load, save};

#[tauri::command]
pub async fn list_permission_rules(data_dir: String) -> Result<PermissionRulesetConfig, adl_errors::AppError> {
    let config = load(std::path::Path::new(&data_dir))?;
    Ok(config.permissions)
}

#[tauri::command]
pub async fn add_permission_rule(
    data_dir: String,
    rule: PermissionRule,
) -> Result<PermissionRulesetConfig, adl_errors::AppError> {
    let mut config = load(std::path::Path::new(&data_dir))?;
    config.permissions.custom_rules.push(rule);
    save(std::path::Path::new(&data_dir), &config)?;
    Ok(config.permissions)
}

#[tauri::command]
pub async fn delete_permission_rule(
    data_dir: String,
    index: usize,
) -> Result<PermissionRulesetConfig, adl_errors::AppError> {
    let mut config = load(std::path::Path::new(&data_dir))?;
    if index >= config.permissions.custom_rules.len() {
        return Err(adl_errors::AppError::NotFound(format!("Rule index {} out of bounds", index)));
    }
    config.permissions.custom_rules.remove(index);
    save(std::path::Path::new(&data_dir), &config)?;
    Ok(config.permissions)
}

#[tauri::command]
pub async fn set_permission_include_defaults(
    data_dir: String,
    include: bool,
) -> Result<PermissionRulesetConfig, adl_errors::AppError> {
    let mut config = load(std::path::Path::new(&data_dir))?;
    config.permissions.include_defaults = include;
    save(std::path::Path::new(&data_dir), &config)?;
    Ok(config.permissions)
}

#[tauri::command]
pub async fn evaluate_permission(
    data_dir: String,
    tool_name: String,
    command: String,
    args: Vec<String>,
) -> Result<PermissionDecision, adl_errors::AppError> {
    let config = load(std::path::Path::new(&data_dir))?;
    let ruleset = build_ruleset(&config.permissions.custom_rules, config.permissions.include_defaults);
    Ok(ruleset.evaluate(&tool_name, &command, &args))
}
```

- [ ] **Step 5: Register commands**

In `ai-digital-life/src-tauri/src/commands/mod.rs`, add:

```rust
pub mod commands_config;
pub mod permission;
#[cfg(test)]
mod commands_config_tests;
```

In `ai-digital-life/src-tauri/src/lib.rs`, add to invoke_handler:

```rust
commands::commands_config::list_custom_commands,
commands::commands_config::add_custom_command,
commands::commands_config::update_custom_command,
commands::commands_config::delete_custom_command,
commands::commands_config::render_command_template,
commands::permission::list_permission_rules,
commands::permission::add_permission_rule,
commands::permission::delete_permission_rule,
commands::permission::set_permission_include_defaults,
commands::permission::evaluate_permission,
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"; cd ai-digital-life; cargo test -p adl-app commands_config_tests`
Expected: PASS — all 4 tests pass (list returns empty, duplicate rejected, evaluate returns Allow for safe command, out-of-bounds index rejected)

- [ ] **Step 7: Verify compilation**

Run: `$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"; cd ai-digital-life; cargo check -p adl-app`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add ai-digital-life/src-tauri/src/commands/
git commit -m "feat(ipc): add custom command and permission ruleset management commands with TDD coverage"
```

---

## Task 6: Add Frontend IPC for Commands and Permissions

**Files:**
- Create: `ai-digital-life/frontend/src/shared/ipc/commands_config.ts`
- Create: `ai-digital-life/frontend/src/shared/ipc/permission.ts`
- Modify: `index.ts`, `digital-life.ts`, all three bridges

- [ ] **Step 1: Create commands_config.ts**

Create `ai-digital-life/frontend/src/shared/ipc/commands_config.ts`:

```typescript
import type { IpcResult } from './shared';
import type { AgentConfig } from './agent';

export interface CommandHint {
  variable: string;
  description: string;
  required: boolean;
}

export interface CommandConfig {
  name: string;
  description: string;
  agent: AgentConfig['id'];
  model: string | null;
  template: string;
  subtask: boolean;
  hints: CommandHint[];
}

export interface CommandsConfigBridge {
  listCustomCommands(dataDir: string): Promise<IpcResult<CommandConfig[]>>;
  addCustomCommand(dataDir: string, command: CommandConfig): Promise<IpcResult<CommandConfig[]>>;
  updateCustomCommand(dataDir: string, name: string, command: CommandConfig): Promise<IpcResult<CommandConfig[]>>;
  deleteCustomCommand(dataDir: string, name: string): Promise<IpcResult<CommandConfig[]>>;
  renderCommandTemplate(template: string, args: string[], workspace: string): Promise<IpcResult<string>>;
}
```

- [ ] **Step 2: Create permission.ts**

Create `ai-digital-life/frontend/src/shared/ipc/permission.ts`:

```typescript
import type { IpcResult } from './shared';

export type PermissionDecision = 'allow' | 'ask' | 'deny';

export interface PermissionRule {
  pattern: string;
  decision: PermissionDecision;
  tool_type: string;
  always: boolean;
  reason: string;
}

export interface PermissionRulesetConfig {
  custom_rules: PermissionRule[];
  include_defaults: boolean;
}

export interface PermissionBridge {
  listPermissionRules(dataDir: string): Promise<IpcResult<PermissionRulesetConfig>>;
  addPermissionRule(dataDir: string, rule: PermissionRule): Promise<IpcResult<PermissionRulesetConfig>>;
  deletePermissionRule(dataDir: string, index: number): Promise<IpcResult<PermissionRulesetConfig>>;
  setPermissionIncludeDefaults(dataDir: string, include: boolean): Promise<IpcResult<PermissionRulesetConfig>>;
  evaluatePermission(dataDir: string, toolName: string, command: string, args: string[]): Promise<IpcResult<PermissionDecision>>;
}
```

- [ ] **Step 3: Wire into DigitalLifeBridge and implement in 3 bridges**

Add `commandsConfig: CommandsConfigBridge` and `permission: PermissionBridge` to `DigitalLifeBridge`. Implement in all three bridges.

- [ ] **Step 4: Verify TypeScript compiles**

Run: `$env:Path = "D:\Program Files\nodejs;$env:Path"; cd ai-digital-life/frontend; pnpm run typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add ai-digital-life/frontend/src/shared/ipc/ ai-digital-life/frontend/src/tauri-bridge/ ai-digital-life/frontend/src/preview-bridge/ ai-digital-life/frontend/src/mock-bridge/
git commit -m "feat(ipc): add CommandsConfigBridge and PermissionBridge interfaces"
```

---

## Task 7: Update SlashCommandPopover to Load from Config

**Files:**
- Modify: `ai-digital-life/frontend/src/app/components/conversation/SlashCommandPopover.tsx`
- Create: `ai-digital-life/frontend/src/app/stores/slices/commandSlice.ts`
- Create: `ai-digital-life/frontend/src/app/stores/actions/commandActions.ts`
- Modify: `createStore.ts`

- [ ] **Step 1: Create commandSlice.ts**

Create `ai-digital-life/frontend/src/app/stores/slices/commandSlice.ts`:

```typescript
import type { CommandConfig } from '@ai-digital-life/shared/ipc';

export interface CommandState {
  builtinCommands: CommandConfig[];
  customCommands: CommandConfig[];
  isFetching: boolean;
}

// 6 built-in commands (existing hardcoded ones)
export const initialCommandState: CommandState = {
  builtinCommands: [
    { name: 'plan', description: 'Plan mode (read-only analysis)', agent: 'plan', model: null, template: '$ARGUMENTS', subtask: false, hints: [] },
    { name: 'edit', description: 'Edit code', agent: 'build', model: null, template: '$ARGUMENTS', subtask: false, hints: [] },
    { name: 'fix', description: 'Fix a bug', agent: 'build', model: null, template: 'Fix the following bug: $ARGUMENTS', subtask: false, hints: [] },
    { name: 'explain', description: 'Explain code', agent: 'build', model: null, template: 'Explain the following: $ARGUMENTS', subtask: false, hints: [] },
    { name: 'test', description: 'Write tests', agent: 'build', model: null, template: 'Write tests for: $ARGUMENTS', subtask: false, hints: [] },
    { name: 'review', description: 'Code review', agent: 'build', model: null, template: 'Review the following: $ARGUMENTS', subtask: false, hints: [] },
  ],
  customCommands: [],
  isFetching: false,
};
```

- [ ] **Step 2: Create commandActions.ts**

Create `ai-digital-life/frontend/src/app/stores/actions/commandActions.ts`:

```typescript
import type { DigitalLifeBridge, CommandConfig } from '@ai-digital-life/shared/ipc';
import { clearError, captureError } from './shared';

export interface CommandActions {
  fetchCustomCommands: (dataDir: string) => Promise<void>;
  addCustomCommand: (dataDir: string, command: CommandConfig) => Promise<void>;
  updateCustomCommand: (dataDir: string, name: string, command: CommandConfig) => Promise<void>;
  deleteCustomCommand: (dataDir: string, name: string) => Promise<void>;
}

export const createCommandActions = (set: any, get: any, bridge: DigitalLifeBridge): CommandActions => ({
  fetchCustomCommands: async (dataDir: string) => {
    set({ isFetching: true });
    clearError(get);
    try {
      const result = await bridge.commandsConfig.listCustomCommands(dataDir);
      if (result.ok) {
        set({ customCommands: result.data });
      } else {
        captureError(get, result.error?.message ?? 'Failed to fetch commands');
      }
    } catch (e) {
      captureError(get, e);
    } finally {
      set({ isFetching: false });
    }
  },

  addCustomCommand: async (dataDir: string, command: CommandConfig) => {
    clearError(get);
    try {
      const result = await bridge.commandsConfig.addCustomCommand(dataDir, command);
      if (result.ok) {
        set({ customCommands: result.data });
      } else {
        captureError(get, result.error?.message ?? 'Failed to add command');
      }
    } catch (e) {
      captureError(get, e);
    }
  },

  updateCustomCommand: async (dataDir: string, name: string, command: CommandConfig) => {
    clearError(get);
    try {
      const result = await bridge.commandsConfig.updateCustomCommand(dataDir, name, command);
      if (result.ok) {
        set({ customCommands: result.data });
      } else {
        captureError(get, result.error?.message ?? 'Failed to update command');
      }
    } catch (e) {
      captureError(get, e);
    }
  },

  deleteCustomCommand: async (dataDir: string, name: string) => {
    clearError(get);
    try {
      const result = await bridge.commandsConfig.deleteCustomCommand(dataDir, name);
      if (result.ok) {
        set({ customCommands: result.data });
      } else {
        captureError(get, result.error?.message ?? 'Failed to delete command');
      }
    } catch (e) {
      captureError(get, e);
    }
  },
});
```

- [ ] **Step 3: Update SlashCommandPopover to merge built-in and custom commands**

Read the current `SlashCommandPopover.tsx`, then modify it to:
1. Subscribe to `builtinCommands` and `customCommands` from store
2. Merge both lists for display
3. When a custom command is selected, render its template with user-provided arguments
4. Send the rendered prompt to the agent specified in the command config

Key changes:

```tsx
import { useAppStore } from '../../stores/createStore';

// Inside component:
const builtinCommands = useAppStore((s) => s.builtinCommands);
const customCommands = useAppStore((s) => s.customCommands);
const allCommands = [...builtinCommands, ...customCommands];

// Filter and display allCommands instead of hardcoded list
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `$env:Path = "D:\Program Files\nodejs;$env:Path"; cd ai-digital-life/frontend; pnpm run typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add ai-digital-life/frontend/src/app/stores/ ai-digital-life/frontend/src/app/components/conversation/SlashCommandPopover.tsx
git commit -m "feat(frontend): load slash commands from config (built-in + custom)"
```

---

## Task 8: Build Command Editor UI

**Files:**
- Create: `ai-digital-life/frontend/src/app/features/command-editor/CommandEditor.tsx`
- Create: `ai-digital-life/frontend/src/app/features/command-editor/CommandList.tsx`
- Modify: locale files

- [ ] **Step 1: Add i18n keys**

Add to locale files:

```json
{
  "commands": {
    "editor": {
      "title": "自定义命令",
      "name": "命令名称",
      "description": "描述",
      "agent": "使用的 Agent",
      "model": "模型（可选）",
      "template": "模板",
      "subtask": "作为子任务运行",
      "variables": "可用变量：$1, $2, $ARGUMENTS, $WORKSPACE",
      "add": "添加命令",
      "edit": "编辑命令",
      "delete": "删除命令",
      "save": "保存",
      "cancel": "取消",
      "nameRequired": "命令名称不能为空",
      "templateRequired": "模板不能为空",
      "nameExists": "命令名称已存在"
    }
  }
}
```

- [ ] **Step 2: Create CommandList.tsx**

Lists all custom commands with edit/delete buttons. Shows empty state when no custom commands exist.

- [ ] **Step 3: Create CommandEditor.tsx**

A form with fields: name, description, agent (dropdown), model (optional), template (textarea), subtask (checkbox). Shows variable hints. On save, calls `addCustomCommand` or `updateCustomCommand`.

```tsx
import { useState } from 'react';
import { useAppStore } from '../../stores/createStore';
import { useTCopy } from '../../i18n/useTCopy';
import type { CommandConfig } from '@ai-digital-life/shared/ipc';

export function CommandEditor({ onClose, editing }: { onClose: () => void; editing?: CommandConfig }) {
  const t = useTCopy();
  const addCustomCommand = useAppStore((s) => s.addCustomCommand);
  const updateCustomCommand = useAppStore((s) => s.updateCustomCommand);
  const customCommands = useAppStore((s) => s.customCommands);
  const dataDir = useAppStore((s) => s.appDataDir);

  const [name, setName] = useState(editing?.name ?? '');
  const [description, setDescription] = useState(editing?.description ?? '');
  const [agent, setAgent] = useState<CommandConfig['agent']>(editing?.agent ?? 'build');
  const [model, setModel] = useState(editing?.model ?? '');
  const [template, setTemplate] = useState(editing?.template ?? '');
  const [subtask, setSubtask] = useState(editing?.subtask ?? false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    if (!name.trim()) {
      setError(t('commands.editor.nameRequired'));
      return;
    }
    if (!template.trim()) {
      setError(t('commands.editor.templateRequired'));
      return;
    }
    if (!editing && customCommands.some((c) => c.name === name)) {
      setError(t('commands.editor.nameExists'));
      return;
    }

    const config: CommandConfig = {
      name: name.trim(),
      description,
      agent,
      model: model || null,
      template,
      subtask,
      hints: [],
    };

    if (editing) {
      await updateCustomCommand(dataDir, editing.name, config);
    } else {
      await addCustomCommand(dataDir, config);
    }
    onClose();
  };

  return (
    <div className="adl-command-editor">
      {/* Form fields here */}
      <button type="button" onClick={handleSave}>{t('commands.editor.save')}</button>
      <button type="button" onClick={onClose}>{t('commands.editor.cancel')}</button>
      {error && <span className="adl-error">{error}</span>}
      <p className="adl-hint">{t('commands.editor.variables')}</p>
    </div>
  );
}
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `$env:Path = "D:\Program Files\nodejs;$env:Path"; cd ai-digital-life/frontend; pnpm run typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add ai-digital-life/frontend/src/app/features/command-editor/ ai-digital-life/frontend/src/locales/
git commit -m "feat(frontend): add command editor UI for custom slash commands"
```

---

## Task 9: Build Permission Ruleset Editor UI

**Files:**
- Create: `ai-digital-life/frontend/src/app/features/permission-settings/PermissionRulesetEditor.tsx`
- Create: `ai-digital-life/frontend/src/app/features/permission-settings/PermissionRulesetList.tsx`
- Modify: locale files

- [ ] **Step 1: Add i18n keys**

Add to locale files:

```json
{
  "permission": {
    "title": "权限规则",
    "rules": {
      "custom": "自定义规则",
      "defaults": "包含默认安全规则",
      "add": "添加规则",
      "delete": "删除",
      "pattern": "匹配模式",
      "decision": "决策",
      "toolType": "工具类型",
      "always": "始终应用",
      "reason": "原因"
    },
    "decisions": {
      "allow": "允许",
      "ask": "询问",
      "deny": "拒绝"
    }
  }
}
```

- [ ] **Step 2: Create PermissionRulesetList.tsx**

Lists default rules (read-only) and custom rules (editable). Shows toggle for `include_defaults`. Has "Add Rule" button.

- [ ] **Step 3: Create PermissionRulesetEditor.tsx**

Form for adding/editing a permission rule: pattern input, decision dropdown (allow/ask/deny), tool_type input, always checkbox, reason input.

```tsx
import { useState } from 'react';
import { useAppStore } from '../../stores/createStore';
import { useTCopy } from '../../i18n/useTCopy';
import type { PermissionRule, PermissionDecision } from '@ai-digital-life/shared/ipc';

export function PermissionRulesetEditor({ onClose }: { onClose: () => void }) {
  const t = useTCopy();
  const addPermissionRule = useAppStore((s) => s.addPermissionRule);
  const dataDir = useAppStore((s) => s.appDataDir);

  const [pattern, setPattern] = useState('');
  const [decision, setDecision] = useState<PermissionDecision>('ask');
  const [toolType, setToolType] = useState('');
  const [always, setAlways] = useState(true);
  const [reason, setReason] = useState('');

  const handleSave = async () => {
    const rule: PermissionRule = {
      pattern,
      decision,
      tool_type: toolType,
      always,
      reason,
    };
    await addPermissionRule(dataDir, rule);
    onClose();
  };

  return (
    <div className="adl-permission-editor">
      {/* Form fields */}
      <button type="button" onClick={handleSave}>{t('permission.rules.add')}</button>
      <button type="button" onClick={onClose}>{t('commands.editor.cancel')}</button>
    </div>
  );
}
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `$env:Path = "D:\Program Files\nodejs;$env:Path"; cd ai-digital-life/frontend; pnpm run typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add ai-digital-life/frontend/src/app/features/permission-settings/ ai-digital-life/frontend/src/locales/
git commit -m "feat(frontend): add permission ruleset editor UI"
```

---

## Task 10: End-to-End Verification

- [ ] **Step 1: Run Rust tests**

Run: `$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"; cd ai-digital-life; cargo test --workspace`
Expected: All tests pass

- [ ] **Step 2: Run Rust lints**

Run: `$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"; cd ai-digital-life; cargo clippy --workspace -- -D warnings`
Expected: No warnings

- [ ] **Step 3: Run frontend checks**

Run: `$env:Path = "D:\Program Files\nodejs;$env:Path"; cd ai-digital-life/frontend; pnpm run typecheck; pnpm test; pnpm run lint`
Expected: All pass

- [ ] **Step 4: Commit any fixes**

```bash
git add -A
git commit -m "chore: lint and format fixes from Phase 2-D verification"
```

---

## Self-Review Notes

**Spec coverage:**
- ✅ Custom command config: Tasks 2, 3, 5, 6, 7, 8 (CommandConfig type, AppConfig extension, IPC, SlashCommandPopover update, editor UI)
- ✅ Permission system upgrade to Ruleset: Tasks 1, 3, 4, 5, 6, 9 (PermissionRuleset types, AppConfig, evaluation module, IPC, editor UI)
- ✅ Template variables ($1, $ARGUMENTS, $WORKSPACE): Task 2 (extract_variables + render_template)
- ✅ Wildcard pattern matching (* and **): Task 1 (pattern_matches function)
- ✅ Special rules (.env, doom_loop, external_directory): Task 4 (default_rules + doom_loop_check + is_external_directory)
- ✅ Backward compatibility: Task 4 (risk_to_decision bridges old RiskLevel to new PermissionDecision)

**Type consistency:**
- `PermissionDecision` variants: allow/ask/deny (lowercase serde) — matches TS
- `PermissionRule` fields: pattern, decision, tool_type (snake_case in both Rust and TS)
- `CommandConfig` fields: name, description, agent, model, template, subtask, hints — consistent
- `AgentId` from Phase 2-A reused in CommandConfig.agent

**No new dependencies:** Pure architecture/config changes as specified in doc 08.
