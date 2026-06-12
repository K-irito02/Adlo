# GitHub 面板菜单重构：递归删除与 UI 分组优化

## 变更范围

对 GitHub CI 面板的目录菜单进行了系统性重构，涉及 8 个文件、4 个功能迭代。

## 功能迭代

### 1. "!" 悬停提示全覆盖

- **问题**："删除目录"菜单项在右键菜单中缺少 "!" 图标和提示卡片
- **根因**：`ContextMenu` 组件不支持 `hint` 属性，而子节点右键菜单走 `FileTree → ContextMenu` 链路
- **修复**：`ContextMenuItem` 新增 `hint` 字段，`ContextMenu` 渲染时检测并显示 "!" 按钮 + 悬停卡片

### 2. 危险样式统一

- `MenuHintItem` 新增 `danger` prop，红色菜单项正确应用 `is-danger` 类
- "!" 图标在危险项中显示为红色（`color: var(--danger)`），背景保持独立不融合

### 3. 递归嵌套型删除

- Store 新增 3 个 action：`gitHubDeleteFolderConfigRecursive`、`gitHubDeleteFolderDataRecursive`、`gitHubDeleteFolderConfigAndDataRecursive`
- 通过 `gitHubCiFolders.parentId` 链递归遍历后代目录
- 菜单新增"删除CI配置[嵌套]"、"删除数据[嵌套]"、"删除CI配置及数据[嵌套]"，用分割线与普通选项分组

### 4. 菜单分组与"移除不显示"

- 白色选项与红色危险选项之间添加 `sep-danger` 分割线
- 工作区顶级目录新增"从此区域移除不显示"（白色样式，含 "!" 提示）
- 调用 `hideWorkspaceFromRightPanels`，与文件/变更/终端面板行为一致

## 最终菜单结构

```
刷新 | 置顶 | 重命名 | 设置 | 从此区域移除不显示
──────────────────────  ← sep-danger
删除目录 (!) | 删除CI配置 | 删除数据 | 删除CI配置及数据
──────────────────────  ← sep-recursive
删除CI配置[嵌套] (!) | 删除数据[嵌套] (!) | 删除CI配置及数据[嵌套] (!)
```

## 修改文件

| 文件 | 说明 |
|------|------|
| `components/ContextMenu.tsx` | 新增 hint/danger 渲染 |
| `features/file-tree/fileTree.utils.ts` | 类型扩展 |
| `features/file-tree/fileTree.tsx` | hint 字段透传 |
| `stores/slices/githubSlice.ts` | 3 个递归 action |
| `features/github-tree/GitHubTreeEntry.tsx` | 菜单整体重构 |
| `regions/right-panel/panels/communicate/MenuHintItem.tsx` | danger prop |
| `styles/regions/context-menu.css` | position: relative |
| `styles/regions/rightpanel/file-operations.css` | .is-danger hint 样式 |

## 更新文档

- `UIOperationManual/rightpanel/tools/communicate.md` 完整重写
- `docs/知识沉淀/交互优化/github-menu-recursive-delete-and-grouping-2026-06-12.md` 新增
