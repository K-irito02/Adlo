# AI Digital Life vs OpenCode 对比报告

> 生成日期：2026-07-05
> 对比对象：本仓库 `ai-digital-life/`（AI Digital Life）与 `references/opencode/`（OpenCode）
> 对比目的：识别本项目相对 OpenCode 的缺失项、相同项与独有项，为后续 Phase 规划提供依据

---

## 一、整体架构对比

| 维度 | AI Digital Life | OpenCode |
|------|----------------|----------|
| 后端语言 | **Rust + Tokio** | TypeScript (Bun/Node) |
| 桌面框架 | **Tauri 2.x**（轻量） | Electron |
| 前端 | React 19 + Vite | SolidJS (TUI/Web) |
| 状态管理 | Zustand（23 slice） | Effect + InstanceState |
| AI SDK | 自研 model-gateway | Vercel AI SDK 6.0 |
| 数据库 | SQLite (rusqlite) | SQLite (Drizzle ORM) |
| 函数式效应 | 无 | **Effect 4.0**（深度依赖） |
| 部署形态 | Tauri + Browser + Mock 三端 | TUI + Web + Desktop + CLI |

---

## 二、本项目缺少但 OpenCode 有的内容

### 🔴 核心缺失（Agent 能力相关）

| 缺失能力 | OpenCode 实现 | 影响评估 |
|---------|--------------|---------|
| **多 Agent 系统** | 内置 7 个 agent（build/plan/general/explore/compaction/title/summary）+ 自定义 agent 配置 | 本项目仅有单 Agent 三步固定流程，无 agent 多态 |
| **Sub-agent / Task 工具** | `task` 工具支持子代理调度 + **background 后台模式** + resume | 本项目的多 Agent DAG 在 Phase 2+ 排除项 |
| **Plan Mode** | 独立 `plan` agent（只读分析）+ `plan_enter`/`plan_exit` 工具 + 计划文件持久化 | 本项目的 `/plan` 仅是斜杠命令，无独立 agent |
| **Compaction（会话压缩）** | token-aware pruning（PRUNE_MINIMUM=20000）+ 保护 skill 输出 + 自动压缩 | 长会话场景无优化 |
| **Snapshot / Revert** | 基于 git 的独立 gitdir 快照 + 文件级 diff + revert + unrevert + 自动 prune | 本项目的 checkpoint 在 change-engine 中，但无 message-level revert |
| **Session Fork / 分支** | `parent_id` 子会话 + Fork 从某 message 分叉 + 标题累加 `(fork #N)` | 无会话分支 |
| **Provider-specific Prompts** | 按模型选择 system prompt（anthropic/gpt/gemini/kimi/codex/beast 等 8+） | 本项目的 prompt 系统单一 |
| **LSP 集成** | 完整 LSP 客户端 + lsp 工具（定义/引用/符号/诊断） | 无 LSP，仅大纲解析 |

### 🔴 协议与生态缺失

| 缺失能力 | OpenCode 实现 | 影响评估 |
|---------|--------------|---------|
| **MCP 完整集成** | `@modelcontextprotocol/sdk` + 3 种 transport + **完整 OAuth** + MCP 资源作为工具 | 本项目仅开发环境 `.mcp.json`，Phase 2+ 计划 |
| **Plugin 系统** | npm + 本地插件 + Hooks（before/after）+ 内置 10+ 插件（Copilot/Codex/Cloudflare 等） | 无插件生态 |
| **ACP（Agent Client Protocol）** | 与 Zed 等编辑器集成 | 无 |
| **HTTP API 服务器** | Hono 20+ 路由组 + 完整 OpenAPI + 自动生成 SDK | 本项目仅 Tauri IPC，无 HTTP API |
| **CodeMode（沙箱 JS 执行）** | 受限 JS 执行 + Promise 并发 + diagnostic 系统 | 无 |

### 🔴 工具与功能缺失

| 缺失能力 | OpenCode 实现 | 影响评估 |
|---------|--------------|---------|
| **WebFetch / WebSearch 工具** | 内置 webfetch + websearch 工具 | Agent 无法主动获取网络信息 |
| **多 LLM Provider 支持** | 25+ Provider（Anthropic/OpenAI/Google/Bedrock/Azure/xAI/Mistral 等） | 本项目仅 DeepSeek + MiniMax |
| **Session 分享** | 分享到 URL + auto-share 模式 | 无 |
| **GitHub Agent** | `opencode github install/run` + PR 事件处理 | 本项目有 CI Status 但无 GitHub Agent |
| **Reference 系统** | 额外可访问目录（LocalSource/GitSource）+ 自动注入 system prompt | 无 |
| **自定义命令配置** | config `command` 定义 + 模板变量 `$1`/`$ARGUMENTS` + hints 自动提取 | 本项目的斜杠命令仅 6 个内置 |
| **自定义 Agent 配置** | config `agent` 覆盖/新增 + `Agent.generate` LLM 生成 | 无 |
| **Hot Reloadable Config** | 配置变更触发 invalidate + InstanceState 重建 | 待确认 |
| **Durable Session Execution** | 进程崩溃恢复 + SessionRunCoordinator 合并 resume | 待确认 |
| **TUI 主题系统** | 32+ 内置主题（catppuccin/dracula/gruvbox 等） | 本项目仅有亮/暗主题 |

### 🟡 权限系统差异

| 维度 | AI Digital Life | OpenCode |
|------|----------------|----------|
| 模型 | 三级 RiskLevel（Low/Medium/High）+ 任务审批 | **Permission Ruleset**（allow/ask/deny + Wildcard 通配） |
| 评估 | `assess_command_risk` + `requires_approval` | `evaluate(permission, pattern, ...rulesets)` 找最后匹配规则 |
| 特殊规则 | Tauri capabilities 白名单 | `.env` ask / `doom_loop` ask / `external_directory` ask |
| 子代理权限 | 无 | `deriveSubagentSessionPermission` 派生 |
| 持久化 | 审计日志 + ApprovalCard | `SessionTable.permission` + `state.approved` |

---

## 三、两者相同的内容

| 能力 | 共同点 |
|------|--------|
| **Agent / AI 集成** | 都有 Agent runtime + 模型网关 + 流式输出 |
| **终端 / PTY** | 都基于 node-pty / portable-pty + 会话管理 + 流式输出 |
| **Git 集成** | 都有 status/diff/branch + patch 应用 |
| **Diff / 变更预览** | 都有 patch 预览/应用 + 文件级 diff |
| **工作区管理** | 都支持多工作区 + 项目识别 |
| **文件操作** | read/write/edit/glob/grep + 文件树 |
| **命令执行** | 都有命令运行 + 风险评估 |
| **权限/审批** | 都有 approval 机制 + 审计 |
| **SQLite 存储** | 都用 SQLite 持久化 |
| **配置系统** | 都有 JSON 配置 + 项目级/全局级 |
| **Skills 系统** | 本项目有 Superpowers 23 个开发技能，OpenCode 有 SKILL.md 发现机制 |
| **斜杠命令** | 都有内置命令 |
| **i18n** | 都支持多语言 |
| **MCP 配置** | 都有 `.mcp.json` 配置文件（本项目仅开发环境） |

---

## 四、本项目有但 OpenCode 没有的内容

### 🟢 独有优势

| 独有能力 | 实现位置 | 优势 |
|---------|---------|------|
| **Rust 后端** | 19 个领域 crate | 性能 + 内存安全 + 无 GC 暂停 |
| **Tauri 2.x 桌面** | src-tauri/ | 比 Electron 轻量（~10MB vs ~100MB） |
| **内置浏览器（完整 WebView 子进程）** | `crates/browser/` 13 个子模块（webview2 系列）+ `features/browser/` | OpenCode 无内置浏览器，仅 WebFetch |
| **三端架构** | Tauri + Browser Preview + Mock | OpenCode 是 TUI + Web + Desktop，本项目的浏览器预览模式独有 |
| **双端一致性验证** | `pnpm run dev:both` | 强制 Tauri/Browser 行为一致 |
| **多工作区容器** | `features/multi-workspace/` + 5 个 workspace-* 模块 | OpenCode 的 workspace 概念不同（更偏向 git worktree） |
| **文件大纲解析（14 种语言）** | `crates/outline/` 独立 crate | OpenCode 依赖 LSP，本项目独立实现 |
| **CodeMirror 6 编辑器集成** | `features/editor/`（折叠/主题/滚动同步/Lint） | OpenCode 是 TUI，无内置代码编辑器 |
| **文件预览（Markdown/PDF/Docx）** | `features/preview/`（markdown-it + pdfjs + mammoth） | OpenCode 无 PDF/Docx 预览 |
| **GitHub 仓库树形目录** | `features/github-tree/` + `githubSlice` | OpenCode 有 GitHub Agent 但无仓库树 |
| **CI Status 集成** | `crates/ci-status/`（GitHub Actions 轮询/缓存/解析） | OpenCode 无 CI 集成 |
| **凭证存储（keyring + 加密文件降级）** | `crates/credential/` | OpenCode 有 auth 但无 keyring 降级 |
| **调试日志收起器** | 右上角按钮 + `debug-logs.txt` + `__clearDebugLogs()` | OpenCode 有 debug 子命令但无 UI 收起器 |
| **i18n 全覆盖约束** | 13 个领域 / 936 keys + TCopyContext | OpenCode TUI i18n 18 种，但本项目覆盖率约束更严 |
| **Superpowers 技能系统（开发侧）** | `.opencode/skills/` 23 个技能 | 用于 AI 代理开发辅助（非应用功能） |
| **明确的 Phase 路线图** | Phase 0/1/2/3 | OpenCode 无明确阶段规划 |
| **领域驱动 crate 拆分** | 19 个独立 crate | OpenCode 是 monorepo packages，本项目拆分更细粒度 |
| **Zustand 切片合并模式** | 23 slice + 15 action 模块 | OpenCode 用 Effect，本项目模式更轻量 |
| **IPC 契约域拆分** | 16 个 IPC 域文件 + 三端对齐 | OpenCode 是 HTTP API，本项目 IPC 契约更严格 |
| **安全边界（WebView 隔离）** | WebView 不得直接访问 fs/进程/SQLite/密钥 | OpenCode 是 Node 进程，无此隔离 |

---

## 五、关键差距总结

### 🎯 最值得借鉴的 5 项 OpenCode 设计

1. **多 Agent + Sub-agent 系统** — 本项目的单 Agent 是最大瓶颈，建议优先实现
2. **MCP 完整集成** — 本项目已规划 Phase 2+，可参考 OpenCode 的 OAuth 实现
3. **Permission Ruleset（allow/ask/deny + Wildcard）** — 比本项目的三级 RiskLevel 更灵活
4. **Snapshot / Revert** — 基于 git 的 message-level 回滚，用户体验关键
5. **Compaction（会话压缩）** — 长会话必备，token-aware pruning

### 🎯 本项目核心护城河

1. **Rust + Tauri 性能优势** — 启动快、内存小、无 GC
2. **内置浏览器** — OpenCode 完全没有，是最大差异化
3. **三端架构 + 双端一致性** — 开发体验优秀
4. **CI Status + GitHub 仓库树** — OpenCode 无 CI 集成
5. **CodeMirror 编辑器 + 文件预览** — OpenCode TUI 无此能力

### 📊 成熟度对比

| 维度 | AI Digital Life | OpenCode |
|------|----------------|----------|
| Agent 成熟度 | 🟡 单 Agent 薄切片 | 🟢 7 agent + subagent + background |
| 生态完整度 | 🟡 无 MCP/Plugin | 🟢 完整 MCP + Plugin + ACP |
| 桌面体验 | 🟢 Tauri + 浏览器 + 编辑器 | 🟡 Electron + TUI 为主 |
| 性能 | 🟢 Rust | 🟡 TypeScript |
| 工具丰富度 | 🟡 6 个斜杠命令 | 🟢 18+ 工具 + 自定义命令 |
| Provider 支持 | 🔴 2 个 | 🟢 25+ |
| 安全隔离 | 🟢 WebView 隔离 | 🟡 Node 进程 |
| 阶段规划 | 🟢 明确 Phase 路线图 | 🟡 无明确规划 |

---

## 六、结论与建议

本项目在**桌面体验、性能、内置浏览器、CI 集成**方面领先 OpenCode，但在 **Agent 成熟度、MCP/Plugin 生态、多 Provider、Sub-agent、会话管理（Fork/Revert/Compaction）** 方面落后。

建议按 Phase 2+ 路线图优先补齐以下三项核心能力：

1. **多 Agent 系统** — 参考 OpenCode 的 `build/plan/general/explore` 四类基础 agent
2. **MCP 完整集成** — 参考 OpenCode 的 3 种 transport + OAuth 完整流程
3. **Sub-agent / Task 工具** — 参考 OpenCode 的 background 后台模式 + resume 机制

后续可继续补齐：Snapshot/Revert、Compaction、Permission Ruleset、LSP 集成、多 Provider 支持。
