/**
 * 终端 fit 的前置门控：
 * - 文档隐藏（窗口最小化 / WebView 不可见）时不 fit，避免把 xterm 收缩到
 *   极小尺寸（实测最小化时容器量出 23×6），恢复后 xterm 重排会丢历史；
 * - 窗口失焦时不 fit：WebView2 最小化时 `document.hidden` 不一定变 true，
 *   失焦是更可靠的信号（实测 23×6 出现在焦点移出之后）；
 * - 容器尺寸为 0（面板隐藏 / 未布局）时不 fit。
 *
 * 恢复可见/回焦后由 ResizeObserver、`visibilitychange` 与窗口 `focus` 监听重新
 * fit 到真实尺寸。
 */

let windowFocused = true;

/** 仅测试用：模拟窗口焦点态（生产由下方 window 监听维护）。 */
export function setWindowFocused(focused: boolean): void {
  windowFocused = focused;
}

const onWindowBlur = () => setWindowFocused(false);
const onWindowFocus = () => setWindowFocused(true);

if (typeof window !== 'undefined') {
  window.addEventListener('blur', onWindowBlur);
  window.addEventListener('focus', onWindowFocus);
}

// HMR 每次重新执行模块都会再挂一对监听：旧闭包写的是旧模块实例的变量，
// dev 期会累积。热替换时解绑，让新实例重新注册。
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    window.removeEventListener('blur', onWindowBlur);
    window.removeEventListener('focus', onWindowFocus);
  });
}

/** 当前容器是否适合 fit：窗口聚焦、文档可见、宽高均大于 0。 */
export function shouldFitTerminal(el: HTMLElement): boolean {
  return windowFocused && !document.hidden && el.clientWidth > 0 && el.clientHeight > 0;
}
