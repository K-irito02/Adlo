# 文件菜单

> 文件菜单包含工作区、终端、浏览器相关操作。

## 菜单项列表

| 菜单项 | 快捷键 | 说明 | 文档链接 |
|--------|--------|------|----------|
| 新建工作空间 | `Ctrl+N` | 创建新的工作空间 | [新建工作空间](#新建工作空间) |
| 打开文件夹 | `Ctrl+O` | 打开现有文件夹作为工作空间 | [打开文件夹](#打开文件夹) |
| 新建终端 | `Ctrl+Shift+\`` | 在右侧面板打开新终端标签 | [新建终端](#新建终端) |
| 新建浏览器 | - | 在右侧面板打开新浏览器标签 | [新建浏览器](#新建浏览器) |
| 打开编辑器窗口 | - | 切换到文件工具面板 | [打开编辑器窗口](#打开编辑器窗口) |
| ────────── | - | 分隔线 | - |
| 退出 | `Alt+F4` | 关闭应用 | [退出](#退出) |

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

### 新建终端

| 属性 | 值 |
|------|-----|
| 菜单项选择器 | `.adl-menu__item` (包含 "新建终端" 文本) |
| 快捷键 | `Ctrl+Shift+\`` |

#### 前置条件

- [x] 无特殊条件

#### 操作

```javascript
// 方式1：通过菜单
await page.click('.adl-menu[data-menu-id="file"] .adl-menu__trigger');
await page.waitForSelector('.adl-menu[data-menu-id="file"] .adl-menu__dropdown');
await page.click('.adl-menu__item:has-text("新建终端")');

// 方式2：通过快捷键
await page.keyboard.down('Control');
await page.keyboard.down('Shift');
await page.keyboard.press('`');
await page.keyboard.up('Shift');
await page.keyboard.up('Control');
```

#### 状态变化

- 右侧面板切换到终端工具
- 创建新的终端标签

#### 预期结果

- 终端面板激活
- 新终端标签出现

#### 等待条件

```javascript
// 等待终端面板激活
await page.waitForSelector('#terminal-panel.is-active');
```

---

### 新建浏览器

| 属性 | 值 |
|------|-----|
| 菜单项选择器 | `.adl-menu__item` (包含 "新建浏览器" 文本) |

#### 前置条件

- [x] 无特殊条件

#### 操作

```javascript
await page.click('.adl-menu[data-menu-id="file"] .adl-menu__trigger');
await page.waitForSelector('.adl-menu[data-menu-id="file"] .adl-menu__dropdown');
await page.click('.adl-menu__item:has-text("新建浏览器")');
```

#### 状态变化

- 右侧面板切换到浏览器工具
- 创建新的浏览器标签

#### 预期结果

- 浏览器面板激活
- 新浏览器标签出现

#### 等待条件

```javascript
await page.waitForSelector('#browser-panel.is-active');
```

---

### 打开编辑器窗口

| 属性 | 值 |
|------|-----|
| 菜单项选择器 | `.adl-menu__item` (包含 "打开编辑器窗口" 文本) |

#### 前置条件

- [x] 无特殊条件

#### 操作

```javascript
await page.click('.adl-menu[data-menu-id="file"] .adl-menu__trigger');
await page.waitForSelector('.adl-menu[data-menu-id="file"] .adl-menu__dropdown');
await page.click('.adl-menu__item:has-text("打开编辑器窗口")');
```

#### 状态变化

- 右侧面板切换到文件工具

#### 预期结果

- 文件面板激活

#### 等待条件

```javascript
await page.waitForSelector('#files-panel.is-active');
```

---

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
