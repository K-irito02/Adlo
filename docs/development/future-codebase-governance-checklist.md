# 未来代码仓治理落地清单

## 目标

本清单用于把当前规划仓中的项目级规则，迁移为未来真实代码仓中的可执行资产。

适用时机：

- 初始化 `ai-digital-life` 真实代码仓
- 建立 `docs/architecture`、`CONTRIBUTING`、测试门禁和发布流程
- 对齐当前规划文档与未来实现仓之间的规则映射

## 一、代码仓必须具备的文档入口

未来代码仓建议至少包含：

- `README.md`：项目定位、技术栈、启动方式、目录说明
- `AGENTS.md`：项目级 Agent 路由、治理规则、文档同步要求
- `CONTRIBUTING.md`：提交流程、测试门禁、文档同步、变更说明要求
- `docs/architecture/`：架构事实来源目录
- `docs/adr/`：关键架构决策记录
- `docs/runbooks/`：恢复、迁移、发布、故障处置手册

## 二、`docs/architecture` 建议拆分

建议最少包含以下主题文档：

- `system-overview.md`
  - 说明 Phase 边界、核心目标、层次结构、模块关系
- `desktop-boundaries.md`
  - 定义 Main、Preload、Renderer、Worker、IPC 的职责与禁止项
- `state-and-persistence.md`
  - 定义配置分层、store 边界、持久化真相源、schema 与迁移策略
- `workspace-and-retrieval.md`
  - 定义工作区模型、索引生命周期、检索边界和后台 worker 责任
- `task-governance.md`
  - 定义任务状态机、审批流、审计流、危险动作治理
- `internationalization.md`
  - 定义语言范围、资源结构、fallback、运行时切换和格式化规则
- `theming.md`
  - 定义 `light`、`dark`、`system`、token 体系和 system 跟随策略
- `security-baseline.md`
  - 定义 BrowserWindow、IPC、秘密存储、文件系统与命令执行基线
- `recovery-and-migration.md`
  - 定义启动恢复、异常恢复、数据库迁移、配置迁移和回滚策略
- `observability.md`
  - 定义日志、错误码、审计、诊断字段与隐私边界

## 三、`CONTRIBUTING.md` 必须写清楚的规则

至少明确以下内容：

- 哪些改动必须先更新文档再改代码
- 哪些改动必须补测试计划和验证说明
- 哪些改动必须经过 `architect`、`app-security`、`test-engineer`
- 哪些改动会触发危险动作审批
- 提交前必须通过哪些检查
- PR 描述至少包含哪些段落
- 何时需要补 ADR

建议把 PR 模板约束为固定字段：

- 变更范围
- 所属 Phase
- 边界影响
- 测试与验证
- 恢复与回滚
- 文档同步
- 残余风险

## 四、自动化检查建议

未来代码仓建议至少自动化以下检查：

- i18n 缺失 key 与未使用 key 检查
- 主题 token 使用检查，阻止散落颜色常量进入核心组件
- IPC contract 类型检查与输入校验
- 配置 schema 校验与迁移测试
- SQLite 迁移 smoke test
- 关键双语页面和三态主题 smoke test
- 依赖方向与跨层导入检查

## 五、与当前规划仓的映射关系

迁移到真实代码仓时，以下文档必须继续保持源事实一致：

- [AGENTS.md](/E:/Programs/Obsidian/notes/AGENTS.md)
- [project-engineering-constraints.md](/E:/Programs/Obsidian/notes/docs/development/project-engineering-constraints.md)
- [agent-topology.md](/E:/Programs/Obsidian/notes/docs/development/agent-topology.md)
- [agent-routing.md](/E:/Programs/Obsidian/notes/docs/development/agent-routing.md)
- [hook-policy.md](/E:/Programs/Obsidian/notes/docs/development/hook-policy.md)

如果真实代码仓的实现约束与当前规划仓不一致，必须先更新规划仓文档，再更新实现仓文档与自动化规则。
