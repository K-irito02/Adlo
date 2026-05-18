# 并排 Diff 分隔区域分层设计方案

## 概述

在"变更"功能并排模式下，让左右两个区域之间产生"左区域在下、右区域在上"的分层感。

## 设计方案

采用**方案 C: 微渐变过渡**——在左侧编辑器的右边缘覆盖一个从透明到背景色的渐变遮罩，视觉上左侧内容自然"退后"，右侧内容"浮出"。

## 实现

### 文件

`frontend/src/styles/regions.css`

### CSS

```css
/* 左侧编辑器右边缘渐变遮罩，产生左低右高的分层感 */
.adl-cm-diff-viewer--side-by-side .cm-mergeViewEditors > .cm-mergeViewEditor:first-child {
  position: relative;
}
.adl-cm-diff-viewer--side-by-side .cm-mergeViewEditors > .cm-mergeViewEditor:first-child::after {
  content: '';
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  width: 6px;
  pointer-events: none;
  z-index: 5;
  background: linear-gradient(to right, transparent, var(--bg));
}
```

### 参数

| 参数 | 值 | 说明 |
|------|-----|------|
| 渐变宽度 | 6px | 覆盖拖拽区域宽度，不额外占用空间 |
| 渐变方向 | `transparent → var(--bg)` | 从左透明到背景色，渐进融入 |
| pointer-events | none | 不影响拖拽交互 |
| 主题兼容 | var(--bg) | 亮/暗色主题自适应 |

## 效果

预览效果见视觉伴侶会话。
