---
description: Agent interaction workflow, code modification rules, terminal command execution, and decision-making protocol
alwaysApply: true
---

# 代理交互与执行规则

## 决策前置

在修改代码前，先评估任务是否合理可行。若存在不合理、无法实现或基于错误理解的情况，先指出并说明，而非直接执行。

## 结束验收流程

代码变更完成后，**必须自动触发结束验收流程**。完整的验收流程定义见 [mandatory-testing.md](./mandatory-testing.md)，包括：

- 变更层级评估与测试范围确定
- 测试材料检查与自动生成
- ESLint/Prettier/Clippy/rustfmt 检测修复
- 类型检查与测试执行
- 结果处理与失败升级机制

Agent 在完成任何代码修改、Bug 修复、新功能实现或重构后，必须自动执行该流程，**不得跳过**。

## 询问卡片机制

遇到以下情况时，主动弹出询问卡片：

| 触发条件 | 示例 |
|----------|------|
| 需求模糊 | 优化性能 → 具体优化哪个模块，目标是什么 |
| 多方案并存 | 合并方式：squash / rebase / merge |
| 潜在风险 | 修改共享模块影响多个功能 |
| 理解不确定 | 需求中的术语所指不明确 |
| 测试材料不足 | 无法从现有类型定义推断出合理测试数据 |

询问需列出选项与利弊，明确需要用户决策或补充的信息。

## 终端命令规则

1. **超时监控**：所有命令设置合理超时，检测并处理无响应进程
2. **预检环境**：执行前检查代理状态、网络连通性及应用影响，必要时提醒手动干预
3. **校验容错**：校验命令语法与参数；失败时进行错误处理与恢复
4. **性能反馈**：优化慢速命令（如使用镜像源），长操作显示进度
5. **持续增强**：评估并改进执行框架，处理意外边缘情况

## 代码修改规则

### 核心原则

所有修改不得破坏现有功能以及 UI/UX。

### i18n 全覆盖

所有 UI 展示文本必须使用 i18n key，禁止硬编码中英文：
- 按钮标签、Tooltip、aria-label、占位符、空状态、加载状态、错误提示
- 过滤器标签、卡片内容、相对时间、日期格式
- 条件渲染中的标签映射（如 sectionLabels 对象）

工具函数内包含展示文本的必须支持 locale 感知（接受 locale 参数）。过滤器/列表定义必须在组件函数体内（在 `useTCopy()` 之后）以访问 `t` 对象。语言切换时标题行/路径栏的渲染条件必须使用稳定性 fallback（优先使用 `activeCiWorkspaceId` 等稳定 store ID，而非易变列表）。

### 影响评估

变更前：
1. 识别涉及模块与依赖
2. 设计完整测试用例，覆盖相关功能路径
3. 评估对双端一致性（Tauri / 浏览器模式）的影响

### 风险把控

确保变更是经充分论证的正向改进，满足以下至少一项：
- 提升性能
- 增强安全性
- 改善可维护性
- 优化用户体验

满足条件后方可实施。

## 问题排查规范

### 根因优先

排查问题时，**先定位根本原因**，不要急于添加预防措施/防御性代码/解决方案。仅在确认不存在根本因素（或无法定位）后，方可补充。所有新增的预防/防御/解决方案必须**真实有效**，杜绝任何无效或不必要的措施。

### 无法定位根因时的调试手段

无法定位根因时，不要凭空猜测。按以下优先级执行：

1. **调试日志收起器**（最高优先级）：在代码中添加 `console.log/warn/error/info/debug` 输出调试信息（无需特殊前缀）。应用启动后通过右上角"复制调试日志"按钮查看，或直接查看项目根目录日志文件（Tauri 模式 `debug-logs.txt`，浏览器模式 `debug-logs-browser.txt`）。控制台可执行 `__clearDebugLogs()` 清除旧日志，`__exportDebugLogs()` 手动导出。
2. **复制调试日志**：引导用户通过界面上的"复制调试日志"按钮获取调试信息。
3. **其他调试手段**：在前述方式不可行时，采用合适的替代调试方案。

详见 [AGENTS.md](../../AGENTS.md#调试工具)。

## 编码风格规范

### TypeScript 风格
- **禁止 `any`**：使用精确类型，善用 `unknown` 和 type guard
- **类型推断优先**：避免不必要的显式类型注解或接口定义
- **禁止 `else`**：使用提前返回模式
- **`const` 优先**：禁止 `let` 重赋值，用三元/提前返回替代
- **禁止 import 别名**：不使用 `import { foo as bar }`
- **禁止 star import**：不使用 `import * as Foo`
- **避免不必要的解构**：使用点号保持上下文
- **函数式方法**：`flatMap`、`filter`、`map` 优先于 `for` 循环
- **减少中间变量**：内联仅使用一次的值，不预提取单次使用的 helper
- **Happy Path 模式**：主函数保持 happy path，验证逻辑提取为下方小 helper

### Rust 风格
- 遵循 `rustfmt` 默认配置
- **禁止 `unwrap()`**：使用 `?` 运算符或模式匹配
- 错误类型使用 `thiserror` + `AppError` 统一处理

### Commit 与分支规范
- **分支命名**：kebab-case，最多 3 个单词，禁止斜杠/类型前缀
- **Commit 信息**：`type(scope): summary`（feat/fix/docs/chore/refactor/test）
- Scope 选项：`core` / `frontend` / `rust` / `stores` / `browser` / `terminal` / `ipc` / `docs` / `deps`

## 相关文件

- [mandatory-testing.md](./mandatory-testing.md) — 测试要求 / 结束验收流程
- [quality-gates.md](./quality-gates.md) — 质量门禁
- [error-handling.md](./error-handling.md) — 错误处理
