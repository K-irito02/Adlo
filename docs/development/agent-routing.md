# Agent Routing

## 路由原则

- 新需求先澄清，再实现
- 跨边界改动先架构，后编码
- 高风险改动必须自动带治理角色
- 文档与规则更新必须有收口角色

## 默认路由

### 需求与规划

`product-spec -> architect`

适用：

- 新功能
- 阶段范围调整
- 里程碑拆分
- 验收标准定义

### Electron 与桌面安全边界

`architect -> desktop-shell -> app-security -> test-engineer -> code-reviewer`

适用：

- Main/Preload/Renderer/Worker
- IPC
- BrowserWindow 安全参数
- 恢复与健康检查

### 基础设施

`architect -> infra-foundation -> test-engineer -> code-reviewer`

适用：

- config
- logger
- errors
- storage
- migration

### 工作区与检索

`architect -> retrieval-engineer -> test-engineer -> code-reviewer`

适用：

- workspace
- indexing
- retrieval
- repo map
- worker 索引任务

### 任务、审批与审计

`architect -> task-governance -> app-security -> test-engineer -> code-reviewer`

适用：

- task state machine
- approval
- checkpoint
- audit
- dangerous action flow

### 文档与规则

`docs-maintainer -> repo-librarian`

适用：

- AGENTS
- skills
- hooks
- manifests
- 阶段文档
- 开发规范

### 发布准备

`release-integrator -> test-engineer -> code-reviewer -> docs-maintainer`

适用：

- 版本
- 迁移
- 打包
- 发布前检查

## 强制附带角色

- 涉及权限、凭据、任意写入、命令执行：必须带 `app-security`
- 涉及高风险基础设施：必须带 `test-engineer`
- 涉及跨模块边界：必须带 `architect`
- 涉及规则或文档体系变更：必须带 `repo-librarian` 或 `docs-maintainer`

## 回退策略

- 若目标专长 Agent 缺失，优先回退到 `architect` 或 `infra-foundation`
- 若治理 Agent 缺失，主Agent不得静默跳过，必须显式提示风险
