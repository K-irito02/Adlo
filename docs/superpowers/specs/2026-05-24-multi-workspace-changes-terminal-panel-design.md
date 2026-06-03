# 多工作区 Changes & Terminal 面板改造设计

> 日期: 2026-05-24
> 关联计划: `.trae/documents/multi-workspace-right-panel-plan.md`
> 关联教训: [知识沉淀/多工作区/changes-terminal-panel.md](../../知识沉淀/多工作区/changes-terminal-panel.md)

## 背景

Files 面板已完成多工作区改造（`MultiWorkspaceFileTree`），Changes 和 Terminal 面板仍为单工作区扁平结构。本设计将两个面板升级为多工作区模式，与 Files 面板统一交互范式。

## 目标

1. **Changes 面板**: 从单工作区 tree/list/outline 改为 workspace-grouped 结构，每个工作区展开后显示其 git 变更
2. **Terminal 面板**: 从单层标签列表改为 workspace-grouped 标签列表
3. **统一 UI**: 三个面板（Files/Changes/Terminal）采用一致的导航器布局
4. **统计同步**: 变更文件数字实时反映所有可见工作区

## 组件树

### Changes Panel

```
ChangesPanel
├── adl-tool-context（toolbar）
│   ├── 切换侧边栏按钮
│   ├── 分支选择器
│   ├── 布局切换（inline/side-by-side）
│   ├── 预览/编辑切换
│   └── 更多操作菜单
├── adl-tool-surface
│   ├── adl-tool-navigator
│   │   ├── Row 1: [展开/折叠全部] [动态标题]    [统计数字] [刷新全部]
│   │   ├── Row 2: [文件树] [文件列表]        [文档大纲]
│   │   └── MultiWorkspaceChangesTree
│   │       ├── CustomScrollArea
│   │       ├── [已置顶] 分组
│   │       │   └── WorkspaceChangesEntry × N
│   │       │       ├── header（expand + name + count + actions）
│   │       │       │   ├── 展开/收起按钮
│   │       │       │   ├── 名称区域（点击展开/右键菜单）
│   │       │       │   ├── 变更文件统计数字（默认可见）
│   │       │       │   └── actions（hover 时显示）
│   │       │       │       ├── 刷新
│   │       │       │       ├── 置顶/取消置顶
│   │       │       │       └── 更多操作（菜单）
│   │       │       └── tree（展开后）
│   │       │           ├── loading/error/empty
│   │       │           └── FileTree（tree/list/outline 切换）
│   │       └── [未置顶] 分组（同上）
│   └── adl-tool-navigator__resize-handle
└── adl-tool-primary
    └── diff 预览区域
```

### Terminal Panel

```
TerminalPanel
├── adl-tool-context（toolbar）
│   ├── 切换侧边栏按钮
│   ├── TerminalShellSelector
│   └── TerminalMenuDropdown
├── adl-tool-surface
│   ├── adl-tool-navigator
│   │   ├── Row 1: [展开/折叠全部] [动态标题]    [终端统计] [刷新全部]
│   │   ├── Row 2: [终端列表] [命令历史]        [删除全部]
│   │   └── MultiWorkspaceTerminal
│   │       ├── CustomScrollArea
│   │       ├── [已置顶] 分组
│   │       │   └── WorkspaceTerminalEntry × N
│   │       │       ├── header（expand + name + count + actions）
│   │       │       │   ├── 展开/收起按钮
│   │       │       │   ├── 名称区域（点击展开/右键菜单）
│   │       │       │   ├── 终端标签计数（默认可见）
│   │       │       │   └── actions（hover 时显示）
│   │       │       │       ├── 刷新
│   │       │       │       ├── 删除全部
│   │       │       │       ├── 创建终端
│   │       │       │       └── 更多操作 → 菜单
│   │       │       │           ├── 从此区域移除不显示
│   │       │       │           └── 默认为{profile}终端 → 子菜单
│   │       │       │               ├── PowerShell ✓
│   │       │       │               ├── Bash
│   │       │       │               └── CMD
│   │       │       └── tree（展开后）
│   │       │           ├── empty（创建终端按钮）
│   │       │           └── TerminalTabBar
│   │       └── [未置顶] 分组（同上）
│   └── adl-tool-navigator__resize-handle
└── adl-tool-primary
    └── XtermTerminal（当前活动标签）
```

## 交互行为矩阵

| 交互 | Files | Changes | Terminal |
|------|-------|---------|----------|
| 点击展开/收起按钮 | 展开/收起文件树 | 展开/收起变更列表 | 展开/收起终端标签 |
| 点击名称区域 | 同展开按钮 | 同展开按钮 | 同展开按钮 |
| 右键名称区域 | 弹出菜单 | 弹出菜单 | 弹出菜单 |
| 名称 hover | 右侧按钮出现 | 右侧按钮出现 | 右侧按钮出现 |
| 名称非 hover | 数字可见 | 数字可见 | 数字可见 |
| 展开/折叠全部 | 统一切换 | 统一切换 | 统一切换 |
| 刷新全部 | 刷新工作区树 | 重新获取 git 状态 | 无操作 |
| 第二行模式切换 | tree/search/outline | tree/list/outline | sessions/history |
| 拖拽排序 | 支持 | 支持 | 不支持 |
| 置顶/取消置顶 | 展开操作按钮 | 展开操作按钮 | 通过菜单 |
| 统计数字类型 | 文件数 | 变更文件数 | 终端标签数 |

## 数据流

### Changes 面板数据流

```
visibleWorkspaces (来自 workspaceSlice)
  │
  ├── workspaceChangesExpanded → determines whether to expand
  │
  ├── gitSnapshots[wsId] (来自 workspaceSlice, loadGitSnapshot/refreshGitSnapshot)
  │   ├── staged / unstaged / untracked / conflicts → changeCount
  │   └── buildChangeEntries → buildFlatChangeNodes / buildChangeTree
  │
  └── activePatchSets[wsId] (来自 patchSlice)
      └── summarizePatchSet → patchSummaries
```

### Terminal 面板数据流

```
visibleWorkspaces (来自 workspaceSlice)
  │
  ├── terminalWorkspaceExpanded → determines whether to expand
  │
  ├── terminalTabs (来自 terminalSlice)
  │   ├── filtered by workspaceId → tabsByWorkspace[wsId]
  │   └── tabCount = tabs.length
  │
  └── defaultTerminalProfile (来自 terminalSlice)
      ├── WorkspaceTerminalEntry 直接 useAppStore 读取
      ├── "默认为{profile}终端" 动态显示
      └── 子菜单 ✓ 标记
```

### diff 预览数据流

```
WorkspaceChangesEntry
  └── onOpenChangePreview(workspace.path, relativePath)
      └── handleSelectNavigatorNode (in ChangesPanel)
          ├── 优先查找 activePatchSets[workspacePath]
          └── 后备: openChangePreviewForWorkspace(workspacePath, relativePath)
              └── IPC: getChangePreviewForWorkspace(workspacePath, relativePath)
                  └── Rust: workspace_get_change_preview(relative_path, workspace_path?)
```

## 两行导航器布局

与 Files 面板统一，Changes/Terminal 导航器采用两行布局：

```
Row 1: [展开/折叠全部] [动态标题]    [统计数字] [刷新全部]
Row 2: [mode1] [mode2]          [action]
```

### 动态标题规则

| 面板 | tree/list 模式 | outline/history 模式 |
|------|---------------|----------------------|
| Changes | "变更" | "文档大纲" / "文件列表" |
| Terminal | "终端" | "命令历史" |

### 统计数字类型

| 面板 | 统计数字含义 | 数据源 |
|------|-------------|--------|
| Changes | 所有工作区变更文件总数 | `gitSnapshots[wsId].staged+unstaged+untracked+conflicts` |
| Terminal | 所有工作区终端标签总数 | `terminalTabs.filter(...).length` |

## WorkspaceChangesEntry hover 按钮

| 按钮 | 图标 | 行为 | 对应 Files 面板 |
|------|------|------|----------------|
| 刷新 | IconRefreshCw | 重新获取 git 状态 | 刷新 |
| 置顶/取消置顶 | IconPin/IconPinOff | 切换置顶状态 | 置顶/取消置顶 |
| 更多操作 | IconMoreVertical | 弹出菜单 | 更多操作 |

## WorkspaceTerminalEntry hover 按钮

| 按钮 | 图标 | 行为 |
|------|------|------|
| 刷新 | IconRefreshCw | 无操作（占位） |
| 删除全部 | IconTrash | 关闭该工作区所有终端 |
| 创建终端 | IconPlus | 直接创建默认 profile 终端 |
| 更多操作 | IconMoreVertical | 弹出菜单（从此区域移除不显示 / 默认终端设置） |

## 菜单卡片

### Changes/File Tree 通用菜单
- 从此区域移除不显示
- 在文件资源管理器中显示
- 复制完整路径
- 复制相对路径

### Terminal 更多操作菜单
- 从此区域移除不显示
- 默认为{profile}终端 → 子菜单（鼠标悬停展开）
  - PowerShell ✓
  - Bash
  - CMD

## 技术细节

### 工作区感知的 diff 预览

由于多工作区架构，diff 预览必须知道文件属于哪个 workspace：

1. `WorkspaceChangesEntry` 包装 `onOpenFile`:
   ```typescript
   onOpenFile={(path) => onOpenChangePreview(workspace.path, path)}
   ```

2. `handleSelectNavigatorNode` 变为双参数:
   ```typescript
   (workspacePath: string, relativePath: string) => void
   ```

3. 新增 IPC:
   ```typescript
   getChangePreviewForWorkspace(workspacePath, relativePath)
   ```

4. Rust 后端 Tauri Command:
   ```rust
   fn workspace_get_change_preview(relative_path, workspace_path: Option<String>)
   ```
   当提供 `workspace_path` 时，直接使用该路径；否则回退到当前活动工作区。

### 缓存键

`openChangePreviewForWorkspace` 使用 `workspacePath:relativePath` 作为缓存键，确保不同工作区同路径文件的 cache 不冲突。

### refreshGitSnapshot

`loadGitSnapshot` 有缓存保护（已有数据时跳过），新增 `refreshGitSnapshot` 跳过检查强制刷新，供"刷新全部"按钮使用。

### CustomScrollArea 滚动条残留

`CustomScrollArea` 使用 `ResizeObserver` 监听子元素变化，但收起工作区时子元素高度变化不触发重新计算。新增 `children` 变化时调用 `updateScrollbar()` 的 `useEffect`。

### 统计数字统一

`<span class="adl-multitree-entry__count">` 放在 `.adl-multitree-entry__actions` 之前，作为 `namezone` 的直接子元素。CSS hover 时 `opacity: 0; width: 0; margin: 0` 折叠，让操作按钮覆盖其位置。
