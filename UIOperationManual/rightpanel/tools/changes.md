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
