# 工作区操作按钮（WorkspaceSplitButton）

> 实现：`frontend/src/app/components/WorkspaceSplitButton.tsx`（`.adl-split-btn`）。

## 三种操作模式

主按钮行为随模式变化（`WorkspaceActionMode = 'pick' | 'open' | 'create'`，默认 `pick`，持久化于 `localStorage.adl_workspace_menu_mode`）：

| 模式 | 主按钮 | 说明 |
|------|--------|------|
| pick | 选择文件夹 | 直接打开原生目录选择器（`onPickWorkspaceDirectory`），选中后打开 |
| open | 打开文件夹 | 显示路径输入框，回车/点主按钮按输入路径打开 |
| create | 创建文件夹 | 显示名称/路径输入框 + ⋮ 设置按钮；纯名称且有默认创建目录时拼接到默认目录下 |

失败时行内错误（`.adl-split-btn__error`，文案 `workspacePathNotFound` 或后端返回）；处理中主按钮禁用。

## 元素选择器

| 元素 | 选择器 | 说明 |
|------|--------|------|
| 根容器 | `.adl-split-btn` | 复合按钮 |
| 主按钮 | `.adl-split-btn__main` | 执行当前模式操作 |
| 下拉箭头 | `.adl-split-btn__drop`（`aria-haspopup="menu"`） | 悬停显示模式菜单（离开 300ms 后关闭） |
| 模式菜单 | `.adl-split-btn__menu` | 三模式选项 |
| 模式选项 | `.adl-split-btn__option`（`.is-active` 为当前） | 选择/打开/创建 |
| 输入区 | `.adl-split-btn__input-area` / `__input-row` | open/create 模式输入行 |
| 输入框 | `.adl-split-btn__input`（`.adl-split-btn__input--error` 为出错态） | 回车提交 |
| 错误提示 | `.adl-split-btn__error` | 路径错误文字 |
| 设置按钮 | `.adl-split-btn__dots`（`title=workspaceCreateDefaultDirTooltip`） | 悬停显示默认目录设置面板 |
| 设置面板 | `.adl-split-btn__settings`（标题 `__settings-title` + 说明 `__settings-desc`） | 默认创建目录输入（变更即写 `localStorage.adl_workspace_default_create_dir`）+ 目录选择器按钮 |

## 操作

### 选择文件夹模式（默认）

```javascript
// 点击 SplitButton 主按钮打开目录选择器
await page.click('.adl-split-btn__main');
```

### 切换操作模式

```javascript
// 悬停下拉箭头显示模式菜单
await page.hover('.adl-split-btn__drop');

// 等待菜单出现
await page.waitForSelector('.adl-split-btn__menu', { visible: true });

// 选择"打开文件夹"模式
await page.click('.adl-split-btn__option:nth-child(2)');
```

### 打开文件夹模式

```javascript
// 输入路径后回车或点主按钮
await page.fill('.adl-split-btn__input', '/path/to/folder');
await page.click('.adl-split-btn__main');

// 路径不存在时行内报错
await page.waitForSelector('.adl-split-btn__error');
```

### 创建文件夹模式

```javascript
// 输入名称（纯名称时拼接到默认创建目录）或完整路径
await page.fill('.adl-split-btn__input', 'my-project');

// 点击主按钮创建并打开
await page.click('.adl-split-btn__main');
```

### 设置默认创建目录（创建模式下）

```javascript
// 悬停 ⋮ 按钮显示设置面板
await page.hover('.adl-split-btn__dots');

// 等待设置面板出现
await page.waitForSelector('.adl-split-btn__settings', { visible: true });

// 修改默认目录路径（输入即写 localStorage，无保存按钮）
await page.fill('.adl-split-btn__settings .adl-split-btn__input', '/path/to/default');

// 或点目录选择器按钮选择
await page.click('.adl-split-btn__settings .adl-split-btn__dots');
```
