# 文件菜单

> 文件菜单包含工作区操作与退出。面板切换项已移至视图菜单。

## 菜单项列表

| 菜单项 | 快捷键 | 说明 | 文档链接 |
|--------|--------|------|----------|
| 新建工作区 | `Ctrl+N` | 创建新的工作区 | [新建工作区](#新建工作区) |
| 添加工作区 | `Ctrl+O` | 打开现有文件夹作为工作区 | [添加工作区](#添加工作区) |
| ────────── | - | 分隔线 | - |
| 退出 | `Alt+F4`（macOS `⌘Q`） | 关闭应用 | [退出](#退出) |

## 定位选择器

| 优先级 | 类型 | 选择器 |
|--------|------|--------|
| 1 | aria-label | `.adl-hamburger__trigger` |
| 2 | CSS | `.adl-hamburger__dropdown` / `.adl-hamburger__item` |

## 操作详情

### 新建工作区

| 属性 | 值 |
|------|-----|
| 菜单项选择器 | `.adl-hamburger__item` (包含 "新建工作区" 文本) |
| 快捷键 | `Ctrl+N` |

#### 前置条件

- [x] 无特殊条件

#### 操作

```javascript
// 方式1：通过菜单
await page.click('.adl-hamburger__trigger');
await page.waitForSelector('.adl-hamburger__dropdown');
await page.click('.adl-hamburger__item:has-text("新建工作区")');

// 方式2：通过快捷键
await page.keyboard.down('Control');
await page.keyboard.press('N');
await page.keyboard.up('Control');
```

#### 状态变化

- 弹出文件夹选择对话框（Tauri 原生对话框 / 浏览器模式通过 Vite Preview API）
- 或弹出输入框让用户输入路径

#### 预期结果

- 如果选择了有效路径，创建新工作区并打开
- 右面板 multi-tree（`.adl-multitree`）显示新工作区

#### 等待条件

```javascript
// 等待工作区创建
await page.waitForSelector('.adl-multitree');
```

---

### 添加工作区

| 属性 | 值 |
|------|-----|
| 菜单项选择器 | `.adl-hamburger__item` (包含 "添加工作区" 文本) |
| 快捷键 | `Ctrl+O` |

#### 前置条件

- [x] 无特殊条件

#### 操作

```javascript
// 方式1：通过菜单
await page.click('.adl-hamburger__trigger');
await page.waitForSelector('.adl-hamburger__dropdown');
await page.click('.adl-hamburger__item:has-text("添加工作区")');

// 方式2：通过快捷键
await page.keyboard.down('Control');
await page.keyboard.press('O');
await page.keyboard.up('Control');
```

#### 状态变化

- 弹出文件夹选择对话框

#### 预期结果

- 选择文件夹后，打开该文件夹作为工作区
- 右面板 multi-tree（`.adl-multitree`）显示工作区
- 右侧面板加载文件树

#### 等待条件

```javascript
// 等待工作区加载
await page.waitForSelector('.adl-multitree');
// 等待文件树加载
await page.waitForSelector('.adl-multitree .adl-filetree__row');
```

---

### 已移至视图菜单的面板项

> 以下三项已改名为"打开 · X 面板"并移至视图菜单（另见 [view-menu.md](./view-menu.md)）：
> 打开 · 文件面板（`Ctrl+Shift+E`）、打开 · 浏览器面板（`Ctrl+Shift+B`）、
> 打开 · 终端面板（`` Ctrl+Shift+` ``）。自动化脚本请更新选择器。

### 退出

| 属性 | 值 |
|------|-----|
| 菜单项选择器 | `.adl-hamburger__item` (包含 "退出" 文本) |
| 快捷键 | `Alt+F4` |

#### 前置条件

- [x] 无特殊条件

#### 操作

```javascript
// 方式1：通过菜单
await page.click('.adl-hamburger__trigger');
await page.waitForSelector('.adl-hamburger__dropdown');
await page.click('.adl-hamburger__item:has-text("退出")');

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
