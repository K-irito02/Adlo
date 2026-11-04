---
description: createLazyLoader factory pattern for workspace-ID-scoped lazy data loading with automatic guard and loading state management
globs: adlo/frontend/**/*.ts,adlo/frontend/**/*.tsx
alwaysApply: false
---

# createLazyLoader 惰性数据加载工厂模式

## 规则描述

对于需要按工作区 ID 懒加载的数据（如文件树、Git 快照），使用 `createLazyLoader<T>()` 工厂函数创建加载器。工厂接收 5 个回调：fetchFn（数据获取）、getGuardState（守卫检查）、getInitialState/getSuccessState/getErrorState（状态转换），返回一个带自动守卫的惰性加载函数。

## 正确示例

```typescript
import { createLazyLoader } from '../shared';

// 在 action 创建器中使用
loadMyData: createLazyLoader<MyDataType>(
  // 1. 数据获取函数
  (path) => window.digitalLife.myDomain.fetchData(path),
  // 2. 守卫状态：已加载或正在加载则跳过
  (s, id) => ({ hasData: !!s.myData[id], isLoading: !!s.myDataLoading[id] }),
  // 3. 初始状态：设置 loading
  (g, id) => ({ myDataLoading: { ...g().myDataLoading, [id]: true } }),
  // 4. 成功状态：写入数据、清除 loading
  (g, id, data) => ({
    myData: { ...g().myData, [id]: data },
    myDataLoading: { ...g().myDataLoading, [id]: false },
  }),
  // 5. 错误状态：清除 loading、记录错误
  (g, id, msg) => ({
    myDataLoading: { ...g().myDataLoading, [id]: false },
    myDataErrors: { ...g().myDataErrors, [id]: msg },
  }),
)(set, get),
```

## 错误示例

```typescript
// 手动实现守卫逻辑（重复样板）
loadMyData: async (workspaceId, workspacePath) => {
  const state = get();
  if (state.myData[workspaceId]) return; // 重复守卫
  set({ myDataLoading: { ...state.myDataLoading, [workspaceId]: true } });
  const result = await fetchData(workspacePath);
  if (!result.ok) {
    set({ myDataLoading: { ...state.myDataLoading, [workspaceId]: false } });
    return;
  }
  set({ myData: { ...state.myData, [workspaceId]: result.data } });
};
```

## 适用场景

- 按工作区 ID 分片的懒加载数据（文件树、Git 快照、变更预览等）
- 需要自动守卫（已加载则跳过重复请求）的场景
- 加载状态需要按 ID 细粒度管理的场景