# 18 项缺失能力 — 前端实现状态审计

> 生成日期：2026-07-05
> 审计范围：`ai-digital-life/frontend/` 全部前端层（IPC 接口、Store 切片、Store Actions、UI 组件、i18n 本地化、三桥实现、DigitalLifeBridge 接口、Store Wiring）
> 审计方法：逐项检查每个前端层工件的存在性与连接完整性

---

---

## 实施约束（修复前端时须遵守）

| 约束 | 说明 |
|------|------|
| **参考 OpenCode 源码** | 具体实现时优先参考 `references/opencode/` 下 OpenCode 源码，学习其设计模式与实现细节；也可参考本项目已有的前端实现（如已完成的 AgentSelector、McpServerList、CommandEditor 等组件）作为模式和风格基准 |
| **不迁就旧代码** | 若本项目现有前端设计（如 SlashCommandPopover 的硬编码命令列表、CompactionIndicator 无 IPC 链路、store 架构中缺失的 slice 等）存在缺陷或与优秀方案冲突，可删除重构，不强制兼容。例如：Compaction 的完整前端链路可重新设计，不必保留当前断裂的代码 |
| **采用优秀设计** | 方案选择以架构合理性、可维护性、扩展性为优先，而非与现有代码的最小差异。新增 IPC、store slice、actions 时应严格遵循现有的 Zustand 切片模式 + 三桥同步模式，但允许改进模式本身（如简化冗余的 action 样板代码） |

---

## 分类总览

| 实现状态 | 数量 | 特性编号 |
|---------|------|---------|
| ✅ **完全实现** | 7 | #1 多 Agent、#2 Sub-agent、#3 Plan Mode、#4 MCP、#5 Provider、#10 自定义命令、#11 权限 Ruleset |
| ⚠️ **部分实现** | 3 | #7 Compaction、#8 Snapshot/Revert、#9 WebFetch/WebSearch |
| ❌ **未实现（仅 Rust 后端）** | 7 | #12 Session Fork、#13 LSP、#14 Plugin、#15 ACP、#16 HTTP API、#17 CodeMode、#18 Reference/Custom Agent/Hot Reload/Durable |
| 🔧 **不适用（仅后端）** | 1 | #6 Provider-specific Prompts |

---

## 一、✅ 完全实现的特性（7 个）

### #1：多 Agent 系统

| 前端层 | 状态 | 文件路径 |
|--------|------|---------|
| IPC 接口 | ✅ | `shared/ipc/agent.ts` — AgentBridge |
| Store 切片 | ✅ | `stores/slices/agentSlice.ts` — AgentSlice |
| Store Actions | ✅ | `stores/actions/agentActions.ts` |
| UI 组件 | ✅ | `components/AgentSelector.tsx` |
| i18n 本地化 | ✅ | `zh-CN/agent.ts`、`en-US/agent.ts` |
| Tauri 桥 | ✅ | `tauri-bridge.ts:323-343` |
| Mock 桥 | ✅ | `mock-bridge.ts:208-236` |
| 预览桥 | ✅ | `preview-bridge/index.ts`（复用 mock） |
| DigitalLifeBridge | ✅ | `digital-life.ts:101` |
| 索引导出 | ✅ | `index.ts:7` |
| Store Wiring | ✅ | `slicedStore.ts`、`StoreState.ts` |

### #2：Sub-agent / Task 工具

| 前端层 | 状态 | 备注 |
|--------|------|------|
| IPC 接口 | ✅ | `shared/ipc/subagent.ts` — SubagentBridge |
| Store 状态 | ✅ | agentSlice 中 `activeSubagents` 字段 |
| UI 组件 | ✅ | `components/SubagentIndicator.tsx` |
| i18n 本地化 | ✅ | agent locale 中 `agentSubagent*` 键 |
| 三桥 | ✅ | tauri-bridge:345-353、mock-bridge:238-252、预览桥复用 mock |
| DLife 接口 | ✅ | `digital-life.ts:103` |

### #3：Plan Mode

| 前端层 | 状态 | 备注 |
|--------|------|------|
| IPC 接口 | ✅ | agent.ts 中 `enterPlanMode`/`exitPlanMode`/`getPlanModeState` |
| Store 切片 | ✅ | agentSlice 中 `planModeActive`、`planFile` |
| Store Actions | ✅ | `agentActions.ts` |
| UI 组件 | ✅ | `components/PlanModeBanner.tsx` |
| i18n 本地化 | ✅ | agent locale |

### #4：MCP 完整集成

| 前端层 | 状态 | 备注 |
|--------|------|------|
| IPC 接口 | ✅ | `shared/ipc/mcp.ts` |
| Store 切片 | ✅ | `stores/slices/mcpSlice.ts` |
| Store Actions | ✅ | `stores/actions/mcpActions.ts` |
| UI 组件 | ✅ | `features/mcp/McpServerList.tsx`、`McpServerConfig.tsx`、`McpStatusBadge.tsx` |
| i18n 本地化 | ✅ | `zh-CN/mcp.ts`、`en-US/mcp.ts`（27 键） |
| 三桥 | ✅ | 全部实现 |
| DLife 接口 | ✅ | `digital-life.ts:105` |
| Store Wiring | ✅ | `slicedStore.ts`、`StoreState.ts` |

### #5：多 LLM Provider 支持

| 前端层 | 状态 | 备注 |
|--------|------|------|
| IPC 接口 | ✅ | `shared/ipc/provider.ts` |
| Store 切片 | ✅ | `stores/slices/providerSlice.ts` |
| Store Actions | ✅ | `stores/actions/providerActions.ts` |
| UI 组件 | ✅ | `features/provider-manager/ProviderList.tsx`、`ProviderConfig.tsx` |
| i18n 本地化 | ✅ | `zh-CN/provider.ts`、`en-US/provider.ts` |
| 三桥 | ✅ | 全部实现 |

### #10：自定义命令配置

| 前端层 | 状态 | 备注 |
|--------|------|------|
| IPC 接口 | ✅ | `shared/ipc/commands_config.ts` |
| Store 切片 | ✅ | `stores/slices/customCommandSlice.ts` |
| Store Actions | ✅ | `stores/actions/customCommandActions.ts` |
| UI 组件 | ✅ | `features/command-editor/CommandEditor.tsx`、`CommandList.tsx` |
| i18n 本地化 | ✅ | `zh-CN/commands.ts`、`en-US/commands.ts`（14 键） |
| 三桥 | ✅ | 全部实现 |
| DLife 接口 | ✅ | `digital-life.ts:129` |
| Store Wiring | ✅ | `slicedStore.ts`、`StoreState.ts` |

### #11：权限系统升级为 Ruleset

| 前端层 | 状态 | 备注 |
|--------|------|------|
| IPC 接口 | ✅ | `shared/ipc/permission.ts` |
| Store 切片 | ✅ | `stores/slices/permissionSlice.ts` |
| Store Actions | ✅ | `stores/actions/permissionActions.ts` |
| UI 组件 | ✅ | `features/permission-settings/PermissionRulesetEditor.tsx`、`PermissionRulesetList.tsx` |
| i18n 本地化 | ✅ | `zh-CN/permission.ts`、`en-US/permission.ts`（15 键） |
| 三桥 | ✅ | 全部实现 |
| DLife 接口 | ✅ | `digital-life.ts:131` |
| Store Wiring | ✅ | `slicedStore.ts`、`StoreState.ts` |

---

## 二、⚠️ 部分实现的特性（3 个）

### #7：Compaction（会话压缩）

| 前端层 | 状态 | 详情 |
|--------|------|------|
| IPC 接口 | ❌ **缺失** | 无专用 IPC 文件，`conversation.ts` 中未包含压缩方法 |
| Store 切片 | ❌ **缺失** | 无压缩相关 store 状态 |
| Store Actions | ❌ **缺失** | 无压缩操作 |
| UI 组件 | ✅ **存在** | `components/conversation/CompactionIndicator.tsx` — 显示压缩状态/计数 |
| i18n 本地化 | ✅ **存在** | `zh-CN/conversation.ts` 中 `compactionActive`、`compactionCompleted`、`compactionPruned` |
| 三桥 | ❌ **缺失** | 三个桥接均未实现压缩方法 |
| DLife 接口 | ❌ **缺失** | `digital-life.ts` 中无压缩条目 |
| 索引导出 | ❌ **缺失** | 无 |

**影响**：CompactionIndicator 组件存在但无法获得数据，因为缺少 IPC → Store → Bridge 完整链路。组件此时仅作为静态占位符。

**修复需要**：
1. 在 `shared/ipc/` 中新建压缩 IPC 接口（或在 `conversation.ts` 中扩展）
2. 在 `digital-life.ts` 中添加 compaction bridge 条目
3. 在三个 bridge 中实现
4. 新建 store slice + actions
5. 在 `slicedStore.ts` + `StoreState.ts` 中 wiring

### #8：Snapshot / Revert

| 前端层 | 状态 | 详情 |
|--------|------|------|
| IPC 接口 | ✅ | `shared/ipc/snapshot.ts` — SnapshotBridge |
| Store 切片 | ❌ **缺失** | 无快照 store 状态 |
| Store Actions | ❌ **缺失** | UI 通过 `window.digitalLife.snapshot` 直接调用桥接 |
| UI 组件 | ✅ | `components/conversation/RevertButton.tsx` |
| i18n 本地化 | ✅ | `zh-CN/conversation.ts` 中 `snapshotRevert` 等 6 键 |
| Tauri 桥 | ✅ | `tauri-bridge.ts:561-573` |
| Mock 桥 | ✅ | `mock-bridge.ts:478-521` |
| 预览桥 | ❌ **缺失** | 未在 `preview-bridge/index.ts` 中实现 |o
| DLife 接口 | ✅ | `digital-life.ts:125` |
| 索引导出 | ✅ | `index.ts:18` |
| Store Wiring | ❌ **缺失** | 未导入到 `slicedStore.ts` 或 `StoreState.ts` |

**影响**：RevertButton 组件可在 Tauri 模式正常工作（直接调用桥接），但缺乏 store 状态管理层，无法在多个组件间共享快照数据。

**修复需要**：
1. 新建 store slice + actions
2. 在 `slicedStore.ts` + `StoreState.ts` 中 wiring
3. 在预览桥中实现 snapshot bridge

### #9：WebFetch / WebSearch

| 前端层 | 状态 | 详情 |
|--------|------|------|
| IPC 接口 | ✅ | `shared/ipc/web_tools.ts` — WebToolsBridge |
| Store 切片 | ❌ **缺失** | 无 store 状态 |
| Store Actions | ❌ **缺失** | 无操作 |
| UI 组件 | ❌ **缺失** | 无可视化 UI |
| i18n 本地化 | ❌ **缺失** | 无翻译 |
| 三桥 | ✅ | taauri-bridge:575-578、mock-bridge:523-556、预览桥可用 |
| DLife 接口 | ✅ | `digital-life.ts:127` |
| Store Wiring | ❌ **缺失** | 未连接 |

**影响**：Web 工具可通过桥接调用（Agent 内部使用），但用户无可视化界面来手动触发 web_fetch/web_search。

**修复需要**：
1. 新建 store slice + actions
2. 新建 UI 组件（如搜索结果面板）
3. 添加 i18n 翻译
4. 在 `slicedStore.ts` + `StoreState.ts` 中 wiring

---

## 三、❌ 未实现的特性（7 个）

以下 7 个特性均为 Phase 2-E 内容，**Rust 后端已完成**，但**前端未开始实现**。

### #12：Session Fork

**Rust 后端**：`crates/conversation/src/fork.rs`、`src-tauri/src/commands/session_fork.rs`

| 前端层 | 状态 |
|--------|------|
| IPC 接口 `shared/ipc/session_fork.ts` | ❌ |
| Store 切片 | ❌ |
| Store Actions | ❌ |
| UI 组件 | ❌ |
| i18n 本地化 | ❌ |
| 三桥实现 | ❌ |
| DLife 接口 | ❌ |

**修复需要**：完整前端实现。计划中包括 ForkButton 组件。

### #13：LSP 集成

**Rust 后端**：`crates/lsp-client/`（完整 crate）、`src-tauri/src/commands/lsp.rs`

| 前端层 | 状态 |
|--------|------|
| IPC 接口 `shared/ipc/lsp.ts` | ❌ |
| Store 切片 | ❌ |
| Store Actions | ❌ |
| UI 组件（LspDiagnostics.tsx、LspSymbols.tsx） | ❌ |
| i18n 本地化 | ❌ |
| 三桥实现 | ❌ |
| DLife 接口 | ❌ |

**修复需要**：完整前端实现。计划中包括 LSP 诊断面板和符号树组件。

### #14：Plugin 系统

**Rust 后端**：`crates/agent-runtime/src/plugins/`、`src-tauri/src/commands/plugin.rs`

| 前端层 | 状态 |
|--------|------|
| IPC 接口 `shared/ipc/plugin.ts` | ❌ |
| Store 切片 | ❌ |
| Store Actions | ❌ |
| UI 组件 | ❌ |
| i18n 本地化 | ❌ |
| 三桥实现 | ❌ |
| DLife 接口 | ❌ |

**修复需要**：完整前端实现。插件设置页面（启用/禁用/列表）。

### #15：ACP 接口预留

**Rust 后端**：`crates/kernel/src/types/reserved.rs`、`src-tauri/src/commands/reserved.rs`

| 前端层 | 状态 |
|--------|------|
| IPC 接口 `shared/ipc/reserved.ts` | ❌ |
| DLife 接口 | ❌ |
| 三桥实现 | ❌ |

**修复需要**：接口存根（返回 NotImplemented 即可），遵循「仅预留」原则。

### #16：HTTP API 服务器预留

与 #15 相同 — 需要前端 IPC 存根，但不实现实际功能。

### #17：CodeMode 沙箱预留

与 #15 相同 — 需要前端 IPC 存根，但不实现实际功能。

### #18：Reference / Custom Agent / Hot Reload / Durable

**Rust 后端**：
- Reference：`crates/context/src/references.rs`、`src-tauri/src/commands/reference.rs`
- Custom Agent：`src-tauri/src/commands/custom_agent.rs`
- Hot Reload：`crates/kernel/src/config_watcher.rs`
- Durable：`crates/agent-runtime/src/durable.rs`、`src-tauri/src/commands/durable.rs`

| 前端层 | Status |
|--------|--------|
| IPC `reference.ts`、`custom_agent.ts`、`durable.ts` | ❌ |
| Store 切片 | ❌ |
| Store Actions | ❌ |
| UI 组件 | ❌ |
| i18n 本地化 | ❌ |
| 三桥实现 | ❌ |
| DLife 接口 | ❌ |

**修复需要**：
- Reference：参考目录管理 UI（CRUD 列表 + 添加/删除表单）
- Custom Agent：自定义 Agent 配置 UI（与 CommandConfig 类似）
- Durable：无需 UI（静默后台运行）
- Hot Reload：无需 UI（静默后台运行）

---

## 四、修复优先级建议

| 优先级 | 特性 | 理由 |
|--------|------|------|
| **P0** | #7 Compaction | 组件已存在但无法工作（损坏的状态） |
| **P0** | #8 Snapshot/Revert | 组件已存在，预览桥缺失 |
| **P1** | #12 Session Fork | 用户可见功能，后端已完成 |
| **P1** | #9 WebFetch/WebSearch | Agent 可用但用户无可视化结果 |
| **P2** | #13 LSP | 较复杂的新 crate 前端 |
| **P2** | #14 Plugin | 简单管理 UI |
| **P2** | #18 Reference | CRUD 管理 UI |
| **P3** | #15/#16/#17 ACP/HTTP/CodeMode | 仅预留接口存根 |

---

## 五、各特性前端实现工时估算

| 特性 | 工时估算 | 难度 |
|------|---------|------|
| #7 Compaction | 1h | 低（修复已有组件） |
| #8 Snapshot/Revert | 0.5h | 低（补预览桥 + store） |
| #9 WebFetch/WebSearch | 1.5h | 低（新建组件 + store） |
| #12 Session Fork | 2h | 低（ForkButton + IPC + store） |
| #13 LSP | 3h | 中（面板 + 符号树 + IPC） |
| #14 Plugin | 1.5h | 低（列表 + 开关） |
| #15/#16/#17 Reserved | 0.5h | 低（仅 IPC 存根） |
| #18 Reference | 2h | 中（CRUD UI） |
| #18 Custom Agent | 1h | 低（类似 CommandEditor） |
| **合计** | **~13h** | |

---

## 六、相关文档

- [07-missing-features-opencode-has.md](./07-missing-features-opencode-has.md) — 缺失能力清单
- [08-tech-stack-changes-for-missing-features.md](./08-tech-stack-changes-for-missing-features.md) — 技术方案分析
- [session-context-2026-07-05.md](./session-context-2026-07-05.md) — 会话上下文与完成状态
