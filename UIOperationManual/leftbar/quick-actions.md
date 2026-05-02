# 快捷操作

> 左侧边栏顶部的快捷操作按钮区域。

## 按钮列表

| 按钮 | 说明 | 状态 |
|------|------|------|
| 技能 | 快速访问技能功能 | **即将推出**（禁用） |
| MCP 服务 | 快速访问 MCP 服务 | **即将推出**（禁用） |

## 容器选择器

| 选择器 | 说明 |
|--------|------|
| `.adl-leftbar__quick` | 快捷操作区容器 |

---

## 技能按钮

> 快速访问技能功能

### 定位选择器

| 优先级 | 类型 | 选择器 |
|--------|------|--------|
| 1 | aria-label | `button[aria-label*="技能"]` |
| 2 | CSS | `.adl-quick-btn` (包含 "技能" 文本) |

### 前置条件

- [x] 无特殊条件

### 状态

| 状态 | 说明 |
|------|------|
| 禁用 | 当前版本不可用，显示 "即将推出" 提示 |

### 操作

```javascript
// 按钮当前禁用，点击无响应
const btn = await page.waitForSelector('.adl-quick-btn:has-text("技能")');
await btn.click(); // 无响应
```

### 预期结果

- 悬停显示 Tooltip：`技能 · 即将推出`
- 点击无响应（按钮禁用）

### 验证禁用状态

```javascript
const isDisabled = await page.evaluate(() => {
  const btn = document.querySelector('.adl-quick-btn');
  return btn?.disabled;
});
// 返回: true
```

---

## MCP 服务按钮

> 快速访问 MCP 服务

### 定位选择器

| 优先级 | 类型 | 选择器 |
|--------|------|--------|
| 1 | aria-label | `button[aria-label*="MCP"]` |
| 2 | CSS | `.adl-quick-btn` (包含 "MCP" 文本) |

### 前置条件

- [x] 无特殊条件

### 状态

| 状态 | 说明 |
|------|------|
| 禁用 | 当前版本不可用，显示 "即将推出" 提示 |

### 操作

```javascript
// 按钮当前禁用，点击无响应
const btn = await page.waitForSelector('.adl-quick-btn:has-text("MCP")');
await btn.click(); // 无响应
```

### 预期结果

- 悬停显示 Tooltip：`MCP 服务 · 即将推出`
- 点击无响应（按钮禁用）
- 显示绿色状态灯（装饰性）

### 验证禁用状态

```javascript
const isDisabled = await page.evaluate(() => {
  const btns = document.querySelectorAll('.adl-quick-btn');
  for (const btn of btns) {
    if (btn.textContent.includes('MCP')) {
      return btn.disabled;
    }
  }
  return false;
});
// 返回: true
```

## 按钮样式

### CSS 类名

```css
.adl-quick-btn           /* 快捷按钮基础样式 */
.adl-quick-btn__label    /* 按钮文本标签 */
```

### 状态灯

MCP 按钮右侧显示一个装饰性状态灯：

```css
.adl-status-lamp--read   /* 灰色状态灯 */
```

## 相关元素

| 元素 | 选择器 | 说明 |
|------|--------|------|
| 快捷操作区 | `.adl-leftbar__quick` | 包含技能和 MCP 按钮 |
| Tooltip | `.adl-tooltip` | 悬停时显示的提示 |

## 注意事项

1. **功能未实现**：当前版本两个按钮均为禁用状态
2. **仅展示**：按钮仅作为功能入口展示，实际功能将在未来版本实现
3. **状态灯装饰**：MCP 按钮的状态灯仅为装饰，不代表实际状态
