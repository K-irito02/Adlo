# GitHub 菜单递归删除与分组优化

## 背景

GitHub CI 面板的目录菜单经历了多轮迭代，从最初的简单"删除CI配置及数据"单一选项，逐步演化为包含白色/红色分组、递归嵌套操作、"!" 悬停提示的完整菜单体系。

## 菜单演进

### 初始状态

```
删除CI配置及数据  ← 仅此一项
```

### 第 1 轮：删除目录 + 完整菜单

- 新增 "删除目录"（含 "!" 提示）
- 拆分 "删除CI配置"、"删除数据"、"删除CI配置及数据" 为独立菜单项
- 所有目录类型（工作区嵌套、非工作区顶级、非工作区嵌套）统一处理

### 第 2 轮：递归嵌套型删除

- 新增 "删除CI配置[嵌套]"、"删除数据[嵌套]"、"删除CI配置及数据[嵌套]"
- 使用分割线与普通删除选项分组
- 新增 3 个 store action 实现递归遍历 `parentId` 链

### 第 3 轮：白色/红色分组 + 从此区域移除不显示

- 白色选项（刷新/置顶/重命名/设置）与红色危险选项之间添加分割线
- 工作区顶级目录新增 "从此区域移除不显示"（白色，含 "!" 提示）

## 最终菜单结构

```
─── 白色字体功能选项 ───
刷新
置顶 / 取消置顶
重命名
设置
从此区域移除不显示     ← 仅工作区顶级目录
────────────────────
─── 红色字体功能选项 ───
删除目录 (!)
删除CI配置
删除数据
删除CI配置及数据
────────────────────
删除CI配置[嵌套] (!)
删除数据[嵌套] (!)
删除CI配置及数据[嵌套] (!)
```

## 关键模式

### 1. 双菜单一致

同一组选项必须在两个菜单入口完全一致：
- **"更多操作"按钮**：通过 `GitHubTreeEntry.tsx` 头部和 `getChildNodeMoreMenuItems` 构建
- **右键菜单**：通过 `handleChildContextMenu` → `FileTree.getContextMenuItems` → `ContextMenu` 渲染

### 2. "!" 提示的双通道

| 菜单类型 | 组件 | 原理 |
|----------|------|------|
| 更多操作按钮菜单 | `MenuHintItem` | 直接渲染带 "!" 的自定义按钮 |
| 右键菜单 | `ContextMenu` + `hint` 字段 | 通过 `ContextMenuItem.hint` 触发内置渲染 |

`MenuHintItem` 需要手动传入 `danger` 属性控制红色样式。
`ContextMenu` 根据 `item.danger` 自动为 "!" 添加 `.is-danger` 类。

### 3. 分割线

| 分隔符 | ID | 位置 |
|--------|-----|------|
| 白色/红色 | `sep-danger` | Settings 与 删除目录 之间 |
| 普通/递归 | `sep-recursive` | 删除CI配置及数据 与 删除CI配置[嵌套] 之间 |

### 4. 递归遍历

```typescript
const idsToDelete = new Set<string>([folderId]);
const findDescendants = (parentId: string) => {
  for (const f of state.gitHubCiFolders) {
    if (f.parentId === parentId && !idsToDelete.has(f.id)) {
      idsToDelete.add(f.id);
      findDescendants(f.id);
    }
  }
};
findDescendants(folderId);
```

通过 `gitHubCiFolders` 数组的 `parentId` 字段递归查找所有后代，批量操作。

### 5. Store Action 命名

| 模式 | 示例 |
|------|------|
| 普通删除 | `gitHubDeleteFolderConfig(folderId)` |
| 递归删除 | `gitHubDeleteFolderConfigRecursive(folderId)` |
| 全局删除 | `clearAllCiConfigs()` |

递归版本在函数名后加 `Recursive` 后缀。

## 已修改文件清单

| 文件 | 改动 |
|------|------|
| `components/ContextMenu.tsx` | 新增 `hint`、`danger` 属性支持 |
| `features/file-tree/fileTree.utils.ts` | 新增 `hasHint`/`hint` 类型 |
| `features/file-tree/fileTree.tsx` | 透传 `hint` 字段 |
| `stores/slices/githubSlice.ts` | 新增 3 个递归 action |
| `features/github-tree/GitHubTreeEntry.tsx` | 菜单重构：分组、递归项、移除不显示 |
| `regions/right-panel/panels/communicate/MenuHintItem.tsx` | 新增 `danger` 属性 |
| `styles/regions/context-menu.css` | `.adl-sidebar-menu__item` 增加 `position: relative` |
| `styles/regions/rightpanel/file-operations.css` | 新增 `.adl-menu-item__hint.is-danger` |
