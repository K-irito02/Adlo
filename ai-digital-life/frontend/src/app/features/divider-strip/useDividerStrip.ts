import { useCallback, useEffect, useRef, useState } from 'react';
import { isTauriShell } from '@shared/env';
import { useAppStore } from '@stores/slicedStore';
import { useShallow } from 'zustand/react/shallow';
import { useTCopy } from '@i18n/useTCopy';
import { subscribeChannel } from '../../../tauri-bridge/tauri-shared';
import type { RightPanelMode } from '../../regions/right-panel/rightPanelLayout';
import {
  shouldShowStrip,
  stripBoundsFromPanelRect,
  stripGenerationKey,
  applyStripDelta,
} from './dividerStripLogic';

interface DividerStripLayout {
  applyPanelGeometry: (
    width: number,
    options?: { commitRestorable?: boolean; preserveFull?: boolean; updateState?: boolean },
  ) => { nextWidth: number; nextMode: RightPanelMode; effectiveAnchorWidth: number | undefined };
  clampPanelWidthToShell: (width: number) => number;
  setRightPanelWidth: (width: number) => void;
}

interface StripDragPayload {
  seq: number;
  phase: 'start' | 'move' | 'end';
  dx: number;
}

interface StripTheme {
  line: string;
  glow: string;
}

function resolveStripTheme(): StripTheme {
  const styles = getComputedStyle(document.documentElement);
  return {
    line: styles.getPropertyValue('--border-subtle').trim() || '#c8c8c8',
    glow: styles.getPropertyValue('--text-secondary').trim() || '#888888',
  };
}

/**
 * 透明桥接条编排：dsh WebView 与浏览器 WebView 零间隙贴边时，
 * 在接缝上架起透明子 WebView（`adl-divider-strip`）并拥有拖拽。
 *
 * - 显隐：两侧 WebView 同时在线 + docked 相邻才展示；任一条件消失即销毁。
 * - 排序：兄弟子窗口的新建会盖住桥接条，generation（dshUrl/activeTab/tab 数）
 *   变化即销毁重建（重建即回到最上层）。
 * - 跟随：面板几何变化只调 bounds（子窗口随主窗口移动，无需跟随逻辑）。
 * - 拖拽：桥接条只回传增量，几何计算复用面板现有逻辑（clamp/overlay 阈值/持久化）。
 */
export function useDividerStrip(options: {
  panelRef: React.RefObject<HTMLElement | null>;
  collapsed: boolean;
  activeRightTool: string;
  rightPanelWidth: number;
  rightPanelMode: RightPanelMode;
  leftCollapsed: boolean;
  layout: DividerStripLayout;
}): void {
  const { panelRef, collapsed, activeRightTool, rightPanelWidth, rightPanelMode } = options;
  const { t, locale } = useTCopy();

  const { isTauri, dshUrl, dshOpen, startupHidden, tabCount, activeTabId, siblingNonce } =
    useAppStore(
      useShallow((s) => ({
        isTauri: s.isTauri,
        dshUrl: s.url,
        dshOpen: s.isOpen,
        startupHidden: s.startupOverlayHidden,
        tabCount: s.browserTabs.length,
        activeTabId: s.browserActiveTabId,
        siblingNonce: s.siblingWebviewNonce,
      })),
    );

  const browserToolVisible = activeRightTool === 'browser' && !collapsed;
  const visible = shouldShowStrip({
    isTauri,
    dshOpen: dshOpen && !!dshUrl,
    startupHidden,
    browserToolVisible,
    hasBrowserTabs: tabCount > 0,
    centerObscured: rightPanelMode !== 'docked',
  });
  const generation = stripGenerationKey({
    dshUrl: dshUrl ?? '',
    activeTabId: activeTabId ?? '',
    tabCount,
    siblingNonce,
  });

  const [themeTick, setThemeTick] = useState(0);
  useEffect(() => {
    if (!isTauriShell()) {
      return;
    }
    const observer = new MutationObserver(() => setThemeTick((v) => v + 1));
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme', 'class', 'style'],
    });
    return () => observer.disconnect();
  }, []);

  // 主题只在 tick/locale 变化时读取（S8：渲染体不再逐帧 getComputedStyle）。
  const [initialTheme] = useState(resolveStripTheme);
  const themeRef = useRef<StripTheme>(initialTheme);
  const labelRef = useRef('');
  const langRef = useRef(locale);
  labelRef.current = t.resizeSidebar;
  langRef.current = locale;

  useEffect(() => {
    themeRef.current = resolveStripTheme();
  }, [themeTick, locale]);

  const layoutRef = useRef(options.layout);
  layoutRef.current = options.layout;
  const widthRef = useRef(rightPanelWidth);
  widthRef.current = rightPanelWidth;
  const visibleRef = useRef(visible);
  visibleRef.current = visible;

  const shownRef = useRef(false);
  const computeBounds = useCallback(() => {
    const panel = panelRef.current;
    if (!panel) {
      return null;
    }
    const rect = panel.getBoundingClientRect();
    return stripBoundsFromPanelRect({ left: rect.left, top: rect.top, height: rect.height });
  }, [panelRef]);

  const reconcile = useCallback(
    async (recreate: boolean): Promise<void> => {
      const bridge = window.digitalLife?.browser;
      if (!bridge || !visibleRef.current) {
        if (shownRef.current) {
          shownRef.current = false;
          try {
            await bridge?.dividerStripHide();
          } catch {
            /* already gone */
          }
        }
        return;
      }
      const bounds = computeBounds();
      if (!bounds) {
        return;
      }
      try {
        if (!shownRef.current || recreate) {
          await bridge.dividerStripShow(
            bounds,
            themeRef.current,
            labelRef.current,
            langRef.current,
          );
          shownRef.current = true;
        } else {
          await bridge.dividerStripSetBounds(bounds);
        }
      } catch {
        shownRef.current = false;
      }
    },
    [computeBounds],
  );
  const reconcileRef = useRef(reconcile);
  reconcileRef.current = reconcile;

  useEffect(() => {
    void reconcileRef.current(true);
  }, [visible, generation, themeTick, locale]);

  useEffect(() => {
    void reconcileRef.current(false);
  }, [rightPanelWidth, rightPanelMode, options.leftCollapsed]);

  useEffect(() => {
    const onResize = () => {
      void reconcileRef.current(false);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const dragRef = useRef({ active: false, startWidth: 0, totalDx: 0, latestWidth: 0, lastSeq: 0 });
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const hideNow = () => {
      shownRef.current = false;
      window.digitalLife?.browser?.dividerStripHide().catch(() => {
        /* already gone */
      });
    };
    // 挂载时清陈旧条（热更新/崩溃残留）；卸载时同样清理，防条泄漏（S2）。
    hideNow();
    return () => {
      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      hideNow();
    };
  }, []);

  useEffect(() => {
    if (!isTauriShell()) {
      return;
    }
    const shellOf = () => panelRef.current?.closest('.adl-shell__body') as HTMLElement | null;
    const setResizing = (on: boolean) => {
      document.body.classList.toggle('adl-is-resizing', on);
      shellOf()?.classList.toggle('is-resizing', on);
    };

    return subscribeChannel<StripDragPayload>('digital-life://divider-strip-drag', (payload) => {
      const drag = dragRef.current;
      if (payload.phase === 'start') {
        drag.lastSeq = payload.seq;
        drag.active = true;
        drag.startWidth = widthRef.current;
        drag.totalDx = 0;
        drag.latestWidth = drag.startWidth;
        setResizing(true);
        return;
      }
      if (!drag.active || payload.seq <= drag.lastSeq) {
        return;
      }
      drag.lastSeq = payload.seq;
      if (payload.phase !== 'move' && payload.phase !== 'end') {
        return;
      }
      if (payload.phase === 'move') {
        drag.totalDx += payload.dx;
        drag.latestWidth = applyStripDelta(
          drag.startWidth,
          drag.totalDx,
          layoutRef.current.clampPanelWidthToShell,
        );
        if (rafRef.current !== null) {
          return;
        }
        rafRef.current = window.requestAnimationFrame(() => {
          rafRef.current = null;
          layoutRef.current.applyPanelGeometry(drag.latestWidth, { updateState: false });
          const bounds = computeBounds();
          if (bounds) {
            window.digitalLife?.browser?.dividerStripSetBounds(bounds).catch(() => {
              /* transient race with hide */
            });
          }
        });
        return;
      }
      drag.active = false;
      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      // end 自带尾帧位移：先并入 totalDx 再提交，move/end 乱序也不丢尾帧（S20）。
      drag.totalDx += payload.dx;
      drag.latestWidth = applyStripDelta(
        drag.startWidth,
        drag.totalDx,
        layoutRef.current.clampPanelWidthToShell,
      );
      const { nextWidth } = layoutRef.current.applyPanelGeometry(drag.latestWidth, {
        commitRestorable: true,
      });
      layoutRef.current.setRightPanelWidth(nextWidth);
      setResizing(false);
    });
  }, [computeBounds, panelRef]);
}
