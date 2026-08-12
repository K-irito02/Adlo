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

### 3. 修饰状态

| 状态 | CSS 类名 | 说明 |
|------|----------|------|
| 主要 | `.adl-btn--primary` | 主要操作按钮 |
| 危险 | `.adl-btn--danger`, `.adl-action-btn--danger` | 危险操作 |
| 警告 | `.adl-btn--warning`, `.adl-action-btn--warning` | 警告提示 |
| 幽灵 | `.adl-btn--ghost` | 透明背景按钮 |

### 4. 会话状态

| 状态 | CSS 类名 | 颜色标识 | 说明 |
|------|----------|----------|------|
| 处理中 | `.adl-status-lamp--processing` | 蓝色动画 | Agent 正在处理 |
| 待审批 | `.adl-status-lamp--pending-approval` | 橙色 | 等待用户审批 |
| 异常 | `.adl-status-lamp--abnormal` | 红色 | 执行出错 |
| 已完成 | `.adl-status-lamp--completed` | 绿色 | 正常完成 |
| 已读 | `.adl-status-lamp--read` | 灰色 | 已读状态 |

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

### 检查按钮状态

```javascript
// 发送按钮状态
const sendBtn = document.querySelector('[data-testid="composer-send"]');
const isSendMode = sendBtn.classList.contains('adl-action-btn--primary');
const isStopMode = sendBtn.classList.contains('adl-action-btn--danger');
const isRetryMode = sendBtn.classList.contains('adl-action-btn--warning');
const isDisabled = sendBtn.disabled;
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

### 检查会话状态

```javascript
// 会话项状态
const sessionItem = document.querySelector('.adl-session-item');
const isActive = sessionItem.classList.contains('is-active');
const statusLamp = sessionItem.querySelector('.adl-status-lamp');
const status = statusLamp?.className.match(/adl-status-lamp--(\w+)/)?.[1];
// 返回: 'processing' | 'pending-approval' | 'abnormal' | 'completed' | 'read'
```

### 检查工作区状态

```javascript
// 工作区项状态
const workspaceItem = document.querySelector('.adl-workspace-item');
const isCurrent = workspaceItem.classList.contains('is-current');
const isExpanded = workspaceItem.querySelector('.adl-workspace-row')?.getAttribute('aria-expanded') === 'true';
```

### 检查错误通知区状态

```javascript
// 右下角持久错误通知区（.error-toast-region，挂载于 document.body）
const region = document.querySelector('.error-toast-region');
const toasts = [...document.querySelectorAll('.error-toast:not(.error-toast--summary)')];

// 单条 toast 状态
const toast = toasts[0];
const level = toast?.className.match(/error-toast--(error|warning|info)/)?.[1];
// 返回: 'error' | 'warning' | 'info' | undefined
const isCollapsed = toast?.classList.contains('is-collapsed');
const isExpanded = toast?.classList.contains('is-expanded');

// 摘要（超过 5 条时）
const summary = document.querySelector('.error-toast--summary');
const hiddenCount = summary?.querySelector('.error-toast__summary-text')?.textContent;

// 操作按钮（按 aria-label 定位）
const collapseBtn = toast?.querySelector('button[aria-label="折叠"], button[aria-label="Collapse"]');
const expandBtn = toast?.querySelector('button[aria-label="展开"], button[aria-label="Expand"]');
const copyBtn = toast?.querySelector('button[aria-label="复制"], button[aria-label="Copy"]');
const closeBtn = toast?.querySelector('button[aria-label="关闭"], button[aria-label="Close"]');
const clearAllBtn = summary?.querySelector('button');
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

### 发送按钮状态

| 状态 | CSS 类名 | aria-label | 行为 |
|------|----------|------------|------|
| 可发送 | `.adl-action-btn--primary` | "发送" | 点击发送消息 |
| 停止 | `.adl-action-btn--danger` | "停止生成" | 点击停止生成 |
| 重试 | `.adl-action-btn--warning` | "重试" | 点击重试发送 |
| 禁用 | `:disabled` | - | 输入为空时 |

### 会话项状态

| 状态 | CSS 类名组合 | 视觉表现 |
|------|--------------|----------|
| 激活 + 处理中 | `.is-active` + `.adl-status-lamp--processing` | 高亮背景 + 蓝色动画灯 |
| 未读 + 待审批 | (无 is-active) + `.adl-status-lamp--pending-approval` | 橙色灯 |
| 已读 + 已完成 | `.adl-status-lamp--completed` | 绿色灯 |
| 拖拽中 | `.is-dragging` | 半透明 |
| 放置目标 | `.is-drop-target` | 高亮边框 |

### 面板状态

| 状态 | CSS 类名组合 | 布局表现 |
|------|--------------|----------|
| 正常停靠 | (无修饰) | 占据布局空间 |
| 折叠 | `.adl-leftbar--collapsed` / `.adl-rightpanel--collapsed` | 隐藏内容 |
| 覆盖模式 | `.adl-rightpanel--overlay-active` | 覆盖中心区域 |
| 完全展开 | `.adl-rightpanel--overlay-expanded` | 占满剩余空间 |
