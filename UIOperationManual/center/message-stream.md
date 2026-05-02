# 消息流

> 中心面板的消息流区域，显示用户和助手的对话消息。

## 容器选择器

| 选择器 | 说明 |
|--------|------|
| `.adl-center__body` | 消息流容器 |
| `.adl-message-stream` | 消息流列表 |
| `.adl-center__empty` | 空消息状态容器 |

---

## 欢迎页

> 无消息时显示的欢迎页面

### 定位选择器

| 优先级 | 类型 | 选择器 |
|--------|------|--------|
| 1 | CSS | `.adl-welcome--panel` |
| 2 | CSS | `.adl-center__empty` |

### 结构

```
┌────────────────────────────────────────────────────────────┐
│ 最近打开的工作空间                                         │
│ ┌────────────────────────────────────────────────────────┐ │
│ │ 📂 项目A    /path/to/projectA                         │ │
│ │ 📂 项目B    /path/to/projectB                         │ │
│ └────────────────────────────────────────────────────────┘ │
│                                                            │
│ [新建对话] [打开工作空间]                                  │
│                                                            │
│ 💡 快速开始提示                                            │
│ • 拖拽文件夹到窗口即可打开                                 │
│ • 使用 Ctrl+O 快速打开                                     │
└────────────────────────────────────────────────────────────┘
```

### 子元素选择器

| 选择器 | 说明 |
|--------|------|
| `.adl-welcome__recent` | 最近工作区区域 |
| `.adl-welcome__recent-list` | 最近工作区列表 |
| `.adl-welcome__actionsbar` | 操作按钮栏 |
| `.adl-welcome__hints` | 提示区域 |

### 操作

#### 打开最近工作区

```javascript
// 点击最近工作区项
await page.click('.adl-welcome__recent-list button');
```

#### 新建对话

```javascript
await page.click('.adl-welcome__actionsbar button:has-text("新建对话")');
```

#### 打开工作空间

```javascript
await page.click('.adl-welcome__actionsbar button:has-text("打开工作空间")');
```

---

## 消息项

> 单条消息

### 定位选择器

| 优先级 | 类型 | 选择器 |
|--------|------|--------|
| 1 | CSS | `.adl-message` |
| 2 | CSS | `.adl-message--user` (用户消息) |
| 3 | CSS | `.adl-message--assistant` (助手消息) |
| 4 | CSS | `.adl-message--streaming` (流式输出中) |

### 结构

```
┌────────────────────────────────────────────────────────────┐
│ user                                    14:30             │
│ 你好                                                       │
└────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────┐
│ assistant                          🧠 生成中               │
│ 你好！有什么可以帮助你的？                                  │
│ [Run Summary]                                              │
└────────────────────────────────────────────────────────────┘
```

### 子元素选择器

| 选择器 | 说明 |
|--------|------|
| `.adl-message header` | 消息头部（角色 + 时间） |
| `.adl-message p` | 消息内容 |
| `.adl-agent-status` | 助手状态标签 |

### 消息类型

| 类型 | CSS 类名 | 说明 |
|------|----------|------|
| 用户消息 | `.adl-message--user` | 用户发送的消息 |
| 助手消息 | `.adl-message--assistant` | 助手回复的消息 |
| 流式消息 | `.adl-message--streaming` | 正在流式输出的消息 |

### 助手状态

| 状态 | CSS 类名 | 图标 | 说明 |
|------|----------|------|------|
| 思考中 | `.adl-agent-status--thinking` | 🧠 | Agent 正在思考 |
| 生成中 | `.adl-agent-status--processing` | 🧠 | Agent 正在生成 |
| 执行中 | - | - | Agent 正在执行命令 |
| 等待审批 | - | 🛡️ | 等待用户审批 |

### 操作

#### 等待消息出现

```javascript
// 等待用户消息
await page.waitForSelector('.adl-message--user');

// 等待助手消息
await page.waitForSelector('.adl-message--assistant');

// 等待流式消息完成
await page.waitForSelector('.adl-message--streaming', { hidden: true });
```

#### 获取消息内容

```javascript
const messages = await page.evaluate(() => {
  const items = document.querySelectorAll('.adl-message');
  return Array.from(items).map(item => ({
    role: item.classList.contains('adl-message--user') ? 'user' : 'assistant',
    content: item.querySelector('p')?.textContent || '',
    isStreaming: item.classList.contains('adl-message--streaming')
  }));
});
```

---

## Run Summary

> 助手消息下方的运行摘要块

### 定位选择器

| 优先级 | 类型 | 选择器 |
|--------|------|--------|
| 1 | CSS | `.adl-run-summary` |

### 结构

```
┌────────────────────────────────────────────────────────────┐
│ ▶ Run Summary                                    [展开]   │
│   Steps: 3 | Tokens: 1234 | Duration: 5.2s               │
└────────────────────────────────────────────────────────────┘
```

### 操作

#### 展开/折叠

```javascript
// 点击展开
await page.click('.adl-run-summary__header');

// 等待内容展开
await page.waitForSelector('.adl-run-summary__content');
```

---

## 审批提示

> 等待用户审批时显示的提示

### 定位选择器

| 优先级 | 类型 | 选择器 |
|--------|------|--------|
| 1 | CSS | `.adl-center__approval-hint` |

### 内容

显示 "等待审批" 提示，包含盾牌图标。

### 操作

审批操作在审批卡片中进行，详见 [审批卡片](#审批卡片)。

---

## 审批卡片

> 内联审批卡片

### 定位选择器

| 优先级 | 类型 | 选择器 |
|--------|------|--------|
| 1 | CSS | `.adl-inline-approval` |
| 2 | CSS | `.adl-approval-card` |

### 结构

```
┌────────────────────────────────────────────────────────────┐
│ ❓ 执行命令                              [中风险]          │
│ 将执行 npm install 命令                                    │
│ • 安装项目依赖                                             │
│                                                            │
│ [批准] [拒绝]                                              │
└────────────────────────────────────────────────────────────┘
```

### 子元素选择器

| 选择器 | 说明 |
|--------|------|
| `.adl-inline-approval__title` | 审批标题 |
| `.adl-chip--warning` | 风险级别标签 |
| `.adl-inline-approval__actions` | 操作按钮组 |

### 操作

#### 批准审批

```javascript
await page.click('.adl-inline-approval__actions button:has-text("批准")');
```

#### 拒绝审批

```javascript
await page.click('.adl-inline-approval__actions button:has-text("拒绝")');
```

---

## 自动滚动

消息流支持自动滚动到底部：

### 触发条件

- 新用户消息出现
- 新助手消息出现
- 流式消息更新

### 手动滚动

```javascript
// 滚动到底部
await page.evaluate(() => {
  const stream = document.querySelector('.adl-center__body');
  if (stream) {
    stream.scrollTo({ top: stream.scrollHeight, behavior: 'smooth' });
  }
});
```

---

## 相关元素

| 元素 | 选择器 | 说明 |
|------|--------|------|
| 消息流容器 | `.adl-center__body` | 消息流滚动容器 |
| 消息列表 | `.adl-message-stream` | 消息列表容器 |
| 消息项 | `.adl-message` | 单条消息 |
| 用户消息 | `.adl-message--user` | 用户发送的消息 |
| 助手消息 | `.adl-message--assistant` | 助手回复的消息 |
| 流式消息 | `.adl-message--streaming` | 正在流式输出的消息 |
| 运行摘要 | `.adl-run-summary` | 运行摘要块 |
| 审批卡片 | `.adl-inline-approval` | 内联审批卡片 |
