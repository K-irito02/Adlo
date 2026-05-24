# ChangesPanel 组件拆分计划

**生成日期：2026-05-24

## 一、概述

`ChangesPanel.tsx 目前有 1195 行代码，职责过多，需要拆分为多个组件以提高可维护性。

## 二、当前组件分析

### 主要职责区域

1. **状态管理** (约 300+ 行)
   - 本地 UI 状态
   - 编辑器相关状态
   - 分支状态

2. **业务逻辑** (约 400+ 行)
   - 事件处理
   - 上下文菜单
   - 导航逻辑

3. **渲染** (约 400+ 行)
   - 变更导航器
   - 补丁审查
   - 变更预览

## 三、拆分方案

### 3.1 拆分的新组件

| 组件名 | 文件位置 | 职责 |
| ---- | ---- | ---- |
| **1. PatchReviewSummary | ./panels/PatchReviewSummary.tsx | 补丁审查摘要和统计 |
| **2. PatchFileCard | ./panels/PatchFileCard.tsx | 单个补丁文件卡片 |
| **3. PatchHunkCard | ./panels/PatchHunkCard.tsx | 单个补丁块卡片 |
| **4. ChangesContextMenu | ./panels/ChangesContextMenu.tsx | 变更文件上下文菜单 |
| **5. ChangesNavigator | ./panels/ChangesNavigator.tsx | 变更导航区域 |
| **6. ChangesPreviewEditor | ./panels/ChangesPreviewEditor.tsx | 变更预览编辑器 |
| **7. ChangesPanelHooks | ./hooks/useChangesPanel.tsx | 共享 hooks |

## 四、实现步骤

### 阶段 1：提取 Hooks

#### Step 1.1 提取 `useChangesPanel` hook

**文件**：`frontend/src/app/regions/right-panel/panels/hooks/useChangesPanel.tsx

- 从 ChangesPanel.tsx 中提取：
  - 所有状态声明
  - 所有 useMemo、useCallback、useEffect
  - 所有事件处理函数

```typescript
export function useChangesPanel(props: RightPanelViewProps) {
  // 现有状态和逻辑
  return {
    // 返回所有状态和处理函数
  };
}
```

### 阶段 2：提取子组件

#### Step 2.1 提取 `PatchReviewSummary`

**文件**：`frontend/src/app/regions/right-panel/panels/PatchReviewSummary.tsx

- 从第 797-849 行的 Patch Review Summary 区域
- 包含统计显示和过滤器 UI

#### Step 2.2 提取 `PatchFileCard`

**文件**：`frontend/src/app/regions/right-panel/panels/PatchFileCard.tsx

- 包含第 851-986 行的 Patch 文件卡片
- 包含进度条和文件头信息

#### Step 2.3 提取 `PatchHunkCard`

**文件**：`frontend/src/app/regions/right-panel/panels/PatchHunkCard.tsx

- 包含第 895-980 行的单个补丁块卡片

#### Step 2.4 提取 `ChangesContextMenu`

**文件**：`frontend/src/app/regions/right-panel/panels/ChangesContextMenu.tsx

- 包含第 423-542 行的上下文菜单逻辑

#### Step 2.5 提取 `ChangesNavigator`

**文件**：`frontend/src/app/regions/right-panel/panels/ChangesNavigator.tsx

- 包含第 709-782 行的导航区域

#### Step 2.6 提取 `ChangesPreviewEditor`

**文件**：`frontend/src/app/regions/right-panel/panels/ChangesPreviewEditor.tsx

- 包含第 992-1110 行的预览编辑器区域

### 阶段 3：重构主组件

#### Step 3.1 重构 ChangesPanel

**文件**：`frontend/src/app/regions/right-panel/panels/ChangesPanel.tsx

- 用提取的 Hooks 和子组件重构
- 保留组件变为纯粹的组合器和状态管理

### 阶段 4：测试验证

#### Step 4.1 运行测试
- 确保组件拆分后功能无回归
- 完整测试 TypeScript 类型正确性
- 完整测试现有功能

## 五、文件变更列表

| 操作 | 文件路径 |
| ---- | ---- |
| **创建** | `hooks/useChangesPanel.tsx |
| **创建** | PatchReviewSummary.tsx |
| **创建** | PatchFileCard.tsx |
| **创建** | PatchHunkCard.tsx |
| **创建** | ChangesContextMenu.tsx |
| **创建** | ChangesNavigator.tsx |
| **创建** | ChangesPreviewEditor.tsx |
| **修改** | ChangesPanel.tsx |

## 六、风险考虑

1. **数据传递复杂度：需要谨慎传递所有 props
2. **状态共享**: 需仔细处理状态提升
3. **测试覆盖**: 需完整测试重构后的功能

## 七、验收标准

1. 所有现有测试全部通过
2. TypeScript 类型检查通过
3. 无控制台错误
4. 功能与之前一致
5. 代码可维护性提升
6. 各组件职责单一清晰
