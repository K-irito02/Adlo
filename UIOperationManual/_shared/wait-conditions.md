# 通用等待条件模板

> 本文档定义 UI 自动化测试中常用的等待条件模板。

## 等待类型

### 1. 元素出现/消失

```javascript
// 等待元素出现
await page.waitForSelector('.adl-message--assistant', { timeout: 10000 });

// 等待元素消失
await page.waitForSelector('.adl-loading', { hidden: true, timeout: 5000 });

// 等待元素可见
await page.waitForSelector('.adl-menu__dropdown', { visible: true, timeout: 3000 });
```

### 2. 状态变化

```javascript
// 等待元素变为可用
await page.waitForFunction(
  selector => !document.querySelector(selector)?.disabled,
  '[data-testid="composer-send"]',
  { timeout: 5000 }
);

// 等待元素变为激活
await page.waitForFunction(
  selector => document.querySelector(selector)?.classList.contains('is-active'),
  '.adl-session-item',
  { timeout: 3000 }
);
```

### 3. 内容变化

```javascript
// 等待文本出现
await page.waitForFunction(
  (selector, text) => document.querySelector(selector)?.textContent?.includes(text),
  '.adl-message--assistant p',
  '完成',
  { timeout: 30000 }
);

// 等待输入框清空
await page.waitForFunction(
  selector => document.querySelector(selector)?.textContent === '',
  '.adl-composer__input',
  { timeout: 3000 }
);
```

### 4. 网络请求

```javascript
// 等待响应完成（需要监听网络事件）
await page.waitForResponse(response => 
  response.url().includes('/api/chat') && response.status() === 200,
  { timeout: 60000 }
);
```

## 常用等待条件

### 标题栏操作

| 操作 | 等待条件 | 超时建议 |
|------|----------|----------|
| 打开菜单 | `.adl-menu__dropdown` 可见 | 1000ms |
| 切换主题 | `:root` 的 `data-theme` 属性变化 | 1000ms |
| 切换语言 | 文本内容变化 | 1000ms |
| 打开工作区 | `.adl-leftbar` 不再是 `.adl-leftbar--empty` | 5000ms |

### 左侧边栏操作

| 操作 | 等待条件 | 超时建议 |
|------|----------|----------|
| 展开工作区 | `.adl-session-list` 在工作区项内可见 | 1000ms |
| 切换会话 | `.adl-session-item.is-active` 更新 | 1000ms |
| 创建会话 | 新 `.adl-session-item` 出现 | 3000ms |
| 归档会话 | 会话项从列表消失 | 2000ms |
| 拖拽排序 | `.is-dragging` 类出现/消失 | 500ms |

### 中心面板操作

| 操作 | 等待条件 | 超时建议 |
|------|----------|----------|
| 发送消息 | `.adl-message--user` 出现 | 2000ms |
| 开始响应 | `.adl-message--assistant.adl-message--streaming` 出现 | 10000ms |
| 响应完成 | `.adl-message--streaming` 类消失 | 60000ms+ |
| 停止生成 | 发送按钮从 `.adl-action-btn--danger` 变为 `.adl-action-btn--primary` | 2000ms |
| 错误提示 | `.adl-action-btn--warning` 出现 | 5000ms |

### 右侧面板操作

| 操作 | 等待条件 | 超时建议 |
|------|----------|----------|
| 切换工具 | `[role="tabpanel"].is-active` 更新 | 1000ms |
| 加载文件树 / 文档大纲 | `.adl-filetree, .adl-outline-tree` 内容出现 | 3000ms |
| 加载文件内容 | Monaco editor 模型加载 | 5000ms |
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

### 等待消息流

```javascript
/**
 * 等待助手响应开始
 */
async function waitForAssistantResponse(timeout = 10000) {
  return waitFor(
    () => document.querySelector('.adl-message--assistant.adl-message--streaming'),
    timeout
  );
}

/**
 * 等待助手响应完成
 */
async function waitForAssistantResponseComplete(timeout = 60000) {
  return waitFor(
    () => !document.querySelector('.adl-message--streaming'),
    timeout
  );
}

/**
 * 等待新消息出现
 * @param {number} currentCount - 当前消息数量
 */
async function waitForNewMessage(currentCount, timeout = 10000) {
  return waitFor(
    () => document.querySelectorAll('.adl-message').length > currentCount,
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
 * @param {string} toolId - 工具 ID (files/changes/browser/terminal/audit/models/settings)
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
      const menu = document.querySelector(`.adl-menu[data-menu-id="${menuId}"]`);
      return menu?.querySelector('.adl-menu__dropdown') !== null;
    },
    timeout
  );
}

/**
 * 等待所有菜单关闭
 */
async function waitForAllMenusClosed(timeout = 2000) {
  return waitFor(
    () => document.querySelectorAll('.adl-menu__dropdown').length === 0,
    timeout
  );
}
```

## 超时建议

| 操作类型 | 建议超时 | 说明 |
|----------|----------|------|
| UI 动画 | 500-1000ms | 展开/折叠、过渡动画 |
| 本地操作 | 1000-3000ms | 切换面板、创建会话 |
| 文件系统 | 3000-5000ms | 读取文件、加载树 |
| 网络请求 | 10000-30000ms | API 调用、模型响应 |
| 流式响应 | 60000ms+ | 长文本生成 |

## 注意事项

1. **避免过短超时**：网络请求和流式响应需要足够长的超时时间
2. **组合等待**：复杂操作可能需要多个等待条件组合
3. **错误恢复**：超时后检查是否有错误提示元素出现
4. **轮询间隔**：高频轮询（< 50ms）可能影响性能，建议 100-200ms
