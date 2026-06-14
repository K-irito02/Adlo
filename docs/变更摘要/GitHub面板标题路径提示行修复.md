# GitHub 面板标题路径提示行修复

## 修复问题

| # | 问题 | 根因 | 修复 |
|---|------|------|------|
| 1 | 标题行距分割线近、距上方边缘远 | 外层 `adl-tool-primary__scroll` 的 `padding: var(--space-3)`（~12px）把标题行推离顶部 | `margin-top: calc(-1 * var(--space-3))` 抵消容器 padding + `min-height: 32px` + `align-items: center` 实现垂直居中 |
| 2 | 点击树条目后标题行完全消失 | `data-path` 位于 `<li>` 不在 `<div class="adl-filetree__row">`，全局处理器取值 `undefined` | 简化全局处理器，面板内部点击均不干涉，仅外部点击清理 |
| 3 | 嵌套子目录路径显示不完整 | `displayPath` 仅取 `folder?.name` | 沿 `parentId` 链回溯拼接完整路径 |
| 4 | 缺少分类标识 | 标题行仅有路径，用户无法区分工作区/非工作区目录 | 新增 `folderCategory` 计算，沿 `parentType` 链判断分类 |
| 5 | 点击内容区标题行消失 | 全局处理器未排除 `.adl-tool-primary--github` | 新增面板内部范围守卫 |
| 6 | `[路径] / [子条目]` 中的 `/` 分隔符 | 视觉噪音 | 移除分隔符 |

## 修改文件

| 文件 | 变更 |
|------|------|
| `styles/regions/rightpanel/communication-panel.css` | `adl-github-path-header` 样式重写（flex + margin-top 负值 + min-height） |
| `regions/right-panel/panels/communicate/GitHubPanel.tsx` | `displayPath` 回溯 parentId 链；`folderCategory` 分类判断；全局点击处理器简化；移除 `/` 分隔符 |

## 新增文档

- `docs/知识沉淀/CI监控/github-title-path-header-fix-2026-06-14.md` — 经验教训
- `UIOperationManual/rightpanel/tools/communicate.md` 新增「标题路径提示行」章节
