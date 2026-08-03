# 选择器定位策略

> 本文档定义 Agent 进行 UI 自动化测试时的元素定位策略。

## 定位优先级

按以下优先级顺序选择定位方式：

| 优先级 | 类型        | 格式                            | 稳定性 | 说明                           |
| ------ | ----------- | ------------------------------- | ------ | ------------------------------ |
| 1      | aria-label  | `[aria-label="发送"]`           | ⭐⭐⭐ | 无障碍属性，语义明确，推荐首选 |
| 2      | data-testid | `[data-testid="composer-send"]` | ⭐⭐⭐ | 测试专用属性，稳定可靠         |
| 3      | role + name | `button[aria-label="发送"]`     | ⭐⭐   | 语义化组合                     |
| 4      | CSS 类名    | `.adl-action-btn--primary`      | ⭐     | 样式类名，可能随重构变化       |

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
- 建议使用包含关系：`[aria-label*="发送"]` 或精确匹配

### 2. data-testid 属性

测试专用属性，需要在代码中预先添加。

```css
[data-testid="composer-send"]
[data-testid="composer-input"]
[data-testid="session-item"]
```

**当前已添加的 data-testid**：

- `composer-send` - 发送/停止按钮
- `composer-input` - 输入框

### 3. role + aria 组合

语义化定位，适合复杂组件。

```css
/* 菜单项 */
[role="menuitem"][aria-label="新建工作空间"]

/* 标签页 */
[role="tab"][aria-selected="true"]

/* 对话框 */
[role="dialog"][aria-label="设置"]

/* 列表项 */
[role="listitem"][aria-label="会话项"]
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
.adl-icon-btn
.adl-action-btn
.adl-session-item

/* 状态修饰符 */
.adl-icon-btn:disabled
.adl-action-btn--primary
.is-active
.is-collapsed
```

## 组合选择器策略

### 按区域限定范围

```css
/* 标题栏内的按钮 */
.adl-titlebar button[aria-label="设置"]

/* 左侧边栏内的会话项 */
.adl-leftbar .adl-session-item

/* 中心面板内的消息 */
.adl-center .adl-message
```

### 按状态筛选

```css
/* 激活状态 */
.adl-session-item.is-active

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
| 品牌 Logo   | `.adl-titlebar__brand`                                     |
| 文件菜单    | `[aria-label="文件"]` 或 `.adl-menu[data-menu-id="file"]`  |
| 视图菜单    | `[aria-label="视图"]` 或 `.adl-menu[data-menu-id="view"]`  |
| 帮助菜单    | `[aria-label="帮助"]` 或 `.adl-menu[data-menu-id="help"]`  |
| 主题按钮    | `button[aria-label="主题"]`                                |
| 语言按钮    | `button[aria-label*="语言"]`                               |
| 设置按钮    | `button[aria-label="设置"]`                                |
| 左面板切换  | `button[aria-label="切换左侧边栏"]`                        |
| 右面板切换  | `button[aria-label="切换右侧面板"]`                        |
| 最小化      | `button[aria-label="最小化"]`                              |
| 最大化/还原 | `button[aria-label="最大化"]`, `button[aria-label="还原"]` |
| 关闭        | `button[aria-label="关闭"]`                                |

### 左侧边栏

| 元素         | 选择器                              |
| ------------ | ----------------------------------- | ------------------------------------- |
| 左侧边栏容器 | `.adl-leftbar`                      |
| 快捷操作区   | `.adl-leftbar__quick`               |
| 技能按钮     | `.adl-quick-btn` (包含 "技能" 文本) |
| MCP 按钮     | `.adl-quick-btn` (包含 "MCP" 文本)  |
| 工作区列表   | `.adl-workspace-list`               |
| 工作区项     | `.adl-workspace-item`               |
| 当前工作区   | `.adl-workspace-item.is-current`    |
| 会话列表     | `.adl-session-list`                 |
| 会话项       | `.adl-session-item`                 |
| 激活会话     | `.adl-session-item.is-active`       |
| 归档区       | `.adl-archive`                      |
| 调整手柄     | `.adl-leftbar__resize-handle`       | ⚠️ 仅最右侧 3px `::before` 区域可拖拽 |

### 中心面板

| 元素         | 选择器                                                     |
| ------------ | ---------------------------------------------------------- |
| 中心面板容器 | `.adl-center`                                              |
| 消息流       | `.adl-message-stream`                                      |
| 用户消息     | `.adl-message--user`                                       |
| 助手消息     | `.adl-message--assistant`                                  |
| 流式消息     | `.adl-message--streaming`                                  |
| Composer     | `.adl-composer`                                            |
| 上下文标签   | `.adl-composer__chips .adl-chip`                           |
| 输入框       | `[data-testid="composer-input"]` 或 `.adl-composer__input` |
| 发送按钮     | `[data-testid="composer-send"]`                            |
| 停止按钮     | `[data-testid="composer-send"]` (状态变化)                 |
| 内联状态栏   | `.adl-composer .adl-statusbar`                             |

### 右侧面板

| 元素         | 选择器                                               |
| ------------ | ---------------------------------------------------- |
| 右侧面板容器 | `.adl-rightpanel`                                    |
| 工具切换器   | `.adl-tool-switcher`                                 |
| 工具标签     | `.adl-tool-switcher__tab`                            |
| 激活标签     | `.adl-tool-switcher__tab.is-active`                  |
| 文件面板     | `#files-panel` 或 `[aria-labelledby*="files"]`       |
| 变更面板     | `#changes-panel` 或 `[aria-labelledby*="changes"]`   |
| 浏览器面板   | `#browser-panel` 或 `[aria-labelledby*="browser"]`   |
| 终端面板     | `#terminal-panel` 或 `[aria-labelledby*="terminal"]` |
| 审计面板     | `#audit-panel` 或 `[aria-labelledby*="audit"]`       |
| 模型面板     | `#models-panel` 或 `[aria-labelledby*="models"]`     |
| 设置面板     | `#settings-panel` 或 `[aria-labelledby*="settings"]` |
| 调整手柄     | `.adl-rightpanel__resize-handle`                     |

## 注意事项

1. **语言敏感性**：aria-label 值会随语言切换变化，建议使用部分匹配 `[aria-label*="发送"]`
2. **动态 ID**：部分元素 ID 使用 React `useId()` 生成，每次渲染可能变化，避免依赖
3. **状态变化**：同一元素在不同状态下可能有不同的 aria-label（如最大化/还原按钮）
4. **异步渲染**：部分元素在操作后才渲染（如菜单下拉），需要等待出现后再定位
