# 独立对话列表

> 左侧边栏底部的独立对话列表区域。

## 布局结构

```
┌──────────────────────────────────────┐
│ 对话                    [展开] [+]   │
├──────────────────────────────────────┤
│ ○ 对话1 (处理中)                     │
│ ○ 对话2 (已完成)                     │
│ ● 对话3 (待审批) ← 当前激活          │
│ ○ ...                                │
│ ┌─ 归档 ─────────────────────┐      │
│ │ 📦 已归档对话1              │      │
│ └─────────────────────────────┘      │
├──────────────────────────────────────┤
│ ═══════════════════════════════════ │ ← 可拖拽调整高度
└──────────────────────────────────────┘
```

## 容器选择器

| 选择器 | 说明 |
|--------|------|
| `.adl-leftbar__nav--conversations` | 独立对话区容器 |
| `.adl-leftbar__conversation-body` | 对话列表内容区 |
| `.adl-leftbar__conversation-resize` | 高度调整手柄 |

---

## 工具栏

> 独立对话列表顶部的工具栏

### 元素

| 元素 | 选择器 | 说明 |
|------|--------|------|
| 标题 | `.adl-workspace-toolbar--conversation .adl-section-toolbar__label` | 显示 "对话" |
| 展开/折叠按钮 | `.adl-workspace-toolbar--conversation button[aria-label*="展开"], button[aria-label*="收起"]` | 展开/折叠对话列表 |
| 新建按钮 | `.adl-workspace-toolbar--conversation button[aria-label*="新建对话"]` | 新建独立对话 |

### 操作

#### 新建独立对话

```javascript
const newBtn = await page.waitForSelector('.adl-workspace-toolbar--conversation button[aria-label*="新建对话"]');
await newBtn.click();
```

#### 展开/折叠对话列表

```javascript
const toggleBtn = await page.waitForSelector('.adl-workspace-toolbar--conversation button');
await toggleBtn.click();
```

---

## 对话列表

> 独立对话列表（不绑定工作区的对话）

### 容器选择器

| 选择器 | 说明 |
|--------|------|
| `.adl-session-list--standalone` | 独立对话列表容器 |

### 对话项

独立对话项的样式和交互与会话项相同，详见 [sessions.md](./sessions.md)。

### 操作

#### 点击对话

```javascript
// 点击对话项切换到该对话
await page.click('.adl-session-list--standalone .adl-session-item:not(.is-active)');
```

#### 右键菜单

```javascript
// 右键点击对话项
await page.click('.adl-session-list--standalone .adl-session-item', { button: 'right' });
```

---

## 高度调整

> 独立对话区域支持拖拽调整高度

### 调整手柄

| 选择器 | 说明 |
|--------|------|
| `.adl-leftbar__conversation-resize` | 高度调整手柄 |

### 操作

```javascript
// 获取调整手柄
const handle = await page.waitForSelector('.adl-leftbar__conversation-resize');
const box = await handle.boundingBox();

// 开始拖拽
await page.mouse.move(box.x + box.width / 2, box.y);
await page.mouse.down();

// 向上拖动增加高度
await page.mouse.move(box.x + box.width / 2, box.y - 50);

// 释放
await page.mouse.up();
```

### 高度限制

| 属性 | 值 |
|------|-----|
| 最小高度 | 120px |
| 最大高度 | 内容区域剩余高度 |

---

## 折叠状态

> 独立对话区域支持折叠

### 状态

| 状态 | CSS 类名 | 说明 |
|------|----------|------|
| 展开 | - | 默认状态 |
| 折叠 | `.is-collapsed` | 只显示工具栏 |

### 检查状态

```javascript
const isCollapsed = await page.evaluate(() => {
  const nav = document.querySelector('.adl-leftbar__nav--conversations');
  return nav?.classList.contains('is-collapsed');
});
```

---

## 归档区

> 已归档的独立对话列表

### 定位选择器

| 选择器 | 说明 |
|--------|------|
| `.adl-session-list--standalone + .adl-archive` | 归档区容器 |

### 操作

与工作区会话归档区相同，详见 [workspaces.md](./workspaces.md#归档区)。

---

## 相关元素

| 元素 | 选择器 | 说明 |
|------|--------|------|
| 独立对话区 | `.adl-leftbar__nav--conversations` | 独立对话区域容器 |
| 对话列表 | `.adl-session-list--standalone` | 独立对话列表 |
| 对话项 | `.adl-session-list--standalone .adl-session-item` | 单个对话条目 |
| 调整手柄 | `.adl-leftbar__conversation-resize` | 高度调整手柄 |

## 注意事项

1. **独立对话**：不绑定工作区的对话，可在全局模式下使用
2. **高度持久化**：调整后的高度会保存到 localStorage
3. **折叠状态**：折叠后只显示工具栏，内容区隐藏
4. **与会话列表的区别**：独立对话列表没有工作区层级，直接显示对话项
