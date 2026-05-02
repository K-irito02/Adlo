# 工作区列表

> 左侧边栏的工作区列表和会话列表区域。

## 布局结构

```
┌──────────────────────────────────────┐
│ 项目                    [展开] [+]   │
├──────────────────────────────────────┤
│ 📂 工作区A                    [操作] │
│   ├─ 会话1 (处理中)                  │
│   ├─ 会话2 (已完成)                  │
│   └─ ...                             │
├──────────────────────────────────────┤
│ 📂 工作区B (当前)             [操作] │
│   ├─ 会话3 (待审批)                  │
│   └─ ...                             │
│   ┌─ 归档 ─────────────────────┐    │
│   │ 📦 已归档会话1              │    │
│   └─────────────────────────────┘    │
└──────────────────────────────────────┘
```

## 容器选择器

| 选择器 | 说明 |
|--------|------|
| `.adl-leftbar__nav` | 导航区容器 |
| `.adl-workspace-toolbar` | 工具栏（标题 + 操作按钮） |
| `.adl-workspace-list` | 工作区列表容器 |

---

## 工具栏

> 工作区列表顶部的工具栏

### 元素

| 元素 | 选择器 | 说明 |
|------|--------|------|
| 标题 | `.adl-section-toolbar__label` | 显示 "项目" |
| 展开/折叠按钮 | `.adl-section-toolbar__title button` | 展开/折叠所有工作区 |
| 新建按钮 | `.adl-workspace-toolbar button[aria-label*="新建"]` | 新建工作区 |

### 操作

#### 新建工作区

```javascript
const newBtn = await page.waitForSelector('.adl-workspace-toolbar button[aria-label*="新建"]');
await newBtn.click();
```

#### 展开/折叠所有工作区

```javascript
const toggleBtn = await page.waitForSelector('.adl-section-toolbar__title button');
await toggleBtn.click();
```

---

## 工作区项

> 单个工作区条目

### 定位选择器

| 优先级 | 类型 | 选择器 |
|--------|------|--------|
| 1 | CSS | `.adl-workspace-item` |
| 2 | CSS | `.adl-workspace-item.is-current` (当前工作区) |

### 结构

```
┌──────────────────────────────────────────────────┐
│ [图标] 工作区名称              [置顶] [展开] [+] │
└──────────────────────────────────────────────────┘
```

### 子元素选择器

| 选择器 | 说明 |
|--------|------|
| `.adl-workspace-row` | 工作区行容器 |
| `.adl-workspace-row__kind` | 图标区域 |
| `.adl-workspace-row__label` | 名称按钮 |
| `.adl-workspace-row__pin` | 置顶按钮 |
| `.adl-workspace-row__actions` | 操作按钮组 |
| `.adl-session-wrapper` | 会话列表容器 |

### 状态

| 状态 | CSS 类名 | 说明 |
|------|----------|------|
| 当前 | `.is-current` | 当前激活的工作区 |
| 展开 | `aria-expanded="true"` | 会话列表可见 |
| 折叠 | `aria-expanded="false"` | 会话列表隐藏 |
| 置顶 | - (通过 workspace.isPinned 判断) | 工作区被置顶 |

### 操作

#### 点击工作区

```javascript
// 点击工作区行（非当前工作区会切换到该工作区）
await page.click('.adl-workspace-item:not(.is-current) .adl-workspace-row');

// 点击当前工作区（展开/折叠会话列表）
await page.click('.adl-workspace-item.is-current .adl-workspace-row');
```

#### 展开/折叠会话列表

```javascript
// 点击展开按钮
const expandBtn = await page.waitForSelector('.adl-workspace-item .adl-icon-btn[aria-label*="展开"], .adl-workspace-item .adl-icon-btn[aria-label*="收起"]');
await expandBtn.click();
```

#### 置顶/取消置顶

```javascript
// 点击置顶按钮
const pinBtn = await page.waitForSelector('.adl-workspace-item .adl-workspace-row__pin');
await pinBtn.click();
```

#### 新建会话

```javascript
// 点击当前工作区的新建会话按钮
const newSessionBtn = await page.waitForSelector('.adl-workspace-item.is-current .adl-icon-btn[aria-label="新建会话"]');
await newSessionBtn.click();
```

#### 右键菜单

```javascript
// 右键点击工作区行
await page.click('.adl-workspace-row', { button: 'right' });
// 等待上下文菜单出现
await page.waitForSelector('.adl-sidebar-menu');
```

### 右键菜单项

| 菜单项 | 说明 |
|--------|------|
| 置顶/取消置顶 | 切换工作区置顶状态 |
| 全部标记已读 | 标记该工作区下所有会话为已读 |
| 归档全部 | 归档该工作区下所有会话 |
| 从侧边栏移除 | 从侧边栏移除该工作区 |
| 在文件管理器中显示 | 打开文件管理器定位到工作区目录 |

---

## 会话列表

> 工作区下的会话列表

### 容器选择器

| 选择器 | 说明 |
|--------|------|
| `.adl-session-wrapper` | 会话列表包装器 |
| `.adl-session-list` | 会话列表容器 |

### 会话项

> 单个会话条目

#### 定位选择器

| 优先级 | 类型 | 选择器 |
|--------|------|--------|
| 1 | CSS | `.adl-session-item` |
| 2 | CSS | `.adl-session-item.is-active` (当前激活会话) |

#### 子元素选择器

| 选择器 | 说明 |
|--------|------|
| `.adl-session-item__indicator` | 状态指示灯/置顶按钮 |
| `.adl-session-item__title` | 会话标题 |
| `.adl-session-item__meta` | 时间戳 |
| `.adl-session-item__actions` | 操作按钮组 |

#### 会话状态

| 状态 | CSS 类名 | 颜色 | 说明 |
|------|----------|------|------|
| 处理中 | `.adl-status-lamp--processing` | 蓝色动画 | Agent 正在处理 |
| 待审批 | `.adl-status-lamp--pending-approval` | 橙色 | 等待用户审批 |
| 异常 | `.adl-status-lamp--abnormal` | 红色 | 执行出错 |
| 已完成 | `.adl-status-lamp--completed` | 绿色 | 正常完成 |
| 已读 | `.adl-status-lamp--read` | 灰色 | 已读状态 |

#### 操作

##### 点击会话

```javascript
// 点击会话项切换到该会话
await page.click('.adl-session-item:not(.is-active)');
// 等待激活状态变化
await page.waitForSelector('.adl-session-item.is-active');
```

##### 悬停显示操作按钮

```javascript
// 悬停会话项
const sessionItem = await page.waitForSelector('.adl-session-item');
await sessionItem.hover();
// 等待操作按钮出现
await page.waitForSelector('.adl-session-item__actions');
```

##### 归档会话

```javascript
// 悬停会话项
await page.hover('.adl-session-item');
// 点击归档按钮
const archiveBtn = await page.waitForSelector('.adl-session-item__actions button[aria-label*="归档"]');
await archiveBtn.click();
```

##### 右键菜单

```javascript
// 右键点击会话项
await page.click('.adl-session-item', { button: 'right' });
// 等待上下文菜单出现
await page.waitForSelector('.adl-sidebar-menu');
```

##### 双击重命名

```javascript
// 双击会话项进入重命名模式
await page.dblclick('.adl-session-item');
// 等待输入框出现
await page.waitForSelector('.adl-session-item__rename');
// 输入新名称
await page.fill('.adl-session-item__rename', '新会话名称');
// 按 Enter 确认
await page.keyboard.press('Enter');
```

#### 右键菜单项

| 菜单项 | 说明 |
|--------|------|
| 重命名 | 进入重命名模式 |
| 标记已读/未读 | 切换会话已读状态 |
| 归档 | 归档该会话 |
| 复制会话 ID | 复制会话 ID 到剪贴板 |
| 导出对话 | 导出对话为 Markdown 文件 |
| 置顶/取消置顶 | 切换会话置顶状态 |
| 删除 | 删除该会话（危险操作） |

---

## 归档区

> 已归档会话列表

### 定位选择器

| 优先级 | 类型 | 选择器 |
|--------|------|--------|
| 1 | CSS | `.adl-archive` |

### 操作

#### 展开/折叠归档区

```javascript
// 点击归档区标题展开/折叠
await page.click('.adl-archive summary');
```

#### 查看归档会话

```javascript
// 点击归档会话项
await page.click('.adl-archive .adl-session-item--archived');
```

---

## 拖拽排序

> 工作区和会话支持拖拽排序

### 拖拽工作区

```javascript
// 开始拖拽
const workspace = await page.waitForSelector('.adl-workspace-item');
await workspace.hover();
await page.mouse.down();

// 拖动到目标位置
const target = await page.waitForSelector('.adl-workspace-item:nth-child(2)');
const targetBox = await target.boundingBox();
await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2);

// 释放
await page.mouse.up();
```

### 拖拽会话

```javascript
// 开始拖拽
const session = await page.waitForSelector('.adl-session-item');
await session.hover();
await page.mouse.down();

// 拖动到目标位置
const target = await page.waitForSelector('.adl-session-item:nth-child(2)');
const targetBox = await target.boundingBox();
await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2);

// 释放
await page.mouse.up();
```

### 拖拽状态

| 状态 | CSS 类名 | 说明 |
|------|----------|------|
| 拖拽中 | `.is-dragging` | 正在被拖拽的元素 |
| 放置目标 | `.is-drop-target` | 可放置的目标位置 |
