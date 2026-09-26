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
| `dsh` | DSH | DSH下载源和代理设置 |

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

> DeepSeek Harness下载源和代理设置。三块结构（下载源 / 代理设置 / 测试连接）：
> 块头在卡外（恢复默认图标 + 主标题），卡内副标题行左说明、右控件；变更即自动保存。

### 定位选择器

| 优先级 | 类型 | 选择器 |
|--------|------|--------|
| 1 | CSS | `.adl-dsh-settings` |

### 设置项

| 选择器 | 说明 |
|--------|------|
| `.adl-dsh-settings__header` | 块头（下载源/代理设置带恢复按钮，测试连接块为装饰图标） |
| `[data-testid="dsh-source-reset"]` | 下载源块恢复默认按钮 |
| `[data-testid="dsh-proxy-reset"]` | 代理设置块恢复默认按钮 |
| `.adl-settings-row__control .adl-settings-dropdown__trigger` | 下载源/代理模式下拉框（自动检测/npmjs/npmmirror/自定义；自动检测/自定义/无） |
| `.adl-settings-input` | 自定义地址与代理配置字段（HTTP/HTTPS/直连名单） |
| `[data-testid="dsh-test-button"]` | 测试连接按钮（结果显示在按钮内，2 秒后恢复） |

### 操作流程

```javascript
// 选择下载源（自定义下拉：点触发器展开，再点选项；不再是 radio 卡片）
// 选项：自动检测 / npmjs（官方） / npmmirror（中国） / 自定义
await page.click('[aria-label="下载源"]');
await page.click('.adl-settings-dropdown__item:has-text("自定义")');

// 输入自定义地址（选中自定义后出现，变更即自动保存，无保存按钮）
await page.fill('[aria-label="自定义地址"]', 'https://custom-registry.example');

// 选择代理模式（选项：自动检测/自定义/无）
await page.click('[aria-label="代理模式"]');
await page.click('.adl-settings-dropdown__item:has-text("自定义")');

// 输入代理配置
await page.fill('[aria-label="HTTP 代理"]', 'http://proxy:8080');
await page.fill('[aria-label="HTTPS 代理"]', 'http://proxy:8080');
await page.fill('[aria-label="直连名单"]', 'localhost,127.0.0.1');

// 测试连接（结果显示在按钮内）
await page.click('[data-testid="dsh-test-button"]');

// 块级恢复默认（经确认对话框，乐观执行）
await page.click('[data-testid="dsh-source-reset"]');
await page.click('button:has-text("确认")');
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