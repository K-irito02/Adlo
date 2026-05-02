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
| 全局模式 | "对话模式" | 不绑定工作区 |
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

> 点击工作区状态后显示的弹出框

### 定位选择器

| 优先级 | 类型 | 选择器 |
|--------|------|--------|
| 1 | CSS | `.adl-workspace-popover` |

### 结构

```
┌────────────────────────────────────────┐
│ 最近工作空间                           │
│ ┌────────────────────────────────────┐ │
│ │ 📂 项目A                           │ │
│ │ 📂 项目B                           │ │
│ └────────────────────────────────────┘ │
├────────────────────────────────────────┤
│ 绑定新工作空间                         │
│ [选择文件夹] [绑定该路径]              │
└────────────────────────────────────────┘
```

### 操作

#### 选择最近工作区

```javascript
await page.click('.adl-workspace-popover__recent button');
```

#### 选择文件夹

```javascript
await page.click('button:has-text("选择文件夹")');
```

#### 绑定路径

```javascript
await page.click('button:has-text("绑定该路径")');
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
