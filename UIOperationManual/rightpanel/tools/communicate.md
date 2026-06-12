# 通信面板

> 右侧面板的通信工具，提供多平台消息集成。当前 GitHub CI 状态监控已完成，飞书 / QQ / 微信 / 邮箱为占位态。

## 选择器

| 元素 | 选择器 |
|------|--------|
| 面板容器 | `.adl-communicate` |
| 平台标签栏 | `.adl-communicate__platform-tabs` |
| 平台标签 | `.adl-communicate__platform-tab` |
| 平台标签分隔线 | `.adl-communicate__platform-separator` |
| 操作表面 | `.adl-communicate__surface` |
| 导航器 | `.adl-communicate__navigator` |
| 导航按钮 | `.adl-communicate__nav-btn` |
| 导航内容 | `.adl-communicate__nav-content` |
| 主内容区 | `.adl-communicate__primary` |

## 平台标签栏

| 平台 | 快捷键 |
|------|--------|
| GitHub | 默认激活 |
| 飞书 | 占位 |
| QQ | 占位 |
| 微信 | 占位 |
| 邮箱 | 占位 |

### 交互行为

1. **悬停态**：按钮背景变为 `var(--bg-hover)`，文字色变为 `var(--text-primary)`
2. **激活态**：与悬停态完全一致，无需区分
3. **分隔线**：相邻两个按钮同时处于悬停或激活态时，中间显示垂直分割线（`var(--border-strong)`）

## GitHub CI 状态监控

### 导航功能

| 导航项 | 说明 |
|--------|------|
| Overview | 最近 Workflow Run 概览 + Job 列表 |
| Workflows | Workflow 列表视图 |
| Jobs | 完整 Job 列表（可展开步骤详情） |
| Logs | 日志查看器（ANSI 着色 + 虚拟滚动 + 搜索） |
| Settings | CI 配置（Owner/Repo/Branch/Token） |
| Help | 使用帮助 |

### 日志查看器

| 功能 | 说明 |
|------|------|
| ANSI 着色 | 使用 `ansi_up` 解析 GitHub Actions 日志的彩色输出 |
| 虚拟滚动 | 使用 `react-window` FixedSizeList，行高 20px |
| 行号 | 左侧固定 60px 区域，灰度等宽字体 |
| 搜索 | 大小写不敏感匹配，上一处/下一处导航，黄色高亮 |
| 错误高亮 | 匹配 `error`/`fail`/`FAILURE` 关键词，左侧 3px 红色色条 |
| 警告高亮 | 匹配 `warn`/`warning` 关键词，左侧 3px 黄色色条 |
| 空白折叠 | 连续 50+ 行空白折叠为占位行，点击展开 |
| Job 选择 | 下拉切换不同 Job 的日志 |
| GitHub 跳转 | 在 GitHub 查看完整日志的链接 |
| 日志缓存 | 拉取后内存缓存，Tab 切换不清除，页面刷新重置 |

## 状态

| 状态 | 说明 |
|------|------|
| 未配置 | 显示提示引导用户配置 Owner/Repo |
| 加载中 | 显示 spinner |
| 空数据 | 当前分支无 Workflow Run |
| 错误 | 显示错误消息（网络异常 / API 错误 / 认证失败） |
| 正常 | 显示 CI 状态或日志内容 |

### 树形导航器

`.adl-tool-navigator` 内包含 GitHub CI 的树形目录结构：

| 区域 | 选择器 | 说明 |
|------|--------|------|
| 导航器容器 | `.adl-tool-surface--github .adl-tool-navigator` | 左侧导航栏 |
| 分类标签 | `.adl-github-category__label` | 工作区目录 / 非工作区目录 |
| 顶级条目 | `.adl-browser-entry__header` | 工作区或用户目录标题行（文档图标 + 名称 + 计数） |
| 展开按钮 | `.adl-browser-entry__expand-btn` | 点击展开/折叠子条目，IconFolder/IconFolderOpen |
| 计数 | `.adl-browser-entry__count` | 子条目数量 |
| 操作按钮 | `.adl-browser-entry__actions` | 顶级目录悬停出现：IconRefresh + IconSettings + IconMoreVertical |
| 子条目区 | `.adl-browser-entry__tree` | 使用 FileTree 组件渲染 |
| 子条目行 | `.adl-filetree__row` | 含连接线（CSS 伪元素 `::before`，通过 `--adl-trunk-height` 变量溢出实现动态高度） |
| 子条目文件图标 | `.adl-github-entry__icon` | Overview/Workflows/Jobs/Logs 的自定义 SVG |
| 子条目文件夹菜单 | `.adl-browser-node__actions` | 嵌套目录悬停出现，按钮顺序同上 |
| 更多操作菜单 | `.adl-multitree-entry__menu` | 点击 IconMoreVertical 或右键触发的弹出菜单 |

### 目录分类与菜单可见性

| 目录类型 | 判断条件 | `删除目录` | 递归选项 | `从此区域移除不显示` |
|----------|----------|-----------|---------|-------------------|
| 工作区顶级目录 | `nodeType === 'workspace'` | ❌ | ✅ | ✅ |
| 工作区嵌套子目录 | `isNestedFolder` | ✅ | ✅ | ❌ |
| 非工作区顶级目录 | `isUserFolderRoot` | ✅ | ✅ | ❌ |
| 非工作区嵌套子目录 | `isUserFolderChild` | ✅ | ✅ | ❌ |

### 菜单项分组与顺序

所有目录的菜单统一按以下分组排列（不显示的项跳过）：

```
─── 白色字体功能选项 ───
刷新
置顶 / 取消置顶
重命名
设置
从此区域移除不显示     ← 仅工作区顶级目录
──────────────────    ← 分割线
─── 红色字体功能选项 ───
删除目录 (!)          ← 递归删除目录及所有数据
删除CI配置
删除数据
删除CI配置及数据
──────────────────    ← 分割线
删除CI配置[嵌套] (!)  ← 递归删除嵌套子目录的CI配置
删除数据[嵌套] (!)    ← 递归删除嵌套子目录的CI数据
删除CI配置及数据[嵌套] (!)  ← 递归删除嵌套子目录的CI配置及数据
```

#### 菜单项说明

| 菜单项 | 危险色 | "!" 提示 | 说明 |
|--------|--------|---------|------|
| 刷新 | ❌ | ❌ | 重新加载 CI 状态 |
| 置顶/取消置顶 | ❌ | ❌ | 在目录列表中置顶显示 |
| 重命名 | ❌ | ❌ | 启动 RenameDialog 修改目录名 |
| 设置 | ❌ | ❌ | 打开 CI 配置或目录设置 |
| 从此区域移除不显示 | ❌ | ✅ | 从工作区目录分类中移除（可左侧边栏恢复） |
| 删除目录 | ✅ | ✅ | 删除此目录及所有嵌套子目录，同时删除所有CI配置及数据 |
| 删除CI配置 | ✅ | ❌ | 删除当前目录的CI配置 |
| 删除数据 | ✅ | ❌ | 清除所有CI数据（快照/任务/错误） |
| 删除CI配置及数据 | ✅ | ❌ | 删除当前目录CI配置并清除所有CI数据 |
| 删除CI配置[嵌套] | ✅ | ✅ | 递归删除此目录及所有嵌套子目录的CI配置 |
| 删除数据[嵌套] | ✅ | ✅ | 删除此目录及所有嵌套子目录的CI数据 |
| 删除CI配置及数据[嵌套] | ✅ | ✅ | 递归删除此目录及所有嵌套子目录的CI配置及数据 |

### 交互规则

| 场景 | 行为 |
|------|------|
| 点击顶级目录 | 展开/折叠子条目 + 选中高亮 |
| 点击子目录 | 展开/折叠 + 选中高亮 |
| 点击子文件（Overview 等） | 选中 + 右侧内容区切换对应视图 |
| 悬停顶级目录 | 计数渐隐 → 操作按钮渐显 |
| 悬停子目录 | 计数渐隐 → 操作按钮在 `.adl-filetree__meta` 中渐显 |
| 点击「更多操作」按钮 | 在按钮位置弹出下拉菜单（`.adl-multitree-entry__menu`） |
| 右键点击条目 | 在鼠标位置弹出右键菜单（`.adl-sidebar-menu`） |
| 点击菜单外区域 | 关闭菜单 |

### 删除全部菜单

导航器顶部工具栏的垃圾桶按钮（IconTrash）触发 "删除全部新建目录/CI配置/数据" 的弹出菜单。

| 元素 | 选择器 | 说明 |
|------|--------|------|
| 垃圾桶按钮 | `.adl-surface-toolbar__btn` 含 `IconTrash` | 顶部工具栏 |
| 弹出菜单 | `[data-menu-id="github-delete-all-menu"]` | `position: fixed` 下拉菜单 |
| 菜单项 | `.adl-multitree-entry__menu-item` | 包含标签 + "!" 提示按钮 |
| 危险菜单项 | `.adl-multitree-entry__menu-item.is-danger` | 红色文字 + 红色悬停背景 |
| 提示按钮 | `.adl-menu-item__hint` | 菜单项最右侧的 "!" 图标 |
| 危险提示按钮 | `.adl-menu-item__hint.is-danger` | 红色文字（背景保持独立不融合） |
| 子卡片 | `.adl-sub-hint-card` | "!" 悬停时显示的提示子卡片（`position: fixed`） |
| 子卡片箭头 | `.adl-sub-hint-card__arrow` | 独立的 `position: fixed` 指向左侧箭头 |
| 子卡片箭头边框 | `.adl-sub-hint-card__arrow-border` | 箭头外轮廓 |
| 分割线 | `.adl-multitree-entry__menu-sep` | 白色选项与危险选项之间的分隔线 |
| 右键菜单分割线 | `.adl-sidebar-menu__sep` | ContextMenu 组件的分割线 |

**子卡片定位逻辑：** 三个独立的 `position: fixed` 元素（卡片 + 箭头填充 + 箭头边框），通过 JS 计算菜单右边缘和按钮中心坐标后精确放置。

**箭头方向：** 使用 `border-right` 在 0 宽元素上生成指向左侧的三角形（注意：`border-left` 实际指向右侧，与直觉相反）。

**子卡片内存安全：** 组件使用 `useRef<HTMLDivElement[]>` 存储动态 DOM 元素引用，通过 `useEffect` 清理函数确保组件卸载时移除所有残留元素。鼠标进入时先清空数组再 push，既防止数组累积又避免丢失未清理引用。

### "!" 提示按钮交互

| 悬停区域 | 视觉表现 | 说明 |
|----------|----------|------|
| 菜单文字区 | 仅文字区灰色背景，`!` 区域保持卡片背景色 | `!` 的 `background: var(--bg-card)` 遮住父级 hover |
| `!` 符号本身 | `!` 区域灰色背景 + 高亮文字 | 直接悬停 `!` 触发子卡片显示 |
| 危险项 `!` 符号 | 红色文字 + 浅红悬停背景 | 通过 `.adl-menu-item__hint.is-danger` 实现 |

### 分隔线分组

菜单项分为两组，使用分割线分隔：

| 分组 | 颜色 | 包含 |
|------|------|------|
| 白色选项 | 默认文字色 | 刷新 / 置顶 / 重命名 / 设置 / 从此区域移除不显示 |
| 红色选项 | `var(--danger)` | 删除目录 / 删除CI配置(及数据) / 递归删除项 |

分割线在两个分组之间和递归选项之前：
- `sep-danger`：白色选项与红色选项之间
- `sep-recursive`：普通删除项与递归删除项之间

### 组件架构

| 组件 | 文件 | 职责 |
|------|------|------|
| `GitHubTreeEntry` | `features/github-tree/GitHubTreeEntry.tsx` | 树条目头部菜单 + 子节点菜单 |
| `MenuHintItem` | `regions/right-panel/panels/communicate/MenuHintItem.tsx` | "!" 提示按钮组件 |
| `ContextMenu` | `components/ContextMenu.tsx` | 通用右键菜单（支持 hint 和 danger） |
| `FileTree` | `features/file-tree/fileTree.tsx` | 子节点树渲染 + 右键菜单触发 |
| `GitHubTree` | `features/github-tree/GitHubTree.tsx` | 树容器，渲染两个分类区 |
| `GitHubCategorySection` | `features/github-tree/GitHubCategorySection.tsx` | 分类区包装器 |
| `GitHubPanel` | `regions/right-panel/panels/communicate/GitHubPanel.tsx` | GitHub 子面板主组件 |
| `githubSlice` | `stores/slices/githubSlice.ts` | GitHub CI 状态 + 目录管理 |

### Store Actions

| Action | 说明 |
|--------|------|
| `gitHubDeleteFolder(id)` | 删除目录及其所有嵌套子目录 |
| `gitHubDeleteFolderConfig(id)` | 删除单个目录的CI配置 |
| `gitHubDeleteFolderConfigRecursive(id)` | 递归删除目录及所有嵌套子目录的CI配置 |
| `gitHubDeleteFolderDataRecursive(id)` | 先收集所有后代文件夹ID，仅当 active 工作区受影响时清除全局CI数据 |
| `gitHubDeleteFolderConfigAndDataRecursive(id)` | 递归删除CI配置 + 条件清除全局CI数据 |
| `gitHubPinFolder(id)` | 将文件夹在同级目录中置顶 |
| `gitHubUnpinFolder(id)` | 取消文件夹的置顶状态 |
| `gitHubPinWorkspace(id)` | 将工作区在列表中置顶（操作 `recentWorkspaces`） |
| `gitHubUnpinWorkspace(id)` | 取消工作区的置顶状态 |
| `hideWorkspaceFromRightPanels(id)` | 从工作区目录隐藏工作区（可恢复） |

## 注意事项

1. **Token 安全**：Token 保存在浏览器 localStorage 或 Tauri 系统钥匙串，不发送到第三方服务器
2. **日志获取**：GitHub API 返回 ZIP 压缩包，后端解压后按 Job 分组返回
3. **缓存策略**：后端 LRU 缓存（10 个 Run），前端会话级缓存（页面刷新重置）
4. **图标规范**：所有图标使用 SVG 格式，禁止 emoji
5. **重命名规范**：禁止使用 `window.prompt`，必须使用 `RenameDialog` 组件
6. **FileTree 集成**：子条目必须通过 FileTree 渲染以获取连接线，禁止递归自渲染
7. **危险项 "!" 提示**：所有 `danger: true` 的菜单项若有 `hasHint`，必须使用 `MenuHintItem`（头部/更多操作菜单）或在 `ContextMenu` 中渲染 hint 图标（右键菜单）
8. **分割线规范**：白色选项与红色选项之间必须使用 `sep-danger` 分割线；递归选项之前使用 `sep-recursive` 分割线
9. **双端一致性**："更多操作"按钮菜单与右键菜单的选项必须完全一致（选项内容、顺序、分组、提示）
10. **递归删除**：`[嵌套]` 后缀的选项会递归操作所有嵌套子目录，通过 `gitHubCiFolders` 的 `parentId` 链遍历后代
