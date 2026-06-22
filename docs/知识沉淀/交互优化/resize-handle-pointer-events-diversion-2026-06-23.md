# Resize Handle 与 Scrollbar 重叠：pointer-events 分流方案

## 问题

自定义 7px 宽垂直/水平滚动条无法悬停触发滚动，因为重叠区域的 Resize Handle（12px /
8px）z-index 更高，拦截了 pointer events。

## 根因

| 元素                                 | 宽度 | z-index | 区域             |
| ------------------------------------ | ---- | ------- | ---------------- |
| `.adl-tool-navigator__resize-handle` | 12px | 10      | 右侧面板, 最右侧 |
| `.adl-leftbar__resize-handle`        | 8px  | 10      | 左侧边栏, 最右侧 |
| `.adl-scrollbar` (自定义滚动条)      | 7px  | 3       | 贴右/贴底        |

Resize Handle 完全覆盖了 Scrollbar 的点击区域。

## 方案：pointer-events 分流

Resize Handle 设置 `pointer-events: none`，通过 `::before` 伪元素提供 3px 可交互边缘。

```css
.adl-xxx__resize-handle {
  pointer-events: none; /* 整个区域不拦截事件 */
}
.adl-xxx__resize-handle::before {
  content: '';
  position: absolute;
  right: 0;
  width: 3px; /* 仅最右侧 3px 可拖拽 */
  height: 100%;
  pointer-events: auto; /* 伪元素独立接收事件 */
  cursor: col-resize;
}
/* hover/active 必须用 :hover::before，不可用 ::before:hover */
.adl-xxx__resize-handle:hover::before,
.adl-xxx__resize-handle:active::before {
  opacity: 1;
  background: var(--text-secondary);
}
```

## 关键约束

1. **选择器顺序**：必须用 `.handle:hover::before`（伪类在前、伪元素在后）。 `::before:hover`
   语法虽在 Selectors Level 4 有定义但浏览器实现不一致。 `pointer-events: none` 的父元素通过
   `::before` 的命中测试仍然匹配 `:hover`——`::before` 是元素盒子树的一部分，浏览器会将 `:hover`
   应用于父元素。
2. **::before 宽度**：3px 是可用性和精度的平衡点（原始视觉 edge line 1px 太小）。
3. **动画范围**：hover 态仅 transition `opacity` 和 `background-color`，禁止 transition `width`
   避免布局抖动。
4. **水平滚动条**：overflow 区域的水平滚动条同理，cursor 从 `default` 改为 `pointer`
   作为辅助增强（非关键修复）。

## 影响范围

| 区域             | 文件                                     | 修改                      |
| ---------------- | ---------------------------------------- | ------------------------- |
| 文件导航工具     | `rightpanel/files-navigator.css:155-189` | pointer-events + ::before |
| 左侧边栏         | `leftbar.css:52-82`                      | pointer-events + ::before |
| CM 水平滚动条    | `cm-overrides.css`                       | cursor: default → pointer |
| 编辑器水平滚动条 | `editor-content.css`                     | cursor: default → pointer |

## 经验

- `pointer-events: none` 让父元素完全透明于点击，但 `::before` 的 `pointer-events: auto`
  可独立恢复局部交互。
- 当 resize
  handle 与 scrollbar 在视觉和 z-index 上必须同时存在时，pointer-events 分流是零布局影响的纯事件层解决。
