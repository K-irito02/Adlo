# Brand（品牌标识）

> 标题栏左侧的品牌 Logo 区域。

## 元素信息

### 定位选择器

| 优先级 | 类型 | 选择器 |
|--------|------|--------|
| 1 | aria-label | 待核实选择器（原 `[aria-label="砚"]` 在 `TitleBar.tsx`/`HamburgerMenu.tsx` 无命中；"砚"仅见 `zh-CN/common.ts` 的 `brandHoverName`，经 `useAppStartup.ts` 用于窗口标题，非 aria-label，不编造新选择器） |
| 2 | CSS | `.adl-titlebar__brand` |
| 3 | CSS | `.adl-titlebar__logo` |

### 前置条件

- [x] 无（始终存在）

### 视觉位置

```
┌─────────────────────────────────────────────────────────────┐
│ [LOGO]  文件  视图  帮助  🔍  │        ...        │ ...    │
│  ↑                                                          │
│  Brand                                                      │
└─────────────────────────────────────────────────────────────┘
```

## 操作

### 悬停查看品牌名称

| 操作 | 方式 |
|------|------|
| 悬停 | 鼠标移至 Logo 上 |

### 状态变化

- 悬停后显示 Tooltip，内容为品牌名称（"砚"）

### 预期结果

- Tooltip 显示在 Logo 下方
- Tooltip 内容为 `brandHoverName` 配置值

### 等待条件

```javascript
// 等待 Logo 加载
await page.waitForSelector('.adl-titlebar__logo');
```

## 相关元素

| 元素 | 选择器 | 说明 |
|------|--------|------|
| Brand 容器 | `.adl-titlebar__brand-slot` | 包含 Logo 和拖拽区域（Tauri 模式下可拖拽移动窗口，浏览器模式下不可拖拽） |
| Logo 图片 | `.adl-titlebar__logo` | 品牌 Logo 图片 |
| Tooltip | `.adl-tooltip` | 悬停后显示的提示 |

## 注意事项

1. **不可点击**：Brand 区域主要用于展示，点击无响应
2. **拖拽区域**：Brand 容器属于窗口拖拽区域的一部分
3. **Tooltip 延迟**：悬停后需要等待约 500ms 才显示 Tooltip
