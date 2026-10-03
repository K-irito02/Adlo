---
description: Tauri 事件订阅生命周期——异步 unlisten 幂等清理、未就绪/已取消竞态保护，优先复用 subscribeChannel
globs: ai-digital-life/frontend/src/tauri-bridge/**,ai-digital-life/frontend/src/app/**,ai-digital-life/frontend/src/shared/**
alwaysApply: false
---

# Tauri 事件订阅生命周期封装（异步 unlisten 幂等清理）

## 规则描述

Tauri v2 中 `listen()` 返回的 `unlisten` 在类型上是 `() => void`，但实际是异步的。事件订阅必须满足：

1. 订阅 Promise 尚未 resolve 时组件/消费者已卸载 → 拿到 `unlisten` 后立即调用，避免泄漏。
2. 清理对「未就绪 / 已取消」的订阅必须幂等（`ul?.()`）。
3. `unlisten()` 返回的 Promise 必须吞掉 rejection（`void Promise.resolve(unlisten()).catch(() => {})`），否则 teardown 时抛未处理 rejection。

优先复用统一封装 `subscribeChannel()`（`tauri-bridge/tauri-shared.ts`）：

```ts
export function subscribeChannel<T>(eventName: string, listener: (payload: T) => void): () => void {
  let active = true;
  let ul: UnlistenFn | undefined;
  void listen<T>(eventName, (event) => { if (active) listener(event.payload); })
    .then((unlisten) => {
      if (active) ul = unlisten;
      else void Promise.resolve(unlisten()).catch(() => {});
    });
  return () => { active = false; void Promise.resolve(ul?.()).catch(() => {}); };
}
```

## 错误示例

```ts
// ❌ 直接 listen 且忽略竞态与异步 unlisten：卸载后订阅泄漏，或 teardown 抛未处理 rejection
const unlisten = listen('x', handler);
return () => unlisten(); // 可能是 Promise，rejection 无人处理
```

## 适用场景

所有 `@tauri-apps/api/event` 的 `listen()` 订阅（桥接层、store 侧全局订阅、`pageMetaClient`、拖拽监听等）。新增 Tauri 事件订阅时优先复用 `subscribeChannel`，不要再手写 teardown。参考实现：`tauri-shared.ts`、`tauri-browser.ts`、`pageMetaClient.ts`、`useDragDropWorkspace.ts`。
