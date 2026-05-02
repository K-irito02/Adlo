# 终端工具面板

> 命令执行终端面板。

## 容器选择器

| 选择器 | 说明 |
|--------|------|
| `#terminal-panel` | 终端面板容器 |

---

## 标签栏

> 终端标签栏

### 定位选择器

| 优先级 | 类型 | 选择器 |
|--------|------|--------|
| 1 | CSS | `.adl-terminal-tabs` |

### 标签项

| 选择器 | 说明 |
|--------|------|
| `.adl-terminal-tab` | 单个标签 |
| `.adl-terminal-tab.is-active` | 激活标签 |

### 操作

#### 切换标签

```javascript
await page.click('.adl-terminal-tab:not(.is-active)');
```

#### 关闭标签

```javascript
await page.click('.adl-terminal-tab__close');
```

#### 新建标签

```javascript
await page.click('button[aria-label="新建终端"]');
```

---

## 命令输入

> 命令输入区域

### 定位选择器

| 优先级 | 类型 | 选择器 |
|--------|------|--------|
| 1 | CSS | `.adl-terminal-input` |

### 操作

```javascript
// 输入命令
await page.fill('.adl-terminal-input', 'npm test');

// 点击运行
await page.click('button[aria-label="运行"]');
```

---

## 命令输出

> 终端输出区域

### 定位选择器

| 优先级 | 类型 | 选择器 |
|--------|------|--------|
| 1 | CSS | `.adl-terminal-output` |

### 操作

#### 等待命令完成

```javascript
// 等待输出停止更新
await page.waitForFunction(() => {
  const output = document.querySelector('.adl-terminal-output');
  return output?.getAttribute('data-status') === 'completed';
});
```

---

## 相关元素

| 元素 | 选择器 | 说明 |
|------|--------|------|
| 终端面板 | `#terminal-panel` | 终端面板容器 |
| 标签栏 | `.adl-terminal-tabs` | 标签栏 |
| 命令输入 | `.adl-terminal-input` | 命令输入框 |
| 输出区 | `.adl-terminal-output` | 终端输出 |
