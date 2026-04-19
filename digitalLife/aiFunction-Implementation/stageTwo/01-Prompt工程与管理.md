# Prompt 工程与管理实施计划

## 模块概述

**包名**: `@ai-digital-life/prompt-engine`

**优先级**: P0

**目标**: 把 Prompt 从零散文本升级为可组合、可版本化、可审计的规则栈，使单 Agent 在不同执行阶段都能获得稳定、一致、可控的行为约束。

## 在单 Agent 工作流中的职责

该模块不只是生成一个 system prompt，而是负责组装以下层次：

1. 平台级安全与行为边界
2. 项目级规则与风格约束
3. 会话级偏好与执行模式
4. 当前阶段指令：`plan` / `edit` / `verify`
5. 工具调用契约
6. 输出格式契约

## Phase 1 必须交付

- Prompt 模板与规则栈管理
- 阶段化模板：`chat` / `plan` / `edit` / `verify`
- 项目规则与工作区规则注入
- 版本管理、diff、回滚
- 插槽填充与长度控制
- Prompt 注入防护
- 最小效果指标：补丁接受率、验证通过率、人工改写率

## Phase 1 不做

- 自动 Prompt 优化
- 全量 A/B 测试平台
- 多模型专属高级 prompt 编译器
- 复杂 Prompt 链工作流

## 当前代码仓映射

推荐新增位置：

```text
ai-digital-life/packages/prompt-engine/
```

依赖关系：

| 当前模块 | 关系 |
|----------|------|
| `config` | 读取默认模板、用户偏好、规则启用状态 |
| `storage` | 持久化模板版本、变更记录、指标 |
| `logger` | 记录组装与截断决策 |
| `workspace` | 读取当前工作区元数据，用于注入项目规则 |

## 核心设计

### 1. Prompt 规则栈

```typescript
export type PromptLayer =
  | 'platform'
  | 'project'
  | 'session'
  | 'workflow-phase'
  | 'tool-contract'
  | 'output-contract';
```

建议组装顺序固定，避免上层内容覆盖安全基线：

`platform -> project -> session -> workflow-phase -> tool-contract -> output-contract`

### 2. 场景模板

```typescript
export type PromptScene =
  | 'chat'
  | 'plan'
  | 'code-edit'
  | 'code-explain'
  | 'verify'
  | 'summary';
```

其中 Phase 1 最关键的是：

- `plan`: 输出结构化步骤与风险
- `code-edit`: 优先生成补丁而不是直接输出整文件
- `verify`: 根据命令输出进行结构化归因

### 3. 插槽设计

建议统一保留以下插槽：

- `workspace_profile`
- `project_rules`
- `task_goal`
- `active_plan`
- `available_tools`
- `output_schema`
- `risk_constraints`

### 4. 注入安全

需要显式区分：

- 用户输入
- 文件内容
- 终端输出
- 外部网页内容

所有外部内容必须被包装为“参考材料”，不能直接进入高优先级规则层。

### 5. 最小指标

当前阶段不追求复杂实验平台，但应记录：

- Prompt 版本
- 使用场景
- 产出 Patch 是否被接受
- 验证是否通过
- 用户是否重试

这能为后续优化提供最基本的反馈回路。

## 与单 Agent 的接口契约

```typescript
export interface PromptAssemblyRequest {
  scene: PromptScene;
  workspaceId: string;
  sessionId: string;
  runId?: string;
  slotValues: Record<string, string>;
  maxInputTokens: number;
}

export interface AssembledPrompt {
  scene: PromptScene;
  version: number;
  layers: Array<{ layer: PromptLayer; content: string }>;
  finalText: string;
  estimatedTokens: number;
}
```

## 实施要点

### 平台级模板

必须包含：

- 安全边界
- Patch First 约束
- 审批要求
- 输出可靠性约束

### 项目级模板

从工作区规则文件和项目配置中抽取：

- 技术栈
- 目录边界
- 代码风格
- 测试约束

### 阶段化模板

- `plan`: 输出步骤、风险、验证动作
- `code-edit`: 输出补丁或变更建议
- `verify`: 输出失败归因和建议下一步

## 测试计划

### 单元测试

- 各层规则按顺序组装
- 缺失插槽时有默认行为
- 版本 diff 正确
- 危险注入片段被检测和降级

### 集成测试

- 同一任务在 `plan -> code-edit -> verify` 三阶段能使用不同模板
- 项目规则变更后新请求能生效

## 验收标准

- [ ] Prompt 可按场景版本化管理
- [ ] 可按层级稳定组装
- [ ] 项目规则、工具契约、输出契约可注入
- [ ] 注入风险可识别与隔离
- [ ] 执行阶段切换时能选中正确模板
- [ ] 基本效果指标可查询

## 结论

第二阶段的 Prompt 工程不是“模板仓库”，而是单 Agent 行为约束与输出稳定性的核心控制面。
