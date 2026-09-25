# 文件菜单

> 文件菜单包含工作区操作与退出。面板切换项已移至视图菜单。

## 菜单项列表

| 菜单项 | 快捷键 | 说明 | 文档链接 |
|--------|--------|------|----------|
| 新建工作空间 | `Ctrl+N` | 创建新的工作空间 | [新建工作空间](#新建工作空间) |
| 打开文件夹 | `Ctrl+O` | 打开现有文件夹作为工作空间 | [打开文件夹](#打开文件夹) |
| 新建临时会话 | `Ctrl+Shift+N` | 创建不绑定工作区的临时会话 | [新建临时会话](#新建临时会话) |
| ────────── | - | 分隔线 | - |
| 退出 | `Alt+F4`（macOS `⌘Q`） | 关闭应用 | [退出](#退出) |

## 定位选择器

| 优先级 | 类型 | 选择器 |
|--------|------|--------|
| 1 | aria-label | `.adl-menu[data-menu-id="file"] .adl-menu__trigger` |
| 2 | CSS | `.adl-menu[data-menu-id="file"]` |

## 操作详情

### 新建工作空间

| 属性 | 值 |
|------|-----|
| 菜单项选择器 | `.adl-menu__item` (包含 "新建工作空间" 文本) |
| 快捷键 | `Ctrl+N` |

#### 前置条件

- [x] 无特殊条件

#### 操作

```javascript
// 方式1：通过菜单
await page.click('.adl-menu[data-menu-id="file"] .adl-menu__trigger');
await page.waitForSelector('.adl-menu[data-menu-id="file"] .adl-menu__dropdown');
await page.click('.adl-menu__item:has-text("新建工作空间")');

// 方式2：通过快捷键
await page.keyboard.down('Control');
await page.keyboard.press('N');
await page.keyboard.up('Control');
```

#### 状态变化

- 弹出文件夹选择对话框（Tauri 原生对话框 / 浏览器模式通过 Vite Preview API）
- 或弹出输入框让用户输入路径

#### 预期结果

- 如果选择了有效路径，创建新工作空间并打开
- 左侧边栏显示新工作空间

#### 等待条件

```javascript
// 等待工作空间创建
await page.waitForSelector('.adl-workspace-item.is-current');
```

---

### 打开文件夹

| 属性 | 值 |
|------|-----|
| 菜单项选择器 | `.adl-menu__item` (包含 "打开文件夹" 文本) |
| 快捷键 | `Ctrl+O` |

#### 前置条件

- [x] 无特殊条件

#### 操作

```javascript
// 方式1：通过菜单
await page.click('.adl-menu[data-menu-id="file"] .adl-menu__trigger');
await page.waitForSelector('.adl-menu[data-menu-id="file"] .adl-menu__dropdown');
await page.click('.adl-menu__item:has-text("打开文件夹")');

// 方式2：通过快捷键
await page.keyboard.down('Control');
await page.keyboard.press('O');
await page.keyboard.up('Control');
```

#### 状态变化

- 弹出文件夹选择对话框

#### 预期结果

- 选择文件夹后，打开该文件夹作为工作空间
- 左侧边栏显示工作空间
- 右侧面板加载文件树

#### 等待条件

```javascript
// 等待工作空间加载
await page.waitForSelector('.adl-workspace-item.is-current');
// 等待文件树加载
await page.waitForSelector('.adl-file-tree');
```

---

### 新建临时会话

> 以下为既有文档（与本轮菜单调整无关，原样保留）。

| 属性 | 值 |
|------|-----|
| 快捷键 | `Ctrl+Shift+N` |

#### 前置条件

- [x] 无特殊条件

#### 操作

```javascript
// 通过快捷键
await page.keyboard.down('Control');
await page.keyboard.down('Shift');
await page.keyboard.press('N');
await page.keyboard.up('Shift');
await page.keyboard.up('Control');
```

#### 状态变化

- 弹出「新建临时会话」对话框
- 对话框包含名称输入框
- 输入框默认聚焦

#### 预期结果

- 对话框显示
- 输入框为空或包含自动生成的名称
- 点击「创建会话」按钮后，左侧边栏「临时会话」区域出现新的会话标签

#### 等待条件

```javascript
// 等待对话框出现
await page.waitForSelector('.adl-prompt-modal');
```

---

### 已移至视图菜单的面板项

> 以下三项已改名为"打开 · X 面板"并移至视图菜单（另见 [view-menu.md](./view-menu.md)）：
> 打开 · 文件面板（`Ctrl+Shift+E`）、打开 · 浏览器面板（`Ctrl+Shift+B`）、
> 打开 · 终端面板（`` Ctrl+Shift+` ``）。自动化脚本请更新选择器。

### 退出

| 属性 | 值 |
|------|-----|
| 菜单项选择器 | `.adl-menu__item` (包含 "退出" 文本) |
| 快捷键 | `Alt+F4` |

#### 前置条件

- [x] 无特殊条件

#### 操作

```javascript
// 方式1：通过菜单
await page.click('.adl-menu[data-menu-id="file"] .adl-menu__trigger');
await page.waitForSelector('.adl-menu[data-menu-id="file"] .adl-menu__dropdown');
await page.click('.adl-menu__item:has-text("退出")');

// 方式2：通过快捷键
await page.keyboard.down('Alt');
await page.keyboard.press('F4');
await page.keyboard.up('Alt');
```

#### 状态变化

- 应用窗口关闭

#### 预期结果

- 应用退出

#### 注意

- 此操作会关闭应用，测试需要重新启动
