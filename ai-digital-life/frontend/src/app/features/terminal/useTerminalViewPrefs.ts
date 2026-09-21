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
  /** 当前活动终端标签：偏好按标签隔离（Task 25），切换标签即读该标签的偏好 */
  activeTabId: string | undefined;
}

/**
 * 终端面板视图偏好：布局模式、历史区位置、历史区占比，以及分界线拖拽。
 *
 * 按标签隔离（Task 25）：各标签的偏好经 `adl:terminal.viewPrefs` 按标签记录，
 * 无记录标签取 DEFAULT_TERMINAL_VIEW_PREFS（等同旧全局默认）；标签切换时读
 * 新标签的偏好（不重置、不互影响）；每次用户变更即按当前标签落盘。
 *
 * 拖拽采用项目既有导航器手柄的写法：`setPointerCapture` + rAF 节流 + 拖拽期间直接写
 * CSS 变量（不逐帧 setState，避免整面板重渲染），松手才提交状态并持久化。
 */
export function useTerminalViewPrefs({ containerRef, activeTabId }: UseTerminalViewPrefsParams) {
  const [prefs, setPrefs] = useState<TerminalViewPrefs>(() =>
    terminalViewPrefsStore.loadForTab(activeTabId),
  );
  const prefsRef = useRef(prefs);
  prefsRef.current = prefs;
  const tabIdRef = useRef(activeTabId);
  tabIdRef.current = activeTabId;
  const rafRef = useRef(0);
  // 拖拽进行中的清理函数；组件卸载时也要执行，否则 body 上的 resizing 类会泄漏
  const detachDragRef = useRef<(() => void) | null>(null);

  useEffect(
    () => () => {
      detachDragRef.current?.();
    },
    [],
  );

  // 标签切换：读新标签的偏好（无记录即默认）；旧标签的偏好已在每次变更时即时落盘，
  // 此处无需先保存 —— 故切换不重置、不互影响。
  useEffect(() => {
    setPrefs(terminalViewPrefsStore.loadForTab(activeTabId));
  }, [activeTabId]);

  const commit = useCallback((next: TerminalViewPrefs) => {
    setPrefs(next);
    const tabId = tabIdRef.current;
    if (tabId !== undefined) {
      terminalViewPrefsStore.saveForTab(tabId, next);
    }
  }, []);

  const setViewMode = useCallback(
    (mode: TerminalViewMode) => {
      const current = prefsRef.current;
      if (current.mode !== mode) {
        commit({ ...current, mode });
      }
    },
    [commit],
  );

  /** 交换「只读历史区」与「实时终端」在主轴上的位置 */
  const swapAreas = useCallback(() => {
    const current = prefsRef.current;
    commit({ ...current, historyFirst: !current.historyFirst });
  }, [commit]);

  const setHistoryRatio = useCallback(
    (historyRatio: number) => {
      commit({ ...prefsRef.current, historyRatio });
    },
    [commit],
  );

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

      // 拖拽收尾：handleUp 与「拖拽中组件被卸载」共用同一条清理路径，
      // 保证 pointer 监听 / rAF / body 上的 resizing 类一定被回收。
      const detach = () => {
        if (rafRef.current) {
          window.cancelAnimationFrame(rafRef.current);
          rafRef.current = 0;
        }
        body.classList.remove('adl-is-resizing');
        target.removeEventListener('pointermove', handleMove);
        target.removeEventListener('pointerup', handleUp);
        target.removeEventListener('pointercancel', handleUp);
        target.removeEventListener('lostpointercapture', handleUp);
        detachDragRef.current = null;
      };

      const handleUp = () => {
        detach();
        // 提交到状态：与拖拽期间写的 CSS 变量同值，因此不会跳变。
        // 值未变化（纯点击、无拖动）时不提交，避免一次冗余 re-render与落盘。
        // 卸载路径只会调 detach，不会在卸载后 setState。
        if (latestRatio !== prefsRef.current.historyRatio) {
          setHistoryRatio(latestRatio);
        }
      };

      detachDragRef.current = detach;
      target.addEventListener('pointermove', handleMove);
      target.addEventListener('pointerup', handleUp);
      target.addEventListener('pointercancel', handleUp);
      target.addEventListener('lostpointercapture', handleUp);
    },
    [containerRef, setHistoryRatio],
  );

  return { viewPrefs: prefs, setViewMode, swapAreas, handleDividerPointerDown };
}
