# 第五阶段：Store 集成指南

## 目标

将大型 `store.ts` 拆分为多个切片（slices），实现 Zustand 最佳实践，同时保持完全向后兼容。

## 架构概述

```
store.ts (主 Store)
├── slices/
│   ├── workspaceSlice.ts  # 工作区相关状态
│   ├── sessionSlice.ts   # 会话相关状态
│   ├── editorSlice.ts    # 编辑器相关状态
│   ├── patchSlice.ts     # 补丁相关状态
│   └── ...
└── 使用 combine + slices 模式
```

## 实现模式

### 1. 切片文件结构

每个切片文件应该包含：
- State 类型定义
- Actions 实现
- 选择器（可选）

### 2. 主 Store 组合

```typescript
// store.ts
import { create } from 'zustand';
import { combine } from 'zustand/vanilla';

const workspaceSlice = (set) => ({
  appInfo: undefined,
  recentWorkspaces: [],
  workspaceTree: [],
  // ...
});

const sessionSlice = (set) => ({
  sessions: [],
  activeSessionId: undefined,
  sessionDetails: {},
  // ...
});

export const useStore = create(
  combine(
    {
      // 初始状态
    },
    (set, get) => ({
      // 组合所有切片
      ...workspaceSlice(set, get),
      ...sessionSlice(set, get),
      // 其他切片...
    })
  )
);
```

## 重构步骤

### Step 1: 创建 workspaceSlice.ts

提取工作区相关的状态和逻辑到独立文件。

### Step 2: 创建 sessionSlice.ts

提取会话相关的状态和逻辑。

### Step 3: 创建 editorSlice.ts

提取编辑器相关的状态和逻辑。

### Step 4: 创建 patchSlice.ts

提取补丁相关的状态和逻辑。

### Step 5: 更新 store.ts

使用 combine 模式组合所有切片。

## 优势

1. **代码组织更清晰**: 每个领域有独立的文件
2. **易于维护**: 修改一个领域不影响其他领域
3. **测试友好**: 可以单独测试每个切片
4. **可扩展**: 添加新切片非常容易
5. **类型安全**: 完整的 TypeScript 支持

## 注意事项

1. **保持向后兼容**: 不要改变 API 契约
2. **渐进式重构**: 一次只重构一个切片
3. **充分测试**: 每个切片重构后都要测试
4. **文档化**: 为每个切片编写文档

## 当前状态

✅ slices.ts 已创建，定义了所有切片的接口类型

⏸️ 下一步：实现具体的切片文件
