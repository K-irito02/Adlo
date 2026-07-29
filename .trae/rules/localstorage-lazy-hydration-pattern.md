---
description: Zustand slice localStorage lazy hydration pattern with requestIdleCallback and _defaultsHydrated guard
globs: ai-digital-life/frontend/**/*.ts,ai-digital-life/frontend/**/*.tsx
alwaysApply: false
---

# localStorage 惰性水合模式（Lazy Hydration）

## 规则描述

Zustand slice 中需要从 localStorage 恢复的持久化状态，必须使用惰性水合模式：在 slice 创建时通过 `requestIdleCallback`（优先）或 `setTimeout`（回退）延迟执行读取操作，并使用模块级 `_defaultsHydrated` 布尔守卫确保仅执行一次。

## 正确示例

```typescript
let _defaultsHydrated = false;

function hydrateDefaults(get, set) {
  if (_defaultsHydrated) return;
  _defaultsHydrated = true;

  const doHydrate = () => {
    const state = get();
    const savedValue = readJson(STORAGE_KEY, defaultValue);
    set({ myField: savedValue });
  };

  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(doHydrate, { timeout: 1000 });
  } else {
    setTimeout(doHydrate, STORAGE_HYDRATION_DELAY_MS);
  }
}

export const createMySlice = (set, get) => {
  hydrateDefaults(get, set); // 触发惰性水合，不阻塞 slice 创建
  return { /* slice 初始默认值 */ };
};
```

## 错误示例

```typescript
// 同步读取 localStorage（阻塞首屏渲染）
export const createMySlice = (set, get) => {
  const savedValue = readJson(STORAGE_KEY, defaultValue); // 同步 I/O
  return { myField: savedValue };
};

// 缺少 _defaultsHydrated 守卫，每次渲染都重新读取
function hydrateDefaults(get, set) {
  setTimeout(() => {
    const savedValue = readJson(STORAGE_KEY, defaultValue);
    set({ myField: savedValue });
  }, 200);
}
```

## 适用场景

- 所有 Zustand slice 中需要从 localStorage 恢复初始值的状态字段
- 优先使用 `requestIdleCallback`，不可用时回退到 `STORAGE_HYDRATION_DELAY_MS`（200ms）
- 水合函数必须在 slice 创建时立即调用，但不阻塞 slice 返回