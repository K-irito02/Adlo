# ChangesPanel 组件集成计划

## 目标
将 ChangesPanel 重构为模块化架构，确保所有功能一致且无丢失。

## 原则
1. **渐进式集成**：一步完成一个模块的集成和验证
2. **对比验证**：每一步集成后验证原功能无变化
3. **保持可回退**：保留原始代码作为参考
4. **类型安全**：确保所有类型定义正确

## 集成阶段
### 阶段 1: 导出 useChangesPanel 钩子
- 确保钩子完整导出并可被 ChangesPanel 导入
- 确保所有类型定义正确

### 阶段 2: 集成 ChangesContextMenu 钩子
- 将 getContextMenuItems 逻辑从 ChangesPanel 中提取到 ChangesContextMenu 钩子
- 验证右键菜单功能正常

### 阶段 3: 集成 ChangesNavigator 组件
- 将导航器部分替换为 ChangesNavigator 组件
- 验证导航、过滤、大纲等功能正常

### 阶段 4: 集成 ChangesPreviewEditor 组件
- 将预览编辑器部分替换为 ChangesPreviewEditor
- 验证编辑、预览、差异查看等功能正常

### 阶段 5: 集成 patch-review 组件
- 将补丁审查部分替换为 PatchReviewSummary + PatchFileCard + PatchHunkCard
- 验证补丁查看、接受/拒绝等功能正常

## 验收标准
- [ ] 所有功能与原始版本一致
- [ ] 用户体验无变化
- [ ] 编译无错误
- [ ] 无类型错误
- [ ] 可正常使用所有变更功能
