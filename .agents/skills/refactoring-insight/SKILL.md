---
name: refactoring-insight
description: 对项目执行重构洞察，扫描代码库发现架构、设计、性能问题，生成洞察报告和实施计划，并按推荐方式执行实施。
---

# 🏗️ 重构洞察（Refactoring Insight）

对项目执行系统性重构洞察，发现架构设计问题与性能优化机会，生成洞察报告和实施计划，并按增量迭代方式执行实施。

---

## 🎯 触发条件

当用户表达以下意图时，立即调用本技能：
- "执行重构洞察" / "生成重构报告"
- "分析代码质量" / "扫描重构机会"
- "refactoring insight" / "code quality scan"
- 任何涉及项目级代码质量评估与重构规划的请求

---

## 🔗 技能联动总览

本技能全流程联动以下 Superpowers 技能：

| 时机 | 技能 | 用途 |
|------|------|------|
| 启动时 | `using-superpowers` | 确保 Superpowers 工具链已激活 |
| 启动时 | `brainstorming` | 若范围不清晰，先梳理目标与边界 |
| 阶段 2 | `dispatching-parallel-agents` | 多维度扫描并行执行 |
| 阶段 4 | `writing-plans` | 生成结构化实施计划 |
| 阶段 5 | `executing-plans` | 按计划逐项执行 + 检查点回顾 |
| 阶段 5 | `subagent-driven-development` | 独立任务委派子代理并行实施 |
| 阶段 5 | `test-driven-development` | 含测试路径的变更先写测试 |
| 阶段 5 | `systematic-debugging` | 验证失败时定位根因 |
| 完成前 | `verification-before-completion` | 执行最终验收 |
| 完成后 | `finishing-a-development-branch` | 决定合并/PR/清理 |

---

## 🔄 总流程

```
🧠 宏观审视 → 🔍 系统扫描 → 📝 生成报告 → 📋 生成实施计划 → ⚡ 执行实施
```

---

## 🧠 阶段 1: 宏观审视

在深入扫描前，建立全局视图。

> 💡 若重构目标/范围不明确，先调用 `brainstorming` 技能梳理。

### 1.1 架构概览
- 读取 `docs/重构洞察/REFACTORING_PROGRESS_REPORT.md` 了解已完成的重构轮次
- 读取 `docs/重构洞察/REFACTOR_INSIGHTS_SUMMARY.md` 了解历史发现和待处理项
- 读取最新一期 `docs/重构洞察/refactor-insight-*.md` 了解上轮发现和遗留问题
- 检查 `.agents/rules/` 中相关规则文件了解当前架构约束

### 1.2 宏观统计
- 统计各子目录文件数量和大文件分布（>500 行、>1000 行）
- 识别 `frontend/src/` 中 >800 行的组件文件和 >300 行的 Hook 文件
- 识别 `src-tauri/src/commands/` 和 `crates/` 中 >80 行的函数
- 识别 `crates/` 中 crate 规模和依赖关系
- 统计 CSS 大文件（>1000 行）和 `!important` 使用量

### 1.3 宏观问题识别
- 是否存在上次洞察遗留的未处理项
- 是否存在违反架构约束的模块（层级越界、crate 依赖倒置）
- 是否存在新引入的膨胀组件/函数/文件

---

## 🔍 阶段 2: 系统扫描

> ⚡ 前端/Rust/CSS/跨领域四个扫描维度无依赖，可调用 `dispatching-parallel-agents` 并行执行。

### 2.1 前端 TypeScript/React
| 扫描项 | 方法 | 阈值 |
|--------|------|------|
| 大组件文件 | 统计 `.tsx` 文件行数 | >800 行 |
| 大 Hook 文件 | 统计 `use*.ts` 文件行数 | >300 行 |
| 重复 JSX | 扫描重复渲染块 | 可提取为组件 |
| 多组状态 | 扫描组件中 `useState` 数量 | >5 组提取 Hook |
| 深层相对导入 | 扫描 `'../../'` 模式 | 改用 `@` 别名 |
| 硬编码字符串 | 扫描非 i18n UI 文本 | 替换为 i18n key |
| `console.log` 残留 | 扫描调试日志 | 清理 |
| 选择器未 useShallow | 扫描 `useAppStore` 调用 | 加 useShallow |
| React.memo 缺失 | 扫描列表项组件 | 加 memo |

### 2.2 Rust 后端
| 扫描项 | 方法 | 阈值 |
|--------|------|------|
| 大函数 | 扫描函数体长度 | >80 行 |
| 多余 clone | 扫描 `String` 参数仅引用传递 | 改 `&str` |
| 大 lib.rs | 扫描 `crates/*/src/lib.rs` 行数 | >300 行模块化 |
| unwrap/expect | 扫描错误处理 | 改 `?` 或 Result |
| Mutex | 扫描 `std::sync::Mutex` | 评估是否改 RwLock |

### 2.3 CSS 样式
| 扫描项 | 方法 | 阈值 |
|--------|------|------|
| 大 CSS 文件 | 统计 `.css` 文件行数 | >1000 行拆分 |
| `!important` 滥用 | 统计声明数量 | >10 处/文件 |
| 硬编码颜色 | 扫描 hex/rgb/hsl（排除 CSS 变量定义） | 替换为 `var(--...)` |
| `transition: all` | 扫描该模式 | 替换具体属性 |
| 死 CSS | 扫描孤立 CSS 文件 | 删除 |

### 2.4 跨领域
| 扫描项 | 方法 |
|--------|------|
| 桥接层对齐 | 检查 `tauri-bridge.ts` / `preview-bridge/` / `mock-bridge.ts` 签名一致性 |
| IPC 契约 | 检查 `shared/ipc.ts` 与实际实现一致性 |
| 死代码 | 搜索 `@deprecated`、导出未使用的函数/类型 |
| Store 膨胀 | 检查各 slice 文件行数，>500 行拆分 |

> 📌 扫描结果超过输出限制时，按目录分批扫描，汇总后合并分析。

---

## 📝 阶段 3: 生成洞察报告

### 输出文件
`docs/重构洞察/refactor-insight-YYYY-MM-DD.md`（目录不存在则自动创建）

### 报告模板
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

### 🏷️ 优先级判定
| 优先级 | 标准 |
|--------|------|
| 🔴 高 | 功能正确性影响、架构严重违规、超大文件/函数（>1000 行）、大量重复代码 |
| 🟡 中 | 组件/函数超标未达临界、CSS 规范违规、性能可优化非瓶颈 |
| 🟢 低 | 代码风格改进、次要清理 |

---

## 📋 阶段 4: 生成实施计划

调用 `writing-plans` 技能生成结构化实施计划文档。

### 输出文件
`docs/重构洞察/refactor-plan-YYYY-MM-DD.md`

### 计划模板
```markdown
# 📋 重构实施计划 – YYYY-MM-DD

## 执行顺序
按优先级排序，同优先级按"最小变更→最大变更"：

| 序号 | 任务 | 优先级 | 变更范围 | 预计影响 |
|------|------|--------|----------|----------|
| 1 | 描述 | 🔴 | 单文件 | 低风险 |

## 执行原则
1. 先小后大：优先执行单文件低风险变更
2. 每步验证：每项变更后立即类型检查 + 测试
3. 不破坏功能：不改变 UI/UX 行为
4. 失败即停：任一步骤失败，停止分析原因
```

---

## ⚡ 阶段 5: 执行实施

### 流程
```
逐项执行 → 每项验证 → 更新进度 → 清理收尾
```

### 5.1 逐项执行

根据任务特性选择执行方式：

| 场景 | 推荐方式 |
|------|----------|
| 单文件、低风险变更 | 直接执行，调用 `executing-plans` 按检查点推进 |
| 多个独立任务 | 调用 `subagent-driven-development` 委派子代理并行处理 |
| 含测试覆盖的变更 | 调用 `test-driven-development` 先写测试后改代码 |
| 验证失败（3 次后） | 调用 `systematic-debugging` 定位根因，不猜修复 |

每项变更执行步骤：
1. **执行前**：读取目标文件，确认当前状态
2. **执行变更**：最小变更原则
3. **执行后验证**：根据变更类型运行对应检查命令（见 `commands.md`）

### 5.2 更新进度
- `docs/重构洞察/REFACTORING_PROGRESS_REPORT.md` 追加本轮记录（格式：`| 第N轮 | YYYY-MM-DD | 内容摘要 | ✅ |`）
- `docs/重构洞察/REFACTOR_INSIGHTS_SUMMARY.md` 追加摘要

### 5.3 结束验收
1. 调用 `verification-before-completion` 技能执行最终验证
2. 确认无残留调试日志
3. 执行最终四维门禁（ESLint / Prettier / Clippy / rustfmt）
4. 涉及 CSS/UI 变更的，调用 `dogfood` 技能进行视觉验证
5. 若需提交成果，调用 `finishing-a-development-branch` 决策合并/PR/清理

---

## ⛔ 约束

| 约束 | 说明 |
|------|------|
| 核心原则 | 所有修改不得破坏现有功能效果及 UI/UX |
| 最小变更 | 仅修复发现的问题，不做无关变更 |
| 禁止跨 Phase | 不引入超出当前 Phase 范围的功能或架构变更（见 `phase-boundary.md`） |
| 禁止猜测 | 无法定位根因时使用调试日志而非猜测性修复 |
| 验收强制 | 全部变更完成后执行结束验收流程（见 `mandatory-testing.md`） |

---

## 📎 相关文件

| 文件 | 用途 |
|------|------|
| `docs/重构洞察/refactor-insight-*.md` | 每日洞察报告 |
| `docs/重构洞察/refactor-plan-*.md` | 每日实施计划 |
| `docs/重构洞察/REFACTORING_PROGRESS_REPORT.md` | 累计进度报告 |
| `docs/重构洞察/REFACTOR_INSIGHTS_SUMMARY.md` | 洞察汇总索引 |
| `.agents/rules/phase-boundary.md` | 阶段边界约束 |
| `.agents/rules/mandatory-testing.md` | 验收流程 |
| `.agents/rules/component-architecture.md` | 组件拆分阈值 |
| `.agents/rules/css-architecture.md` | CSS 架构约束 |
| `.agents/rules/rust-patterns.md` | Rust 模式约束 |
| `.agents/rules/commands.md` | 项目命令参考 |
| `docs/知识沉淀/重构/` | 重构经验沉淀 |