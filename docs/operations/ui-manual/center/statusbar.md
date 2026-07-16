# 状态栏

> Composer 底部的内联状态栏，显示工作区、模型、Git 分支等信息。

## 容器选择器

| 选择器 | 说明 |
|--------|------|
| `.adl-composer .adl-statusbar` | Composer 内的状态栏 |
| `.adl-statusbar--inline` | 内联状态栏样式 |

---

## 状态栏项

### 工作区状态

> 显示当前工作区路径或全局模式

| 选择器 | 说明 |
|--------|------|
| `.adl-statusbar__workspace` | 工作区状态区域 |

#### 状态类型

| 状态 | 显示内容 | 说明 |
|------|----------|------|
| 全局模式 | "临时会话模式" | 不绑定工作区 |
| 工作区模式 | 工作区路径 | 已绑定工作区 |
| 待绑定 | "已选择待绑定工作空间..." | 选择但未确认 |

#### 操作

```javascript
// 点击工作区状态显示工作区选择器
await page.click('.adl-statusbar__workspace');
```

---

### 模型选择器

> 显示当前使用的模型

| 选择器 | 说明 |
|--------|------|
| `.adl-statusbar__model` | 模型选择区域 |

#### 操作

```javascript
// 点击模型选择器显示模型列表
await page.click('.adl-statusbar__model');

// 等待模型选择弹出框
await page.waitForSelector('.adl-model-selector');
```

---

### Git 分支选择器

> 显示当前 Git 分支

| 选择器 | 说明 |
|--------|------|
| `.adl-statusbar__git` | Git 状态区域 |

#### 状态

| 状态 | 显示内容 | 说明 |
|------|----------|------|
| 非 Git 仓库 | "非 Git 仓库" | 工作区不是 Git 仓库 |
| 已同步 | "已同步" | 与远程同步 |
| 有未提交 | "有未提交" | 本地有未提交的更改 |
| 有未推送 | "有未推送" | 本地有未推送的提交 |
| 冲突 | "冲突" | 存在合并冲突 |
| 全局模式 | "无分支" | 不绑定工作区时禁用 |

#### 操作

```javascript
// 点击分支选择器显示分支列表
await page.click('.adl-statusbar__git');

// 等待分支选择弹出框
await page.waitForSelector('.adl-branch-popover');
```

---

## 工作区选择弹出框

> 点击工作区状态后显示的弹出框，包含最近工作区列表和 SplitButton 复合按钮。

### 定位选择器

| 优先级 | 类型 | 选择器 |
|--------|------|--------|
| 1 | CSS | `.adl-statusbar__menu--workspace` |

### 结构

```
┌─────────────────────────────────────────────┐
│ 工作空间                                     │
│ 当前工作区路径 或 "未绑定工作空间"            │
├─────────────────────────────────────────────┤
│ 最近使用                                      │
│ ┌─────────────────────────────────────────┐ │
│ │ 📂 工作空间A                            │ │
│ │ 📂 工作空间B                            │ │
│ └─────────────────────────────────────────┘ │
├─────────────────────────────────────────────┤
│ 绑定新工作空间                                │
│ ┌────────────────────────┬────────────────┐ │
│ │ [选择文件夹]            │ [▶]            │ │
│ │ ┌──────────────────────┴────────────────┐│ │
│ │ │ 选择文件夹 │ 打开文件夹 │ 创建文件夹   ││ │
│ │ └──────────────────────────────────────┘│ │
│ └─────────────────────────────────────────┘ │
│ 打开文件夹模式：                             │
│ ┌─────────────────────────────────────────┐ │
│ │ [输入路径...                           ] │ │
│ └─────────────────────────────────────────┘ │
│ 创建文件夹模式：                             │
│ ┌────────────────────────┬────────────────┐ │
│ │ [输入名称或路径...     ] │ [⋮ 设置]      │ │
│ │ ┌──────────────────────┴────────────────┐│ │
│ │ │ 默认创建工作空间目录设置               ││ │
│ │ │ [默认目录...        ] [📂]            ││ │
│ │ │ 说明文字...                           ││ │
│ │ └──────────────────────────────────────┘│ │
│ └─────────────────────────────────────────┘ │
├─────────────────────────────────────────────┤
│ 临时会话模式                                  │
│ 不绑定工作空间，使用临时会话                    │
└─────────────────────────────────────────────┘
```

### 元素选择器

| 元素 | 选择器 | 说明 |
|------|--------|------|
| 工作区菜单 | `.adl-statusbar__menu--workspace` | 工作区选择弹出框容器 |
| 菜单标题 | `.adl-statusbar__menu-title` | 区域标题 |
| 菜单提示 | `.adl-statusbar__menu-hint` | 辅助说明文字 |
| 最近工作区列表 | `.adl-statusbar__menu-list` | 最近工作区列表容器 |
| 最近工作区项 | `.adl-statusbar__menu-option` | 单个最近工作区条目 |
| 最近工作区空状态 | `.adl-statusbar__menu-empty` | 无最近工作区时显示 |
| 当前工作区 | `.adl-statusbar__menu-option.is-active` | 当前激活的工作区 |
| SplitButton 主按钮 | `.adl-split-btn__main` | 执行当前模式的主操作按钮 |
| SplitButton 下拉箭头 | `.adl-split-btn__drop` | 悬停显示模式切换菜单 |
| 模式切换菜单 | `.adl-split-btn__menu` | 三种操作模式切换菜单 |
| 模式选项 | `.adl-split-btn__option` | 单个模式选项（选择/打开/创建） |
| 输入框 | `.adl-split-btn__input` | 路径/名称输入框 |
| 输入框行 | `.adl-split-btn__input-row` | 输入框所在行容器 |
| 输入框区域 | `.adl-split-btn__input-area` | 输入框区域容器 |
| 错误提示 | `.adl-split-btn__error` | 路径错误提示文字 |
| 设置按钮 | `.adl-split-btn__dots` | ⋮ 设置面板触发按钮 |
| 设置面板 | `.adl-split-btn__settings` | 默认目录设置面板 |
| 设置标题 | `.adl-split-btn__settings-title` | 设置面板标题 |
| 设置说明 | `.adl-split-btn__settings-desc` | 创建文件夹规则说明 |
| 全局模式选项 | `.adl-statusbar__menu-option--global` | 切换到临时会话模式 |

### 操作模式

SplitButton 支持三种操作模式，通过悬停下拉菜单切换：

| 模式 | 显示文本 | 说明 |
|------|----------|------|
| pick | 选择文件夹 | 点击主按钮直接打开原生目录选择器 |
| open | 打开文件夹 | 显示输入框，输入已有路径后点击主按钮打开 |
| create | 创建文件夹 | 显示输入框和设置面板，输入名称/路径后自动创建并打开 |

### 操作

#### 选择最近工作区

```javascript
await page.click('.adl-statusbar__menu-option:not(.adl-statusbar__menu-option--global):not(.is-active)');
```

#### 选择文件夹模式（默认模式）

```javascript
// 点击 SplitButton 主按钮打开目录选择器
await page.click('.adl-split-btn__main');
```

#### 切换操作模式

```javascript
// 悬停下拉箭头显示模式菜单
await page.hover('.adl-split-btn__drop');

// 等待菜单出现
await page.waitForSelector('.adl-split-btn__menu', { visible: true });

// 选择"打开文件夹"模式
await page.click('.adl-split-btn__option:nth-child(2)');
```

#### 打开文件夹模式

```javascript
// 输入路径
await page.fill('.adl-split-btn__input', '/path/to/folder');

// 点击主按钮打开
await page.click('.adl-split-btn__main');

// 等待错误提示（如路径不存在）
await page.waitForSelector('.adl-split-btn__error');
```

#### 创建文件夹模式

```javascript
// 切换至创建模式后
// 输入工作空间名称或完整路径
await page.fill('.adl-split-btn__input', 'my-project');

// 点击主按钮创建并打开
await page.click('.adl-split-btn__main');
```

#### 设置默认目录（创建文件夹模式下）

```javascript
// 悬停 ⋮ 按钮显示设置面板
await page.hover('.adl-split-btn__dots');

// 等待设置面板出现
await page.waitForSelector('.adl-split-btn__settings', { visible: true });

// 修改默认目录路径
await page.fill('.adl-split-btn__settings .adl-split-btn__input', '/path/to/default');

// 或点击 📂 按钮打开目录选择器
await page.click('.adl-split-btn__settings .adl-split-btn__dots');
// 设置自动保存到 localStorage
```

#### 切换到临时会话模式

```javascript
// 点击"临时会话模式"选项
await page.click('.adl-statusbar__menu-option--global');
```

---

## 模型选择弹出框

> 点击模型选择器后显示的弹出框

### 定位选择器

| 优先级 | 类型 | 选择器 |
|--------|------|--------|
| 1 | CSS | `.adl-model-selector` |

### 操作

```javascript
// 选择模型
await page.click('.adl-model-selector__item');
```

---

## 分支选择弹出框

> 点击 Git 分支选择器后显示的弹出框

### 定位选择器

| 优先级 | 类型 | 选择器 |
|--------|------|--------|
| 1 | CSS | `.adl-branch-popover` |

### 结构

```
┌────────────────────────────────────────┐
│ 本地分支                               │
│ ┌────────────────────────────────────┐ │
│ │ ✓ main                             │ │
│ │   develop                          │ │
│ │   feature/xxx                      │ │
│ └────────────────────────────────────┘ │
├────────────────────────────────────────┤
│ 新建分支                               │
│ [输入新分支名称]                       │
│ [创建并切换]                           │
└────────────────────────────────────────┘
```

### 操作

#### 切换分支

```javascript
await page.click('.adl-branch-popover__item:not(.is-active)');
```

#### 新建分支

```javascript
// 输入分支名称
await page.fill('.adl-branch-popover__input', 'feature/new-feature');

// 点击创建
await page.click('button:has-text("创建并切换")');
```

---

## 相关元素

| 元素 | 选择器 | 说明 |
|------|--------|------|
| 状态栏 | `.adl-statusbar` | 状态栏容器 |
| 工作区状态 | `.adl-statusbar__workspace` | 工作区显示区域 |
| 模型选择器 | `.adl-statusbar__model` | 模型显示区域 |
| Git 状态 | `.adl-statusbar__git` | Git 分支显示区域 |
