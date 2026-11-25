# Adlo - 项目治理规则

本仓库是 Adlo 的单一仓库：根目录承载规划与治理，`adlo/` 是基于 Rust + Tauri 2.x 的桌面应用实现工作区。

## 双根结构

| 目录       | 职责                                                                                            |
| ---------- | ----------------------------------------------------------------------------------------------- |
| 仓库根目录 | 规划与治理：`AGENTS.md`、`docs/`、`CONTRIBUTING.md`、`GLOSSARY.md`、`CONTEXT.md`、`SECURITY.md` |
| `adlo/`    | 实现工作区：Rust + Tauri 桌面应用 + WebView 前端                                                |

> `references/`（主工作树本地，未入库）：外部参考源码，供开发参考与复用；工作树中不存在。

## 项目形态

当前形态：**桌面应用宿主**（工作区、编辑器、终端、浏览器、存储与系统能力）。技术栈与功能清单见 [adlo/AGENTS.md](./adlo/AGENTS.md)；范围边界见 [phase-boundary.md](.agents/rules/phase-boundary.md)。

## 代码知识图谱

- **符号 / 调用链 / 影响面**：用 `codegraph_explore` 一次拿源码与调用路径（如「星标 → store → 树节点」）；技能 `codegraph-knowledge-graph`，符号查询 `maxFiles: 3`。
- **触发条件**：一次改动要跨 ≥3 个调用点、或跨 Rust / TS 边界找调用链时，先用 `codegraph_explore` 拿到全部调用点与源码，再逐文件读；不要先 grep 再逐个 read。
- **字面量检索**（i18n 文案、CSS 类名 / 选择器、菜单 / 命令键值、配置键）：用 `grep`；图谱按词法召回，字面量查询会带出无关源码。
- **单文件细节**：用 `read`。
- **外部参考代码直接复用**须标注 MIT 来源；渐进式源码索引见 [docs/analysis/adlo/](./docs/analysis/adlo/)。

## 并行开发（多会话 / 多 agent）

并发会话在 `SourceWorkspace-worktrees/` 下独立工作树开发：**一分支 = 一工作树 = 一会话**。流程（开工自检、新建 / 复用槽位、保留策略、异常处置）以 [parallel-branch-development](.agents/skills/parallel-branch-development/SKILL.md) 为唯一真源。

**开工铁律：** 改任何文件前，先输出该技能 §2 的 `[ENV]` 快照并经用户选定工作树（`pnpm --dir adlo run worktree:env`）。新工作树先跑 `pnpm --dir adlo run setup:worktree`（hooks + CodeGraph 索引）。

## 问题排查与调试

**先定位根本原因，再修复**；无法定位时用调试手段代替猜测。全流程用 [root-cause-to-close](.agents/skills/root-cause-to-close/SKILL.md) 技能。调试工具见 [adlo/AGENTS.md#调试工具](./adlo/AGENTS.md#调试工具)，排查规范见 [dev-rules.md](.agents/rules/dev-rules.md#问题排查规范)。

## 工具选择（Agent）

- **检索用 `grep`，读文本用 `read`**：`grep` 不给上下文行，要看上下文用 `read` 取行段；`Select-String` 与 `Get-ChildItem -Recurse` 已被 shell 权限拦截（列目录用 `glob`、`git ls-files` 或单层 `Get-ChildItem <dir>`）；`Get-Content` / `cat` 在 GBK 控制台会把 UTF-8 中文打成乱码。
- **文件名检索用 `glob` / `git ls-files`**；`git grep` 不用。
- **短输出**用工具自带参数（如 `--reporter=dot`）或 `Select-Object -Last`；**长门禁 / 开发服务器**先落盘再读 tail（管道会缓冲到进程退出，看似挂起）。
- **站点元数据**用 `dump-site-meta`：在 `adlo/` 下运行 `cargo run -p adl-browser --example dump-site-meta -- <数据根> [url] [--missing-favicon]`（免装 sqlite3 CLI）。
- **外部产品对标 / 长文档调研**：优先用 `research` 技能派子代理；主上下文只收摘要、来源链接与适配结论。
- **批量修改源码 / 文档**用 `edit` / `write`；shell 内联 `-replace` / `Add-Content` / here-string / `sed` / `node -e` 会破坏 CJK（见 [shell-encoding.md](.agents/rules/shell-encoding.md)，已由 `.opencode/opencode.json` 权限拒绝）。提交信息 / 参数含这些字样时用 `git commit -F <文件>`。

## 磁盘空间

见 [adlo/AGENTS.md#磁盘空间管理](./adlo/AGENTS.md#磁盘空间管理)；`target/debug` 超阈值时在 `adlo/` 下清理（删除不可恢复）。

## 禁止项

> 「自动校验」由 pre-commit 强制执行，保留门禁（`--no-verify` 不是常规出口）；更细的规范见 [`.agents/rules/`](.agents/rules/)。

| 检查 | 拦截内容 |
| --- | --- |
| `check-agent-dirs` | capability 通配、e2e 配置泄漏生产、`.agents` / `.opencode` / `.trae` 镜像不同步 |
| `check-stale-terms` | 标识符回潮 |
| `check-no-new-any` | store 新增 `as any` / `as unknown as` |
| `check-source-hygiene` | 调试日志遗留生产、未发布兼容代码、违反「工具选择」（shell 权限 + 脚本） |

判断项（审查判断，不自动拦截）：见 [review-judgements.md](.agents/rules/review-judgements.md)（按需加载，审查代理逐条核对越权、分层、凭据、单端、i18n、iframe/WebView、面板归属计数等）。

## 双端一致性

所有功能必须在 **Tauri 桌面应用** 和 **浏览器模式** 中保持**功能行为一致**；实现策略可因环境而异（Tauri 有 Rust 后端 + SQLite，浏览器仅 WebView + Web API）：

- **功能行为必须一致**：用户可感知的输入→输出、交互流程、数据结果在两种模式下相同
- **实现策略可以不同**：存储后端（SQLite vs IndexedDB）、系统能力（原生对话框 vs Web API）、性能特征等可因环境采取不同方案
- **统一接口抽象**：通过接口（如 `TerminalOutputStore`、`PreviewBridge`）隔离环境差异，消费端不感知底层实现
- **新增 IPC 方法必须同步实现** `tauri-bridge.ts` / `preview-bridge/` / `mock-bridge.ts`

> **桌面 E2E（opt-in）**：在 `adlo/` 下运行 `pnpm run e2e`（仓库根用 `pnpm --dir adlo run e2e`），用 `@wdio/tauri-service` 驱动真实 Tauri 窗口，作为桌面-only 交互的补充冒烟；**不替代**双端人工验证，也不属于 `check:all`。入口与排障见技能 `desktop-e2e-wdio`。

## 编码规范

- 分支命名：kebab-case，最多 3 个单词（不带斜杠 / 类型前缀；示例：`session-recovery`）
- Commit：`type(scope): summary`，常用 scope：`core`、`frontend`、`rust`、`stores`、`browser`、`terminal`、`ipc`、`docs`、`deps`
- TypeScript/Rust 风格、Commit 与分支细则见 [dev-rules.md](.agents/rules/dev-rules.md)；测试规范见 [mandatory-testing.md](.agents/rules/mandatory-testing.md)

## Agent skills

- **Issue tracker**：GitHub Issues（`K-irito02/Adlo`，`gh` CLI）；五个 triage 标签（`needs-triage` / `needs-info` / `ready-for-agent` / `ready-for-human` / `wontfix`）见 `docs/agents/triage-labels.md`。
- **术语 / 决策**：术语表 `GLOSSARY.md`；决策记录 [docs/adr/](docs/adr/)（按域索引 `docs/adr/README.md`）。行为、术语或契约变化时用 `domain-modeling` 同步两者（P5 强制项）。
- 详见 `docs/agents/`。

## 相关文档

- [adlo/AGENTS.md](./adlo/AGENTS.md) — 实现工作区治理；[commands.md](.agents/rules/commands.md) — 常用命令速查
- [parallel-branch-development](.agents/skills/parallel-branch-development/SKILL.md) / [run-project-surfaces](.agents/skills/run-project-surfaces/SKILL.md) / [root-cause-to-close](.agents/skills/root-cause-to-close/SKILL.md) — 并行开发 / 双端启动 / 根因排查与收尾
- [RULES.md](./RULES.md) / [SKILLS.md](./SKILLS.md) — 规则 / 技能系统说明与索引
- [GLOSSARY.md](./GLOSSARY.md) — 术语表；[CONTEXT.md](./CONTEXT.md) — 架构说明；[RELEASE-CHECKLIST.md](./RELEASE-CHECKLIST.md) — 发布清单
- [docs/development/project-engineering-constraints.md](./docs/development/project-engineering-constraints.md) — 工程约束
- [docs/development/adding-an-ipc-domain.md](./docs/development/adding-an-ipc-domain.md) — 新增 IPC 域端到端接线清单
- [docs/knowledge-base/README.md](./docs/knowledge-base/README.md) — 经验教训索引
- [docs/agents/session-evidence.md](./docs/agents/session-evidence.md) — 会话证据来源（retro / 收尾排查）
