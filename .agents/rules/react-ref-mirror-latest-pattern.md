---
description: React 最新值 Ref 镜像模式——在 effect/事件监听/观察者回调中读取最新 props/state，避免过期闭包与监听器重绑
globs: adlo/frontend/**/*.ts,adlo/frontend/**/*.tsx
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

## 例外：读取方是同一次提交内的被动 effect 时，改用提交后同步

渲染阶段写 ref 是**非纯操作**，React 官方建议不在渲染期读写 ref（并发渲染下被放弃的那次渲染可能写入错误值）。当唯一读取方是**同一次提交中的另一个 `useEffect`**（而非任意时刻可能触发的事件回调）时，把镜像改为**提交后同步**更安全且行为等价：

```tsx
const currentRef = useRef(current);
useEffect(() => {
  currentRef.current = current; // 无依赖：每次提交后同步
}); // 声明顺序在读取它的 effect 之前 → 同一次提交内先同步后读取，无陈旧值
```

判定要点：**「一帧延迟」只在读取方可能于渲染与被动 effect 之间被触发时才有害**（事件监听/观察者回调等）。若读取方本身也是被动 effect，二者在同一次提交按声明顺序执行，不存在窗口期。

- 参考实现：`MarkdownThemeSelector.tsx`（`currentRef` 的读取方是「打开菜单」effect，故用提交后同步）。
- 反之，若读取方是长生命周期事件回调（本文件首节的标准场景），仍按上文在**渲染阶段**镜像。
