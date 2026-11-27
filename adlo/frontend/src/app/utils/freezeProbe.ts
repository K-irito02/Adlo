import { isTauriShell } from '@shared/env';
import { useAppStore } from '@stores/slicedStore';

/**
 * 下载期间整窗无响应的临时诊断探针（仅 dev 构建）。
 *
 * 记录两件事：
 * 1. 壳层 JS 是否停摆（1s 心跳的漂移）；
 * 2. 鼠标按下是否到达壳层 WebView、命中的 DOM 元素是什么，以及是否有
 *    覆盖整个视口的 fixed/absolute 元素（原生子 WebView 由外部窗口探针记录）。
 *
 * 输出走 console.warn，进 debug-logs.txt；P6 删除。
 */
function hasActiveDownload(): boolean {
  if (!isTauriShell()) {
    return false;
  }
  const state = useAppStore.getState();
  return Object.keys(state.activeDownloads).length > 0;
}

function describeElement(el: Element | null): string {
  if (!el) {
    return 'null';
  }
  const cls =
    typeof (el as HTMLElement).className === 'string' ? (el as HTMLElement).className : '';
  return `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}${cls ? `.${cls.trim().split(/\s+/).join('.')}` : ''}`;
}

function snapshot(): unknown {
  const points: [string, number, number][] = [
    ['titlebar', Math.round(innerWidth / 2), 14],
    ['center-toolbar', Math.round(innerWidth / 2), 84],
    ['right-panel', innerWidth - 120, 320],
    ['center-content', Math.round(innerWidth / 2), Math.round(innerHeight / 2)],
  ];
  const at = points.map(([name, x, y]) => ({
    name,
    hit: describeElement(document.elementFromPoint(x, y)),
  }));
  const overlays = [...document.querySelectorAll<HTMLElement>('body *')]
    .filter((el) => {
      const s = getComputedStyle(el);
      if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) <= 0.01) {
        return false;
      }
      const r = el.getBoundingClientRect();
      return (
        (s.position === 'fixed' || s.position === 'absolute') &&
        r.width >= innerWidth * 0.9 &&
        r.height >= innerHeight * 0.9
      );
    })
    .slice(0, 6)
    .map((el) => {
      const s = getComputedStyle(el);
      return {
        el: describeElement(el),
        z: s.zIndex,
        pointer: s.pointerEvents,
        opacity: s.opacity,
      };
    });
  return {
    at,
    overlays,
    focus: document.hasFocus(),
    active: describeElement(document.activeElement),
    pointerLock: !!document.pointerLockElement,
  };
}

export function installFreezeProbe(): void {
  if (!import.meta.env.DEV || typeof window === 'undefined') {
    return;
  }
  let lastTick = performance.now();
  let tickCount = 0;

  window.setInterval(() => {
    const now = performance.now();
    const drift = now - lastTick - 1000;
    lastTick = now;
    tickCount += 1;
    const active = hasActiveDownload();
    // 下载期间本来每 2s 打一条；临时取证阶段改为常开（每 2s 一条），
    // 以覆盖“新标签 WebView 创建中、下载事件尚未到达”的空窗。
    if (drift > 500 || tickCount % 2 === 0) {
      console.warn('[DBG-freeze] tick', {
        drift: Math.round(drift),
        activeDownload: active,
        ...(snapshot() as Record<string, unknown>),
      });
    }
  }, 1000);

  const logPointer = (event: Event) => {
    const target = event.target;
    console.warn('[DBG-freeze] pointer', {
      type: event.type,
      target: describeElement(target instanceof Element ? target : null),
      focus: document.hasFocus(),
      activeDownload: hasActiveDownload(),
    });
  };
  for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup'] as const) {
    window.addEventListener(type, logPointer, true);
  }
}
