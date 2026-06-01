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

#### 新建标签页

```javascript
await page.click('button[aria-label="新建标签页"]');
```

#### 新建标签（导航器）

```javascript
// 在导航器上下文区域点击新建标签按钮
await page.click('button[aria-label="新建标签"]');
```

#### 新建目录（导航器）

```javascript
// 在导航器上下文区域点击新建目录按钮
await page.click('button[aria-label="新建目录"]');
```

---

## 搜索区域

### 定位选择器

| 优先级 | 类型 | 选择器 |
|--------|------|--------|
| 1 | CSS | `.adl-tool-navigator__context--search` |

### 搜索范围切换

搜索区域包含三个切换按钮，与变更面板样式一致：

| 按钮 | aria-label | 说明 |
|------|------------|------|
| 收藏 | `收藏` | 搜索收藏的标签 |
| 历史 | `历史` | 搜索历史记录 |
| 全部 | `全部` | 搜索所有内容 |

```javascript
// 切换到收藏搜索
await page.click('button[aria-label="收藏"]');

// 切换到历史搜索
await page.click('button[aria-label="历史"]');

// 切换到全部搜索
await page.click('button[aria-label="全部"]');
```

### 搜索输入框

```javascript
// 在搜索框中输入关键词
await page.fill('.adl-tool-search--navigator input', '关键词');
```

---

## 导航器

| 优先级 | 类型 | 选择器 |
|--------|------|--------|
| 1 | CSS | `.adl-tool-navigator` |

### 多工作区布局

浏览器面板采用多工作区布局，包含：
- **工作区目录**：显示各工作区的标签
- **自建目录**：用户自定义的标签文件夹
- **历史目录**：自动记录的访问历史（最多 100 条，去重）

### 标签页

| 选择器 | 说明 |
|--------|------|
| `.adl-tool-list__item` | 书签/历史/搜索结果条目 |
| `.adl-multitree-entry__header` | 工作区/文件夹头部行 |
| `.adl-multitree-entry__children` | 展开的子内容区域 |
| `.adl-history-children-scroll` | 历史记录滚动容器 |

### 历史记录

历史记录显示在"历史目录"下，支持：
- 自动记录访问过的网址
- 去重处理（最多 100 条）
- 按时间显示（刚刚、N分钟前、N小时前、N天前）
- 点击在新标签页打开
- 使用自定义滚动条，位于左侧（left: 6px），z-index: 3

### 收藏标签

```javascript
// 点击收藏标签按钮
await page.click('button[aria-label="收藏标签"]');

// 在对话框中选择工作区或创建新工作区
```

### 子目录管理

子目录（标签工作区）可在导航器中创建和管理：

```javascript
// 从工作区头部行更多操作菜单创建子目录
await page.click('[data-menu-btn-id]:first-child'); // 点击更多操作
await page.click('text=创建子目录');

// 展开工作区查看子目录
await page.click('.adl-multitree-entry__expand-btn:first-child');

// 子目录下的嵌套子目录
// 在已存在的子目录头部行上点击更多操作 → 创建子目录
```

**注意事项**：
- 创建子目录后需手动展开工作区才能看到
- 子目录的 `parentId` 通过 4 层回调链传递（WorkspaceBrowserEntry → MultiWorkspaceBrowser → BrowserPanel → browserSlice）
- 清除 localStorage 后会丢失所有子目录数据

### 目录选中与交互

#### 选中状态：
- 点击顶级目录或子目录时会显示灰色背景（`--surface-active`）
- 只有最后被点击的项会显示选中状态
- 点击页面其他区域会取消选中状态

#### 目录展开/折叠：
- 点击顶级目录的任何位置都会触发展开/折叠（不仅仅是箭头按钮）
- 点击子目录的箭头按钮或名称区域会触发展开/折叠

#### 新建子目录功能：
1. 首先点击选中一个目录（顶级目录或子目录）
2. 点击导航器工具栏的"新建子目录"按钮
3. 子目录会创建在当前选中的目录下

#### 相关选择器：

| 选择器 | 说明 |
|--------|------|
| `.adl-browser-entry__header` | 顶级目录头部行 |
| `.adl-browser-entry__header.is-selected` | 选中的顶级目录 |
| `.adl-filetree__item` | 子目录/文件项 |
| `.adl-filetree__item.is-selected` | 选中的子目录/文件 |
| `.adl-browser-entry__expand-btn` | 展开/折叠按钮 |

#### 自动化示例：

```javascript
// 点击顶级目录选中并展开
await page.click('.adl-browser-entry__header');

// 点击子目录选中并展开
await page.click('.adl-filetree__item');

// 点击"新建子目录"按钮
await page.click('button[aria-label="新建子目录"]');
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
| 历史记录滚动条 | `.adl-history-children-scrollbar` | 自定义滚动条，位于左侧 |
| 滚动条滑块 | `.adl-history-children-scrollbar__thumb` | 滚动条滑块元素 |
