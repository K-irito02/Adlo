# 操作按钮组

> 标题栏右侧的操作按钮组：添加工作区 + 通知。
> 主题与语言不在标题栏，统一在设置面板「通用」组。

## 按钮列表

| 按钮 | 说明 | 文档 |
|------|------|------|
| 添加工作区 | 打开系统原生目录选择器，选择并加载工作区 | [添加工作区](#添加工作区) |
| 通知 | 打开通知下拉（未读角标 + 全部已读 / 清空） | [通知](#通知) |

## 容器选择器

| 选择器 | 说明 |
|--------|------|
| `.adl-titlebar__action-group` | 操作按钮组容器 |
| `.adl-titlebar__action-divider` | 添加工作区与通知之间的自然分界线（整高 1px 细线） |
| `.adl-iconstrip` | 按钮条容器 |
| `.adl-notif-wrapper` | 通知按钮 + 下拉的容器 |

---

## 添加工作区

> 打开系统原生资源管理器，由用户选择目录作为工作区并加载（复用「打开文件夹」流程：`pickWorkspaceDirectory` + `openWorkspace`）。
> 图标为文件夹 + 加号（`IconFolderPlus`）。

### 定位选择器

| 优先级 | 类型 | 选择器 |
|--------|------|--------|
| 1 | aria-label | `button[aria-label="添加工作区"]`（英文环境 `Add workspace`） |
| 2 | CSS | `.adl-titlebar__action-group button`（第一个按钮） |

### 前置条件

- [x] 无特殊条件

### 操作

```javascript
await page.click('button[aria-label="添加工作区"]');
```

### 状态变化

- 系统目录选择器弹出
- 选中目录后按钮进入**加载中**状态（`aria-label` 切换为“加载中”、图标变为 `Spinner`、按钮 `disabled`）
- 工作区加载完成后按钮恢复文件夹图标（`aria-label` 恢复为“添加工作区”）

### 预期结果

- 用户可通过系统资源管理器任意选择目录
- 选择后右侧工具面板加载并激活该工作区
- 加载期间按钮显示 loading 动画，防止重复点击

### 等待条件

```javascript
await page.waitForSelector('button[aria-label="添加工作区"]:not([disabled])');
```

---

## 通知

> 打开通知下拉；未读数量以角标显示（>99 显示 `99+`）。

### 定位选择器

| 优先级 | 类型 | 选择器 |
|--------|------|--------|
| 1 | aria-label | `button[aria-label="通知"]`（英文环境 `Notifications`） |
| 2 | CSS | `.adl-notif-wrapper > button` |

### 操作

```javascript
await page.click('button[aria-label="通知"]');
await page.waitForSelector('.adl-notif-dropdown');
```

### 状态变化

- 下拉展开；滚动到可视区域的卡片在关闭后标记为已读
- 下拉头部提供「全部已读」「清空」动作
- 点击外部或按 Escape 关闭

### 预期结果

- 未读角标随已读状态更新
- 无通知时显示空态文案

### 等待条件

```javascript
await page.waitForSelector('.adl-notif-dropdown');
```

---

## 主题 / 语言 / 设置入口

- 主题：设置面板 → 通用 → 主题（跟随系统 / 浅色 / 暗色）
- 语言：设置面板 → 通用 → 语言（跟随系统 / 中文 / English）
- 设置入口：汉堡菜单「视图 → 设置」，或快捷键 `Ctrl+Shift+Comma`（`settings.open`，见 `defaultCommands.ts`）

标题栏不再渲染这些按钮，自动化用例请勿再按 `button[aria-label="主题"]` / `button[aria-label*="语言"]` 定位。

## 相关元素

| 元素 | 选择器 | 说明 |
|------|--------|------|
| 操作按钮组 | `.adl-titlebar__action-group` | 包含添加工作区、通知 |
| 分界线 | `.adl-titlebar__action-divider` | 添加工作区与通知之间的分界线（`aria-hidden`） |
| 拖拽车道 | `.adl-titlebar__drag-lane` | 操作组左侧 24px 窗口拖拽区 |
| Tooltip | `.tooltip__content` | 悬停按钮时显示的提示 |
