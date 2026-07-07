# ACP 协议（Agent Client Protocol）

> 源码：`opencode/src/acp/`、依赖 `@agentclientprotocol/sdk`

## 定位

ACP 是 OpenCode 与外部编辑器（如 Zed）集成的协议，允许外部应用驱动 OpenCode 的 Agent 功能。

与 MCP（外部工具接入 Agent）方向相反，ACP 是**外部编辑器接入 Agent**。

```
MCP: 外部工具 → OpenCode Agent（工具接入）
ACP: OpenCode Agent → 外部编辑器（编辑器集成）
```

## ACP 模块

```
opencode/src/acp/
├── agent.ts         # Agent 操作
├── config-option.ts # 配置选项
├── content.ts       # 内容操作
├── directory.ts     # 目录操作
├── error.ts         # 错误处理
├── event.ts         # 事件系统
├── permission.ts    # 权限操作
├── profile.ts       # Profile/配置
├── service.ts       # ACP 服务主逻辑
├── session.ts       # Session 管理
├── tool.ts          # 工具操作
└── usage.ts         # 用量统计
```

## 协议通信

```
外部编辑器 (Zed)
  │
  ├── ACP SDK (@agentclientprotocol/sdk)
  │
  ├── → 连接 OpenCode ACP 服务
  │
  ▼
OpenCode ACP Service
  ├── agent.ts    → 接收 Agent 指令
  ├── session.ts  → 创建/管理 Session
  ├── tool.ts     → 调用工具
  ├── event.ts    → 推送事件
  └── content.ts  → 同步文件内容
```

## 关键设计要点

1. **双向通信**：编辑器可驱动 Agent，Agent 可请求编辑器操作
2. **事件驱动**：基于 Event 的异步通信模型
3. **Session 隔离**：每个编辑器窗口独立 Session
4. **权限委托**：编辑器的权限检查可委托给 ACP
5. **当前状态**：Phase 2 中，本项目对 ACP 仅做**接口预留**，不实现
