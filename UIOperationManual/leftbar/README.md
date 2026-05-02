# 左侧边栏区域

> 左侧边栏包含快捷操作、工作区列表、会话列表和独立对话列表。

## 布局结构

```
┌──────────────┐
│  [10] Quick  │
│   Actions    │
├──────────────┤
│  [11] Work-  │
│  spaces &    │
│   Sessions   │
│              │
│              │
├──────────────┤
│  [12] Con-   │
│ versations   │
│              │
├──────────────┤
│ [13] Resize  │
│    Handle    │
└──────────────┘
```

## 元素索引

| 编号 | 名称 | 文档 | 说明 |
|------|------|------|------|
| [10] | Quick Actions | [quick-actions.md](./quick-actions.md) | 快捷操作按钮（技能、MCP） |
| [11] | Workspaces & Sessions | [workspaces.md](./workspaces.md) | 工作区列表与会话列表 |
| [12] | Conversations | [conversations.md](./conversations.md) | 独立对话列表 |
| [13] | Resize Handle | - | 宽度调整手柄 |

## 容器选择器

| 选择器 | 说明 |
|--------|------|
| `.adl-leftbar` | 左侧边栏容器 |
| `.adl-leftbar__content` | 内容区域（可滚动） |
| `.adl-leftbar--collapsed` | 折叠状态 |

## 子区域选择器

| 选择器 | 说明 |
|--------|------|
| `.adl-leftbar__quick` | 快捷操作区 |
| `.adl-leftbar__nav` | 导航区（工作区/对话） |
| `.adl-leftbar__conversation-resize` | 对话区域高度调整手柄 |

## 快速操作

### 展开左侧边栏

```javascript
// 如果左侧边栏已折叠，点击切换按钮
const isCollapsed = await page.evaluate(() => {
  return document.querySelector('.adl-leftbar')?.classList.contains('adl-leftbar--collapsed');
});

if (isCollapsed) {
  await page.click('button[aria-label="切换左侧边栏"]');
  await page.waitForSelector('.adl-leftbar:not(.adl-leftbar--collapsed)');
}
```

### 创建新会话

```javascript
// 找到当前工作区旁的新建按钮
const newSessionBtn = await page.waitForSelector('.adl-workspace-item.is-current .adl-icon-btn[aria-label="新建会话"]');
await newSessionBtn.click();
```

### 切换会话

```javascript
// 点击会话项
await page.click('.adl-session-item:not(.is-active)');
// 等待激活状态变化
await page.waitForSelector('.adl-session-item.is-active');
```

### 调整侧边栏宽度

```javascript
// 拖拽调整手柄
const handle = await page.waitForSelector('.adl-leftbar__resize-handle');
const box = await handle.boundingBox();
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
await page.mouse.down();
await page.mouse.move(box.x + 100, box.y + box.height / 2); // 向右移动 100px
await page.mouse.up();
```

## 状态

### 折叠状态

| 状态 | CSS 类名 | aria 属性 | 说明 |
|------|----------|-----------|------|
| 展开 | - | `aria-hidden="false"` | 默认状态 |
| 折叠 | `.adl-leftbar--collapsed` | `aria-hidden="true"` | 隐藏内容 |

### 宽度限制

| 属性 | CSS 变量 | 默认值 |
|------|----------|--------|
| 最小宽度 | `--leftbar-width-min` | 180px |
| 默认宽度 | `--leftbar-width` | 180px |
| 最大宽度 | `--leftbar-width-max` | 360px |

## 注意事项

1. **折叠状态**：折叠时内容不可见，但 DOM 仍存在
2. **异步加载**：工作区和会话列表可能需要等待加载
3. **拖拽排序**：会话项支持拖拽排序，拖拽时有 `.is-dragging` 类
4. **右键菜单**：工作区和会话项支持右键上下文菜单
5. **双击重命名**：会话项支持双击进入重命名模式
