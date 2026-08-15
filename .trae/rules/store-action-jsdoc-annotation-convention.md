## Store Action 方法标准化 JSDoc 注释约定

### 规则描述

所有 store action 方法必须附带标准化的 JSDoc 注释块，包含以下标签：

- **标题行**：`[方法名 - 中文功能描述]`，方括号包裹，描述方法功能
- **`@reads`**：列出该方法读取的 StoreState 字段（无读取写 `无`）
- **`@writes`**：列出该方法写入的 StoreState 字段
- **`@see`**：每个桥接实现（`shared/ipc.ts`、`mock-bridge.ts`、`preview-bridge/index.ts`）各一行，标注调用的 IPC 函数名

### 正确示例

```typescript
/**
 * [createSession - 创建新的会话]
 * @reads workspaceSlice.appInfo
 * @writes sessionSlice.sessions, sessionSlice.activeSessionId, sessionSlice.sessionDetails
 * @see shared/ipc.ts → conversation.createSession
 * @see mock-bridge.ts → conversation.createSession
 * @see preview-bridge/index.ts → conversation.createSession
 */
createSession: async (workspaceId?: WorkspaceID) => {
  // action 实现
}
```

### 错误示例

```typescript
// ❌ 错误：缺少 JSDoc 注释
createSession: async (workspaceId?: WorkspaceID) => { ... }

// ❌ 错误：注释不完整，缺少 @see 桥接引用
/**
 * [createSession]
 * @writes sessions
 */
createSession: async (workspaceId?: WorkspaceID) => { ... }

// ❌ 错误：标题不使用方括号
/**
 * createSession - 创建会话
 */
```

### 适用场景

所有 `stores/actions/` 目录下的 action 方法。此注释约定辅助维护者快速理解每个 action 的：

1. 影响哪些状态字段（`@reads`/`@writes`）
2. 调用哪些桥接接口（`@see`）
3. 功能用途（标题行）

新增 action 方法时必须遵循此约定。当前 354 处 `@reads/@writes/@see` 标签分布在 18 个 action 文件中。