import { useCallback, useEffect, useRef, useState } from 'react';
import { RIGHT_PANEL_WIDTH_MIN, RIGHT_PANEL_WIDTH_MAX } from '@stores/slices/uiSlice';
import { persist } from '@stores/persisted/persist';
import {
  applyRightPanelMode,
  applyRightPanelLastRestorableWidth,
  readCachedRightPanelMode,
  readCachedRightPanelLastRestorableWidth,
  resolveOverlayAnchorWidth,
  shouldSkipPassiveLayoutSync,
} from '../rightPanelLayout';
import { useAppStore } from '@stores/slicedStore';
import { useShallow } from 'zustand/react/shallow';
import { deriveRightPanelOverlayState, type RightPanelMode } from '../rightPanelLayout';

function readPersistedRightPanelMode(): RightPanelMode {
  return readCachedRightPanelMode();
}

function writePersistedRightPanelMode(mode: RightPanelMode): void {
  applyRightPanelMode(mode);
  persist('adl:ui.rightPanelMode', mode);
}

function readPersistedLastRestorableWidth(fallback: number): number {
  return readCachedRightPanelLastRestorableWidth() ?? fallback;
}

function writePersistedLastRestorableWidth(width: number): void {
  applyRightPanelLastRestorableWidth(width);
  persist('adl:ui.rightPanelLastRestorableWidth', width);
}

interface RightPanelLayoutMetrics {
  shellBody: HTMLElement | null;
  shellWidth: number;
  leftWidth: number;
  rightMaxWidth: number;
  overlayThreshold: number;
}

export function useRightPanelLayout(collapsed: boolean) {
  const { leftCollapsed, rightPanelWidth, setRightPanelWidth } = useAppStore(
    useShallow((state) => ({
      leftCollapsed: state.leftCollapsed,
      rightPanelWidth: state.rightPanelWidth,
      setRightPanelWidth: state.setRightPanelWidth,
    })),
  );

  const panelRef = useRef<HTMLElement | null>(null);
  const resizeFrameRef = useRef<number | null>(null);
  const syncFrameRef = useRef<number | null>(null);
  const draggingRef = useRef(false);
  const initialLastRestorable = readPersistedLastRestorableWidth(rightPanelWidth);
  const lastRestorableWidthRef = useRef(initialLastRestorable);
  const overlayAnchorWidthRef = useRef<number | undefined>(undefined);
  const initialMode = readPersistedRightPanelMode();
  const rightPanelModeRef = useRef<RightPanelMode>(initialMode);
  // overlay_full 是"用户主动扩大"的模式不变式（不再由宽度反推）：该位决定被动同步
  // 是否恒按 rightMaxWidth 补满，从而在左栏展开/收起、窗口变化后始终占满。
  const maximizedRef = useRef(initialMode === 'overlay_full');
  // 左栏离散切换追踪：切换时把覆盖锚重定到实时阈值（事项 8），否则后续覆盖→停靠
  // 翻转瞬间网格中心宽跳变（旧锚 vs 新阈值之差）。连续变化（窗口/拖拽）不重定。
  const prevLeftCollapsedRef = useRef(leftCollapsed);
  const [rightPanelMode, setRightPanelMode] = useState<RightPanelMode>(initialMode);

  const syncOverlayClasses = useCallback(
    (mode: RightPanelMode, shellBody?: HTMLElement | null) => {
      const shell =
        shellBody ?? (panelRef.current?.closest('.adl-shell__body') as HTMLElement | null) ?? null;
      const panel = panelRef.current;
      if (!shell || !panel) {
        return;
      }
      const overlayState = deriveRightPanelOverlayState(mode, collapsed);
      shell.classList.toggle('is-rightpanel-overlay-active', overlayState.overlayActive);
      shell.classList.toggle('is-rightpanel-overlay-expanded', overlayState.overlayExpanded);
      panel.classList.toggle('adl-rightpanel--overlay-active', overlayState.overlayActive);
      panel.classList.toggle('adl-rightpanel--overlay-expanded', overlayState.overlayExpanded);
    },
    [collapsed],
  );

  const readLayoutMetrics = useCallback((): RightPanelLayoutMetrics => {
    // leftbarWidth 变更经 .adl-leftbar 的 ResizeObserver 间接触发本函数重算，无需订阅 store。
    const shellBody = panelRef.current?.closest('.adl-shell__body') as HTMLElement | null;
    const root = document.documentElement;
    const shellWidth = shellBody?.getBoundingClientRect().width ?? window.innerWidth;
    const leftbar = shellBody?.querySelector('.adl-leftbar') as HTMLElement | null;
    // 权威值在 shellBody 内联样式（App 自 store 落盘，拖拽中直写同一元素），:root 恒为默认值。
    const cssLeftWidth =
      parseFloat(shellBody?.style.getPropertyValue('--leftbar-width') || '') ||
      parseFloat(getComputedStyle(root).getPropertyValue('--leftbar-width')) ||
      0;
    const leftWidth = leftCollapsed ? 0 : (leftbar?.getBoundingClientRect().width ?? cssLeftWidth);
    const overlayTriggerReserve =
      parseFloat(getComputedStyle(root).getPropertyValue('--center-width-min')) || 360;
    const rightMaxWidth = Math.max(RIGHT_PANEL_WIDTH_MIN, shellWidth - leftWidth);
    const overlayThreshold = Math.max(RIGHT_PANEL_WIDTH_MIN, rightMaxWidth - overlayTriggerReserve);
    return {
      shellBody,
      shellWidth,
      leftWidth,
      rightMaxWidth,
      overlayThreshold,
    };
  }, [leftCollapsed]);

  // 宽度只导出 docked / overlay_partial；overlay_full 是显式模式（见 applyPanelGeometry
  // 的 maximized 位），不再由"宽度≈上限"反推——否则左栏切换致 rightMaxWidth 变化时，
  // 用户主动扩大的 full 会被误降级为 partial、中间区重现。
  const deriveRightPanelMode = useCallback(
    (width: number, metrics: RightPanelLayoutMetrics): RightPanelMode => {
      if (width >= metrics.overlayThreshold) {
        return 'overlay_partial';
      }
      return 'docked';
    },
    [],
  );

  const clampPanelWidthToShell = useCallback(
    (width: number) => {
      const { rightMaxWidth } = readLayoutMetrics();
      const maxWidth = Math.max(
        RIGHT_PANEL_WIDTH_MIN,
        Math.min(RIGHT_PANEL_WIDTH_MAX, rightMaxWidth),
      );
      return Math.max(RIGHT_PANEL_WIDTH_MIN, Math.min(maxWidth, width));
    },
    [readLayoutMetrics],
  );

  const applyPanelGeometry = useCallback(
    (
      width: number,
      options?: {
        commitRestorable?: boolean;
        maximized?: boolean;
        updateState?: boolean;
        /** 左栏离散切换时把锚重定到实时阈值（事项 8），连续变化不传。 */
        rebaseAnchor?: boolean;
      },
    ) => {
      const metrics = readLayoutMetrics();
      // overlay_full 是"模式不变式"：占满 shell（width := rightMaxWidth），不再由宽度反推。
      const maximized = options?.maximized ?? maximizedRef.current;
      const targetWidth = maximized ? metrics.rightMaxWidth : width;
      const nextWidth = Math.max(
        RIGHT_PANEL_WIDTH_MIN,
        Math.min(Math.min(RIGHT_PANEL_WIDTH_MAX, metrics.rightMaxWidth), targetWidth),
      );
      const previousMode = rightPanelModeRef.current;
      const nextMode: RightPanelMode = maximized
        ? 'overlay_full'
        : deriveRightPanelMode(nextWidth, metrics);
      const nextAnchorWidth = resolveOverlayAnchorWidth(
        previousMode,
        nextMode,
        overlayAnchorWidthRef.current,
        metrics.overlayThreshold,
        options?.rebaseAnchor ?? false,
      );

      const effectiveAnchorWidth =
        nextAnchorWidth === undefined
          ? undefined
          : Math.max(RIGHT_PANEL_WIDTH_MIN, Math.min(nextAnchorWidth, metrics.rightMaxWidth));

      if (metrics.shellBody) {
        const widthValue = `${nextWidth}px`;
        if (metrics.shellBody.style.getPropertyValue('--rightpanel-width') !== widthValue) {
          metrics.shellBody.style.setProperty('--rightpanel-width', widthValue);
        }

        if (effectiveAnchorWidth !== undefined) {
          const anchorValue = `${effectiveAnchorWidth}px`;
          if (
            metrics.shellBody.style.getPropertyValue('--rightpanel-overlay-anchor-width') !==
            anchorValue
          ) {
            metrics.shellBody.style.setProperty('--rightpanel-overlay-anchor-width', anchorValue);
          }
        } else if (metrics.shellBody.style.getPropertyValue('--rightpanel-overlay-anchor-width')) {
          metrics.shellBody.style.removeProperty('--rightpanel-overlay-anchor-width');
        }
      }

      overlayAnchorWidthRef.current = effectiveAnchorWidth;
      rightPanelModeRef.current = nextMode;
      maximizedRef.current = nextMode === 'overlay_full';
      syncOverlayClasses(nextMode, metrics.shellBody);

      if (options?.updateState !== false) {
        setRightPanelMode((current) => (current === nextMode ? current : nextMode));
      }

      if (options?.commitRestorable && !maximized) {
        lastRestorableWidthRef.current = nextWidth;
        writePersistedLastRestorableWidth(nextWidth);
      }

      return { nextWidth, nextMode, effectiveAnchorWidth };
    },
    [deriveRightPanelMode, readLayoutMetrics, syncOverlayClasses],
  );

  // 拖拽收尾（事项 1-B）：把右面板拖到占满即等同点击"扩大"（进入 maximized 不变式，
  // 还原时回到拖拽起始宽度）；未到占满则按自由宽度提交。startWidth 取拖拽起始的 store 宽。
  const finalizeDragWidth = useCallback(
    (latestWidth: number, startWidth: number) => {
      const metrics = readLayoutMetrics();
      const fillsShell =
        latestWidth >= metrics.rightMaxWidth - 1 && metrics.rightMaxWidth <= RIGHT_PANEL_WIDTH_MAX;
      if (fillsShell) {
        lastRestorableWidthRef.current = clampPanelWidthToShell(startWidth);
        const { nextWidth } = applyPanelGeometry(metrics.rightMaxWidth, { maximized: true });
        setRightPanelWidth(nextWidth);
        return nextWidth;
      }
      const { nextWidth } = applyPanelGeometry(latestWidth, { commitRestorable: true });
      setRightPanelWidth(nextWidth);
      return nextWidth;
    },
    [applyPanelGeometry, clampPanelWidthToShell, readLayoutMetrics, setRightPanelWidth],
  );

  const handleResizeStart = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      // 手动拖拽即放弃"扩大"不变式：拖拽改的是自由宽度（docked/partial）。
      maximizedRef.current = false;
      const target = event.currentTarget;
      target.setPointerCapture(event.pointerId);
      const startX = event.clientX;
      const startWidth = rightPanelWidth;
      let latestWidth = startWidth;
      const body = document.body;
      const { shellBody } = readLayoutMetrics();
      draggingRef.current = true;
      body.classList.add('adl-is-resizing');
      shellBody?.classList.add('is-resizing');
      const applyPreviewWidth = (value: number) => {
        applyPanelGeometry(value, { updateState: false });
      };

      const handleMove = (moveEvent: PointerEvent) => {
        const delta = startX - moveEvent.clientX;
        latestWidth = clampPanelWidthToShell(startWidth + delta);
        if (resizeFrameRef.current !== null) {
          return;
        }
        resizeFrameRef.current = window.requestAnimationFrame(() => {
          resizeFrameRef.current = null;
          applyPreviewWidth(latestWidth);
        });
      };

      const cleanup = (endEvent: PointerEvent) => {
        draggingRef.current = false;
        body.classList.remove('adl-is-resizing');
        shellBody?.classList.remove('is-resizing');
        if (resizeFrameRef.current !== null) {
          window.cancelAnimationFrame(resizeFrameRef.current);
          resizeFrameRef.current = null;
        }
        finalizeDragWidth(latestWidth, startWidth);
        target.releasePointerCapture(endEvent.pointerId);
        target.removeEventListener('pointermove', handleMove);
        target.removeEventListener('pointerup', cleanup);
        target.removeEventListener('pointercancel', cleanup);
        target.removeEventListener('lostpointercapture', cleanup);
      };

      target.addEventListener('pointermove', handleMove);
      target.addEventListener('pointerup', cleanup);
      target.addEventListener('pointercancel', cleanup);
      target.addEventListener('lostpointercapture', cleanup);
    },
    [
      applyPanelGeometry,
      finalizeDragWidth,
      clampPanelWidthToShell,
      readLayoutMetrics,
      rightPanelWidth,
    ],
  );

  useEffect(() => {
    // 本轮 effect 是否由左栏收起/展开切换触发（事项 8）：是则本次直接同步带上
    // 锚重定；rAF 队列与可见性恢复走连续路径，不重定。
    const leftToggled = leftCollapsed !== prevLeftCollapsedRef.current;
    prevLeftCollapsedRef.current = leftCollapsed;
    const syncWidthToLayout = (rebaseAnchor: boolean) => {
      if (draggingRef.current) {
        return;
      }
      // 最小化/窗口被遮挡时视口瞬时坍缩（hidden、shell ≈ 0，或 Windows 最小化
      // 过渡态 inner≈144x19 而 shell 矩形滞后）：此时按 rightMaxWidth 收窄会把
      // 面板宽度错误地钳小并提交（恢复后右面板变窄）。退化时跳过被动同步，待恢复再补算。
      const metrics = readLayoutMetrics();
      if (
        shouldSkipPassiveLayoutSync(
          document.hidden,
          metrics.shellWidth,
          window.innerWidth,
          window.innerHeight,
        )
      ) {
        return;
      }
      const { nextWidth, nextMode } = applyPanelGeometry(rightPanelWidth, {
        commitRestorable: !maximizedRef.current,
        // 用户主动扩大（overlay_full）→ 模式不变式：任何布局变化都按新 rightMaxWidth
        // 补满（左栏展开/收起、窗口 resize 后仍占满）；非扩大则按自由宽度钳制。
        maximized: maximizedRef.current,
        rebaseAnchor,
      });
      if (nextWidth !== rightPanelWidth) {
        // 拖拽进行中（shellBody.is-resizing）时 store 写入会触发 App 重渲染，把拖拽中
        // 直写的 --leftbar-width 预览复位回 store 旧值（事项 1-A"无反应"的另一半）。
        // 拖拽结束由拖拽方显式 commit，此处只跟 DOM 几何（面板跟随），不写 store。
        if (!metrics.shellBody?.classList.contains('is-resizing')) {
          setRightPanelWidth(nextWidth);
        }
      } else if (nextMode !== rightPanelMode) {
        setRightPanelMode(nextMode);
      }
    };

    const queueSyncWidthToLayout = () => {
      if (draggingRef.current || syncFrameRef.current !== null) {
        return;
      }
      syncFrameRef.current = window.requestAnimationFrame(() => {
        syncFrameRef.current = null;
        syncWidthToLayout(false);
      });
    };

    syncWidthToLayout(leftToggled);
    // 可见性恢复时直接同步：隐藏期间挂起的 rAF 可能被浏览器暂停而不触发，
    // 不能把恢复寄托在它身上；先取消挂起帧再同步，保证恢复必算一次。
    // resize 与 visibility 同时触发时由 syncFrame 合并与 sync 幂等消化。
    const onVisibilityChange = () => {
      if (document.hidden) {
        queueSyncWidthToLayout();
        return;
      }
      if (syncFrameRef.current !== null) {
        window.cancelAnimationFrame(syncFrameRef.current);
        syncFrameRef.current = null;
      }
      syncWidthToLayout(false);
    };
    window.addEventListener('resize', queueSyncWidthToLayout);
    document.addEventListener('visibilitychange', onVisibilityChange);
    const shellBody = panelRef.current?.closest('.adl-shell__body') as HTMLElement | null;
    const leftbar = shellBody?.querySelector('.adl-leftbar') as HTMLElement | null;
    const leftbarResizeObserver =
      typeof ResizeObserver !== 'undefined' && leftbar
        ? new ResizeObserver(() => {
            queueSyncWidthToLayout();
          })
        : undefined;

    leftbarResizeObserver?.observe(leftbar!);

    return () => {
      window.removeEventListener('resize', queueSyncWidthToLayout);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      if (syncFrameRef.current !== null) {
        window.cancelAnimationFrame(syncFrameRef.current);
        syncFrameRef.current = null;
      }
      leftbarResizeObserver?.disconnect();
    };
  }, [
    applyPanelGeometry,
    leftCollapsed,
    readLayoutMetrics,
    rightPanelMode,
    rightPanelWidth,
    setRightPanelWidth,
  ]);

  useEffect(() => {
    syncOverlayClasses(rightPanelMode);
    const panelEl = panelRef.current;
    return () => {
      const shellBody = panelEl?.closest('.adl-shell__body') as HTMLElement | null;
      const panel = panelEl;
      if (!shellBody || !panel) {
        return;
      }
      shellBody.classList.remove('is-rightpanel-overlay-active');
      shellBody.classList.remove('is-rightpanel-overlay-expanded');
      panel.classList.remove('adl-rightpanel--overlay-active');
      panel.classList.remove('adl-rightpanel--overlay-expanded');
    };
  }, [rightPanelMode, syncOverlayClasses]);

  useEffect(() => {
    writePersistedRightPanelMode(rightPanelMode);
  }, [rightPanelMode]);

  // 供分隔线桥接条拖拽起始时清除"扩大"不变式（拖拽即自由宽度）。
  const clearMaximized = useCallback(() => {
    maximizedRef.current = false;
  }, []);

  return {
    panelRef,
    handleResizeStart,
    rightPanelMode,
    rightPanelWidth,
    applyPanelGeometry,
    finalizeDragWidth,
    lastRestorableWidthRef,
    readLayoutMetrics,
    clampPanelWidthToShell,
    setRightPanelWidth,
    clearMaximized,
  };
}
