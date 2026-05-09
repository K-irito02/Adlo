# 会话列表

> 工作区下的会话列表详细操作说明。

> **注意**：会话列表的主要操作已在 [workspaces.md](./workspaces.md#会话列表) 中说明。
> 本文档补充会话列表的特殊操作和状态说明。

## 会话项状态详解

### 状态指示灯

会话项左侧的状态指示灯反映会话当前状态：

| 状态 | CSS 类名 | 视觉表现 | 含义 |
|------|----------|----------|------|
| processing | `.adl-status-lamp--processing` | 蓝色脉冲动画 | Agent 正在处理请求 |
| pending-approval | `.adl-status-lamp--pending-approval` | 橙色静态 | 等待用户审批操作 |
| abnormal | `.adl-status-lamp--abnormal` | 红色静态 | 执行过程中出错 |
| completed | `.adl-status-lamp--completed` | 绿色静态 | 正常完成 |
| read | `.adl-status-lamp--read` | 灰色静态 | 已读状态 |

### 检查会话状态

```javascript
const status = await page.evaluate((sessionItem) => {
  const lamp = sessionItem.querySelector('.adl-status-lamp');
  const classes = lamp?.className.split(' ') || [];
  const statusClass = classes.find(c => c.startsWith('adl-status-lamp--'));
  return statusClass?.replace('adl-status-lamp--', '') || 'unknown';
}, sessionItem);
```

## 会话项交互

### 悬停行为

悬停会话项时：

1. 状态指示灯变为置顶按钮
2. 时间戳隐藏，操作按钮显示
3. 显示 Tooltip（会话标题）

```javascript
// 悬停会话项
await page.hover('.adl-session-item');

// 等待操作按钮出现
await page.waitForSelector('.adl-session-item__actions', { visible: true });

// 点击置顶按钮
const pinBtn = await page.waitForSelector('.adl-session-item__indicator button');
await pinBtn.click();
```

### 激活会话

激活会话的特征：

- 添加 `.is-active` 类
- 背景色高亮
- 右侧面板显示会话详情
- 旧消息内容在新会话详情准备完成前保持可见，不应先清空成空白区域

```javascript
// 检查是否为激活会话
const isActive = await page.evaluate((item) => {
  return item.classList.contains('is-active');
}, sessionItem);
```

### 切换连续性约定

1. 点击会话后，左侧激活态必须立即切换。
2. 会话详情刷新期间不得出现整屏闪烁、空白壳层或显式 `loading` 文案。
3. 连续快速切换多个会话时，只允许最后一次点击生效；过期请求返回后不得覆盖当前会话。

## 会话限制控制

当会话数量超过显示限制时，显示"展开更多"按钮：

### 定位选择器

| 选择器 | 说明 |
|--------|------|
| `.adl-session-list__limit-item` | 限制控制容器 |
| `.adl-session-list__limit` | 展开/折叠按钮 |

### 操作

```javascript
// 展开更多会话
await page.click('.adl-session-list__limit');

// 折叠会话列表
await page.click('.adl-session-list__limit');
```

## 会话右键菜单

右键点击会话项显示上下文菜单：

### 菜单项选择器

| 菜单项 | 选择器 |
|--------|--------|
| 重命名 | `.adl-sidebar-menu__item` (包含 "重命名" 文本) |
| 标记已读 | `.adl-sidebar-menu__item` (包含 "标记已读" 文本) |
| 标记未读 | `.adl-sidebar-menu__item` (包含 "标记未读" 文本) |
| 归档 | `.adl-sidebar-menu__item` (包含 "归档" 文本) |
| 复制会话 ID | `.adl-sidebar-menu__item` (包含 "复制" 文本) |
| 导出对话 | `.adl-sidebar-menu__item` (包含 "导出" 文本) |
| 置顶 | `.adl-sidebar-menu__item` (包含 "置顶" 文本) |
| 取消置顶 | `.adl-sidebar-menu__item` (包含 "取消置顶" 文本) |
| 删除 | `.adl-sidebar-menu__item.is-danger` (包含 "删除" 文本) |

### 操作示例

```javascript
// 右键点击会话
await page.click('.adl-session-item', { button: 'right' });

// 等待菜单出现
const menu = await page.waitForSelector('.adl-sidebar-menu');

// 点击归档
await menu.click('.adl-sidebar-menu__item:has-text("归档")');

// 等待菜单关闭
await page.waitForSelector('.adl-sidebar-menu', { hidden: true });
```

## 重命名会话

### 进入重命名模式

```javascript
// 方式1：双击会话项
await page.dblclick('.adl-session-item');

// 方式2：右键菜单选择重命名
await page.click('.adl-session-item', { button: 'right' });
await page.click('.adl-sidebar-menu__item:has-text("重命名")');
```

### 重命名输入框

| 选择器 | 说明 |
|--------|------|
| `.adl-session-item__rename` | 重命名输入框 |

### 操作

```javascript
// 等待输入框出现
const input = await page.waitForSelector('.adl-session-item__rename');

// 清空并输入新名称
await input.fill('新会话名称');

// 按 Enter 确认
await input.press('Enter');

// 或按 Escape 取消
await input.press('Escape');

// 或点击外部区域确认
await page.click('.adl-session-list');
```

## 拖拽排序

### 拖拽状态

| 状态 | CSS 类名 | 说明 |
|------|----------|------|
| 拖拽中 | `.is-dragging` | 正在被拖拽的会话项 |
| 放置目标 | `.is-drop-target` | 可放置的目标位置 |
| 放置闪烁 | `.is-drop-flash` | 放置后的闪烁效果 |

### 拖拽操作

```javascript
// 获取源会话和目标会话
const sourceItem = await page.waitForSelector('.adl-session-item:nth-child(1)');
const targetItem = await page.waitForSelector('.adl-session-item:nth-child(3)');

// 获取边界框
const sourceBox = await sourceItem.boundingBox();
const targetBox = await targetItem.boundingBox();

// 开始拖拽
await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2);
await page.mouse.down();

// 拖动到目标
await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2);

// 等待放置目标状态
await page.waitForSelector('.adl-session-item.is-drop-target');

// 释放
await page.mouse.up();

// 等待闪烁效果
await page.waitForSelector('.adl-session-item.is-drop-flash');
```

## 置顶会话

置顶的会话会显示在列表顶部：

### 检查置顶状态

```javascript
const isPinned = await page.evaluate((item) => {
  const btn = item.querySelector('.adl-session-item__indicator button');
  return btn?.getAttribute('aria-label')?.includes('取消置顶');
}, sessionItem);
```

### 切换置顶状态

```javascript
// 悬停会话项
await page.hover('.adl-session-item');

// 点击置顶按钮
const pinBtn = await page.waitForSelector('.adl-session-item__indicator button');
await pinBtn.click();
```

## 相关元素

| 元素 | 选择器 | 说明 |
|------|--------|------|
| 会话列表 | `.adl-session-list` | 会话列表容器 |
| 会话项 | `.adl-session-item` | 单个会话条目 |
| 状态灯 | `.adl-status-lamp` | 状态指示灯 |
| 操作按钮 | `.adl-session-item__actions` | 操作按钮组 |
| 上下文菜单 | `.adl-sidebar-menu` | 右键菜单 |
