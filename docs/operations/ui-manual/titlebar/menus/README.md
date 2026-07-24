# 应用菜单

> 标题栏的应用菜单系统，包含文件、视图、帮助三个菜单。

## 菜单结构

```
┌─────────────────────────────────────────────────────────────┐
│ [LOGO]  [文件▼] [视图▼] [帮助▼] [🔍]  │      ...      │ ... │
│         ↓ 点击展开                                          │
│         ┌──────────────┐                                    │
│         │ 新建工作空间    Ctrl+N  │                          │
│         │ 打开文件夹      Ctrl+O  │                          │
│         │ 新建终端      Ctrl+Shift+`│                        │
│         │ 新建浏览器             │                          │
│         │ 打开编辑器窗口          │                          │
│         │ ───────────────────── │                          │
│         │ 退出              Alt+F4│                          │
│         └──────────────┘                                    │
└─────────────────────────────────────────────────────────────┘
```

## 菜单索引

| 菜单 | 文档 | 说明 |
|------|------|------|
| 文件 | [file-menu.md](./file-menu.md) | 工作区、终端、浏览器相关操作 |
| 视图 | [view-menu.md](./view-menu.md) | 视图切换、缩放、设置 |
| 帮助 | [help-menu.md](./help-menu.md) | 命令面板、快捷键、许可证 |

## 容器选择器

| 选择器 | 说明 |
|--------|------|
| `.adl-titlebar__menus` | 菜单区域容器 |
| `.adl-menu` | 单个菜单容器 |
| `.adl-menu__trigger` | 菜单触发按钮 |
| `.adl-menu__dropdown` | 下拉菜单面板 |
| `.adl-menu__item` | 菜单项 |
| `.adl-menu__sep` | 分隔线 |

## 通用操作

### 打开菜单

```javascript
// 打开文件菜单
async function openMenu(menuId) {
  const trigger = await page.waitForSelector(`.adl-menu[data-menu-id="${menuId}"] .adl-menu__trigger`);
  await trigger.click();
  await page.waitForSelector(`.adl-menu[data-menu-id="${menuId}"] .adl-menu__dropdown`, { visible: true });
}

// 使用示例
await openMenu('file');  // 打开文件菜单
await openMenu('view');  // 打开视图菜单
await openMenu('help');  // 打开帮助菜单
```

### 关闭菜单

```javascript
// 点击菜单外部关闭
await page.click('.adl-titlebar__drag');

// 或按 Escape 键
await page.keyboard.press('Escape');

// 等待菜单关闭
await page.waitForSelector('.adl-menu__dropdown', { hidden: true });
```

### 点击菜单项

```javascript
// 通过菜单项文本点击
async function clickMenuItem(menuId, itemText) {
  // 先打开菜单
  await openMenu(menuId);
  
  // 查找并点击菜单项
  const dropdown = await page.waitForSelector(`.adl-menu[data-menu-id="${menuId}"] .adl-menu__dropdown`);
  const items = await dropdown.$$('.adl-menu__item');
  
  for (const item of items) {
    const text = await item.evaluate(el => el.textContent);
    if (text.includes(itemText)) {
      await item.click();
      return;
    }
  }
  throw new Error(`Menu item "${itemText}" not found`);
}

// 使用示例
await clickMenuItem('file', '新建工作空间');
```

## 菜单状态

### 菜单触发按钮状态

| 状态 | CSS 类名 | aria 属性 | 说明 |
|------|----------|-----------|------|
| 关闭 | - | `aria-expanded="false"` | 默认状态 |
| 打开 | `.is-open` | `aria-expanded="true"` | 下拉菜单可见 |

### 菜单项状态

| 状态 | CSS 类名/属性 | 说明 |
|------|---------------|------|
| 可用 | - | 默认状态 |
| 禁用 | `[disabled]` | 不可点击 |
| 分隔线 | `.adl-menu__sep` | 视觉分隔，不可交互 |

## 快捷键

| 快捷键 | 功能 | 菜单 |
|--------|------|------|
| `Ctrl+N` | 新建工作空间 | 文件 |
| `Ctrl+O` | 打开文件夹 | 文件 |
| `Ctrl+Shift+\`` | 新建终端 | 文件 |
| `Ctrl++` | 放大 | 视图 |
| `Ctrl+-` | 缩小 | 视图 |
| `Ctrl+0` | 重置缩放 | 视图 |
| `Ctrl+,` | 设置 | 视图 |
| `Ctrl+Shift+P` | 命令面板 | 帮助 |
| `Alt+F4` | 退出 | 文件 |

## 注意事项

1. **单菜单打开**：同一时间只能打开一个菜单，打开新菜单会自动关闭其他菜单
2. **自动关闭**：点击菜单项后菜单自动关闭
3. **外部点击关闭**：点击菜单外部区域会关闭菜单
4. **异步渲染**：下拉菜单在点击触发按钮后才渲染，需要等待出现
5. **快捷键冲突**：部分快捷键可能被其他组件拦截（如输入框聚焦时）
