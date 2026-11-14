---
description: Agent interaction workflow, code modification rules, terminal command execution, and decision-making protocol
alwaysApply: true
---

# 代理交互与执行规则

## 决策前置

在修改代码前，先评估任务是否合理可行。若存在不合理、无法实现或基于错误理解的情况，先指出并说明，而非直接执行。

## 结束验收流程

代码变更完成后，**必须自动触发结束验收流程**。流程与命令清单以 [quality-gates.md](./quality-gates.md) 为唯一真源（默认只跑受影响范围；全量需用户批准），分层与修复约束见 [mandatory-testing.md](./mandatory-testing.md)。

- 前端命令一律带目录：在 `adlo/` 执行 `pnpm --dir frontend run check:changed`；在仓库根执行 `pnpm --dir adlo/frontend run check:changed`（仓库根没有 `package.json`）。
- 全量/发布门禁（`check:full`、`check:all`、`cargo test --workspace`、`cargo tauri build`）执行前必须通知用户并获批准。
- 前端格式化配置以 `adlo/frontend/` 下的 `.prettierrc` / `.prettierignore` 为准（根目录同名文件不生效）。
- **提交遇 `.git/index.lock`**：pre-commit 会在 hook 内 `git add` 规范化后的文件，Windows 上偶发锁释放滞后。不要删锁文件；等待 3–5 秒重试同一提交，连续 3 次仍失败再报告用户。

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
6. **超时基线**：vitest 冷跑预留 ≥300s（`check:changed` 约 150s，超时设 600s）；长命令一律显式设 timeout，不依赖默认 120s
7. **安装源回退**：`pnpm install` 遇网络错误（`error 23` / `ECONNRESET`）时加 `--registry=https://registry.npmmirror.com` 重试

## 代码修改规则

### 核心原则

所有修改不得破坏现有功能以及 UI/UX。

### i18n 全覆盖

所有 UI 展示文本必须使用 i18n key，禁止硬编码中英文：
- 按钮标签、Tooltip、aria-label、占位符、空状态、加载状态、错误提示
- 过滤器标签、卡片内容、相对时间、日期格式
- 条件渲染中的标签映射（如 sectionLabels 对象）

工具函数内包含展示文本的必须支持 locale 感知（接受 locale 参数）。过滤器/列表定义必须在组件函数体内（在 `useTCopy()` 之后）以访问 `t` 对象。语言切换时标题行/路径栏的渲染条件必须使用稳定性 fallback（优先使用 `activeCiWorkspaceId` 等稳定 store ID，而非易变列表）。

### 空状态文本格式

- **禁止句号结尾**：所有空状态文字提示结尾不得有句号 "。" 或英文句点 "."
- **居中显示**：空状态文字必须在各自显示区域内水平居中
- 使用统一 `EmptyRow` 组件（`components/LoadingRow.tsx`）展示空状态

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

排查问题时，**先定位根本原因**，不要急于添加预防措施/防御性代码/解决方案。使用 `systematic-debugging` 技能进行根因调查，找到根因后用 `root-cause-to-close` 技能进行方案设计、验证与清理。仅在确认不存在根本因素（或无法定位）后，方可补充预防措施。所有新增的预防/防御/解决方案必须**真实有效**，杜绝任何无效或不必要的措施。

### 常见根因速查

| 现象 | 常见根因 | 检查方法 |
|------|---------|---------|
| 启动期窗口"未响应" | **Tauri 同步命令阻塞主线程**（文件 I/O、git 子进程等） | 检查是否有 `#[tauri::command] pub fn`（非 async）执行 I/O 操作；查看 Rust 日志中窗口消息是否有长间隙 |
| 覆盖层动画卡顿 | 主线程 CPU 争用 | 检查动画帧率日志、主线程阻塞帧 |
| 覆盖层期间加载光标 | CSS cursor 属性沿 DOM 级联 | 检查覆盖层元素的 `cursor` 计算值 |
| 浅色主题下覆盖层空白/动画不显示 | `transferControlToOffscreen()` 重复调用崩溃 | 检查 canvas 组件的 useEffect 依赖项是否包含颜色 props；主题切换时 effect 是否重新执行 |

### 无法定位根因时的调试手段

无法定位根因时，不要凭空猜测。按以下优先级执行：

1. **调试日志收起器**（最高优先级）：在代码中添加 `console.log/warn/error/info/debug` 输出调试信息（无需特殊前缀）。应用启动后通过右上角"复制调试日志"按钮查看，或直接查看日志文件（debug 构建均落 `<仓库根>/.adl-logs/`：Tauri 桌面壳 `debug-logs*.txt`、浏览器模式 `debug-logs-browser*.txt`；后端引擎另在 `<仓库根>/adlo/.adl-logs/adl-server-logs*.txt`）。控制台可执行 `__clearDebugLogs()` 清除旧日志，`__exportDebugLogs()` 手动导出。
2. **复制调试日志**：引导用户通过界面上的"复制调试日志"按钮获取调试信息。
3. **其他调试手段**：在前述方式不可行时，采用合适的替代调试方案。

详见 [adlo/AGENTS.md](../../adlo/AGENTS.md#调试工具)。

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

### 样式与组件边界
- **禁止跨 feature 复用 BEM 类名**（如 OpenCode 组复用 `.adl-dsh-settings__*`）：各自建命名空间；确实通用的控件样式放共享样式表（`styles/components/`），不要在业务样式里互借。
- **样式与组件同域**：区域样式放 `styles/regions/<feature>.css`，由 `styles/index.css` 统一 `@import`。

### Commit 与分支规范
- **分支命名**：kebab-case，最多 3 个单词，禁止斜杠/类型前缀
- **Commit 信息**：`type(scope): summary`（feat/fix/docs/chore/refactor/test）
- Scope 选项：`core` / `frontend` / `rust` / `stores` / `browser` / `terminal` / `ipc` / `docs` / `deps`
- **含特殊字符的提交信息**：用 `write` 工具把消息写到临时文件（UTF-8 无 BOM），再 `git commit -F <文件>`；shell 内联写文件（`Set-Content` / `WriteAllText` / here-string）会被权限拒绝。
- **多行或含中文标点的提交信息也走 `-F`**：这类 `git commit -m` 偶发被 shell 扫描器以
  `invalid-structure` 拒绝（2026-11-14 实测，同一条消息换 `-F` 立即通过）。被拒后不要反复重试同一条
  `-m`，直接改临时文件提交。

### 并行工作树约束
- **隔离单位**：一分支 = 一工作树 = 一会话；并发会话各自在 `SourceWorkspace-worktrees/` 下的独立工作树中开发，禁止两个会话共用同一目录
- **不跨树编辑**：禁止直接修改其他工作树的文件；跨分支协作只通过提交与合并
- **不共享构建目录**：禁止共享 `CARGO_TARGET_DIR`（dev 脚本按 exe 路径查杀进程，共享后跨槽互杀）
- **契约单写者**：IPC 四端、store slices/actions、i18n 字典、依赖与构建配置同时只允许一个会话修改
- **记忆不落分支**：分支工作树内禁止写 `.workbuddy/memory/**`（该目录被 git 跟踪，多分支并行必然冲突）
- **保留优先**：工作树默认保留（含合并后），清理须用户明确要求

完整流程（开工自检、新建 / 复用槽位、异常处置）见技能 [parallel-branch-development](../skills/parallel-branch-development/SKILL.md)（唯一真源）。

## 磁盘清理与 target 治理

构建产物由 `.cargo/config.toml` 统一治理（第三方依赖 `debug=1`，自有 crate 白名单 `debug=2`）。遵循以下规范：

1. 收尾流程（`root-cause-to-close` P6 清理阶段）执行 `powershell -File "adlo\.cargo\clean-target.ps1" -WhatIf` 干跑检查
2. 空间阈值触发全量清理：`target/debug` 超 30 GB → 执行 `clean-target.ps1` 全量 `cargo clean`（不按时间窗口判断）
3. 手动全清使用 `cargo clean`（或 `cargo prune` 别名 = `clean`）

> 上述清理均为**永久删除**：`cargo clean` / `clean-target.ps1` 直接物理删除构建产物，**不进入回收站/垃圾箱**，无需清空回收站。

## 相关文件

- [mandatory-testing.md](./mandatory-testing.md) — 测试要求 / 结束验收流程
- [quality-gates.md](./quality-gates.md) — 质量门禁
- [error-handling.md](./error-handling.md) — 错误处理