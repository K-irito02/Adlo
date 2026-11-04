---
description: 前端测试文件必须放置在待测模块同级目录下的 __tests__/ 子目录中
globs: adlo/frontend/src/**
alwaysApply: false
---

## 前端测试文件 `__tests__/` 就近放置

### 规则描述

所有前端测试文件必须放置在待测模块同级目录下的 `__tests__/` 子目录中，而非集中在单一的 `__tests__/` 根目录。这保证了测试与源码的紧密关联关系，方便模块重构时同时移动或删除。

### 目录结构示例

```
stores/
├── slicedStore.ts
├── StoreState.ts
├── __tests__/           # 对应 stores/ 目录的测试
│   ├── captureTypedError.test.ts
│   └── storeState-branded.test.ts
├── slices/
│   ├── uiSlice.ts
│   ├── sessionSlice.ts
│   └── __tests__/       # 对应 slices/ 子目录的测试
│       ├── sessionSlice.test.ts
│       └── terminalSlice.test.ts
└── actions/
    └── __tests__/       # 对应 actions/ 子目录的测试
        ├── generalActions.test.ts
        └── workspaceLoadOrder.test.ts
```

### 正确示例

```
kernel/
├── errors.ts
├── index.ts
└── __tests__/
    ├── errors.test.ts
    └── types.test.ts
```

### 错误示例

```
// 测试文件放在源码同一层级或命名不一致
kernel/
├── errors.ts
├── errors.test.ts     # 不应平铺在源码目录

// 所有测试集中到顶层目录
frontend/__tests__/     # 不应集中放置
```

### 适用场景

所有前端 TypeScript/React 测试文件（`.test.ts`、`.test.tsx`）。注意此模式目前仅在前端使用，Rust 测试仍使用 `#[cfg(test)]` 内联或 `tests/` 集成测试目录。
