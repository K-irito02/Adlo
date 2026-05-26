# 变更工具面板

> Git 变更和补丁预览面板。

## 容器选择器

| 选择器 | 说明 |
|--------|------|
| `#changes-panel` | 变更面板容器 |
| `.adl-tool-panel--changes` | 变更工具面板根节点 |
| `.adl-tool-surface--files` | 变更面板的双栏布局容器 |

---

## 变更列表

> Git 变更文件列表

### 定位选择器

| 优先级 | 类型 | 选择器 |
|--------|------|--------|
| 1 | CSS | `.adl-patch-file-card` |
| 2 | CSS | `.adl-patch-file-card__open` |
| 3 | CSS | `.adl-patch-hunk-card` |

### 变更项

| 选择器 | 说明 |
|--------|------|
| `.adl-patch-file-card` | 变更文件卡片 |
| `.adl-patch-file-card.is-active` | 当前选中变更文件 |
| `.adl-patch-file-card__open` | 打开当前文件到右侧视图 |
| `.adl-patch-hunk-card` | 单个补丁块 |
| `.adl-patch-hunk-card__toggle` | 折叠/展开补丁块 |

### 操作

#### 查看变更详情

```javascript
await page.click('.adl-patch-file-card__open');
await page.waitForSelector('div[data-testid="changes-preview-shell"]');
```

---

## 导航模式

> 变更面板左侧支持 `文件树` / `文件列表` / `文档大纲` 三种导航模式。

### 文件树

| 选择器 | 说明 |
|--------|------|
| `.adl-filetree-shell` | 共享自绘滚动壳 |
| `.adl-filetree-scroll` | 文件树滚动容器 |
| `.adl-filetree__item` | 文件 / 文件夹节点 |
| `.adl-filetree__row` | 整行交互区域 |
| `.adl-filetree__label` | 文件 / 文件夹名称按钮 |
| `.adl-filetree__toggle` | 文件夹收起 / 展开按钮 |
| `.adl-filetree__item.is-active` | 当前点击选中节点 |

### 文件列表

> 文件列表模式以平铺方式展示所有变更文件（无目录层级），与文件树模式共用同一套 `.adl-filetree` 文件树组件，通过 `flat` prop 移除缩进占位符以获得更紧凑的显示。

| 选择器 | 说明 |
|--------|------|
| `.adl-filetree-shell` | 共享自绘滚动壳 |
| `.adl-filetree-scroll` | 文件列表滚动容器 |
| `.adl-filetree__item` | 文件节点 |
| `.adl-filetree__row` | 整行交互区域（无左侧额外缩进） |
| `.adl-filetree__label` | 文件名称按钮 |
| `.adl-filetree__item.is-active` | 当前点击选中节点 |

### 行为约定

1. 文件树与文档大纲样式独立维护：文件树开关按钮 16×16，大纲树 20×20；连接竖线位置不同（文件树 left:18px，大纲树 left:13px）。
2. 文件树与文档大纲共用同一套树节点行交互规则：hover 时仅标签区域高亮，active 时整行和 toggle 一起进入选中态。
3. 文件列表模式只显示文件名，不显示完整路径；超长名称使用单行截断省略。
4. 文件列表模式无目录层级，所有节点为同一缩进级别，无展开/折叠操作。
5. 文件树与文档大纲共用 `CustomScrollArea` 自绘滚动壳，滚动条 hover / active 视觉保持一致。

---

## 摘要统计与状态筛选

> 变更导航器顶部显示 `已暂存` / `已修改` / `未跟踪` 三个统计卡片，展示所有可见工作区中各状态的合计文件计数，同时支持点击筛选。

### 定位选择器

| 优先级 | 类型 | 选择器 |
|--------|------|--------|
| 1 | aria-label | `button[aria-label="已暂存"]` |
| 2 | aria-label | `button[aria-label="已修改"]` |
| 3 | aria-label | `button[aria-label="未跟踪"]` |
| 4 | CSS | `.adl-tool-navigator__summary` |
| 5 | CSS | `.adl-tool-navigator__summary-stat` |
| 6 | CSS | `.adl-tool-navigator__summary-stat.is-active` |

### 容器结构

```text
┌───────────────────────────────────────────┐
│  .adl-tool-navigator__summary             │
│  ┌─────────────────────────────────────┐  │
│  │ .adl-tool-navigator__summary-stats  │  │
│  │ ┌────────┐┌────────┐┌──────────┐   │  │
│  │ │ 已暂存  ││ 已修改  ││ 未跟踪    │   │  │
│  │ │  S:0   ││  M:8   ││  U:0     │   │  │
│  │ └────────┘└────────┘└──────────┘   │  │
│  └─────────────────────────────────────┘  │
└───────────────────────────────────────────┘
```

### 前置条件

- [x] 选择"变更"工具面板（`#changes-panel`）
- [x] 当前工作区存在 Git 变更文件
- [x] 导航器模式为"文件树"或"文件列表"（大纲模式下不显示）

### 操作

#### 筛选已暂存文件

```javascript
await page.click('button[aria-label="已暂存"]');
await page.waitForSelector('button[aria-label="已暂存"].is-active');
```

#### 筛选已修改文件

```javascript
await page.click('button[aria-label="已修改"]');
await page.waitForSelector('button[aria-label="已修改"].is-active');
```

#### 筛选未跟踪文件

```javascript
await page.click('button[aria-label="未跟踪"]');
await page.waitForSelector('button[aria-label="未跟踪"].is-active');
```

---

## 右键菜单

> 变更面板的文件树/文件列表与文件面板共享同一套右键菜单实现。所有选择器和操作与 [文件面板右键菜单](./files.md#右键菜单) 一致，唯一差异是变更面板中：
> - **已删除文件**：打开方式、在文件管理器中显示、重命名、删除操作不可用（disabled）
> - 复制完整/相对路径始终可用

### 操作

#### 右键打开变更文件菜单

```javascript
await page.locator('.adl-filetree__label').first().click({ button: 'right' });
await page.waitForSelector('.adl-sidebar-menu');
```

### 行为约定

1. 右键菜单高亮（`.is-context-menu-target`）在菜单关闭时立即消失（无子对话框操作）或子对话框关闭时消失（重命名/删除）。
2. 粘贴操作自动处理目标路径冲突（`-copy1`、`-copy2`...后缀）。
3. 剪切+粘贴时无论源与目标是否同目录，均使用 duplicate+delete 方式操作（避免 rename 跨文件系统的限制）。
4. 删除操作通过 `trash` crate（Tauri）或 PowerShell（浏览器）移至系统回收站，非永久删除。

#### 组合多选筛选

```javascript
// 依次点击多个状态按钮可实现组合筛选
await page.click('button[aria-label="已暂存"]');
await page.click('button[aria-label="已修改"]');
// 此时只显示 已暂存 + 已修改 的文件
```

### 状态变化

| 操作 | 筛选结果 |
|------|----------|
| 点击某个状态按钮 | 仅显示包含该状态的文件 |
| 点击多个状态按钮 | 显示包含任一选中状态的文件（OR 逻辑） |
| 取消所有选中 | 显示全部文件（等同于未筛选） |
| 选中全部三种状态 | 显示全部文件（等同于未筛选） |
| 再次点击已激活的按钮 | 取消该状态的筛选 |

### 预期结果

- 筛选后左侧文件树/文件列表实时更新，仅显示匹配的文件
- 导航器顶部元数据计数反映筛选后的文件数量
- 选中状态按钮背景变为透明（与容器背景融合），悬停时显示灰色边框
- 筛选状态可通过再次点击该按钮取消

### 交互状态

| 状态 | 背景 | 边框 |
|------|------|------|
| 默认 | `var(--surface-raised)` 白色卡片 | 透明 |
| 悬停 | 透明（透出容器渐变背景） | 灰色 |
| 激活（选中） | 透明（透出容器渐变背景） | 透明 |

### 注意事项

1. 筛选仅影响左侧导航器的文件显示，不影响右侧变更预览内容。
2. 已暂存（S）/ 已修改（M）/ 未跟踪（U）徽标始终显示在文件项上，不受筛选影响。
3. 刷新文件树或 Git 状态后筛选状态保持，不会自动重置。

---

## 文档大纲

> 变更预览中的结构导航。支持文件树 / 文件列表 / 文档大纲三种导航模式。

### 定位选择器

| 优先级 | 类型 | 选择器 |
|--------|------|--------|
| 1 | aria-label | `button[aria-label="文档大纲"]` |
| 2 | CSS | `.adl-outline-tree-shell` |
| 3 | CSS | `.adl-outline-tree__label` |

### 操作

#### 切换到大纲视图

```javascript
await page.click('button[aria-label="文档大纲"]');
await page.waitForSelector('.adl-outline-tree');
```

#### 通过大纲跳转到变更位置

```javascript
await page.locator('.adl-outline-tree__label').first().click();
await page.waitForSelector('div[data-testid="changes-preview-shell"]');
```

### 行为约定

1. 变更大纲基于 `changePreview.currentContent` 生成，只反映当前修改侧内容。
2. 在内联 Diff 和并排 Diff 中，点击大纲项前会自动展开“无变更行自动收起”的上下文，再跳到修改侧对应行。
3. 在 Markdown 预览模式下，点击大纲项优先滚动到预览正文标题；在代码预览 / Diff 模式下，跳转到代码视图对应行。
4. 变更大纲与文件大纲共用同一套树形组件和自绘滚动壳，滑块 hover / active 效果一致。

---

## 补丁预览

> 补丁差异预览

### 定位选择器

| 优先级 | 类型 | 选择器 |
|--------|------|--------|
| 1 | CSS | `div[data-testid="changes-preview-shell"]` |
| 2 | CSS | `.adl-tool-editor--changes` |
| 3 | CSS | `.adl-diff-toolbar` |

### 操作

#### 查看差异

```javascript
await page.click('.adl-patch-file-card__open');
await page.waitForSelector('.adl-diff-toolbar');
```

#### 切换预览/编辑

```javascript
await page.locator('.adl-tool-context__group--files-actions .adl-tool-context__iconbtn').first().click();
```

### 显示语义与视觉约定

> 变更工具中的内联 Diff、并排 Diff、折叠上下文、只读预览，共用同一套 CodeMirror 视觉语义。变更提示以“正文区整行/整块背景”为主，不依赖 gutter 二次强调。

| 视觉元素 | 真实来源 | 含义 | 作用 |
|----------|----------|------|------|
| 淡绿色整块背景 | `--editor-diff-insert-bg-block` / `--editor-diff-insert-bg` 语义层 | 当前区域属于新增或修改块 | 先给出块级范围感，帮助快速扫描变更分布 |
| 稍深绿色整行背景 | `.cm-insertedLine` / `.cm-changedLine` 与 agent line decoration | 这一行本身是实际变更行 | 把“变更块范围”与“真正发生变化的行”区分开 |
| 淡红色整行/整块背景 | `--editor-diff-remove-bg-block` / `--editor-diff-remove-bg` | 删除范围或删除行 | 让删除信息与新增信息在阅读上立即分离 |
| 行内更亮的绿色底部高亮线 | CodeMirror merge 的行内 changed-text 语义 | 该变更行内部还有更细的词/字符级差异 | 在长行内快速定位真正改动的片段 |
| 选中 hunk 的浅蓝描边 | `--editor-current-hunk-ring` | 当前聚焦的补丁块 | 辅助键盘导航、接受/拒绝操作和上下文跟踪 |
| 并排 Diff 渐变分隔层 | `.adl-cm-diff-viewer--side-by-side .cm-mergeViewEditors > .cm-mergeViewEditor:first-child::after` | 左右版本边界 + 左侧退后右侧浮出 | 透明→背景色的水平渐变（6px 宽），模拟"左低右高"的卡片分层感 |
| 折叠区块控件 | `.cm-collapsedLines` | 被收起的未变更上下文 | 减少长 Diff 噪音，同时保留展开入口 |

### 行号切换行为

> 通过"更多操作"菜单中的"行号"选项可切换行号显示（内联 Diff 和并排 Diff 均支持）。

| 状态 | 行号数字 | 折叠图标 | gutter 区域 |
|------|----------|----------|-------------|
| ✅ 开启 | 显示 | 显示（auto-hide：打开文件时显示1秒后自动隐藏，鼠标进入行号区重新显示） | 正常宽度 |
| ❌ 关闭 | 隐藏 | 隐藏 | 完全消失，正文左移 |

> 取消行号时，整个 gutter 区域（行号数字 + 折叠/展开图标）全部消失，正文内容向左移动占满空间。
>
> 折叠图标默认隐藏，仅在以下情况显示：打开文件时短暂显示1秒、鼠标悬停在行号区、鼠标悬停在单个图标上。

### 国际化支持

> CodeMirror 编辑器内置 phrase 国际化机制，折叠区块控件文案随应用语言切换自动变化。

| 语言 | 折叠区块文案 | 还原按钮 | 接受按钮 | 拒绝按钮 |
|------|-------------|----------|----------|----------|
| 中文 (zh-CN) | `N 行无变化` | 还原此块 | 接受 | 拒绝 |
| English (en-US) | `N unchanged lines` | Revert this chunk | Accept | Reject |

> `locale` prop 通过 `appInfo.config.language` 传入 CodeEditor / DiffViewer，由 `getPhrasesExtension(locale)` 生成 `EditorState.phrases` 扩展。

### 滑动条菜单

> 变更工具中的只读预览、内联 Diff、并排 Diff 共用同一套右侧滚动壳与菜单语义。右键点击右侧滚动区域，可打开滑动条菜单。缩略图（Minimap）功能已移除，当前仅支持标准模式，菜单仅含"设置"分组。

菜单采用 **`::before` 左竖线指示器 + 直角背景高亮** 的极简线条风格（方案 C），不使用勾选（checkmark）或圆角边框。

#### 菜单结构

| 分组 | 菜单项 | 说明 |
|------|--------|------|
| **设置**（分组标签） | — | 分组标题 |
| | 全局 / 独立 | 控制配置写入全局设置，还是仅作用于当前变更视图作用域 |

#### 视觉设计

| 元素 | CSS 类 | 样式 |
|------|--------|------|
| 菜单项 | `.adl-cm-minimap-menu-item` | 扁平按钮，`::before` 隐藏（未选中）或显示（选中） |
| 选中菜单项 | `.adl-cm-minimap-menu-item--active` | `::before` 左竖线 + 深色底色高亮 |
| 分隔线 | `.adl-cm-minimap-menu-separator` | 水平分割线 |

#### 交互约定

- 菜单点击选项后保持展开，原地刷新选中态
- 无勾选（checkmark），改用 `::before` 竖线 + `--active` 类名指示选中
- 点击菜单外部，或在其他滚动区域重新打开菜单时关闭

### 刷新按钮

> 变更文件统计数字右侧的刷新按钮，同时刷新文件树和 Git 快照。

| 操作 | 调用 |
|------|------|
| 刷新文件树 | `onRefreshWorkspaceTree()` |
| 刷新 Git 状态 | `useAppStore.getState().fetchGitStatus()` |

### 已移除的冗余提示

| 已移除元素 | 原因 |
|------------|------|
| 行号区域与正文区域同时显示红/绿竖线 | 同一语义被重复强调，视觉负担过重 |
| 行号区域的小圆点 / 独立变更 gutter | 与正文内的块级背景重复，不再提供额外信息价值 |
| 点击编辑器后四周出现的虚线焦点边框 | 不属于 Diff 语义，会打断连续阅读 |
| gutter 与正文之间的额外分隔缝隙 | 会把 Diff 阅读面割裂成两个层次 |

### 颜色 token 对照

| token | 含义 |
|-------|------|
| `--editor-diff-insert-bg` | 新增/修改行的基础绿色背景 |
| `--editor-diff-remove-bg` | 删除行的基础红色背景 |
| `--editor-diff-insert-bg-strong` | 更强一级的新增强调 |
| `--editor-diff-remove-bg-strong` | 更强一级的删除强调 |
| `--editor-diff-insert-bg-block` | 新增/修改块级范围背景 |
| `--editor-diff-remove-bg-block` | 删除块级范围背景 |
| `--editor-selection` | 修改或选中文本的中性浅蓝强调 |
| `--editor-current-hunk-ring` | 当前聚焦 hunk 的环形描边 |

### 注意事项

1. Diff 的主语义在正文区，gutter 只保留基础行号定位。
2. 绿色/红色的深浅差异用于表达“范围”与“实际变更行”的层级，不表示不同审批状态。
3. 若未来要进一步降噪，优先考虑收弱行内底部高亮线，而不是重新引回 gutter 状态条。

---

## 补丁操作

> 应用/回滚补丁

### 按钮列表

| 按钮 | aria-label | 说明 |
|------|------------|------|
| 预览 / 编辑 | 文件预览 / 文件编辑 | 眼睛图标按钮，切换右侧视图 |
| 应用全部 | 应用全部 | 应用所有补丁 |
| 回滚全部 | 回滚全部 | 回滚所有补丁 |
| 接受 | 接受 | 接受当前补丁块 |
| 拒绝 | 拒绝 | 拒绝当前补丁块 |

### 操作

```javascript
await page.click('button[aria-label="应用全部"]');
await page.click('button[aria-label="回滚全部"]');
```

---

## 空状态

> 变更面板右侧在无内容时显示的状态。

### 状态行为

| 场景 | 显示内容 |
|------|----------|
| 有变更文件但未选择预览 | 空白（不显示任何提示） |
| 无变更文件且已打开工作区 | 显示"当前没有检测到文件变更" |
| 无工作区 | 显示"打开工作区以查看变更" |

### 定位选择器

| 优先级 | 类型 | 选择器 |
|--------|------|--------|
| 1 | CSS | `.adl-changes-empty` |
| 2 | CSS | `.adl-changes-empty__text` |

### 视觉设计

- 居中布局：文字在容器中水平和垂直居中
- 无图标：仅显示纯文本提示
- 文字样式：使用 `--text-muted` 颜色，`--font-sm` 字号

---

## 相关元素

| 元素 | 选择器 | 说明 |
|------|--------|------|
| 变更面板 | `#changes-panel` | 变更面板容器 |
| 变更列表 | `.adl-patch-file-card` | 变更文件卡片 |
| Diff 工具条 | `.adl-diff-toolbar` | 变更预览工具栏 |
| 预览编辑器 | `div[data-testid="changes-preview-shell"]` | 差异/只读预览容器 |
| 空状态容器 | `.adl-changes-empty` | 变更面板空状态容器 |
| 空状态文本 | `.adl-changes-empty__text` | 变更面板空状态提示文本 |
