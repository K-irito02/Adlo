# 权限与策略系统

> 源码：`core/src/permission.ts`（~309 行）、`core/src/policy.ts`（~49 行）、`schema/src/permission.ts`

## 双层权限模型

OpenCode 采用 Ruleset + Policy 双层模型：

```
PermissionV2 (交互式权限请求)
  ↓ 依赖
Policy (声明式通配符匹配引擎)
```

## Policy 引擎（声明式）

```ts
// core/src/policy.ts (~49 行)
Policy.Effect = "allow" | "deny"
Policy.Info = { action: string, effect: Policy.Effect, resource: string }

Policy.Interface = {
  load(): Effect<Policy.Info[]>
  evaluate(action: string, resource: string, fallback: Policy.Effect): Effect<Policy.Effect>
  hasStatements(): Effect<boolean>
}
```

**匹配策略**：last-match-wins。遍历规则列表，最后一个匹配 action+resource 的规则生效。

## PermissionV2（交互式）

```ts
// core/src/permission.ts (~309 行)

// 核心类型
Permission.Ruleset = {
  id: string
  rules: Permission.Rule[]
}
Permission.Rule = {
  effect: "allow" | "deny"
  action: string      // 通配符：Read, Write*, Bash.*
  resource: string    // 通配符：/src/**, /tmp/*
}

// 权限请求
Permission.AssertInput = {
  id?: string
  sessionID: string
  action: string
  resources: string[]
  save?: boolean          // 是否记住本次决策
  metadata?: Record<string, unknown>
  source?: "rule" | "interactive"
  agent?: Agent.Info
}

// 权限回复
Permission.ReplyInput = {
  requestID: string
  reply: "allow" | "deny"
  message?: string
}
```

### 权限评估流程

```
Tool.withPermission(tool)
  │
  ▼
Permission.assert(input)
  ├── 1. 检查 Policy 声明式规则
  │   ├── match → allow → 直接放行
  │   └── match → deny → Permission.RejectedError
  │
  ├── 2. 无匹配 → 生成 Permission Request
  │   ├── 如果有 session saved permissions → 检查
  │   └── 需要交互 → 弹出请求
  │
  ├── 3. 等待用户批准/拒绝
  │   ├── allow + save → 保存到会话权限
  │   └── deny → Permission.RejectedError
  │
  └── 4. 返回 AskResult { id, effect }
```

## 权限类型

```ts
// 常见的 action 类型
"Read" | "Write" | "Bash" | "Bash.*"
"Edit" | "Glob" | "Grep" | "Task"
"WebFetch" | "WebSearch" | "LSP"
"Skill" | "Question" | "Plan"

// 资源匹配（通配符）
"/src/**"        → 匹配 /src 下所有文件
"/tmp/*"         → 匹配 /tmp 下直接文件
"*.ts"           → 匹配所有 TS 文件
```

## Agent 级权限

```ts
Agent.Info.permission?: Permission.Ruleset[]
// 每个 Agent 可定义自己的默认权限限制
// 例：plan agent → 只允许 Read/Glob/Grep
```

## 子代理权限派生

```ts
// core/src/agent/subagent-permissions.ts
deriveSubagentSessionPermission(parentSessionID): Permission.Ruleset[]
// 子 agent 权限 = 父会话已批准权限 ∩ 子 agent 内置权限
```

## 安全模型

| 特性 | 说明 |
|------|------|
| 默认拒绝 | 无规则匹配时 popup 请求用户批准 |
| 白名单优先 | allow 规则可预先配置已知安全操作 |
| 黑名单阻断 | deny 规则可阻断危险操作（如 `rm -rf`） |
| 会话记忆 | `save: true` 选项使权限在 session 内持久 |
| 通配符匹配 | `*` 匹配单层，`**` 匹配递归 |
| doom_loop 检测 | 检测无限权限请求循环 |
