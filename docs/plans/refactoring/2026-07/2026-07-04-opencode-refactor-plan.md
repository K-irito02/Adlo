# OpenCode 借鉴改进实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 借鉴 OpenCode 项目优点，改进项目文档、规则、技能系统

**Architecture:** 在隔离工作区 `refactor-insight-main` 中操作，所有变更限定在文件/文档/配置层面，不涉及代码文件。完成后通过 squash merge 合并到本地 main。

**Tech Stack:** Markdown, YAML (GitHub workflows), Shell (Husky hooks)

**Constraints:**
- 不得修改 `ai-digital-life/` 下的源代码
- 仅修改文档（.md）、配置文件（.yml）、技能文件、git hooks
- SECURITY.md 和 CONTRIBUTING.md 已在上一轮完成，本轮不修改

---

### Task 1: CONTEXT.md 增强 — 新增架构模式术语

**Files:**
- Modify: `CONTEXT.md`

**Interfaces:**
- Consumes: `docs/analysis/opencode/` — OpenCode 架构分析
- Produces: 在 CONTEXT.md 中新增"架构模式"章节

- [ ] **在 CONTEXT.md 中新增"架构模式"章节**

在 "## 架构概念" 章节末尾或另起 "## 架构模式" 章节，新增以下术语：

```markdown
## 架构模式

### 命名空间投影 (Namespace Projection)
模块通过自己的导出命名空间暴露类型，消费者通过命名空间限定符访问：`import { Agent } from "./agent"` 然后 `Agent.ID`、`Agent.Info`。避免扁平化导入导致的命名冲突。

### Global vs Location 节点
服务生命周期管理策略：
- **Global 节点**：进程级单例，如 Database、Git、全局配置
- **Location 节点**：每工作目录独立实例，如 Agent、Config、Permission、Skill

对应本项目：进程级服务（`adl-logging` 等）vs 工作区级服务（Workspace、Task 等 crate）。

### Service + Layer 依赖注入
每个领域模块定义三要素：
1. **Service 接口声明**：定义服务对外提供的方法签名
2. **Layer 实现绑定**：将具体实现注入服务接口
3. **节点定义**：声明依赖关系（deps 列表）
对应本项目：Rust 的 `trait` + Tauri State 注入模式。

### Schema 驱动类型系统
使用结构化 Schema 定义公共数据模型作为契约层，确保前后端类型安全：
- 所有公共类型在一个独立层定义（本项目对应 `kernel/types/`）
- 使用 branded types 增强类型安全（如 `AgentID` 而非裸 `string`）
- 契约默认只读，运行时可变性显式声明
```

- [ ] **验证修改**

运行: `(Get-Content CONTEXT.md) -match "架构模式"`
期望: 输出包含 "架构模式"

- [ ] **Commit**

```bash
git add CONTEXT.md
git commit -m "docs(context): add architecture pattern terminology"
```

---

### Task 2: AGENTS.md 规则引用路径澄清

**Files:**
- Modify: `AGENTS.md`

**Interfaces:**
- Consumes: 当前 AGENTS.md 中的规则引用章节
- Produces: 明确标注 `.agents/rules/` 为真源路径

- [ ] **更新"代理开发规则"章节引用**

在 `## 代理开发规则` 章节，将：

```
规则文件位于 `.trae/rules/`（自动从 `.agents/rules/` 同步）
```

修改为（加粗强调）：

```
规则文件真源位于 `.agents/rules/`（AI 代理直接读取），自动同步到 `.trae/rules/` 供 TRAE IDE 使用。
```

并在规则索引链接后增加一行：

```
> ⚠ **注意**：`.agents/rules/` 是规则文件的真源（Git 跟踪），`.trae/rules/` 是 TRAE IDE 的同步副本。修改规则请在 `.agents/rules/` 操作。
```

- [ ] **验证修改**

运行: `(Get-Content AGENTS.md) -match "真源"`
期望: 输出包含 "真源"

- [ ] **Commit**

```bash
git add AGENTS.md
git commit -m "docs(agents): clarify .agents/rules/ as source of truth"
```

---

### Task 3: docs/README.md 补充基础设施配置索引

**Files:**
- Modify: `docs/README.md`

**Interfaces:**
- Consumes: 当前 docs/README.md 的目录结构
- Produces: 补充基础设施配置索引章节

- [ ] **在 docs/README.md 中补充"基础设施配置"索引**

在 `## 快速导航` 章节上方或下方，新增：

```
## 基础设施配置

| 位置 | 内容 |
|------|------|
| [.editorconfig](../../../../.editorconfig) | 编辑器格式配置（缩进、换行符、编码） |
| [.github/workflows/](../../../../.github/workflows/) | CI/CD 工作流（Quality Gates、Binary Size） |
| [.prettierrc](../../../../.prettierrc) | Prettier 格式化配置 |
| [.prettierignore](../../../../.prettierignore) | Prettier 忽略规则 |
```

- [ ] **验证修改**

运行: `(Get-Content docs/README.md) -match "基础设施配置"`
期望: 输出包含 "基础设施配置"

- [ ] **Commit**

```bash
git add docs/README.md
git commit -m "docs(readme): add infrastructure config index"
```

---

### Task 4: commands.md 补充 Rust PATH 设置说明

**Files:**
- Modify: `.agents/rules/commands.md`

**Interfaces:**
- Consumes: 当前 commands.md 的 Rust 编译章节
- Produces: 在 Rust 编译章节补充 PATH 设置说明

- [ ] **在 Rust 编译章节补充 PATH 设置说明**

在 `## Rust 编译` 章节，当前已有 `$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"`，在章节开头补充一行注释强调：

```markdown
> ⚠ **重要**：执行 Rust 命令前必须设置 PATH，否则 `cargo` 命令不可用。
```

- [ ] **验证修改**

运行: `(Get-Content .agents/rules/commands.md) -match "必须设置 PATH"`
期望: 输出包含 "必须设置 PATH"

- [ ] **提交**

```bash
git add .agents/rules/commands.md
git commit -m "docs(commands): add rust PATH setup reminder"
```

---

### Task 5: 同步 WORKTREE-RERUN-ISSUES.md 到 .trae/skills/

- [ ] **检查源文件是否存在**

运行: `Test-Path ".opencode/skills/refactoring-insight/WORKTREE-RERUN-ISSUES.md"`, `Test-Path ".agents/skills/refactoring-insight/WORKTREE-RERUN-ISSUES.md"`, `Test-Path ".trae/skills/refactoring-insight/WORKTREE-RERUN-ISSUES.md"`
期望: 前两个存在，第三个不存在（需要同步）

- [ ] **复制文件到 .trae/skills/**

```bash
Copy-Item ".opencode/skills/refactoring-insight/WORKTREE-RERUN-ISSUES.md" ".trae/skills/refactoring-insight/WORKTREE-RERUN-ISSUES.md"
```

- [ ] **验证同步完成**

运行: `Test-Path ".trae/skills/refactoring-insight/WORKTREE-RERUN-ISSUES.md"`
期望: True

- [ ] **提交**

```bash
git add .trae/skills/refactoring-insight/WORKTREE-RERUN-ISSUES.md
git commit -m "chore(skills): sync WORKTREE-RERUN-ISSUES.md to .trae/skills/"
```

---

### Task 6: 最终验证与提交

- [ ] **检查所有变更**

运行: `git status`
期望: 显示本次所有变更文件

- [ ] **运行最终验证**

验证所有 5 个任务的文件变更正确：
```bash
git diff --stat
```
期望: 显示 CONTEXT.md、AGENTS.md、docs/README.md、.agents/rules/commands.md、.trae/skills/refactoring-insight/WORKTREE-RERUN-ISSUES.md

- [ ] **推送到远程**

```bash
git push origin refactor-insight-main
```
