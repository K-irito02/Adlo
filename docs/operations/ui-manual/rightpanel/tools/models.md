# 模型工具面板

> 模型健康监控面板。

## 容器选择器

| 选择器 | 说明 |
|--------|------|
| `#models-panel` | 模型面板容器 |

---

## 模型状态

> 模型健康状态列表

### 定位选择器

| 优先级 | 类型 | 选择器 |
|--------|------|--------|
| 1 | CSS | `.adl-model-health-list` |

### 模型项

| 选择器 | 说明 |
|--------|------|
| `.adl-model-item` | 单个模型项 |
| `.adl-model-item--healthy` | 健康状态 |
| `.adl-model-item--degraded` | 降级状态 |
| `.adl-model-item--unhealthy` | 不健康状态 |

---

## 刷新按钮

> 刷新模型状态

### 操作

```javascript
await page.click('button[aria-label="刷新"]');
```

---

## 相关元素

| 元素 | 选择器 | 说明 |
|------|--------|------|
| 模型面板 | `#models-panel` | 模型面板容器 |
| 模型列表 | `.adl-model-health-list` | 模型状态列表 |
| 模型项 | `.adl-model-item` | 单个模型项 |
