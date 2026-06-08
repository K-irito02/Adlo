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

> 多工作区文件树（MultiWorkspaceFileTree）
>
> 文件面板同时展示多个工作区的文件结构。每个工作区为一个独立可展开/折叠的条目，支持置顶排序、拖拽重排和隐藏操作。

### 定位选择器

| 优先级 | 类型 | 选择器 |
|--------|------|--------|
| 1 | CSS | `.adl-multitree` |
| 2 | CSS | `.adl-multitree-scroll` |
| 3 | CSS | `.adl-multitree-entry` |

### 工作区条目

| 选择器 | 说明 |
|--------|------|
| `.adl-multitree-entry` | 单个工作区条目 |
| `.adl-multitree-entry__header` | 条目头部（整体 hover/active 背景） |
| `.adl-multitree-entry__expand-btn` | 展开/折叠按钮（▶/▼） |
| `.adl-multitree-entry__name` | 工作区名称（截断显示） |
| `.adl-multitree-entry__actions` | 悬停时浮现的操作按钮组 |
| `.adl-multitree-entry__menu` | ⋮ 按钮弹出的菜单卡片 |
| `.adl-multitree-entry__tree` | 展开后的文件树容器 |
| `.adl-multitree-entry.is-current` | 当前活跃工作区 |
| `.adl-multitree-section-label` | "已置顶"/"未置顶"分组标签 |
| `.adl-multitree-scrollbar` | 自定义滚动条轨道 |
| `.adl-multitree-scrollbar__thumb` | 自定义滚动条滑块 |

### 操作

#### 展开工作区文件树（点击名称区域）

```javascript
// 点击名称区域切换展开/折叠
await page.locator('.adl-multitree-entry__namezone').first().click();
await page.waitForSelector('.adl-multitree-entry__tree .adl-filetree');
```

```javascript
// 也可点击左侧文件夹图标触发展开
await page.locator('.adl-multitree-entry__expand-btn').first().click();
await page.waitForSelector('.adl-multitree-entry__tree .adl-filetree');
```

#### 右键打开更多操作菜单

```javascript
// 右击名称区域弹出菜单
await page.locator('.adl-multitree-entry__namezone').first().click({ button: 'right' });
await page.waitForSelector('.adl-multitree-entry__menu');
```

#### 切换到工作区

```javascript
await page.locator('.adl-multitree-entry__name').filter({ hasText: 'notes' }).click();
```

#### 悬停显示操作按钮

```javascript
await page.locator('.adl-multitree-entry__namezone').first().hover();
await page.waitForSelector('.adl-multitree-entry__actions button', { state: 'visible' });
```

#### 打开更多操作菜单

```javascript
// 先悬停显示操作按钮
await page.locator('.adl-multitree-entry__namezone').first().hover();
// 点击 ⋮ 按钮
await page.locator('.adl-multitree-entry__actions button[aria-label="更多操作"]').click();
await page.waitForSelector('.adl-multitree-entry__menu');
```

#### 工具栏操作

| 按钮 | 位置 | aria-label | 说明 |
|------|------|------------|------|
| 展开/折叠全部 | Row 1 左 | 展开全部/折叠全部 | 批量展开/收起所有工作区 |
| 刷新全部 | Row 1 右 | 刷新全部 | 刷新所有已展开工作区文件树 |
| 文件树 | Row 2 左 | 文件树 | 切换到文件树视图 |
| 文档大纲 | Row 2 左 | 文档大纲 | 切换到文档大纲视图 |
| 新建文件 | Row 2 右 | 新建文件 | 创建新文件 |
| 新建文件夹 | Row 2 右 | 新建文件夹 | 创建新文件夹 |

```javascript
await page.click('button[aria-label="展开全部"]');
await page.click('button[aria-label="刷新全部"]');
await page.click('button[aria-label="新建文件"]');
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

## 右键菜单

> 文件树节点支持右键弹出上下文菜单，提供文件操作功能。

### 定位选择器

| 选择器 | 说明 |
|--------|------|
| `.adl-sidebar-menu` | 右键菜单容器 |
| `.adl-sidebar-menu__item` | 菜单项按钮 |
| `.adl-sidebar-menu__item.is-danger` | 危险操作（如删除） |
| `.adl-sidebar-menu__sep` | 菜单分隔线 |
| `.adl-tree-node.is-context-menu-target` | 当前右键选中的树节点（悬停高亮） |
| `.adl-confirm-overlay` | 删除确认对话框遮罩 |
| `.adl-confirm-dialog` | 删除确认对话框 |
| `.adl-prompt-modal` | 重命名弹窗遮罩（`RenameDialog` 组件） |
| `.adl-prompt-modal__panel` | 重命名弹窗面板 |
| `.adl-prompt-modal__input` | 重命名输入框 |
| `.adl-prompt-modal__header-close` | 重命名弹窗 ✕ 关闭按钮 |

### 菜单项

| 菜单项 | 说明 |
|--------|------|
| 打开方式 | 在编辑器中打开该文件 |
| 在文件管理器中显示 | 在系统文件管理器（资源管理器/Finder）中定位并选中文件 |
| 复制完整路径 | 复制文件在工作区的绝对路径到系统剪贴板 |
| 复制相对路径 | 复制文件相对于工作区根目录的路径 |
| 剪切 | 标记文件待剪切（存入剪贴板切片） |
| 复制 | 标记文件待复制（存入剪贴板切片） |
| 粘贴 | 粘贴已剪切/复制的文件到目标目录（自动处理同名冲突 `-copyN`） |
| 重命名 | 弹出 RenameDialog 弹窗（`.adl-prompt-modal`），Enter 确认 / Escape 取消 |
| 删除 | 弹出确认对话框，确认后移至系统回收站 |

### 操作

#### 右键打开菜单

```javascript
await page.locator('.adl-filetree__label').filter({ hasText: 'target-file.ts' }).click({ button: 'right' });
await page.waitForSelector('.adl-sidebar-menu');
```

#### 执行删除

```javascript
await page.locator('.adl-filetree__label').filter({ hasText: 'target-file.ts' }).click({ button: 'right' });
await page.waitForSelector('.adl-sidebar-menu');
await page.locator('.adl-sidebar-menu__item.is-danger').click();
await page.waitForSelector('.adl-confirm-dialog');
await page.locator('.adl-btn--danger').click();
```

#### 执行重命名

```javascript
await page.locator('.adl-filetree__label').filter({ hasText: 'old-name.ts' }).click({ button: 'right' });
await page.waitForSelector('.adl-sidebar-menu');
// 点击重命名项（不含 is-danger 的最后一个分组项）
await page.locator('.adl-sidebar-menu__item').filter({ hasText: '重命名' }).click();
await page.waitForSelector('.adl-prompt-modal');
// 清空并输入新名称（输入框已自动聚焦并全选）
await page.fill('.adl-prompt-modal__input', 'new-name.ts');
// 点击确认按钮或按 Enter
await page.click('.adl-btn--primary.adl-btn--square');
// 或: await page.press('.adl-prompt-modal__input', 'Enter');
```

### 切换连续性约定

1. 点击文件树节点后，文件树 active 态应立即切换；命中缓存时目标内容应直接显示。
2. 未命中缓存时，旧文件内容应保持可见直到新文件读取完成，不允许先清空编辑器或预览区。
3. 预览 / 编辑模式切换不得出现“加载预览”或其它显式加载文案。
4. 文件工具切走再切回时，应恢复上次的导航模式和预览/编辑模式，而不是回退到默认态。

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
| ✅ 开启 | 显示 | 显示（auto-hide：打开文件时显示1秒后自动隐藏，鼠标进入行号区重新显示） | 正常宽度 |
| ❌ 关闭 | 隐藏 | 隐藏 | 完全消失，正文左移 |

> 取消行号时，整个 gutter 区域（行号数字 + 折叠/展开图标）全部消失，正文内容向左移动占满空间。
>
> 折叠图标默认隐藏，仅在以下情况显示：打开文件时短暂显示1秒、鼠标悬停在行号区、鼠标悬停在单个图标上。

### 国际化支持

> CodeMirror 编辑器内置 phrase 国际化机制，Diff 视图中的折叠区块控件文案随应用语言切换自动变化。`locale` prop 通过 `appInfo.config.language` 传入 CodeEditor / DiffViewer。

### Minimap / 滑动条菜单

> 代码文件编辑态、文本编辑态、Markdown 编辑态以及相关 Diff 视图，右侧都使用同一套产品自绘滚动壳。右键点击右侧滚动区域，可打开 minimap / 普通滑动条菜单。

| 菜单项 | 作用 |
|--------|------|
| `滑动条: Minimap` | 切换到缩略图模式，显示结构化内容缩略、Diff 标记与可拖拽定位滑块 |
| `滑动条: 普通` | 切换到应用内普通轨道模式，隐藏缩略图，仅保留现代化窄轨道和比例滑块 |
| `渲染字符` | 仅在 `Minimap` 模式出现；控制缩略图是否尽量绘制字符纹理 |
| `缩放` | 仅在 `Minimap` 模式出现；控制缩略图行高密度，并联动固定滑块尺寸 |
| `宽度` | 仅在 `Minimap` 模式出现；控制缩略图列宽 |
| `滑块样式: 轻 / 标准` | 调整滑块视觉存在感 |
| `设置: 全局 / 独立` | 控制当前设置是影响所有编辑器，还是仅影响当前文件/视图作用域 |

> 菜单在点击某个选项后会保持展开，并立即刷新选中状态；仅在点击外部区域或重新打开别处菜单时关闭。
>
> `Minimap` 模式下，滑块始终以固定尺寸显示，并与正文真实可见区域共用同一套内容轨道坐标。只有当缩略内容自然高度超过右侧外框高度时，内部缩略内容才会自动进入长轨道模式；中短文件保持自然缩放显示，不会被强制拉伸填满整个外框。
>
> `普通` 模式下，滚动条始终使用独立的比例滑块几何，不读取 minimap 的缩放、宽度、长轨道或固定滑块逻辑。

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
| 文件树 | 文件树 | 树形图标按钮，切换到文件树视图 |
| 大纲 | 文档大纲 | 列表图标按钮，切换到文档大纲视图 |
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

## 文档大纲

> 文档目录导航功能

### 定位选择器

| 优先级 | 类型 | 选择器 |
|--------|------|--------|
| 1 | aria-label | `button[aria-label="文档大纲"]` |
| 2 | CSS | `.adl-outline-tree-shell` |
| 3 | CSS | `.adl-outline-tree` |

### 大纲项与滚动壳

| 选择器 | 说明 |
|--------|------|
| `.adl-outline-tree__item` | 单个大纲节点容器 |
| `.adl-outline-tree__row` | 大纲项整行点击/高亮区域 |
| `.adl-outline-tree__label` | 标题名称按钮 |
| `.adl-outline-tree__toggle` | 收起/展开按钮 |
| `.adl-outline-tree__meta` | hover 时显示的元信息 |
| `.adl-outline-tree__scrollbar` | 自定义滚动条轨道 |
| `.adl-outline-tree__scrollbar-thumb` | 自定义滚动条滑块 |

### 操作

#### 切换到大纲视图

```javascript
await page.click('button[aria-label="文档大纲"]');
await page.waitForSelector('.adl-outline-tree');
```

#### 点击大纲项跳转

```javascript
await page.locator('.adl-outline-tree__label').first().click();
```

#### 验证 hover 元信息

```javascript
const firstItem = page.locator('.adl-outline-tree__row').first();
await firstItem.hover();
await page.waitForSelector('.adl-outline-tree__meta', { state: 'visible' });
```

### 行为约定

1. Markdown 与代码文件共用同一套树形大纲组件，支持多行标题、层级展开/收起和选中态高亮。
2. 大纲滚动区与文件树共用同一套自绘滚动壳，滑块在 hover / active 时会放大。
3. 点击 Markdown 大纲项时，预览模式优先滚动到正文标题；编辑模式跳编辑器行号。

---

## 相关元素

| 元素 | 选择器 | 说明 |
|------|--------|------|
| 文件面板 | `#files-panel` | 文件面板容器 |
| 文件树 | `.adl-filetree` | 文件树 |
| 滚动条 | `.adl-filetree-scrollbar` | 自定义滚动条 |
| 大纲树 | `.adl-outline-tree` | 文档大纲树 |
| 大纲滚动条 | `.adl-outline-tree__scrollbar` | 文档大纲自定义滚动条 |
| 编辑器 | `div[data-testid="editor-shell"] .cm-editor` | CodeMirror 编辑器 |
| 预览区 | `.adl-tool-editor__surface--preview` | Markdown / 只读预览 |
