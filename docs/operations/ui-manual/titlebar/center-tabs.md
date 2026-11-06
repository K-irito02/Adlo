# 中心标签条（Center Tab Strip）

> 标题栏中部的中心标签条：单行展示中心标签，溢出时内部横向滚动。

## 布局结构

```
┌─────────────────────────────────────────────────────────────────┐
│ [icon] 标签名 [×] │ [icon] 标签名 [×] │ ... │  +  │
└─────────────────────────────────────────────────────────────────┘
```

## 元素索引

| 名称 | 选择器 | 说明 |
|------|--------|------|
| 标签条 | `.adl-center-tab-strip` | 中心容器，两侧控件组锁定宽度、永不压缩 |
| 滚动区 | `.adl-center-tab-strip__scroll` | 溢出时内部横向滚动（滚动条隐藏，纵滚映射横滚） |
| 标签 | `.adl-center-tab` | 悬停/选中灰底（6px 圆角），悬停出现操作按钮 |
| 新建按钮 | `.adl-center-tab-strip__add` | `+`，跟在最后一个标签之后；标签溢出时 `position: sticky` 固定在右端 |
| 标签列表容器 | `.adl-center-tab-strip__tabs` | `role="tablist"`（`display: contents`，只承载 ARIA 归属） |
| 左/右渐隐 | `.adl-center-tab-strip__fade-left` / `__fade-right` | 24px 溢出渐隐（mask + `backdrop-filter: blur(2px)`），由 `data-fade-left/right` 控制 |

## 操作

### 切换标签

```javascript
// 单击标签本体选中；键盘聚焦后 Enter/Space 同效
await page.click('.adl-center-tab >> nth=0');
```

### 关闭 / 回到面板

```javascript
// 悬停标签后点击关闭按钮（终端/浏览器标签另有“回到面板”按钮）
await page.hover('.adl-center-tab >> nth=0');
await page.click('.adl-center-tab__actions button[aria-label="关闭"]');
```

### 拖拽排序（Chrome 式滑动让位）

```javascript
// 按住标签水平拖动超 4px 进入拖拽，其余标签滑动让位，松手落位
await page.mouse.move(200, 18);
await page.mouse.down();
await page.mouse.move(320, 18, { steps: 10 });
await page.mouse.up();
```

行为说明：

1. 移动 ≤4px 仍视为单击选中，不进入拖拽。
2. 拖拽只排序、不切换选中；关闭/回面板按钮与重命名输入框内不触发。
3. 标签很多时拖到左右边缘会自动横滚；`Escape` 取消本次拖拽。
4. 触屏不在支持范围（横滑保留原生滚动查看）。

## 注意事项

1. **溢出**：标签达最小宽度（100px）后不再压缩，由滚动区承载；右侧图标组永不被挤压。
2. **「+」位置**：默认跟在最后一个标签之后；溢出滚轮以 `scrollLeft` 驱动，此时 `sticky` 固定在滚动区右端，不随标签滚走。
3. **两端渐隐**：右侧被「+」截断、左侧滚动隐藏的标签均有 24px 渐隐模糊；渐隐层 `pointer-events: none`，且右渐隐层级低于标签操作按钮，关闭按钮不会被压暗。
4. **活动标签**：新增/切换后自动滚入视口；`scroll-padding-right` 预留「+」的宽度，避免关闭按钮被按钮遮挡。
5. **重命名**：终端标签双击名称进入行内重命名。
