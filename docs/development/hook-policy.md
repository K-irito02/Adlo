# Hook Policy

## 目标

项目级 hooks 用于治理开发过程，而不是实现产品运行时 hook 引擎。

其职责是：

- 提前识别越权或越界改动
- 在关键节点补齐测试、文档和架构说明
- 对高风险动作进行审批或阻断

## 策略等级

### Low

- 只提示
- 不阻断
- 用于总结、提醒、建议补充信息

### Medium

- 默认阻断
- 要求补测试计划、文档同步或架构说明
- 用于防止中等风险的结构性回归

### High

- 阻断或审批
- 用于危险写入、权限边界、凭据处理、破坏性 Git 操作

## 关键规则

### `phase-boundary-guard`

- 事件：`pre-task`
- 作用：阻止 Phase 0 任务偷偷引入 Phase 2 的复杂能力

### `sensitive-surface-guard`

- 事件：`pre-edit`
- 作用：检查 Electron 安全面、凭据路径、危险暴露面

### `architecture-consistency-guard`

- 事件：`pre-edit`
- 作用：检查低层依赖高层、Renderer 越权、多事件总线等问题

### `ui-foundation-guard`

- 事件：`pre-edit`
- 作用：检查国际化资源、主题令牌、system 主题跟随和核心可访问性回归

### `state-persistence-guard`

- 事件：`pre-edit`
- 作用：检查配置分层、持久化 schema、迁移计划和恢复路径缺失

### `dangerous-action-approval`

- 事件：`pre-dangerous-action`
- 作用：删除、覆盖、重置、危险 Git 操作进入审批链

### `test-requirement-guard`

- 事件：`pre-commit`
- 作用：高风险改动缺少测试计划或验证说明时阻断

### `doc-sync-guard`

- 事件：`pre-commit`
- 作用：架构、Agent、skills、hooks、阶段边界变更时要求同步文档

## 失败降级

- Hook 本身执行失败时，不应让整个 Agent 体系瘫痪
- 默认降级为显式告警
- 但审批类高风险 hook 失败时应优先阻断

## 维护要求

- 新增 hook 必须更新 `.agents/manifests/hooks.yaml`
- 新增或调整治理规则必须更新本文件
- 规则职责变更必须同步 `AGENTS.md`
