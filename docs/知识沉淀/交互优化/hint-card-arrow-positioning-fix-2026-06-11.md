# Hint Card 子卡片箭头定位修复

## 问题

GitHub 通信面板的「删除全部」主菜单中，每个功能选项右侧有一个"!"图标。鼠标悬停"!"时弹出子卡片（hint card），其左侧箭头（三角形）未能准确指向"!"图标位置，而是指向子卡片内部。

## 根因

### 1. CSS 三角形方向误判

`border-left` / `border-right` 在 0 宽元素上生成的三角形方向与直觉相反：

| CSS 属性 | 三角形指向 | 箭尖位置 |
|----------|-----------|---------|
| `border-left: Npx solid` | **指向右侧**（→） | 箭尖位于元素 `left` + N 处 |
| `border-right: Npx solid` | **指向左侧**（←） | 箭尖位于元素 `left` 处 |

**关键认知**：边框由内容盒外缘向**外**延伸。`border-left` 从内容左缘向左延伸 Npx，视觉三角形的尖点落在 **右侧**（远离内容盒的方向），而不是常见的直觉以为的指向左侧。

### 2. `position: fixed` 包含块行为变更（Chrome 130+）

Chrome 130+ 实现了 CSS Positioned Layout 规范变更：

- `position: fixed` 元素**不再**为 `position: absolute` 子元素（包括 `::before`/`::after` 伪元素）创建包含块
- 导致 `::before`/`::after` 的 `top: calc(50% - Npx)` 和 `left: 0` 不再相对于卡片父元素计算，而是相对于视口
- 箭头定位完全失效

只有添加 `transform`、`perspective`、`filter` 等属性才能重新激活包含块创建行为。

### 3. 早期尝试失败原因

| 尝试 | 失败原因 |
|------|---------|
| `translateY(-50%)` CSS 居中 | 含 `transform` 虽修复包含块，但用户浏览器可能缓存旧 CSS |
| JS 测量高度后居中 | 包含块问题未解决，`::before` 的 `top:50%` 仍相对视口 |
| `translateZ(0)` 防御 | 用户明确反对"防御性措施" |

## 解决方案

**彻底抛弃 `::before`/`::after` 伪元素方案，改用三个独立的 `position: fixed` 元素：**

```
三个独立 position:fixed 元素（互不依赖，无包含块问题）
┌─────────────────────────────────────────────┐
│ 箭头边框 (menuRight-5,     centerY-5)        │
│ 箭头填充 (menuRight-4,     centerY-4)        │
│ 内容卡片 (menuRight+1,     centerY, tY(-50%))│
│                                             │
│  ◄═══════════════════ 卡片内容文本           │
└─────────────────────────────────────────────┘
```

### 定位公式

| 元素 | `left` | `top` | 说明 |
|------|--------|-------|------|
| 卡片 | `menuRight + 1` | `centerY` + `tY(-50%)` | 垂直居中于按钮 |
| 箭头填充 | `menuRight - 4` | `centerY - 4` | `border-right:5px` 生成指向左侧的三角形，底部对齐卡片左缘 |
| 箭头边框 | `menuRight - 5` | `centerY - 5` | 外扩 1px 形成轮廓线 |

其中 `centerY = buttonRect.top + buttonRect.height / 2`。

## 涉及文件

| 文件 | 变更 |
|------|------|
| `frontend/src/styles/regions/rightpanel/file-operations.css` | 移除 `.adl-menu-hint-card` 系列类，新增 `.adl-sub-hint-card`/`__arrow`/`__arrow-border` |
| `frontend/src/app/regions/right-panel/panels/communicate/GitHubPanel.tsx` | `MenuHintItem` 组件完全重写，使用独立 fixed 元素替代伪元素箭头 |

## 经验教训

1. **CSS 三角形方向测试**：不要凭直觉判断 `border-left`/`border-right` 的指向，应通过浏览器 DevTools 实际验证
2. **`position: fixed` 包含块**：Chrome 130+ 后不再为 `position: absolute` 后代创建包含块，需用 `transform` 或改用独立元素
3. **伪元素定位不可靠**：`::before`/`::after` 在 `position: fixed` 父元素中的 `position: absolute` 行为受浏览器版本和 CSS 规范影响，跨浏览器不一致
4. **独立 `position: fixed` 元素最可靠**：每个元素独立定位，无包含块依赖，兼容性好
