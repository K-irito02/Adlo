# 帮助菜单

> 帮助菜单包含命令面板、快捷键和许可证相关操作。

## 菜单项列表

| 菜单项 | 快捷键 | 说明 |
|--------|--------|------|
| 命令面板 | `Ctrl+Shift+P` | 打开命令面板（当前为搜索文件） |
| 键盘快捷键 | `Ctrl+K Ctrl+S` | 查看键盘快捷键（未实现） |
| 查看许可证 | - | 查看应用许可证（未实现） |

## 定位选择器

| 优先级 | 类型 | 选择器 |
|--------|------|--------|
| 1 | aria-label | `.adl-menu[data-menu-id="help"] .adl-menu__trigger` |
| 2 | CSS | `.adl-menu[data-menu-id="help"]` |

## 操作详情

### 命令面板

| 属性 | 值 |
|------|-----|
| 菜单项选择器 | `.adl-menu__item` (包含 "命令面板" 文本) |
| 快捷键 | `Ctrl+Shift+P` |

#### 前置条件

- [x] 无特殊条件

#### 操作

```javascript
// 方式1：通过菜单
await page.click('.adl-menu[data-menu-id="help"] .adl-menu__trigger');
await page.waitForSelector('.adl-menu[data-menu-id="help"] .adl-menu__dropdown');
await page.click('.adl-menu__item:has-text("命令面板")');

// 方式2：通过快捷键
await page.keyboard.down('Control');
await page.keyboard.down('Shift');
await page.keyboard.press('P');
await page.keyboard.up('Shift');
await page.keyboard.up('Control');
```

#### 状态变化

- 右侧面板切换到文件工具
- 搜索输入框获得焦点

#### 预期结果

- 文件面板激活
- 搜索功能可用

#### 等待条件

```javascript
await page.waitForSelector('#files-panel.is-active');
```

#### 注意

- 当前命令面板功能为搜索文件的降级实现
- 完整命令面板功能计划在未来版本实现

---

### 键盘快捷键

| 属性 | 值 |
|------|-----|
| 菜单项选择器 | `.adl-menu__item` (包含 "键盘快捷键" 文本) |
| 快捷键 | `Ctrl+K Ctrl+S` |
| 状态 | **未实现** |

#### 操作

```javascript
await page.click('.adl-menu[data-menu-id="help"] .adl-menu__trigger');
await page.waitForSelector('.adl-menu[data-menu-id="help"] .adl-menu__dropdown');
await page.click('.adl-menu__item:has-text("键盘快捷键")');
```

#### 预期结果

- 当前无响应（功能未实现）

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

## 命令面板入口

除了通过帮助菜单访问，命令面板还可以通过以下方式触发：

### 标题栏搜索按钮

| 选择器 | 说明 |
|--------|------|
| `button[aria-label="命令面板"]` | 标题栏菜单区域右侧的搜索按钮 |
| `.adl-iconstrip__button` (包含搜索图标) | 搜索图标按钮 |

```javascript
// 点击标题栏搜索按钮
await page.click('.adl-titlebar__menus button[aria-label="命令面板"]');
```
