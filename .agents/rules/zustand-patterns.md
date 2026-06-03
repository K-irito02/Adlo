---
description: Zustand state management patterns, selectors, and store architecture
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

## 非响应式读取
- 在 `useCallback` / `useEffect` 闭包中需要最新值时，使用 `useAppStore.getState()` 而非闭包捕获的变量
- 示例：terminal 创建时读取 `defaultTerminalProfile` 应使用 `useAppStore.getState().defaultTerminalProfile`

## localStorage 持久化
- 使用 `storageScheduler` 进行异步批量写入，禁止同步 `localStorage.setItem()` 在渲染路径中
- storageScheduler 使用 `requestIdleCallback`（超时 500ms）+ `setTimeout` 回退

## Slice 设计
- 每个 slice 专注单一领域（UI / workspace / git / session / editor / patch / search / diagnostic / task / command / clipboard / terminal）
- slice 文件命名：`{domain}Slice.ts`
- slice 接口和创建函数分别导出：`export interface XxxSlice { ... }` + `export function createXxxSlice(...)`
- 新增 slice 必须在 `StoreState.ts` 中注册

## 禁止项
- 禁止 `set: any` 类型
- 禁止在组件渲染路径中直接调用 `localStorage.setItem()`
- 禁止 `useAppStore((s) => ({ ... }))` 对象展开选择器
- 禁止 selector 返回新创建的对象或数组（每次渲染都触发更新）
