# AI Digital Life 重构进展 - 第一阶段

> 日期：2026-05-19

## 已完成的重构工作

### 1. store.ts 的渐进式优化

- **创建了 `stores/` 目录**：为未来的模块化重构做好了准备
- **提取了 `stores/cacheUtils.ts`**：将文件缓存、变更预览缓存的工具函数从 store.ts 中独立出来
  - `FILE_DOCUMENT_CACHE_LIMIT`、`CHANGE_PREVIEW_CACHE_LIMIT` 常量
  - `CachedFileDocument`、`CachedChangePreview` 类型
  - `getWorkspaceCachePrefix()`、`getWorkspaceScopedCacheKey()`
  - `getCachedLru()`、`setCachedLru()`
  - `getFileDocumentCache()`、`getChangePreviewCache()`
- **提取了 `stores/conversationUtils.ts`**：将会话相关的辅助函数独立出来
  - `sessionFallbackTitle()`
  - `workspaceContextModeFromInfo()`
  - `hasConversationMessages()`
  - `refreshConversationSlice()`
- **保持向后兼容**：在 store.ts 中重新导出这些函数，确保现有代码和测试能正常工作

### 2. ChangesPanel.tsx 的渐进式优化

- **创建了 `ChangesPanel/` 目录**：为未来的组件化重构做好准备
- **提取了 `ChangesPanel/utils.ts`**：将一些独立的工具函数从组件中提取出来
  - `readSelectedBranch()`、`writeSelectedBranch()`
  - `getChangeKindLabel()`、`getChangeStatusLabel()`
  - `getPrimaryBadge()`、`getEditorView()`

### 3. 验证和测试

- ✅ 所有类型检查通过
- ✅ 所有 181 个现有测试通过
- ✅ 更新了 `loadingPerformance.test.ts` 以适应新的文件结构

## 项目状态

### 重构前（原始状态）
- `store.ts`：约 1316 行代码，混合了多种领域逻辑
- `ChangesPanel.tsx`：约 1200 行代码，单一大型组件

### 重构后（第一阶段完成）
- `store.ts`：代码有所减少，部分功能已拆分到外部模块
- `stores/cacheUtils.ts`：新文件，缓存相关逻辑
- `stores/conversationUtils.ts`：新文件，会话相关辅助函数
- `ChangesPanel/utils.ts`：新文件，ChangesPanel 相关工具函数

## 后续工作建议

### 高优先级（继续第一阶段）

1. **继续拆分 store.ts**：逐步将领域逻辑独立成小的 store
   - `useWorkspaceStore`：工作区相关逻辑
   - `useConversationStore`：会话相关逻辑
   - `usePatchStore`：补丁相关逻辑
   - `useTaskStore`：任务相关逻辑

2. **继续优化 ChangesPanel.tsx**：
   - 提取 `ChangesPanelHeader.tsx`：分支选择等头部组件
   - 提取 `ChangesNavigator.tsx`：导航器组件
   - 提取 `PatchFileCard.tsx`：文件补丁卡片
   - 最终重构为组合式组件架构

### 中优先级

3. **优化 kernel crate 的 types.rs**：
   - 将类型定义按领域拆分到子目录
   - 保持向后兼容的导出

4. **创建通用的 IPC 处理 Hook**：减少 store 中的重复错误处理逻辑

### 低优先级

5. **SQLite 架构优化**：需要深入评估和设计迁移策略
6. **补充测试**：为新增模块添加单元测试

## 原则遵循

在整个重构过程中，我们严格遵循了以下原则：

- ✅ **保持功能不变**：所有重构都是内部结构优化
- ✅ **无负面改进**：没有引入任何新问题
- ✅ **红绿测试**：每个修改后都运行完整测试
- ✅ **渐进式推进**：从最小、最安全的修改开始

## 下一步选择

您可以选择：
1. **继续执行第一阶段**：我继续拆分 store.ts 和 ChangesPanel.tsx
2. **暂停，验收当前阶段**：如果满意当前成果，可以标记第一阶段完成
3. **调整优先级**：如果您想先处理其他问题，我们可以重新规划
