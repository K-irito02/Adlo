---
name: closing-workflow
description: End-of-work mandatory closing procedures. Invoke after completing all code changes, bug fixes, or feature implementations in a conversation session. Performs environment check, log review, multi-agent parallel code review with mandatory fixes, quality gates, doc sync, and cleanup.
---

# Closing Workflow

## Overview

所有开发任务完成后，执行标准收尾流程确保工作质量与项目整洁。

**流程：** 前置检查 → 日志审查 → 代码审查（多Agent并行 + 强制修复） → 质量检测 → 文档同步 → 项目清理 → 最终总结

## When to Invoke

- 本轮对话中所有开发任务已完成，准备结束工作时
- 用户明确要求执行收尾流程

> 不要在每次代码编辑后触发，应在整轮工作完成、准备收尾时触发。此技能与 `mandatory-testing.md` 规则互补：`mandatory-testing.md` 在每次代码变更后自动触发（轻量级验证），本技能在整轮对话收尾时触发（全面审查 + 文档同步 + 清理）。

---

## Step 0: 前置检查

### 环境准备

执行命令前按 `commands.md` 设置 PATH（Node.js + Rust）。所有命令默认在 `ai-digital-life/` 目录执行。

### 工作区状态

1. `git branch --show-current` — 确认当前分支
2. `git status --short` — 了解工作区概况
3. 若有未跟踪文件，判断是否为本次工作产物

### 磁盘空间（可选）

```powershell
Get-ChildItem "ai-digital-life\src-tauri\target\debug\incremental" -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum | ForEach-Object { "{0:N2} GB" -f ($_.Sum / 1GB) }
```

超过 10 GB 时提醒用户运行 `ai-digital-life\.cargo\clean-incremental.ps1`。

---

## Step 1: 日志审查

### 关键约束

日志文件已被 `.gitignore` 排除，**Glob/Grep 无法找到它们**，必须使用 **LS/Read** 直接操作。

**只分析最新日志：** 各日志目录可能存在多个历史文件。逐项检查时，先 `LS` 列出并按 `LastWriteTime` 取**最新**的一个文件分析，忽略其余旧文件。同名覆盖式文件（`debug-logs.txt` 等）直接读取。

### 检查清单

| 路径 | 说明 |
|------|------|
| `<workspace_root>/.adl-logs/` | 应用运行时日志 |
| `<workspace_root>/debug-logs.txt` | Tauri 桌面调试日志 |
| `<workspace_root>/debug-logs-browser.txt` | 浏览器预览调试日志 |
| `<workspace_root>/ai-digital-life/.run-logs/` | 本地开发运行日志 |
| `<workspace_root>/ai-digital-life/diagnostic-logs/` | 诊断服务日志 |

> `<workspace_root>` 为当前工作区根目录。逐项检查，一项不存在不影响其他项。全部不存在 → 跳过 Step 1。

### 分析标准

| 优先级 | 类型 | 处理 |
|--------|------|------|
| P0 | 崩溃/异常堆栈 | 定位根因并修复 |
| P1 | 功能性错误（IPC 失败等） | 分析原因，修复或记录 |
| P2 | 警告（deprecation、性能） | 评估是否修复 |
| P3 | 信息性日志 | 确认无异常后忽略 |

**完成条件：** 无未解决的 P0/P1 问题。

---

## Step 2: 代码审查（多Agent并行 + 强制修复）

### 2a. 收集变更

三类变更独立采集：

| 类型 | 命令 | 说明 |
|------|------|------|
| 未暂存 + 已暂存 | `git diff HEAD` | 涵盖所有未提交变更 |
| 已提交本地 | `git diff origin/HEAD..HEAD` | 若分支无 upstream 则跳过 |

**规则：**
- 已推送至远程的代码不纳入审查
- 根据对话记录回顾本次修改的文件，与上述命令交叉验证变更集
- 两类均无变更 → 跳过 Step 2

**Diff 快照预生成：** 合并后的变更一次性写入快照文件，供子代理直接读取，**不在终端重复执行 git 命令**：

1. 在仓库根创建临时目录 `.review-diffs/`（已加入 `.gitignore`，Step 5 清理时删除）
2. 生成合并快照（合并两类变更，去重）：
   ```powershell
   git diff HEAD > .review-diffs/rev<N>.diff
   git diff origin/HEAD..HEAD >> .review-diffs/rev<N>.diff
   ```
3. 每个任务从完整快照中提取相关变更子集，生成独立快照：`.review-diffs/<task>-rev<N>.diff`
4. 子代理 prompt 中直接给出快照文件路径，令其 Read 该文件，而非自行 `git diff`
5. 每轮修复后重新生成快照（rev 递增，如 `rev1` → `rev2`），供下一轮复审使用

### 2b. 多Agent并行审查

按已解决的任务数量派发子代理，每个 Agent 对分配的任务做**全面审查**（技术方案、设计、正确性、安全、性能、最佳实践），而非单一维度。

**Agent 数量：** 1 个任务 → 1 Agent；2+ 个任务 → N Agent（N=任务数；>5 时合并变更量 < 50 行的小型任务）。

**并行派发：** 在同一条消息中同时派发 N 个 Task（`subagent_type: "general_purpose_task"`），使用以下 prompt 模板：

```
Review the following completed task's code changes:

[TASK_DESCRIPTION]

Perform a comprehensive review covering:
1. Design: solution appropriateness, naming, responsibility, coupling, architecture consistency
2. Correctness: logic errors, edge cases, race conditions, type safety, error handling paths
3. Security & Performance: vulnerabilities, unsafe ops (unwrap/any), N+1 queries, resource leaks
4. Standards: project coding rules (.agents/rules/), i18n, error handling, loading states, Promise handling, IPC bridge consistency

For each issue, report: file + line range, severity (critical/high/medium/low), category, description, suggested fix.

Use Read to load the diff snapshot file: .review-diffs/<task>-rev<N>.diff (do NOT run git commands in terminal).
```

**合并结果：** 去重（同文件同行同类问题保留最详细者）→ 按 severity 降序排列 → 输出合并清单。

### 2c. 强制修复循环

**核心原则：所有审查发现的问题必须修复，不得跳过。**

```
逐个分析问题
  ├─ 需 AskUserQuestion？（见下表）→ YES → 弹出询问卡片，等用户决策后修复
  └─ NO → 直接修复
全部修复后 → 重新执行 2b 多Agent审查
  ├─ 仍有问题 → 重复循环
  └─ 无问题 → 审查通过
```

**AskUserQuestion 触发条件（满足任一即弹出）：**

| 条件 | 示例 |
|------|------|
| 影响核心架构、大面积重构、破坏向后兼容 | 修改共享模块、变更公共 API |
| 涉及业务逻辑决策，Agent 无法自行判断 | 错误处理策略、默认值选择 |
| 存在多套可行方案 | 重构方式、架构调整方向 |
| 需引入新依赖或涉及安全策略变更 | 新增包、权限模型变更 |

**询问卡片格式：** 列出 2-4 个方案，各说明优缺点与风险，标注推荐方案。

**修复约束：** 仅修复审查发现的问题，遵循 `.agents/rules/` 编码规范，不破坏现有功能及 UI/UX。

**迭代控制：**
- 每轮修复后必须重新运行多Agent审查，不可凭主代理判断跳过
- 每轮修复后重新生成快照（rev 递增），下一轮子代理按**最新完整快照全量重看**（不得只看增量或复用过期快照）
- 同一问题 3 轮仍未解决 → 向用户报告并等待指示

**完成条件：** 所有 Agent 确认零问题。

---

## Step 3: 代码质量检测

> 此步骤与 `mandatory-testing.md` 规则一致。若本轮对话中已完整执行过全量质量检测（Lint + Format + Typecheck + Tests 全部通过），则跳过；否则运行全部。

**与 `mandatory-testing.md` 的关系：**
- `mandatory-testing.md`：每次代码变更后自动触发（轻量级，按变更层级选择测试范围）
- 本 Step 3：收尾时执行**全量**质量检测（确保累计变更无回归）

**分级验证（避免冗余全量测试）：**

| 时机 | 执行范围 |
|------|---------|
| Step 2 循环内每轮修复后 | 只跑受影响部分：Rust `cargo test -p <受影响crate>`（通过 `git diff --name-only` 定位变更文件所属 crate）、前端 `vitest run <受影响测试文件>`（匹配 `__tests__/` 目录）；保持 clippy/tsc 通过即可，**不跑全量** |
| 全部审查完成后（仅一次） | 全量质量检测：见下方"执行" |

### 执行（前后端并行）

> **并行执行：** 在同一条消息中发两个命令（前端一组、后端一组），等待全部返回，禁止顺序串行执行。

**前端：**
```powershell
pnpm --dir frontend run lint:fix; pnpm --dir frontend run format; pnpm --dir frontend run typecheck; pnpm --dir frontend run test
```

**后端：**
```powershell
cargo fmt --all; cargo clippy --workspace --all-targets --fix -- -D warnings; cargo test --workspace
```

> `cargo check --workspace` 不单独执行：`cargo clippy --all-targets` 已覆盖编译检查，避免与 `cargo test` 重复编译。

### 修复与失败处理

- 仅修复工具报告的问题，不做无关变更；预存警告/报错也须修复
- 自动修复产生新代码变更后，重新执行类型检查和编译检查
- 3 次修复仍失败 → 向用户报告并等待指示
- 疑似 flaky test：连续 5 次，≤2 次失败标记为 flaky 不阻塞，>2 次视为真实失败
- 已知 flaky test：验收时排除

**完成条件：** 零警告零错误，测试全通过（排除已知 flaky）。

---

## Step 4: 文档同步（强制）

> 不可跳过。禁止以"变更太小"、计划文档、commit 信息等替代。

### 4a. 变更总结

输出具体内容（非仅说"已总结"）：涉及的功能模块、架构决策或模式变更、值得记录的经验教训。

### 4b. 文档检查清单

逐项检查，每项明确记录"需要更新"或"无需更新"：

| 类别 | 路径 | 检查内容 |
|------|------|----------|
| 规则文件 | `.agents/rules/`、`.trae/rules/` | 编码规范、架构模式、工具链变化 |
| 技能文件 | `.opencode/skills/`、`.agents/skills/`、`.trae/skills/` | 技能指令或触发条件变化 |
| 治理文档 | `AGENTS.md`、`CONTEXT.md` | 新增术语、功能、架构层级 |
| 架构文档 | `docs/architecture/`、`docs/development/` | 架构决策或开发流程变更 |
| 知识沉淀 | `docs/knowledge-base/` | 值得记录的经验教训 |
| 操作手册 | `docs/operations/ui-manual/` | UI 交互变更 |

### 4c. 同步规则

- 规则更新：以 `.agents/rules/` 为真源，同步到 `.trae/rules/`
- 技能更新：以 `.opencode/skills/` 为真源，同步到 `.agents/skills/`、`.trae/skills/`
- 同步后检查 `.gitignore` 确保必要文件被 Git 跟踪

### 4d. 设计规范提取

回顾本轮涉及的 UI/UX 决策与交互模式，若满足以下条件则提取为项目标准并更新相关文档：
- 引入了新的可复用交互模式
- 对现有设计规范有实质性补充或修正

**完成条件：** 所有相关文档已更新，在最终总结中列出具体更新的文件。

---

## Step 5: 项目清理

1. 移除 `.adl-logs/` 中超过 7 天的日志文件
2. 移除 `debug-logs.txt`、`debug-logs-browser.txt`（若存在）
3. 移除 `test-artifacts/` 中超过 3 天的临时文件
4. 移除 `.review-diffs/` 全部快照文件（Step 2 临时审查产物）

使用 PowerShell `LastWriteTime` 判断文件年龄，DeleteFile 工具删除（删除前确认存在）。

---

## Step 6: 最终总结

输出收尾总结表格：

```
## 收尾完成

| 步骤 | 结果 |
|------|------|
| 前置检查 | ✅ / ⏭️ 跳过 |
| 日志审查 | ✅ 无问题 / ⚠️ 发现问题已修复 / ⏭️ 跳过 |
| 代码审查 | ✅ 通过（N Agent）/ ⚠️ 经 N 轮修复（M 次用户确认）/ ⏭️ 跳过 |
| 质量检测 | ✅ 全部通过 / ⚠️ 部分失败（说明） |
| 文档同步 | ✅ 已更新 N 个文件（列出） / ⏭️ 无需更新 |
| 项目清理 | ✅ 已清理 / ⏭️ 无需清理 |

### 审查报告

| Agent | 任务 | 问题数 | 分布 |
|-------|------|--------|------|
| Agent N | [描述] | N | critical:X, high:Y, medium:Z, low:W |

### 修复情况

| 问题 | 来源 | 处理 | 状态 |
|------|------|------|------|
| [简述] | Agent N | 直接修复/用户确认 | ✅ |
```

---

## Quick Reference

| Step | 操作 | 关键工具 | 完成条件 |
|------|------|----------|----------|
| 0 | 环境 PATH + 工作区状态 + 磁盘空间 | `git branch`/`git status` | 环境就绪 |
| 1 | 检查日志（**用 LS/Read，只看最新日志**） | LS/Read | 无 P0/P1 问题 |
| 2 | 采集变更（`git diff HEAD` + `origin/HEAD..HEAD`）→ 生成 diff 快照 → 按任务并行审查 → 合并 → 强制修复循环（每轮重新生成快照） | `git diff` + Task（N 并行） + AskUserQuestion | 所有 Agent 零问题 |
| 3 | Lint/Format/Typecheck/Tests（**前后端并行**，循环内定向测试、收尾全量） | ESLint/Prettier/Clippy/rustfmt/tsc/vitest/cargo test | 零警告零错误 |
| 4 | **强制**文档同步，提取规则与设计规范 | Write/Edit + 同步 | 逐项检查完成，列出具体文件 |
| 5 | 清理临时/调试文件（按 LastWriteTime 判断年龄） | DeleteFile + PowerShell | 目录干净 |
| 6 | 输出收尾总结表格 | 文本输出 | 用户已了解结果 |

---

## Red Flags

### 流程
- 跳过前置检查（PATH 未设）
- 串行派发 Task（非真正并行）
- 按维度拆分审查而非按任务
- 一次性审查后未循环
- 发现问题未实际修复代码
- 仅跑 Lint 跳过 typecheck/test

### 变更采集
- 遗漏未暂存/已暂存/已提交本地某类变更
- 将已推送代码纳入审查
- `origin/HEAD..HEAD` 失败未降级
- 3 轮未解决未报告
- 未生成 diff 快照 / 子代理在终端自行 `git diff`
- 复审复用过期快照或只看增量

### 审查修复
- 多Agent结果未去重/未按 severity 排序
- 引入无关变更
- 测试失败未分析根因直接重试
- 修复后未重新检查

### 文档同步
- 跳过 Step 4 文档同步
- 规则更新遗漏 `.trae/rules/`
- 技能修改未三目录同步
- 以计划文档/commit 替代文档同步

### 其他
- 使用 Glob/Grep 搜索日志
- 删除文件前未确认存在
- 清理未用 LastWriteTime
- 执行破坏性 git 操作
- 自动提交未确认变更