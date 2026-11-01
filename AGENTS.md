# AI 数字生命 - 项目治理规则

## 项目定位

本仓库是 AI 数字生命项目的规划与治理工作区。根目录以文档和架构设计为主，`ai-digital-life/` 是基于 **Rust + Tauri 2.x** 的桌面应用实现工作区。

## 双根结构

| 目录 | 职责 |
|------|------|
| 仓库根目录 | 规划与治理：`AGENTS.md`、`docs/`、`CONTRIBUTING.md`、`GLOSSARY.md`、`CONTEXT.md`、`SECURITY.md` |
| `ai-digital-life/` | 实现工作区：Rust + Tauri 桌面应用 + WebView 前端 |
| `references/` | 外部参考源码（本地拉取的开源项目，供开发参考与复用） |

## 源码地图与代码知识图谱

| 参考项 | 说明 |
|------|------|
| 源码地图 (ADL) | [docs/analysis/ai-digital-life/](./docs/analysis/ai-digital-life/)（本项目的渐进式索引） |

> **代码知识图谱**：`ai-digital-life/` 配置了 [CodeGraph](https://github.com/colbymchenry/codegraph)（MIT 许可）本地知识图谱（实现工作区根 `ai-digital-life/.codegraph/`，SQLite）。MCP 接入见项目配置 [.opencode/opencode.json](./.opencode/opencode.json)（`mcp.servers.codegraph`），默认只暴露 `codegraph_explore` 一个工具；找符号/调用方/影响范围等细分查询走 `codegraph` CLI。查询、检索代码时优先使用图谱，技能说明见 [SKILLS.md](./SKILLS.md) 中的 `codegraph-knowledge-graph`。
>
> 参考代码直接复用需遵守 MIT 许可要求，并在代码注释中标注来源。

## 项目形态

当前形态：**桌面应用宿主 + 第三方 Agent harness 集成**。Agent 对话、模型接入与编排能力不由本仓库实现，交由接入的第三方 harness 提供（当前为 DSH 与 OpenCode CLI），本仓库仅负责宿主集成（进程托管、版本管理、宿主渲染、终端可用性）。

技术栈详情与已实现功能清单见 [ai-digital-life/AGENTS.md](./ai-digital-life/AGENTS.md)。范围边界与排除项见 [phase-boundary.md](.agents/rules/phase-boundary.md).

## 并行开发（多会话 / 多 agent）

并发会话一律在 `SourceWorkspace-worktrees/` 下的独立工作树中开发，遵循 **一分支 = 一工作树 = 一会话**：禁止两个会话进入同一目录，禁止跨工作树直接编辑文件。

开工自检、新建与复用槽位、保留策略、异常处置见技能 [parallel-branch-development](.agents/skills/parallel-branch-development/SKILL.md)（唯一真源）。硬约束摘要：契约文件单写者、禁止共享 `CARGO_TARGET_DIR`、分支工作树不写 `.workbuddy/memory`、工作树默认保留。

**开工铁律**：改任何文件前，先在目标目录输出该技能 §2 的 `[ENV]` 快照并经用户选定工作树（§3 二选一）；无快照不得开工。

新工作树先跑 `pnpm --dir ai-digital-life run setup:worktree`：启用仓库级 git hooks（`core.hooksPath=.githooks`）并为该工作树建 CodeGraph 索引（`ai-digital-life/.codegraph/`，不入库、不跨工作树共用）。

## 问题排查与调试

排查问题时**先定位根本原因**，不要急于添加预防措施/防御性代码/解决方案。无法定位根因时，使用调试日志收起器（最高优先级）、复制调试日志按钮等调试手段，**禁止凭空猜测**。

调试工具详情（日志收起器、复制按钮、自动写入等）见 [ai-digital-life/AGENTS.md#调试工具](./ai-digital-life/AGENTS.md#调试工具)，排查规范见 [dev-rules.md](.agents/rules/dev-rules.md#问题排查规范)。

## 工具选择（Agent）

- **内容检索一律用 `grep` 工具**；禁止 PowerShell `Select-String`（CJK 输出乱码）与带引号的 `git grep`（PowerShell 转义会报 `fatal: unable to resolve revision`）。文件名/扩展名检索用 `glob` 工具或 `git ls-files`。
- **批量修改源码/文档一律用 `edit`/`write`**；禁止 shell 内联 `-replace`/`Add-Content`/here-string/`sed`（会破坏 CJK、写入字面量 `\n`、静默失效，见 [shell-encoding.md](.agents/rules/shell-encoding.md)）。

## 磁盘空间

第三方依赖 `debug=1`（自己 crate 白名单保留 `debug=2` 可断点调试）。

**清理策略（空间阈值触发全量清理，见 [ai-digital-life/AGENTS.md#磁盘空间管理](./ai-digital-life/AGENTS.md#磁盘空间管理)）：**
- 空间条件：`ai-digital-life/target/debug` 超过 30 GB → 全量清理

超过阈值即运行 `ai-digital-life/.cargo/clean-target.ps1` 执行 `cargo clean` 全量删除（不按时间窗口判断；`-WhatIf` 干跑预览，`-Full` 强制全清）。`cargo prune` 为 `cargo clean` 别名。删除为**永久删除**：直接物理删除构建产物，**不进入回收站/垃圾箱**，无需清空回收站。

## 禁止项

> 标注「自动校验」的条目由对应脚本在 pre-commit / pre-push 强制执行；其余条目仍需审查判断。
> 更细的规范见 [`.agents/rules/`](.agents/rules/)（`shell-encoding`、`hint-color-usage`、`quality-gates`、`dev-rules` 等）；本清单只保留高频、跨领域的硬约束。

- WebView 直接触达系统能力（必须通过 Tauri Command）
- 低层 crate 依赖高层 crate
- 凭据写入普通配置或日志（必须通过 `crates/credential/` 存储）
- UI/UX 或功能变更后跳过红绿测试
- 未获用户批准就执行全量测试 / 全量门禁（`check:full`、`cargo test --workspace`）或发布打包（`cargo tauri build`）；日常只跑受变更影响的测试
- 以下三类已由自动校验拦截（pre-commit 跑 `ai-digital-life/scripts/*.test.mjs`）：capability 通配权限、e2e 配置泄漏到生产构建、`.agents` 规则/技能未同步到 `.opencode` / `.trae` 镜像——不要用 `--no-verify` 绕过
- 功能或显示效果仅在 Tauri 或浏览器单一模式下可用（必须双端一致）
- WebView URL 变化被动触发 Tauri navigateTab（必须由前端发起操作显式调用，见 `browserpanel.tsx:submitAddress`、`BrowserPanelActionsContext.ts:handleOpenTabFromTree`）
- 任何 UI 展示文本硬编码（包括但不限于按钮/Tooltip/aria-label/占位符/过滤器标签/相对时间/日期格式/面包屑标签映射），必须使用 i18n key
- 语言切换时依赖 Zustand store 易变数据的渲染条件缺少 fallback 导致标题行/路径栏消失
- 错误提示/状态提示常驻显示（必须仅在活跃错误状态下可见）
- 调试日志（`console.log`/`[ADL-DEBUG]`）遗留生产代码不清理
- iframe 嵌入缺少前置检测（必须使用 checkEmbed HEAD 预检 + 同步 ref 门控 + 基于 attachShadow mode:closed 的 SafeIframe 沙箱保护，标准 `<iframe>` JSX 会导致 React DevTools 跨域 SecurityError）
- Tauri 桌面模式下依赖 CSS z-index 覆盖浏览器原生 WebView（WebView2 是 OS 级渲染表面。浮动菜单/对话框出现时：必须通过 `browser_set_bounds` 移出画面，使用 State + MutationObserver 双路检测协同。面板 Resize Handle 被覆盖时：采用"区域逃逸"方案——handle 向左扩展 8px 进入中心（无 WebView），无需 IPC 干预）
- 未发布产品的开发阶段禁止添加/保留数据格式兼容或旧版本迁移代码（产品发布后需添加时须先与用户确认）
- 禁止「向后兼容」重导出或类似仅为旧导入路径保留的兼容层
- 未经用户允许禁止擅自使用蓝色（含 `var(--accent)` 系）作为特殊提示警醒色、填充色等；此类场景一律使用白/灰/黑中性色（明度/纯度自行设计，须兼顾亮暗主题可见性），需其它颜色时先与用户确认（规范见 `.agents/rules/hint-color-usage.md`）
- 违反上方「工具选择（Agent）」小节（PowerShell `Select-String`、shell 内联批量改写源码/文档）
- 并行开发时两个会话共用同一工作树目录、共享 `CARGO_TARGET_DIR`、或在分支工作树写 `.workbuddy/memory`（见技能 [parallel-branch-development](.agents/skills/parallel-branch-development/SKILL.md)）

## 双端一致性

所有功能必须在 **Tauri 桌面应用** 和 **浏览器模式** 中保持**功能行为一致**。由于两种模式的运行环境不同（Tauri 有 Rust 后端 + SQLite + 系统 API，浏览器仅有 WebView + Web API），实现策略可以因环境而异：

- **功能行为必须一致**：用户可感知的输入→输出、交互流程、数据结果在两种模式下相同
- **实现策略可以不同**：存储后端（SQLite vs IndexedDB）、系统能力（原生对话框 vs Web API）、性能特征等可因环境采取不同技术方案
- **统一接口抽象**：通过接口（如 `TerminalOutputStore`、`PreviewBridge`）隔离环境差异，消费端不感知底层实现
- **新增 IPC 方法必须同步实现** `tauri-bridge.ts` / `preview-bridge/` / `mock-bridge.ts`

> **示例**：终端输出持久化 — Tauri 模式使用 SQLite，浏览器模式使用 IndexedDB，两者通过统一的 `TerminalOutputStore` 接口提供相同的功能行为。

> **桌面 E2E（opt-in）**：`pnpm run e2e` 用 `@wdio/tauri-service` 驱动真实 Tauri 窗口，作为桌面-only 交互的补充冒烟；**不替代**双端人工验证，也不属于 `check:all`。入口与排障见技能 `desktop-e2e-wdio`。

## 编码规范

### 分支命名
- 使用短横线分隔（kebab-case），最多 3 个单词
- 禁止斜杠、禁止类型前缀（如 `feat/`、`fix/`）
- 示例：`session-recovery`、`fix-scroll-state`、`browser-panel-fix`

### Commit 与 PR 标题
使用 Conventional Commit 风格：`type(scope): summary`

| 类型 | 用途 | 示例 |
|------|------|------|
| `feat` | 新功能 | `feat(session): add message streaming` |
| `fix` | Bug 修复 | `fix(browser): resolve crash on navigate` |
| `docs` | 文档变更 | `docs: update contributing guide` |
| `chore` | 维护任务 | `chore(deps): bump tauri version` |
| `refactor` | 重构 | `refactor(stores): extract browser slice` |
| `test` | 测试 | `test(workspace): add tree parsing` |

Scope 可选项：`core`、`frontend`、`rust`、`stores`、`browser`、`terminal`、`ipc`、`docs`、`deps` 等。

TypeScript/Rust 风格指南、Commit 规范详见 [dev-rules.md](.agents/rules/dev-rules.md)。

测试规范详见 [mandatory-testing.md](.agents/rules/mandatory-testing.md)。

## Agent skills

### Issue tracker

Issue 与 spec 存放在 GitHub Issues（`K-irito02/Kora`），使用 `gh` CLI。详见 `docs/agents/issue-tracker.md`。

### Triage labels

五个规范标签：`needs-triage` / `needs-info` / `ready-for-agent` / `ready-for-human` / `wontfix`。详见 `docs/agents/triage-labels.md`。

### Domain docs

单上下文：术语表为仓库根 `GLOSSARY.md`，决策记录在 `docs/adr/`。详见 `docs/agents/domain.md`。

## 相关文档

- [ai-digital-life/AGENTS.md](./ai-digital-life/AGENTS.md) — 实现工作区治理（技术栈、功能清单、Stores 架构）
- [parallel-branch-development](.agents/skills/parallel-branch-development/SKILL.md) — 并行分支开发技能（唯一真源；工作树/槽位、开工自检、复用与保留策略）
- [commands.md](.agents/rules/commands.md) — 常用命令速查（开发服务器从当前工作树的 `ai-digital-life/` 执行）
- [run-project-surfaces](.agents/skills/run-project-surfaces/SKILL.md) — browser / tauri / both 启动、端口与停止
- [root-cause-to-close](.agents/skills/root-cause-to-close/SKILL.md) — P0–P6 收尾、P4 审查与文档同步流程
- [FUTURE-ROADMAP.md](./FUTURE-ROADMAP.md) — 未来想法
- [CONTRIBUTING.md](./CONTRIBUTING.md) — 贡献指南
- [GLOSSARY.md](./GLOSSARY.md) — 领域术语表（规范用词与 `_Avoid_` 同义项）
- [CONTEXT.md](./CONTEXT.md) — 架构与实现说明（架构概念、实现落点、文件路径）
- [RULES.md](./RULES.md) — 规则系统（分层与优先级、三目录同步、文件规范、规则清单）
- [SKILLS.md](./SKILLS.md) — 技能系统（来源分类、三技能目录、同步规则、技能摘要）
- [SECURITY.md](./SECURITY.md) — 安全策略
- [docs/development/project-engineering-constraints.md](./docs/development/project-engineering-constraints.md) — 工程约束
- [docs/development/adding-an-ipc-domain.md](./docs/development/adding-an-ipc-domain.md) — 新增 IPC 域的端到端接线清单（Rust / 四端桥接 / store / UI / 测试）
- [docs/knowledge-base/README.md](./docs/knowledge-base/README.md) — 经验教训与总结索引
