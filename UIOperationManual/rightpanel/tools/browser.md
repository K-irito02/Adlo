# 浏览器工具面板

> 内置浏览器面板，支持双模式：Tauri 桌面模式使用系统 WebView，浏览器预览模式使用 `<iframe>` + 外部浏览器降级按钮。

## 容器选择器

| 选择器 | 说明 |
|--------|------|
| `.adl-tool-panel--browser` | 浏览器面板容器 |

---

## 工具栏

### 定位选择器

| 优先级 | 类型 | 选择器 |
|--------|------|--------|
| 1 | CSS | `.adl-tool-context--files` |

### 操作

#### 后退

```javascript
await page.click('button[aria-label="后退"]');
```

#### 前进

```javascript
await page.click('button[aria-label="前进"]');
```

#### 刷新

```javascript
await page.click('button[aria-label="刷新"]');
```

#### 地址栏

```javascript
// 展开地址栏（需要先展开才能输入）
await page.click('.adl-tool-search--address');

// 输入 URL
await page.fill('.adl-tool-search--address input', 'https://example.com');

// 按 Enter 导航
await page.keyboard.press('Enter');
```

---

## 导航器

### 定位选择器

| 优先级 | 类型 | 选择器 |
|--------|------|--------|
| 1 | CSS | `.adl-tool-navigator` |

### 标签页

| 选择器 | 说明 |
|--------|------|
| `.adl-tool-list__item` | 书签/历史/搜索结果条目 |

### 模式切换

```javascript
// 书签模式
await page.click('button[aria-label="收藏标签"]');

// 历史模式
await page.click('button[aria-label="历史标签"]');

// 搜索模式
await page.click('button[aria-label="搜索标签"]');
```

---

## 浏览器内容

### 定位选择器

| 模式 | 选择器 | 说明 |
|------|--------|------|
| Tauri 桌面 | `webview[label="adl-browser-view"]` | 系统 WebView 元素 |
| 浏览器预览 | `.adl-browser-iframe` | iframe 元素 |

### 外部浏览器打开按钮

| 选择器 | 说明 |
|--------|------|
| `.adl-browser-external-btn` | 浏览器预览模式下使用，在新标签页打开当前 URL |

---

## 相关元素

| 元素 | 选择器 | 说明 |
|------|--------|------|
| 浏览器面板 | `.adl-tool-panel--browser` | 浏览器面板容器 |
| 地址栏 | `.adl-tool-search--address` | 可折叠展开的地址搜索栏 |
| 内容区 | `.adl-tool-primary--browser` | 浏览器内容容器 |
| 外部浏览器按钮 | `.adl-browser-external-btn` | 浏览器模式浮动降级按钮 |
