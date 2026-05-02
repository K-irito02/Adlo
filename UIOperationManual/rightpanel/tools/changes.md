# 变更工具面板

> Git 变更和补丁预览面板。

## 容器选择器

| 选择器 | 说明 |
|--------|------|
| `#changes-panel` | 变更面板容器 |

---

## 变更列表

> Git 变更文件列表

### 定位选择器

| 优先级 | 类型 | 选择器 |
|--------|------|--------|
| 1 | CSS | `.adl-changes-tree` |
| 2 | CSS | `.adl-changes-panel__list` |

### 变更项

| 选择器 | 说明 |
|--------|------|
| `.adl-changes-item` | 变更文件项 |
| `.adl-changes-item--added` | 新增文件 |
| `.adl-changes-item--modified` | 修改文件 |
| `.adl-changes-item--deleted` | 删除文件 |
| `.adl-changes-item--renamed` | 重命名文件 |

### 操作

#### 查看变更详情

```javascript
// 点击变更项
await page.click('.adl-changes-item');

// 等待 Diff 视图加载
await page.waitForSelector('.monaco-diff-editor');
```

---

## 补丁预览

> 补丁差异预览

### 定位选择器

| 优先级 | 类型 | 选择器 |
|--------|------|--------|
| 1 | CSS | `.monaco-diff-editor` |

### 操作

#### 查看差异

```javascript
// 点击变更项
await page.click('.adl-changes-item');

// 等待 Diff 编辑器加载
await page.waitForSelector('.monaco-diff-editor');
```

---

## 补丁操作

> 应用/回滚补丁

### 按钮列表

| 按钮 | aria-label | 说明 |
|------|------------|------|
| 应用全部 | "应用全部" | 应用所有补丁 |
| 回滚全部 | "回滚全部" | 回滚所有补丁 |
| 接受 | "接受" | 接受当前补丁块 |
| 拒绝 | "拒绝" | 拒绝当前补丁块 |

### 操作

```javascript
// 应用全部补丁
await page.click('button[aria-label="应用全部"]');

// 回滚全部补丁
await page.click('button[aria-label="回滚全部"]');
```

---

## 相关元素

| 元素 | 选择器 | 说明 |
|------|--------|------|
| 变更面板 | `#changes-panel` | 变更面板容器 |
| 变更列表 | `.adl-changes-tree` | 变更文件列表 |
| Diff 编辑器 | `.monaco-diff-editor` | 差异预览编辑器 |
