# 本项目缺少但 OpenCode 有的内容（核心能力清单）

> 生成日期：2026-07-05（更新于 2026-07-06）
> 对比对象：`ai-digital-life/`（本项目）vs `references/opencode/`（OpenCode）
> 文档目的：列出本项目相对 OpenCode 缺失的能力，区分「应补齐」与「仅预留」
> 范围说明：**TUI 终端、协作与分享、企业功能、云部署**等第三方服务高级功能**仅预留**，不在本文档展开实现细节
> Phase 2 质量补丁（2026-07-06）完成：Snapshot/Revert（文件副本）、Permissions Ruleset（正则通配 + doom_loop）、MCP 集成（rmcp v1.8.0 3 transport）

---

## 一、分类原则

| 类别 | 处理方式 |
|------|---------|
| 🟢 **应补齐** | 与 Agent 核心能力、协议生态、工具集直接相关，建议在 Phase 2+ 实现 |
| 🟡 **仅预留** | 第三方服务高级功能（TUI 终端、协作分享、企业功能、云部署等），仅做接口预留，不实现 |

## 二、实施约束

| 约束 | 说明 |
|------|------|
| **参考 OpenCode 源码** | 具体实现时优先参考 `references/opencode/` 下 OpenCode 源码，学习其设计模式与实现细节 |
| **不迁就旧代码** | 若本项目现有设计（如 `crates/task/`、`crates/agent-runtime/` 等）存在缺陷或与优秀方案冲突，可删除重构，不强制兼容 |
| **采用优秀设计** | 方案选择以架构合理性、可维护性、扩展性为优先，而非与现有代码的最小差异 |

---

## 三、🟢 应补齐的缺失能力

### 3.1 Agent 核心能力缺失

| 缺失能力 | OpenCode 实现 | 本项目现状 | 优先级 |
|---------|--------------|----------|--------|
| **多 Agent 系统** | 内置 7 个 agent（build/plan/general/explore/compaction/title/summary，其中 build/plan 为 primary agent，general/explore 为 subagent，compaction/title/summary 为系统 hidden agent）+ 自定义 agent 配置 + `Agent.generate` LLM 生成新 agent | 仅单 Agent 三步固定流程（Understand → Collect → Generate） | P0 |
| **Sub-agent / Task 工具** | `task` 工具支持子代理调度 + **background 后台模式** + resume（task_id 复用）+ `deriveSubagentSessionPermission` 派生权限 | 无子代理，多 Agent DAG 在 Phase 2+ 排除项 | P0 |
| **Plan Mode** | 独立 `plan` agent（只读分析）+ `plan_enter`/`plan_exit` 工具 + 计划文件持久化（`.opencode/plans/*.md`） | `/plan` 仅是斜杠命令，无独立 agent | P1 |
| **Compaction（会话压缩）** | token-aware pruning（PRUNE_MINIMUM=20000、PRUNE_PROTECT=40000）+ 保护 skill 工具输出 + DEFAULT_TAIL_TURNS=2 | 长会话无优化，token 超限后无降级策略 | P1 |
| **Snapshot / Revert** | 基于 git 的独立 gitdir 快照（`Global.Path/data/snapshot/<project_id>/<hash>`）+ 文件级 diff + revert + unrevert + 自动 prune（7 天 + 2MB 限制） | `crates/change-engine/` 有基于文件副本的快照 + revert + 自动 prune（7 天 + 2MB） | ✅ 已完成 |
| **Session Fork / 分支** | `parent_id` 子会话 + Fork 从任意 message 分叉 + 标题累加 `(fork #N)` | 无会话分支概念 | P2 |
| **Provider-specific Prompts** | 按模型选择 system prompt（anthropic/gpt/gemini/kimi/codex/beast/trinity/default 等 8+） | prompt 系统单一，无模型适配 | P1 |
| **LSP 集成** | 完整 LSP 客户端 + `lsp` 工具（定义/引用/符号/诊断）+ SymbolKind 完整枚举 + 服务器启动管理 | 无 LSP，仅 `crates/outline/` 14 种语言大纲解析 | P2 |

### 3.2 协议与生态缺失

| 缺失能力 | OpenCode 实现 | 本项目现状 | 优先级 |
|---------|--------------|----------|--------|
| **MCP 完整集成** | `@modelcontextprotocol/sdk` 1.29.0 + 3 种 transport（Stdio/StreamableHTTP/SSE）+ **完整 OAuth**（动态客户端注册 + 回调服务器 + Token 存储）+ MCP 资源作为工具（list/read_mcp_resource） | `rmcp` v1.8.0 实现 Stdio/SSE/StreamableHTTP 3 transport + OAuth 支持 + `crates/mcp-client/` catalog/registry/client 完整架构 | ✅ 已完成 |
| **Plugin 系统** | npm + 本地插件 + Hooks（`tool.execute.before/after`、`experimental.chat.system.transform` 等）+ 内置 10+ 插件（Copilot/Codex/Cloudflare/Azure/DigitalOcean/Snowflake/xAI/GitLab/Poe 等） | 无插件生态 | P2 |
| **ACP（Agent Client Protocol）** | 与 Zed 等编辑器集成（agent/config-option/content/directory/error/event/permission/profile/service/session/tool/usage 完整模块） | 无 | P2（预留） |
| **HTTP API 服务器** | Hono 20+ 路由组 + 完整 OpenAPI + 自动生成 SDK（client/sdk-js） | 仅 Tauri IPC，无 HTTP API | P2 |
| **CodeMode（沙箱 JS 执行）** | 受限 JS 执行（不暴露 fs/process/network/module）+ Promise.all/allSettled/race（最多 8 并发）+ timeoutMs/maxToolCalls/maxOutputBytes 限制 + 完整 diagnostic 系统 | 无 | P2（实验性） |

### 3.3 工具与能力缺失

| 缺失能力 | OpenCode 实现 | 本项目现状 | 优先级 |
|---------|--------------|----------|--------|
| **WebFetch / WebSearch 工具** | 内置 `webfetch` + `websearch` 工具，Agent 可主动获取网络信息 | Agent 无网络信息获取能力 | P1 |
| **多 LLM Provider 支持** | 25+ Provider（Anthropic/OpenAI/Google/Bedrock/Azure/xAI/Mistral/Groq/Cohere/Cerebras/DeepInfra/TogetherAI/Perplexity/Vercel/Alibaba/OpenRouter 等）+ `ModelsDev` 拉取模型元数据 | 仅 DeepSeek + MiniMax（`crates/model-gateway/`） | P1 |
| **Reference 系统** | 额外可访问目录（LocalSource / GitSource）+ 自动注入 system prompt + config `references`/`reference` 配置 | 无 | P2 |
| **自定义命令配置** | config `command` 定义（name/agent/model/description/template/subtask/hints）+ 模板变量 `$1`/`$ARGUMENTS` + `hints()` 自动提取 | 6 个前端展示斜杠命令（`/plan`、`/edit`、`/fix`、`/explain`、`/test`、`/review`），另有 4 个运行时注册命令（`/apply`、`/rollback`、`/model`、`/clear`，其中 `/clear` 尚未实现） | P1 |
| **自定义 Agent 配置** | config `agent` 覆盖或新增 agent + `Agent.generate` 用 LLM 自动生成 agent 配置 | 无 | P2 |
| **Hot Reloadable Config** | 配置变更触发 invalidate + InstanceState 自动重建 | 待确认 | P2 |
| **Durable Session Execution** | 进程崩溃恢复 + SessionRunCoordinator 合并 resume + Advisory wake coalescing + Delivery vocabulary（steer/queue） | 待确认 | P2 |

### 3.4 权限系统差异（建议升级）

| 维度 | 本项目现状 | OpenCode 实现 | 建议 |
|------|----------|--------------|------|
| 模型 | **Permission Ruleset**（allow/ask/deny + Wildcard 通配）+ 三级 RiskLevel 降级兼容 | **Permission Ruleset**（allow/ask/deny + Wildcard 通配） | ✅ 已完成（Ruleset + 正则通配 + doom_loop） |
| 评估 | `evaluate(permission, pattern, ...rulesets)` 找最后匹配规则 + `pattern_matches` 正则（OpenCode Wildcard.match 模式） | `evaluate(permission, pattern, ...rulesets)` 找最后匹配规则 | ✅ 已完成 |
| 特殊规则 | Tauri capabilities 白名单 + `.env` ask + `doom_loop` ask | `.env` ask / `doom_loop` ask / `external_directory` ask + 白名单 allow | ✅ 已完成 |
| 子代理权限 | 无 | `deriveSubagentSessionPermission` 派生 | 随 Sub-agent 一并实现 |
| 持久化 | 审计日志 + ApprovalCard | `SessionTable.permission` + `state.approved` | 增加 session 级 permission 持久化 |

---

## 四、🟡 仅预留的功能（暂不实现）

> 以下功能属于第三方服务高级功能，**仅做接口预留**，不在当前阶段实现。

### 4.1 TUI 终端相关

| 功能 | OpenCode 实现 | 预留策略 |
|------|--------------|---------|
| TUI 完整界面 | `@opentui/solid` + SolidJS | 不实现，本项目以桌面 GUI + 浏览器为主 |
| TUI 主题系统 | 32+ 内置主题（catppuccin/dracula/gruvbox/monokai/nord/tokyonight/vercel 等） | 不实现，本项目保持亮/暗主题 |
| TUI 命令面板 | `command-palette.tsx` + keymap 系统 | 不实现 |
| TUI 对话框系统 | dialog-skill/dialog-workspace-create/dialog-workspace-list 等系列 | 不实现 |

### 4.2 协作与分享相关

| 功能 | OpenCode 实现 | 预留策略 |
|------|--------------|---------|
| Session 分享 | 分享到 URL + auto-share 模式（`share: "auto"`）+ `ShareNext` 服务 | 预留 `share` 配置字段，不实现 |
| Session 导出/导入 | `opencode export` / `opencode import` | 预留 IPC 接口 |
| ACP（Agent Client Protocol） | 与 Zed 等编辑器集成 | 预留协议接口 |

### 4.3 企业功能

| 功能 | OpenCode 实现 | 预留策略 |
|------|--------------|---------|
| 企业版 UI | `packages/enterprise/` | 不实现 |
| 控制台 | `packages/console/`（app/core/mail/function/resource/support） | 不实现 |
| 统计仪表盘 | `packages/stats/`（app/core/server + AWS Athena 查询） | 不实现 |
| OpenTelemetry | `@effect/opentelemetry` + `@opentelemetry/*` | 预留接口 |

### 4.4 云部署相关

| 功能 | OpenCode 实现 | 预留策略 |
|------|--------------|---------|
| SST 部署配置 | `sst.config.ts`（AWS 部署） | 不实现 |
| OpenAPI 文档 | `packages/docs/openapi.json` | 预留 |
| 自动生成 SDK | `packages/client`、`packages/sdk/js` | 预留 |
| Sentry 错误上报 | `@sentry/solid`、`@sentry/vite-plugin` | 预留 |
| 多 Provider Auth（OAuth） | Codex/Copilot/GitLab/Poe 等 OAuth | 预留 auth 接口 |

### 4.5 第三方深度集成相关

| 功能 | OpenCode 实现 | 预留策略 |
|------|--------------|---------|
| GitHub Agent | `opencode github install/run` + PR 事件处理 + `opencode pr <number>` 自动 checkout | 预留 GitHub Agent 接口（本项目已有 CI Status，可扩展） |
| Slack 集成 | `packages/slack/` | 不实现 |
| Cloudflare/Azure/DigitalOcean/Snowflake 等云厂商插件 | 通过 plugin 系统 | 预留 plugin 接口 |
| GitHub Copilot 集成 | 自研 `@opencode-ai/core/github-copilot` | 预留 |
| Codex（OpenAI）集成 | 自研 WebSocket 插件 | 预留 |

---

## 五、优先级建议

### 🎯 P0 — 必须（Phase 2 核心）

- **多 Agent 系统** — 单 Agent 是最大瓶颈，限制所有高级能力
- **Sub-agent / Task 工具** — 多 Agent 的执行载体
- **MCP 完整集成** — 扩展 Agent 工具生态的关键协议

### 🎯 P1 — 重要（Phase 2 紧随）

- **Plan Mode** — 独立 `plan` agent 提升需求理解质量
- **Compaction（会话压缩）** — 长会话必备，避免 token 浪费
- **Provider-specific Prompts** — 多 Provider 支持的前提
- **多 LLM Provider 支持** — 降低单一 Provider 依赖风险
- **WebFetch / WebSearch 工具** — Agent 必备的网络信息获取能力
- **自定义命令配置** — 让用户扩展斜杠命令

以下已于 Phase 2 质量补丁中完成：~~Snapshot / Revert~~、~~权限系统升级为 Ruleset~~、~~MCP 完整集成~~

### 🎯 P2 — 后续（Phase 2+ 或 Phase 3）

- **Session Fork / 分支** — 会话管理增强
- **LSP 集成** — 替代/补充 outline 解析
- **Plugin 系统** — 生态扩展
- **ACP（Agent Client Protocol）** — 编辑器集成（仅预留）
- **HTTP API 服务器** — 对外提供 API（仅预留）
- **CodeMode（沙箱 JS 执行）** — 实验性功能
- **Reference 系统** — 多目录引用
- **自定义 Agent 配置** — 用户扩展 Agent
- **Hot Reloadable Config** — 配置热重载
- **Durable Session Execution** — 进程崩溃恢复

---

## 六、预留接口设计原则

对于「仅预留」的功能，遵循以下原则：

1. **配置字段预留**：在 `Config` 类型中预留字段（如 `share`、`experimental`），但默认禁用
2. **IPC 接口预留**：在 `shared/ipc/` 中预留接口定义，但后端实现返回 `NotImplemented` 错误
3. **UI 入口预留**：在 UI 中预留入口（菜单项、按钮），点击时提示「功能暂未实现」
4. **不引入第三方依赖**：不安装 Slack SDK、Sentry SDK 等第三方库，避免增加包体积
5. **保持架构开放**：通过 Plugin 系统（P2 实现）作为第三方集成的统一入口，避免硬编码

---

## 七、相关文档

- [08-tech-stack-changes-for-missing-features.md](./08-tech-stack-changes-for-missing-features.md) — 补齐缺失能力技术方案分析
