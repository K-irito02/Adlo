# 帮助菜单

> 帮助菜单包含键盘快捷键与许可证操作（命令面板入口已删除）。

## 菜单项列表

| 菜单项 | 快捷键 | 说明 |
|--------|--------|------|
| 键盘快捷键 | 未分配（设置 → 快捷键可绑定 `settings.shortcuts`） | 打开设置并定位到快捷键组 |
| 查看许可证 | - | 查看应用许可证（未实现） |

## 定位选择器

| 优先级 | 类型 | 选择器 |
|--------|------|--------|
| 1 | aria-label | `.adl-menu[data-menu-id="help"] .adl-menu__trigger` |
| 2 | CSS | `.adl-menu[data-menu-id="help"]` |

## 操作详情

### 键盘快捷键

| 属性 | 值 |
|------|-----|
| 菜单项选择器 | `.adl-menu__item` (包含 "键盘快捷键" 文本) |
| 快捷键 | 未分配（`settings.shortcuts` 命令，可在设置 → 快捷键中绑定） |

#### 操作

```javascript
await page.click('.adl-menu[data-menu-id="help"] .adl-menu__trigger');
await page.waitForSelector('.adl-menu[data-menu-id="help"] .adl-menu__dropdown');
await page.click('.adl-menu__item:has-text("键盘快捷键")');
```

#### 预期结果

- 设置面板打开并定位到"快捷键"组

---

### 查看许可证

| 属性 | 值 |
|------|-----|
| 菜单项选择器 | `.adl-menu__item` (包含 "查看许可证" 文本) |
| 状态 | **未实现** |

#### 操作

```javascript
await page.click('.adl-menu[data-menu-id="help"] .adl-menu__trigger');
await page.waitForSelector('.adl-menu[data-menu-id="help"] .adl-menu__dropdown');
await page.click('.adl-menu__item:has-text("查看许可证")');
```

#### 预期结果

- 当前无响应（功能未实现）

## 命令面板入口（已删除）

> 命令面板入口（含汉堡一级菜单项与本帮助子菜单项）已随死功能清理删除；
> 以下为归档记录，自动化脚本不得再依赖这些选择器。

### 标题栏搜索按钮

| 选择器 | 说明 |
|--------|------|
| `button[aria-label="命令面板"]` | 标题栏菜单区域右侧的搜索按钮 |
| `.adl-iconstrip__button` (包含搜索图标) | 搜索图标按钮 |

```javascript
// 点击标题栏搜索按钮
await page.click('.adl-titlebar__menus button[aria-label="命令面板"]');
```
