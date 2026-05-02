# 审计工具面板

> 操作审计日志面板。

## 容器选择器

| 选择器 | 说明 |
|--------|------|
| `#audit-panel` | 审计面板容器 |

---

## 审计列表

> 审计条目列表

### 定位选择器

| 优先级 | 类型 | 选择器 |
|--------|------|--------|
| 1 | CSS | `.adl-audit-list` |

### 审计项

| 选择器 | 说明 |
|--------|------|
| `.adl-audit-item` | 单个审计条目 |
| `.adl-audit-item--info` | 信息级别 |
| `.adl-audit-item--warning` | 警告级别 |
| `.adl-audit-item--error` | 错误级别 |

### 操作

#### 查看审计详情

```javascript
await page.click('.adl-audit-item');
```

---

## 相关元素

| 元素 | 选择器 | 说明 |
|------|--------|------|
| 审计面板 | `#audit-panel` | 审计面板容器 |
| 审计列表 | `.adl-audit-list` | 审计条目列表 |
| 审计项 | `.adl-audit-item` | 单个审计条目 |
