# 变更影响映射与手动测试指引

**生成日期**：2026-07-07
**重构轮次**：参考实现对照功能审计修复

## 变更文件统计

- 总计：29 个文件变更（+1535 / -173 行）
- 新增：0 个文件
- 修改：29 个文件

## 变更影响映射

| 变更范围 | 影响模块 | 建议手动验证 |
|----------|---------|-------------|
| `crates/agent-runtime/src/plan_mode.rs`, `tools/registry.rs` | Plan Mode / 工具执行管线 | 进入 Plan Mode，让 Agent 创建计划文件，验证 `write` 工具可以写入计划文件但不能写入其他路径 |
| `crates/agent-runtime/src/compaction.rs`, `token_counter.rs` | 会话压缩（Compaction） | 进行一个长对话（超过 20000 tokens），验证压缩自动触发；短对话（低于 20000 tokens）不应触发压缩 |
| `crates/kernel/src/types/agent.rs`, `crates/subagent/src/permission.rs` | 子 Agent 权限继承 | 创建子 Agent 任务，验证子 Agent 继承父 Agent 的工具列表但不包含写工具（write/apply_patch/edit） |
| `crates/agent-runtime/src/durable.rs`, `src-tauri/src/commands/agent.rs`, `commands/durable.rs` | 持久会话（Durable Session） | 检查日志输出：正常操作不应有静默失败；故意断开数据库连接后恢复，验证日志中出现 warn 级别错误信息 |
| `crates/agent-runtime/src/plugins/registry.rs` | 插件系统 Hook 链 | 注册多个返回 Modify 的插件，验证后续插件基于前一个插件的输出继续修改（链式传递），而非互相覆盖 |
| `crates/model-gateway/src/fallback.rs`, `registry.rs`, `route.rs`, `lib.rs`, `provider.rs`, `setup.rs`, `commands/provider.rs` | 模型网关 / Provider 默认模型 | 使用不同 Provider（OpenAI、Anthropic、DeepSeek 等）发送请求，验证默认模型名称正确（不再是 "unknown"） |
| `crates/subagent/src/manager.rs`, `src-tauri/src/commands/subagent.rs` | 子 Agent 管理器 | 创建并完成任务后，验证状态更新正确；尝试更新不存在的子 Agent ID，验证返回错误而非静默忽略 |
| `crates/agent-runtime/src/tools/webfetch.rs`, `src-tauri/src/commands/web_tools.rs`, `frontend/src/shared/ipc/web_tools.ts`, `tauri-bridge.ts`, `mock-bridge.ts` | WebFetch 工具 | 抓取一个网页，验证：(1) 默认返回 Markdown 格式 (2) 可指定 format=text/html (3) 大页面（>5MB）被截断而非失败 (4) HTML 页面正确转换为 Markdown |
| `crates/mcp-client/src/client.rs` | MCP 客户端 / 服务器连接 | 连接 MCP 服务器后断开，验证 `auto_reconnect` 可以重新连接；修改 MCP 服务器的工具列表，验证 ToolListChanged 通知触发 catalog 刷新 |
| `frontend/src/shared/ipc/agent.ts` | 前端 Agent 类型定义 | 确认前端 TypeScript 编译无错误，`allowed_tools` 字段在 AgentConfig 中可用 |

## 手动测试清单

- [ ] Plan Mode：进入 Plan Mode，让 Agent 创建计划文件，验证 write 工具可写计划文件但不可写其他文件
- [ ] Compaction：进行长对话验证压缩在 ~20000 tokens 时触发（而非之前的 ~40000）
- [ ] 子 Agent 权限：验证子 Agent 继承父 Agent 工具列表，但写工具被强制 deny
- [ ] DurableSession：检查应用日志中 DurableSession 操作的 warn 日志正常输出
- [ ] 插件 Hook 链：多插件 Modify 场景下验证链式修改累积
- [ ] 默认模型：各 Provider 发送请求，确认默认模型名称正确（非 "unknown"）
- [ ] 子 Agent 状态更新：更新不存在 ID 时返回错误
- [ ] WebFetch：抓取网页验证 Markdown 输出、大页面截断、HTML 转换
- [ ] WebFetch 格式选择：分别请求 text/markdown/html 格式，验证输出格式正确
- [ ] MCP 重连：断开 MCP 服务器后验证自动重连
- [ ] MCP 工具列表变更：修改服务器工具列表后验证 catalog 自动刷新
