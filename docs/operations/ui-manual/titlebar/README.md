# 标题栏区域

> 标题栏包含品牌标识、应用菜单、操作按钮和窗口控制。

## 布局结构

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ [1] Brand   [2] App Menus    [3] Cmd    │  [9] Drag Region  │[4][5][6] [7][8]│
└──────────────────────────────────────────────────────────────────────────────┘
```

## 元素索引

| 编号 | 名称 | 文档 | 说明 |
|------|------|------|------|
| [1] | Brand | [brand.md](./brand.md) | 品牌 Logo |
| [2] | App Menus | [menus.md](./menus.md) | 应用菜单（文件/视图/帮助） |
| [3] | Command Palette | [menus.md](./menus.md#命令面板) | 命令面板触发按钮 |
| [4] | Theme Toggle | [actions.md](./actions.md#主题切换) | 主题切换按钮 |
| [5] | Language Toggle | [actions.md](./actions.md#语言切换) | 语言切换按钮 |
| [6] | Settings | [actions.md](./actions.md#设置按钮) | 设置按钮 |
| [7] | Panel Controls | [panels.md](./panels.md) | 面板控制按钮组 |
| [8] | Window Controls | [window.md](./window.md) | 窗口控制按钮组 |
| [9] | Drag Region | - | 窗口拖拽区域（不可交互） |

## 容器选择器

| 选择器 | 说明 |
|--------|------|
| `.adl-titlebar` | 标题栏容器 |
| `.adl-titlebar__left` | 左侧区域（Brand + Menus） |
| `.adl-titlebar__right` | 右侧区域（Actions + Panels + Window） |
| `.adl-titlebar__drag` | 拖拽区域（不可交互） |

## 子区域选择器

| 选择器 | 说明 |
|--------|------|
| `.adl-titlebar__brand-slot` | Brand 容器 |
| `.adl-titlebar__menus` | 菜单区域 |
| `.adl-titlebar__action-group` | 操作按钮组（主题/语言/设置） |
| `.adl-titlebar__panel-group` | 面板控制组 |
| `.adl-titlebar__window-group` | 窗口控制组 |

## 快速操作

### 打开文件菜单

```javascript
// 点击文件菜单
await page.click('.adl-menu[data-menu-id="file"] .adl-menu__trigger');
// 等待下拉菜单出现
await page.waitForSelector('.adl-menu[data-menu-id="file"] .adl-menu__dropdown');
```

### 切换主题

```javascript
// 点击主题按钮（循环切换：system → light → dark → system）
await page.click('button[aria-label="主题"]');
// 等待主题变化
await page.waitForFunction(() => {
  const theme = document.documentElement.getAttribute('data-theme');
  return theme !== null;
});
```

### 切换语言

```javascript
// 点击语言按钮（切换：中文 ↔ 英文）
await page.click('button[aria-label*="语言"]');
// 等待语言变化
await page.waitForFunction(() => {
  const lang = document.querySelector('.adl-titlebar__action-group button[aria-label*="语言"]');
  return lang !== null;
});
```

### 切换左侧边栏

```javascript
// 点击左面板切换按钮
await page.click('button[aria-label="切换左侧边栏"]');
// 等待状态变化
await page.waitForFunction(() => {
  const leftbar = document.querySelector('.adl-leftbar');
  return leftbar.classList.contains('adl-leftbar--collapsed');
});
```

### 最小化窗口

```javascript
await page.click('button[aria-label="最小化"]');
```

### 最大化/还原窗口

```javascript
// 点击最大化按钮
await page.click('button[aria-label="最大化"]');
// 或使用还原按钮（已最大化时）
await page.click('button[aria-label="还原"]');
```

### 关闭窗口

```javascript
await page.click('button[aria-label="关闭"]');
```

## 注意事项

1. **拖拽区域**：`.adl-titlebar__drag` 用于窗口拖拽，不可点击交互
2. **菜单状态**：菜单下拉是动态渲染的，需要等待出现后再操作
3. **主题切换**：主题切换是循环模式，无法直接指定主题
4. **语言切换**：语言切换是切换模式，无法直接指定语言
5. **窗口控制**：最小化/关闭后窗口会消失，测试需要重新启动
