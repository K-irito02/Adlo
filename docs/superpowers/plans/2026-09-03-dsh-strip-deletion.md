# DSH 插件化剥离 — 一次性全删实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 ADL 项目中被 dsh 接管的功能模块彻底删除，使 ADL 变为 dsh 的插件壳层

**Architecture:** 一次性全删，按 Rust crates → Server → src-tauri → tools/types/kernel → workspace → Frontend 的顺序执行，每步验证编译

**Tech Stack:** Rust (Cargo), TypeScript (pnpm), Tauri 2.x

## Global Constraints

- 分支: `refactor/strip-20260903`
- 删除后保留: browser, terminal, workspace, editor/patch, git, settings, i18n, Tauri shell
- 验证标准: `cargo check --workspace` 通过, `cargo clippy` 无新增 warning, `pnpm typecheck` 通过, `pnpm lint` 无新增 error
- 执行策略: 一次性全删（不分阶段）

---

## Task 1: Delete 7 Rust Crate Directories

**Files:**
- Delete: `ai-digital-life/crates/agent-runtime/` (entire directory)
- Delete: `ai-digital-life/crates/subagent/` (entire directory)
- Delete: `ai-digital-life/crates/task/` (entire directory)
- Delete: `ai-digital-life/crates/conversation/` (entire directory)
- Delete: `ai-digital-life/crates/context/` (entire directory)
- Delete: `ai-digital-life/crates/model-gateway/` (entire directory)
- Delete: `ai-digital-life/crates/command/` (entire directory)

**Interfaces:**
- Consumes: none
- Produces: removes 7 crate directories and their Cargo.toml, src/ trees

- [ ] **Step 1: Delete agent-runtime crate**

```bash
rm -rf ai-digital-life/crates/agent-runtime
```

- [ ] **Step 2: Delete subagent crate**

```bash
rm -rf ai-digital-life/crates/subagent
```

- [ ] **Step 3: Delete task crate**

```bash
rm -rf ai-digital-life/crates/task
```

- [ ] **Step 4: Delete conversation crate**

```bash
rm -rf ai-digital-life/crates/conversation
```

- [ ] **Step 5: Delete context crate**

```bash
rm -rf ai-digital-life/crates/context
```

- [ ] **Step 6: Delete model-gateway crate**

```bash
rm -rf ai-digital-life/crates/model-gateway
```

- [ ] **Step 7: Delete command crate**

```bash
rm -rf ai-digital-life/crates/command
```

- [ ] **Step 8: Verify directories deleted**

```bash
ls ai-digital-life/crates/ | grep -E "agent-runtime|subagent|task|conversation|context|model-gateway|command"
```

Expected: no output (all directories removed)

---

## Task 2: Delete Server Handler and Internal Files

**Files:**
- Delete: `ai-digital-life/crates/server/src/agent_loop.rs`
- Delete: `ai-digital-life/crates/server/src/engine.rs`
- Delete: `ai-digital-life/crates/server/src/state.rs`
- Delete: `ai-digital-life/crates/server/src/sse_server.rs`
- Delete: `ai-digital-life/crates/server/src/sse.rs`
- Delete: `ai-digital-life/crates/server/src/handlers/agent.rs`
- Delete: `ai-digital-life/crates/server/src/handlers/agent_pipeline.rs`
- Delete: `ai-digital-life/crates/server/src/handlers/subagent.rs`
- Delete: `ai-digital-life/crates/server/src/handlers/task.rs`
- Delete: `ai-digital-life/crates/server/src/handlers/custom_agent.rs`
- Delete: `ai-digital-life/crates/server/src/handlers/run_activity.rs`
- Delete: `ai-digital-life/crates/server/src/handlers/compaction.rs`
- Delete: `ai-digital-life/crates/server/src/handlers/session_fork.rs`
- Delete: `ai-digital-life/crates/server/src/handlers/command.rs`
- Delete: `ai-digital-life/crates/server/src/handlers/permission.rs`
- Delete: `ai-digital-life/crates/server/src/handlers/provider.rs`
- Delete: `ai-digital-life/crates/server/src/handlers/conversation.rs`

**Interfaces:**
- Consumes: Task 1 (crates removed)
- Produces: removes 17 server source files

- [ ] **Step 1: Delete server internal files**

```bash
rm -f ai-digital-life/crates/server/src/agent_loop.rs
rm -f ai-digital-life/crates/server/src/engine.rs
rm -f ai-digital-life/crates/server/src/state.rs
rm -f ai-digital-life/crates/server/src/sse_server.rs
rm -f ai-digital-life/crates/server/src/sse.rs
```

- [ ] **Step 2: Delete server handler files**

```bash
rm -f ai-digital-life/crates/server/src/handlers/agent.rs
rm -f ai-digital-life/crates/server/src/handlers/agent_pipeline.rs
rm -f ai-digital-life/crates/server/src/handlers/subagent.rs
rm -f ai-digital-life/crates/server/src/handlers/task.rs
rm -f ai-digital-life/crates/server/src/handlers/custom_agent.rs
rm -f ai-digital-life/crates/server/src/handlers/run_activity.rs
rm -f ai-digital-life/crates/server/src/handlers/compaction.rs
rm -f ai-digital-life/crates/server/src/handlers/session_fork.rs
rm -f ai-digital-life/crates/server/src/handlers/command.rs
rm -f ai-digital-life/crates/server/src/handlers/permission.rs
rm -f ai-digital-life/crates/server/src/handlers/provider.rs
rm -f ai-digital-life/crates/server/src/handlers/conversation.rs
```

- [ ] **Step 3: Verify files deleted**

```bash
ls ai-digital-life/crates/server/src/handlers/ | grep -E "agent|subagent|task|custom_agent|run_activity|compaction|session_fork|command|permission|provider|conversation"
```

Expected: no output

---

## Task 3: Clean Server Residual References

**Files:**
- Modify: `ai-digital-life/crates/server/src/handlers/mod.rs` — remove deleted handler `pub mod` declarations
- Modify: `ai-digital-life/crates/server/src/lib.rs` — remove deleted module `mod` declarations
- Modify: `ai-digital-life/crates/server/Cargo.toml` — remove dependencies on deleted crates
- Modify: `ai-digital-life/crates/server/src/handlers/patch.rs` — remove agent-runtime references
- Modify: `ai-digital-life/crates/server/src/handlers/reference.rs` — remove context crate references

**Interfaces:**
- Consumes: Task 2 (files deleted)
- Produces: server crate compiles without references to deleted modules

- [ ] **Step 1: Read and clean handlers/mod.rs**

Read `ai-digital-life/crates/server/src/handlers/mod.rs`, identify all `pub mod` declarations for deleted handlers, remove them.

- [ ] **Step 2: Read and clean lib.rs**

Read `ai-digital-life/crates/server/src/lib.rs`, identify all `mod` declarations for deleted modules (agent_loop, engine, state, sse_server, sse), remove them.

- [ ] **Step 3: Read and clean Cargo.toml**

Read `ai-digital-life/crates/server/Cargo.toml`, identify `[dependencies]` entries for deleted crates (adl-agent-runtime, adl-subagent, adl-task, adl-conversation, adl-context, adl-model-gateway, adl-command), remove them.

- [ ] **Step 4: Read and clean patch.rs**

Read `ai-digital-life/crates/server/src/handlers/patch.rs`, identify references to agent-runtime (`mark_applying`, `mark_verifying`, `complete_after_patch`), remove or stub them.

- [ ] **Step 5: Read and clean reference.rs**

Read `ai-digital-life/crates/server/src/handlers/reference.rs`, identify references to context crate (`references_prompt`, `validate_reference`), remove or stub them.

---

## Task 4: Delete Server Test Files

**Files:**
- Delete: `ai-digital-life/crates/server/tests/agent.rs`
- Delete: `ai-digital-life/crates/server/tests/agent_pipeline.rs`
- Delete: `ai-digital-life/crates/server/tests/subagent.rs`
- Delete: `ai-digital-life/crates/server/tests/task.rs`
- Delete: `ai-digital-life/crates/server/tests/command.rs`
- Delete: `ai-digital-life/crates/server/tests/permission.rs`
- Delete: `ai-digital-life/crates/server/tests/conversation_api.rs`
- Delete: `ai-digital-life/crates/server/tests/provider.rs`
- Delete: `ai-digital-life/crates/server/tests/session_fork.rs`
- Delete: `ai-digital-life/crates/server/tests/compaction.rs`
- Delete: `ai-digital-life/crates/server/tests/custom_agent.rs`
- Delete: `ai-digital-life/crates/server/tests/run_activity.rs`
- Delete: `ai-digital-life/crates/server/tests/sse_stream.rs`

**Interfaces:**
- Consumes: Task 2 (handler files deleted)
- Produces: removes 13 test files

- [ ] **Step 1: Delete all server test files**

```bash
rm -f ai-digital-life/crates/server/tests/agent.rs
rm -f ai-digital-life/crates/server/tests/agent_pipeline.rs
rm -f ai-digital-life/crates/server/tests/subagent.rs
rm -f ai-digital-life/crates/server/tests/task.rs
rm -f ai-digital-life/crates/server/tests/command.rs
rm -f ai-digital-life/crates/server/tests/permission.rs
rm -f ai-digital-life/crates/server/tests/conversation_api.rs
rm -f ai-digital-life/crates/server/tests/provider.rs
rm -f ai-digital-life/crates/server/tests/session_fork.rs
rm -f ai-digital-life/crates/server/tests/compaction.rs
rm -f ai-digital-life/crates/server/tests/custom_agent.rs
rm -f ai-digital-life/crates/server/tests/run_activity.rs
rm -f ai-digital-life/crates/server/tests/sse_stream.rs
```

- [ ] **Step 2: Verify test files deleted**

```bash
ls ai-digital-life/crates/server/tests/ | grep -E "agent|subagent|task|command|permission|conversation|provider|session_fork|compaction|custom_agent|run_activity|sse_stream"
```

Expected: no output

---

## Task 5: Delete/Clean src-tauri Files

**Files:**
- Delete: `ai-digital-life/src-tauri/src/commands/provider.rs`
- Modify: `ai-digital-life/src-tauri/src/state.rs` — remove ProviderRegistry reference
- Modify: `ai-digital-life/src-tauri/src/setup.rs` — remove model-gateway imports and init logic
- Modify: `ai-digital-life/src-tauri/src/commands/app.rs` — remove ModelGateway::new logic
- Modify: `ai-digital-life/src-tauri/Cargo.toml` — remove adl-model-gateway dependency

**Interfaces:**
- Consumes: Task 1 (model-gateway crate removed)
- Produces: src-tauri compiles without model-gateway references

- [ ] **Step 1: Delete provider.rs command**

```bash
rm -f ai-digital-life/src-tauri/src/commands/provider.rs
```

- [ ] **Step 2: Read and clean state.rs**

Read `ai-digital-life/src-tauri/src/state.rs`, identify `ProviderRegistry` references, remove them.

- [ ] **Step 3: Read and clean setup.rs**

Read `ai-digital-life/src-tauri/src/setup.rs`, identify model-gateway imports (`use adl_model_gateway::*`) and initialization logic, remove them.

- [ ] **Step 4: Read and clean commands/app.rs**

Read `ai-digital-life/src-tauri/src/commands/app.rs`, identify `ModelGateway::new` references, remove them.

- [ ] **Step 5: Read and clean Cargo.toml**

Read `ai-digital-life/src-tauri/Cargo.toml`, identify `adl-model-gateway` dependency, remove it.

---

## Task 6: Delete/Clean crates/tools

**Files:**
- Delete: `ai-digital-life/crates/tools/src/task.rs`
- Modify: `ai-digital-life/crates/tools/src/bash.rs` — remove adl_command references
- Modify: `ai-digital-life/crates/tools/Cargo.toml` — remove adl-subagent and adl-command dependencies

**Interfaces:**
- Consumes: Task 1 (subagent, command crates removed)
- Produces: crates/tools compiles without subagent/command references

- [ ] **Step 1: Delete task.rs**

```bash
rm -f ai-digital-life/crates/tools/src/task.rs
```

- [ ] **Step 2: Read and clean bash.rs**

Read `ai-digital-life/crates/tools/src/bash.rs`, identify `adl_command::build_request` and `adl_command::run_command` references, remove them.

- [ ] **Step 3: Read and clean Cargo.toml**

Read `ai-digital-life/crates/tools/Cargo.toml`, identify `adl-subagent` and `adl-command` dependencies, remove them.

---

## Task 7: Delete/Clean crates/types

**Files:**
- Delete: `ai-digital-life/crates/types/src/types/agent.rs`
- Delete: `ai-digital-life/crates/types/src/types/model.rs`
- Delete: `ai-digital-life/crates/types/src/types/conversation.rs`
- Delete: `ai-digital-life/crates/types/src/types/command.rs`
- Delete: `ai-digital-life/crates/types/src/permission_types.rs`
- Modify: `ai-digital-life/crates/types/src/types/mod.rs` — remove agent/model/conversation/command module declarations and re-exports
- Modify: `ai-digital-life/crates/types/src/types/config.rs` — remove model-related types and functions

**Interfaces:**
- Consumes: Task 1 (crates removed)
- Produces: crates/types compiles without deleted type definitions

- [ ] **Step 1: Delete type files**

```bash
rm -f ai-digital-life/crates/types/src/types/agent.rs
rm -f ai-digital-life/crates/types/src/types/model.rs
rm -f ai-digital-life/crates/types/src/types/conversation.rs
rm -f ai-digital-life/crates/types/src/types/command.rs
rm -f ai-digital-life/crates/types/src/permission_types.rs
```

- [ ] **Step 2: Read and clean mod.rs**

Read `ai-digital-life/crates/types/src/types/mod.rs`, identify `pub mod agent;`, `pub mod model;`, `pub mod conversation;`, `pub mod command;` and their `pub use` re-exports, remove them.

- [ ] **Step 3: Read and clean config.rs**

Read `ai-digital-life/crates/types/src/types/config.rs`, identify model-related types (`ModelPreferences`, `ModelProviderPreference`, `ModelDefinition`, `ModelCapability`, `ModelTier`, `ModelCost`, `CustomProviderConfig`, `ModelProviderPreferencePatch`) and their impl blocks/tests, remove them.

---

## Task 8: Delete/Clean crates/kernel

**Files:**
- Delete: `ai-digital-life/crates/kernel/src/command_risk.rs`
- Modify: `ai-digital-life/crates/kernel/src/config.rs` — remove permission_types references

**Interfaces:**
- Consumes: Task 7 (permission_types removed)
- Produces: crates/kernel compiles without command_risk and permission_types references

- [ ] **Step 1: Delete command_risk.rs**

```bash
rm -f ai-digital-life/crates/kernel/src/command_risk.rs
```

- [ ] **Step 2: Read and clean config.rs**

Read `ai-digital-life/crates/kernel/src/config.rs`, identify `permission_types` references, remove them.

---

## Task 9: Update Workspace Cargo.toml

**Files:**
- Modify: `ai-digital-life/Cargo.toml` — remove deleted crate members from `[workspace] members`

**Interfaces:**
- Consumes: Tasks 1-8 (all crates deleted/cleaned)
- Produces: workspace member list matches remaining crates

- [ ] **Step 1: Read workspace Cargo.toml**

Read `ai-digital-life/Cargo.toml`, identify `[workspace] members` entries for deleted crates.

- [ ] **Step 2: Remove deleted crate members**

Remove these entries from the members list:
- `"crates/agent-runtime"`
- `"crates/subagent"`
- `"crates/task"`
- `"crates/conversation"`
- `"crates/context"`
- `"crates/model-gateway"`
- `"crates/command"`

---

## Task 10: Verify Rust Compilation

**Files:**
- None (verification only)

**Interfaces:**
- Consumes: Tasks 1-9 (all Rust changes complete)
- Produces: confirmation that Rust codebase compiles

- [ ] **Step 1: Run cargo check**

```bash
cd ai-digital-life && cargo check --workspace
```

Expected: compilation succeeds (or warnings only, no errors)

- [ ] **Step 2: If errors, fix them**

If `cargo check` fails, read the error messages and fix the remaining references in the files modified in Tasks 3, 5, 6, 7, 8, 9.

- [ ] **Step 3: Run cargo clippy**

```bash
cd ai-digital-life && cargo clippy --workspace --all-targets
```

Expected: no new warnings introduced by this deletion

---

## Task 11: Delete Frontend Files

**Files:**
- Delete: all files listed in spec sections 3.9-3.16 (IPC, types, stores, components, features, mock, preview-bridge)

**Interfaces:**
- Consumes: none
- Produces: removes all frontend files related to deleted backend modules

- [ ] **Step 1: Delete IPC files**

```bash
rm -f ai-digital-life/frontend/src/shared/ipc/agent.ts
rm -f ai-digital-life/frontend/src/shared/ipc/subagent.ts
rm -f ai-digital-life/frontend/src/shared/ipc/run-activity.ts
rm -f ai-digital-life/frontend/src/shared/ipc/conversation.ts
rm -f ai-digital-life/frontend/src/shared/ipc/provider.ts
rm -f ai-digital-life/frontend/src/shared/ipc/command.ts
rm -f ai-digital-life/frontend/src/shared/ipc/permission.ts
rm -f ai-digital-life/frontend/src/shared/ipc/commands_config.ts
rm -f ai-digital-life/frontend/src/shared/ipc/compaction.ts
rm -f ai-digital-life/frontend/src/shared/ipc/custom_agent.ts
rm -f ai-digital-life/frontend/src/shared/ipc/session_fork.ts
```

- [ ] **Step 2: Delete type files**

```bash
rm -f ai-digital-life/frontend/src/kernel/types-agent.ts
rm -f ai-digital-life/frontend/src/kernel/types-task.ts
rm -f ai-digital-life/frontend/src/kernel/types-conversation.ts
rm -f ai-digital-life/frontend/src/kernel/types-model.ts
rm -f ai-digital-life/frontend/src/kernel/types-command.ts
```

- [ ] **Step 3: Delete store slices**

```bash
rm -f ai-digital-life/frontend/src/app/stores/slices/agentSlice.ts
rm -f ai-digital-life/frontend/src/app/stores/slices/permissionSlice.ts
rm -f ai-digital-life/frontend/src/app/stores/slices/compactionSlice.ts
rm -f ai-digital-life/frontend/src/app/stores/slices/partStreamSlice.ts
rm -f ai-digital-life/frontend/src/app/stores/slices/providerSlice.ts
rm -f ai-digital-life/frontend/src/app/stores/slices/commandSlice.ts
rm -f ai-digital-life/frontend/src/app/stores/slices/customCommandSlice.ts
rm -f ai-digital-life/frontend/src/app/stores/sessionSelectors.ts
rm -f ai-digital-life/frontend/src/app/stores/conversationUtils.ts
```

- [ ] **Step 4: Delete component files and directories**

```bash
rm -rf ai-digital-life/frontend/src/app/components/agent/
rm -f ai-digital-life/frontend/src/app/components/AgentSelector.tsx
rm -f ai-digital-life/frontend/src/app/components/PlanModeBanner.tsx
rm -f ai-digital-life/frontend/src/app/components/SubagentIndicator.tsx
rm -f ai-digital-life/frontend/src/app/components/Composer.tsx
rm -f ai-digital-life/frontend/src/app/components/MessageBubble.tsx
rm -f ai-digital-life/frontend/src/app/components/MessageStream.tsx
rm -f ai-digital-life/frontend/src/app/components/PromptInput.tsx
rm -f ai-digital-life/frontend/src/app/components/ConfirmDialog.tsx
rm -f ai-digital-life/frontend/src/app/components/EnvironmentControls.tsx
rm -rf ai-digital-life/frontend/src/app/components/session/
rm -rf ai-digital-life/frontend/src/app/components/conversation/
rm -rf ai-digital-life/frontend/src/app/components/models/
```

- [ ] **Step 5: Delete feature modules**

```bash
rm -rf ai-digital-life/frontend/src/app/features/session-fork/
rm -rf ai-digital-life/frontend/src/app/features/part-stream/
rm -rf ai-digital-life/frontend/src/app/features/conversation/
```

- [ ] **Step 6: Delete model shared modules**

```bash
rm -f ai-digital-life/frontend/src/shared/modelCatalog.ts
rm -f ai-digital-life/frontend/src/shared/modelUtils.ts
rm -f ai-digital-life/frontend/src/shared/providerSort.ts
```

- [ ] **Step 7: Delete mock files**

```bash
rm -f ai-digital-life/frontend/src/mock/mock-agent.ts
rm -f ai-digital-life/frontend/src/mock/mock-command.ts
rm -f ai-digital-life/frontend/src/mock/mock-commands-config.ts
rm -f ai-digital-life/frontend/src/mock/mock-conversation.ts
rm -f ai-digital-life/frontend/src/mock/mock-permission.ts
rm -f ai-digital-life/frontend/src/mock/mock-provider.ts
rm -f ai-digital-life/frontend/src/mock/mock-custom-agent.ts
rm -f ai-digital-life/frontend/src/mock/mock-run-activity.ts
rm -f ai-digital-life/frontend/src/mock/mock-session-fork.ts
rm -f ai-digital-life/frontend/src/mock/mock-compaction.ts
```

- [ ] **Step 8: Delete preview bridge files**

```bash
rm -f ai-digital-life/frontend/src/preview-bridge/preview-model.ts
rm -f ai-digital-life/frontend/src/preview-bridge/preview-command.ts
rm -f ai-digital-life/frontend/src/preview-bridge/preview-context.ts
rm -f ai-digital-life/frontend/src/preview-bridge/preview-conversation.ts
rm -f ai-digital-life/frontend/src/preview-bridge/preview-task.ts
```

---

## Task 12: Clean Frontend Residual References

**Files:**
- Modify: `ai-digital-life/frontend/src/shared/ipc/index.ts` — remove deleted IPC module exports
- Modify: any remaining files that import from deleted modules

**Interfaces:**
- Consumes: Task 11 (files deleted)
- Produces: frontend compiles without references to deleted modules

- [ ] **Step 1: Read and clean ipc/index.ts**

Read `ai-digital-life/frontend/src/shared/ipc/index.ts`, identify exports from deleted IPC modules, remove them.

- [ ] **Step 2: Search for remaining imports**

```bash
cd ai-digital-life/frontend && grep -r "from.*ipc/agent\|from.*ipc/subagent\|from.*ipc/run-activity\|from.*ipc/conversation\|from.*ipc/provider\|from.*ipc/command\|from.*ipc/permission\|from.*ipc/commands_config\|from.*ipc/compaction\|from.*ipc/custom_agent\|from.*ipc/session_fork\|from.*kernel/types-agent\|from.*kernel/types-task\|from.*kernel/types-conversation\|from.*kernel/types-model\|from.*kernel/types-command\|from.*stores/slices/agentSlice\|from.*stores/slices/permissionSlice\|from.*stores/slices/compactionSlice\|from.*stores/slices/partStreamSlice\|from.*stores/slices/providerSlice\|from.*stores/slices/commandSlice\|from.*stores/slices/customCommandSlice\|from.*stores/sessionSelectors\|from.*stores/conversationUtils\|from.*components/agent/\|from.*components/AgentSelector\|from.*components/PlanModeBanner\|from.*components/SubagentIndicator\|from.*components/Composer\|from.*components/MessageBubble\|from.*components/MessageStream\|from.*components/PromptInput\|from.*components/ConfirmDialog\|from.*components/EnvironmentControls\|from.*components/session/\|from.*components/conversation/\|from.*components/models/\|from.*features/session-fork/\|from.*features/part-stream/\|from.*features/conversation/\|from.*shared/modelCatalog\|from.*shared/modelUtils\|from.*shared/providerSort\|from.*mock/mock-agent\|from.*mock/mock-command\|from.*mock/mock-commands-config\|from.*mock/mock-conversation\|from.*mock/mock-permission\|from.*mock/mock-provider\|from.*mock/mock-custom-agent\|from.*mock/mock-run-activity\|from.*mock/mock-session-fork\|from.*mock/mock-compaction\|from.*preview-bridge/preview-model\|from.*preview-bridge/preview-command\|from.*preview-bridge/preview-context\|from.*preview-bridge/preview-conversation\|from.*preview-bridge/preview-task" --include="*.ts" --include="*.tsx" -l
```

- [ ] **Step 3: Fix each file with broken imports**

For each file found in Step 2, remove the broken import lines and any code that depends on them.

- [ ] **Step 4: Re-run search to confirm no remaining references**

Repeat Step 2, expect no output.

---

## Task 13: Verify Frontend Compilation

**Files:**
- None (verification only)

**Interfaces:**
- Consumes: Tasks 11-12 (all frontend changes complete)
- Produces: confirmation that frontend codebase compiles

- [ ] **Step 1: Run typecheck**

```bash
cd ai-digital-life/frontend && pnpm run typecheck
```

Expected: compilation succeeds

- [ ] **Step 2: If errors, fix them**

If `typecheck` fails, read the error messages and fix the remaining references.

- [ ] **Step 3: Run lint**

```bash
cd ai-digital-life/frontend && pnpm run lint
```

Expected: no new errors introduced by this deletion

---

## Task 14: Final Verification and Cleanup

**Files:**
- None (verification only)

**Interfaces:**
- Consumes: Tasks 10, 13 (Rust and Frontend verified)
- Produces: clean build, ready for commit

- [ ] **Step 1: Full Rust check**

```bash
cd ai-digital-life && cargo check --workspace && cargo clippy --workspace --all-targets
```

- [ ] **Step 2: Full Frontend check**

```bash
cd ai-digital-life/frontend && pnpm run typecheck && pnpm run lint
```

- [ ] **Step 3: Check git status**

```bash
git status
```

- [ ] **Step 4: Commit all changes**

```bash
git add -A && git commit -m "refactor(strip): delete agent runtime, model gateway, conversation, command modules

- Delete 7 Rust crates: agent-runtime, subagent, task, conversation, context, model-gateway, command
- Delete server handlers, engine, state, SSE, tests
- Delete src-tauri provider command, clean model-gateway refs
- Clean crates/tools, crates/types, crates/kernel
- Delete frontend IPC, types, stores, components, features, mock, preview-bridge
- Clean all residual imports and references"
```
