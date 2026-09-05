# Agent Residual Purge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 删除项目中全部 agent 残留代码，使项目成为只“拉 dsh 进程 + 开 URL”的纯宿主壳。

**Architecture:** 按逆依赖序一次性全删：Rust types/storage/kernel → tools/mcp-client/lsp-client 整 crate → server/src-tauri 残留 → Cargo members 与 .cargo 白名单 → 前端 generated/ipc/kernel/commandRegistry → stores/actions/mocks/bridges → i18n/styles/CenterPane，最 后全量验证。

**Tech Stack:** Rust stable + Tauri 2.x + tokio + rusqlite + ts-rs，React 19 + Vite + Zustand + TypeScript，pnpm / Cargo，clippy + tsc + eslint + vitest。

**Spec:** `docs/superpowers/specs/2026-09-05-agent-residual-purge-design.md`

## Global Constraints

- 宿主与 dsh 仅“拉进程 + 开 URL”，不 import、不触达、不改动 dsh 内部。
- 未发布阶段禁止数据格式兼容/旧版本迁移代码，禁止向后兼容重导出。
- WebView 直接触达系统能力必须经 Tauri Command；capability 文件禁用 `"all"` / `"**"`。
- 所有 UI 文案必须使用 i18n key，禁止硬编码。
- 所有功能 Tauri 桌面与浏览器双端一致；新增 IPC 必须同步 `tauri-bridge.ts` / `preview-bridge/` / `mock-bridge.ts`（本次是同步裁剪对应 domain）。
- Tauri 桌面悬浮层不得依赖 CSS z-index 盖 WebView2；复用 `browser_set_bounds` 避让。
- Rust 质量门：`cargo clippy --workspace --all-targets -- -D warnings` 零警告；前端：`pnpm --dir frontend run lint` 零 error、`tsc --noEmit` 通过。
- 永久删除即物理删除，不进回收站；`target/debug` 超 30GB 才全量 `cargo clean`。

---

## File Structure

- `ai-digital-life/crates/types/src/types/conversation.rs` — 删除整文件（会话/消息/Subagent 变体类型源）。
- `ai-digital-life/crates/types/src/types/mod.rs:1-26` — 删除 `conversation`/`command-agent` 相关 `pub mod` 与 `pub use`。
- `ai-digital-life/crates/types/src/types/patch_types.rs` — 删除 Agent 段（`AgentId/AgentRunStatus/AgentPlanStep` 及 conversation 引用），保留纯补丁结构。
- `ai-digital-life/crates/types/src/types/commands.rs` — 删除 agent 语义（`AgentId/subtask`）；若整文件仅服务 agent 则删文件。
- `ai-digital-life/crates/types/src/types/config.rs` — 删除模型偏好段及相关函数/测试。
- `ai-digital-life/crates/storage/src/session_crud.rs` — 删除整文件。
- `ai-digital-life/crates/storage/src/entity_table.rs + purge.rs + lib.rs + crud.rs` — 删除 `ConversationMessages/AgentRuns/AgentSteps` 映射、清理与测试。
- `ai-digital-life/crates/migration/` 及 storage 内迁移 — 删除三表建表语句与测试数据，不写兼容迁移。
- `ai-digital-life/crates/kernel/src/events.rs:38,99` — 删除 `AgentRunChanged` 及 `"agent.run-changed"` 映射。
- `ai-digital-life/crates/kernel/src/config.rs` — 删除 `permission_types` 引用。
- `ai-digital-life/crates/tools/`、`ai-digital-life/crates/mcp-client/`、`ai-digital-life/crates/lsp-client/` — 整目录删除。
- `ai-digital-life/Cargo.toml:3-27` — members 移除 `tools/mcp-client/lsp-client`。
- `ai-digital-life/.cargo/config.toml:28-70` — 删除已删 crate 白名单节。
- `ai-digital-life/crates/server/src/handlers/mcp.rs + lsp.rs + commands_config.rs` — 默认删除；仅凭调用链证据保留宿主直连时改为去 agent 引用。
- `ai-digital-life/crates/server/src/handlers/patch.rs + reference.rs + mod.rs + lib.rs + Cargo.toml` — 清理残留 agent 引用。
- `frontend/src/shared/ipc/generated/SubagentTask.ts + SubagentStatus.ts + SubagentId.ts + AgentMode.ts + AgentConfig.ts + AgentId.ts + TaskToolInput.ts + TaskToolOutput.ts` — 随 Rust 源删除自动消除，残留文件手删。
- `frontend/src/shared/ipc/mcp.ts + lsp.ts + index.ts` — 删除 mcp/lsp domain 并清理 export。
- `frontend/src/kernel/types-legacy.ts` — 删除 Conversation Blocks/Sessions/Messages 段。
- `frontend/src/app/commands/commandRegistry.ts + commandRegistry.test.ts` — 删除整文件及引用方。
- `frontend/src/app/regions/right-panel/editor-support/agentDecorations.ts` — 删除及引用方。
- `frontend/src/app/stores/slices/mcpSlice.ts`、`actions/mcpActions.ts`、`actions/lspActions.ts`、`slices/webToolsSlice.ts`、`actions/webToolsActions.ts`、`slices/referenceSlice.ts`、`actions/referenceActions.ts` — 删除 mcp/lsp/web-tools/reference agent 侧（先查调用链，宿主原生能力保留则收窄）。
- `frontend/src/mock/mock-mcp.ts + mock-lsp.ts + mock-web-tools.ts + mock-shared-conversation.ts + mock-shared.ts + mock-shared-patch.ts + mock-bridge.ts` — 删除对应 mock 并清理 re-export。
- `frontend/src/tauri-bridge/`、`frontend/src/preview-bridge/` 对应 mcp/lsp/web-tools domain 文件 — 与 ipc domain 同步删除。
- `frontend/src/app/i18n/zh-CN/{conversation,agent,provider,permission,commands,sessionFork}.ts + en-US 对应 + zh-CN/index.ts + en-US/index.ts + common.ts + workspace.ts` — 删除 agent 域 key 并清理 index。
- `frontend/src/app/i18n/__tests__/keys.test.ts:24-25` — 删除 conversation 域断言。
- `frontend/src/app/stores/actions/generalActions.test.ts:257` — 删除 `conversation:` 夹具。
- `frontend/src/styles/part-stream.css + part-stream-scope.test.ts` — 删除及引用方。
- `frontend/src/app/regions/CenterPane.tsx:20` — `aria-label={t.conversation}` 改为 dsh key。
- `frontend/src/app/regions/left-sidebar/ResizeHandle.tsx + ResizeHandle.utils.ts` — 删除 conversation 高度语义，改为 dsh 或删除。

---

### Task 1: Rust types 瘦身（会话/模型/命令 agent 类型）

**Files:**
- Modify: `ai-digital-life/crates/types/src/types/mod.rs:1-26`
- Modify: `ai-digital-life/crates/types/src/types/patch_types.rs`
- Modify: `ai-digital-life/crates/types/src/types/commands.rs`
- Modify: `ai-digital-life/crates/types/src/types/config.rs`
- Delete: `ai-digital-life/crates/types/src/types/conversation.rs`
- Delete: `ai-digital-life/crates/types/src/permission_types.rs`（仅当 `Test-Path` 存在；当前已不存在则跳过）

**Interfaces:**
- Consumes: 无（首任务）。
- Produces: `adl_types` 不再导出 `ConversationSessionRecord/ConversationMessageRecord/ConversationRole/ConversationScenario/ConversationBlock/AgentId/AgentRunStatus/ModelPreferences` 系列；供 Task 2/3/5 的编译基线。

- [ ] **Step 1: 证明残留存在（只读，不改代码）**

```powershell
git grep -l "ConversationSessionRecord\|ConversationMessageRecord\|AgentRunStatus\|ModelPreferences" -- ai-digital-life/crates/types | head -n 20
```

Run: workdir `E:\AI-DIGITAL-LIFE\SourceWorkspace`, command above.
Expected: 列出 `conversation.rs/patch_types.rs/commands.rs/config.rs/mod.rs`。

- [ ] **Step 2: 先读后改（edit 前必须已 read）**

```powershell
git rm ai-digital-life/crates/types/src/types/conversation.rs
```

Run: workdir `E:\AI-DIGITAL-LIFE\SourceWorkspace`.
Expected: `rm 'ai-digital-life/crates/types/src/types/conversation.rs'`。

- [ ] **Step 3: 清理 `mod.rs` 的 mod 与 re-export**

```rust
// 删除前（mod.rs:1-26 节选）：
pub mod commands;
pub mod config;
pub mod conversation;
// ...
pub use conversation::*;
// 删除后：
pub mod commands;
pub mod config;
// ...
// （无 conversation 导出；commands 导出收窄为 CommandConfig, CommandHint，见文件实际内容）
pub use commands::{CommandConfig, CommandHint};
```

- [ ] **Step 4: 收窄 `patch_types.rs/commands.rs/config.rs` 后编译**

```powershell
cargo check -p adl-types 2>&1 | head -n 60
```

Run: workdir `E:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life`.
Expected: PASS（无 error；若有引用方报错，记录到 Task 5 清单，不在此任务外扩）。

- [ ] **Step 5: Commit**

```powershell
git add ai-digital-life/crates/types && git commit -m "refactor(types): strip agent conversation model command types"
```

---

### Task 2: Rust storage 去会话表（含迁移，不做兼容）

**Files:**
- Delete: `ai-digital-life/crates/storage/src/session_crud.rs`
- Modify: `ai-digital-life/crates/storage/src/entity_table.rs`
- Modify: `ai-digital-life/crates/storage/src/purge.rs`
- Modify: `ai-digital-life/crates/storage/src/lib.rs`
- Modify: `ai-digital-life/crates/storage/src/crud.rs`
- Modify: `ai-digital-life/crates/migration/` 内三表建表迁移（实现时先 `git grep -l "agent_runs\|agent_steps\|conversation_messages" -- ai-digital-life/crates/migration ai-digital-life/crates/storage` 定位确切文件）

**Interfaces:**
- Consumes: Task 1 的类型删除（`ConversationSessionRecord` 已不存在）。
- Produces: storage 不再知晓会话/agent 表；供 Task 9 的测试基线。

- [ ] **Step 1: 定位三表引用**

```powershell
git grep -rn "ConversationMessages\|AgentRuns\|AgentSteps\|conversation_messages\|agent_runs\|agent_steps\|session_crud\|ConversationSessionRecord" -- ai-digital-life/crates/storage ai-digital-life/crates/migration | head -n 40
```

Expected: 列出 `session_crud.rs/entity_table.rs/purge.rs/lib.rs/crud.rs` 及迁移文件。

- [ ] **Step 2: 删除 `session_crud.rs` 并清理 `entity_table.rs/purge.rs/lib.rs`**

```rust
// entity_table.rs 删除前节选：
ConversationMessages => "conversation_messages",
AgentRuns => "agent_runs",
AgentSteps => "agent_steps",
// 删除后：三行整行删除，不留注释占位。
```

```powershell
git rm ai-digital-life/crates/storage/src/session_crud.rs
```

- [ ] **Step 3: 删除 `crud.rs` 内 agent/会话 CRUD 与测试（先 read 定位 `AgentRunRecord/AgentPlanStep/ConversationSessionRecord` 段，整段删除）**

- [ ] **Step 4: 删除迁移建表语句（不写兼容迁移），后编译测试该 crate**

```powershell
cargo test -p adl-storage 2>&1 | tail -n 20
```

Run: workdir `E:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life`.
Expected: PASS（删对应用例后；失败只修本任务引用，不扩散）。

- [ ] **Step 5: Commit**

```powershell
git add ai-digital-life/crates/storage ai-digital-life/crates/migration && git commit -m "refactor(storage): drop agent session tables and crud"
```

---

### Task 3: Rust kernel 事件与配置清理

**Files:**
- Modify: `ai-digital-life/crates/kernel/src/events.rs`
- Modify: `ai-digital-life/crates/kernel/src/config.rs`

**Interfaces:**
- Consumes: Task 1（`permission_types` 已定去留）。
- Produces: kernel 无 agent 事件与权限引用。

- [ ] **Step 1: 定位残留**

```powershell
git grep -rn "AgentRunChanged\|agent.run-changed\|permission_types\|command_risk" -- ai-digital-life/crates/kernel | head -n 20
```

Expected: 命中 `events.rs:38,99` 与 `config.rs` 引用。

- [ ] **Step 2: 删除 `AgentRunChanged` 变体与映射**

```rust
// events.rs 删除前节选：
AgentRunChanged(String),
// ...
Self::AgentRunChanged(_) => "agent.run-changed",
// 删除后：两处整行删除；若为枚举连续变体，同步处理尾逗号保证编译通过。
```

- [ ] **Step 3: 清理 `config.rs` 的 `permission_types` 引用后编译**

```powershell
cargo check -p adl-kernel 2>&1 | head -n 40
```

Run: workdir `E:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life`.
Expected: PASS。

- [ ] **Step 4: Commit**

```powershell
git add ai-digital-life/crates/kernel && git commit -m "refactor(kernel): remove agent run event and permission refs"
```

---

### Task 4: 整 crate 删除 tools/mcp-client/lsp-client（含 members 与白名单）

**Files:**
- Delete: `ai-digital-life/crates/tools/` 整目录
- Delete: `ai-digital-life/crates/mcp-client/` 整目录
- Delete: `ai-digital-life/crates/lsp-client/` 整目录
- Modify: `ai-digital-life/Cargo.toml`
- Modify: `ai-digital-life/.cargo/config.toml`

**Interfaces:**
- Consumes: Task 1-3（底层类型已瘦身）。
- Produces: workspace 不再包含三 crate；供 Task 5/9 的工作区编译基线。

- [ ] **Step 1: 确认三 crate 无宿主外依赖（只读）**

```powershell
git grep -rln "adl-tools\|adl-mcp-client\|adl-lsp-client\|adl_mcp_client\|adl_lsp_client\|adl_tools" -- ai-digital-life/crates ai-digital-life/src-tauri ai-digital-life/frontend/src | head -n 30
```

Expected: 仅 `server/TypesConfig` 类依赖与前端 mcp/lsp domain；记录到 Task 5/7 清单。

- [ ] **Step 2: 整目录删除**

```powershell
git rm -r ai-digital-life/crates/tools ai-digital-life/crates/mcp-client ai-digital-life/crates/lsp-client
```

- [ ] **Step 3: 清理 `Cargo.toml` members（删除 `crates/tools`、`crates/mcp-client`、`crates/lsp-client` 三行）与 `.cargo/config.toml`（删除 `adl-agent-runtime/adl-command/adl-context/adl-conversation/adl-model-gateway/adl-subagent/adl-task` 七节及 `adl-tools/adl-mcp-client/adl-lsp-client` 节，若存在）后全工作区检查**

```powershell
cargo check --workspace 2>&1 | head -n 80
```

Run: workdir `E:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life`.
Expected: 允许报错，但报错必须全部指向 Task 5 的 server/src-tauri 引用，不允许指向已删 crate 自身。

- [ ] **Step 4: Commit**

```powershell
git add ai-digital-life/Cargo.toml ai-digital-life/.cargo/config.toml ai-digital-life/crates && git commit -m "refactor(core): delete tools mcp-client lsp-client crates"
```

---

### Task 5: server 与 src-tauri 残留清理（含二判定 handler）

**Files:**
- Modify: `ai-digital-life/crates/server/src/handlers/mod.rs`
- Modify: `ai-digital-life/crates/server/src/lib.rs`
- Modify: `ai-digital-life/crates/server/Cargo.toml`
- Modify: `ai-digital-life/crates/server/src/handlers/patch.rs`（仅当残留 `mark_applying/mark_verifying/complete_after_patch`）
- Modify: `ai-digital-life/crates/server/src/handlers/reference.rs`（仅当残留 `references_prompt/validate_reference`）
- Delete-or-narrow: `ai-digital-life/crates/server/src/handlers/mcp.rs`、`lsp.rs`、`commands_config.rs`（默认删除；保留需调用链证据）

**Interfaces:**
- Consumes: Task 4 的整 crate 删除与依赖清单。
- Produces: server 全工作区编译通过；dsh/workspace/git/pty/browser 宿主 handler 不变。

- [ ] **Step 1: 对三 handler 做调用链二判定（只读，先决策再动手）**

```powershell
git grep -rn "McpClient\|mcp_client\|LspClient\|lsp_client\|CommandRegistry\|command_registry" -- ai-digital-life/crates/server/src ai-digital-life/src-tauri/src ai-digital-life/frontend/src | head -n 40
```

Expected: 若调用方仅为 agent 循环/会话流则删除；若存在宿主原生直连调用则收窄为去 agent 引用，并在提交信息正文写明保留理由与调用链文件行号。

- [ ] **Step 2: 执行删除或收窄，并清理 `handlers/mod.rs/lib.rs/Cargo.toml` 的 mod 与依赖**

- [ ] **Step 3: 清理 `patch.rs/reference.rs` 残留引用（不存在则跳过，不新建兼容函数）**

- [ ] **Step 4: 工作区检查**

```powershell
cargo check --workspace 2>&1 | head -n 60
```

Run: workdir `E:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life`.
Expected: PASS。

- [ ] **Step 5: Commit**

```powershell
git add ai-digital-life/crates/server ai-digital-life/src-tauri && git commit -m "refactor(server): strip agent refs and mcp lsp command handlers"
```

---

### Task 6: 前端生成类型与命令装饰清理

**Files:**
- Delete: `ai-digital-life/frontend/src/shared/ipc/generated/SubagentTask.ts`
- Delete: `ai-digital-life/frontend/src/shared/ipc/generated/SubagentStatus.ts`
- Delete: `ai-digital-life/frontend/src/shared/ipc/generated/SubagentId.ts`
- Delete: `ai-digital-life/frontend/src/shared/ipc/generated/AgentMode.ts`
- Delete: `ai-digital-life/frontend/src/shared/ipc/generated/AgentConfig.ts`
- Delete: `ai-digital-life/frontend/src/shared/ipc/generated/AgentId.ts`
- Delete: `ai-digital-life/frontend/src/shared/ipc/generated/TaskToolInput.ts`
- Delete: `ai-digital-life/frontend/src/shared/ipc/generated/TaskToolOutput.ts`
- Modify: `ai-digital-life/frontend/src/kernel/types-legacy.ts`
- Delete: `ai-digital-life/frontend/src/app/commands/commandRegistry.ts`
- Delete: `ai-digital-life/frontend/src/app/commands/commandRegistry.test.ts`
- Delete: `ai-digital-life/frontend/src/app/regions/right-panel/editor-support/agentDecorations.ts`

**Interfaces:**
- Consumes: Task 1/5（Rust 源与 server 引用已清）。
- Produces: 前端无 agent 生成类型与命令注册；引用方已同步清理。

- [ ] **Step 1: 确认引用方清单（只读）**

```powershell
git grep -rln "SubagentTask\|SubagentStatus\|SubagentId\|AgentMode\|AgentConfig\|TaskToolInput\|commandRegistry\|agentDecorations" -- ai-digital-life/frontend/src | head -n 30
```

Expected: 记录全部引用文件，本任务内清完，不留悬空 import。

- [ ] **Step 2: 删除生成类型与命令文件**

```powershell
git rm ai-digital-life/frontend/src/shared/ipc/generated/SubagentTask.ts ai-digital-life/frontend/src/shared/ipc/generated/SubagentStatus.ts ai-digital-life/frontend/src/shared/ipc/generated/SubagentId.ts ai-digital-life/frontend/src/shared/ipc/generated/AgentMode.ts ai-digital-life/frontend/src/shared/ipc/generated/AgentConfig.ts ai-digital-life/frontend/src/shared/ipc/generated/AgentId.ts ai-digital-life/frontend/src/shared/ipc/generated/TaskToolInput.ts ai-digital-life/frontend/src/shared/ipc/generated/TaskToolOutput.ts ai-digital-life/frontend/src/app/commands/commandRegistry.ts ai-digital-life/frontend/src/app/commands/commandRegistry.test.ts ai-digital-life/frontend/src/app/regions/right-panel/editor-support/agentDecorations.ts
```

- [ ] **Step 3: 删除 `types-legacy.ts` 会话段并清理引用方 import 后类型检查**

```powershell
pnpm --dir frontend run typecheck 2>&1 | head -n 60
```

Run: workdir `E:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life`.
Expected: 允许报错，但报错必须仅指向 Task 7/8 的待清文件。

- [ ] **Step 4: Commit**

```powershell
git add ai-digital-life/frontend/src/shared/ipc/generated ai-digital-life/frontend/src/kernel ai-digital-life/frontend/src/app/commands ai-digital-life/frontend/src/app/regions && git commit -m "refactor(frontend): strip agent generated types and command registry"
```

---

### Task 7: 前端 stores/actions/mocks/bridges（mcp/lsp/web-tools/会话）

**Files:**
- Delete: `ai-digital-life/frontend/src/app/stores/slices/mcpSlice.ts`
- Delete: `ai-digital-life/frontend/src/app/stores/actions/mcpActions.ts`
- Delete: `ai-digital-life/frontend/src/app/stores/actions/lspActions.ts`
- Modify: `ai-digital-life/frontend/src/app/stores/slicedStore.ts`
- Modify: `ai-digital-life/frontend/src/app/stores/StoreState.ts`
- Modify: `ai-digital-life/frontend/src/app/stores/slices.ts`
- Delete-or-narrow: `ai-digital-life/frontend/src/app/stores/slices/webToolsSlice.ts`、`actions/webToolsActions.ts`、`slices/referenceSlice.ts`、`actions/referenceActions.ts`（先查宿主调用链）
- Delete: `ai-digital-life/frontend/src/shared/ipc/mcp.ts`
- Delete: `ai-digital-life/frontend/src/shared/ipc/lsp.ts`
- Modify: `ai-digital-life/frontend/src/shared/ipc/index.ts`
- Delete: `ai-digital-life/frontend/src/mock/mock-mcp.ts`
- Delete: `ai-digital-life/frontend/src/mock/mock-lsp.ts`
- Delete: `ai-digital-life/frontend/src/mock/mock-web-tools.ts`（若仅服务 agent 则删）
- Delete: `ai-digital-life/frontend/src/mock/mock-shared-conversation.ts`
- Modify: `ai-digital-life/frontend/src/mock/mock-shared.ts`
- Modify: `ai-digital-life/frontend/src/mock/mock-shared-patch.ts`
- Modify: `ai-digital-life/frontend/src/mock-bridge.ts`
- Delete: `ai-digital-life/frontend/src/tauri-bridge/` 与 `ai-digital-life/frontend/src/preview-bridge/` 内 mcp/lsp/web-tools domain 文件（实现时以实际目录为准，先 glob 定位）

**Interfaces:**
- Consumes: Task 6（生成类型已删）。
- Produces: 三桥同 domain 同步裁剪；`slicedStore/StoreState` 注册一致。

- [ ] **Step 1: 定位注册与引用（只读）**

```powershell
git grep -rn "mcpSlice\|mcpActions\|lspActions\|webToolsSlice\|referenceSlice\|mock-mcp\|mock-lsp\|mock-shared-conversation\|messagesBySession\|listScopedSessions" -- ai-digital-life/frontend/src/app/stores ai-digital-life/frontend/src/mock ai-digital-life/frontend/src/shared/ipc | head -n 50
```

Expected: 列出 `slicedStore.ts/StoreState.ts/slices.ts/index.ts/mock-shared.ts/mock-shared-patch.ts/mock-bridge.ts` 待改点。

- [ ] **Step 2: 删除 slice/action/ipc/mock 文件并清理注册**

```typescript
// mock-shared.ts 删除前后节选：
// 删除前：
export {
  sessions,
  messagesBySession,
  listScopedSessions,
  ensureSession,
  ensureConversationDetail,
} from "./mock-shared-conversation";
// 删除后：整段 export 删除，不留空注释；文件头 domain 列表同步删除 conversation 行。
```

```powershell
git rm ai-digital-life/frontend/src/app/stores/slices/mcpSlice.ts ai-digital-life/frontend/src/app/stores/actions/mcpActions.ts ai-digital-life/frontend/src/app/stores/actions/lspActions.ts ai-digital-life/frontend/src/shared/ipc/mcp.ts ai-digital-life/frontend/src/shared/ipc/lsp.ts ai-digital-life/frontend/src/mock/mock-mcp.ts ai-digital-life/frontend/src/mock/mock-lsp.ts ai-digital-life/frontend/src/mock/mock-shared-conversation.ts
```

- [ ] **Step 3: 清理 `slicedStore/StoreState/slices/ipc-index/mock-shared/mock-bridge` 注册与 `generalActions.test.ts` 会话夹具后类型检查**

```powershell
pnpm --dir frontend run typecheck 2>&1 | head -n 60
```

Run: workdir `E:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life`.
Expected: 报错仅指向 Task 8 的 i18n/布局文件。

- [ ] **Step 4: Commit**

```powershell
git add ai-digital-life/frontend/src/app/stores ai-digital-life/frontend/src/shared/ipc ai-digital-life/frontend/src/mock ai-digital-life/frontend/src/mock-bridge.ts && git commit -m "refactor(frontend): strip mcp lsp session stores mocks bridges"
```

---

### Task 8: 前端 i18n/样式/中间区 dsh 化

**Files:**
- Delete: `ai-digital-life/frontend/src/app/i18n/zh-CN/conversation.ts`
- Delete: `ai-digital-life/frontend/src/app/i18n/zh-CN/agent.ts`
- Delete: `ai-digital-life/frontend/src/app/i18n/zh-CN/provider.ts`
- Delete: `ai-digital-life/frontend/src/app/i18n/zh-CN/permission.ts`
- Delete: `ai-digital-life/frontend/src/app/i18n/zh-CN/commands.ts`
- Delete: `ai-digital-life/frontend/src/app/i18n/zh-CN/sessionFork.ts`
- Delete: `ai-digital-life/frontend/src/app/i18n/en-US/conversation.ts`
- Delete: `ai-digital-life/frontend/src/app/i18n/en-US/agent.ts`
- Delete: `ai-digital-life/frontend/src/app/i18n/en-US/provider.ts`
- Delete: `ai-digital-life/frontend/src/app/i18n/en-US/permission.ts`
- Delete: `ai-digital-life/frontend/src/app/i18n/en-US/commands.ts`
- Delete: `ai-digital-life/frontend/src/app/i18n/en-US/sessionFork.ts`
- Modify: `ai-digital-life/frontend/src/app/i18n/zh-CN/index.ts`
- Modify: `ai-digital-life/frontend/src/app/i18n/en-US/index.ts`
- Modify: `ai-digital-life/frontend/src/app/i18n/zh-CN/common.ts`
- Modify: `ai-digital-life/frontend/src/app/i18n/en-US/common.ts`
- Modify: `ai-digital-life/frontend/src/app/i18n/zh-CN/workspace.ts`
- Modify: `ai-digital-life/frontend/src/app/i18n/en-US/workspace.ts`
- Modify: `ai-digital-life/frontend/src/app/i18n/__tests__/keys.test.ts`
- Modify: `ai-digital-life/frontend/src/app/stores/actions/generalActions.test.ts`
- Delete: `ai-digital-life/frontend/src/styles/part-stream.css`
- Delete: `ai-digital-life/frontend/src/styles/part-stream-scope.test.ts`
- Modify: `ai-digital-life/frontend/src/app/regions/CenterPane.tsx`
- Modify: `ai-digital-life/frontend/src/app/regions/left-sidebar/ResizeHandle.tsx`
- Modify: `ai-digital-life/frontend/src/app/regions/left-sidebar/ResizeHandle.utils.ts`

**Interfaces:**
- Consumes: Task 6/7（引用方已清）。
- Produces: UI 无 agent 文案与会话入口；中间区固定为 dsh。

- [ ] **Step 1: 删除 agent 域 i18n 文件**

```powershell
git rm ai-digital-life/frontend/src/app/i18n/zh-CN/conversation.ts ai-digital-life/frontend/src/app/i18n/zh-CN/agent.ts ai-digital-life/frontend/src/app/i18n/zh-CN/provider.ts ai-digital-life/frontend/src/app/i18n/zh-CN/permission.ts ai-digital-life/frontend/src/app/i18n/zh-CN/commands.ts ai-digital-life/frontend/src/app/i18n/zh-CN/sessionFork.ts ai-digital-life/frontend/src/app/i18n/en-US/conversation.ts ai-digital-life/frontend/src/app/i18n/en-US/agent.ts ai-digital-life/frontend/src/app/i18n/en-US/provider.ts ai-digital-life/frontend/src/app/i18n/en-US/permission.ts ai-digital-life/frontend/src/app/i18n/en-US/commands.ts ai-digital-life/frontend/src/app/i18n/en-US/sessionFork.ts
```

- [ ] **Step 2: 清理 index/common/workspace/keys 测试**

```typescript
// zh-CN/index.ts 删除前后节选：
// 删除前：
import { conversationZh } from './conversation';
// ...
...conversationZh,
// 删除后：import 与 spread 整行删除，不留空行占位。
```

```typescript
// keys.test.ts 删除前后节选：
// 删除前：
it('includes conversation domain keys', () => {
  expect(enUS).toHaveProperty('conversation');
});
// 删除后：整个 it 块删除。
```

- [ ] **Step 3: 中间区 dsh 化与侧栏去会话化**

```tsx
// CenterPane.tsx 修改前后：
aria-label={t.conversation}
// 改为：
aria-label={t.dshTitle}
```

```tsx
// ResizeHandle.tsx 修改要求：
删除 conversationPanelHeight / conversationResizeCleanupRef / adl-leftbar__conversation-resize 语义；
若布局仍需高度状态，重命名为 dsh 语义并同步 ResizeHandle.utils.ts 的 CONVERSATION_PANEL_HEIGHT_KEY；
无 dsh 高度需求则整段删除。
```

- [ ] **Step 4: 删除 part-stream 样式并做前端双检**

```powershell
git rm ai-digital-life/frontend/src/styles/part-stream.css ai-digital-life/frontend/src/styles/part-stream-scope.test.ts; pnpm --dir frontend run typecheck 2>&1 | head -n 40; pnpm --dir frontend run lint 2>&1 | tail -n 30
```

Run: workdir `E:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life`.
Expected: `typecheck` PASS，`lint` 零 error。

- [ ] **Step 5: Commit**

```powershell
git add ai-digital-life/frontend/src/app/i18n ai-digital-life/frontend/src/styles ai-digital-life/frontend/src/app/regions ai-digital-life/frontend/src/app/stores/actions/generalActions.test.ts && git commit -m "refactor(frontend): strip agent i18n styles and dsh center pane"
```

---

### Task 9: 全量验证与残留零引用门

**Files:**
- Verify-only: 无新增文件；失败时回对应 Task 修，不在本任务加兼容层。

**Interfaces:**
- Consumes: Task 1-8 全部完成。
- Produces: 可合入的干净基线（编译+lint+测试全过，残留零引用）。

- [ ] **Step 1: Rust 全量门**

```powershell
cargo check --workspace 2>&1 | tail -n 20; cargo clippy --workspace --all-targets -- -D warnings 2>&1 | tail -n 20; cargo test --workspace 2>&1 | tail -n 30
```

Run: workdir `E:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life`.
Expected: 三者全 PASS（测试为删对应用例后全过）。

- [ ] **Step 2: 前端全量门**

```powershell
pnpm --dir frontend run typecheck 2>&1 | tail -n 10; pnpm --dir frontend run lint 2>&1 | tail -n 10; pnpm --dir frontend run test 2>&1 | tail -n 30
```

Run: workdir `E:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life`.
Expected: `typecheck` PASS，`lint` 零 error，`test` 全过。

- [ ] **Step 3: 残留零引用断言**

```powershell
git grep -rn "agent-runtime\|model-gateway\|ConversationSession\|AgentRunChanged\|AgentToolAdapter\|commandRegistry\|mock-shared-conversation" -- ai-digital-life/crates ai-digital-life/src-tauri ai-digital-life/frontend/src | head -n 30
```

Expected: 空输出；若有命中，仅允许注释/文档豁免项，且必须在提交信息正文逐条列明文件行号与豁免理由。

- [ ] **Step 4: dsh 宿主冒烟（不碰 dsh 内部）**

```powershell
git grep -rln "DshHostRegion\|WelcomePage\|webapp-host\|dsh-version" -- ai-digital-life/crates ai-digital-life/frontend/src | head -n 20
```

Expected: dsh 宿主链完整存在（`webapp-host/dsh-version/server dsh handler/features/dsh/桥接 dsh domain`）。

- [ ] **Step 5: Commit（仅当以上全过；若有修复则先修后合入本任务提交）**

```powershell
git status --short | head -n 30; git add -A; git commit -m "chore(verify): agent purge gates pass with zero residual refs"
```

---

## Self-Review

1. Spec 覆盖：spec 2.1→Task 1/2，2.2→Task 3/4，2.3 二判定→Task 5 Step 1，2.4→Task 6/7，2.5→Task 7/8，第 3 节顺序→Task 1-9 顺序，第 4 节→各任务验证步骤，第 5 节→Task 9，无遗漏。
2. 占位符扫描：无 TBD/TODO/“类似 Task N”/“适当处理”；每步含确切路径与可执行命令。
3. 类型一致：`CommandConfig/CommandHint` 收窄、`t.dshTitle`、`sessions/messagesBySession/listScopedSessions/ensureSession/ensureConversationDetail`、`AgentRunChanged/"agent.run-changed"` 等命名在 Task 间一致。
