---
name: closing-workflow
description: End-of-work closing procedures when all tasks are resolved. Invoke after completing code changes, bug fixes, or feature implementations. Performs log review, code review loop, quality checks (lint/format/typecheck/tests), documentation sync, and project cleanup.
---

# Closing Workflow

## Overview

所有任务和问题已解决后，执行标准收尾流程确保工作质量与项目整洁。

**核心原则:** 日志审查 → 代码审查循环 → 质量检测 → 文档同步 → 项目清理，五步缺一不可。

## When to Invoke

以下任一场景触发此技能：

- 完成代码变更、Bug 修复、新功能实现或重构后
- 用户明确要求执行收尾流程
- 所有开发任务标记为完成时

## The Process

### Step 1: 日志审查

1. 检查 `.adl-logs` 目录是否存在
   - 若目录不存在，跳过此步骤
   - 若目录存在，读取其中所有日志文件内容
2. 审视分析日志中记录的错误、警告、异常信息
3. 对发现的问题予以解决（修复代码、清理无效日志等）
4. 确认无未解决问题后，继续后续步骤

### Step 2: 代码审查循环

#### 2a. 收集变更来源

基于本次对话窗口中的执行信息，由 Agent 自行判断需要审查哪些变更，覆盖以下三类，**各自独立采集后合并**：

| 类型 | 采集命令 | 说明 |
|------|----------|------|
| 未暂存变更 | `git diff` | 工作区中已修改但未 `git add` 的文件 |
| 已暂存变更 | `git diff --cached` | 已 `git add` 但尚未提交的文件 |
| 已提交本地变更 | `git log origin/HEAD..HEAD -p` 或 `git diff origin/HEAD..HEAD` | 已 `git commit` 但未 `git push` 的提交 |

Agent 灵活判断方式：
- **根据对话记录**：回顾本次执行中创建/修改了哪些文件、执行了哪些 git 操作，结合上述命令确认变更集
- **区分本地与远程**：已推送至远程的代码视为已验证，不纳入审查
- **考虑分支情况**：如涉及工作树分支、多分支操作，Agent 需自行确定当前审查目标分支，并收集该分支的变更

**汇总**：将三类变更的 diff 合并，作为子代理的完整审查素材。若确认无任何变更，则跳过 Step 2。

#### 2b. 执行审查循环

使用 Task 工具（`subagent_type: "general_purpose_task"`）开启子代理，向其提供完整的变更 diff 内容。子代理需审视分析代码变更，检查以下维度：

- 逻辑错误、边界条件遗漏
- 安全漏洞、性能问题
- 代码不完善、不健壮之处
- 可优化改进的地方
- 是否违反项目编码规范（见 `.agents/rules/`）

**循环规则：**
```
子代理审查发现问题 → 主代理验证问题存在性 → 主代理修复 → 子代理再次审查（基于完整 diff）
                      ↻ 直到子代理确认无任何问题 ↻
```

**注意**：子代理每次审查应基于完整的变更 diff，而非仅审查上次发现的问题点。

只有子代理确认无任何问题后，才继续后续步骤。

### Step 3: 代码质量检测与修复

按依赖关系组织，前后端可并行执行。详细流程见 [mandatory-testing.md](.agents/rules/mandatory-testing.md)。

**前端组（并行）：**
1. ESLint 检测并修复：`pnpm --dir frontend run lint:fix`
2. Prettier 格式化：`pnpm --dir frontend run format`
3. TypeScript 类型检查：`pnpm --dir frontend run typecheck`

**后端组（并行）：**
1. rustfmt 格式化：`cargo fmt --all`
2. Clippy 检测并修复：`cargo clippy --workspace --all-targets --fix -- -D warnings`
3. 编译检查：`cargo check --workspace`

**测试执行（前后端并行）：**
1. 前端测试：`pnpm --dir frontend run test`
2. Rust 测试：`cargo test --workspace`

**约束：**
- 所有修改不得破坏现有功能效果及 UI/UX
- 变更前识别涉及的模块与依赖
- 仅实施经充分论证的正向改进（提升性能、安全、可维护性或体验）

**失败处理：**
- 修复尝试 3 次仍失败 → 向用户报告失败详情并等待指示
- 格式化/Lint 的自动修复产生新代码变更后，重新执行类型检查和编译检查
- 疑似 flaky test：连续运行 5 次，偶发失败 ≤2 次标记为 flaky 不阻塞；失败 >2 次视为真实失败

### Step 4: 总结与文档同步

1. 分析所有已解决的任务与问题，总结架构与功能模块的变化
2. 将经验教训沉淀为知识，将 UI/UX 与功能的特殊要求沉淀为项目标准
3. 检查并更新所有相关文件：
   - 规则文件（`.agents/rules/`）
   - 技能文件（`.opencode/skills/`）
   - 项目治理文档（`AGENTS.md`、`README.md`、`CONTEXT.md`）
   - 架构文档（`docs/architecture/`、`docs/development/`）
   - 知识沉淀（`docs/知识沉淀/`）
   - UI 操作手册（`UIOperationManual/`）
4. 对于已提交的变更，在总结中注明对应的 commit hash 和变更概要，确保文档与代码历史可追溯
5. 确保内容简洁、清晰、规范且无冗余重复
6. 必要时可创建、删除或重写文件/目录

### Step 5: 项目清理

1. 移除 `.adl-logs/` 中超过 7 天的日志文件
2. 移除根目录下的调试日志文件（`debug-logs.txt`、`debug-logs-browser.txt`）
3. 移除 `test-artifacts/` 中不再需要的临时截图、录屏、测试报告
4. 保持目录结构清晰、干净

## Quick Reference

| Step | 操作 | 关键命令/工具 | 完成条件 |
|------|------|--------------|----------|
| 1. 日志审查 | 检查 `.adl-logs` | `LS`/`Read` | 无未解决的警告/问题 |
| 2. 代码审查 | 收集变更 → 子代理循环审查+修复 | `git diff`/`git diff --cached`/`git log` + Task 工具 | 子代理确认无问题 |
| 3. 质量检测 | Lint/Format/Typecheck/Tests | ESLint/Prettier/Clippy/rustfmt/tsc/cargo check/vitest/cargo test | 零警告零错误，测试全通过 |
| 4. 文档同步 | 更新所有相关文档 | Write/Edit | 内容简洁规范无冗余 |
| 5. 项目清理 | 清理临时/调试文件 | DeleteFile | 目录结构清晰干净 |

## Red Flags

- 跳过日志审查直接进入代码审查
- 一次性审查后未循环就认为代码无问题
- 质量检测发现警告/错误但未修复
- 仅运行格式化/Lint 而跳过类型检查和测试
- 未同步更新相关文档
- 遗留调试日志或临时文件
- **采集变更时遗漏某种类型** — 未暂存、已暂存、已提交本地变更三类需独立采集并合并，不可用互斥逻辑
- **将已推送的远程提交纳入审查** — 已推送至远程的代码视为已验证，不应纳入审查范围
- **修复质量检测问题时引入无关变更** — 仅修复工具报告的问题，不做无关代码变更
- **测试失败后未分析根因直接重试** — 先区分实现 bug 与测试过时，再决定修复策略