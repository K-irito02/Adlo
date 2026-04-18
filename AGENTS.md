# AI数字生命 项目级开发 Agent 规则

## 项目定位

本仓库当前是 `AI数字生命` 项目的规划、治理与实现设计工作区。根目录以文档和架构设计为主，`ai-digital-life/` 是当前实际的 Phase 0 代码工作区。

主Agent需要同时服务两类工作：

1. 当前仓库内的文档、规划、实施方案维护
2. `ai-digital-life` 桌面应用代码工作区的架构与实现约束

## 全局目标

- 构建桌面优先、工作区优先、任务优先的 AI 数字生命
- 先建立可运行、可恢复、可扩展、可治理的 Phase 0 底座
- 用项目级子Agent、skills 和 hooks 约束开发质量与安全边界

## Phase 边界

### 当前优先级

- Phase 0：架构底座、桌面壳层、安全边界、基础设施、工作区、检索、任务审批、恢复与迁移
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

| 场景 | 默认路由 |
|------|----------|
| 新需求、规划、验收标准 | `product-spec` -> `architect` |
| 跨模块边界、接口、重构 | `architect` |
| Electron、IPC、Main/Preload/Renderer/Worker | `desktop-shell` |
| config/logger/errors/storage/migration | `infra-foundation` |
| workspace/retrieval/index/search/repo-map | `retrieval-engineer` |
| task/approval/audit/checkpoint/风险分级 | `task-governance` |
| 权限边界、密钥、危险写入、命令执行 | `app-security` |
| 单测/集成/E2E/验收矩阵 | `test-engineer` |
| 静态审查、设计一致性、测试缺口 | `code-reviewer` |
| 文档、阶段文档、开发说明 | `docs-maintainer` |
| 打包、版本、迁移、发布核查 | `release-integrator` |
| Agent/skill/hook/manifests 一致性 | `repo-librarian` |

## 协作限制

- 默认树状协作，不做网状自治
- 子Agent不直接推翻其它子Agent结论，由主Agent仲裁
- 单任务默认最多并行 3 个实现类 Agent
- 治理角色优先负责约束和审查，不直接承担主实现

## 强制协同规则

- 新需求默认先经过 `product-spec`
- 重要实现前必须经过 `architect`
- Electron/IPC/权限边界相关任务必须带 `desktop-shell` + `app-security`
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

## 禁止项

- Renderer 直接触达系统能力
- 低层依赖高层
- 多个事件总线各自为政
- 凭据写入普通配置或日志
- 未说明 Phase 边界就引入远期能力
- 高风险改动无测试计划、无恢复说明、无审计考虑

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

详细说明见：

- [agent-topology.md](/E:/Programs/Obsidian/notes/docs/development/agent-topology.md)
- [agent-routing.md](/E:/Programs/Obsidian/notes/docs/development/agent-routing.md)
- [hook-policy.md](/E:/Programs/Obsidian/notes/docs/development/hook-policy.md)
- [project-engineering-constraints.md](/E:/Programs/Obsidian/notes/docs/development/project-engineering-constraints.md)
- [future-codebase-governance-checklist.md](/E:/Programs/Obsidian/notes/docs/development/future-codebase-governance-checklist.md)

## 当前仓库的特殊约束

- 根目录文档是协作与治理的源事实，不能视为附属说明
- `ai-digital-life/` 的实现约束必须与根目录治理文档保持一致
- 任何 Agent 对阶段、目录、边界的修改，都必须同步文档与 manifest
