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
| 并排 Diff 中央分隔线 | `.cm-mergeViewEditors > .cm-editor + .cm-editor` | 左右版本边界 | 仅在并排模式下帮助区分两个 pane，不表示变更状态 |
| 折叠区块控件 | `.cm-collapsedLines` | 被收起的未变更上下文 | 减少长 Diff 噪音，同时保留展开入口 |

### 行号切换行为

> 通过"更多操作"菜单中的"行号"选项可切换行号显示（内联 Diff 和并排 Diff 均支持）。

| 状态 | 行号数字 | 折叠图标 | gutter 区域 |
|------|----------|----------|-------------|
| ✅ 开启 | 显示 | 显示 | 正常宽度 |
| ❌ 关闭 | 隐藏 | 隐藏 | 完全消失，正文左移 |

> 取消行号时，整个 gutter 区域（行号数字 + 折叠/展开图标）全部消失，正文内容向左移动占满空间。

### 国际化支持

> CodeMirror 编辑器内置 phrase 国际化机制，折叠区块控件文案随应用语言切换自动变化。

| 语言 | 折叠区块文案 | 还原按钮 | 接受按钮 | 拒绝按钮 |
|------|-------------|----------|----------|----------|
| 中文 (zh-CN) | `N 行无变化` | 还原此块 | 接受 | 拒绝 |
| English (en-US) | `N unchanged lines` | Revert this chunk | Accept | Reject |

> `locale` prop 通过 `appInfo.config.language` 传入 CodeEditor / DiffViewer，由 `getPhrasesExtension(locale)` 生成 `EditorState.phrases` 扩展。

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

## 相关元素

| 元素 | 选择器 | 说明 |
|------|--------|------|
| 变更面板 | `#changes-panel` | 变更面板容器 |
| 变更列表 | `.adl-patch-file-card` | 变更文件卡片 |
| Diff 工具条 | `.adl-diff-toolbar` | 变更预览工具栏 |
| 预览编辑器 | `div[data-testid="changes-preview-shell"]` | 差异/只读预览容器 |
