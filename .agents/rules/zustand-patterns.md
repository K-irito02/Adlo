---
description: Zustand state management patterns, selectors, and store architecture
globs: ai-digital-life/frontend/**/*.ts,ai-digital-life/frontend/**/*.tsx
alwaysApply: false
---

# Zustand 状态管理模式

## Store 创建
- 使用 `create<T>((set, get) => ({ ...slices, ...actions }))` 切片合并模式
- 所有切片定义在 `slices/` 目录，跨切片 action 定义在 `actions/` 目录
- `set` 参数类型必须为 `StoreApi<StoreState>["setState"]`，禁止使用 `any`
- 根级 Store 导出统一为 `useAppStore`，附加编译期类型断言

## 选择器规则
- 从 Store 选择对象或数组时，必须使用 `useShallow`
- 选择原始值（`boolean`、`string`、`number`）时，禁止使用 `useShallow`（增加不必要的比较开销）
- 禁止使用对象展开选择器 `(state) => ({ a: state.a, b: state.b })`（Zustand v5 中会导致无限循环）
- 每个组件只选择自己需要的字段，禁止选择整个 slice 或 `useAppStore()` 无参调用

## Selector 双模式（get* + use*）

每个领域选择器同时提供纯函数版本（`get*`）和 React Hook 版本（`use*`），分场景使用：

```ts
// 定义在 selectors.ts 中
export const patchSelectors = {
  // 纯函数 — action 内部使用
  getActivePatchSet: (state: StoreState) => state.activePatchSet,

  // Hook — 组件使用，对象/数组用 useShallow
  useActivePatchSet: () => useAppStore(useShallow((s) => s.activePatchSet)),

  // 派生选择器
  hasActivePatchSet: (state: StoreState) => Boolean(state.activePatchSet),
  useHasActivePatchSet: () => useAppStore((s) => Boolean(s.activePatchSet)),
};
```

- 返回对象/数组的 Hook 使用 `useShallow` 包裹，原始值不需要
- 纯函数版本用于 action 中通过 `get()` 读取状态
- 领域 selector 按文件拆分（`workspaceSelectors.ts`、`sessionSelectors.ts` 等）

## 非响应式读取
- 在 `useCallback` / `useEffect` 闭包中需要最新值时，使用 `useAppStore.getState()` 而非闭包捕获的变量
- 示例：terminal 创建时读取 `defaultTerminalProfile` 应使用 `useAppStore.getState().defaultTerminalProfile`

## localStorage 持久化
- 使用 `storageScheduler` 进行异步批量写入，禁止同步 `localStorage.setItem()` 在渲染路径中
- storageScheduler 使用 `requestIdleCallback`（超时 500ms）+ `setTimeout` 回退

## LRU + TTL 缓存

文件文档和变更预览使用基于 Map 的 LRU（最近最少使用）+ TTL（过期时间）缓存：

```ts
// 缓存结构
type TTLCacheEntry<V> = { value: V; expiresAt: number };

// 读取时自动检查过期 + LRU 移动（delete + set 移到末尾）
function getCachedLruTTL<V>(cache: Map<string, TTLCacheEntry<V>>, key: string): V | undefined {
  const entry = cache.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) { cache.delete(key); return undefined; }
  cache.delete(key);
  cache.set(key, entry);
  return entry.value;
}

// 设置时驱逐超出限制的最旧条目
function setCachedLruTTL<V>(cache, key, value, limit, ttlMs): void {
  if (cache.has(key)) cache.delete(key);
  cache.set(key, { value, expiresAt: Date.now() + ttlMs });
  while (cache.size > limit) { cache.delete(cache.keys().next().value); }
}
```

| 缓存 | TTL | 限制 |
|------|-----|------|
| 文件文档 | 5 分钟 | 32 条目 |
| 变更预览 | 1 分钟 | 32 条目 |

配合请求序列号（`fileRequestSeq`）防止过时请求覆盖最新数据。

## Slice 设计
- 每个 slice 专注单一领域（UI / workspace / git / session / editor / patch / search / diagnostic / task / command / clipboard / terminal）
- slice 文件命名：`{domain}Slice.ts`
- slice 接口和创建函数分别导出：`export interface XxxSlice { ... }` + `export function createXxxSlice(...)`
- 新增 slice 必须在 `StoreState.ts` 中注册
- **slice 文件阈值 400 行**：超出时按以下优先级提取辅助文件
  - 类型提取：`{domain}Types.ts`（接口、类型别名）
  - 纯函数辅助：`{domain}Utils.ts` 或 `{domain}SliceHelpers.ts`（无副作用的计算函数、递归遍历等）
  - 子 action 提取：`{domain}TreeActions.ts` 等（按操作子域命名，使用 `create{Domain}SubActions(set, get)` 模式）
  - 跨切片共享：`{domain}SliceShared.ts` 作为 leaf module（不导入任何切片），承载跨切片类型/常量，打破循环依赖
- **跨切片循环依赖打破**：当 slice A ↔ slice B 互相导入类型/常量时，创建 `{domain}SliceShared.ts` leaf module 作为单一来源，所有切片导入 shared，shared 不导入任何切片

## 选择器反模式检查表

### 错误示例（必须避免）
```tsx
// ❌ 全量订阅（最大粒度）
const state = useAppStore();

// ❌ 每次渲染创建新对象（无 useShallow）
const { tabs, activeTabId } = useAppStore((s) => ({
  tabs: s.browserTabs,
  activeTabId: s.browserActiveTabId,
}));

// ❌ 跨切片大对象选择器
const props = useAppStore((s) => ({
  a: s.a,
  b: s.b,
  c: s.c,
  d: s.d,
  // ... 10+ 字段
}));

// ❌ ?? {} 字面量回退 — 每次渲染创建新对象，触发 useSyncExternalStore 无限循环
const keybinds = useAppStore((s) => s.appInfo?.config?.keybinds ?? {});
```

### 正确示例（推荐模式）
```tsx
// ✅ 单一字段（无需 useShallow）
const browserTabs = useAppStore((s) => s.browserTabs);

// ✅ 多字段（必须 useShallow）
const { browserTabs, browserActiveTabId } = useAppStore(
  useShallow((s) => ({
    browserTabs: s.browserTabs,
    browserActiveTabId: s.browserActiveTabId,
  }))
);

// ✅ 非响应式读取（回调中）
const profile = useAppStore.getState().defaultTerminalProfile;

// ✅ ?? 回退使用模块级常量 — 始终返回同一引用
const EMPTY_OBJ: Record<string, string | undefined> = {};
const keybinds = useAppStore((s) => s.appInfo?.config?.keybinds ?? EMPTY_OBJ);
```

### 选择器优化审查清单（每次修改组件后）
- [ ] 是否存在 `useAppStore()` 无参调用？
- [ ] 对象/数组选择器是否使用了 `useShallow`？
- [ ] 是否选择了不必要的 slice 级别字段？
- [ ] 回调闭包内是否应改用 `getState()`？
- [ ] 频繁更新的字段（如 `isFetching`）是否与低频字段分离？
- [ ] selector 中是否存在 `?? {}` / `?? []` 字面量回退？

## 禁止项
- 禁止 `set: any` 类型
- 禁止在组件渲染路径中直接调用 `localStorage.setItem()`
- 禁止 `useAppStore((s) => ({ ... }))` 对象展开选择器
- 禁止 selector 返回新创建的对象或数组（每次渲染都触发更新）
- 禁止 selector 中使用 `?? {}` / `?? []` 等字面量回退值（每次渲染创建新引用，导致 `useSyncExternalStore` 无限循环）