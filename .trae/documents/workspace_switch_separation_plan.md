
# 工作区选择与右侧面板分离计划

## 问题分析

当前实现存在以下问题：
1. 点击左侧边栏工作区时，会调用 `onOpenWorkspace`，这会切换当前工作区并影响右侧面板
2. 右侧面板没有默认加载所有工作区，只加载当前工作区
3. 用户希望：
   - 右侧面板始终显示所有工作区（文件、变更、终端）
   - 左侧工作区点击只影响中间对话区域
   - 点击工作区时切换到该工作区最近的对话，若无则创建新会话

## 实施步骤

### 1. 添加新的 store action：`switchToWorkspace`
- **文件**：`frontend/src/app/stores/actions/sessionActions.ts`
- **功能**：切换到指定工作区，只影响会话区域，不改变当前工作区
- **逻辑**：
  - 查找该工作区最近的会话
  - 如果有最近会话，切换到该会话
  - 如果没有，创建新会话
  - 不影响右侧面板的多工作区显示

### 2. 修改 `WorkspaceList` 组件
- **文件**：`frontend/src/app/regions/left-sidebar/WorkspaceList.tsx`
- **修改**：
  - 将工作区点击事件从 `onOpenWorkspace` 改为新的 `onSwitchToWorkspace`
  - 保持展开/折叠功能不变

### 3. 更新 `LeftSidebar` 组件
- **文件**：`frontend/src/app/regions/LeftSidebar.tsx`
- **修改**：
  - 添加新的 prop `onSwitchToWorkspace`
  - 传递给 `WorkspaceList` 组件

### 4. 确保 bootstrap 时加载所有工作区到右侧面板
- **文件**：`frontend/src/app/stores/actions/generalActions.ts`
- **修改**：
  - 在 `bootstrap` 函数中，确保所有可见工作区的初始展开状态正确设置
  - 触发工作区树的加载（按需加载，不阻塞）

### 5. 更新相关类型定义
- **文件**：`frontend/src/app/stores/StoreState.ts`
- **修改**：
  - 添加 `switchToWorkspace` action 类型定义

## 技术细节

### switchToWorkspace 逻辑
```typescript
switchToWorkspace: async (workspaceId: string, workspacePath: string) => {
  // 1. 查找该工作区最近的会话
  const state = get();
  const workspaceSessions = state.sessions.filter(
    s =&gt; s.workspaceId === workspaceId &amp;&amp; !s.archivedAt
  );
  
  if (workspaceSessions.length &gt; 0) {
    // 2. 找到最近的会话（按 lastMessageAt 排序）
    const recentSession = [...workspaceSessions].sort(
      (a, b) =&gt; (b.lastMessageAt || 0) - (a.lastMessageAt || 0)
    )[0];
    // 3. 切换到该会话
    await get().selectSession(recentSession.id);
  } else {
    // 4. 创建新会话
    await get().createSession(workspaceId);
  }
}
```

### 右侧面板多工作区默认展开
- 在 bootstrap 时，设置 `workspaceTreeExpandedInFileNav` 和 `workspaceChangesExpanded` 为所有可见工作区展开
- 使用现有的 `expandAllWorkspaceTreesInFileNav` 和 `expandAllWorkspaceChanges` 逻辑

## 风险与注意事项

1. **向后兼容性**：确保现有的 `openWorkspace` 功能（用于打开新工作区）仍然正常工作
2. **性能**：默认展开所有工作区可能会有性能影响，但由于是按需加载树数据，应该可控
3. **Tauri 和浏览器一致性**：确保两种模式下行为一致

## 测试验证

- [ ] 点击左侧工作区，中间对话区域切换到该工作区最近会话
- [ ] 点击左侧工作区，右侧面板保持显示所有工作区
- [ ] 新添加的工作区在右侧面板可见
- [ ] Tauri 模式和浏览器模式功能一致
- [ ] 没有最近会话时创建新会话
