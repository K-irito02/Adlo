# 通用元素状态定义

> 本文档定义 UI 元素的通用状态及其识别方式。

## 状态类型

### 1. 交互状态

| 状态 | CSS 选择器 | aria 属性 | 说明 |
|------|-----------|-----------|------|
| 默认 | `:default` | - | 初始状态 |
| 悬停 | `:hover` | - | 鼠标悬停 |
| 聚焦 | `:focus-visible` | - | 键盘聚焦 |
| 激活 | `:active` | - | 点击按下 |
| 禁用 | `:disabled` | `aria-disabled="true"` | 不可交互 |
| 加载中 | `[data-loading="true"]` | `aria-busy="true"` | 异步操作中 |

### 2. 选中状态

| 状态 | CSS 选择器 | aria 属性 | 说明 |
|------|-----------|-----------|------|
| 选中 | `.is-selected` | `aria-selected="true"` | 列表项选中 |
| 激活 | `.is-active` | `aria-current="true"` | 当前激活项 |
| 展开 | `.is-expanded` | `aria-expanded="true"` | 展开/折叠 |
| 折叠 | `.is-collapsed` | `aria-expanded="false"` | 折叠状态 |

## 状态检测方法

### 检查元素是否可交互

```javascript
// 检查元素是否可见且可点击
function isElementInteractable(element) {
  return (
    element &&
    !element.disabled &&
    !element.getAttribute('aria-disabled') &&
    !element.getAttribute('aria-busy') &&
    element.offsetParent !== null // 可见
  );
}
```

### 检查面板状态

```javascript
// 左侧边栏状态
const leftbar = document.querySelector('.adl-leftbar');
const isCollapsed = leftbar.classList.contains('adl-leftbar--collapsed');

// 右侧面板状态
const rightpanel = document.querySelector('.adl-rightpanel');
const isCollapsed = rightpanel.classList.contains('adl-rightpanel--collapsed');
const isOverlayActive = rightpanel.classList.contains('adl-rightpanel--overlay-active');
const isOverlayExpanded = rightpanel.classList.contains('adl-rightpanel--overlay-expanded');
```

### 检查错误通知区状态

> 实现：`app/components/ErrorToast.tsx`（`ErrorToastContainer` + `ToastCard`），数据源 `errorToastSlice`。级别 `error/warning/info`（`errorToastLevel.ts`），`role=alert`（error/warning）/`status`（info）；重复错误折叠计数（`detail ×N`）；静默条目只进诊断队列不渲染；最多显示 5 条（`ERROR_TOAST_VISIBLE_LIMIT`），超出部分出摘要卡。

```javascript
// 右下角错误通知区（.toast-card-region__group，挂载于 document.body）
const region = document.querySelector('.toast-card-region__group');
const toasts = [...region.querySelectorAll('.toast-card:not(.toast-card--summary)')];

// 单条 toast 级别：tone 透出为图标/语义（error/warning → alert，info → status）
const summary = region.querySelector('.toast-card--summary');
const hiddenText = summary?.querySelector('.toast-card__summary-text')?.textContent;

// 操作按钮（按 aria-label 定位，以 i18n 实际文案为准）
const clearAllBtn = summary?.querySelector('.toast-card__btn');
```

## 状态变化监听

### 等待元素状态变化

```javascript
// 等待元素变为可用状态
async function waitForEnabled(selector, timeout = 5000) {
  const startTime = Date.now();
  while (Date.now() - startTime < timeout) {
    const element = document.querySelector(selector);
    if (element && !element.disabled) {
      return element;
    }
    await new Promise(r => setTimeout(r, 100));
  }
  throw new Error(`Element ${selector} did not become enabled within ${timeout}ms`);
}
```

### 等待元素出现/消失

```javascript
// 等待元素出现
async function waitForElement(selector, timeout = 5000) {
  const startTime = Date.now();
  while (Date.now() - startTime < timeout) {
    const element = document.querySelector(selector);
    if (element) return element;
    await new Promise(r => setTimeout(r, 100));
  }
  throw new Error(`Element ${selector} not found within ${timeout}ms`);
}

// 等待元素消失
async function waitForElementGone(selector, timeout = 5000) {
  const startTime = Date.now();
  while (Date.now() - startTime < timeout) {
    const element = document.querySelector(selector);
    if (!element) return true;
    await new Promise(r => setTimeout(r, 100));
  }
  throw new Error(`Element ${selector} still present after ${timeout}ms`);
}
```

## 常见状态组合

### 面板状态

| 状态 | CSS 类名组合 | 布局表现 |
|------|--------------|----------|
| 正常停靠 | (无修饰) | 占据布局空间 |
| 折叠 | `.adl-leftbar--collapsed` / `.adl-rightpanel--collapsed` | 隐藏内容 |
| 覆盖模式 | `.adl-rightpanel--overlay-active` | 覆盖中心区域 |
| 完全展开 | `.adl-rightpanel--overlay-expanded` | 占满剩余空间 |
