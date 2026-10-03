---
description: React 最新值 Ref 镜像模式——在 effect/事件监听/观察者回调中读取最新 props/state，避免过期闭包与监听器重绑
globs: ai-digital-life/frontend/**/*.ts,ai-digital-life/frontend/**/*.tsx
alwaysApply: false
---

# React 最新值 Ref 镜像模式（避免过期闭包）

## 规则描述

在 `useEffect`、全局事件监听器、观察者回调或长生命周期回调中需要读取「最新」的 props / state / 回调时，不要把它们放进 effect 依赖数组导致监听器反复重绑，也不要在闭包里直接读取会过期的变量。标准做法是在**渲染阶段**把值镜像到一个 ref。

## 正确示例

```tsx
const callbacksRef = useRef(callbacks);
callbacksRef.current = callbacks; // 每次渲染同步（渲染阶段赋值，无副作用）

useEffect(() => {
  const onKeyDown = (e: KeyboardEvent) => {
    COMMAND_HANDLERS[match.id]?.(callbacksRef.current); // 始终读最新
  };
  window.addEventListener('keydown', onKeyDown);
  return () => window.removeEventListener('keydown', onKeyDown);
}, [keybinds]); // 依赖仅稳定值，不随每次 render 重建
```

## 关键点

- 赋值放在组件**渲染阶段**（`ref.current = value`），不要放进 `useEffect`（会有一帧延迟）。
- 依赖数组只保留稳定值（keybinds、activeId 等），函数对象字面量、大对象不进依赖。
- 多个子 Hook 共用值时，在父 Hook 内集中镜像（如 `useBrowserViewHost` 的 `activeTabRef` / `overlayActiveRef`）。

## 错误示例

```tsx
// ❌ 回调进入依赖：父组件每次 render 传新对象 → 每次 render 都 remove/addEventListener
useEffect(() => {
  window.addEventListener('keydown', (e) => callbacks.onKey(e));
  return () => window.removeEventListener('keydown', ...);
}, [callbacks]); // callbacks 每次都是新引用
```

## 适用场景

- 键盘/全局事件监听、ResizeObserver 回调、requestAnimationFrame 回调中需要读最新 props/state。
- 向 `React.memo` 子组件或订阅型 Hook 传函数对象字面量时。
- 参考实现：`useKeyboardShortcuts.ts`、`useKeyCapture.ts`、`useBrowserViewHost.ts`、`SafeIframe.tsx`、`ToastCard.tsx`。
