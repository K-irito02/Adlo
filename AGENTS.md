# Adlo - 项目治理规则

本仓库是 Adlo 的单一仓库：根目录承载规划与治理，`adlo/` 是基于 Rust + Tauri 2.x 的桌面应用实现工作区。

## 双根结构

| 目录          | 职责                                                                                            |
| ------------- | ----------------------------------------------------------------------------------------------- |
| 仓库根目录    | 规划与治理：`AGENTS.md`、`docs/`、`CONTRIBUTING.md`、`GLOSSARY.md`、`CONTEXT.md`、`SECURITY.md` |
| `adlo/`       | 实现工作区：Rust + Tauri 桌面应用 + WebView 前端                                                |
| `references/` | 外部参考源码（本地拉取的开源项目，供开发参考与复用）                                            |

## 项目形态

当前形态：**桌面应用宿主 + 第三方 Agent harness 集成**。Agent 对话、模型接入与编排不由本仓实现，交由接入的第三方 harness 提供（当前为 DSH 与 OpenCode CLI）；本仓仅负责宿主集成。技术栈与功能清单见 [adlo/AGENTS.md](./adlo/AGENTS.md)；范围边界见 [phase-boundary.md](.agents/rules/phase-boundary.md)。

## 代码知识图谱

`adlo/` 配置 CodeGraph 本地图谱（`adlo/.codegraph/`，SQLite；MCP 仅暴露 `codegraph_explore`）。查询、检索代码优先用图谱，不逐文件 grep/Read；跨文件调用链/影响面（如「星标 → store → 树节点」）优先一次 `codegraph_explore` 拿到源码与调用路径，单文件细节再 Read；技能见 [SKILLS.md](./SKILLS.md) 的 `codegraph-knowledge-graph`（符号查询 `maxFiles: 3`）。外部参考代码直接复用须标注 MIT 来源；渐进式源码索引见 [docs/analysis/adlo/](./docs/analysis/adlo/)。

## 并行开发（多会话 / 多 agent）

并发会话一律在 `SourceWorkspace-worktrees/` 下独立工作树中开发，遵循 **一分支 = 一工作树 = 一会话**；流程（开工自检、新建/复用槽位、保留策略、异常处置）以技能 [parallel-branch-development](.agents/skills/parallel-branch-development/SKILL.md) 为唯一真源。**开工铁律**：改任何文件前，先在目标目录输出该技能 §2 的 `[ENV]` 快照并经用户选定工作树（可运行 `pnpm --dir adlo run worktree:env` 生成）。新工作树先跑 `pnpm --dir adlo run setup:worktree`（hooks + CodeGraph 索引）。

## 问题排查与调试

排查问题时**先定位根本原因**，禁止凭空猜测；无法定位根因时用调试手段代替猜测。调试工具见 [adlo/AGENTS.md#调试工具](./adlo/AGENTS.md#调试工具)，排查规范见 [dev-rules.md](.agents/rules/dev-rules.md#问题排查规范)。

## 工具选择（Agent）

- **内容检索一律用 `grep` 工具**（禁 PowerShell `Select-String`，包括用它过滤命令输出/管道；文件名/扩展名检索用 `glob` 工具或 `git ls-files`；禁任何 `git grep`）。**读取文本文件一律用 `read` 工具**（PowerShell `Get-Content`/`cat` 会把 UTF-8 中文在 GBK 控制台打成乱码，2026-11-12 retro 实测）；需要压缩命令输出时用工具自带参数（如 `--reporter=dot`）或 `Select-Object -Last`，不要用 `Select-String`。站点元数据缓存排查用 `dump-site-meta` 示例（`cargo run -p adl-browser --example dump-site-meta -- <data_dir> [url]`），免先给环境装 sqlite3 CLI。
- **外部产品对标 / 长文档调研**：优先用 `research` 技能派子代理；主上下文只收摘要、来源链接与适配结论。
- **批量修改源码/文档一律用 `edit`/`write`**；禁 shell 内联 `-replace`/`Add-Content`/here-string/`sed`/`node -e` 等（破坏 CJK，见 [shell-encoding.md](.agents/rules/shell-encoding.md)，已由 `.opencode/opencode.json` 权限拒绝）。提交信息/参数含这些字样时用 `git commit -F <文件>`。

## 磁盘空间

见 [adlo/AGENTS.md#磁盘空间管理](./adlo/AGENTS.md#磁盘空间管理)（第三方依赖 `debug=1`；`target/debug` 超阈值全量 `cargo clean`）。

## 禁止项

> 标注「自动校验」的条目由 pre-commit 脚本强制执行，不要绕过（`--no-verify`）；更细的规范见 [`.agents/rules/`](.agents/rules/)。

「自动校验」集（pre-commit 拦截）：capability 通配、e2e 配置泄漏生产、`.agents`/`.opencode`/`.trae` 镜像不同步（`check-agent-dirs`）；标识符回潮（`check-stale-terms`）；store 新增 `as any` / `as unknown as`（`check-no-new-any`）；调试日志遗留生产（`check-source-hygiene`）；违反「工具选择」（shell 权限 + `check-source-hygiene`）。

判断项（审查判断，不自动拦截）：见 [review-judgements.md](.agents/rules/review-judgements.md)（按需加载，审查代理逐条核对越权、分层、凭据、单端、i18n、iframe/WebView、面板归属计数等）。

## 双端一致性

所有功能必须在 **Tauri 桌面应用** 和 **浏览器模式** 中保持**功能行为一致**；实现策略可因环境而异（Tauri 有 Rust 后端 + SQLite，浏览器仅 WebView + Web API）：

- **功能行为必须一致**：用户可感知的输入→输出、交互流程、数据结果在两种模式下相同
- **实现策略可以不同**：存储后端（SQLite vs IndexedDB）、系统能力（原生对话框 vs Web API）、性能特征等可因环境采取不同方案
- **统一接口抽象**：通过接口（如 `TerminalOutputStore`、`PreviewBridge`）隔离环境差异，消费端不感知底层实现
- **新增 IPC 方法必须同步实现** `tauri-bridge.ts` / `preview-bridge/` / `mock-bridge.ts`

> **桌面 E2E（opt-in）**：`pnpm run e2e` 用 `@wdio/tauri-service` 驱动真实 Tauri 窗口，作为桌面-only 交互的补充冒烟；**不替代**双端人工验证，也不属于 `check:all`。入口与排障见技能 `desktop-e2e-wdio`。

## 编码规范

- 分支命名：kebab-case，最多 3 个单词，禁止斜杠与类型前缀（示例：`session-recovery`）
- Commit：`type(scope): summary`，常用 scope：`core`、`frontend`、`rust`、`stores`、`browser`、`terminal`、`ipc`、`docs`、`deps`
- TypeScript/Rust 风格、Commit 与分支细则见 [dev-rules.md](.agents/rules/dev-rules.md)；测试规范见 [mandatory-testing.md](.agents/rules/mandatory-testing.md)

## Agent skills

Issue tracker 存放在 GitHub Issues（`K-irito02/Adlo`，`gh` CLI）；五个规范 triage 标签（`needs-triage` / `needs-info` / `ready-for-agent` / `ready-for-human` / `wontfix`）见 `docs/agents/triage-labels.md`；术语表 `GLOSSARY.md`、决策记录 [docs/adr/](docs/adr/)（按域索引见 `docs/adr/README.md`）。详见 `docs/agents/`。

## 相关文档

- [adlo/AGENTS.md](./adlo/AGENTS.md) — 实现工作区治理；[commands.md](.agents/rules/commands.md) — 常用命令速查
- [parallel-branch-development](.agents/skills/parallel-branch-development/SKILL.md) / [run-project-surfaces](.agents/skills/run-project-surfaces/SKILL.md) / [root-cause-to-close](.agents/skills/root-cause-to-close/SKILL.md) — 并行开发 / 双端启动 / 收尾
- [RULES.md](./RULES.md) / [SKILLS.md](./SKILLS.md) — 规则 / 技能系统说明与索引
- [GLOSSARY.md](./GLOSSARY.md) — 术语表；[CONTEXT.md](./CONTEXT.md) — 架构说明；[RELEASE-CHECKLIST.md](./RELEASE-CHECKLIST.md) — 发布清单
- [docs/development/project-engineering-constraints.md](./docs/development/project-engineering-constraints.md) — 工程约束
- [docs/development/adding-an-ipc-domain.md](./docs/development/adding-an-ipc-domain.md) — 新增 IPC 域端到端接线清单
- [docs/knowledge-base/README.md](./docs/knowledge-base/README.md) — 经验教训索引
