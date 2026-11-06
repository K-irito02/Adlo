# 标题栏区域

> 标题栏包含汉堡菜单、中心标签条、拖拽车道、操作按钮（添加工作区 / 通知）、面板控制与窗口控制。
> 主题与语言已移入设置面板「通用」组，不再占用标题栏。

## 布局结构

```
┌──────────────────────────────────────────────────────────────────────────────────────┐
│ [1] 汉堡 │ [2] 中心标签条（+ 跟随末标签） │ [6] 拖拽车道 │ [3] 操作组 │ [4] 面板组 │ [5] 窗口 │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

## 元素索引

| 编号 | 名称 | 文档 | 说明 |
|------|------|------|------|
| [1] | Hamburger Menu | [hamburger-menu.md](./hamburger-menu.md) | 汉堡菜单（文件/视图/帮助） |
| [2] | Center Tabs | [center-tabs.md](./center-tabs.md) | 中心标签条（切换/关闭/拖拽排序/溢出滚动/两端渐隐） |
| [3] | Action Group | [actions.md](./actions.md) | 添加工作区 + 通知 |
| [4] | Panel Controls | [panels.md](./panels.md) | 面板控制按钮组（两侧 / 左 / 右） |
| [5] | Window Controls | [window.md](./window.md) | 窗口控制按钮组 |
| [6] | Drag Lane | - | 24px 窗口拖拽车道（不可交互，悬停显示握把点） |

子文档：[center-tabs.md](./center-tabs.md)、[actions.md](./actions.md)、[panels.md](./panels.md)、[window.md](./window.md)、[menus/](./menus/README.md)。

## 容器选择器

| 选择器 | 说明 |
|--------|------|
| `.adl-titlebar` | 标题栏容器 |
| `.adl-titlebar__left` | 左侧区域（Hamburger Menu，`padding-right` 保留与标签条的间距，无分割线） |
| `.adl-titlebar__right` | 右侧区域（Actions + Panels + Window） |
| `.adl-titlebar__drag-lane` | 拖拽车道（24px，`data-tauri-drag-region`，flex 不收缩） |

## 子区域选择器

| 选择器 | 说明 |
|--------|------|
| `.adl-hamburger` | 汉堡菜单容器 |
| `.adl-center-tab-strip` | 中心标签条容器 |
| `.adl-center-tab-strip__scroll` | 标签滚动区（`data-tauri-drag-region`） |
| `.adl-center-tab-strip__tabs` | `role="tablist"` 容器（`display: contents`，仅承载 ARIA 归属） |
| `.adl-center-tab` | 中心标签 |
| `.adl-center-tab-strip__add` | 「+」新建入口页（跟随最后一个标签；溢出时 `position: sticky` 固定右端） |
| `.adl-center-tab-strip__fade-left` / `__fade-right` | 两端溢出渐隐（24px，mask + `backdrop-filter: blur(2px)`） |
| `.adl-titlebar__action-group` | 操作按钮组（添加工作区 / 通知） |
| `.adl-titlebar__panel-group` | 面板控制组 |
| `.adl-titlebar__window-group` | 窗口控制组 |

## 快速操作

### 打开汉堡菜单

```javascript
await page.click('.adl-hamburger__trigger');
await page.waitForSelector('.adl-hamburger__dropdown');
```

### 切换主题 / 语言（设置面板）

```javascript
// 标题栏不再提供主题/语言按钮；快捷键打开设置，再切到「通用」组
await page.keyboard.press('Control+Shift+Comma');
```

- 主题：设置 → 通用 → 主题（跟随系统 / 浅色 / 暗色）
- 语言：设置 → 通用 → 语言（跟随系统 / 中文 / English）

### 切换两侧面板

```javascript
await page.click('button[aria-label="切换两侧面板"]');
```

### 窗口拖拽

```javascript
// 拖拽车道永远保留 24px，即使标签占满整条也可拖动窗口
await page.mouse.move(laneCenterX, laneCenterY);
await page.mouse.down();
await page.mouse.move(laneCenterX + 80, laneCenterY);
await page.mouse.up();
```

### 最小化 / 最大化 / 关闭

```javascript
await page.click('button[aria-label="最小化"]');
await page.click('button[aria-label="最大化"]');
await page.click('button[aria-label="关闭"]');
```

## 注意事项

1. **拖拽车道**：`.adl-titlebar__drag-lane` 固定 24px、不参与 flex 收缩；光标保持系统箭头，悬停显示握把点。
2. **中心标签条**：「+」跟随最后一个标签；标签溢出时 sticky 固定在右端，两端渐隐提示还有隐藏标签。
3. **菜单状态**：菜单下拉是动态渲染的，需要等待出现后再操作。
4. **主题 / 语言**：仅设置面板可改，标题栏无对应按钮。
5. **窗口控制**：最小化/关闭后窗口会消失，测试需要重新启动。
