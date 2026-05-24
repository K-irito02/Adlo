# Changes 面板 UI 恢复经验教训

## 问题描述

本次任务恢复了 Changes 面板中两个缺失的关键功能：
1. 状态筛选区域（已暂存/已修改/未跟踪）
2. 文件/文件夹右侧的数字统计或字母提示徽章

## 遇到的问题和挑战

### 1. 代码结构差异
- **问题**：当前版本的代码结构与旧版本差异较大
  - 旧版本：所有代码集中在 `ChangesPanel.tsx` 中
  - 新版本：拆分为多个组件文件
    - `ChangesToolbar.tsx` - 工具栏组件
    - `WorkspaceChangesEntry.tsx` - 工作区变更入口
    - `MultiWorkspaceChangesTree.tsx` - 多工作区变更树

### 2. Git 历史查找
- **问题**：需要找到包含正确UI的git版本
- **解决**：
  - 使用 `git show <commit-hash> --name-only` 查看提交内容
  - 确认 `4dbe70c61691266e1a8f10f4802eeecb6ed7253b` 包含正确的UI实现
  - 使用 `git show <commit>:<file-path>` 导出旧版本文件

### 3. 多工作区架构适配
- **问题**：新版本采用多工作区架构，参数传递更复杂
- **解决**：
  - 正确传递 `snapshot`、`hasChangeEntries`、`canToggleNavigatorStructure` 等参数
  - 适配 `changesStatusFilter` 从 `Set<ChangeFileState>` 到 UI 的映射

## 解决方案

### 1. 恢复状态筛选功能
根据旧版本代码，将状态筛选改回使用 `adl-tool-navigator__summary` 样式：

```typescript
// ChangesToolbar.tsx - NavigatorContextToolbar 中
{hasChangeEntries && changesNavigatorMode !== "outline" ? (
  <div className="adl-tool-navigator__summary" aria-label={t.toolChanges}>
    <div className="adl-tool-navigator__summary-stats">
      <button
        type="button"
        className={`adl-tool-navigator__summary-stat${changesStatusFilter.has("staged") ? " is-active" : ""}`}
        onClick={() => onStatusFilterClick("staged")}
      >
        <span className="adl-tool-navigator__summary-label">{t.changesStaged}</span>
        <strong className="adl-tool-navigator__summary-value">
          <span className="adl-tool-navigator__summary-code" aria-hidden="true">S:</span>
          {snapshot?.staged.length ?? 0}
        </strong>
      </button>
      {/* ... modified 和 untracked 按钮 */}
    </div>
  </div>
) : null}
```

### 2. 恢复文件/文件夹数字统计
通过 `renderMeta` 函数传递到 `MultiWorkspaceChangesTree` 和 `WorkspaceChangesEntry`：

```typescript
// ChangesPanel.tsx
const renderNavigatorMeta = useCallback((node: any) => {
  const changeNode = node as ChangeTreeNode;
  const primaryBadge = getPrimaryBadge(changeNode);
  return (
    <>
      {primaryBadge ? (
        <span className={`adl-filetree__status-badge adl-filetree__status-badge--${primaryBadge.tone}`}>
          {primaryBadge.label}
        </span>
      ) : null}
      <span className="adl-filetree__count-badge">
        {changeNode.kind === "directory" ? changeNode.fileCount : changeNode.totalHunks > 0 ? `${changeNode.reviewedHunks}/${changeNode.totalHunks}` : "1"}
      </span>
    </>
  );
}, []);
```

## 经验教训

### 1. UI 恢复的最佳实践
- **不要盲目猜测**：始终从git历史或原始设计文档中获取准确的UI信息
- **版本追溯**：使用 `git log`、`git show` 等命令快速定位包含正确UI的版本
- **对比分析**：将旧版本代码导出到临时目录进行对比分析

### 2. 文件导出命令
```powershell
# 导出特定版本的单个文件
git show <commit-hash>:<relative/path/to/file> > temp-folder/file.tsx

# 查看提交中修改的文件
git show <commit-hash> --name-only

# 查看提交统计
git show <commit-hash> --stat
```

### 3. 多工作区架构注意事项
- 新版本使用多工作区架构，需要正确传递工作区上下文
- `ChangesToolbar` 需要接收额外的参数：
  - `snapshot` - 当前工作区的git快照
  - `hasChangeEntries` - 是否有变更条目
  - `canToggleNavigatorStructure` - 是否可以切换导航结构
  - `structureToggleExpanded` - 当前展开状态

### 4. 状态筛选逻辑
- 使用 `Set<ChangeFileState>` 存储筛选状态
- 筛选集大小为0或3时，显示所有变更
- 否则，只显示匹配的文件状态

## 相关文件

### 核心文件
- `ai-digital-life/frontend/src/app/regions/right-panel/panels/ChangesPanel.tsx`
- `ai-digital-life/frontend/src/app/regions/right-panel/panels/ChangesToolbar.tsx`
- `ai-digital-life/frontend/src/app/features/workspace-changes-tree/WorkspaceChangesEntry.tsx`
- `ai-digital-life/frontend/src/app/features/workspace-changes-tree/MultiWorkspaceChangesTree.tsx`

### CSS 文件
- `ai-digital-life/frontend/src/styles/regions/rightpanel/changes-panel.css` - 包含 `.adl-tool-navigator__summary-*` 样式

### Git 版本参考
- **正确的UI版本**: `4dbe70c61691266e1a8f10f4802eeecb6ed7253b` (2026-05-23)
- **临时文件**: `temp-old-ui/ChangesPanel.tsx` - 旧版本参考文件

## 后续建议

### 1. 文档维护
- 将此类经验教训添加到项目文档中
- 创建 `docs/development/ui-restoration-guide.md` 指导手册

### 2. 测试覆盖
- 添加 E2E 测试验证Changes面板UI
- 确保状态筛选和数字统计功能正常工作

### 3. 代码质量
- 考虑在 `ChangesToolbar` 中添加更清晰的注释
- 统一状态筛选的接口定义

---

**创建时间**: 2026-05-24
**相关提交**: 无（本次为恢复性修复）
**影响范围**: Changes 面板 UI
