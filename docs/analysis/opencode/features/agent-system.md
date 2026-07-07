# Agent 系统

> 源码：`core/src/agent.ts`（~111 行）、`opencode/src/agent/`、`schema/src/agent.ts`

## 内置 Agent（7 个）

| Agent | 类型 | 模型 | 说明 |
|-------|------|------|------|
| `build` | primary | claude-opus-4-5 | 默认主 agent，执行代码编写任务 |
| `plan` | primary | claude-opus-4-5 | 只读分析与规划 agent |
| `general` | subagent | claude-sonnet-4-5 | 通用探索子 agent |
| `explore` | subagent | claude-sonnet-4-5 | 代码库探索子 agent |
| `compaction` | hidden | claude-sonnet-4-5 | 自动会话压缩 |
| `title` | hidden | claude-haiku-4-5 | 自动生成会话标题 |
| `summary` | hidden | claude-haiku-4-5 | 自动生成摘要 |

## 关键类型

```ts
// schema/src/agent.ts
Agent.Info = {
  id: Agent.ID           // Branded string
  name: string
  description?: string
  model?: Model.Ref      // 指定模型
  prompt?: string        // 自定义 system prompt
  hidden?: boolean       // 是否隐藏（不在 UI 中显示）
  color?: Color
  permission?: Permission.Ruleset[]  // Agent 级权限
}

Agent.Selection = { id: Agent.ID, info: Agent.Info }
```

## 核心服务

```ts
// core/src/agent.ts
Agent.Interface = {
  list(): Effect<Agent.Info[]>
  get(id: Agent.ID): Effect<Agent.Info>
  default(): Effect<Agent.Selection>   // 返回 "build"
  select(id: Agent.ID): Effect<Agent.Selection>
}
```

## Agent 生成

OpenCode 支持 LLM 动态生成新 agent：

- 文件：`opencode/src/agent/generate.txt`
- 通过 `Agent.generate` 让 LLM 根据需求描述生成 agent 配置
- 生成的 agent 存储在 `.opencode/agent/` 目录

## Sub-agent 系统

### Task 工具调用流程

```
用户请求复杂任务
  │
  ▼
主 Agent 调用 task 工具
  ├─ subagent_type: "general" | "explore" | custom
  ├─ description: 任务描述
  ├─ prompt: 具体指令
  └─ background?: boolean  // 后台执行
  │
  ▼
Session 创建子会话
  ├─ parent_id → 父会话 ID
  ├─ agent → 子 agent 配置
  └─ 权限派生: deriveSubagentSessionPermission(parent)
  │
  ▼
子 Agent 独立执行
  ├─ 独立 Session context
  ├─ 受限权限（从父会话派生）
  └─ 完成后返回结果
  │
  ▼
主 Agent 接收结果 → 继续执行
```

### 子代理权限派生

文件：`core/src/agent/subagent-permissions.ts`

- 子 agent 权限从父会话的已批准权限派生
- 子 agent 不能拥有超过父会话的权限
- 后台任务可复用 `task_id` 恢复执行

## Prompt 模板

Agent 特定的 prompt 模板存储在 `opencode/src/agent/prompt/`：

| 文件 | 用途 |
|------|------|
| `compaction.txt` | 会话压缩指令 |
| `explore.txt` | 代码探索指令 |
| `summary.txt` | 摘要生成指令 |
| `title.txt` | 标题生成指令 |

## Plan Mode

- `plan` agent 拥有独立的只读分析能力
- 通过 `plan_enter` / `plan_exit` 工具切换
- 计划保存到 `.opencode/plans/*.md`
- 计划模式下 agent 被限制为只读操作

## 自定义 Agent

用户可在 `.opencode/agent/` 或项目配置中定义自定义 agent：

```jsonc
// .opencode/opencode.jsonc
{
  "agent": {
    "custom-reviewer": {
      "name": "Code Reviewer",
      "model": "anthropic/claude-sonnet-4-5",
      "prompt": "You are a code reviewer...",
      "permission": { "allow": ["Read", "Grep", "Glob"] }
    }
  }
}
```

## 关键实现细节

1. **Agent 切换**：`session.switchAgent(id)` → 更新 Session 的 agent 引用 → 下次 LLM 调用使用新 agent 的 prompt 和权限
2. **Hidden Agent**：compaction/title/summary 对用户不可见，只在系统内部自动调用
3. **Agent 颜色**：用于 UI 区分不同 agent 的对话块
4. **模型绑定**：每个 agent 可绑定特定模型，切换 agent 时可能同时切换模型
