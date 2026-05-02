# 操作按钮组

> 标题栏右侧的操作按钮组，包含主题切换、语言切换和设置按钮。

## 按钮列表

| 按钮 | 说明 | 文档 |
|------|------|------|
| 主题切换 | 循环切换主题（system/light/dark） | [主题切换](#主题切换) |
| 语言切换 | 切换语言（中文/英文） | [语言切换](#语言切换) |
| 设置 | 打开设置面板 | [设置按钮](#设置按钮) |

## 容器选择器

| 选择器 | 说明 |
|--------|------|
| `.adl-titlebar__action-group` | 操作按钮组容器 |
| `.adl-iconstrip` | 按钮条容器 |

---

## 主题切换

> 循环切换应用主题：system → light → dark → system

### 定位选择器

| 优先级 | 类型 | 选择器 |
|--------|------|--------|
| 1 | aria-label | `button[aria-label="主题"]` |
| 2 | CSS | `.adl-titlebar__action-group button` (包含主题图标) |

### 前置条件

- [x] 无特殊条件

### 操作

```javascript
// 点击主题按钮
await page.click('button[aria-label="主题"]');
```

### 状态变化

主题按以下顺序循环切换：

| 当前主题 | 切换后主题 |
|----------|------------|
| system | light |
| light | dark |
| dark | system |

### 预期结果

- 主题立即切换
- `:root` 元素的 `data-theme` 属性更新
- 所有 UI 元素颜色更新

### 等待条件

```javascript
// 等待主题属性变化
await page.waitForFunction(() => {
  const theme = document.documentElement.getAttribute('data-theme');
  return theme !== null;
});
```

### 验证当前主题

```javascript
// 获取当前主题
const theme = await page.evaluate(() => {
  return document.documentElement.getAttribute('data-theme');
});
// 返回: 'light' | 'dark' | null (system)
```

### 主题图标

| 主题 | 图标 |
|------|------|
| system | 显示器图标 (`IconMonitor`) |
| light | 太阳图标 (`IconSun`) |
| dark | 月亮图标 (`IconMoon`) |

---

## 语言切换

> 切换应用语言：中文 ↔ 英文

### 定位选择器

| 优先级 | 类型 | 选择器 |
|--------|------|--------|
| 1 | aria-label | `button[aria-label*="语言"]` |
| 2 | CSS | `.adl-titlebar__action-group button` (包含语言图标) |

### 前置条件

- [x] 无特殊条件

### 操作

```javascript
// 点击语言按钮
await page.click('button[aria-label*="语言"]');
```

### 状态变化

语言按以下顺序切换：

| 当前语言 | 切换后语言 |
|----------|------------|
| zh-CN | en-US |
| en-US | zh-CN |

### 预期结果

- 所有 UI 文本立即更新为新语言
- aria-label 属性值更新

### 等待条件

```javascript
// 等待语言切换（检查某个文本变化）
await page.waitForFunction(() => {
  const menuText = document.querySelector('.adl-menu__trigger')?.textContent;
  return menuText === 'File' || menuText === '文件';
});
```

### 验证当前语言

```javascript
// 获取当前语言
const lang = await page.evaluate(() => {
  const btn = document.querySelector('button[aria-label*="语言"]');
  return btn.getAttribute('aria-label').includes('EN') ? 'en-US' : 'zh-CN';
});
```

### 语言图标

| 语言 | 图标 |
|------|------|
| zh-CN | 中文图标 (`IconLangZh`) |
| en-US | 英文图标 (`IconLangEn`) |

---

## 设置按钮

> 打开设置面板

### 定位选择器

| 优先级 | 类型 | 选择器 |
|--------|------|--------|
| 1 | aria-label | `button[aria-label="设置"]` |
| 2 | CSS | `.adl-titlebar__action-group button` (包含设置图标) |

### 前置条件

- [x] 无特殊条件

### 操作

```javascript
// 点击设置按钮
await page.click('button[aria-label="设置"]');
```

### 状态变化

- 右侧面板切换到设置工具

### 预期结果

- 设置面板激活
- 显示设置选项列表

### 等待条件

```javascript
await page.waitForSelector('#settings-panel.is-active');
```

### 快捷键

| 快捷键 | 功能 |
|--------|------|
| `Ctrl+,` | 打开设置 |

```javascript
await page.keyboard.down('Control');
await page.keyboard.press(',');
await page.keyboard.up('Control');
```

## 相关元素

| 元素 | 选择器 | 说明 |
|------|--------|------|
| 操作按钮组 | `.adl-titlebar__action-group` | 包含主题、语言、设置按钮 |
| Tooltip | `.adl-tooltip` | 悬停按钮时显示的提示 |
