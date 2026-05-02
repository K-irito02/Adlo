# 设置工具面板

> 应用设置面板。

## 容器选择器

| 选择器 | 说明 |
|--------|------|
| `#settings-panel` | 设置面板容器 |

---

## 设置列表

> 设置选项列表

### 定位选择器

| 优先级 | 类型 | 选择器 |
|--------|------|--------|
| 1 | CSS | `.adl-settings-list` |

### 设置项

| 选择器 | 说明 |
|--------|------|
| `.adl-settings-item` | 单个设置项 |
| `.adl-settings-item--select` | 下拉选择 |
| `.adl-settings-item--toggle` | 开关切换 |
| `.adl-settings-item--input` | 文本输入 |

---

## 设置类型

### 下拉选择

```javascript
// 点击下拉框
await page.click('.adl-settings-item--select select');

// 选择选项
await page.selectOption('.adl-settings-item--select select', 'dark');
```

### 开关切换

```javascript
// 点击开关
await page.click('.adl-settings-item--toggle input');
```

### 文本输入

```javascript
// 输入值
await page.fill('.adl-settings-item--input input', 'value');
```

---

## 相关元素

| 元素 | 选择器 | 说明 |
|------|--------|------|
| 设置面板 | `#settings-panel` | 设置面板容器 |
| 设置列表 | `.adl-settings-list` | 设置选项列表 |
| 设置项 | `.adl-settings-item` | 单个设置项 |
