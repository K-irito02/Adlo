# AI 数字生命 - 项目治理规则

## 项目定位

本仓库是 AI 数字生命项目的规划与治理工作区。根目录以文档和架构设计为主，`ai-digital-life/` 是基于 **Rust + Tauri 2.x** 的桌面应用实现工作区。

## 双根结构

| 目录 | 职责 |
|------|------|
| 仓库根目录 | 规划与治理：`AGENTS.md`、`docs/`、`CONTRIBUTING.md`、`CONTEXT.md`、`SECURITY.md` |
| `ai-digital-life/` | 实现工作区：Rust + Tauri 桌面应用 + WebView 前端 |
| `references/` | 外部参考源码（本地拉取的开源项目，供开发参考与复用） |

## 源码地图与代码知识图谱

| 参考项 | 说明 |
|------|------|
| 源码地图 (ADL) | [docs/analysis/ai-digital-life/](./docs/analysis/ai-digital-life/)（本项目的渐进式索引） |

> **代码知识图谱**：`ai-digital-life/` 配置了 [CodeGraph](https://github.com/colbymchenry/codegraph)（MIT 许可）本地知识图谱（项目根 `.codegraph/`，SQLite）。查询、检索代码时优先使用 `codegraph_*` MCP 工具或 `codegraph` CLI，详见技能 [`codegraph-knowledge-graph`](./.opencode/skills/codegraph-knowledge-graph/SKILL.md)。
>
> 参考代码直接复用需遵守 MIT 许可要求，并在代码注释中标注来源。

## 项目形态（完整形态，不分阶段）

本项目不做分阶段规划，当前实现即所规划的完整形态：**桌面应用宿主 + 第三方 Agent harness 集成**。Agent 对话、模型接入与编排能力不由本仓库实现，交由接入的第三方 harness（当前为 deepseek dsh）提供，本仓库仅负责宿主集成（进程托管、版本管理、宿主渲染）。

技术栈详情与已实现功能清单见 [ai-digital-life/AGENTS.md](./ai-digital-life/AGENTS.md)。范围边界与排除项见 [phase-boundary.md](.agents/rules/phase-boundary.md)。

## 重构历史

共完成 **93 轮**迭代重构，完整记录见 [REFACTORING_PROGRESS_REPORT.md](./docs/refactoring-insight/report/progress/REFACTORING_PROGRESS_REPORT.md)。

## 问题排查与调试

排查问题时**先定位根本原因**，不要急于添加预防措施/防御性代码/解决方案。无法定位根因时，使用调试日志收起器（最高优先级）、复制调试日志按钮等调试手段，**禁止凭空猜测**。

调试工具详情（日志收起器、复制按钮、自动写入等）见 [ai-digital-life/AGENTS.md#调试工具](./ai-digital-life/AGENTS.md#调试工具)，排查规范见 [dev-rules.md](.agents/rules/dev-rules.md#问题排查规范)。

## 磁盘空间

`ai-digital-life/target/debug` 曾因依赖 `debug=2` 全量调试符号累积至 **130+ GB**（`.pdb` 97 GB），现已治理：第三方依赖 `debug=1`（自己 crate 白名单保留 `debug=2` 可断点调试）。

**清理策略（空间阈值触发全量清理，见 [ai-digital-life/AGENTS.md#磁盘空间管理](./ai-digital-life/AGENTS.md#磁盘空间管理)）：**
- 空间条件：`ai-digital-life/target/debug` 超过 30 GB → 全量清理

超过阈值即运行 `ai-digital-life/.cargo/clean-target.ps1` 执行 `cargo clean` 全量删除（不按时间窗口判断；`-WhatIf` 干跑预览，`-Full` 强制全清）。`cargo prune` 为 `cargo clean` 别名。删除为**永久删除**：直接物理删除构建产物，**不进入回收站/垃圾箱**，无需清空回收站。

## 禁止项

- WebView 直接触达系统能力（必须通过 Tauri Command）
- 低层 crate 依赖高层 crate
- 凭据写入普通配置或日志（必须通过 `crates/credential/` 存储）
- UI/UX 或功能变更后跳过红绿测试
- 在 capability 文件中使用 `"all"` / `"**"` 通配权限
- 功能或显示效果仅在 Tauri 或浏览器单一模式下可用（必须双端一致）
- WebView URL 变化被动触发 Tauri navigateTab（必须由前端发起操作显式调用，见 `browserpanel.tsx:submitAddress`、`BrowserPanelActionsContext.ts:handleOpenTabFromTree`）
- 任何 UI 展示文本硬编码（包括但不限于按钮/Tooltip/aria-label/占位符/过滤器标签/相对时间/日期格式/面包屑标签映射），必须使用 i18n key
- 语言切换时依赖 Zustand store 易变数据的渲染条件缺少 fallback 导致标题行/路径栏消失
- 错误提示/状态提示常驻显示（必须仅在活跃错误状态下可见）
- 调试日志（`console.log`/`[ADL-DEBUG]`）遗留生产代码不清理
- iframe 嵌入缺少前置检测（必须使用 checkEmbed HEAD 预检 + 同步 ref 门控 + 基于 attachShadow mode:closed 的 SafeIframe 沙箱保护，标准 `<iframe>` JSX 会导致 React DevTools 跨域 SecurityError）
- Tauri 桌面模式下依赖 CSS z-index 覆盖浏览器原生 WebView（WebView2 是 OS 级渲染表面。浮动菜单/对话框出现时：必须通过 `browser_set_bounds` 移出画面，使用 State + MutationObserver 双路检测协同。面板 Resize Handle 被覆盖时：采用"区域逃逸"方案——handle 向左扩展 8px 进入中心区域（无 WebView），无需 IPC 干预）
- 未发布产品的开发阶段禁止添加/保留数据格式兼容或旧版本迁移代码（产品发布后需添加时须先与用户确认）
- 禁止「向后兼容」重导出或类似仅为旧导入路径保留的兼容层
- 未经用户允许禁止擅自使用蓝色（含 `var(--accent)` 系）作为特殊提示警醒色、填充色等；此类场景一律使用白/灰/黑中性色（明度/纯度自行设计，须兼顾亮暗主题可见性），需其它颜色时先与用户确认（规范见 `.agents/rules/hint-color-usage.md`）

## 双端一致性

所有功能必须在 **Tauri 桌面应用** 和 **浏览器模式** 中保持**功能行为一致**。由于两种模式的运行环境不同（Tauri 有 Rust 后端 + SQLite + 系统 API，浏览器仅有 WebView + Web API），实现策略可以因环境而异：

- **功能行为必须一致**：用户可感知的输入→输出、交互流程、数据结果在两种模式下相同
- **实现策略可以不同**：存储后端（SQLite vs IndexedDB）、系统能力（原生对话框 vs Web API）、性能特征等可因环境采取不同技术方案
- **统一接口抽象**：通过接口（如 `TerminalOutputStore`、`PreviewBridge`）隔离环境差异，消费端不感知底层实现
- **新增 IPC 方法必须同步实现** `tauri-bridge.ts` / `preview-bridge/` / `mock-bridge.ts`

> **示例**：终端输出持久化 — Tauri 模式使用 SQLite，浏览器模式使用 IndexedDB，两者通过统一的 `TerminalOutputStore` 接口提供相同的功能行为。

## 编码规范

### 分支命名
- 使用短横线分隔（kebab-case），最多 3 个单词
- 禁止斜杠、禁止类型前缀（如 `feat/`、`fix/`）
- 示例：`session-recovery`、`fix-scroll-state`、`browser-panel-fix`

### Commit 与 PR 标题
使用 Conventional Commit 风格：`type(scope): summary`

| 类型 | 用途 | 示例 |
|------|------|------|
| `feat` | 新功能 | `feat(session): add message streaming` |
| `fix` | Bug 修复 | `fix(browser): resolve crash on navigate` |
| `docs` | 文档变更 | `docs: update contributing guide` |
| `chore` | 维护任务 | `chore(deps): bump tauri version` |
| `refactor` | 重构 | `refactor(stores): extract browser slice` |
| `test` | 测试 | `test(workspace): add tree parsing` |

Scope 可选项：`core`、`frontend`、`rust`、`stores`、`browser`、`terminal`、`ipc`、`docs`、`deps` 等。

TypeScript/Rust 风格指南、Commit 规范详见 [dev-rules.md](.agents/rules/dev-rules.md)。

测试规范详见 [mandatory-testing.md](.agents/rules/mandatory-testing.md)。

## 相关文档

- [ai-digital-life/AGENTS.md](./ai-digital-life/AGENTS.md) — 实现工作区治理（技术栈、功能清单、Stores 架构）
- [FUTURE-ROADMAP.md](./FUTURE-ROADMAP.md) — 未来想法（非分阶段规划）
- [CONTRIBUTING.md](./CONTRIBUTING.md) — 贡献指南
- [CONTEXT.md](./CONTEXT.md) — 领域术语表
- [SECURITY.md](./SECURITY.md) — 安全策略
- [docs/development/project-engineering-constraints.md](./docs/development/project-engineering-constraints.md) — 工程约束
- [docs/knowledge-base/README.md](./docs/knowledge-base/README.md) — 经验教训与总结索引
