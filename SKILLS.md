# SKILLS — 技能系统

> **单一真源**：本文件是仓库内技能系统相关内容的唯一文档位置（来源分类、目录结构、同步规则、技能摘要）。
> 其它文档不再重复描述技能系统，需要时以索引方式指向本文件；各技能的可执行细节仍以对应目录的 `SKILL.md` 为准。

---

## 1. 技能系统说明

技能（Skill）是提供给 AI 代理的可复用能力包：每个技能是一个目录，核心为带 YAML frontmatter 的 `SKILL.md`（含 `name` 与 `description`），按需附带脚本、模板与参考资料。代理收到请求后先判断是否有相关技能，有则优先加载技能再行动。

### 1.1 来源分类

| 分类 | 说明 | 数量 |
|------|------|------|
| Superpowers 体系技能 | 来自开源项目 [obra/superpowers](https://github.com/obra/superpowers) 的技能体系，覆盖需求澄清、计划、执行、审查、验证等研发全流程 | 14 |
| 其他社区技能 | 从社区技能仓库安装的技能（来源见 `.agents/.skill-lock.json`），涵盖技能创建、浏览器自动化、UI/UX 设计等 | 8 |
| 项目自建技能 | 为本仓库定制的技能，与本项目的治理规则、文档体系、运行方式强绑定 | 6 |
| **合计** | 数量以 `.agents/skills/` 实际目录为准 | **28** |

### 1.2 使用与维护约定

| 项目 | 说明 |
|------|------|
| 入口技能 | `using-superpowers` — 对话开始时建立技能使用规范，要求任何回复（含澄清提问）之前先判断并调用相关技能 |
| 调用方式 | `Skill` 工具，按技能的 `name` 字段调用（部分目录名与 `name` 不同，见 §4 摘要表的「调用名」列） |
| 安装记录 | `.agents/.skill-lock.json` 记录部分技能的 GitHub 来源、安装路径与目录哈希（未登记者为手工引入或项目自建） |
| 创建 / 修改技能 | 遵循 `writing-skills`（技能编写与部署前验证规范）或 `skill-creator`（从零创建、改进与评测）；完成后必须同步三目录并更新本文件 §4 摘要 |
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
4. **校验方式**：以真源为准逐文件比对，例如

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

### 4.1 Superpowers 体系技能（14）

| 技能目录 | 调用名 | 说明 |
|----------|--------|------|
| `brainstorming` | `brainstorming` | 任何创造性工作之前必须先使用——创建功能、构建组件、添加功能或修改行为；先探索用户意图、需求与设计，再进入实现。 |
| `dispatching-parallel-agents` | `dispatching-parallel-agents` | 面对 2 个及以上彼此独立、无共享状态与先后依赖的任务时使用，将任务分派给并行子代理。 |
| `executing-plans` | `executing-plans` | 已有书面实施计划、需要在独立会话中按审查检查点逐步执行时使用。 |
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
| `minimalist-skill` | `minimalist-ui` | 干净的编辑式界面：温暖的单色调色板、字体层级对比、扁平便当式网格、低饱和柔和色；不使用渐变与重阴影。 |
| `output-skill` | `full-output-enforcement` | 覆盖大模型默认的输出截断行为，强制完整代码生成、禁止占位符式省略，并妥善处理 token 上限处的切分；适用于任何要求穷尽、不删减输出的任务。 |
| `playwright-cli` | `playwright-cli` | 自动化浏览器交互、测试网页，并操作 Playwright 测试。 |
| `redesign-skill` | `redesign-existing-projects` | 将现有网站与应用升级为高品质：审计当前设计、识别通用的“AI 味”模式，在不破坏功能的前提下应用高端设计标准；兼容任意 CSS 框架或原生 CSS。 |
| `skill-creator` | `skill-creator` | 创建新技能、修改与改进已有技能并度量技能表现：从零创建、编辑或优化技能、运行评测、做带方差分析的基准测试，或优化技能描述以提升触发准确率。 |
| `taste-skill` | `design-taste-frontend` | 面向落地页、作品集与改版的反“AI 味”前端技能：读取需求简报、推断正确的设计方向，交付不像模板的界面；适用时使用真实设计系统，改版先审计，执行严格的前置检查。 |
| `ui-ux-pro-max` | `ui-ux-pro-max` | 面向 Web、移动端与桌面的 UI/UX 设计智能：在设计、构建、评审或修复界面时使用，覆盖页面、组件、设计系统、可访问性、交互、响应式布局、字体、配色、图表及特定技术栈的 UI 实现。内置可检索本地数据：79 种风格（50 种启用）、192 套产品配色与推理画像、74 组字体搭配、119 条 UX 准则、105 个图标、17 个 GSAP 预设、25 种图表类型、22 个技术栈。 |

### 4.3 项目自建技能（6）

| 技能目录 | 调用名 | 说明 |
|----------|--------|------|
| `codegraph-knowledge-graph` | `codegraph-knowledge-graph` | 查询本地 CodeGraph 代码知识图谱，追踪符号、调用链与变更影响范围；需要理解代码结构、追踪调用关系或评估变更影响时优先使用，替代逐文件 `grep` / 读取。 |
| `documentation-organizer` | `documentation-organizer` | 将项目文档整理为清晰、规范的层级结构；用户要求整理文档、清理文档结构、修复散乱文档文件或建立文档约定时调用。 |
| `governance-audit` | `governance-audit` | 审计并同步治理文档（规则文件、`AGENTS.md`、各级 README、根文档、docs 目录、工程基线）以及三个规则目录与三个技能目录，输出发现并在获批后修复；不用于源码审计。 |
| `learn` | `learn` | 分析代码库以发现模式、约定与架构决策，并生成项目规则文件；用户要求“从这个项目学习”“提取项目规则”“发现模式”或“自动生成规则”时调用。 |
| `root-cause-to-close` | `root-cause-to-close` | 当 Bug、测试失败、回归、偶发或意外行为需要根因调查与修复时使用（未找到根因前禁止修复）；也用于已完成会话的收尾——结项、审查、文档同步、清理。不适用于新功能或琐碎改动。 |
| `run-project-surfaces` | `run-project-surfaces` | 启动 AI Digital Life 的三种运行模式（浏览器预览、Tauri 桌面、双端并行），自动选择空闲端口并统一管理子进程生命周期；用户要求运行、启动或预览应用时使用。 |
