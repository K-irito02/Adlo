# 工具切换器

> 右侧面板顶部的工具切换标签栏。

## 容器选择器

| 选择器 | 说明 |
|--------|------|
| `.adl-toolswitcher` | 工具切换器容器 |
| `.adl-toolswitcher__tabs` | 标签列表容器 |
| `.adl-toolswitcher__actions` | 右侧动作区（折叠工具栏 + 扩大/还原面板） |

---

## 工具标签

> 单个工具标签

### 定位选择器

| 优先级 | 类型 | 选择器 |
|--------|------|--------|
| 1 | aria-label | `[aria-label="文件"]` |
| 2 | CSS | `.adl-toolswitcher__tab` |
| 3 | CSS | `.adl-toolswitcher__tab.is-active` (激活状态) |

### 标签列表

面板 id 由 React `useId()` 生成（形如 `:r1:-files-panel`），下表为 id 后缀：

| 工具 | aria-label | 面板 id 后缀 |
|------|------------|--------------|
| 文件 | "文件" | `-files-panel` |
| 变更 | "变更" | `-changes-panel` |
| 浏览器 | "浏览器" | `-browser-panel` |
| 终端 | "终端" | `-terminal-panel` |
| 设置 | "设置" | `-settings-panel` |

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
await page.click('.adl-toolswitcher__tab[aria-label="文件"]');

// 等待面板激活
await page.waitForSelector('.adl-rightpanel__tool.is-active');
```

#### 检查当前工具

```javascript
const activeTool = await page.evaluate(() => {
  const activeTab = document.querySelector('.adl-toolswitcher__tab.is-active');
  return activeTab?.getAttribute('aria-label');
});
```

---

## 折叠 / 展开工具栏按钮

> 动作区左侧按钮：折叠或展开当前右侧面板的第一行工具栏。

### 定位选择器

| 优先级 | 类型 | 选择器 |
|--------|------|--------|
| 1 | aria-label | `button[aria-label="折叠工具栏"]`（展开态，点击后折叠） |
| 2 | aria-label | `button[aria-label="展开工具栏"]`（折叠态，点击后展开） |

> 按钮的可访问名称随状态变化，因此不使用 `aria-pressed`；按钮与右侧「扩大/还原右侧面板」之间有一条常驻细分隔线（`.adl-toolswitcher__actions-separator`）。

### 折叠 / 展开

```javascript
// 折叠（隐藏五个面板的第一行工具栏）
await page.click('button[aria-label="折叠工具栏"]');
await page.waitForSelector('.adl-rightpanel--toolbar-collapsed');

// 展开（恢复第一行工具栏）
await page.click('button[aria-label="展开工具栏"]');
await page.waitForSelector('.adl-rightpanel:not(.adl-rightpanel--toolbar-collapsed)');
```

### 状态与持久化

| 项 | 值 |
|----|----|
| 面板根节点状态类 | `.adl-rightpanel--toolbar-collapsed` |
| 持久化键 | `adl:ui.rightPanelToolbarCollapsed` |
| 作用范围 | 全局一份，五个工具面板统一（不按面板拆分） |

折叠后各工具面板第一行工具栏隐藏（文件/变更/浏览器/终端为 `.adl-tool-context`，设置为设置面板头部），工具切换器保留；中心的终端/浏览器工具栏不受影响。

---

## 展开按钮

> 右侧的扩大/还原按钮（覆盖模式）

### 定位选择器

| 优先级 | 类型 | 选择器 |
|--------|------|--------|
| 1 | aria-label | `button[aria-label="扩大右侧面板"]` |
| 2 | aria-label | `button[aria-label="还原右侧面板"]` |
| 3 | CSS | `.adl-toolswitcher__expand` |

### 操作

#### 展开面板

```javascript
// 点击展开按钮
await page.click('button[aria-label="扩大右侧面板"]');

// 等待覆盖模式
await page.waitForSelector('.adl-rightpanel--overlay-expanded');
```

#### 还原面板

```javascript
// 点击还原按钮
await page.click('button[aria-label="还原右侧面板"]');

// 等待还原
await page.waitForSelector('.adl-rightpanel:not(.adl-rightpanel--overlay-expanded)');
```

---

## 相关元素

| 元素 | 选择器 | 说明 |
|------|--------|------|
| 工具切换器 | `.adl-toolswitcher` | 工具切换器容器 |
| 标签列表 | `.adl-toolswitcher__tabs` | 标签列表 |
| 工具标签 | `.adl-toolswitcher__tab` | 单个标签 |
| 徽章 | `.adl-toolswitcher__badge` | 数量徽章 |
| 折叠/展开工具栏 | `button[aria-label="折叠工具栏"]` / `button[aria-label="展开工具栏"]` | 第一行工具栏开关 |
| 动作区分隔线 | `.adl-toolswitcher__actions-separator` | 折叠按钮与展开按钮之间 |
| 展开按钮 | `.adl-toolswitcher__expand` | 扩大/还原按钮 |
