---
name: closing-workflow
description: End-of-work mandatory closing procedures. Invoke when all development tasks in a conversation session are complete. Runs environment check, log review, multi-agent parallel code review with mandatory fixes, quality gates, doc sync, and cleanup.
---

# Closing Workflow

## Overview

所有开发任务完成后，执行标准收尾流程，确保工作质量与项目整洁。

**流程：** 前置检查 → 日志审查 → 代码审查（多Agent并行 + 强制修复） → 质量检测 → 文档同步 → 项目清理 → 最终总结；全程自动记录，测试分级执行（只执行受影响的测试）。

> **文档路径基准（重要）**：本技能中所有 `docs/...` 路径均以**仓库根目录**（含根 `AGENTS.md` 与 `docs/` 的治理根，即 `ai-digital-life/` 的父目录）为基准。即使当前工作目录位于 `ai-digital-life/` 子工作区，也必须写入根仓库的 `docs/`，禁止在 `ai-digital-life/docs/` 下另建文档目录。

## When to Invoke

- 本轮对话中所有开发任务已完成，准备结束工作时
- 用户明确要求执行收尾流程

> 不要在每次代码编辑后触发，应在整轮工作完成、准备收尾时触发。与 `mandatory-testing.md` 规则互补：该规则在每次代码变更后自动触发（轻量级验证），本技能在整轮对话收尾时触发（全面审查 + 文档同步 + 清理）。

---

## 阶段自动记录（防上下文丢失）

**目的：** 防止上下文压缩导致必要信息丢失。所有关键信息必须存在于文档中，禁止依赖 Agent 记忆、回溯或追踪。主 Agent 与子 Agent 都必须自动记录到对应文档。

### 收尾记录文件

- **目录**：`docs/closing-workflow/YYYY-MM/`（不存在则创建）
- **文件名**：`progress-YYYY-MM-DD-HHmmss.md`（精确到秒，避免重复）
- 与 `docs/root-cause-resolution/` 进度文件不同，本文件专门记录收尾流程（Step 0-6）的执行过程与结果

### 主 Agent：每 Step 完成后立即记录

每个 Step（0-6）**完成时立即**写入收尾记录文件，禁止"稍后一起记"：

- **结论** — 审查问题数、修复情况、测试结果、同步的文件清单
- **关键证据** — 日志异常摘要、审查报告摘要、错误信息
- **决策与理由** — AskUserQuestion 的决策、跳过/执行某 Step 的理由
- **下一步** — 下一 Step 入口信息

| 时机 | 记录内容 |
|------|---------|
| 任务类型分类完成 | 任务清单、类型（需求/解决/优化/调整）、产物路径 |
| 每 Step 完成 | Step 结论 + 关键证据 + 决策理由 + 下一步 |
| 上下文压缩前 | 确认所有关键信息已写入文档 |

### 子 Agent（Step 2 审查 Agent）：必须写入独立报告文件

**每个审查子 Agent 都必须将完整审查报告写入独立报告文件**：`.review-diffs/<task>-rev<N>-report.md`。报告文件必须自包含：

- **输入** — diff 快照路径、审查任务描述
- **输出** — 逐问题结论（文件+行号、severity、类别、描述、建议修复）、severity 分布
- **上下文** — 判断依据

返回消息只需给出**报告文件路径 + 关键摘要**，完整信息在文件中。

> **已实测（2026-08-15）：** 主 Agent 无法读取子 Agent 的窗口/会话上下文，只能获得子 Agent 的最终返回消息（隐藏信息无法透出）。因此子 Agent 必须写独立报告文件，不能依赖返回消息承载必要信息。

### 主 Agent 转写与索引（两者同时执行）

子 Agent 报告返回后，主 Agent 必须同时做两件事，不是"转写或索引"二选一：

1. **转写关键信息** — 逐问题结论摘要、severity 分布、需修复清单（写入收尾记录文件正文）
2. **添加子 Agent 报告索引** — 报告文件路径（`.review-diffs/<task>-rev<N>-report.md`）

使收尾记录文件成为唯一真实来源：正文含可直接使用的关键信息（转写），同时保留可回溯完整报告的路径（索引），任何子 Agent 报告丢失时仍可恢复。

---

## Step 0: 前置检查

### 环境准备

执行命令前按 `commands.md` 设置 PATH（Node.js + Rust）。

**工作目录：** git 命令（branch/status/diff）在仓库根（工作区根）执行；`cargo`/`pnpm` 在 `ai-digital-life/` 执行。

### 工作区状态

1. `git branch --show-current` — 确认当前分支
2. `git status --short` — 了解工作区概况
3. 若有未跟踪文件，判断是否为本次工作产物

### 任务类型分类

收尾开始时，先分类本轮会话的工作内容，结果写入收尾记录文件：

| 内容类型 | 判定特征 | 收尾时的处理 |
|---------|---------|------------|
| **需求相关类型** | 新功能、新组件、页面、创意、行为变更 | 检查 brainstorming 产出（设计文档 `docs/superpowers/specs/`）是否落盘，并在 Step 4 文档同步中覆盖 |
| **解决/优化/调整类型** | Bug 修复、性能优化、结构调整、行为修正 | 检查 `docs/root-cause-resolution/` 进度文件是否完整归档（根因/修复/验证记录） |
| **混合内容** | 两类都有 | 上述两类检查都执行 |

**规则：**
- 使用过 `brainstorming` 且任务同时含解决/优化/调整问题时，两类都必须在 Step 2 审查与 Step 4 文档同步中覆盖，不能只处理需求部分
- 分类结果与产物路径写入收尾记录文件，供 Step 2/4 使用

### 磁盘空间（可选）

```powershell
powershell -File "ai-digital-life\.cargo\clean-target.ps1" -WhatIf
```

脚本按空间阈值触发（`ai-digital-life/target/debug` 超过 30 GB 即全量 `cargo clean`，不按时间窗口判断）。`-WhatIf` 干跑后询问用户是否执行。清理为**永久删除**：`cargo clean` 直接物理删除构建产物，**不进入回收站/垃圾箱**，无需清空回收站：

```powershell
powershell -File "ai-digital-life\.cargo\clean-target.ps1"
```

> `.agents/skills/`、`.trae/skills/` 的 `closing-workflow/SKILL.md` 为同步副本，修改真源 `.opencode/skills/` 后需同步（见 Step 4c）。

---

## Step 1: 日志审查

### 关键约束

日志文件已被 `.gitignore` 排除，**Glob/Grep 无法找到它们**，必须使用 **LS/Read** 直接操作。

**只分析最新日志：** 各日志目录可能存在多个历史文件。逐项检查时，先 `LS` 列出并按 `LastWriteTime` 取**最新**的一个文件分析，忽略其余旧文件。同名覆盖式文件（`debug-logs.txt` 等）直接读取。

### 检查清单

| 路径 | 说明 |
|------|------|
| `<仓库根>/.adl-logs/` | Tauri 桌面壳与浏览器前端的运行时日志 |
| `<仓库根>/.adl-logs/terminal-logs*.txt` | 桌面壳 tracing（`multi` 模式另有 `-<时间戳>` 会话文件） |
| `<仓库根>/.adl-logs/debug-logs*.txt` | 桌面壳调试日志（`write_debug_logs_to_project`） |
| `<仓库根>/.adl-logs/debug-logs-browser*.txt` | 浏览器预览调试日志（dev preview service） |
| `<仓库根>/ai-digital-life/.adl-logs/adl-server-logs*.txt` | adl-server 后端引擎 tracing（与壳不同目录） |
| `<数据根>/logs/`（release 构建） | 发布态统一日志落点（无 `.adl-logs`） |
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

### 2a. 收集变更（两类）

| 类型 | 命令 | 说明 |
|------|------|------|
| 未暂存 + 已暂存 | `git diff HEAD` | 涵盖所有未提交变更 |
| 已提交本地 | `git diff origin/HEAD..HEAD` | 若 `origin/HEAD` 不存在则跳过该部分 |

**规则：**
- 已推送至远程的代码不纳入审查
- 根据对话记录回顾本次修改的文件，与上述命令交叉验证变更集
- 两类均无变更 → 跳过 Step 2

**Diff 快照预生成：** 按文件拆分快照，供子代理直接读取，**不在终端重复执行 git 命令**：

1. 在仓库根创建临时目录 `.review-diffs/`（已加入 `.gitignore`，Step 5 清理时删除）
2. **获取变更文件列表并按文件拆分快照**：
   ```powershell
   # 获取所有变更文件（去重）
   git diff --name-only HEAD > .review-diffs/changed-files-rev<N>.txt
   git diff --name-only origin/HEAD..HEAD >> .review-diffs/changed-files-rev<N>.txt
   Sort-Object -Unique .review-diffs/changed-files-rev<N>.txt > .review-diffs/changed-files-unique-rev<N>.txt
   
   # 为每个变更文件生成独立快照
   git diff HEAD -- <文件路径> > .review-diffs/<文件名>-rev<N>.diff
   git diff origin/HEAD..HEAD -- <文件路径> >> .review-diffs/<文件名>-rev<N>.diff
   ```
   - 文件名中的路径分隔符替换为下划线（如 `src/main.rs` → `src_main.rs-rev1.diff`）
3. 子代理 prompt 中给出相关文件的快照路径列表，令其按需 Read 各文件快照，而非自行 `git diff`
4. 每轮修复后重新生成所有快照（rev 递增，如 `rev1` → `rev2`），供下一轮复审使用
5. 子代理将审查报告写入 `.review-diffs/<task>-rev<N>-report.md`；主代理读取该文件并**转写 + 索引**到收尾记录文件

### 2b. 多Agent并行审查

按已解决的任务数量派发子代理，每个 Agent 对分配的任务做**全面审查**（技术方案、设计、正确性、安全、性能、最佳实践），而非单一维度。

**Agent 数量：** 1 个任务 → 1 Agent；2+ 个任务 → N Agent（N=任务数；>5 时合并变更量 < 50 行的小型任务）。

**并行派发：** 在同一条消息中同时派发 N 个 Task（使用**可写文件**的子代理，如 `subagent_type: "general_purpose_task"`，因需写报告文件；禁止其修改任何源代码/配置/文档文件），使用以下 prompt 模板：

```
Review the following completed task's code changes:

[TASK_DESCRIPTION]

Perform a comprehensive review covering:
1. Design: solution appropriateness, naming, responsibility, coupling, architecture consistency
2. Correctness: logic errors, edge cases, race conditions, type safety, error handling paths
3. Security & Performance: vulnerabilities, unsafe ops (unwrap/any), N+1 queries, resource leaks
4. Standards: project coding rules (.agents/rules/), i18n, error handling, loading states, Promise handling, IPC bridge consistency
5. Optimization & Improvement: are there opportunities to optimize, adjust, or improve the code (including pre-existing code, user's special designs)? Even items judged as "no fix needed" must be checked for improvement opportunities

For each issue, report: file + line range, severity (critical/high/medium/low), category, description, suggested fix.

Use Read to load the diff snapshot file: .review-diffs/<task>-rev<N>.diff (do NOT run git commands in terminal).

Write your complete review report to .review-diffs/<task>-rev<N>-report.md (input: snapshot path; output: per-issue findings with file+line, severity, category, description, suggested fix, and severity distribution). Do NOT modify any source files. Return only the report file path + key summary.
```

**合并结果：** 去重（同文件同行同类问题保留最详细者）→ 按 severity 降序排列 → 输出合并清单。

### 2c. 强制修复循环

**核心原则：所有审查发现的问题（含预存问题、低程度问题）默认都要修复，但修复前必须先经主 Agent 问题验证（见下），确认真实存在且非特殊情况后才修复。**

```
逐个分析问题
  ├─ 主 Agent 问题验证（真实性 + 特殊情况判断 + 优化检查，结果记入收尾记录文件）
  │     ├─ 真实存在且应修复 → 需 AskUserQuestion？ → YES → 弹出询问卡片，等用户决策后修复
  │     │                                            └→ NO → 直接修复
  │     ├─ 用户特殊设计/正当防御性代码/合理兼容处理 → 仍需检查优化/改进空间 → 有改进之处 → 优化
  │     │                                                           └→ 无改进之处 → 不修复，记录理由
  │     └─ 误报 → 不修复，记录理由
全部处理完 → 重新执行 2b 多Agent审查
  ├─ 仍有问题 → 重复循环
  └─ 无问题 → 审查通过
```

#### 主 Agent 问题验证（修复前置）

主 Agent 必须逐项验证被报告的问题，结果写入收尾记录文件：

1. **真实性验证** — 重新阅读相关代码、复现、核对逻辑与调用链，排除子代理误报与过期快照假阳性；核对 diff 快照与实际代码一致
2. **特殊情况判断** — 默认都要修复，仅以下真正有正当理由的情形不修复（并记录理由）：

| 情形 | 判定 | 处理 |
|------|------|------|
| **用户特殊设计** | 刻意为之的行为/命名/结构或已知取舍（有注释、文档、历史提交佐证） | **仍需检查是否有优化/调整/改进空间**；确认无任何可改进之处后才不修复并记录理由；无法确认时询问用户 |
| **正当防御性代码** | 系统边界验证、生产调试用的错误处理/日志、有意的性能取舍 | **仍需检查是否有优化/调整/改进空间**；确认无任何可改进之处后才保留并记录理由 |
| **无用/不必要的防御性代码** | 根因修复后不再需要、冗余守卫、多重检查、不必要的预防措施 | **修复并清理删除** |
| **合理兼容处理** | 合理、符合长期演进收益、非偷懒性兼容 | **仍需检查是否有优化/调整/改进空间**；确认无任何可改进之处后才保留并记录理由 |
| **不合理兼容处理** | 不合理、不利于长期演进、**偷懒性兼容**（为省事绕开重构） | **修复** |
| **误报** | 子代理误报 / 过期快照假阳性 | 不修复，记录理由 |
| **非本次变更引入** | 只要在审查范围内发现，无论是否本次变更引入 | **同样修复解决** |

**整体原则：** 保证代码的准确性、一致性，所有相关代码高度吻合、完美契合。尽量不引入兼容性代码，反对"A 兼容 B、B 兼容 C"式的相互兼容层；发现此类兼容一律修复为统一、一致的正确实现。**对于所有审查范围内的代码（包括预存代码、用户特殊设计、正当防御性代码、合理兼容处理），即使判定为"不修复"，也必须逐项检查是否存在可优化、调整、改进的内容，确认无任何可改进之处后才不修复。不得偷懒跳过优化检查。**

3. **复审联动：** "不修复"判定及理由写入收尾记录文件，并随下一轮审查 prompt 提供给子代理；子代理可提出异议，异议成立则重新评估，循环直到一致。

#### AskUserQuestion 触发条件（满足任一即弹出）

| 条件 | 示例 |
|------|------|
| 影响核心架构、大面积重构、破坏向后兼容 | 修改共享模块、变更公共 API |
| 涉及业务逻辑决策，Agent 无法自行判断 | 错误处理策略、默认值选择 |
| 存在多套可行方案 | 重构方式、架构调整方向 |
| 需引入新依赖或涉及安全策略变更 | 新增包、权限模型变更 |
| 无法判定是否为用户特殊设计 | 无法从代码/文档/历史确认该行为的意图 |

**询问卡片格式：** 列出 2-4 个方案，各说明优缺点与风险，标注推荐方案。

#### 修复约束与迭代控制

- **修复约束：** 仅修复经主 Agent 问题验证确认真实且应修复的问题，遵循 `.agents/rules/` 编码规范，不破坏现有功能及 UI/UX
- **迭代控制：** 每轮修复后必须重新运行多Agent审查，不可凭主代理判断跳过；每轮重新生成快照（rev 递增），下一轮子代理按**最新完整快照全量重看**（不得只看增量或复用过期快照）；同一问题 3 轮仍未解决 → 向用户报告并等待指示

**完成条件：** 所有 Agent 确认零问题。

---

## Step 3: 代码质量检测

> 与 `mandatory-testing.md` 的关系：该规则每次代码变更后自动触发（轻量级，按变更层级选择测试范围）；本 Step 3 在收尾时执行质量检测（确保累计变更无回归）。若本轮对话已完整执行过全量检测（Lint + Format + Typecheck + Tests 全部通过），则跳过；否则运行全部。

**分级验证（只执行受影响的测试）：**

> **所有阶段只执行受影响的测试，不固定执行全量测试。** 根据变更内容定位受影响的测试文件或 crate，仅运行这些测试。

| 时机 | 执行范围 |
|------|---------|
| Step 2 循环内每轮修复后 | 只跑受影响部分：Rust `cargo test -p <受影响crate>`（通过 `git diff --name-only` 定位变更文件所属 crate）、前端 `vitest run <受影响测试文件>`（匹配 `__tests__/` 目录）；保持 clippy/tsc 通过即可 |
| Step 3 质量检测 | 只跑受影响部分：根据变更范围定位受影响的测试，不执行全量测试 |

### 执行（前后端并行）

> **并行执行：** 在同一条消息中发两个命令（前端一组、后端一组），等待全部返回，禁止顺序串行执行。

**受影响测试定位方法：**
- 通过 `git diff --name-only` 获取变更文件列表
- Rust：根据变更文件路径判断所属 crate，运行 `cargo test -p <crate>`
- 前端：根据变更文件匹配相关测试文件（`__tests__/` 目录下同名或相关文件）

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
- 疑似 flaky test：连续 5 次，≤2 次失败标记为 flaky 不阻塞，>2 次视为真实失败；已知 flaky test 验收时排除

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

1. 移除两处 `.adl-logs/`（`<仓库根>/.adl-logs/` 与 `<仓库根>/ai-digital-life/.adl-logs/`）中超过 7 天的日志文件
2. 移除 `.adl-logs/` 内的 `debug-logs*.txt`、`debug-logs-browser*.txt`、`adl-server-logs*.txt`（若存在）
3. 移除 `test-artifacts/` 中超过 3 天的临时文件
4. 移除 `.review-diffs/` 全部快照文件（Step 2 临时审查产物）

使用 PowerShell `LastWriteTime` 判断文件年龄，DeleteFile 工具删除（删除前确认存在）。

---

## Step 6: 最终总结

**数据来源：** 收尾记录文件（Step 0-5 全程转写 + 索引的结论）。读取该文件生成总结，禁止依赖记忆。输出收尾总结表格：

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
| 0 | 环境 PATH + 工作区状态 + 磁盘空间 + **任务类型分类** | `git branch`/`git status` | 环境就绪，任务已分类并记录 |
| 1 | 检查日志（**用 LS/Read，只看最新日志**） | LS/Read | 无 P0/P1 问题 |
| 2 | 采集变更（两类）→ 生成 diff 快照 → 按任务并行审查（**子代理写报告文件**）→ 合并 → 主 Agent 问题验证 → 强制修复循环（每轮重新生成快照） | `git diff` + Task（N 并行） + AskUserQuestion | 所有 Agent 零问题 |
| 3 | Lint/Format/Typecheck/Tests（**前后端并行**，所有阶段只跑受影响测试） | ESLint/Prettier/Clippy/rustfmt/tsc/vitest/cargo test | 零警告零错误 |
| 4 | **强制**文档同步，提取规则与设计规范 | Write/Edit + 同步 | 逐项检查完成，列出具体文件 |
| 5 | 清理临时/调试文件（按 LastWriteTime 判断年龄） | DeleteFile + PowerShell | 目录干净 |
| 6 | 读取收尾记录文件，输出收尾总结表格 | 文本输出 | 用户已了解结果 |

> **全程：** 每 Step 完成立即写入收尾记录文件（`docs/closing-workflow/YYYY-MM/progress-*.md`）；子 Agent 写独立报告文件，主 Agent 转写 + 索引。

---

## Red Flags

### 流程
- 跳过前置检查（PATH 未设）
- 未分类本轮工作类型（需求 vs 解决/优化/调整）
- 需求相关类型遗漏 brainstorming 设计文档检查；解决/优化/调整类型遗漏 root-cause-resolution 进度文件检查
- 串行派发 Task（非真正并行）
- 按维度拆分审查而非按任务
- 一次性审查后未循环
- 发现问题未实际修复代码
- 仅跑 Lint 跳过 typecheck/test

### 阶段记录
- 某 Step 完成未立即写入收尾记录文件、想"稍后一起记"
- 依赖记忆回溯/追踪而非读取收尾记录文件
- 子代理未写独立报告文件、只靠返回消息（已实测主 Agent 读不到子 Agent 上下文）
- 主代理未把子代理报告转写 + 索引进收尾记录文件
- Step 6 总结未读取收尾记录文件、凭记忆生成

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
- 未验证问题真实性就直接修复（子代理误报/过期快照假阳性被误改）
- 未判断防御性代码/兼容处理是否正当就保留（无用防御性代码、不合理/偷懒性兼容须修复）
- 非本次变更引入的问题未修复（审查范围内的问题无论是否本次引入都要修复）
- 判定"不修复"后未检查优化/改进空间（即使判定为用户特殊设计/正当防御性代码/合理兼容处理，也必须逐项检查是否有可优化、调整、改进的内容，确认无任何可改进之处后才不修复）
- 测试失败未分析根因直接重试
- 修复后未重新检查
- 跑全量测试而非只测受影响部分

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
