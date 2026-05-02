# 浏览器工具面板

> 内嵌浏览器面板。

## 容器选择器

| 选择器 | 说明 |
|--------|------|
| `#browser-panel` | 浏览器面板容器 |

---

## 标签栏

> 浏览器标签栏

### 定位选择器

| 优先级 | 类型 | 选择器 |
|--------|------|--------|
| 1 | CSS | `.adl-browser-tabs` |

### 标签项

| 选择器 | 说明 |
|--------|------|
| `.adl-browser-tab` | 单个标签 |
| `.adl-browser-tab.is-active` | 激活标签 |

### 操作

#### 切换标签

```javascript
await page.click('.adl-browser-tab:not(.is-active)');
```

#### 关闭标签

```javascript
await page.click('.adl-browser-tab__close');
```

#### 新建标签

```javascript
await page.click('button[aria-label="新建标签"]');
```

---

## 地址栏

> 浏览器地址栏

### 定位选择器

| 优先级 | 类型 | 选择器 |
|--------|------|--------|
| 1 | CSS | `.adl-browser-addressbar input` |

### 操作

```javascript
// 输入 URL
await page.fill('.adl-browser-addressbar input', 'https://example.com');

// 按 Enter 导航
await page.keyboard.press('Enter');
```

---

## 浏览器内容

> 内嵌浏览器内容区域

### 定位选择器

| 优先级 | 类型 | 选择器 |
|--------|------|--------|
| 1 | CSS | `.adl-browser-content` |
| 2 | CSS | `webview` | WebView 元素 |

---

## 相关元素

| 元素 | 选择器 | 说明 |
|------|--------|------|
| 浏览器面板 | `#browser-panel` | 浏览器面板容器 |
| 标签栏 | `.adl-browser-tabs` | 标签栏 |
| 地址栏 | `.adl-browser-addressbar` | 地址栏 |
| 内容区 | `.adl-browser-content` | 浏览器内容 |
