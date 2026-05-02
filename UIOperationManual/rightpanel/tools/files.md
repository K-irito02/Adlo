# 文件工具面板

> 文件浏览器和编辑器面板。

## 容器选择器

| 选择器 | 说明 |
|--------|------|
| `#files-panel` | 文件面板容器 |
| `.adl-rightpanel__tool.is-active` | 激活的面板 |

---

## 文件树

> 工作区文件树

### 定位选择器

| 优先级 | 类型 | 选择器 |
|--------|------|--------|
| 1 | CSS | `.adl-file-tree` |
| 2 | CSS | `.adl-files-panel__tree` |

### 文件项

| 选择器 | 说明 |
|--------|------|
| `.adl-file-tree__item` | 文件/文件夹项 |
| `.adl-file-tree__item--folder` | 文件夹项 |
| `.adl-file-tree__item--file` | 文件项 |
| `.adl-file-tree__item--dirty` | 有未保存更改 |

### 操作

#### 展开文件夹

```javascript
// 点击文件夹展开
await page.click('.adl-file-tree__item--folder');

// 等待子项出现
await page.waitForSelector('.adl-file-tree__item--folder.is-expanded + .adl-file-tree__children');
```

#### 打开文件

```javascript
// 点击文件项
await page.click('.adl-file-tree__item--file');

// 等待编辑器加载
await page.waitForSelector('.monaco-editor');
```

---

## 搜索

> 文件搜索功能

### 定位选择器

| 优先级 | 类型 | 选择器 |
|--------|------|--------|
| 1 | aria-label | `input[aria-label="检索文件"]` |
| 2 | CSS | `.adl-files-panel__search input` |

### 操作

```javascript
// 输入搜索关键词
await page.fill('input[aria-label="检索文件"]', 'test');

// 点击搜索按钮
await page.click('button[aria-label="搜索"]');

// 等待搜索结果
await page.waitForSelector('.adl-search-results');
```

---

## 编辑器

> Monaco 编辑器

### 定位选择器

| 优先级 | 类型 | 选择器 |
|--------|------|--------|
| 1 | CSS | `.monaco-editor` |

### 操作

#### 获取编辑器内容

```javascript
const content = await page.evaluate(() => {
  const editor = document.querySelector('.monaco-editor');
  const model = editor?.getModel?.();
  return model?.getValue?.() || '';
});
```

#### 编辑文件

```javascript
// 点击编辑器获取焦点
await page.click('.monaco-editor .view-lines');

// 输入内容
await page.keyboard.type('new content');
```

#### 保存文件

```javascript
await page.keyboard.down('Control');
await page.keyboard.press('s');
await page.keyboard.up('Control');
```

---

## 工具栏

> 文件面板工具栏

### 按钮列表

| 按钮 | aria-label | 说明 |
|------|------------|------|
| 新建文件 | "新建文件" | 创建新文件 |
| 新建文件夹 | "新建文件夹" | 创建新文件夹 |
| 刷新 | "刷新" | 刷新文件树 |
| 折叠全部 | "折叠全部" | 折叠所有文件夹 |
| 展开全部 | "展开全部" | 展开所有文件夹 |

### 操作

```javascript
// 新建文件
await page.click('button[aria-label="新建文件"]');

// 刷新文件树
await page.click('button[aria-label="刷新"]');
```

---

## 相关元素

| 元素 | 选择器 | 说明 |
|------|--------|------|
| 文件面板 | `#files-panel` | 文件面板容器 |
| 文件树 | `.adl-file-tree` | 文件树 |
| 搜索输入 | `input[aria-label="检索文件"]` | 搜索框 |
| 编辑器 | `.monaco-editor` | Monaco 编辑器 |
