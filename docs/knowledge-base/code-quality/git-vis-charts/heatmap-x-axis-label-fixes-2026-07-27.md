# 热力图 x 轴标签修复经验

## 问题

ContributorModuleHeatmap 的 x 轴标签被裁剪，两个独立根因：

### 根因 1：CSS shrink-to-fit

`width: auto` + `position: absolute` + `left: Npx` 时，CSS shrink-to-fit 算法根据容器剩余宽度（容器宽度 - left）限制元素实际宽度。右侧标签的 left 接近容器右边缘时，可用宽度仅 ~46px，文字被截断。

**修复：** `width: auto` → `width: max-content`

```typescript
// ❌ width: auto → shrink-to-fit 限制宽度
// ✅ width: max-content → 强制宽度适配内容
```

### 根因 2：旋转文字向上延伸超出容器

`rotate(-45deg)` 以 `left center` 为原点时，文字右端向上延伸约 `textWidth × sin(45°)`。若 `top` 值过小，延伸部分超出容器上边界被 `overflow-y: auto` 裁剪。

**修复：** 动态计算所需空间

```typescript
const maxTextWidth = maxLabelLen * 7.5; // 12px 字体估算
const upwardExtent = Math.ceil(maxTextWidth * Math.abs(Math.sin(angleRad)));
const labelTop = upwardExtent + 4;  // 标签位置
const marginTop = labelTop + 20;    // 网格起始位置
```

### 附带修复

- CSS 简写 `overflow: auto` 不会覆盖长属性 `overflow-x: clip`（层叠优先级问题）。须使用长属性 `overflowX: 'auto'`
- SVG 元素默认 `overflow: hidden`，绝对定位的标签 DOM 元素不受影响
