# Zustand 状态管理模式（索引）

> **体裁变更**：本文件原为实现快照，现已精简为索引。规范性约束以 `.agents/rules/` 为准；准确计数以 `slicedStore.ts` / `actions/` 实测为准（`adlo/AGENTS.md` 不复制计数）。
> 源码路径：`adlo/frontend/src/app/stores/`

## 阅读地图

| 想了解 | 去哪里 |
|--------|--------|
| Store 架构、选择器、Slice 设计、持久化 | `.agents/rules/zustand-patterns.md` |
| localStorage 中心登记表架构 | `.agents/rules/localstorage-central-registry-persistence-architecture.md` |
| 惰性加载工厂 | `.agents/rules/createlazyloader-factory-pattern.md` |
| Store action 注释规范 | `.agents/rules/store-action-jsdoc-annotation-convention.md` |
| 切片合并真源 | `frontend/src/app/stores/slicedStore.ts` |
| 完整类型接口 | `frontend/src/app/stores/StoreState.ts` |

## 实现备注（快照摘录，细节以源码为准）

- 切片合并：`slicedStore.ts` 以展开合并状态切片 + action 模块，统一导出 `useAppStore`。
- 错误处理：mutation 入口 `clearError(get)`，IPC 失败 `captureError/captureTypedError`（见 `stores/cacheHelpers.ts`），禁止静默吞错。
- Loading：`isFetching: Record<string, boolean>`，key 取函数名，`finally` 重置。
- 持久化：经中心登记表统一写盘（registry + 唯一写盘入口），写入捕获 `QuotaExceededError`。
- 选择器：对象选择配 `useShallow`；单原始值直接选。
