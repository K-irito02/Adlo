# `<button disabled>` 上 `mouseup` 不派发问题与 Pointer Events 修复

## 问题

在拖拽排序实现中，将 `<button>` 作为放置目标区域，按钮设置 `disabled` 属性后，Chromium 不再向 `document` 派发 `mouseup` 事件，导致拖拽状态残留（`draggingId`/`dragOverId` 永不清理）。

## 根因

- `<button disabled>` 在 Chromium 中会阻止 `mouseup` 事件冒泡到 `document` 级别的事件监听
- 问题不在于 `mousedown`（`mousedown` 仍可正常监听），而在于释放阶段

## 解决方案

使用 **Pointer Events API**（`pointerup` + `pointercancel`）替代 `mouseup`，因为：

- Pointer Events 是 W3C 推荐标准，在任何元素上均可靠派发，不受 `disabled` 属性影响
- `pointercancel` 提供了额外的清理路径（如触屏中断）

代码模式：

```typescript
// ❌ 不可靠：disabled button 上 mouseup 可能不派发
document.addEventListener('mouseup', handleMouseUp);

// ✅ 可靠：Pointer Events 不受 disabled 限制
window.addEventListener('pointerup', handleMouseUp);
window.addEventListener('pointercancel', handleBlur);
```

## 经验

- 涉及 `disabled` 按钮的交互（尤其是拖拽释放到禁用元素上），**必须使用 Pointer Events API**
- 清理函数必须通过 `window.addEventListener` 而非 `document.addEventListener` 挂载
- `pointercancel` 提供比 `blur` 更可靠的清理路径
