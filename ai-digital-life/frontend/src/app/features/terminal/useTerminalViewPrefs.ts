import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ratioFromPointer,
  terminalViewPrefsStore,
  type TerminalViewMode,
  type TerminalViewPrefs,
} from './terminalViewPrefs';

interface UseTerminalViewPrefsParams {
  /** 承载「只读历史区 + 分界线 + 实时终端」的容器，用于换算拖拽比例 */
  containerRef: React.RefObject<HTMLDivElement | null>;
}

/**
 * 终端面板视图偏好：布局模式、历史区位置、历史区占比，以及分界线拖拽。
 *
 * 拖拽采用项目既有导航器手柄的写法：`setPointerCapture` + rAF 节流 + 拖拽期间直接写
 * CSS 变量（不逐帧 setState，避免整面板重渲染），松手才提交状态并持久化。
 */
export function useTerminalViewPrefs({ containerRef }: UseTerminalViewPrefsParams) {
  const [prefs, setPrefs] = useState<TerminalViewPrefs>(() => terminalViewPrefsStore.load());
  const prefsRef = useRef(prefs);
  prefsRef.current = prefs;
  const rafRef = useRef(0);

  useEffect(() => {
    terminalViewPrefsStore.save(prefs);
  }, [prefs]);

  const setViewMode = useCallback((mode: TerminalViewMode) => {
    setPrefs((current) => (current.mode === mode ? current : { ...current, mode }));
  }, []);

  /** 交换「只读历史区」与「实时终端」在主轴上的位置 */
  const swapAreas = useCallback(() => {
    setPrefs((current) => ({ ...current, historyFirst: !current.historyFirst }));
  }, []);

  const setHistoryRatio = useCallback((historyRatio: number) => {
    setPrefs((current) => ({ ...current, historyRatio }));
  }, []);

  const handleDividerPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const container = containerRef.current;
      if (!container) {
        return;
      }
      event.preventDefault();
      const target = event.currentTarget;
      target.setPointerCapture(event.pointerId);

      const rect = container.getBoundingClientRect();
      const isDual = prefsRef.current.mode === 'dual';
      const mainSize = isDual ? rect.width : rect.height;
      const body = document.body;
      body.classList.add('adl-is-resizing');
      let latestRatio = prefsRef.current.historyRatio;

      const handleMove = (moveEvent: PointerEvent) => {
        if (rafRef.current) {
          return;
        }
        rafRef.current = window.requestAnimationFrame(() => {
          rafRef.current = 0;
          const pointerMain = isDual ? moveEvent.clientX - rect.left : moveEvent.clientY - rect.top;
          latestRatio = ratioFromPointer({
            pointerMain,
            mainSize,
            historyFirst: prefsRef.current.historyFirst,
          });
          container.style.setProperty('--adl-terminal-history-ratio', String(latestRatio));
        });
      };

      const handleUp = () => {
        if (rafRef.current) {
          window.cancelAnimationFrame(rafRef.current);
          rafRef.current = 0;
        }
        body.classList.remove('adl-is-resizing');
        target.removeEventListener('pointermove', handleMove);
        target.removeEventListener('pointerup', handleUp);
        target.removeEventListener('pointercancel', handleUp);
        target.removeEventListener('lostpointercapture', handleUp);
        // 提交到状态：与拖拽期间写的 CSS 变量同值，因此不会跳变
        setHistoryRatio(latestRatio);
      };

      target.addEventListener('pointermove', handleMove);
      target.addEventListener('pointerup', handleUp);
      target.addEventListener('pointercancel', handleUp);
      target.addEventListener('lostpointercapture', handleUp);
    },
    [containerRef, setHistoryRatio],
  );

  return { viewPrefs: prefs, setViewMode, swapAreas, handleDividerPointerDown };
}
