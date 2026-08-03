
# 多工作区文件选择问题修复

## 问题描述

在右侧面板文件功能和变更功能中，有两个主要问题：

1. **非当前工作区文件/变更点击报错**：点击非当前激活工作区的文件或变更时，会提示 "ENOENT: no such file or directory" 错误
2. **相同文件名同时高亮**：不同工作区中相同路径/文件名的文件或变更会同时显示选中状态

## 问题原因

### 问题 1：非当前工作区文件点击报错

- 原 `openFile` 方法总是尝试从当前激活的工作区加载文件
- 没有能力指定从哪个工作区加载文件
- 桥接层的 `readFile` 方法只接受相对路径，没有工作区信息

### 问题 2：相同文件名同时高亮

- 选中状态只通过 `selectedFilePath` 相对路径判断
- 没有考虑文件属于哪个工作区
- 多个工作区有相同路径的文件时，都会匹配到

## 解决方案

### 1. 添加工作区选中标识状态

在 StoreState 中添加新字段：
```typescript
interface EditorSlice {
  selectedFileWorkspaceId: string | undefined;
  selectedChangePreviewWorkspaceId: string | undefined;
}
```

### 2. 添加 openFileForWorkspace 和 openChangePreviewForWorkspace 方法

新增方法，支持指定工作区打开文件或变更：
```typescript
openFileForWorkspace: (
  workspaceId: string,
  workspacePath: string,
  relativePath: string
) => Promise<void>;

openChangePreviewForWorkspace: (
  workspacePath: string,
  relativePath: string
) => Promise<void>;
```

### 3. 更新桥接层

在所有桥接实现中添加对应方法：
- `ipc.ts` - WorkspaceBridge 接口添加 `readFileForWorkspace`
- `mock-workspace.ts` - 模拟数据实现
- `tauri-bridge.ts` - Tauri 模式实现
- `preview-bridge/index.ts` - 预览模式实现

### 4. 更新组件层

**文件面板**：
- `MultiWorkspaceFileTree` - 添加 `selectedFileWorkspaceId` 属性和 `onOpenFileForWorkspace` 回调
- `WorkspaceFileTreeEntry` - 只有当 `selectedFileWorkspaceId` 匹配当前工作区时才高亮

**变更面板**：
- `MultiWorkspaceChangesTree` - 添加 `selectedChangePreviewWorkspaceId` 属性
- `WorkspaceChangesEntry` - 实现工作区筛选逻辑

## 修改的文件列表

### 状态管理与类型
- `frontend/src/app/stores/StoreState.ts` - 添加类型定义
- `frontend/src/app/stores/slices/editorSlice.ts` - 更新状态和方法
- `frontend/src/app/stores/actions/editorActions.ts` - 实现新的方法
- `frontend/src/app/hooks/useAppActions.ts` - 导出新方法

### 桥接层
- `frontend/src/shared/ipc.ts` - 更新接口
- `frontend/src/mock/mock-workspace.ts` - 模拟实现
- `frontend/src/tauri-bridge.ts` - Tauri 实现
- `frontend/src/preview-bridge/index.ts` - 预览实现

### 组件层
- `frontend/src/app/features/workspace-file-tree/MultiWorkspaceFileTree.tsx` - 更新组件
- `frontend/src/app/features/workspace-file-tree/WorkspaceFileTreeEntry.tsx` - 更新组件
- `frontend/src/app/features/workspace-changes-tree/MultiWorkspaceChangesTree.tsx` - 更新组件
- `frontend/src/app/features/workspace-changes-tree/WorkspaceChangesEntry.tsx` - 更新组件
- `frontend/src/app/regions/right-panel/types.ts` - 更新类型
- `frontend/src/app/regions/right-panel/hooks/useRightPanelViewProps.ts` - 传递属性
- `frontend/src/app/regions/right-panel/panels/FilesPanel.tsx` - 传递属性
- `frontend/src/app/regions/right-panel/panels/ChangesPanel.tsx` - 传递属性
- `frontend/src/app/regions/right-panel/FileNavigatorShell.tsx` - 传递属性

**总计：19 个文件**

## 架构变化

### 状态模型

**之前**：
```typescript
{
  selectedFilePath: string | undefined;
}
```

**现在**：
```typescript
{
  selectedFilePath: string | undefined;
  selectedFileWorkspaceId: string | undefined;
  selectedChangePreviewPath: string | undefined;
  selectedChangePreviewWorkspaceId: string | undefined;
}
```

### 数据流变化

**打开文件/变更流程**：
1. 用户点击文件树中的文件
2. 组件判断是当前工作区还是其他工作区
3. 调用对应方法（`openFile` 或 `openFileForWorkspace`）
4. 系统设置 `selectedFilePath` 和 `selectedFileWorkspaceId`
5. 文件树组件根据这两个状态判断是否高亮

> 经验教训已迁移至 [knowledge-base/multi-workspace/file-selection-fix.md](../../knowledge-base/multi-workspace/file-selection-fix.md)

## 验证结果

✅ TypeScript 类型检查通过  
✅ 所有 183 个前端测试通过  
✅ 功能验证：
- 可以正常打开任何工作区的文件
- 可以正常打开任何工作区的变更预览
- 只有正确工作区的文件/变更会高亮
- 相同路径不同工作区的资源不会同时高亮

## 相关文档

- [AGENTS.md](../../../AGENTS.md) - 项目总览
- [ai-digital-life/AGENTS.md](../../../ai-digital-life/AGENTS.md) - 实现进度
