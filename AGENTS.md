# AI数字生命 项目级开发 Agent 规则

## 项目定位

本仓库当前是 `AI数字生命` 项目的规划、治理与实现设计工作区。根目录以文档和架构设计为主，`ai-digital-life/` 是基于 **Rust + Tauri 2.x** 的桌面应用代码工作区。

主Agent需要同时服务两类工作：

1. 当前仓库内的文档、规划、实施方案维护
2. `ai-digital-life` Rust + Tauri 桌面应用代码工作区的架构与实现约束

## 技术栈基线（重要）

- **后端**：Rust（stable 通道）+ Tauri 2.x + tokio + rusqlite + serde + tracing
- **前端**：React 19 + Vite + Zustand（运行在 Tauri WebView 中）
- **桥接**：`#[tauri::command]` + `@tauri-apps/api` 的 `invoke()` / `listen()`
- **打包**：`cargo tauri build`（取代 electron-builder）
- **包管理**：Rust 端 Cargo workspace；前端 npm/pnpm

不再使用 Electron / Node.js Main 进程 / Preload 脚本 / better-sqlite3 / chokidar / pino / electron-builder。

## Cursor 项目规则（`.cursor/rules/`）

- 持久化给 Cursor 的**分文件规则**位于 `.cursor/rules/*.mdc`：仓库结构、实现仓地图、Tauri 边界与命令安全、测试门禁，以及**如何新增与随代码更新规则**的协议。
- 修改 Tauri Command、capability、crate 结构、测试布局或阶段叙述时，请按该目录内 `notes-workspace-and-rules.mdc` 的「随项目演进」清单同步更新对应 `.mdc`，避免规则与实现漂移。

## 全局目标

- 构建桌面优先、工作区优先、任务优先的 AI 数字生命
- 先建立可运行、可恢复、可扩展、可治理的 Phase 0 底座
- 用项目级子Agent、skills 和 hooks 约束开发质量与安全边界

## Phase 边界

### 当前优先级

- Phase 0：架构底座、Tauri 壳层、安全边界、基础设施、工作区、检索、任务审批、恢复与迁移
- Phase 1：交互式 MVP，模型接入、上下文、变更预览、命令执行闭环

### 当前不允许默认引入

- 多智能体运行时自治网络
- 插件市场
- 浏览器自动化运行时
- 复杂云协作
- Phase 2+ 的重型能力被伪装成 Phase 0 必需项

## 主Agent职责

- 接收任务并判断阶段、模块、风险
- 选择最合适的子Agent
- 汇总多个子Agent的结果
- 在关键节点触发治理 hooks
- 对冲突结论进行仲裁

## 子Agent路由表


| 场景                                           | 默认路由                          |
| -------------------------------------------- | ----------------------------- |
| 新需求、规划、验收标准                                  | `product-spec` -> `architect` |
| 跨模块边界、接口、重构                                  | `architect`                   |
| Tauri、Command、Backend/WebView 边界、Capability  | `tauri-shell`                 |
| config/logger/errors/storage/migration crate | `infra-foundation`            |
| workspace/retrieval/index/search/repo-map    | `retrieval-engineer`          |
| task/approval/audit/checkpoint/风险分级          | `task-governance`             |
| 权限边界、密钥、危险写入、命令执行                            | `app-security`                |
| 单测/集成/E2E/验收矩阵                               | `test-engineer`               |
| 静态审查、设计一致性、测试缺口                              | `code-reviewer`               |
| 文档、阶段文档、开发说明                                 | `docs-maintainer`             |
| 打包、版本、迁移、发布核查                                | `release-integrator`          |
| Agent/skill/hook/manifests 一致性               | `repo-librarian`              |


## 协作限制

- 默认树状协作，不做网状自治
- 子Agent不直接推翻其它子Agent结论，由主Agent仲裁
- 单任务默认最多并行 3 个实现类 Agent
- 治理角色优先负责约束和审查，不直接承担主实现

## 强制协同规则

- 新需求默认先经过 `product-spec`
- 重要实现前必须经过 `architect`
- Tauri Command / Capability / 权限边界相关任务必须带 `tauri-shell` + `app-security`
- 高风险基础设施改动完成后必须带 `test-engineer` + `code-reviewer`
- 文档与规则更新必须由 `docs-maintainer` 或 `repo-librarian` 收口

## Hooks 策略

采用分级治理：

- 低风险：提示，不阻断
- 中风险：阻断并要求补测试/文档/架构说明
- 高风险：审批或显式确认

必须启用的治理规则：

- `phase-boundary-guard`
- `sensitive-surface-guard`
- `architecture-consistency-guard`
- `ui-foundation-guard`
- `state-persistence-guard`
- `test-requirement-guard`
- `doc-sync-guard`
- `dangerous-action-approval`
- `mandatory-testing`

## 禁止项

- WebView 直接触达系统能力（必须通过 Tauri Command）
- 低层 crate 依赖高层 crate
- 多个事件总线各自为政
- 凭据写入普通配置或日志（必须使用 OS keyring）
- 未说明 Phase 边界就引入远期能力
- 高风险改动无测试计划、无恢复说明、无审计考虑
- 使用原生 HTML `title` 属性作为 Tooltip（必须使用 `TooltipSimple` 组件；仅在 Monaco gutter 折叠控件这类第三方内部 DOM 无法稳定承载自定义 Tooltip 时，允许在受限互操作层同步本地化 `title` 作为回退，不得扩散到常规 UI 组件）
- UI/UX 或功能变更后跳过红绿测试（`cargo test` + 前端 `vitest`）
- 在 `tauri.conf.json` 或 capability 文件中使用 `"all"` / `"**"` 通配权限

## 项目级 Skills 规则

- 优先使用项目级 skills，而不是只依赖全局通用技能
- 每个子Agent默认只绑定 1-3 个项目技能
- 若项目技能与全局技能冲突，以项目技能为准
- 治理类技能优先级高于实现类技能

## 文档归口

以下变更必须同步项目文档：

- 架构边界变化
- Phase 范围变化
- Agent 路由变化
- Hook 规则变化
- 安全基线变化
- 测试门禁变化
- 国际化策略变化
- 主题系统规则变化
- 配置、持久化或恢复策略变化
- UI 组件库变更（新增/迁移组件）

详细说明见：

- [agent-topology.md](/E:/Programs/Obsidian/notes/docs/development/agent-topology.md)
- [agent-routing.md](/E:/Programs/Obsidian/notes/docs/development/agent-routing.md)
- [hook-policy.md](/E:/Programs/Obsidian/notes/docs/development/hook-policy.md)
- [project-engineering-constraints.md](/E:/Programs/Obsidian/notes/docs/development/project-engineering-constraints.md)
- [future-codebase-governance-checklist.md](/E:/Programs/Obsidian/notes/docs/development/future-codebase-governance-checklist.md)
- [rust-migration-plan.md](/E:/Programs/Obsidian/notes/ai-digital-life/docs/architecture/rust-migration-plan.md)

## 当前仓库的特殊约束

- 根目录文档是协作与治理的源事实，不能视为附属说明
- `ai-digital-life/` 的实现约束必须与根目录治理文档保持一致
- 任何 Agent 对阶段、目录、边界的修改，都必须同步文档与 manifest
- 历史 Electron 实现已废弃，所有规则与文档以 Rust + Tauri 为唯一真源
