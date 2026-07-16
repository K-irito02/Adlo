# Sub-Card 边框子像素渲染修复

## 问题

所有 `.adl-sub-hint-card` 的上、下边框显示不一致：上边框显得更厚、颜色更深，下边框显得更薄、更亮。

## 根因

### 1. line-height 导致半像素卡高

`--leading-relaxed`（`1.625`）× `--text-xs`（`12px`）= `19.5px` 内容高度。

Card border-box 总高：`19.5（内容） + 8 + 8（padding） + 1 + 1（border） = 37.5px`（奇数半像素）。

### 2. translateY(-50%) 放大子像素偏移

`transform: translateY(-50%)` 使用元素 border-box 高度的 50% 作为偏移量：

- 偏移量 = `37.5 × 50% = 18.75px`（非整数）
- 最终视觉位置 = `centerY - 18.75`

centerY 的奇偶性 + 18.75 的 0.75 小数部分，导致顶部边框和底部边框处于**不同的子像素相位**（如 X.25 vs X.75）。

### 3. 浏览器抗锯齿不对称

浏览器对 1px CSS 边框的抗锯齿算法依赖元素的实际像素位置。当顶部边框处于 `.25` 相位而底部处于 `.75` 相位时：

| 相位 | 透明度分布 | 视觉效果 |
|------|-----------|---------|
| X.25 | 上方像素 75%、下方像素 25% | 较厚、较深 |
| X.75 | 上方像素 25%、下方像素 75% | 较薄、较亮 |

## 修复

将 `.adl-sub-hint-card` 的 `line-height` 从 `var(--leading-relaxed)`（`1.625`）改为 `1.5`：

```css
.adl-sub-hint-card {
  line-height: 1.5;
}
```

### 验证

| 属性 | 原值 | 新值 |
|------|------|------|
| line-height | `1.625 × 12px = 19.5px` | `1.5 × 12px = 18px` |
| padding | `8 + 8 = 16px` | `8 + 8 = 16px` |
| border | `1 + 1 = 2px` | `1 + 1 = 2px` |
| 总高 | `37.5px`（奇数半像素） | `36px`（偶数整数） |
| translateY(-50%) | `-18.75px` | `-18px`（整数） |

现在顶部和底部始终处于**相同子像素相位**，1px 边框抗锯齿对称。36px 的偶数总高确保 `translateY(-50%)` 结果是整数，即使 `centerY` 为半像素，顶部和底部的相位差为 0。

### 副效应

- 单行文本的视觉间距变化：`19.5px -> 18px`，差距 1.5px，对 Hint Card 单行短文本无影响
- 多行场景未使用 Hint Card（大部分为单行提示文字）

## 涉及文件

| 文件 | 变更 |
|------|------|
| `frontend/src/styles/regions/rightpanel/file-operations.css` | `.adl-sub-hint-card` 的 `line-height` 从 `var(--leading-relaxed)` 改为 `1.5` |

## 经验教训

1. **`line-height` 选择需考虑盒模型累积效应**：`line-height * font-size + padding + border` 总和必须为偶数整数，避免 `translateY(-50%)` 产生子像素偏移
2. **1px 边框在子像素位置渲染不稳定**：浏览器抗锯齿在不同子像素相位表现不同，尽量确保边框位于整数像素位置
3. **`translateY(-50%)` 是常见的子像素来源**：与浮动高度（如 line-height 含小数）组合时，几乎必然产生子像素位置。可通过确保总高为偶数来避免
