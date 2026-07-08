# Zustand 状态管理模式

> 源码路径：`ai-digital-life/frontend/src/app/stores/`

## 架构概览

```
stores/
├── slicedStore.ts          # 合并入口（create）
├── StoreState.ts           # 完整类型定义
├── slices.ts               # 切片统一导出
├── selectors.ts            # 选择器
├── cacheHelpers.ts         # 缓存系统 + 错误处理工具
├── storageHelpers.ts       # localStorage 持久化工具
├── constants.ts            # 常量
├── slices/                 # 24 个状态切片
└── actions/                # 25 个 action 模块
```

核心模式：通过 `slicedStore.ts` 将 24 个状态切片 + 25 个 Action 模块合并为单一 Store。组件通过 `useAppStore` 统一访问。

## slicedStore 合并模式

```typescript
// slicedStore.ts — 合并入口
export const useSlicedAppStore = create<StoreState>((set, get) => ({
  // 状态切片（24 个）
  ...createUISlice(set, get),
  ...createWorkspaceSlice(set, get),
  ...createGitSlice(set, get),
  // ... 更多切片

  // 根级状态
  loading: true,
  error: undefined,
  isFetching: {},

  // Action 模块（25 个）
  ...createWorkspaceActions(set, get),
  ...createSessionActions(set, get),
  ...createFetchActions(set, get),
  // ... 更多 action
}));

export const useAppStore = useSlicedAppStore;
```

## 切片设计

24 个切片分为 4 组：

| 组 | 切片 | 职责 |
|----|------|------|
| 核心 | uiSlice, workspaceSlice, sessionSlice, editorSlice | 基础 UI/数据 |
| 工具 | agentSlice, commandSlice, taskSlice, compactionSlice, webToolsSlice, permissionSlice | Agent 工具 |
| 集成 | mcpSlice, providerSlice, referenceSlice, durableSlice | 外部系统 |
| 面板 | browserSlice(5), terminalSlice, ciSlice, githubSlice(3) | UI 面板 |
| 基础设施 | toastSlice, clipboardSlice, searchSlice | 全局服务 |

每个切片文件模板：
```typescript
// slices/uiSlice.ts
export function createUISlice(
  set: StoreApi<StoreState>['setState'],
  get: () => StoreState
) {
  return {
    // 状态字段
    sidebarOpen: true,
    chatMode: 'normal',

    // 切片内 action（纯本地状态操作）
    toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  };
}
```

## Action 模块模式

25 个 action 模块位于 `stores/actions/`，处理跨切片的异步操作和 IPC 调用。

```typescript
// actions/workspaceActions.ts
export function createWorkspaceActions(
  set: StoreApi<StoreState>['setState'],
  get: () => StoreState
) {
  return {
    renameWorkspaceFile: async (relativePath: string, newName: string) => {
      clearError(get);                          // ① 清空 error
      const result = await window.digitalLife.workspace.renameFile(relativePath, newName);
      if (!result.ok) {
        captureError(get, result.error);        // ② 捕获错误
        return;
      }
      await get().refreshWorkspaceTree();        // ③ 调用其他 action
    },
  };
}
```

## cacheHelpers 错误处理工具

定义于 `stores/cacheHelpers.ts`。

| 函数 | 用途 | 签名 |
|------|------|------|
| `clearError` | 清空全局 error | `(get: () => StoreState) => void` |
| `captureError` | 捕获错误（string/Error/object） | `(get: () => StoreState, error: unknown) => void` |
| `captureTypedError` | 类型化捕获（支持 AppError 子类） | `(get: () => StoreState, error: unknown) => void` |
| `setError` | 直接设置错误消息 | `(get: () => StoreState, message: string) => void` |

Action 规范：
- 每个 mutation action 入口第一行调用 `clearError(get)`
- 每个异步 IPC 调用失败时调用 `captureError(get, error)`
- 优先使用 `captureTypedError` 替代 `captureError`
- 禁止静默吞下 IPC 错误（`if (!result.ok) return;` 无错误记录）

```typescript
// ✅ 正确模式
async function someAction() {
  clearError(get);
  const result = await bridge.someCall();
  if (!result.ok) {
    captureTypedError(get, result.error);
    return;
  }
  // 处理结果
}
```

Rust AppError 与前端错误类的映射：
```
Rust AppError 变体  →  IPC 错误码  →  前端 AppError 子类（16 个）
                                         └─ NotFoundError / InvalidInputError
                                         └─ StorageError / WorkspaceError
                                         └─ ConfigError / IOError / MigrationError
                                         └─ SecurityError / ApprovalRequiredError
                                         └─ PatchError / TerminalError / ModelError
                                         └─ InternalError / NetworkError
                                         └─ InvokeError / PreviewApiError
```

前端定义于 `shared/typedErrors.ts`，通过 `fromIpcErrorCode(code, message)` 工厂映射。

## isFetching Loading 模式

```typescript
// StoreState 中定义
interface StoreState {
  isFetching: Record<string, boolean>;
}

// Action 中使用
async function fetchIndexStatus() {
  get().setIsFetching('fetchIndexStatus', true);
  try {
    const result = await bridge.fetchIndexStatus();
    // ...
  } finally {
    get().setIsFetching('fetchIndexStatus', false);
  }
}

// 组件中消费
const isFetching = useAppStore((s) => s.isFetching['fetchIndexStatus']);
```

- key 命名为函数名，如 `"fetchIndexStatus"`、`"fetchGitStatus"`
- 使用 `finally` 块确保 loading 重置

## StorageHelpers localStorage 模式

定义于 `stores/storageHelpers.ts`。

| 函数 | 用途 |
|------|------|
| `readJson<T>(key, fallback)` | 读取并解析 JSON |
| `writeJson(key, value)` | 写入 JSON（捕获 QuotaExceededError） |
| `readNumber(key, fallback, min, max)` | 读取数字并 clamp |
| `writeNumber(key, value)` | 写入数字 |
| `readFlag(key, fallback)` | 读取布尔标志（"1"/"0"） |
| `writeFlag(key, value)` | 写入布尔标志 |
| `createDebouncedWrite(waitMs)` | 创建防抖批量写入 |
| `scheduleCrossSliceWrite` | 跨切片防抖写入（50ms） |

规则：
- 所有 `localStorage` 写入必须捕获 `QuotaExceededError`
- 批量写入使用 `createDebouncedWrite` 合并写入

## Selector 模式（useShallow）

```typescript
import { shallow } from 'zustand/shallow';

// ✅ 正确 — 使用 shallow 比较避免不必要渲染
const { sidebarOpen, chatMode } = useAppStore(
  (s) => ({ sidebarOpen: s.sidebarOpen, chatMode: s.chatMode }),
  shallow
);

// ✅ 单个字段 — 无需 shallow
const sidebarOpen = useAppStore((s) => s.sidebarOpen);
```

## 文件参考

| 路径 | 职责 |
|------|------|
| `stores/slicedStore.ts` | Store 合并入口 + create 调用 |
| `stores/StoreState.ts` | 完整类型定义 |
| `stores/slices.ts` | 切片统一 export |
| `stores/selectors.ts` | 选择器 |
| `stores/cacheHelpers.ts` | 缓存系统 + clearError/captureError/captureTypedError/setError |
| `stores/storageHelpers.ts` | localStorage 持久化工具 |
| `stores/constants.ts` | 常量 |
| `stores/slices/` | 24 个状态切片（每文件一个切片） |
| `stores/actions/` | 25 个 action 模块 |
| `shared/typedErrors.ts` | 前端 AppError 子类（16 个） |
