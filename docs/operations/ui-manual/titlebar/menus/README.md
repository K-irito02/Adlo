# 应用菜单

> 标题栏的应用菜单系统，通过汉堡菜单访问文件、视图和帮助（命令面板已删除）。

## 菜单结构

菜单现在通过汉堡菜单（`[☰]`）访问，点击展开一级菜单，悬停展开二级子菜单。

详细结构和交互请参阅 [hamburger-menu.md](../hamburger-menu.md)。

## 菜单索引

| 菜单 | 文档 | 说明 |
|------|------|------|
| 文件 | [file-menu.md](./file-menu.md) | 工作区操作与退出 |
| 视图 | [view-menu.md](./view-menu.md) | 视图切换、缩放、设置 |
| 帮助 | [help-menu.md](./help-menu.md) | 快捷键、许可证 |

## 容器选择器

| 选择器 | 说明 |
|--------|------|
| `.adl-hamburger` | 汉堡菜单容器 |
| `.adl-hamburger__trigger` | 汉堡图标触发按钮 |
| `.adl-hamburger__dropdown` | 一级下拉菜单 |
| `.adl-hamburger__item` | 一级菜单项 |
| `.adl-hamburger__submenu` | 二级子菜单 |
| `.adl-hamburger__subitem` | 二级子菜单项 |

## 通用操作

### 打开汉堡菜单

```javascript
// 点击汉堡菜单图标
await page.click('.adl-hamburger__trigger');
// 等待下拉菜单出现
await page.waitForSelector('.adl-hamburger__dropdown');
```

### 关闭菜单

```javascript
// 点击菜单外部关闭
await page.click('.adl-titlebar__drag');

// 或按 Escape 键
await page.keyboard.press('Escape');

// 等待菜单关闭
await page.waitForSelector('.adl-hamburger__dropdown', { hidden: true });
```

### 悬停展开子菜单

```javascript
// 悬停在文件菜单项上，展开子菜单
const fileItem = await page.waitForSelector('.adl-hamburger__item:first-child');
await fileItem.hover();
// 等待子菜单出现
await page.waitForSelector('.adl-hamburger__submenu');
```

## 注意事项

1. **单菜单模式**：同一时间只能打开一个汉堡菜单
2. **悬停延迟**：鼠标在菜单项和子菜单之间移动有 120ms 延迟
3. **Escape 关闭**：按 Escape 键可关闭所有菜单
4. **异步渲染**：下拉菜单在点击触发按钮后才渲染，需要等待出现
