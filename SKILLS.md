# SKILLS — 技能系统

> **单一真源**：本文件是仓库内技能系统相关内容的唯一文档位置（来源分类、目录结构、同步规则、技能摘要）。
> 其它文档不再重复描述技能系统，需要时以索引方式指向本文件；各技能的可执行细节仍以对应目录的 `SKILL.md` 为准。

---

## 1. 技能系统说明

技能（Skill）是提供给 AI 代理的可复用能力包：每个技能是一个目录，核心为带 YAML frontmatter 的 `SKILL.md`（含 `name` 与 `description`），按需附带脚本、模板与参考资料。代理收到请求后先判断是否有相关技能，有则优先加载技能再行动。

### 1.1 来源分类

| 分类 | 说明 | 数量 |
|------|------|------|
| Superpowers 体系技能 | 来自开源项目 [obra/superpowers](https://github.com/obra/superpowers) 的技能体系，覆盖需求澄清、计划、执行、审查、验证与技能会话诊断等研发全流程 | 15 |
| Matt Pocock 工程技能 | 来自 [mattpocock/skills](https://github.com/mattpocock/skills)（[aihero.dev](https://www.aihero.dev/skills)）的 engineering / productivity / misc 三个分类，覆盖需求成型、规格与工单、实现、TDD、审查、诊断、域建模、代码库架构，以及会话交接、教学、写作与仓库脚手架 | 28 |
| 其他社区技能 | 从社区技能仓库安装的技能（来源见 `.agents/.skill-lock.json`），涵盖技能创建、浏览器自动化、UI/UX 设计、MCP 构建与 Google Stitch 设计规范等 | 8 |
| 项目自建技能 | 为本仓库定制的技能，与本项目的治理规则、文档体系、运行方式强绑定 | 9 |
| **合计** | 数量以 `.agents/skills/` 实际目录为准 | **60** |

### 1.2 使用与维护约定

| 项目 | 说明 |
|------|------|
| 入口技能 | `using-superpowers` — 对话开始时建立技能使用规范，要求任何回复（含澄清提问）之前先判断并调用相关技能 |
| 调用方式 | `Skill` 工具，按技能的 `name` 字段调用（部分目录名与 `name` 不同，见 §4 摘要表的「调用名」列） |
| 安装记录 | `.agents/.skill-lock.json` 是第三方技能的 manifest：GitHub 来源、安装路径与上游 tree hash；项目自建技能是目录中不在 lock 里的那些 |
| 更新工具 | `pnpm --dir adlo run skills:<audit\|apply\|mirror\|lock\|docs\|verify>`；完整流程与 overlay 格式见 [docs/development/skill-updates.md](./docs/development/skill-updates.md) |
| 创建 / 修改技能 | 遵循 `writing-skills`（技能编写与部署前验证规范）或 `skill-creator`（从零创建、改进与评测）；完成后用 `skills:docs` / `skills:verify` 同步三目录与 §4 摘要 |
| 审计 | 技能目录一致性由 `governance-audit` 技能纳入治理审计范围 |

---

## 2. 三技能目录

| 目录 | 角色 | 说明 |
|------|------|------|
| `.agents/skills/` | **真源** | 唯一编辑入口。所有技能的创建、修改、删除均先在此完成 |
| `.opencode/skills/` | 同步备份 | 由真源同步而来，内容必须与真源逐文件一致 |
| `.trae/skills/` | 同步备份 | 由真源同步而来，内容必须与真源逐文件一致 |

---

## 3. 技能同步规则

1. **保持一致**：三个目录必须始终保持一致（同技能名、同文件、同内容）。
2. **改一同步二**：每次更新 / 修改 / 创建 / 删除技能后，立即将变更同步到另外两个目录，禁止只改单目录。
3. **登记摘要**：新增或删除技能后，同步更新本文件 §1.1 的数量与 §4 的摘要表。
4. **校验方式**：pre-commit 自动执行 `scripts/check-agent-dirs.test.mjs`（三目录逐文件哈希 + 本文件数量/摘要表）。手动检查：

   ```bash
   # 目录级一致性检查（无输出即一致）
   diff -r .agents/skills .opencode/skills
   diff -r .agents/skills .trae/skills
   ```

   ```bash
   # 目录内容哈希校验（三行哈希相同即一致）
   for d in .agents .opencode .trae; do
     ( cd "$d/skills/<技能名>" && find . -type f | sort | \
       while read -r f; do printf '%s  ' "$f"; sha256sum "$f" | cut -d' ' -f1; done | sha256sum )
   done
   ```

---

## 4. 技能摘要

> 说明列与各技能 `SKILL.md` 的 `description` 语义一致，统一以简体中文表述。

### 4.1 Superpowers 体系技能（15）

| 技能目录 | 调用名 | 说明 |
|----------|--------|------|
| `brainstorming` | `brainstorming` | 任何创造性工作之前必须先使用——创建功能、构建组件、添加功能或修改行为，或规划任何新事物（软件之外的演讲、生意、装修）；先探索用户意图、需求与设计，再进入实现。 |
| `diagnosing-superpowers` | `diagnosing-superpowers` | 当一次 Superpowers 会话跑偏（重复工作、忽略计划、技能未触发、耗时或成本异常）时，读取磁盘转录并生成带 `path:line` 证据的报告；也可为上游维护者构建 bug report。 |
| `dispatching-parallel-agents` | `dispatching-parallel-agents` | 面对 2 个及以上彼此独立、无共享状态与先后依赖的任务时使用，将任务分派给并行子代理。 |
| `executing-plans` | `executing-plans` | 已有书面实施计划、由本人在当前会话内联执行时使用：不逐任务派发子代理，按任务 TDD 推进并记账，末尾做一次整分支审查。 |
| `finishing-a-development-branch` | `finishing-a-development-branch` | 实施已完成、测试全部通过、需要决定如何整合这批工作时使用。 |
| `receiving-code-review` | `receiving-code-review` | 接收代码审查反馈、落实建议之前使用，尤其当反馈含糊或技术上存疑时——要求技术严谨与验证，而非表面认同或盲目执行。 |
| `requesting-code-review` | `requesting-code-review` | 完成任务、实现重大功能或合并之前使用，核验工作是否满足需求。 |
| `subagent-driven-development` | `subagent-driven-development` | 在当前会话中执行包含独立任务的实施计划时使用，由子代理驱动开发。 |
| `systematic-debugging` | `systematic-debugging` | 遇到任何 Bug、测试失败或意外行为时，在提出修复方案之前使用。 |
| `test-driven-development` | `test-driven-development` | 实现任何功能或修复 Bug 时、在编写实现代码之前使用。 |
| `using-git-worktrees` | `using-git-worktrees` | 开始需要与当前工作区隔离的功能开发时，或执行实施计划之前使用——通过原生工具或 git worktree 兜底确保存在独立工作区。 |
| `using-superpowers` | `using-superpowers` | 在任何对话开始时使用——建立“如何查找与使用技能”的规范，要求任何回复（包括澄清提问）之前先调用技能。 |
| `verification-before-completion` | `verification-before-completion` | 即将声称工作已完成、已修复或已通过，或在提交、创建 PR 之前使用——必须先运行验证命令并确认输出再作成功声明；始终以证据先于断言。 |
| `writing-plans` | `writing-plans` | 已有多步骤任务的规格或需求、在改动代码之前使用，编写实施计划。 |
| `writing-skills` | `writing-skills` | 创建新技能、编辑已有技能，或在部署前验证技能是否有效时使用。 |

### 4.2 其他社区技能（8）

| 技能目录 | 调用名 | 说明 |
|----------|--------|------|
| `find-skills` | `find-skills` | 帮助用户发现并安装 Agent 技能——当用户问“怎么做 X”“有没有做 X 的技能”“能不能……”，或表达想扩展能力时使用。 |
| `mcp-builder` | `mcp-builder` | 构建高质量 MCP（Model Context Protocol）server，让 LLM 通过设计良好的工具与外部服务交互；覆盖 Python FastMCP 与 Node/TypeScript MCP SDK。 |
| `minimalist-skill` | `minimalist-ui` | 干净的编辑式界面：温暖的单色调色板、字体层级对比、扁平便当式网格、低饱和柔和色；不使用渐变与重阴影。 |
| `playwright-cli` | `playwright-cli` | 自动化浏览器交互、测试网页，并操作 Playwright 测试。 |
| `skill-creator` | `skill-creator` | 创建新技能、修改与改进已有技能并度量技能表现：从零创建、编辑或优化技能、运行评测、做带方差分析的基准测试，或优化技能描述以提升触发准确率。 |
| `stitch-skill` | `stitch-design-taste` | 面向 Google Stitch 的设计规范技能：生成 `DESIGN.md`，用氛围、颜色、字体、组件行为、布局与动效规则约束 Stitch 的界面生成；仅按名调用。 |
| `taste-skill` | `design-taste-frontend` | 面向公司官网、落地页、作品集与改版的反“AI 味”前端技能（2.5.1）：按业务类型生成完整页面，要求 Node 22+ 与 Chrome/Edge，内置 `gate.mjs` 浏览器检查与 finish gate；含 1630 个资源/脚本文件。 |
| `ui-ux-pro-max` | `ui-ux-pro-max` | 面向 Web、移动端与桌面的 UI/UX 设计智能：在设计、构建、评审或修复界面时使用，覆盖页面、组件、设计系统、可访问性、交互、响应式布局、字体、配色、图表及特定技术栈的 UI 实现。内置可检索本地数据：80 种风格（51 种启用）、194 套产品配色与推理画像、74 组字体搭配、141 条 UX 准则、105 个图标、17 个 GSAP 预设、25 种图表类型、22 个技术栈。 |

### 4.3 项目自建技能（9）

| 技能目录 | 调用名 | 说明 |
|----------|--------|------|
| `codegraph-knowledge-graph` | `codegraph-knowledge-graph` | 查询本地 CodeGraph 代码知识图谱，追踪符号、调用链与变更影响范围；需要理解代码结构、追踪调用关系或评估变更影响时优先使用，替代逐文件 `grep` / 读取。 |
| `adlo-release` | `adlo-release` | 发布 Adlo 桌面应用新版本：`release:bump` 同步三处版本号（`tauri.conf` + 两个 `package.json`，Cargo workspace 版本不动）、`release:build` 产出 NSIS + minisign 签名、`release:publish` 双源（GitHub + Gitee）发布并更新 `latest.json`、`release:verify` 自检两个更新源；也覆盖只构建不发布与离线验签。用户说发版、打 tag、升版本号、同步 Gitee、补发 Release 时使用。 |
| `desktop-e2e-wdio` | `desktop-e2e-wdio` | 当需要验证 Tauri 桌面端真实交互（原生点击、窗口/面板、窗口几何、真实 IPC）、运行桌面冒烟、排查 WDIO 的 5s 超时/窗口焦点警告/adl-server 残留，或维护 `adlo/e2e/` 时使用；用 embedded WebDriver 驱动真实窗口，无需 `tauri-driver`/`msedgedriver`，不进 `check:all`。 |
| `documentation-organizer` | `documentation-organizer` | 将项目文档整理为清晰、规范的层级结构；用户要求整理文档、清理文档结构、修复散乱文档文件或建立文档约定时调用。 |
| `governance-audit` | `governance-audit` | 审计并同步治理文档（规则文件、`AGENTS.md`、各级 README、根文档、docs 目录、工程基线）以及三个规则目录与三个技能目录，输出发现并在获批后修复；不用于源码审计。 |
| `learn` | `learn` | 分析代码库以发现模式、约定与架构决策，并生成项目规则文件；用户要求“从这个项目学习”“提取项目规则”“发现模式”或“自动生成规则”时调用。 |
| `parallel-branch-development` | `parallel-branch-development` | 多会话 / 多 agent 并行开发本仓库时使用：开工环境自检、新建或复用分支工作树、隔离与保留约定；本技能即唯一真源（全文自包含）。 |
| `root-cause-to-close` | `root-cause-to-close` | 当 Bug、测试失败、回归、偶发或性能问题需要先定位根因再修复时使用；也用于已完成会话的收尾——R1/R2 审查、文档同步、清理与总结。新功能先走 brainstorming，再由本技能负责审查与收尾；用户决策按 grilling 轮次提问。不适用于琐碎改动。 |
| `run-project-surfaces` | `run-project-surfaces` | 启动 Adlo 的三种运行模式（浏览器预览、Tauri 桌面、双端并行），按工作树分配稳定 dev 端口（主工作树 5173、slot-N → 5173+N）并校验实例令牌并统一管理子进程生命周期；用户要求运行、启动或预览应用时使用。 |

### 4.4 Matt Pocock 技能（28）

> 安装命令：`npx skills@latest add mattpocock/skills --agent universal --skill <name>`。本表含上游 `engineering/`、`productivity/` 与 `misc/` 三个分类。标「仅用户调用」者声明 `disable-model-invocation: true`，只能由用户显式触发，模型不会自行调用；`grilling` 是 `grill-with-docs` 的依赖技能。

| 技能目录 | 调用名 | 说明 |
|----------|--------|------|
| `ask-matt` | `ask-matt` | 询问当前情境适合使用哪个技能或流程；对本技能集的用户调用入口路由（仅用户调用）。 |
| `code-review` | `code-review` | 以固定基点（提交、分支、标签或 merge-base）沿两条轴审查改动：规范（是否遵循仓库编码规范）与规格（是否忠实实现来源 issue/spec），两条审查并行运行并并列汇报；适用于审查分支、PR 或进行中的改动。 |
| `codebase-design` | `codebase-design` | 设计深模块的共享词汇与纪律：小接口、清晰接缝、可通过接口测试；用于设计或改进模块接口、寻找加深机会、决定接缝位置，或为其他技能提供深模块词汇。 |
| `diagnosing-bugs` | `diagnosing-bugs` | 针对难缠 Bug 与性能回归的纪律化诊断循环：先建立能在该 Bug 上变红的反馈回路 → 最小化 → 假设 → 插桩 → 修复 → 回归测试。 |
| `domain-modeling` | `domain-modeling` | 主动构建并打磨项目领域模型：质疑术语、用场景做压力测试、就地更新 `GLOSSARY.md` 与 ADR。 |
| `grill-with-docs` | `grill-with-docs` | 高强度追问以打磨方案或设计，并同步产出文档（ADR 与术语表）（仅用户调用）。 |
| `grilling` | `grilling` | 就某个方案、决策或想法对用户不留情面地追问：把决策展开为设计树，按轮次一次问完当前「前沿」上的全部问题，直到无遗留假设、达成共识；`grill-with-docs` 的前置依赖。 |
| `handoff` | `handoff` | 把当前会话压缩成交接文档，交给另一个 agent 继续：含建议技能列表，不重复已有 spec/plan/ADR/commit，并按要求脱敏（仅用户调用）。 |
| `implement` | `implement` | 依据 spec 或一组工单实施工作，在约定接缝处驱动 `/tdd`，提交前以 `/code-review` 收尾（仅用户调用）。 |
| `implement-spec` | `implement-spec` | 在单一集成分支上实现完整 spec：把工单当成任务图，在就绪前沿并发运行实施子代理，最后以 `/code-review` 收尾（仅用户调用）。 |
| `improve-codebase-architecture` | `improve-codebase-architecture` | 扫描代码库中的「加深」机会，以可视化 HTML 报告呈现，再对选定项进行追问（仅用户调用）。 |
| `migrate-to-shoehorn` | `migrate-to-shoehorn` | 把测试文件里的 `as Type` / `as unknown as Type` 断言迁移到 `@total-typescript/shoehorn` 的 `fromPartial()` / `fromAny()`；仅用于测试代码。 |
| `pr` | `pr` | 撰写 PR 描述的结构：用最小可视化摘要说明改动、用前后证据证明可用、给出合并风险判断（单向门/双向门与影响半径）。 |
| `prototype` | `prototype` | 构建一次性原型回答设计问题：单个可分享 HTML 文件用于验证状态与逻辑，或多个可切换 UI 方案。 |
| `research` | `research` | 针对高可信一手来源调研问题，并将结论以带引用的 Markdown 文件写入仓库；适合把资料搜集交给后台代理。 |
| `retro` | `retro` | 会话结束后提出对编码代理环境的改进建议（导航、自动化检查、编码规范、引导文件、工具），按严重程度排序（仅用户调用）。 |
| `setup-matt-pocock-skills` | `setup-matt-pocock-skills` | 仓库一次性配置：设定 issue tracker、triage 标签词表与领域文档布局；首次使用其他工程技能前运行（仅用户调用）。 |
| `setup-pre-commit` | `setup-pre-commit` | 为 JS 仓库配置 Husky pre-commit：lint-staged（Prettier）、typecheck 与 test；本仓库按混合方案把现有快门禁整合进 `.husky/pre-commit`。 |
| `tdd` | `tdd` | 测试驱动开发的红-绿-重构循环，按垂直切片逐片构建功能或修复 Bug。 |
| `teach` | `teach` | 在当前目录建立教学工作区（`MISSION.md`、`lessons/`、`reference/`、`learning-records/` 等），按使命与最近发展区逐课教授一个主题（仅用户调用）。 |
| `to-questionnaire` | `to-questionnaire` | 把一个人无法独立回答的决策转成 Markdown 问卷，交给掌握信息的人异步填写或开会填写；只追问发送对象与所需产出（仅用户调用）。 |
| `to-spec` | `to-spec` | 把当前对话综合成 spec 并发布到项目 issue tracker：不做访谈，只综合已讨论内容（仅用户调用）。 |
| `to-tickets` | `to-tickets` | 把计划、spec 或当前对话拆成一组「曳光弹」工单，每单声明阻塞边；本地以文本记录，真实 tracker 上以原生阻塞链接表达（仅用户调用）。 |
| `triage` | `triage` | 按 triage 角色状态机推进 issue 与外部 PR：分类、核验、必要时追问，并写出可供代理直接执行的简报（仅用户调用）。 |
| `wait-what` | `wait-what` | 当上一条消息没有讲清时，让代理重新表述：补充上下文、改用 ASD-STE100 简化技术英语，并使用 `GLOSSARY.md` 术语（仅用户调用）。 |
| `wayfinder` | `wayfinder` | 把超出单会话容量的大块工作规划为 issue tracker 上的决策工单共享地图，逐张解决直到通往目标的路径清晰（仅用户调用）。 |
| `wizard` | `wizard` | 生成交互式 bash 向导，引导人完成只有本人能做的步骤（基础设施开通、凭据/CI secret 配置、陌生第三方控制台操作、一次性迁移或切换）。 |
| `writing-for-agents` | `writing-for-agents` | 编写 agent 消费的文档（技能、`AGENTS.md`/`CLAUDE.md`、指针文档）：用上下文指针、触发分支与两类负载（上下文负载/认知负载）提升可预测性。 |
