import { useEffect, useState } from 'react';

const SHELL_BODY_SELECTOR = '.adl-shell__body';

/** 右侧面板浮层态类名（由 `useRightPanelLayout.syncOverlayClasses` 写在 shell body 上）。 */
const OVERLAY_CLASSES = ['is-rightpanel-overlay-active', 'is-rightpanel-overlay-expanded'] as const;

/** shell body 是否处于右侧面板浮层态（面板以 absolute 浮在中间区之上）。 */
export function isObscuredByPanelOverlay(shellBody: Element | null): boolean {
  if (!shellBody) {
    return false;
  }
  return OVERLAY_CLASSES.some((cls) => shellBody.classList.contains(cls));
}

/**
 * 中间区是否被右侧面板浮层遮挡。
 *
 * 右侧面板进入 `overlay_partial` / `overlay_full` 时改为 `position: absolute` 浮在
 * 中间区之上（浮层态是写在 `.adl-shell__body` 上的类，见 `useRightPanelLayout`）。
 * DOM 浮层无法盖住原生 WebView2 子窗口，所以必须主动把中间区的 WebView2 移出画面，
 * 否则原生表面会反过来盖住右侧面板。
 *
 * 该职责原由专属 dsh 宿主（`DshHostRegion`）承担，随 dsh 改为普通浏览器标签被一并
 * 删除；此处泛化到所有中心浏览器标签。
 *
 * 检测走 MutationObserver：浮层态是 DOM 类名切换（非 React 状态），没有可订阅的
 * React 数据源。浏览器模式无原生子窗口，本结果不被消费（保持同一判定口径即可）。
 */
export function useCenterObscured(): boolean {
  // 惰性初值直接读一次 DOM：若挂载时面板**已经**处于浮层态，首帧为 false 会让中心
  // WebView 先按“未遮挡”摆回画面、下一帧才被隐藏 → 闪过一帧原生表面。
  const [obscured, setObscured] = useState(() =>
    typeof document === 'undefined'
      ? false
      : isObscuredByPanelOverlay(document.querySelector(SHELL_BODY_SELECTOR)),
  );

  useEffect(() => {
    if (typeof document === 'undefined') {
      return;
    }
    const shellBody = document.querySelector(SHELL_BODY_SELECTOR);
    if (!shellBody) {
      return;
    }
    const sync = () => setObscured(isObscuredByPanelOverlay(shellBody));
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(shellBody, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  return obscured;
}
