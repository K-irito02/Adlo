import { useCallback, useEffect, useRef, useState } from 'react';
import { RIGHT_PANEL_WIDTH_MIN, RIGHT_PANEL_WIDTH_MAX } from '../../../stores/slices/uiSlice';
import { useAppStore } from '../../../stores/slicedStore';
import { useShallow } from 'zustand/react/shallow';
import { deriveRightPanelOverlayState, type RightPanelMode } from '../rightPanelLayout';

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
    }))
  );

  const panelRef = useRef<HTMLElement | null>(null);
  const resizeFrameRef = useRef<number | null>(null);
  const syncFrameRef = useRef<number | null>(null);
  const draggingRef = useRef(false);
  const lastRestorableWidthRef = useRef(rightPanelWidth);
  const overlayAnchorWidthRef = useRef<number | undefined>(undefined);
  const rightPanelModeRef = useRef<RightPanelMode>('docked');
  const [rightPanelMode, setRightPanelMode] = useState<RightPanelMode>('docked');

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
    [collapsed]
  );

  const readLayoutMetrics = useCallback((): RightPanelLayoutMetrics => {
    const shellBody = panelRef.current?.closest('.adl-shell__body') as HTMLElement | null;
    const root = document.documentElement;
    const shellWidth = shellBody?.getBoundingClientRect().width ?? window.innerWidth;
    const leftbar = shellBody?.querySelector('.adl-leftbar') as HTMLElement | null;
    const cssLeftWidth =
      parseFloat(getComputedStyle(root).getPropertyValue('--leftbar-width')) || 0;
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

  const deriveRightPanelMode = useCallback(
    (width: number, metrics: RightPanelLayoutMetrics): RightPanelMode => {
      if (width >= metrics.rightMaxWidth - 1) {
        return 'overlay_full';
      }
      if (width >= metrics.overlayThreshold) {
        return 'overlay_partial';
      }
      return 'docked';
    },
    []
  );

  const clampPanelWidthToShell = useCallback(
    (width: number) => {
      const { rightMaxWidth } = readLayoutMetrics();
      const maxWidth = Math.max(
        RIGHT_PANEL_WIDTH_MIN,
        Math.min(RIGHT_PANEL_WIDTH_MAX, rightMaxWidth)
      );
      return Math.max(RIGHT_PANEL_WIDTH_MIN, Math.min(maxWidth, width));
    },
    [readLayoutMetrics]
  );

  const applyPanelGeometry = useCallback(
    (
      width: number,
      options?: { commitRestorable?: boolean; preserveFull?: boolean; updateState?: boolean }
    ) => {
      const metrics = readLayoutMetrics();
      const targetWidth = options?.preserveFull ? metrics.rightMaxWidth : width;
      const nextWidth = Math.max(
        RIGHT_PANEL_WIDTH_MIN,
        Math.min(Math.min(RIGHT_PANEL_WIDTH_MAX, metrics.rightMaxWidth), targetWidth)
      );
      const previousMode = rightPanelModeRef.current;
      const nextMode = deriveRightPanelMode(nextWidth, metrics);
      let nextAnchorWidth: number | undefined = overlayAnchorWidthRef.current;

      if (previousMode === 'docked' && nextMode !== 'docked') {
        nextAnchorWidth = metrics.overlayThreshold;
      } else if (nextMode === 'docked') {
        nextAnchorWidth = undefined;
      } else if (nextAnchorWidth === undefined) {
        nextAnchorWidth = metrics.overlayThreshold;
      }

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
      syncOverlayClasses(nextMode, metrics.shellBody);

      if (options?.updateState !== false) {
        setRightPanelMode((current) => (current === nextMode ? current : nextMode));
      }

      if (options?.commitRestorable && nextMode !== 'overlay_full') {
        lastRestorableWidthRef.current = nextWidth;
      }

      return { nextWidth, nextMode, effectiveAnchorWidth };
    },
    [deriveRightPanelMode, readLayoutMetrics, syncOverlayClasses]
  );

  const handleResizeStart = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      event.preventDefault();
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
        const { nextWidth } = applyPanelGeometry(latestWidth, { commitRestorable: true });
        setRightPanelWidth(nextWidth);
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
      clampPanelWidthToShell,
      readLayoutMetrics,
      rightPanelWidth,
      setRightPanelWidth,
    ]
  );

  useEffect(() => {
    const syncWidthToLayout = () => {
      if (draggingRef.current) {
        return;
      }
      const { nextWidth, nextMode } = applyPanelGeometry(rightPanelWidth, {
        commitRestorable: rightPanelMode !== 'overlay_full',
        preserveFull: rightPanelMode === 'overlay_full',
      });
      if (nextWidth !== rightPanelWidth) {
        setRightPanelWidth(nextWidth);
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
        syncWidthToLayout();
      });
    };

    syncWidthToLayout();
    window.addEventListener('resize', queueSyncWidthToLayout);
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
      if (syncFrameRef.current !== null) {
        window.cancelAnimationFrame(syncFrameRef.current);
        syncFrameRef.current = null;
      }
      leftbarResizeObserver?.disconnect();
    };
  }, [applyPanelGeometry, leftCollapsed, rightPanelMode, rightPanelWidth, setRightPanelWidth]);

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

  return {
    panelRef,
    handleResizeStart,
    rightPanelMode,
    rightPanelWidth,
    applyPanelGeometry,
    lastRestorableWidthRef,
    readLayoutMetrics,
    clampPanelWidthToShell,
    setRightPanelWidth,
  };
}
