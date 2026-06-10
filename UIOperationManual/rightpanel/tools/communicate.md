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
| 操作按钮 | `.adl-browser-entry__actions` | 顶级目录悬停出现：IconTrash（删除CI配置及数据）+ IconSettings（设置） |
| 子条目区 | `.adl-browser-entry__tree` | 使用 FileTree 组件渲染 |
| 子条目行 | `.adl-filetree__row` | 含连接线（CSS 伪元素 `::before`） |
| 子条目文件图标 | `.adl-github-entry__icon` | Overview/Workflows/Jobs/Logs 的自定义 SVG |
| 子条目文件夹菜单 | `.adl-browser-node__actions` | 嵌套目录悬停出现，按钮顺序同上 |
| 子条目右键菜单 | `.adl-multitree-entry__menu` | 右键菜单：删除CI配置及数据 + 重命名 |

### 交互规则

| 场景 | 行为 |
|------|------|
| 点击顶级目录 | 展开/折叠子条目 + 选中高亮 |
| 点击子目录 | 展开/折叠 + 选中高亮 |
| 点击子文件（Overview 等） | 选中 + 右侧内容区切换对应视图 |
| 悬停顶级目录 | 计数渐隐 → 操作按钮渐显 |
| 悬停子目录 | 计数渐隐 → 操作按钮在 `.adl-filetree__meta` 中渐显 |
| 点击顶级目录「设置」 | 打开 CI 配置对话框（Owner/Repo/Branch/Token） |
| 点击子目录「设置」 | 工作区子目录 → 打开 CI 配置对话框；用户目录子目录 → 打开 RenameDialog |
| 点击「删除CI配置及数据」 | 删除目录及其关联数据 |
| 右键菜单 | 删除CI配置及数据（危险项）+ 重命名（启动 RenameDialog） |

### 按钮顺序

所有目录的操作按钮顺序固定为：**IconTrash（删除CI配置及数据）→ IconSettings（设置）**

## 注意事项

1. **Token 安全**：Token 保存在浏览器 localStorage 或 Tauri 系统钥匙串，不发送到第三方服务器
2. **日志获取**：GitHub API 返回 ZIP 压缩包，后端解压后按 Job 分组返回
3. **缓存策略**：后端 LRU 缓存（10 个 Run），前端会话级缓存（页面刷新重置）
4. **图标规范**：所有图标使用 SVG 格式，禁止 emoji
5. **重命名规范**：禁止使用 `window.prompt`，必须使用 `RenameDialog` 组件
6. **FileTree 集成**：子条目必须通过 FileTree 渲染以获取连接线，禁止递归自渲染
