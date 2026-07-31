# AI 数字生命 - 项目治理规则

## 项目定位

本仓库是 AI 数字生命项目的规划与治理工作区。根目录以文档和架构设计为主，`ai-digital-life/` 是基于 **Rust + Tauri 2.x** 的桌面应用实现工作区。

## 双根结构

| 目录 | 职责 |
|------|------|
| 仓库根目录 | 规划与治理：`AGENTS.md`、`docs/`、`CONTRIBUTING.md`、`CONTEXT.md`、`SECURITY.md` |
| `.agents/` | AI 代理配置真源（`rules/` 规则源目录、`skills/` 技能备份、`.skill-lock.json` 锁定文件） |
| `.trae/` | TRAE IDE 集成（`rules/` 规则同步副本、`skills/` 技能同步副本） |
| `.opencode/` | OpenCode IDE 集成（`rules/` 规则同步副本、`skills/` 技能真源目录） |
| `.superpowers/` | Superpowers 框架本地配置 |
| `ai-digital-life/` | 实现工作区：Rust + Tauri 桌面应用 + WebView 前端 |
| `references/` | 外部参考源码（本地拉取的开源项目，供开发参考与复用） |

## 参考项目

本项目的多项架构设计、编码模式与功能实现参考了 [OpenCode](https://github.com/anomalyco/opencode)（MIT 许可）开源项目。本地副本位于 `references/opencode/`，用于开发过程中查阅源码、借鉴设计模式与复用代码片段。

| 参考项 | 说明 |
|------|------|
| 本地路径 | `references/opencode/`（Git 子模块或手动拉取，不参与本项目构建） |
| 上游仓库 | [github.com/anomalyco/opencode](https://github.com/anomalyco/opencode) |
| 许可 | MIT |
| 源码地图 (OpenCode) | [docs/analysis/opencode/](./docs/analysis/opencode/)（渐进式索引 — 快查/总览/架构/包索引/功能深度/编码模式/差距分析） |
| 源码地图 (ADL) | [docs/analysis/ai-digital-life/](./docs/analysis/ai-digital-life/)（本项目的渐进式索引） |

> 参考代码直接复用需遵守 MIT 许可要求，并在代码注释中标注来源。

## 当前阶段

| Phase | 状态 | 范围 |
|-------|------|------|
| Phase 0 | ✅ 已完成 | 架构底座、桌面壳层、安全边界、基础设施 |
| Phase 1 | ✅ 已完成 | 交互式 MVP、模型接入、上下文、变更预览 |
| Phase 2 | ✅ 已完成 | 完整 18 项缺失能力实现 — 多 Agent / MCP / 多 Provider / Compaction / Snapshot-Revert / WebFetch-WebSearch / 自定义命令 / 权限 Ruleset / Session Fork / LSP / Plugin / Reference / Custom Agent / Hot Reload / Durable Session |
| Phase 2 增强 | ✅ 已完成 | Provider 动态注册系统（ProviderRegistry）、(provider, model) 对路由、SSE 真实流式传输、ModelPicker UI、ProviderManager 管理面板、动态模型获取 |

技术栈详情与已实现功能清单见 [ai-digital-life/AGENTS.md](./ai-digital-life/AGENTS.md)。

> Phase 2 已于 2026-07-06 完成。Phase 2 增强（Provider 动态注册、模型选择路由、SSE 流式传输）于 2026-07-07 完成。截至 2026-07-31：工具链 rustc 1.97.1，581 Rust 测试、882 前端测试。最新计数请运行 `cargo test --workspace` 与 `pnpm --dir frontend run test`。
>
> 质量检查：`cargo clippy --workspace --all-targets -- -D warnings`（0 警告）、`pnpm --dir frontend run lint`（0 errors，若干 pre-existing warnings，主要为 prettier/curly 与 react-hooks/exhaustive-deps）。

## 重构历史

共完成 **93 轮**迭代重构，完整记录见 [REFACTORING_PROGRESS_REPORT.md](./docs/refactoring-insight/report/progress/REFACTORING_PROGRESS_REPORT.md)。

## 代理开发规则

规则文件真源位于 `.agents/rules/`（AI 代理直接读取），自动同步到 `.opencode/rules/` 和 `.trae/rules/`。全部规则索引见 [README.md](./.agents/rules/README.md)。必须遵守的规则：

> ⚠ **注意**：`.agents/rules/` 是规则文件的真源（Git 跟踪），`.opencode/rules/` 和 `.trae/rules/` 是同步副本。修改规则请在 `.agents/rules/` 操作。

- [dev-rules.md](.agents/rules/dev-rules.md) — 交互与执行规则（询问卡片、终端命令、代码修改、问题排查）
- [mandatory-testing.md](.agents/rules/mandatory-testing.md) — 强制红绿测试
- [quality-gates.md](.agents/rules/quality-gates.md) — 质量门禁
- [error-handling.md](.agents/rules/error-handling.md) — 错误处理规范

## 问题排查与调试

排查问题时**先定位根本原因**，不要急于添加预防措施/防御性代码/解决方案。无法定位根因时，使用调试日志收起器（最高优先级）、复制调试日志按钮等调试手段，**禁止凭空猜测**。

调试工具详情（日志收起器、复制按钮、自动写入等）见 [ai-digital-life/AGENTS.md#调试工具](./ai-digital-life/AGENTS.md#调试工具)，排查规范见 [dev-rules.md](.agents/rules/dev-rules.md#问题排查规范)。

## 磁盘空间

Rust 增量编译缓存 `target/debug/incremental/` 每次编译创建新会话，**永不自动清理**，可达 20~40 GB。运行 `ai-digital-life/.cargo\clean-incremental.ps1` 保留 7 天内会话。详见 [ai-digital-life/AGENTS.md#磁盘空间管理](./ai-digital-life/AGENTS.md#磁盘空间管理)。

## 禁止项

- WebView 直接触达系统能力（必须通过 Tauri Command）
- 低层 crate 依赖高层 crate
- 凭据写入普通配置或日志（必须通过 `crates/credential/` 存储）
- 混合使用多种 Tooltip 方案（例外：纯文本路径展示可使用原生 `title`，见 [ui-patterns.md](./.agents/rules/ui-patterns.md#9-tooltip)）
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

## 双端一致性

所有功能必须在 **Tauri 桌面应用** 和 **浏览器模式** 中保持一致。新增 IPC 方法必须同步实现 `tauri-bridge.ts` / `preview-bridge/` / `mock-bridge.ts`。

## Superpowers 技能系统

### 插件安装

Superpowers v6.0.3 通过全局 opencode.json 安装为插件：
```json
"plugin": ["~/.config/opencode/node_modules/superpowers"]
```
插件提供 14 个核心技能（自动注入 bootstrap）和工具映射适配。

更新命令：
```powershell
npm install superpowers@git+https://github.com/obra/superpowers.git --prefix "$HOME\.config\opencode"
```

### 规则目录结构

| 目录 | 职责 | 同步关系 |
|------|------|----------|
| `.agents/rules/` | 规则真源（Git 跟踪） | → `.trae/rules/` |
| `.opencode/rules/` | OpenCode 规则副本（从 `.agents/rules/` 手动同步） | ← `.agents/rules/` |
| `.trae/rules/` | TRAE 规则副本（从 `.agents/rules/` 手动同步） | ← `.agents/rules/` |

> **同步维护**：修改规则请在 `.agents/rules/` 操作，然后手动同步到 `.opencode/rules/` 和 `.trae/rules/`。

### 技能目录结构

| 目录 | 职责 | 技能数量 |
|------|------|----------|
| `.opencode/skills/` | 源目录（真源） | 26 |
| `.agents/skills/` | 同步备份 | 26 |
| `.trae/skills/` | 同步备份 | 26 |

**同步规则**：`.opencode/skills/` 是真源，修改后需同步到 `.agents/skills/` 和 `.trae/skills/`。

### 技能分类

**Superpowers 核心技能**（14 个，插件提供，本地副本用于跨 IDE 兼容）：

| 技能 | 用途 | 触发场景 |
|------|------|----------|
| `using-superpowers` | 技能系统入口，规定技能调用规范 | 对话开始时自动触发 |
| `brainstorming` | 头脑风暴与需求发散 | 新功能规划、创意任务 |
| `writing-plans` | 计划撰写与评审 | 多步骤任务实施前 |
| `executing-plans` | 计划执行与检查点 | 按计划分步实施 |
| `test-driven-development` | 测试驱动开发 | 新功能开发、Bug 修复 |
| `systematic-debugging` | 系统化调试 | Bug 排查与根因分析 |
| `subagent-driven-development` | 子代理驱动开发 | 大型任务拆解与并行 |
| `dispatching-parallel-agents` | 并行代理调度 | 独立任务并行执行 |
| `requesting-code-review` | 请求代码审查 | 功能完成后、合并前 |
| `receiving-code-review` | 接收代码审查反馈 | 收到审查意见后 |
| `verification-before-completion` | 完成前验证 | 任务收尾、验收前 |
| `finishing-a-development-branch` | 开发分支收尾 | 分支合并前 |
| `using-git-worktrees` | Git 工作树使用 | 并行开发、隔离工作区 |
| `writing-skills` | 技能创作 | 新增/修改技能 |

**项目定制技能**（12 个）：

| 技能 | 用途 |
|------|------|
| `browser-automation` | 浏览器自动化测试 |
| `closing-workflow` | 工作结束后收尾流程（日志审查、代码审查循环、质量检测、文档同步、项目清理） |
| `documentation-organizer` | 文档目录整理 |
| `dogfood` | 内部试用与问题发现 |
| `find-skills` | 技能发现与安装 |
| `frontend-design` | 前端界面设计 |
| `learn` | 代码库模式学习与规则自动生成 |
| `refactoring-insight` | 重构洞察 |
| `root-cause-resolution` | 根因解决方案（根因→方案设计→日志验证→外部调研→清理，衔接 systematic-debugging） |
| `run-project-surfaces` | 启动项目预览 |
| `skill-creator` | 技能创建工具 |
| `ui-ux-pro-max` | UI/UX 设计专家 |

### 使用规范

1. **技能优先**：收到用户请求后，先判断是否有相关技能可用，有则先调用技能再行动
2. **入口技能**：`using-superpowers` 是技能系统入口，对话开始时优先触发
3. **流程顺序**：过程类技能（brainstorming、systematic-debugging 等）先于实现类技能调用
4. **用户指令优先**：用户明确指示不使用某技能时，以用户指令为准

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
- [FUTURE-ROADMAP.md](./FUTURE-ROADMAP.md) — 远期规划
- [CONTRIBUTING.md](./CONTRIBUTING.md) — 贡献指南
- [CONTEXT.md](./CONTEXT.md) — 领域术语表
- [SECURITY.md](./SECURITY.md) — 安全策略
- [docs/development/project-engineering-constraints.md](./docs/development/project-engineering-constraints.md) — 工程约束
- [docs/knowledge-base/README.md](./docs/knowledge-base/README.md) — 经验教训与总结索引