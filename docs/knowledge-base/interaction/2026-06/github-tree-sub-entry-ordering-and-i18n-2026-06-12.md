# GitHub 树子条目排序与国际化

> 来源：2026-06-12 GitHub 面板优化（两阶段：子条目排序修复 → 子条目名称国际化）
> 涉及：useGithubTreeData、GitHubTree、GitHubPanel、zh-CN/ci.ts、en-US/ci.ts

## 1. 子条目排序：紧贴父目录

### 问题

展开目录 A 时，其子条目（概览/工作流/任务/日志）出现在所有嵌套子目录 **之后**，导致视觉上难以判断哪些子条目属于 A。

### 修复

在 `useGithubTreeData.ts` 中交换 `children` 数组展开顺序：

```
改前: [...folderChildren, ...buildSubEntryNodes(...)]
改后: [...buildSubEntryNodes(...), ...folderChildren]
```

### 原则

每个目录的**自身子条目（概览/工作流/任务/日志）必须紧贴父目录**，嵌套子目录在其后方。这确保多目录展开时，每个目录的功能子条目清晰归属于其父目录，不被干扰。

## 2. 置顶与子条目顺序不冲突

### 约束

- `置顶/取消置顶` **只影响目录之间的排序**，不影响目录内部子条目的顺序
- 子条目与子目录的先后关系由 `children` 数组构建顺序决定，与置顶无关
- 置顶在 `sortFoldersByPinOrder` / `sortWorkspacesByPinOrder` 层实现，不触及 `children` 构建

## 3. 子条目名称国际化

### 问题

子条目名称硬编码为英文（`Overview`/`Workflows`/`Jobs`/`Logs`），不支持中英切换。

### 修复

| 层 | 改前 | 改后 |
|----|------|------|
| `SUB_ENTRY_DEFS` | `{ id, name, pathSuffix }` 常量 | `{ id, pathSuffix }` 结构定义 + 新增 `SubEntryLabels` 接口 |
| `buildSubEntryNodes` | 无参，使用常量的 `name` | 接受 `subEntryLabels: SubEntryLabels` 参数，动态获取名称 |
| `useGithubTreeData` | `labels` 仅含分类标签 | `labels` 扩展 `& SubEntryLabels` |
| `GitHubPanel` | 硬编码中文 | 从 `copy` 获取翻译 |

### 翻译键

| 键 | 中文 | English |
|----|------|---------|
| `ciOverview` | 概览 | Overview |
| `ciWorkflows` | 工作流 | Workflows |
| `ciJobs` | 任务 | Jobs |
| `ciLogs` | 日志 | Logs |
| `ciWorkspaceCategory` | 工作区目录 | Workspace Directory |
| `ciUserFolderCategory` | 非工作区目录 | User Folders |

### 原则

**树节点名称必须支持 i18n，不得硬编码。** 包括：
- 目录分类标题（工作区目录 / 非工作区目录）
- 子条目名称（概览 / 工作流 / 任务 / 日志）
- 所有用户可见的 UI 文本

## 4. i18n 数据流要点

自定义 i18n 系统（非 react-i18next），模式为：

```
useAppStore → appInfo.config.language → getAppCopy(appInfo) → copy 字典 → 通过 props 下传
```

新增翻译键只需在 `zh-CN/ci.ts` 和 `en-US/ci.ts` 中添加条目，`CopyKey` 类型自动从 `typeof zhCN` 推断。无需修改 `types.ts` 或其他配置。
