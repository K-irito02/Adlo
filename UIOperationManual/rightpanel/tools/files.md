# 文件工具面板

> 文件浏览器、编辑器和预览面板。

## 容器选择器

| 选择器 | 说明 |
|--------|------|
| `#files-panel` | 文件面板容器 |
| `.adl-tool-panel--files` | 文件工具面板根节点 |
| `.adl-tool-surface--files` | 文件面板主布局容器 |

---

## 文件树

> 工作区文件树

### 定位选择器

| 优先级 | 类型 | 选择器 |
|--------|------|--------|
| 1 | CSS | `.adl-filetree-shell` |
| 2 | CSS | `.adl-filetree-scroll` |
| 3 | CSS | `.adl-filetree` |

### 文件项

| 选择器 | 说明 |
|--------|------|
| `.adl-filetree__item` | 文件/文件夹项容器 |
| `.adl-filetree__node` | 可点击的文件/文件夹按钮 |
| `.adl-filetree__node.is-active` | 当前选中项 |
| `.adl-filetree__node--directory` | 文件夹按钮 |
| `.adl-filetree__children` | 子目录列表 |
| `.adl-filetree-scrollbar` | 自定义滚动条 |
| `.adl-tool-navigator__resize-handle` | 右边框拖拽手柄 |

### 操作

#### 展开文件夹

```javascript
await page.locator('.adl-filetree__node').filter({ hasText: 'notes' }).click();
await page.waitForSelector('.adl-filetree__children');
```

#### 打开文件

```javascript
await page.locator('.adl-filetree__node').filter({ hasText: '.md' }).click();
await page.waitForSelector('div[data-testid="editor-shell"] .cm-editor');
```

---

## 搜索

> 文件搜索功能

### 定位选择器

| 优先级 | 类型 | 选择器 |
|--------|------|--------|
| 1 | aria-label | `input[aria-label="检索文件"]` |
| 2 | CSS | `.adl-search-panel input` |

### 操作

```javascript
await page.fill('input[aria-label="检索文件"]', 'test');
await page.click('button[aria-label="搜索"]');
```

---

## 编辑器与预览

> CodeMirror 编辑器与 Markdown 预览

### 定位选择器

| 优先级 | 类型 | 选择器 |
|--------|------|--------|
| 1 | CSS | `div[data-testid="editor-shell"]` |
| 2 | CSS | `div[data-testid="editor-shell"] .cm-editor` |
| 3 | CSS | `.adl-tool-editor__surface--preview` |

### 操作

#### 获取当前编辑器可见内容

```javascript
const content = await page.locator('div[data-testid="editor-shell"] .cm-content').textContent();
```

#### 编辑文件

```javascript
await page.locator('div[data-testid="editor-shell"] .cm-content').click();
await page.keyboard.type('new content');
```

#### 切换预览/编辑

```javascript
await page.locator('.adl-tool-context__group--files-actions .adl-tool-context__iconbtn').first().click();
```

---

## 工具栏

> 文件面板工具栏

### 按钮列表

| 按钮 | aria-label | 说明 |
|------|------------|------|
| 收起导航栏 | 面板切换 | 折叠/展开左侧文件导航 |
| 搜索 | 搜索/返回 | 切换文件树与搜索视图 |
| 后退 / 前进 | 返回历史 / 前进历史 | 导航历史 |
| 预览 / 编辑 | 文件预览 / 文件编辑 | 眼睛图标按钮，切换预览模式 |
| 更多操作 | 更多操作 | 打开文件菜单 |
| 新建文件 | 新建文件 | 创建新文件 |
| 新建文件夹 | 新建文件夹 | 创建新文件夹 |
| 刷新 | 刷新 | 刷新文件树 |
| 折叠全部 | 折叠全部 | 折叠所有文件夹 |
| 展开全部 | 展开全部 | 展开所有文件夹 |

### 操作

```javascript
await page.click('button[aria-label="新建文件"]');
await page.click('button[aria-label="刷新"]');
```

---

## 相关元素

| 元素 | 选择器 | 说明 |
|------|--------|------|
| 文件面板 | `#files-panel` | 文件面板容器 |
| 文件树 | `.adl-filetree` | 文件树 |
| 滚动条 | `.adl-filetree-scrollbar` | 自定义滚动条 |
| 编辑器 | `div[data-testid="editor-shell"] .cm-editor` | CodeMirror 编辑器 |
| 预览区 | `.adl-tool-editor__surface--preview` | Markdown / 只读预览 |
