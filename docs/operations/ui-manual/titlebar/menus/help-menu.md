# 帮助菜单

> 帮助菜单包含键盘快捷键与许可证操作。

## 菜单项列表

| 菜单项 | 快捷键 | 说明 |
|--------|--------|------|
| 键盘快捷键 | 未分配（设置 → 快捷键可绑定 `settings.shortcuts`） | 打开设置并定位到快捷键组 |
| 查看许可证 | - | 查看应用许可证（未实现） |

## 定位选择器

| 优先级 | 类型 | 选择器 |
|--------|------|--------|
| 1 | aria-label | `.adl-hamburger__trigger` |
| 2 | CSS | `.adl-hamburger` |

## 操作详情

### 键盘快捷键

| 属性 | 值 |
|------|-----|
| 菜单项选择器 | `.adl-hamburger__item` (包含 "键盘快捷键" 文本) |
| 快捷键 | 未分配（`settings.shortcuts` 命令，可在设置 → 快捷键中绑定） |

#### 操作

```javascript
await page.click('.adl-hamburger__trigger');
await page.waitForSelector('.adl-hamburger__dropdown');
await page.click('.adl-hamburger__item:has-text("键盘快捷键")');
```

#### 预期结果

- 设置面板打开并定位到"快捷键"组

---

### 查看许可证

| 属性 | 值 |
|------|-----|
| 菜单项选择器 | `.adl-hamburger__item` (包含 "查看许可证" 文本) |
| 状态 | **未实现** |

#### 操作

```javascript
await page.click('.adl-hamburger__trigger');
await page.waitForSelector('.adl-hamburger__dropdown');
await page.click('.adl-hamburger__item:has-text("查看许可证")');
```

#### 预期结果

- 当前无响应（功能未实现）
