# 通用等待条件模板

> 本文档定义 UI 自动化测试中常用的等待条件模板。

## 等待类型

### 1. 元素出现/消失

```javascript
// 等待元素出现
await page.waitForSelector('.adl-center-entry', { timeout: 10000 });

// 等待元素消失
await page.waitForSelector('.adl-hamburger__dropdown', { hidden: true, timeout: 5000 });

// 等待元素可见
await page.waitForSelector('.adl-hamburger__dropdown', { visible: true, timeout: 3000 });
```

### 2. 状态变化

```javascript
// 等待元素变为可用
await page.waitForFunction(
  selector => !document.querySelector(selector)?.disabled,
  '[data-testid="editor-shell"]',
  { timeout: 5000 }
);

// 等待元素变为激活
await page.waitForFunction(
  selector => document.querySelector(selector)?.classList.contains('is-active'),
  '.adl-tool-switcher__tab',
  { timeout: 3000 }
);
```

### 3. 内容变化

```javascript
// 等待文本出现
await page.waitForFunction(
  (selector, text) => document.querySelector(selector)?.textContent?.includes(text),
  '.adl-center-entry p',
  '完成',
  { timeout: 30000 }
);

// 等待面板内容就绪
await page.waitForFunction(
  selector => document.querySelector(selector)?.children.length > 0,
  '.adl-multitree',
  { timeout: 3000 }
);
```

### 4. 网络请求

```javascript
// 等待响应完成（需要监听网络事件；浏览器模式后端为 adl-server）
await page.waitForResponse(response =>
  response.url().includes('127.0.0.1') && response.status() === 200,
  { timeout: 60000 }
);
```

## 常用等待条件

### 标题栏操作

| 操作 | 等待条件 | 超时建议 |
|------|----------|----------|
| 打开菜单 | `.adl-hamburger__dropdown` 可见 | 1000ms |
| 切换主题 | `:root` 的 `data-theme` 属性变化 | 1000ms |
| 切换语言 | 文本内容变化 | 1000ms |
| 打开工作区 | `.adl-multitree` 内容出现 | 5000ms |

### 左侧边栏操作

| 操作 | 等待条件 | 超时建议 |
|------|----------|----------|
| 剪切看板加载 | `.adl-clipboard__list` 内容出现 | 1000ms |
| 系统监控加载 | `.adl-sysmon` 内容出现 | 1000ms |
| 拖拽排序 | `.is-dragging` 类出现/消失 | 500ms |

### 中心宿主操作

| 操作 | 等待条件 | 超时建议 |
|------|----------|----------|
| 入口页出现 | `.adl-center-entry` 出现 | 2000ms |
| 标签切换 | 中心标签 `.is-active` 更新 | 2000ms |

### 右侧面板操作

| 操作 | 等待条件 | 超时建议 |
|------|----------|----------|
| 切换工具 | `[role="tabpanel"].is-active` 更新 | 1000ms |
| 加载文件树 / 文档大纲 | `.adl-multitree .adl-filetree__row` 内容出现 | 3000ms |
| 加载文件内容 | CodeMirror 编辑器内容就绪 | 5000ms |
| 执行命令 | 终端输出更新 | 10000ms+ |

## 等待函数模板

### 通用等待函数

```javascript
/**
 * 等待条件满足
 * @param {Function} condition - 返回 boolean 的条件函数
 * @param {number} timeout - 超时时间（毫秒）
 * @param {number} interval - 检查间隔（毫秒）
 */
async function waitFor(condition, timeout = 5000, interval = 100) {
  const startTime = Date.now();
  while (Date.now() - startTime < timeout) {
    if (await condition()) {
      return true;
    }
    await new Promise(r => setTimeout(r, interval));
  }
  throw new Error(`Condition not met within ${timeout}ms`);
}
```

### 等待元素状态

```javascript
/**
 * 等待元素具有指定类名
 */
async function waitForClass(selector, className, timeout = 5000) {
  return waitFor(
    () => document.querySelector(selector)?.classList.contains(className),
    timeout
  );
}

/**
 * 等待元素不具有指定类名
 */
async function waitForNotClass(selector, className, timeout = 5000) {
  return waitFor(
    () => !document.querySelector(selector)?.classList.contains(className),
    timeout
  );
}
```

### 等待面板状态

```javascript
/**
 * 等待左侧边栏展开
 */
async function waitForLeftbarExpanded(timeout = 2000) {
  return waitFor(
    () => !document.querySelector('.adl-leftbar')?.classList.contains('adl-leftbar--collapsed'),
    timeout
  );
}

/**
 * 等待右侧面板展开
 */
async function waitForRightpanelExpanded(timeout = 2000) {
  return waitFor(
    () => !document.querySelector('.adl-rightpanel')?.classList.contains('adl-rightpanel--collapsed'),
    timeout
  );
}

/**
 * 等待工具面板激活
 * @param {string} toolId - 工具 ID (files/changes/browser/terminal/settings/communicate)
 */
async function waitForToolActive(toolId, timeout = 3000) {
  return waitFor(
    () => document.querySelector(`#${toolId}-panel`)?.classList.contains('is-active'),
    timeout
  );
}
```

### 等待菜单状态

```javascript
/**
 * 等待菜单打开
 * @param {string} menuId - 菜单 ID (file/view/help)
 */
async function waitForMenuOpen(menuId, timeout = 2000) {
  return waitFor(
    () => {
      // 汉堡菜单为单一 dropdown（无 data-menu-id 分区）
      return document.querySelector('.adl-hamburger__dropdown') !== null;
    },
    timeout
  );
}

/**
 * 等待所有菜单关闭
 */
async function waitForAllMenusClosed(timeout = 2000) {
  return waitFor(
    () => document.querySelectorAll('.adl-hamburger__dropdown').length === 0,
    timeout
  );
}
```

### 9. 错误通知（error toast）

```javascript
// 等待错误通知出现（右下角 .toast-card-region__group）
await page.waitForSelector('.toast-card-region__group .toast-card:not(.toast-card--summary)', { timeout: 5000 });

// 等待摘要出现（超过 5 条）
await page.waitForSelector('.toast-card--summary', { timeout: 3000 });

// 等待错误通知消失（被关闭或清空）
await page.waitForFunction(
  () => document.querySelectorAll('.toast-card-region__group .toast-card:not(.toast-card--summary)').length === 0,
  { timeout: 5000 }
);
```

## 超时建议

| 操作类型 | 建议超时 | 说明 |
|----------|----------|------|
| UI 动画 | 500-1000ms | 展开/折叠、过渡动画 |
| 本地操作 | 1000-3000ms | 切换面板、切换标签 |
| 文件系统 | 3000-5000ms | 读取文件、加载树 |
| 网络请求 | 10000-30000ms | API 调用、后端可达 |

## 注意事项

1. **避免过短超时**：网络请求和流式响应需要足够长的超时时间
2. **组合等待**：复杂操作可能需要多个等待条件组合
3. **错误恢复**：超时后检查是否有错误提示元素出现
4. **轮询间隔**：高频轮询（< 50ms）可能影响性能，建议 100-200ms
