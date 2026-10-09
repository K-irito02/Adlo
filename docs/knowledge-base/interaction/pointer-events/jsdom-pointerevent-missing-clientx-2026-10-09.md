# jsdom 无 PointerEvent：fireEvent.pointer* 丢 clientX

日期：2026-10-09｜来源：标题栏标签拖拽排序单测

## 现象

`fireEvent.pointerDown(el, { clientX: 50 })` 后，handler 读到的 `clientX` 为
`undefined`，拖拽位移算出 `NaN`（`translateX(NaNpx)`），阈值判定
`|undefined - undefined| <= 4` 恒为 false 导致误激活。

## 根因

当前 jsdom 的 `window` 上没有 `PointerEvent` 构造器。testing-library 按
`pointerDown` 的事件接口选择构造器，退化为普通 `Event` 后不再搬运
`clientX/button` 等鼠标属性（实测 `clientX` 丢失）。

## 做法

单测改用 `MouseEvent` 冒充 pointer 类型派发（React 只认事件类型名字）：

```tsx
const evt = new window.MouseEvent('pointermove', {
  bubbles: true,
  cancelable: true,
  clientX: 100,
  button: 0,
});
Object.defineProperty(evt, 'pointerId', { value: 1 }); // MouseEvent 无该字段
Object.defineProperty(evt, 'pointerType', { value: 'mouse' }); // 同上
Object.defineProperty(evt, 'buttons', { value: 1 }); // MouseEvent 默认 0
act(() => {
  el.dispatchEvent(evt);
});
```

注意三点：

1. `dispatchEvent` 不像 `fireEvent` 自动包 `act`，必须手包，否则 `setState`
   引发的 class 变更（如 `is-dragging`）不同步刷新。
2. 实现若门控 `pointerType`/`buttons`，helper 默认值必须与之自洽
   （mouse + 左键位），否则全量拖拽用例假红。
3. 生产浏览器不受影响（原生 PointerEvent 字段齐全）；注释写清原因，
   免后人“优化”回 `fireEvent.pointer*`。

## 验证

`CenterTabStrip.test.tsx` 拖拽 17 用例全绿；NaN 复现可通过临时 Visiting
`translateX(NaNpx)` 日志确认（已删临时文件）。
