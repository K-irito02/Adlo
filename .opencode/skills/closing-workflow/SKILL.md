---
name: closing-workflow
description: End-of-work closing procedures after completing code changes, bug fixes, or feature implementations. Performs log review, code review loop with mandatory fixes, quality checks, mandatory doc sync, and cleanup.
---

# Closing Workflow

## Overview

所有任务和问题已解决后，执行标准收尾流程确保工作质量与项目整洁。

**流程概览：** 前置检查 → 日志审查 → 代码审查循环（含强制修复） → 质量检测 → 文档同步（强制） → 项目清理 → 最终总结

## When to Invoke

以下任一场景触发此技能：

- 完成代码变更、Bug 修复、新功能实现或重构后
- 用户明确要求执行收尾流程
- 所有开发任务标记为完成时

---

## Step 0: 前置检查

在开始正式流程前，先执行环境与状态检查。

### 0a. 环境准备

**Windows 终端必须设置 PATH**（Trae PowerShell 不自动继承系统 PATH）：

```powershell
# Node.js / pnpm 环境
$env:Path = "D:\Program Files\nodejs;$env:Path"

# Rust / cargo 环境
$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"
```

所有后续命令默认在 `ai-digital-life/` 目录下执行。若涉及根目录操作，另行指定 `cwd`。

### 0b. 工作区状态检查

1. 确认当前分支：`git branch --show-current`
2. 确认工作区干净程度：`git status --short`（了解未跟踪/已修改文件概况）
3. 若有未跟踪文件，判断是否为本次工作产物，决定是否纳入后续步骤

### 0c. 磁盘空间检查

检查 Rust 增量编译缓存（已知可达 20~40 GB）：

```powershell
$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"
Get-ChildItem -Path "ai-digital-life\src-tauri\target\debug\incremental" -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum | ForEach-Object { "{0:N2} GB" -f ($_.Sum / 1GB) }
```

若超过 10 GB，提醒用户可运行 `ai-digital-life\.cargo\clean-incremental.ps1` 清理。

---

## Step 1: 日志审查

### 1a. 重要：日志文件已被 Git 忽略

以下日志文件/目录已在 `.gitignore` 中排除，**`Glob` 和 `Grep` 工具可能无法找到它们**。必须使用 **`LS` 和 `Read` 工具**直接操作，指定精确的绝对路径：

| 日志位置 | 绝对路径 | 说明 |
|----------|----------|------|
| ADL 日志目录 | `<workspace_root>/.adl-logs/` | 应用运行时日志 |
| Tauri 调试日志 | `<workspace_root>/debug-logs.txt` | Tauri 桌面模式调试日志 |
| 浏览器调试日志 | `<workspace_root>/debug-logs-browser.txt` | 浏览器预览模式调试日志 |
| 运行日志目录 | `<workspace_root>/ai-digital-life/.run-logs/` | 本地开发运行日志 |
| 诊断日志目录 | `<workspace_root>/ai-digital-life/diagnostic-logs/` | 诊断服务日志 |

> `<workspace_root>` 为当前工作区根目录（本项目中为 `e:\AI-DIGITAL-LIFE\SourceWorkspace`）。

### 1b. 检查日志目录

1. 使用 `LS` 工具列出 `.adl-logs` 目录
   - 若目录不存在 → 跳过此步骤，直接进入 Step 2
   - 若目录存在 → 使用 `Read` 工具读取每个日志文件内容
2. 使用 `Read` 工具直接读取根目录调试日志文件（指定精确路径）：
   - `<workspace_root>/debug-logs.txt`
   - `<workspace_root>/debug-logs-browser.txt`
3. 同样检查 `ai-digital-life/.run-logs/` 和 `ai-digital-life/diagnostic-logs/`（若存在）

### 1c. 分析日志

审视日志中记录的错误、警告、异常信息，按优先级处理：

| 优先级 | 类型 | 处理方式 |
|--------|------|----------|
| P0 | 崩溃/异常堆栈 | 定位根因并修复代码 |
| P1 | 功能性错误（如 IPC 失败） | 分析原因，修复或记录 |
| P2 | 警告（deprecation、性能） | 评估是否需要修复 |
| P3 | 信息性日志 | 确认无异常后忽略 |

### 1d. 完成条件

确认无未解决的 P0/P1 问题，或所有问题已记录待后续处理 → 继续 Step 2。

---

## Step 2: 代码审查循环（含强制修复）

### 2a. 收集变更来源

**各自独立采集后合并**，覆盖以下三类：

| 类型 | 采集命令 | 说明 |
|------|----------|------|
| 未暂存变更 | `git diff` | 工作区中已修改但未 `git add` 的文件 |
| 已暂存变更 | `git diff --cached` | 已 `git add` 但尚未提交的文件 |
| 已提交本地变更 | `git diff origin/HEAD..HEAD` | 已 `git commit` 但未 `git push` 的提交 |

**采集规则：**
- 根据对话记录回顾本次执行中创建/修改了哪些文件，结合上述命令确认变更集
- 已推送至远程的代码视为已验证，**不纳入审查**
- 如涉及工作树分支、多分支操作，自行确定当前审查目标分支
- 若三类均无变更 → 跳过 Step 2，直接进入 Step 3

**汇总**：将三类变更的 diff 合并，作为子代理的完整审查素材。

### 2b. 执行审查（子代理）

使用 Task 工具（`subagent_type: "general_purpose_task"`）开启子代理。

**子代理任务模板：**

```
Review the following code diff for issues. Check for:
- Logic errors, missing edge cases, boundary conditions
- Security vulnerabilities, performance problems
- Code that is incomplete or not robust
- Opportunities for improvement
- Violations of project coding standards (see .agents/rules/)

For each issue found, report:
1. File path and line range
2. Severity (critical/high/medium/low)
3. Description of the problem
4. Suggested fix (specific code change recommendation)

Here is the complete diff to review:
[PASTE FULL DIFF HERE]
```

### 2c. 强制修复循环（主代理 ↔ 子代理）

**这是强制执行步骤，不得跳过。**

```
子代理审查发现问题
       ↓
主代理逐个分析问题
       ↓
  ┌─ 问题是否需要与用户确认？ ──→ YES ──→ 弹出 AskUserQuestion 询问卡片
  │         ↓ NO                           │
  │  问题是否有多套解决方案？──→ YES ──→ 弹出 AskUserQuestion 询问卡片
  │         ↓ NO                           │  列出每套方案的优缺点及注意事项
  │   主代理直接修复代码                   │  等待用户决策后再修复
  │         ↓                              ↓
  └─ 修复完成 ←────────────────────────────┘
       ↓
子代理再次审查（基于完整 diff）
       ↓
  ┌─ 仍有问题？──→ YES ──→ 重复上述循环
  └─ 无问题 ──→ 审查通过
```

**询问卡片触发条件（必须使用 AskUserQuestion 工具）：**

| 触发条件 | 示例 |
|----------|------|
| 修复方案可能影响现有功能或 UI/UX | 修改共享模块、变更公共 API 签名 |
| 问题涉及业务逻辑决策，Agent 无法自行判断 | 错误处理策略、默认值选择、边界行为 |
| 存在多套技术上均可行的解决方案 | 重构方式选择、架构调整方向 |
| 修复需要引入新的依赖或工具 | 新增 npm 包 / Rust crate |
| 修复涉及安全策略或权限模型 | 权限放宽、数据访问模式变更 |

**询问卡片格式要求：**
- 列出所有可行方案（2-4 个选项）
- 每个方案说明优缺点
- 每个方案列出注意事项/风险
- 标注推荐方案（如适用）

**修复约束：**
- 仅修复审查发现的问题，不做无关变更
- 修复时遵循项目编码规范（`.agents/rules/`）
- 所有修改不得破坏现有功能效果及 UI/UX
- 修复后必须在子代理重新审查前确认变更已生效

**迭代控制：**
- **最大迭代次数：3 轮**。超过 3 轮仍有问题，向用户报告剩余问题并等待指示
- 子代理每次审查应基于完整的变更 diff，而非仅审查上次发现的问题点
- 每轮修复后，必须重新运行子代理审查，不可凭主代理自我判断跳过

**完成条件：** 子代理确认无任何问题，或达到最大迭代次数后用户确认可继续。

---

## Step 3: 代码质量检测与修复

> **注意：** 此步骤与 `mandatory-testing.md` 规则中的验收流程一致。若 `mandatory-testing.md` 已通过 alwaysApply 规则自动触发并完成，则此步骤可跳过（避免重复执行）。若不确定是否已执行，则运行本步骤。

### 3a. 执行环境

所有命令在 `ai-digital-life/` 目录下执行，PATH 已按 Step 0a 设置。

### 3b. 格式与 Lint（前后端可并行）

**前端：**
1. ESLint 检测并修复：`pnpm --dir frontend run lint:fix`
2. Prettier 格式化：`pnpm --dir frontend run format`
3. TypeScript 类型检查：`pnpm --dir frontend run typecheck`

**后端：**
1. rustfmt 格式化：`cargo fmt --all`
2. Clippy 检测并修复：`cargo clippy --workspace --all-targets --fix -- -D warnings`
3. 编译检查：`cargo check --workspace`

### 3c. 测试（前后端可并行）

1. 前端测试：`pnpm --dir frontend run test`
2. Rust 测试：`cargo test --workspace`

### 3d. 修复约束

- 所有修改不得破坏现有功能效果及 UI/UX
- 变更前识别涉及的模块与依赖
- 仅实施经充分论证的正向改进
- **预存警告/报错也须修复** — 无论是否为本次变更引入，均须一并分析和修复

### 3e. 失败处理

| 场景 | 处理 |
|------|------|
| 修复尝试 3 次仍失败 | 向用户报告失败详情并等待指示 |
| 自动修复产生新代码变更 | 重新执行类型检查和编译检查 |
| 疑似 flaky test | 连续运行 5 次，偶发失败 ≤2 次标记为 flaky 不阻塞；失败 >2 次视为真实失败 |
| 已知 flaky test | 在 `package.json` 的 `test:flaky` 脚本中登记，验收时排除 |

**完成条件：** 零警告零错误，所有测试通过（排除已知 flaky）。

---

## Step 4: 总结与文档同步（强制）

> **此步骤为强制步骤，不可跳过。** 禁止以下偷懒行为：
> - ❌ 依赖其他技能生成的计划文档（如 writing-plans 的 plan.md）作为文档同步的替代
> - ❌ 依赖 commit 信息作为变更总结的替代
> - ❌ 声称"无需更新文档"而不逐项检查清单
> - ❌ 仅更新规则文件而遗漏技能文件、治理文档、架构文档的检查
> - ❌ 以"变更太小"为由跳过整个 Step 4

### 4a. 变更总结

1. 分析所有已解决的任务与问题，总结架构与功能模块的变化
2. 将经验教训沉淀为知识，将 UI/UX 与功能的特殊要求沉淀为项目标准
3. **必须输出具体的总结内容**（而非仅说"已总结"），包括：
   - 本次变更涉及的功能模块列表
   - 架构决策或模式变更
   - 值得记录的经验教训

### 4b. 文档检查清单（逐项检查，不可跳过）

按以下清单**逐项检查**是否需要更新，**仅更新有变更相关的文件**。每项检查后必须明确记录"需要更新"或"无需更新"：

| 类别 | 路径 | 检查内容 |
|------|------|----------|
| 规则文件 | `.agents/rules/`、`.trae/rules/` | 本次变更是否涉及编码规范、架构模式、工具链变化 |
| 技能文件 | `.opencode/skills/`、`.agents/skills/`、`.trae/skills/` | 本次变更是否影响技能指令或触发条件 |
| 治理文档 | `AGENTS.md`、`CONTEXT.md` | 是否新增术语、功能、架构层级 |
| 架构文档 | `docs/architecture/`、`docs/development/` | 是否涉及架构决策或开发流程变更 |
| 知识沉淀 | `docs/知识沉淀/` | 是否有值得记录的经验教训 |
| 操作手册 | `UIOperationManual/` | 是否涉及 UI 交互变更 |

### 4c. 规则提取与同步

1. 回顾本次工作中的编码模式、架构决策、命名约定等可复用的规范
2. 判断是否需要提取为新的规则文件，或更新已有的规则文件
3. 若提取/更新规则，同步写入两个规则目录（保持内容一致）：
   - `.agents/rules/`（真源，Git 跟踪）
   - `.trae/rules/`（同步副本）
4. 同步后检查 `.gitignore` 确保必要的规则文件被 Git 跟踪

### 4d. 技能文件同步

若修改了技能文件，**必须同步到三个目录**（保持内容一致）：
- `.opencode/skills/`（真源）
- `.agents/skills/`（同步备份）
- `.trae/skills/`（同步备份）

### 4e. 设计规范提取

1. 回顾本次工作中的 UI/UX 决策、交互模式、视觉风格等
2. 判断是否可作为项目设计标准确立（可复用、跨模块一致性）
3. 若确立为标准，更新相关设计文档和组件代码

**完成条件：** 所有相关文档已更新，内容简洁规范无冗余，规则与技能已同步。**必须在最终总结中列出本次更新了哪些具体文件。**

---

## Step 5: 项目清理

1. 移除 `.adl-logs/` 中超过 7 天的日志文件（若目录存在）
2. 移除根目录下的调试日志文件（`debug-logs.txt`、`debug-logs-browser.txt`），若不存在则跳过
3. 移除 `test-artifacts/` 中不再需要的临时截图、录屏、测试报告（保留近 3 天内的文件）
4. 保持目录结构清晰、干净

> 清理操作使用 DeleteFile 工具，删除前确认文件存在，避免因文件不存在而报错。

---

## Step 6: 最终总结

完成所有步骤后，向用户输出简洁的收尾总结：

```
## 收尾完成

| 步骤 | 结果 |
|------|------|
| 前置检查 | ✅ / ⏭️ 跳过 |
| 日志审查 | ✅ 无问题 / ⚠️ 发现 N 个问题已修复 / ⏭️ 跳过 |
| 代码审查 | ✅ 审查通过 / ⚠️ 经 N 轮审查修复（含 M 次用户确认） / ⏭️ 跳过 |
| 质量检测 | ✅ 全部通过 / ⚠️ 部分失败（说明） |
| 文档同步 | ✅ 已更新 N 个文件（列出具体文件） / ⏭️ 无需更新 |
| 项目清理 | ✅ 已清理 / ⏭️ 无需清理 |

[若有点击提交，注明 commit hash 和变更概要]
```

---

## Quick Reference

| Step | 操作 | 关键命令/工具 | 完成条件 |
|------|------|--------------|----------|
| 0. 前置检查 | 环境 PATH + 工作区状态 + 磁盘空间 | `git branch`/`git status` | 环境就绪，无阻塞问题 |
| 1. 日志审查 | 检查 `.adl-logs` + 调试日志（**使用 LS/Read 直接操作，因日志文件被 gitignore**） | `LS`/`Read`（禁止 Glob/Grep） | 无未解决的 P0/P1 问题 |
| 2. 代码审查 | 收集变更 → 子代理审查 → **强制修复** → 循环重审 | `git diff`/`git diff --cached`/`git diff origin/HEAD..HEAD` + Task 工具 + AskUserQuestion | 子代理确认无问题 或 达 3 轮上限 |
| 3. 质量检测 | Lint/Format/Typecheck/Tests | ESLint/Prettier/Clippy/rustfmt/tsc/cargo check/vitest/cargo test | 零警告零错误，测试全通过 |
| 4. 文档同步 | **强制**更新相关文档，提取规则与设计规范 | Write/Edit + 规则/技能同步 | 逐项检查清单完成，列出具体更新文件 |
| 5. 项目清理 | 清理临时/调试文件 | DeleteFile | 目录结构清晰干净 |
| 6. 最终总结 | 输出收尾总结表格 | 文本输出 | 用户已了解收尾结果 |

---

## Red Flags

### 流程类
- 跳过前置检查直接执行命令（PATH 未设置导致命令失败）
- 跳过日志审查直接进入代码审查
- 使用 Glob/Grep 搜索日志文件（日志文件已被 gitignore，必须用 LS/Read 直接操作）
- 一次性审查后未循环就认为代码无问题
- **子代理审查发现问题但未实际修复代码**（仅口头确认或记录）
- 质量检测发现警告/错误但未修复
- 仅运行格式化/Lint 而跳过类型检查和测试
- 未输出最终总结

### 询问卡片类
- 审查发现问题需要用户确认但未弹出询问卡片（直接自行决定）
- 存在多套解决方案但未列出选项和优缺点（直接选择一种）
- 修复可能影响现有功能但未与用户确认

### 变更采集类
- **采集变更时遗漏某种类型** — 未暂存、已暂存、已提交本地变更三类需独立采集并合并
- **将已推送的远程提交纳入审查** — 已推送至远程的代码视为已验证
- 审查循环超过 3 轮未向用户报告

### 修复类
- **修复质量检测问题时引入无关变更** — 仅修复工具报告的问题
- **测试失败后未分析根因直接重试** — 先区分实现 bug 与测试过时
- 修复后未重新运行类型检查和编译检查

### 同步类
- **提取规则时遗漏 `.trae/rules/` 同步** — 两个规则目录必须保持内容一致
- **仅更新文档而未将可复用的编码/设计模式提取为标准**
- **技能文件修改后未在三个目录间同步** — `.opencode/skills/`、`.agents/skills/`、`.trae/skills/` 必须保持一致
- **跳过 Step 4 文档同步** — 此步骤为强制步骤，不可跳过
- **依赖其他技能的计划文档、commit 信息等作为文档同步的替代** — 必须逐项检查文档清单

### 清理类
- 遗留调试日志或临时文件
- 删除文件前未确认文件存在导致报错

### Git 安全
- 执行破坏性 git 操作（`push --force`、`reset --hard`、`checkout .`、`branch -D`）除非用户明确要求
- 自动提交未经用户确认的变更