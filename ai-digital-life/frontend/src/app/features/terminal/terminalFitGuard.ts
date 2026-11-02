/**
 * 终端 fit 的前置门控：
 * - 文档隐藏（窗口最小化 / WebView 不可见）时不 fit，避免把 xterm 收缩到
 *   极小尺寸（实测最小化时容器量出 23×6），恢复后 xterm 重排会丢历史；
 * - 容器尺寸为 0（面板隐藏 / 未布局）时不 fit。
 *
 * 恢复可见后由 ResizeObserver / visibilitychange 重新 fit 到真实尺寸。
 */
export interface TerminalFitInput {
  hidden: boolean;
  width: number;
  height: number;
}

/**
 * 窗口焦点态：最小化会让窗口失焦，但 WebView2 的 `document.hidden` 不一定会变 true
 *（实测最小化时仍量出 23×6）。失焦期间不 fit，恢复焦点后再补 fit。
 * 用模块级单例避免每个终端实例各挂一份 listener。
 */
let windowFocused = true;

export function setWindowFocused(focused: boolean): void {
  windowFocused = focused;
}

if (typeof window !== 'undefined') {
  window.addEventListener('blur', () => setWindowFocused(false));
  window.addEventListener('focus', () => setWindowFocused(true));
}

export function shouldFitTerminal({ hidden, width, height }: TerminalFitInput): boolean {
  return windowFocused && !hidden && width > 0 && height > 0;
}
