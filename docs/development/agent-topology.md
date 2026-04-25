# Agent Topology

## 目标

本文件描述 `AI数字生命` 项目的开发协作层，而不是产品运行时多智能体系统。

项目级 Agent 体系用于：

- 分发开发任务
- 稳定架构边界
- 强化安全与质量治理
- 统一文档、规则、技能和 hooks

## 拓扑选择

采用 **一主多专长 + 少量治理角色**。

- 主Agent负责接收任务、分发、仲裁、汇总
- 专长 Agent 负责实现或分析特定子域
- 治理 Agent 负责安全、测试、审查、文档和一致性收口

不采用网状自治，原因：

- 当前项目仍处于 Phase 0/1 约束下
- 仓库以设计与实施文档为主，强自治收益低于复杂度
- 主Agent集中仲裁更适合保持阶段边界和规则一致性

## Agent 分类

### 设计与实现类

- `product-spec`
- `architect`
- `tauri-shell`（Rust Backend / Tauri Commands / WebView 边界、capability、CSP）
- `infra-foundation`（Rust 基础设施 crate：config、logger、errors、storage、migration）
- `retrieval-engineer`
- `task-governance`

### 治理与收口类

- `app-security`
- `test-engineer`
- `code-reviewer`
- `docs-maintainer`
- `release-integrator`
- `repo-librarian`

## 并行策略

- 单任务默认最多并行 3 个实现类 Agent
- 治理 Agent 按需串行引入
- 避免多个实现类 Agent 同时修改同一逻辑边界

推荐模式：

1. `product-spec` 明确范围
2. `architect` 锁定边界
3. 专长 Agent 实现
4. `test-engineer` 验证
5. `code-reviewer` 审查
6. `docs-maintainer` / `repo-librarian` 收口

## 阶段适配

### Phase 0

重点激活：

- `architect`
- `tauri-shell`
- `infra-foundation`
- `retrieval-engineer`
- `task-governance`
- `app-security`

### Phase 1

在 Phase 0 基础上加强：

- `test-engineer`
- `code-reviewer`
- `docs-maintainer`
- `release-integrator`

## 冲突处理

- 子Agent之间默认不直接互相否决
- 冲突意见统一回到主Agent仲裁
- 若涉及安全、阶段边界或发布风险，治理 Agent 意见优先级更高