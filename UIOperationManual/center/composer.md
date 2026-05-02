# Composer（输入区域）

> 中心面板的输入区域，包含上下文标签、输入框和操作按钮。

## 容器选择器

| 选择器 | 说明 |
|--------|------|
| `.adl-composer` | Composer 容器 |
| `.adl-composer__inner` | 内部容器（输入框 + 按钮） |
| `.adl-composer__editor` | 编辑器容器 |

---

## 上下文标签

> 输入框上方的上下文标签区域

### 定位选择器

| 优先级 | 类型 | 选择器 |
|--------|------|--------|
| 1 | CSS | `.adl-composer__chips` |
| 2 | CSS | `.adl-chip` |

### 标签类型

| 类型 | CSS 类名 | 说明 |
|------|----------|------|
| 模式 | `.adl-chip--plan` | 计划模式 |
| 模式 | `.adl-chip--debug` | 调试模式 |
| 模式 | `.adl-chip--ask` | 提问模式 |
| 文件 | `.adl-chip--file` | 引用文件 |
| 技能 | `.adl-chip--skill` | 添加技能 |
| MCP | `.adl-chip--mcp` | MCP 服务 |

### 操作

#### 移除标签

```javascript
// 点击标签的移除按钮
await page.click('.adl-chip button');
```

---

## 添加上下文按钮

> 左侧的添加上下文按钮

### 定位选择器

| 优先级 | 类型 | 选择器 |
|--------|------|--------|
| 1 | aria-label | `button[aria-label*="添加上下文"]` |
| 2 | CSS | `.adl-composer__left button` |

### 操作

```javascript
// 点击添加上下文按钮
await page.click('.adl-composer__left button');

// 等待弹出框出现
await page.waitForSelector('.adl-context-popover');
```

---

## 上下文弹出框

> 添加上下文的弹出框

### 定位选择器

| 优先级 | 类型 | 选择器 |
|--------|------|--------|
| 1 | CSS | `.adl-context-popover` |

### 结构

```
┌────────────────────────────────────────┐
│ 添加上下文                             │
├────────────────────────────────────────┤
│ 交互模式                               │
│ ┌────────────────────────────────────┐ │
│ │ 📋 计划                            │ │
│ │ 🐛 调试                            │ │
│ │ ❓ 提问                            │ │
│ └────────────────────────────────────┘ │
├────────────────────────────────────────┤
│ 模型与能力                             │
│ ┌────────────────────────────────────┐ │
│ │ 💻 选择模型                        │ │
│ │ ✨ 添加技能                        │ │
│ │ 🔌 MCP 服务                        │ │
│ │ 🖼️ 添加图片                        │ │
│ └────────────────────────────────────┘ │
├────────────────────────────────────────┤
│ 上下文引用                             │
│ ┌────────────────────────────────────┐ │
│ │ 📄 引用文件                        │ │
│ │ 📖 引用文档                        │ │
│ │ 🔗 引用网页                        │ │
│ │ 🗄️ 引用代码库                     │ │
│ └────────────────────────────────────┘ │
└────────────────────────────────────────┘
```

### 子元素选择器

| 选择器 | 说明 |
|--------|------|
| `.adl-context-popover header` | 标题 |
| `.adl-context-popover section` | 分组 |
| `.adl-context-popover h5` | 分组标题 |
| `.adl-context-item` | 上下文选项 |

### 操作

#### 选择交互模式

```javascript
// 打开弹出框
await page.click('.adl-composer__left button');
await page.waitForSelector('.adl-context-popover');

// 选择计划模式
await page.click('.adl-context-item:has-text("计划")');
```

#### 添加上下文引用

```javascript
// 打开弹出框
await page.click('.adl-composer__left button');
await page.waitForSelector('.adl-context-popover');

// 选择引用文件
await page.click('.adl-context-item:has-text("引用文件")');
```

---

## 输入框

> 文本输入区域

### 定位选择器

| 优先级 | 类型 | 选择器 |
|--------|------|--------|
| 1 | data-testid | `[data-testid="composer-input"]` |
| 2 | CSS | `.adl-composer__input` |

### 属性

| 属性 | 值 |
|------|-----|
| role | `textbox` |
| aria-multiline | `false` |
| contenteditable | `true` |

### 操作

#### 输入文本

```javascript
// 方式1：使用 fill
await page.fill('[data-testid="composer-input"]', '你好');

// 方式2：使用 type（模拟键盘输入）
await page.click('[data-testid="composer-input"]');
await page.type('[data-testid="composer-input"]', '你好');
```

#### 清空输入

```javascript
await page.fill('[data-testid="composer-input"]', '');
```

#### 获取输入内容

```javascript
const content = await page.evaluate(() => {
  const input = document.querySelector('[data-testid="composer-input"]');
  return input?.textContent || '';
});
```

#### 按 Enter 发送

```javascript
await page.click('[data-testid="composer-input"]');
await page.keyboard.press('Enter');
```

#### 按 Shift+Enter 换行

```javascript
await page.keyboard.down('Shift');
await page.keyboard.press('Enter');
await page.keyboard.up('Shift');
```

---

## 操作按钮

> 输入框右侧的操作按钮

### 按钮列表

| 按钮 | 选择器 | 说明 |
|------|--------|------|
| 语音 | `.adl-composer__right button[aria-label="Voice"]` | 语音输入（禁用） |
| 发送 | `[data-testid="composer-send"].adl-action-btn--primary` | 发送消息 |
| 停止 | `[data-testid="composer-send"].adl-action-btn--danger` | 停止生成 |
| 重试 | `[data-testid="composer-send"].adl-action-btn--warning` | 重试发送 |

### 发送按钮状态

| 状态 | CSS 类名 | aria-label | 图标 | 说明 |
|------|----------|------------|------|------|
| 可发送 | `.adl-action-btn--primary` | "发送" | ↑ | 输入有内容 |
| 停止 | `.adl-action-btn--danger` | "停止生成" | ⏹ | 正在生成 |
| 重试 | `.adl-action-btn--warning` | "重试" | ↻ | 发送失败 |
| 禁用 | `:disabled` | - | - | 输入为空 |

### 操作

#### 发送消息

```javascript
// 输入内容
await page.fill('[data-testid="composer-input"]', '你好');

// 点击发送按钮
await page.click('[data-testid="composer-send"]');

// 等待消息发送
await page.waitForSelector('.adl-message--user');
```

#### 停止生成

```javascript
// 点击停止按钮
await page.click('[data-testid="composer-send"]');

// 等待流式消息停止
await page.waitForSelector('.adl-message--streaming', { hidden: true });
```

#### 重试发送

```javascript
// 点击重试按钮
await page.click('[data-testid="composer-send"]');
```

---

## 状态栏

> Composer 底部的内联状态栏

详见 [statusbar.md](./statusbar.md)。

---

## 快捷键

| 快捷键 | 功能 |
|--------|------|
| `Enter` | 发送消息 |
| `Shift+Enter` | 换行 |
| `Escape` | 停止生成（生成中时） |

---

## 相关元素

| 元素 | 选择器 | 说明 |
|------|--------|------|
| Composer 容器 | `.adl-composer` | 输入区域容器 |
| 上下文标签 | `.adl-composer__chips` | 标签区域 |
| 输入框 | `[data-testid="composer-input"]` | 文本输入框 |
| 发送按钮 | `[data-testid="composer-send"]` | 发送/停止/重试按钮 |
| 上下文弹出框 | `.adl-context-popover` | 添加上下文弹出框 |
