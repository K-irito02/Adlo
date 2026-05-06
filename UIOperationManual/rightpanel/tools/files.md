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

### 显示语义与视觉约定

> 文件工具中的代码文件、普通文本、Markdown 编辑态与 Markdown 预览态，共用一套“安静专业”的预览语义。颜色由主题 token 驱动，不应在组件里写死。

| 视觉元素 | 真实来源 | 含义 | 作用 |
|----------|----------|------|------|
| 编辑器底色 | `--editor-bg` | 当前可编辑/可阅读表面 | 统一代码、文本、Diff 的基础阅读背景 |
| 行号文字 | `--editor-lineNumber` / `--editor-lineNumber-active` | 普通行 / 当前活跃行 | 提供定位，不承担强提示职责 |
| 选区浅蓝底 | `--editor-selection` / `--editor-selection-inactive` | 当前文本选择或弱选择态 | 给复制、改写和聚焦提供最低噪音反馈 |
| 当前行浅色底 | `--editor-lineHighlight` | 光标所在行 | 仅帮助横向追踪，不表示变更 |
| 折叠占位块 | `--editor-fold-placeholder` | 折叠后的代码/文本片段 | 维持阅读连续性 |
| Markdown 正文最大宽度 | 预览区布局约束 | 阅读态内容宽度控制 | 避免 `.md` 预览横向铺满后难以阅读 |
| Markdown 代码块底色 | 预览区代码块样式 + 语法高亮 token | 预览态中的代码片段 | 让 Markdown 预览与编辑态语义一致 |

### 行号切换行为

> 通过"更多操作"菜单中的"行号"选项可切换行号显示。

| 状态 | 行号数字 | 折叠图标 | gutter 区域 |
|------|----------|----------|-------------|
| ✅ 开启 | 显示 | 显示 | 正常宽度 |
| ❌ 关闭 | 隐藏 | 隐藏 | 完全消失，正文左移 |

> 取消行号时，整个 gutter 区域（行号数字 + 折叠/展开图标）全部消失，正文内容向左移动占满空间。

### 已移除的冗余提示

| 已移除元素 | 原因 |
|------------|------|
| 行号区域内的小圆点 / 独立 agent gutter | 会与正文变更提示重复，增加视觉噪音 |
| 行号区域与正文区域之间的额外分隔缝隙 | 会把阅读区切得过碎，破坏一体感 |
| 点击编辑器后四周出现的虚线焦点边框 | 对鼠标工作流没有实际价值，且破坏沉浸感 |

### 注意事项

1. 文件工具中的视觉强调，以“可读性优先”为准，不能把行号 gutter 设计成第二条状态栏。
2. Markdown 预览可以有标题、表格、引用块、代码块等层级样式，但不能引入营销化、装饰化的强背景或重阴影。
3. 任何新增视觉提示，都需要先判断是否会与变更工具中的 Diff 语义重复。

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
