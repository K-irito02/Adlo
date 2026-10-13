# 右侧面板区域

> 右侧面板包含工具切换器和多个工具面板。

## 布局结构

```
┌────────────────────────────────────────┐
│ [14] Tool Switcher                     │
│ [文件|变更|浏览器|终端|设置]           │
├────────────────────────────────────────┤
│ [17] Tool Panel Content                │
│                                        │
│  (当前激活的工具面板内容)              │
│                                        │
│                                        │
│                                        │
│                                        │
└────────────────────────────────────────┘
```

## 元素索引

| 编号 | 名称 | 文档 | 说明 |
|------|------|------|------|
| [14] | Tool Switcher | [tool-switcher.md](./tool-switcher.md) | 工具切换标签栏 |
| [17] | Tool Panel Content | [tools/](./tools/) | 工具面板内容区域 |

## 工具面板索引

| 工具 ID | 名称 | 文档 | 说明 |
|---------|------|------|------|
| `files` | 文件 | [tools/files.md](./tools/files.md) | 文件浏览器、编辑器 |
| `changes` | 变更 | [tools/changes.md](./tools/changes.md) | Git 变更、补丁预览 |
| `browser` | 浏览器 | [tools/browser.md](./tools/browser.md) | 内嵌浏览器 |
| `terminal` | 终端 | [tools/terminal.md](./tools/terminal.md) | 命令执行终端 |
| `settings` | 设置 | [tools/settings.md](./tools/settings.md) | 应用设置（通用/工作区/存储/快捷键/浏览器/DSH，无模型组） |
| `communicate` | 通信 | [tools/communicate.md](./tools/communicate.md) | 多平台消息集成（GitHub CI / 飞书 / QQ / 微信 / 邮箱；保留 ToolId，当前切换器展示 5 项） |

> `audit`、`models` 非 ToolId（审计面板与模型面板均不存在；模型经设置 DSH 组管理）。

## 容器选择器

| 选择器 | 说明 |
|--------|------|
| `.adl-rightpanel` | 右侧面板容器 |
| `.adl-rightpanel__content` | 内容区域 |
| `.adl-rightpanel--collapsed` | 折叠状态 |
| `.adl-rightpanel--overlay-active` | 覆盖模式激活 |
| `.adl-rightpanel--overlay-expanded` | 覆盖模式完全展开 |

## 快速操作

### 切换工具

```javascript
// 点击工具标签
await page.click('.adl-tool-switcher__tab[aria-label="文件"]');

// 等待面板激活
await page.waitForSelector('#files-panel.is-active');
```

### 折叠右侧面板

```javascript
// 点击标题栏的切换按钮
await page.click('button[aria-label="切换右侧面板"]');

// 等待折叠
await page.waitForSelector('.adl-rightpanel--collapsed');
```

### 调整面板宽度

```javascript
// 拖拽调整手柄
const handle = await page.waitForSelector('.adl-rightpanel__resize-handle');
const box = await handle.boundingBox();
await page.mouse.move(box.x, box.y + box.height / 2);
await page.mouse.down();
await page.mouse.move(box.x - 100, box.y + box.height / 2); // 向左移动 100px
await page.mouse.up();
```

## 状态

### 折叠状态

| 状态 | CSS 类名 | 说明 |
|------|----------|------|
| 展开 | - | 默认状态 |
| 折叠 | `.adl-rightpanel--collapsed` | 隐藏内容 |

### 覆盖模式

| 状态 | CSS 类名 | 说明 |
|------|----------|------|
| 停靠 | - | 默认状态，占据布局空间 |
| 覆盖激活 | `.adl-rightpanel--overlay-active` | 开始覆盖中心区域 |
| 覆盖展开 | `.adl-rightpanel--overlay-expanded` | 完全覆盖中心区域 |

## 宽度限制

| 属性 | 值 |
|------|-----|
| 最小宽度 | 360px |
| 最大宽度 | 800px |

## 注意事项

1. **单工具激活**：同一时间只能激活一个工具面板
2. **覆盖模式**：当面板宽度超过阈值时进入覆盖模式
3. **异步加载**：部分工具面板内容需要等待加载
4. **徽章显示**：工具标签可能显示徽章（未保存文件数、Git 变更数等）
