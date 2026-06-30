---
name: refactoring-insight
description: Use when scanning a project for refactoring opportunities, code quality issues, or architecture improvements — generates insight report and executes refactoring plan
---

# 重构洞察（Refactoring Insight）

对项目执行系统性重构洞察，发现架构设计问题与性能优化机会，生成洞察报告，制定实施计划，并按计划执行重构。

**核心原则：** 所有修改不得破坏现有功能及 UI/UX。先小后大，每步验证。

---

## 触发条件

当用户表达以下意图时，立即调用本技能：
- "执行重构洞察" / "生成重构报告"
- "分析代码质量" / "扫描重构机会"
- "refactoring insight" / "code quality scan"
- 任何涉及项目级代码质量评估与重构规划的请求

---

## 技能联动总览

各阶段**固定使用**以下 Superpowers 技能：

| 阶段 | 技能 | 用途 | 必需 |
|------|------|------|------|
| 启动 | `using-git-worktrees` | 建立隔离工作区，保护主分支 | ✅ 必需 |
| 阶段 1 | `brainstorming` | 范围不明确时梳理目标与边界 | ⚡ 条件触发 |
| 阶段 2 | `dispatching-parallel-agents` | 四维度扫描并行执行 | ✅ 必需 |
| 阶段 3 | `verification-before-completion` | 验证洞察报告完整性 | ✅ 必需 |
| 阶段 4 | `writing-plans` | 生成结构化实施计划 | ✅ 必需 |
| 阶段 5A | `subagent-driven-development` | 子代理逐任务并行实施 | ✅ 模式A |
| 阶段 5A | `test-driven-development` | 含测试路径先写测试后改代码 | ✅ 模式A |
| 阶段 5A | `requesting-code-review` | 每任务完成后代码审查 | ✅ 模式A |
| 阶段 5B | `executing-plans` | 本会话批量执行 + 检查点回顾 | ✅ 模式B |
| 阶段 5 | `systematic-debugging` | 验证失败时系统化定位根因 | ⚡ 条件触发 |
| 阶段 6 | `verification-before-completion` | 最终验收 | ✅ 必需 |
| 阶段 6 | `finishing-a-development-branch` | 决策合并/PR/清理 | ✅ 必需 |

---

## 总流程

```
0️⃣ 准备工作 → 1️⃣ 宏观审视 → 2️⃣ 系统扫描 → 3️⃣ 生成报告 → 4️⃣ 制定计划 → 5️⃣ 执行实施 → 6️⃣ 结束验收
```

---

## 0️⃣ 准备工作

**固定技能：`using-git-worktrees`**

调用 `Skill` 工具 `using-git-worktrees`，在隔离工作区中执行整个洞察与重构流程，保护主分支不被污染。

> 若已在隔离工作区中，跳过创建步骤，直接进入阶段 1。

---

## 1️⃣ 宏观审视

建立全局视图，确定洞察方向。

> 💡 若重构目标/范围不明确，先调用 `brainstorming` 技能梳理。

### 1.1 架构概览
- 读取 `docs/重构洞察/REFACTORING_PROGRESS_REPORT.md` 了解已完成轮次
- 读取 `docs/重构洞察/REFACTOR_INSIGHTS_SUMMARY.md` 了解历史发现
- 读取最新 `docs/重构洞察/refactor-insight-*.md` 了解上轮遗留问题
- 检查 `.agents/rules/` 中相关规则文件了解架构约束

### 1.2 宏观统计
- 大文件分布（>500 行、>1000 行）
- `frontend/src/` 中 >800 行组件、>300 行 Hook
- `src-tauri/src/commands/` 和 `crates/` 中 >80 行函数
- CSS 大文件（>1000 行）和 `!important` 使用量

### 1.3 问题初判
- 上次洞察遗留的未处理项
- 违反架构约束的模块
- 新引入的膨胀组件/函数/文件

---

## 2️⃣ 系统扫描

**固定技能：`dispatching-parallel-agents`**

四个维度无依赖，调用 `dispatching-parallel-agents` 并行执行扫描。

### 2.1 前端 TypeScript/React
| 扫描项 | 阈值 |
|--------|------|
| 大组件文件 | >800 行 |
| 大 Hook 文件 | >300 行 |
| 重复 JSX | 可提取为组件 |
| 多组状态 | >5 组 useState |
| 深层相对导入 | `'../../'` 模式 |
| 硬编码字符串 | 非 i18n UI 文本 |
| `console.log` 残留 | 调试日志 |
| 选择器未 useShallow | `useAppStore` 调用 |
| React.memo 缺失 | 列表项组件 |

### 2.2 Rust 后端
| 扫描项 | 阈值 |
|--------|------|
| 大函数 | >80 行 |
| 多余 clone | `String` 参数仅引用传递 |
| 大 lib.rs | >300 行 |
| unwrap/expect | 错误处理不规范 |
| Mutex | 评估是否改 RwLock |

### 2.3 CSS 样式
| 扫描项 | 阈值 |
|--------|------|
| 大 CSS 文件 | >1000 行 |
| `!important` 滥用 | >10 处/文件 |
| 硬编码颜色 | hex/rgb/hsl（排除变量定义） |
| `transition: all` | 替换具体属性 |
| 死 CSS | 孤立 CSS 文件 |

### 2.4 跨领域
- 桥接层对齐（`tauri-bridge.ts` / `preview-bridge/` / `mock-bridge.ts`）
- IPC 契约一致性（`shared/ipc.ts` 与实现）
- 死代码（`@deprecated`、未使用的导出）
- Store 膨胀（>500 行的 slice）

> 📌 扫描结果超限时，按目录分批扫描，汇总后合并分析。

---

## 3️⃣ 生成洞察报告

### 输出文件
`docs/重构洞察/refactor-insight-YYYY-MM-DD.md`（目录不存在则自动创建）

### 报告结构
```markdown
# 🏗️ 重构洞察报告
**生成日期**：YYYY-MM-DD

## 1️⃣ 架构与设计
| 位置 | 问题描述 | 优化建议 | 优先级 |
|------|----------|----------|--------|
| 文件:L行/函数 | 当前状态、影响范围 | 具体方案 | 🔴 / 🟡 / 🟢 |

## 2️⃣ 性能优化
| 位置 | 问题描述 | 优化建议 | 优先级 |
|------|----------|----------|--------|

## 3️⃣ 其他发现（可选）

### 📊 本轮统计数据
| 指标 | 数值 |
|------|------|
| 前端组件/Hook 提取 | N |
| Rust 函数拆分/clone 消除 | N |
| CSS 拆分/清理 | N |
| 预测代码行变化 | +N / -N |
```

### 优先级判定
| 优先级 | 标准 |
|--------|------|
| 🔴 高 | 功能正确性影响、架构严重违规、超大文件/函数（>1000 行）、大量重复代码 |
| 🟡 中 | 组件/函数超标未达临界、CSS 规范违规、性能可优化非瓶颈 |
| 🟢 低 | 代码风格改进、次要清理 |

### 报告验证

**固定技能：`verification-before-completion`**

调用 `verification-before-completion` 技能验证报告完整性：
- 是否覆盖所有四个扫描维度
- 是否每个问题都有具体的文件位置和优化建议
- 优先级判定是否与标准一致
- 是否遗漏明显的问题模式

---

## 4️⃣ 制定实施计划

**固定技能：`writing-plans`**

调用 `Skill` 工具 `writing-plans` 生成结构化实施计划文档。

### 输入
- 洞察报告路径：`docs/重构洞察/refactor-insight-YYYY-MM-DD.md`
- 重构目标和范围
- 优先级判定结果（🔴/🟡/🟢）

### 输出
`docs/superpowers/plans/refactor-plan-YYYY-MM-DD.md`

### 执行方式选择
`writing-plans` 技能生成计划后，提供两种执行方式：
1. **Subagent-Driven（推荐）** → 进入阶段 5A
2. **Inline Execution** → 进入阶段 5B

---

## 5️⃣ 执行实施

### 5A. Subagent-Driven 模式（推荐）

**固定技能：`subagent-driven-development` + `test-driven-development` + `requesting-code-review`**

每个任务执行流程：

```
test-driven-development → 执行变更 → 验证 → requesting-code-review → 下一任务
```

1. **执行前**：调用 `test-driven-development` — 含测试路径的变更先写测试
2. **执行中**：委派子代理执行最小变更
3. **执行后验证**：运行类型检查 + 测试
4. **任务完成后**：调用 `requesting-code-review` 进行代码审查

> 💡 验证失败（3 次尝试后）：调用 `systematic-debugging` 系统化定位根因，不猜测性修复。

### 5B. Inline Execution 模式

**固定技能：`executing-plans`**

调用 `executing-plans` 技能在本会话中批量执行，带检查点回顾。

每项变更执行步骤：
1. 执行前：读取目标文件，确认当前状态
2. 执行变更：最小变更原则
3. 执行后验证：运行对应检查命令

> 💡 验证失败时同样调用 `systematic-debugging`。

### 进度追踪
- `docs/superpowers/plans/refactor-plan-YYYY-MM-DD.md` 中的 checkbox 追踪任务状态
- `docs/重构洞察/REFACTORING_PROGRESS_REPORT.md` 追加本轮记录

---

## 6️⃣ 结束验收

### 6.1 最终验证

**固定技能：`verification-before-completion`**

调用 `verification-before-completion` 技能执行最终验收：
- 类型检查通过
- 所有测试通过
- 无残留调试日志
- ESLint / Prettier / Clippy / rustfmt 四维门禁通过

### 6.2 收尾决策

**固定技能：`finishing-a-development-branch`**

调用 `finishing-a-development-branch` 技能决策：
- 合并到主分支
- 创建 PR
- 或清理工作区

---

## 约束

| 约束 | 说明 |
|------|------|
| 核心原则 | 所有修改不得破坏现有功能效果及 UI/UX |
| 最小变更 | 仅修复发现的问题，不做无关变更 |
| 禁止跨 Phase | 不引入超出当前 Phase 范围的功能或架构变更 |
| 禁止猜测 | 无法定位根因时使用 `systematic-debugging` |
| 工作区隔离 | 洞察和实施均在隔离工作区中执行 |
| 验收强制 | 全部变更完成后执行结束验收流程 |

---

## 相关文件

| 文件 | 用途 |
|------|------|
| `docs/重构洞察/refactor-insight-*.md` | 每日洞察报告 |
| `docs/superpowers/plans/refactor-plan-*.md` | 每日实施计划（由 writing-plans 生成） |
| `docs/重构洞察/REFACTORING_PROGRESS_REPORT.md` | 累计进度报告 |
| `docs/重构洞察/REFACTOR_INSIGHTS_SUMMARY.md` | 洞察汇总索引 |
| `.agents/rules/phase-boundary.md` | 阶段边界约束 |
| `.agents/rules/mandatory-testing.md` | 验收流程 |
| `.agents/rules/commands.md` | 项目命令参考 |
