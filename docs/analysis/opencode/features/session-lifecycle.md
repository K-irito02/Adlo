# Session 生命周期

> 源码：`core/src/session.ts`（~486 行）、`core/src/session/`、`opencode/src/session/`

## Session V2 模型

OpenCode 的 Session 基于 Effect-TS 的持久化事件溯源模型：

```
Session = {
  id: SessionID
  parentID?: SessionID        // 父子会话（Fork）
  projectID: ProjectID
  agent: Agent.Selection
  model: Model.Selection
  title?: string
  status: "active" | "interrupted" | "completed"
  // ... 更多元数据
}
```

## 关键服务接口

```ts
Session.Interface = {
  // 基础 CRUD
  list(anchor?): Effect<Session.ListResult>
  create(input): Effect<Session.Info>
  
  // 消息管理
  messages(sessionID, opts): Effect<Message[]>
  message(sessionID, messageID): Effect<Message>
  
  // 上下文
  context(sessionID): Effect<Context>
  events(sessionID): Effect<Event[]>
  history(sessionID): Effect<History>
  
  // Agent/Model 切换
  switchAgent(sessionID, agentID): Effect<void>
  switchModel(sessionID, modelRef): Effect<void>
  
  // Prompt
  prompt(sessionID): Effect<Prompt>
  
  // Compaction
  compact(sessionID): Effect<void>
  
  // 生命周期
  wait(sessionID): Effect<void>       // 等待 session 完成
  active(sessionID): Effect<boolean>  // 检查是否有活跃执行
  resume(sessionID): Effect<void>     // 恢复中断的 session
  interrupt(sessionID): Effect<void>  // 中断 session
  
  // Revert
  revert(sessionID, target): Effect<void>
}
```

## 核心子模块

```
core/src/session/
├── runner/           # Session 执行引擎（核心循环）
├── compaction.ts     # 上下文压缩
├── overflow.ts       # Token 溢出处理
├── revert.ts         # Revert 回滚
├── instruction.ts    # 指令注入
├── info.ts           # Session 信息类型
├── sql.ts            # 持久化
├── todo.ts           # Todo 管理
└── prompt/           # System Prompt 模板

opencode/src/session/
├── llm/              # LLM 调用（request/stream）
├── prompt.ts         # Prompt 构建
├── compaction.ts     # Compaction CLI 逻辑
├── instruction.ts    # 指令处理
├── message.ts        # 消息处理
├── processor.ts      # 消息后处理
├── reminders.ts      # 提醒注入
├── retry.ts          # 重试逻辑
├── summary.ts        # 摘要生成
├── system.ts         # System Context 构建
├── tools.ts          # 工具绑定
└── todo.ts           # Todo CLI 逻辑
```

## Session Runner（执行引擎）

Session Runner 是核心循环（`core/src/session/runner/`）：

```
while (session.status === "active") {
  // 1. 构建完整上下文
  const context = yield* buildSystemContext(sessionID)
  
  // 2. 组装 Prompt
  const prompt = yield* buildPrompt(sessionID, context)
  
  // 3. 构建消息历史（含 compaction）
  const history = yield* buildHistory(sessionID)
  
  // 4. 调用 LLM
  const response = yield* LLM.stream({ prompt, history, tools, model })
  
  // 5. 处理工具调用
  for (const toolCall of response.toolCalls) {
    const result = yield* ToolRuntime.execute(toolCall)
    // 注入 tool_result 到历史
  }
  
  // 6. 检查是否需要 compaction
  if (tokenCount > PRUNE_MINIMUM) {
    yield* compact(sessionID)
  }
  
  // 7. 检查完成条件（无 tool_calls + finish_reason = stop）
  if (response.finishReason === "stop" && !response.toolCalls.length) {
    break
  }
}
```

## Compaction（会话压缩）

| 常量 | 值 | 文件 |
|------|-----|------|
| `PRUNE_MINIMUM` | 20000 | compaction.ts |
| `PRUNE_PROTECT` | 40000 | compaction.ts |
| `DEFAULT_TAIL_TURNS` | 2 | compaction.ts |

压缩流程：
1. 检测 token 是否超过 PRUNE_MINIMUM
2. 调用 compaction agent（hidden）生成历史摘要
3. 保留最后 N 轮对话 + 最后 PRUNE_PROTECT token
4. 摘要注入到 System Prompt 中
5. 保护 skill 工具输出、关键系统消息不被裁剪

## Session Fork（分支）

```ts
// 从任意消息点分叉
session.fork(sessionID, messageID) → Session.Info
  
// 结果：
// - parent_id = 原 session ID
// - 标题：`{原标题} (fork #N)`
// - 继承原 session 到 messageID 为止的完整上下文
```

## Revert（回滚）

```ts
session.revert(sessionID, target) → void
// target: RevertState 枚举
//   - "previous"  → 回滚到上一个快照
//   - "initial"   → 回滚到初始状态
//   - 指定快照 hash

// 触发 unrevert → 恢复最近的 revert 操作
```

## Context Epoch（上下文时期）

来自 `CONTEXT.md` 的核心概念：

```
Context Epoch → 一次 System Context 渲染保持为不可变基线的时间跨度
Baseline System Context → Epoch 开始时的完整 System Context
Mid-Conversation System Message → 告诉模型已更改的 Context Source 新状态
Safe Provider-Turn Boundary → 提供商调用前，允许接受上下文更改的点
```

## Session Drain（会话排水）

一个进程本地的执行跨度，允许多个并发 Session Runner 在同一个进程中独立运行。

## 状态管理

```
Session 状态流转:
  active → interrupted (用户中断)
  active → completed (自然结束)
  interrupted → active (resume)
  active → compacted (压缩中) → active
```
