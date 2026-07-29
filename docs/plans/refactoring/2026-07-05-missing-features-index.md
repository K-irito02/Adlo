# 补齐缺失能力（OpenCode 对标）— 实施计划总索引

> **生成日期：** 2026-07-05
> **前置文档：**
> - [comparison/gap-analysis.md](../../analysis/opencode/comparison/gap-analysis.md) — 缺失能力清单与差距分析
> - [01-project-overview.md](../../analysis/opencode/01-project-overview.md) — 项目总览与技术栈
> **本文目的：** 将 18 项「应补齐的缺失能力」拆分为 5 个独立可执行的实施计划，每个计划产出可独立测试的软件。

---

## 一、计划拆分原则

依据 `writing-plans` skill 的 Scope Check 规则：跨多个独立子系统的需求必须拆分为多个计划，每个计划独立产出可工作、可测试的软件。本索引将 18 项能力按依赖关系与实施批次拆分为 5 个计划文档。

## 二、计划清单

| 阶段 | 计划文档 | 覆盖能力 | 优先级 | 依赖前置 |
|------|---------|---------|--------|---------|
| **2-A** | [2026-07-05-phase-2a-agent-core-foundation.md](../phase2/2026-07-05-phase-2a-agent-core-foundation.md) | 多 Agent 系统、Sub-agent / Task 工具、Plan Mode | P0 + P1 | 无（基础） |
| **2-B** | [2026-07-05-phase-2b-protocol-provider-ecosystem.md](../phase2/2026-07-05-phase-2b-protocol-provider-ecosystem.md) | MCP 完整集成、多 LLM Provider 支持、Provider-specific Prompts | P0 + P1 | 2-A（Agent 抽象） |
| **2-C** | [2026-07-05-phase-2c-conversation-quality-tools.md](../phase2/2026-07-05-phase-2c-conversation-quality-tools.md) | Compaction 会话压缩、Snapshot / Revert、WebFetch / WebSearch 工具 | P1 | 2-A（Agent 运行时），2-B（Provider 抽象） |
| **2-D** | [2026-07-05-phase-2d-user-customization-permission.md](../phase2/2026-07-05-phase-2d-user-customization-permission.md) | 自定义命令配置、权限系统升级为 Ruleset | P1 | 2-A（Agent 注册表） |
| **2-E** | [2026-07-05-phase-2e-advanced-reserved.md](../phase2/2026-07-05-phase-2e-advanced-reserved.md) | Session Fork、LSP 集成、Plugin 系统、ACP、HTTP API、CodeMode、Reference 系统、自定义 Agent 配置、Hot Reloadable Config、Durable Session Execution | P2 | 2-A/B/C/D 完成后 |

## 三、实施约束（全局）

| 约束 | 说明 |
|------|------|
| **参考 OpenCode 源码** | 具体实现时优先参考 `references/opencode/` 下 OpenCode 源码，学习其设计模式与实现细节 |
| **不迁就旧代码** | 若本项目现有设计（如 `crates/task/`、`crates/agent-runtime/` 等）存在缺陷或与优秀方案冲突，可删除重构，不强制兼容 |
| **采用优秀设计** | 方案选择以架构合理性、可维护性、扩展性为优先，而非与现有代码的最小差异 |
| **阶段边界更新** | 多 Agent DAG、MCP 协议当前在 `phase-boundary.md` 中标记为 Phase 2+ 排除项，实施前需更新该文档将其移入 Phase 2 进行中范围 |
| **三端一致性** | 所有 IPC 新增方法必须在 tauri-bridge、preview-bridge、mock-bridge 三处同步实现 |
| **i18n 全覆盖** | 所有新增 UI 文本必须使用 i18n key，禁止硬编码 |
| **TDD** | 每个任务先写失败测试，再写最小实现，再验证通过 |
| **Frequent commits** | 每个任务结束提交一次 |

## 四、新增依赖汇总

### Rust Crate 依赖

| Crate | 版本 | 用途 | 对应能力 | 阶段 |
|-------|------|------|---------|------|
| `rmcp` | 0.2.x | MCP 协议客户端/服务端 | MCP 完整集成 | 2-B |
| `rmcp-macros` | 0.2.x | MCP 工具宏 | MCP 完整集成 | 2-B |
| `tokenizers` | 0.21.x | 多模型 token 计数 | Compaction | 2-C |
| `scraper`（可选） | 0.20.x | HTML 解析 | WebFetch | 2-C |
| `lsp-server` | 0.7.x | LSP 服务器通信 | LSP 集成 | 2-E |
| `lsp-types` | 0.97.x | LSP 类型定义 | LSP 集成 | 2-E |

### 新建 Rust Crate

| Crate | 职责 | 阶段 |
|-------|------|------|
| `crates/subagent/` | Sub-agent 生命周期管理 | 2-A |
| `crates/mcp-client/` | MCP 协议客户端 | 2-B |
| `crates/lsp-client/` | LSP 协议客户端 | 2-E |

### 新建前端模块

| 模块 | 职责 | 阶段 |
|------|------|------|
| `components/agent/AgentSelector.tsx` | Agent 切换选择器 | 2-A |
| `components/agent/SubagentIndicator.tsx` | Sub-agent 状态指示 | 2-A |
| `features/mcp/` | MCP Server 管理 UI | 2-B |
| `features/provider-manager/` | Provider 配置管理 UI | 2-B |
| `features/lsp-panel/` | LSP 诊断列表与符号面板 | 2-E |

## 五、执行顺序

```
Phase 2-A（基础，必须先完成）
├── 1. 阶段边界更新 + Agent 抽象设计
├── 2. 多 Agent 系统（Agent 注册表 + 路由）
├── 3. Sub-agent / Task 工具（新建 crates/subagent/）
└── 4. Plan Mode（plan agent + plan_enter/plan_exit）

Phase 2-B（可与 2-C/2-D 并行，依赖 2-A 的 Agent 抽象）
├── 5. 多 LLM Provider 支持（适配器 trait + 5 个 Provider）
├── 6. Provider-specific Prompts（prompt 模板系统）
└── 7. MCP 完整集成（rmcp + crates/mcp-client/）

Phase 2-C（依赖 2-A 的 Agent 运行时和 2-B 的 Provider 抽象）
├── 8. Compaction（tokenizers + token-aware pruning）
├── 9. Snapshot / Revert（message-level git 快照）
└── 10. WebFetch / WebSearch 工具（reqwest + 搜索 API）

Phase 2-D（依赖 2-A 的 Agent 注册表）
├── 11. 自定义命令配置（config.commands + 模板变量）
└── 12. 权限系统升级为 Ruleset（PermissionEngine 增强）

Phase 2-E（P2 后续，依赖前述所有阶段）
├── 13. Session Fork / 分支
├── 14. LSP 集成
├── 15. Plugin 系统
├── 16. ACP（仅预留接口）
├── 17. HTTP API 服务器（仅预留）
├── 18. CodeMode 沙箱（实验性）
├── 19. Reference 系统
├── 20. 自定义 Agent 配置
├── 21. Hot Reloadable Config
└── 22. Durable Session Execution
```

## 六、执行方式

**采用 Subagent-Driven Development：**
- 每个任务派发独立 subagent 执行
- 任务间两阶段审查（实现审查 + 集成审查）
- 每个 plan 文档内的任务按顺序执行
- 跨 plan 文档的依赖必须满足后才能开始下一 plan
