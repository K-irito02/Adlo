# 单 Agent 工作流编排实施计划

## 模块概述

**包名**: `@ai-digital-life/agent-runtime`

**优先级**: P0 - 第二阶段的执行中枢

**目标**: 在不引入多 Agent 自治复杂度的前提下，把计划、上下文、工具调用、补丁预览、审批、验证、回滚串成一个可恢复、可审计、可解释的单 Agent 执行闭环。

## 为什么必须前置

如果没有统一编排层，第二阶段会退化成：

- 对话能聊
- 文件能读写
- 命令能执行
- diff 能展示

但无法形成真正的“工作流产品”。用户会看到一堆工具能力，却看不到：

- 计划是怎么来的
- 当前做到哪一步
- 为什么暂停审批
- 为什么执行失败
- 哪一步触发了补丁或命令
- 如何安全重试或回滚

所以单 Agent 编排层不是 Phase 2 的提前透支，而是 Phase 1 要完成完整闭环时的最小必要中枢。

## 设计原则

- 单 Agent 优先：只有一个执行主体，不引入多代理协商
- Patch First：默认产出补丁提案，不直接落盘
- Tool Governed：所有副作用都通过工具协议进入统一执行面
- Human in the Loop：高风险步骤必须暂停审批
- Resumable：执行过程具备恢复语义
- Explainable：计划、步骤、结果、失败原因都可展示给用户

## Phase 1 职责边界

### 必须交付

- 结构化计划生成
- 顺序步骤执行
- 工具调用统一编排
- 风险分级与审批暂停
- PatchSet 产出与应用触发
- 验证命令执行与结果回传
- 失败重试、降级与回滚
- 执行状态持久化与恢复

### 只做骨架

- 多 Agent 并行
- 动态 DAG 调度
- 长时间后台自治任务
- 云执行器/远程沙箱
- 策略学习与自动调参

## 当前代码仓映射

该包应位于 `ai-digital-life/packages/agent-runtime`，并只编排，不直接越权操作：

| 运行时能力 | 实际依赖 |
|-----------|----------|
| 计划生成 | `prompt-engine` + `model-gateway` |
| 上下文构建 | `context-engine` |
| 文件与搜索 | `fs-ops` |
| 命令执行 | `terminal` |
| 补丁应用 | `change-engine` |
| 审批与审计 | `task` + `storage` |
| UI 展示 | `conversation` + `editor` + `apps/desktop` |

## 核心类型

```typescript
export type AgentRunStatus =
  | 'draft'
  | 'planning'
  | 'ready'
  | 'executing'
  | 'waiting-approval'
  | 'applying'
  | 'verifying'
  | 'succeeded'
  | 'failed'
  | 'rolled-back'
  | 'aborted';

export type AgentStepKind =
  | 'analyze'
  | 'search'
  | 'read'
  | 'edit-plan'
  | 'command'
  | 'patch-preview'
  | 'apply'
  | 'verify'
  | 'summarize';

export type AgentStepStatus =
  | 'pending'
  | 'running'
  | 'waiting-approval'
  | 'completed'
  | 'failed'
  | 'skipped';

export interface AgentPlan {
  id: string;
  runId: string;
  goal: string;
  summary: string;
  steps: AgentStep[];
  createdAt: number;
}

export interface AgentStep {
  id: string;
  title: string;
  kind: AgentStepKind;
  riskLevel: 'low' | 'medium' | 'high';
  status: AgentStepStatus;
  dependsOn: string[];
  expectedOutput?: string;
  verificationCommand?: string;
}

export interface AgentRun {
  id: string;
  sessionId: string;
  workspaceId: string;
  status: AgentRunStatus;
  currentStepId?: string;
  planId?: string;
  patchSetId?: string;
  checkpointId?: string;
  startedAt: number;
  updatedAt: number;
  finishedAt?: number;
}

export interface ToolInvocation {
  id: string;
  runId: string;
  stepId: string;
  toolName: string;
  inputSummary: string;
  outputSummary?: string;
  success?: boolean;
  createdAt: number;
}
```

## 状态机

```text
draft
  -> planning
  -> ready
  -> executing
      -> waiting-approval
      -> executing
      -> applying
      -> verifying
      -> succeeded
      -> failed
      -> rolled-back
      -> aborted
```

### 状态规则

- `planning`: 仅允许读上下文与模型规划，不允许副作用工具
- `executing`: 允许只读工具与低风险提案型工具
- `waiting-approval`: 只能等待用户决策，不能继续推进
- `applying`: 只能通过 `change-engine` 落盘
- `verifying`: 只能执行允许的验证命令
- `failed`: 可重试、降级或回滚

## 执行流程

### 1. 计划生成

用户发送任务后，运行时先生成 `AgentPlan`，至少包含：

- 目标摘要
- 关键约束
- 执行步骤
- 高风险步骤标记
- 验证动作
- 成功/失败出口

### 2. 工作集构建

运行时从 `context-engine` 获取执行所需工作集：

- 当前用户消息
- 显式引用
- 当前打开文件/选区
- 最近对话摘要
- 工作区摘要
- 最近命令输出
- 当前计划状态

### 3. 工具执行

步骤执行只通过统一工具网关，不允许模型直接越过运行时调用底层模块。

必备工具域：

- `workspace.read`
- `workspace.search`
- `workspace.editPlan`
- `terminal.run`
- `change.preview`
- `change.apply`
- `change.rollback`

### 4. 审批暂停

以下场景必须进入 `waiting-approval`：

- 删除文件
- 覆盖多文件修改
- 安装依赖
- 运行未知脚本
- 高风险命令
- 验证结果与预期明显不符但仍要继续

### 5. 补丁与应用

模型或规则引擎产出修改后，必须先形成 `PatchSet`：

- 进入 diff 预览
- 用户可按文件/按块接受
- 全部接受后才能进入 `applying`

### 6. 验证与总结

应用成功后自动运行验证：

- 优先使用步骤自带 `verificationCommand`
- 无显式命令时使用项目默认验证配置
- 验证结果结构化回传到对话与编辑器
- 输出最终执行总结

## 失败处理策略

### 重试

适用于：

- 网络抖动
- 流式中断
- 索引尚未就绪
- 临时文件锁冲突

### 降级

适用于：

- 自动计划质量过低，降级为建议模式
- 自动上下文收集失败，降级为显式引用模式
- 结构化命令解析失败，降级为只读执行建议

### 回滚

适用于：

- 补丁应用失败
- 验证失败且用户选择回滚
- 中途崩溃恢复时发现状态不一致

## 持久化要求

运行时不能只存在于内存中，最少要持久化：

- `agent_runs`
- `agent_plans`
- `agent_steps`
- `tool_invocations`
- `run_artifacts`
- `run_recovery_markers`

恢复时必须能够区分：

- 尚未落盘的计划阶段
- 已生成 Patch 但未应用
- 已应用但未验证
- 验证失败待处理

## UI 呈现要求

对话侧至少要展示：

- 当前计划
- 当前步骤
- 正在调用的工具
- 审批原因
- 验证结果
- 最终总结

编辑器侧至少要展示：

- 当前补丁目标文件
- diff 预览
- 失败诊断定位

## 测试计划

### 单元测试

- 计划状态机迁移正确
- 风险步骤能正确进入审批暂停
- 失败后能按重试/降级/回滚策略分流
- 恢复逻辑能根据持久化状态继续执行或安全中止

### 集成测试

- 用户任务 -> 计划 -> 文件读取 -> PatchSet -> 应用 -> 验证 -> 总结
- 高风险命令触发审批，批准后继续
- 验证失败触发自动或手动回滚
- 应用崩溃后重启恢复

## 验收标准

- [ ] 系统能在执行前生成清晰计划
- [ ] 顺序步骤可按状态机推进
- [ ] 高风险步骤会暂停等待审批
- [ ] 所有副作用工具调用都有记录
- [ ] Patch 应用与验证被纳入同一运行时链路
- [ ] 失败时可执行重试、降级或回滚
- [ ] 中断后可恢复或安全中止
- [ ] 最终可输出结构化执行总结

## 结论

`agent-runtime` 是第二阶段达成“单 Agent 完整工作流”的必要模块。它不是多代理平台，而是把已有 8 个模块从能力集合提升为一个真正可运行的产品闭环。
