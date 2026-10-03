# Agent 操作展示后端重构 —— OpenCode 对齐方案设计

> 日期：2026-08-08
> 状态：已评审确认
> 范围：后端 + 数据库（前端下阶段实现）

## 1. 背景与目标

本项目是类 OpenCode/Codex/Trae SOLO 的桌面端 Agent 编程产品。用户希望界面能像 OpenCode
一样展示 Agent 的思考过程、工具调用、执行过程、询问卡片交互、文件修改等信息。

经调研参考实现源码，其实现机制为：

1. **细粒度 Part 数据模型**：每条消息拆成多个 part 独立存储，part 可增量更新
2. **Tool Part 状态机**：工具调用为 `pending → running → completed/error` 状态对象
3. **事件驱动广播**：所有变更经服务端 EventEmitter + SSE 推送给客户端
4. **前端查表渲染**：UI 按 part 类型 / 工具名查表渲染，只被动消费数据

本次重构为**后端全面对齐参考实现架构**：Part 数据模型 + 多步工具循环 + SSE 事件流，
废弃旧格式，前端下阶段实现。

## 2. 决策记录

| 决策点 | 结论 |
|--------|------|
| 对齐程度 | 全面对齐：Part 模型 + 事件流 + 多步工具循环 |
| 存量系统处置 | 一步替换 |
| 事件传输 | 新建独立本地 HTTP 服务（SSE 端点），双端（Tauri/浏览器）一致 |
| 阶段边界 | 后端全套（数据模型 + Agent Loop + SSE + 迁移），前端下阶段 |
| 旧数据处置 | 废弃旧表、不留数据（符合未发布期禁止迁移代码规则） |
| 后端旧格式 | 彻底移除（停写），类型/表/命令骨架保留防编译断裂 |
| Reasoning 数据源 | 扩展模型网关支持 reasoning 流（DeepSeek reasoning_content 等） |

## 3. 数据模型：Message + Part

### 3.1 表结构（新增迁移 v6）

```
session（复用现有 sessions 表，不重构）

message 表：
  id           TEXT PRIMARY KEY
  session_id   TEXT NOT NULL          -- FK -> session
  role         TEXT NOT NULL          -- user | assistant
  parent_id    TEXT                   -- assistant 消息关联的 user 消息
  agent        TEXT
  model        TEXT (JSON)
  summary      TEXT (JSON)
  time_created INTEGER NOT NULL
  time_completed INTEGER
  data         TEXT (JSON)            -- 消息级载荷
  索引 (session_id, time_created, id)

part 表：
  id           TEXT PRIMARY KEY
  message_id   TEXT NOT NULL          -- FK -> message
  session_id   TEXT NOT NULL
  type         TEXT NOT NULL
  ordinal      INTEGER NOT NULL       -- 消息内 part 顺序
  time_created INTEGER NOT NULL
  data         TEXT (JSON)            -- part 载荷
  索引 (message_id, id), (session_id)

event_log 表：
  seq          INTEGER PRIMARY KEY AUTOINCREMENT
  session_id   TEXT NOT NULL
  type         TEXT NOT NULL
  payload      TEXT (JSON) NOT NULL
  time_created INTEGER NOT NULL
  索引 (session_id, seq)
```

### 3.2 Part 类型（Rust enum，serde tag="type"）

| Part | 载荷 | 说明 |
|------|------|------|
| `text` | `text: String` | 流式正文（delta 累积） |
| `reasoning` | `text: String` | 思考过程（来自网关 reasoning 流） |
| `tool` | `tool, call_id, state` | 工具调用状态机 |
| `file` | `mime, filename, url` | 附件 |
| `step-start` | — | 工具循环内执行步骤开始 |
| `step-finish` | — | 工具循环内执行步骤结束 |
| `patch` | `hash, files: Vec<String>` | 文件修改 |
| `snapshot` | `snapshot: String` | 快照（挂 assistant 消息） |

### 3.3 Tool State 状态机

```
pending   { input: JSON }                        // LLM 已声明调用、参数流式中
running   { input, title?, metadata? }           // 已开始执行
completed { input, output, title, metadata, time {start, end} }   // 成功
error     { input, error, metadata?, time {start, end} }          // 失败
```

`metadata` 按工具类型携带结构化数据（如 `edit` 带 `filediff` 含 patch / 增删行数），
供未来前端渲染 diff。

## 4. Agent Loop 多步工具循环

新增 `crates/agent-loop` 作为多步工具循环执行器（对齐参考实现 `processor.ts` +
`message-updater.ts`）。

### 4.1 执行流程

```
用户输入 → 创建 user message
  → 创建 assistant message（step-start part）
  → while 循环:
      1. 调 LLM 流式输出 → reasoning delta（→ reasoning part）与 text delta（→ text part）
      2. 流式解析工具调用：参数到达 → tool part（pending）→ 参数完整 → running
      3. 执行工具（读/改/跑命令/搜索）→ 结果写回 tool part → completed / error
      4. 工具产出 patch/snapshot → 创建 patch part / 更新 snapshot
      5. 若 LLM 再次请求工具 → 回到步骤 1
      6. LLM 无工具调用（最终回复）→ step-finish → 结束
```

### 4.2 关键机制

- **每步更新 Part 并广播**：`update_part()` 写库 + 发 `message.part.updated` /
  `message.part.delta` 事件。文本/思考用 delta 增量，工具状态切换用整体更新
- **工具注册表**：复用 `crates/agent-runtime/src/tools/registry.rs` 现有工具，
  扩展为可被循环调用的形态（input/output schema + execute + 可选 metadata 生成器）
- **工具元数据**：执行工具时通过 `metadata()` 回调把结构化信息（edit 的 filediff、
  bash 的命令/输出、question 的问题列表）写入 tool part 的 `metadata`
- **Question 卡片**：`question` 工具挂起 `Deferred` + 发 `question.asked` 事件；
  SSE 客户端通过 `/question/{id}/reply` 提交答案后 resolve，循环继续
- **错误处理**：工具失败 → part 置 `error`，错误回填给 LLM（作为 tool result error
  文本），LLM 决定重试或改道；死循环检测（重复工具调用阈值）→ 中止
- **中断/取消**：保留 `agent_abort_run` 语义，中断时正在执行的 tool part 置
  `error`（interrupted）

### 4.3 循环终止条件

LLM 最终回复无工具调用 / 达到 max_steps / 用户中断 / 权限拒绝后按规则终止。

## 5. 模型网关 Reasoning 支持

### 5.1 StreamChunk 扩展

`crates/model-gateway/src/adapter.rs`：

```rust
pub enum StreamChunk {
    Delta(String),                    // 正文文本（现有）
    ReasoningDelta(String),           // 新增：思考过程增量
    ToolCallDelta { id, name, arguments_delta },  // 现有
    Done(ModelTokenUsage),            // 现有
}
```

### 5.2 Provider 解析

- DeepSeek：`choices[].delta.reasoning_content` → `ReasoningDelta`
- OpenAI 兼容（o1/o3/qwen 思考模式）：`delta.reasoning_content` / `delta.thinking`
- Ollama：思考字段（若有）
- 无 reasoning 支持的 provider：不产生 `ReasoningDelta`，Agent Loop 自然跳过

### 5.3 消费端

`agent_pipeline_stream::consume_stream_to_response` 改造：
- `Delta` → text part delta + 事件
- `ReasoningDelta` → reasoning part delta + 事件
- `ToolCallDelta` → 传给 Agent Loop 参数流式解析器
- `Done` → 收尾 usage

`ModelResponse` 增加 `reasoning: Option<String>`（完整拼接思考文本）。

## 6. SSE 事件流 + 事件发布

### 6.1 本地 HTTP 服务

新增 crate（如 `crates/http-server`），用 `axum` 监听 `127.0.0.1` 随机端口
（Tauri 启动时分配，端口写入 state，前端通过命令获取）。

端点：
- `GET /event` → SSE 事件流（Tauri 桌面与浏览器模式均经 http://127.0.0.1 访问）
- `POST /session/{sessionID}/message` → 发送消息（下阶段前端使用）
- `POST /question/{requestID}/reply` → 回答 Question 卡片

### 6.2 事件模型

| 事件 | 载荷 | 说明 |
|------|------|------|
| `message.part.updated` | `sessionID, messageID, partID, part` | part 整体更新（工具状态切换） |
| `message.part.delta` | `sessionID, messageID, partID, field, delta` | 文本/reasoning 增量 |
| `message.created` | `sessionID, info` | 新消息 |
| `message.updated` | `sessionID, info` | 消息整体（finish/error/usage） |
| `session.status` | `sessionID, status: idle\|busy\|retry` | 会话状态 |
| `question.asked` | `sessionID, requestID, questions, tool?` | 询问卡片出现 |
| `question.replied` | `sessionID, requestID, answers` | 已回答 |

### 6.3 事件发布机制

- 复用/升级现有 `EventBus`（`crates/kernel/src/events.rs`），新增结构化事件承载
- 每个事件**双写**：写 `event_log` 表（持久化）+ 推 HTTP SSE 订阅者（实时）
- SSE 用 `Last-Event-ID` 重放 `event_log`，保证断线不丢
- HTTP 服务持有 `broadcast::Sender<PartEvent>`，Agent Loop 每步更新后广播

### 6.4 与现有通道关系

旧 `digital-life://run-activity`、`digital-life://model-stream` 后端停止产生；
旧 Tauri 命令层保留骨架但不再写旧格式。

## 7. 迁移与清理

### 7.1 数据库迁移（v6）

一次性建 `message` / `part` / `event_log` 三张表，无数据迁移代码
（符合未发布期规则）。旧表保留在磁盘但不读写（标注 deprecated 注释）。

### 7.2 废弃清理（后端彻底移除旧格式）

- 删除/停用 `ConversationBlock` 写入路径、`RunActivityEvents`、`ToolInvocations` 写入
- `ConversationMessageRecord` 类型与旧前端 IPC 仍被前端引用：本阶段只停后端写入，
  类型/表/命令骨架保留（防编译断裂），前端下阶段统一迁移
- 删除清单：`blocks` 生成逻辑（`agent-runtime` 的 assistant_blocks 等）、
  run_activity 事件写入、tool_invocations 写入

## 8. 测试策略（红绿测试）

1. **Part 模型单元测试**：各 Part 序列化/反序列化；Tool 状态机合法迁移
   （pending→running→completed/error，非法迁移报错）
2. **Agent Loop 测试**：mock LLM 返回工具调用 → 断言 part 顺序、状态迁移、事件序列；
   工具失败重试路径；死循环中止
3. **Reasoning 流测试**：DeepSeek/OpenAI mock 响应解析为 ReasoningDelta；
   无 reasoning provider 正常跳过
4. **SSE 测试**：连 `/event` 收到广播；`Last-Event-ID` 断线重放
5. **迁移测试**：v6 迁移幂等、新表可用

验证命令：`cargo clippy --workspace --all-targets -- -D warnings`（0 警告）、
`cargo test --workspace`。

## 9. 非目标（本阶段不做）

- 前端 Part 渲染、前端事件订阅、前端 store 迁移
- 旧前端 tauri-bridge / mock-bridge / preview-bridge 迁移
- 旧 `ConversationBlock` 类型删除（下阶段随前端一起迁移）

## 10. 参考

- 参考实现（历史参考，本地副本已移除）：
  - 数据模型：`packages/core/src/session/sql.ts`、`packages/schema/src/session-message.ts`
  - Agent 循环：`packages/opencode/src/session/processor.ts`、
    `packages/core/src/session/message-updater.ts`
  - 事件：`packages/schema/src/session-event.ts`、`packages/protocol/src/groups/event.ts`
  - Question：`packages/opencode/src/question/index.ts`
  - SSE 客户端：`packages/tui/src/context/sdk.tsx`
- ADL 现状：`crates/conversation/`、`crates/storage/`、`crates/model-gateway/`、
  `src-tauri/src/commands/agent_pipeline/`
