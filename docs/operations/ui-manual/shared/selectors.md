# 选择器定位策略

> 本文档定义 Agent 进行 UI 自动化测试时的元素定位策略。

## 定位优先级

按以下优先级顺序选择定位方式：

| 优先级 | 类型        | 格式                            | 稳定性 | 说明                           |
| ------ | ----------- | ------------------------------- | ------ | ------------------------------ |
| 1      | aria-label  | `[aria-label="设置"]`           | ⭐⭐⭐ | 无障碍属性，语义明确，推荐首选 |
| 2      | data-testid | `[data-testid="editor-shell"]` | ⭐⭐⭐ | 测试专用属性，稳定可靠         |
| 3      | role + name | `button[aria-label="设置"]`     | ⭐⭐   | 语义化组合                     |
| 4      | CSS 类名    | `.adl-hamburger__trigger`      | ⭐     | 样式类名，可能随重构变化       |

## 选择器类型详解

### 1. aria-label 属性

适用于所有交互元素，特别是按钮、链接、输入框。

```css
/* 按钮 */
button[aria-label="发送"]
button[aria-label="最小化"]

/* 输入框 */
input[aria-label="搜索"]
textarea[aria-label="消息输入"]

/* 链接 */
a[aria-label="帮助"]
```

**注意**：

- aria-label 值可能随语言切换变化（中/英）
- 建议使用包含关系：`[aria-label*="设置"]` 或精确匹配

### 2. data-testid 属性

测试专用属性，需要在代码中预先添加。

```css
[data-testid="editor-shell"]
[data-testid="changes-preview-shell"]
[data-testid="patch-apply"]
[data-testid="files-sticky-context"]
```

**当前已添加的 data-testid**：

- `editor-shell` - 文件编辑器外壳（`FilesPanel.tsx`）
- `changes-preview-shell` - 变更预览外壳（`DiffEditorSection.tsx`）
- `patch-apply` - 补丁应用（`PatchReviewSection.tsx`）
- `files-sticky-context` - 文件吸顶上下文（`EditorSurfaceShell.tsx`）

### 3. role + aria 组合

语义化定位，适合复杂组件。

```css
/* 菜单项 */
[role="menuitem"][aria-label="新建工作区"]

/* 标签页 */
[role="tab"][aria-selected="true"]

/* 对话框 */
[role="dialog"][aria-label="设置"]

/* 列表项 */
[role="listitem"][aria-label="工作区"]
```

### 4. CSS 类名

作为最后的备选方案。

```css
/* 布局容器 */
.adl-titlebar
.adl-leftbar
.adl-center
.adl-rightpanel

/* 组件类名 */
.adl-hamburger__trigger
.adl-tool-switcher__tab

/* 状态修饰符 */
.adl-icon-btn:disabled
.adl-btn--primary
.is-active
.is-collapsed
```

## 组合选择器策略

### 按区域限定范围

```css
/* 标题栏内的按钮 */
.adl-titlebar button[aria-label="设置"]

/* 左侧边栏内的剪切看板 */
.adl-leftbar .adl-clipboard-history

/* 中心宿主内的入口页 */
.adl-center .adl-center-entry
```

### 按状态筛选

```css
/* 激活状态 */
.adl-tool-switcher__tab.is-active

/* 禁用状态 */
.adl-icon-btn:disabled

/* 折叠状态 */
.adl-leftbar--collapsed

/* 加载状态 */
[data-loading="true"]
```

## 常用选择器速查

### 标题栏

| 元素        | 选择器                                                     |
| ----------- | ---------------------------------------------------------- |
| 标题栏容器  | `.adl-titlebar`                                            |
| 汉堡菜单    | `.adl-hamburger__trigger`                                  |
| 汉堡下拉    | `.adl-hamburger__dropdown`                                 |
| 添加工作区  | `button[aria-label="添加工作区"]`                          |
| 通知        | `button[aria-label="通知"]`                                |
| 新建入口页  | `.adl-center-tab-strip__add button`                        |
| 切换两侧面板 | `button[aria-label="切换两侧面板"]`                       |
| 左面板切换  | `button[aria-label="切换左侧边栏"]`                        |
| 右面板切换  | `button[aria-label="切换右侧面板"]`                        |
| 拖拽车道    | `.adl-titlebar__drag-lane`                                 |
| 最小化      | `button[aria-label="最小化"]`                              |
| 最大化/还原 | `button[aria-label="最大化"]`, `button[aria-label="还原"]` |
| 关闭        | `button[aria-label="关闭"]`                                |

### 左侧边栏

| 元素         | 选择器                              |
| ------------ | ----------------------------------- |
| 左侧边栏容器 | `.adl-leftbar`                      |
| 剪切看板     | `.adl-clipboard`（`__list` 列表） |
| 系统资源查看 | `.adl-sysmon` |
| 调整手柄     | `.adl-leftbar__resize-handle`       |

### 中心（多标签宿主）

| 元素         | 选择器                                                     |
| ------------ | ---------------------------------------------------------- |
| 中心宿主容器 | `.adl-center.adl-center--tab-host`                         |
| 统一入口页   | `.adl-center-entry`（dsh/浏览器/终端三入口）                |
| 缺 tab 提示  | `.adl-center__empty` + `.adl-welcome__empty`                |

### 右侧面板

| 元素         | 选择器                                               |
| ------------ | ---------------------------------------------------- |
| 右侧面板容器 | `.adl-rightpanel`                                    |
| 工具切换器   | `.adl-toolswitcher`                                  |
| 工具标签     | `.adl-toolswitcher__tab`                             |
| 激活标签     | `.adl-toolswitcher__tab.is-active`                   |
| 第一行工具栏折叠态 | `.adl-rightpanel--toolbar-collapsed`          |
| 工具栏开关   | `button[aria-label="折叠工具栏"]` / `button[aria-label="展开工具栏"]` |
| 文件面板     | `[id$="-files-panel"]` 或 `[aria-labelledby*="files"]`       |
| 变更面板     | `[id$="-changes-panel"]` 或 `[aria-labelledby*="changes"]`   |
| 浏览器面板   | `[id$="-browser-panel"]` 或 `[aria-labelledby*="browser"]`   |
| 终端面板     | `[id$="-terminal-panel"]` 或 `[aria-labelledby*="terminal"]`   |
| 设置面板     | `[id$="-settings-panel"]` 或 `[aria-labelledby*="settings"]` |
| 展开/还原按钮 | `.adl-toolswitcher__expand`                         |
| 调整手柄     | `.adl-rightpanel__resize-handle`                     | ⚠️ 仅 3px `::before` 线可拖拽（容器不吃指针，层级低于弹层遮罩） |

## 注意事项

1. **语言敏感性**：aria-label 值会随语言切换变化，建议使用部分匹配 `[aria-label*="设置"]`
2. **动态 ID**：部分元素 ID 使用 React `useId()` 生成，每次渲染可能变化，避免依赖
3. **状态变化**：同一元素在不同状态下可能有不同的 aria-label（如最大化/还原按钮）
4. **异步渲染**：部分元素在操作后才渲染（如菜单下拉），需要等待出现后再定位
