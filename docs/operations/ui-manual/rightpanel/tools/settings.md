# 设置工具面板

> 应用设置面板。

## 容器选择器

| 选择器 | 说明 |
|--------|------|
| `#settings-panel` | 设置面板容器 |

---

## 设置导航

> 左侧导航栏，用于切换设置组。

### 定位选择器

| 优先级 | 类型 | 选择器 |
|--------|------|--------|
| 1 | CSS | `.adl-settings-nav` |

### 设置组

| 组ID | 名称 | 说明 |
|------|------|------|
| `general` | 通用 | 语言、主题、日志级别等通用设置 |
| `workspace` | 工作区 | 工作区相关设置 |
| `shortcuts` | 快捷键 | 键盘快捷键配置 |
| `browser` | 浏览器 | 浏览器性能和下载设置 |
| `dsh` | DeepSeek Harness | DSH下载源和代理设置 |

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

## DSH 设置

> DeepSeek Harness下载源和代理设置。

### 定位选择器

| 优先级 | 类型 | 选择器 |
|--------|------|--------|
| 1 | CSS | `.adl-dsh-settings` |

### 设置项

| 选择器 | 说明 |
|--------|------|
| `.adl-dsh-settings__source` | 下载源选择（npmjs/npmmirror/自定义） |
| `.adl-dsh-settings__proxy-mode` | 代理模式选择（自动检测/手动/无） |
| `.adl-dsh-settings__proxy-fields` | 代理配置字段（HTTP/HTTPS/不代理） |
| `.adl-dsh-settings__test` | 测试连接按钮和结果 |
| `.adl-dsh-settings__actions` | 保存按钮 |

### 操作流程

```javascript
// 选择下载源
await page.click('.adl-dsh-settings__source:nth-child(1)'); // npmjs
await page.click('.adl-dsh-settings__source:nth-child(2)'); // npmmirror
await page.click('.adl-dsh-settings__source:nth-child(3)'); // 自定义

// 输入自定义URL
await page.fill('.adl-dsh-settings__source input[type="text"]', 'https://custom-registry.example');

// 选择代理模式
await page.selectOption('.adl-dsh-settings__proxy-mode select', 'manual');

// 输入代理配置
await page.fill('.adl-dsh-settings__proxy-field:nth-child(1) input', 'http://proxy:8080');
await page.fill('.adl-dsh-settings__proxy-field:nth-child(2) input', 'http://proxy:8080');
await page.fill('.adl-dsh-settings__proxy-field:nth-child(3) input', 'localhost,127.0.0.1');

// 测试连接
await page.click('.adl-dsh-settings__test button');

// 保存设置
await page.click('.adl-dsh-settings__actions button');
```

---

## 相关元素

| 元素 | 选择器 | 说明 |
|------|--------|------|
| 设置面板 | `#settings-panel` | 设置面板容器 |
| 设置导航 | `.adl-settings-nav` | 设置组导航 |
| 设置列表 | `.adl-settings-list` | 设置选项列表 |
| 设置项 | `.adl-settings-item` | 设置项容器 |
| DSH设置 | `.adl-dsh-settings` | DSH设置容器 |