---
description: Branded nominal types for domain IDs with centralized asXxxID narrowing at IPC boundaries
globs: ai-digital-life/frontend/src/shared/**,ai-digital-life/frontend/src/**/*.ts
alwaysApply: false
---

# Branded 名义类型保护领域 ID（Branded<T, B>）

## 规则描述

跨 IPC 边界返回/接收的领域标识符（工作区、会话、终端会话、Agent 运行）是裸 `string`，为在编译期区分不同 ID 语义、防止相互误传，使用名义类型（nominal/opaque type）。所有 Branded 类型与转换工厂集中在 `shared/branded.ts`，通过 `asXxxID()` 在 IPC 边界把裸 string 收窄为具体 ID 类型。

## 正确示例

```ts
// branded.ts
export type Branded<T, B extends string> = T & { [BrandSymbol]: B };
export type WorkspaceID = Branded<string, 'WorkspaceID'>;
export type SessionID = Branded<string, 'SessionID'>;
export function asWorkspaceID(value: string): WorkspaceID { return value as WorkspaceID; }

// 消费侧
const workspaceId = asWorkspaceID(result.data.workspaceId); // IPC → 名义类型
loadWorkspaceTree(workspaceId, path); // action 签名用 WorkspaceID，杜绝与 SessionID 混用

// 集中收窄
export function asWorkspaceID(value: string): WorkspaceID { return value as WorkspaceID; }
```

## 错误示例

```ts
// ❌ 全程裸 string，两个 ID 语义可互换
loadWorkspaceTree(workspaceId: string, sessionId: string) {...}

// ❌ 在多个文件各自定义同名别名，无法穷举维护
type WS = string;
```

## 适用场景

- IPC 命令/事件返回的领域主键（WorkspaceID / SessionID / TerminalSessionID / AgentRunID）
- store 字段与 action 参数中需要区分的标识符
- 新增 ID 语义时在 `branded.ts` 集中补充类型 + `asXxxID` 工厂，跨 IPC 边界统一收窄