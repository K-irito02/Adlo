# 工具切换器

> 右侧面板顶部的工具切换标签栏。

## 容器选择器

| 选择器 | 说明 |
|--------|------|
| `.adl-tool-switcher` | 工具切换器容器 |
| `.adl-tool-switcher__tabs` | 标签列表容器 |

---

## 工具标签

> 单个工具标签

### 定位选择器

| 优先级 | 类型 | 选择器 |
|--------|------|--------|
| 1 | aria-label | `[aria-label="文件"]` |
| 2 | CSS | `.adl-tool-switcher__tab` |
| 3 | CSS | `.adl-tool-switcher__tab.is-active` (激活状态) |

### 标签列表

| 工具 | aria-label | 面板 ID |
|------|------------|---------|
| 文件 | "文件" | `files-panel` |
| 变更 | "变更" | `changes-panel` |
| 浏览器 | "浏览器" | `browser-panel` |
| 终端 | "终端" | `terminal-panel` |
| 设置 | "设置" | `settings-panel` |

> `audit`、`models` 非 ToolId（`models-panel` 不存在）；`communicate` 已删除（见分支 `remove-communicate-panel`）。

### 状态

| 状态 | CSS 类名 | aria 属性 | 说明 |
|------|----------|-----------|------|
| 默认 | - | `aria-selected="false"` | 未激活 |
| 激活 | `.is-active` | `aria-selected="true"` | 当前选中 |
| 禁用 | `.is-disabled` | `aria-disabled="true"` | 不可用 |

### 徽章

部分标签可能显示徽章：

| 标签 | 徽章内容 |
|------|----------|
| 文件 | 未保存文件数 |
| 变更 | Git 变更数 |
| 浏览器 | 打开的标签数 |
| 终端 | 打开的标签数 |

### 操作

#### 切换工具

```javascript
// 点击文件标签
await page.click('.adl-tool-switcher__tab[aria-label="文件"]');

// 等待面板激活
await page.waitForSelector('#files-panel.is-active');
```

#### 检查当前工具

```javascript
const activeTool = await page.evaluate(() => {
  const activeTab = document.querySelector('.adl-tool-switcher__tab.is-active');
  return activeTab?.getAttribute('aria-label');
});
```

---

## 展开按钮

> 右侧的展开/还原按钮（覆盖模式）

### 定位选择器

| 优先级 | 类型 | 选择器 |
|--------|------|--------|
| 1 | aria-label | `button[aria-label="扩大右侧边栏"]` |
| 2 | aria-label | `button[aria-label="还原右侧边栏"]` |
| 3 | CSS | `.adl-tool-switcher__expand` |

### 操作

#### 展开面板

```javascript
// 点击展开按钮
await page.click('button[aria-label="扩大右侧边栏"]');

// 等待覆盖模式
await page.waitForSelector('.adl-rightpanel--overlay-expanded');
```

#### 还原面板

```javascript
// 点击还原按钮
await page.click('button[aria-label="还原右侧边栏"]');

// 等待还原
await page.waitForSelector('.adl-rightpanel:not(.adl-rightpanel--overlay-expanded)');
```

---

## 相关元素

| 元素 | 选择器 | 说明 |
|------|--------|------|
| 工具切换器 | `.adl-tool-switcher` | 工具切换器容器 |
| 标签列表 | `.adl-tool-switcher__tabs` | 标签列表 |
| 工具标签 | `.adl-tool-switcher__tab` | 单个标签 |
| 徽章 | `.adl-badge` | 数量徽章 |
| 展开按钮 | `.adl-tool-switcher__expand` | 展开/还原按钮 |
