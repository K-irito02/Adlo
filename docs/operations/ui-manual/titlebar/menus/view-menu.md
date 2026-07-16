# 视图菜单

> 视图菜单包含视图切换、缩放和设置相关操作。

## 菜单项列表

| 菜单项 | 快捷键 | 说明 |
|--------|--------|------|
| Diff 查看 | - | 切换到变更工具面板 |
| 浏览器查看 | - | 切换到浏览器工具面板 |
| 文件查看 | - | 切换到文件工具面板 |
| 终端查看 | - | 切换到终端工具面板 |
| ────────── | - | 分隔线 |
| 放大 | `Ctrl++` | 放大界面 |
| 缩小 | `Ctrl+-` | 缩小界面 |
| 重置缩放 | `Ctrl+0` | 重置到默认缩放 |
| ────────── | - | 分隔线 |
| 设置 | `Ctrl+,` | 打开设置面板 |

## 定位选择器

| 优先级 | 类型 | 选择器 |
|--------|------|--------|
| 1 | aria-label | `.adl-menu[data-menu-id="view"] .adl-menu__trigger` |
| 2 | CSS | `.adl-menu[data-menu-id="view"]` |

## 操作详情

### Diff 查看

| 属性 | 值 |
|------|-----|
| 菜单项选择器 | `.adl-menu__item` (包含 "Diff 查看" 文本) |

#### 操作

```javascript
await page.click('.adl-menu[data-menu-id="view"] .adl-menu__trigger');
await page.waitForSelector('.adl-menu[data-menu-id="view"] .adl-menu__dropdown');
await page.click('.adl-menu__item:has-text("Diff 查看")');
```

#### 状态变化

- 右侧面板切换到变更工具

#### 预期结果

- 变更面板激活
- 显示 Git 变更列表

#### 等待条件

```javascript
await page.waitForSelector('#changes-panel.is-active');
```

---

### 浏览器查看

| 属性 | 值 |
|------|-----|
| 菜单项选择器 | `.adl-menu__item` (包含 "浏览器查看" 文本) |

#### 操作

```javascript
await page.click('.adl-menu[data-menu-id="view"] .adl-menu__trigger');
await page.waitForSelector('.adl-menu[data-menu-id="view"] .adl-menu__dropdown');
await page.click('.adl-menu__item:has-text("浏览器查看")');
```

#### 状态变化

- 右侧面板切换到浏览器工具

#### 预期结果

- 浏览器面板激活

#### 等待条件

```javascript
await page.waitForSelector('#browser-panel.is-active');
```

---

### 文件查看

| 属性 | 值 |
|------|-----|
| 菜单项选择器 | `.adl-menu__item` (包含 "文件查看" 文本) |

#### 操作

```javascript
await page.click('.adl-menu[data-menu-id="view"] .adl-menu__trigger');
await page.waitForSelector('.adl-menu[data-menu-id="view"] .adl-menu__dropdown');
await page.click('.adl-menu__item:has-text("文件查看")');
```

#### 状态变化

- 右侧面板切换到文件工具

#### 预期结果

- 文件面板激活
- 显示文件树

#### 等待条件

```javascript
await page.waitForSelector('#files-panel.is-active');
```

---

### 终端查看

| 属性 | 值 |
|------|-----|
| 菜单项选择器 | `.adl-menu__item` (包含 "终端查看" 文本) |

#### 操作

```javascript
await page.click('.adl-menu[data-menu-id="view"] .adl-menu__trigger');
await page.waitForSelector('.adl-menu[data-menu-id="view"] .adl-menu__dropdown');
await page.click('.adl-menu__item:has-text("终端查看")');
```

#### 状态变化

- 右侧面板切换到终端工具

#### 预期结果

- 终端面板激活

#### 等待条件

```javascript
await page.waitForSelector('#terminal-panel.is-active');
```

---

### 放大

| 属性 | 值 |
|------|-----|
| 菜单项选择器 | `.adl-menu__item` (包含 "放大" 文本) |
| 快捷键 | `Ctrl++` |

#### 操作

```javascript
// 方式1：通过菜单
await page.click('.adl-menu[data-menu-id="view"] .adl-menu__trigger');
await page.waitForSelector('.adl-menu[data-menu-id="view"] .adl-menu__dropdown');
await page.click('.adl-menu__item:has-text("放大")');

// 方式2：通过快捷键
await page.keyboard.down('Control');
await page.keyboard.press('+');
await page.keyboard.up('Control');
```

#### 状态变化

- 界面放大 10%
- `document.documentElement.style.zoom` 值增加 0.1

#### 预期结果

- 界面元素变大

#### 验证

```javascript
const zoom = await page.evaluate(() => document.documentElement.style.zoom);
console.log('Current zoom:', zoom); // 如 "1.1"
```

---

### 缩小

| 属性 | 值 |
|------|-----|
| 菜单项选择器 | `.adl-menu__item` (包含 "缩小" 文本) |
| 快捷键 | `Ctrl+-` |

#### 操作

```javascript
// 方式1：通过菜单
await page.click('.adl-menu[data-menu-id="view"] .adl-menu__trigger');
await page.waitForSelector('.adl-menu[data-menu-id="view"] .adl-menu__dropdown');
await page.click('.adl-menu__item:has-text("缩小")');

// 方式2：通过快捷键
await page.keyboard.down('Control');
await page.keyboard.press('-');
await page.keyboard.up('Control');
```

#### 状态变化

- 界面缩小 10%
- `document.documentElement.style.zoom` 值减少 0.1

#### 预期结果

- 界面元素变小

---

### 重置缩放

| 属性 | 值 |
|------|-----|
| 菜单项选择器 | `.adl-menu__item` (包含 "重置缩放" 文本) |
| 快捷键 | `Ctrl+0` |

#### 操作

```javascript
// 方式1：通过菜单
await page.click('.adl-menu[data-menu-id="view"] .adl-menu__trigger');
await page.waitForSelector('.adl-menu[data-menu-id="view"] .adl-menu__dropdown');
await page.click('.adl-menu__item:has-text("重置缩放")');

// 方式2：通过快捷键
await page.keyboard.down('Control');
await page.keyboard.press('0');
await page.keyboard.up('Control');
```

#### 状态变化

- 缩放重置为 1（100%）

#### 预期结果

- 界面恢复默认大小

---

### 设置

| 属性 | 值 |
|------|-----|
| 菜单项选择器 | `.adl-menu__item` (包含 "设置" 文本) |
| 快捷键 | `Ctrl+,` |

#### 操作

```javascript
// 方式1：通过菜单
await page.click('.adl-menu[data-menu-id="view"] .adl-menu__trigger');
await page.waitForSelector('.adl-menu[data-menu-id="view"] .adl-menu__dropdown');
await page.click('.adl-menu__item:has-text("设置")');

// 方式2：通过快捷键
await page.keyboard.down('Control');
await page.keyboard.press(',');
await page.keyboard.up('Control');
```

#### 状态变化

- 右侧面板切换到设置工具

#### 预期结果

- 设置面板激活
- 显示设置选项列表

#### 等待条件

```javascript
await page.waitForSelector('#settings-panel.is-active');
```
