import { useCallback, useEffect, useRef, useState } from 'react';
import { isTauriShell } from '@shared/env';
import { useAppStore } from '@stores/slicedStore';
import { useShallow } from 'zustand/react/shallow';
import { useTCopy } from '@i18n/useTCopy';
import { getOverlayManager } from '@shared/overlayManager';
import { subscribeChannel } from '../../../tauri-bridge/tauri-shared';
import type { RightPanelMode } from '../../regions/right-panel/rightPanelLayout';
import type { ToolId } from '../../stores/types';
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
  activeRightTool: ToolId;
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
  // 透明桥接条是 straddle 在边界上的**原生子窗口**，永远盖在 HTML 之上：任何
  // DOM 浮层（对话框/菜单）与它重叠时都会被它抢走指针事件（"穿透"）。因此当
  // OverlayManager 检测到可见浮层时，必须先把桥接条藏起来（与 DSH / 浏览器
  // WebView2 的浮层隐藏策略一致）。
  const [domOverlayActive, setDomOverlayActive] = useState(false);
  useEffect(() => {
    if (!isTauriShell()) {
      return;
    }
    // panelRef 在首个 effect 即就绪（同一组件拥有的 aside）；若容器挂载滞后导致
    // lookup 失败，逐级回退到文档级查询直至 body（恒存在），避免"订阅丢失 →
    // 桥接条永不隐藏"的静默失效。回退到 body 时 conservative：任一浮层即隐藏。
    const shell =
      (panelRef.current?.closest('.adl-shell__body') as HTMLElement | null) ??
      document.querySelector<HTMLElement>('.adl-shell__body') ??
      document.body;
    if (!shell) {
      return;
    }
    return getOverlayManager().subscribe(shell, setDomOverlayActive);
  }, [panelRef]);

  const visible =
    shouldShowStrip({
      isTauri,
      dshOpen: dshOpen && !!dshUrl,
      startupHidden,
      browserToolVisible,
      hasBrowserTabs: tabCount > 0,
      centerObscured: rightPanelMode !== 'docked',
    }) && !domOverlayActive;
  const generation = stripGenerationKey({
    dshUrl: dshUrl ?? '',
    activeTabId: activeTabId ?? '',
    tabCount,
    siblingNonce,
  });

  const [themeTick, setThemeTick] = useState(0);
  const [initialTheme] = useState(resolveStripTheme);
  const themeRef = useRef<StripTheme>(initialTheme);
  const labelRef = useRef('');
  const langRef = useRef(locale);

  useEffect(() => {
    if (!isTauriShell()) {
      return;
    }
    // M-2：只在主题色实值变化时才 tick（style 内联抖动不再触发条带销毁重建）。
    const observer = new MutationObserver(() => {
      const next = resolveStripTheme();
      if (next.line !== themeRef.current.line || next.glow !== themeRef.current.glow) {
        themeRef.current = next;
        setThemeTick((v) => v + 1);
      }
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme', 'class', 'style'],
    });
    return () => observer.disconnect();
  }, []);

  // L-4：渲染体不写 ref（StrictMode/并发安全），每 commit 同步一次等价。
  useEffect(() => {
    labelRef.current = t.resizeSidebar;
    langRef.current = locale;
  });

  const layoutRef = useRef(options.layout);
  layoutRef.current = options.layout;
  const widthRef = useRef(rightPanelWidth);
  widthRef.current = rightPanelWidth;
  const visibleRef = useRef(visible);
  visibleRef.current = visible;

  const shownRef = useRef(false);
  const dragRef = useRef({ active: false, startWidth: 0, totalDx: 0, latestWidth: 0, lastSeq: 0 });
  const rafRef = useRef<number | null>(null);
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
          // N-1：show 即加载全新条页，其 seq 从 0 重计——旧 lastSeq 作废，
          // 否则重建后首轮拖拽被 M-1 守卫误杀。N-3：若重建恰发生在拖拽按住
          // 期间（极窄窗口），同步脱可能残留的拖拽态（与 M-3 卸载清理等价）。
          dragRef.current.lastSeq = 0;
          if (dragRef.current.active) {
            dragRef.current.active = false;
            document.body.classList.remove('adl-is-resizing');
            panelRef.current?.closest('.adl-shell__body')?.classList.remove('is-resizing');
          }
        } else {
          await bridge.dividerStripSetBounds(bounds);
        }
      } catch {
        shownRef.current = false;
      }
    },
    [computeBounds, panelRef],
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

  useEffect(() => {
    const dragState = dragRef.current;
    const panel = panelRef.current;
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
      // M-3：拖拽中途卸载时同步脱 resizing 态，防 body/shell 类泄漏。
      // 与 setResizing(false) 等价（同一 hook 生命周期，DOM 手柄侧无存活拖拽）。
      dragState.active = false;
      document.body.classList.remove('adl-is-resizing');
      panel?.closest('.adl-shell__body')?.classList.remove('is-resizing');
      hideNow();
    };
  }, [panelRef]);

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
      // IPC 边界校验：seq 必须有限（排序依据），phase 必须合法；畸形 payload
      // 直接丢弃，不得写入 lastSeq（NaN 会毒化后续所有比较）或挂起拖拽态。
      if (!payload || !Number.isFinite(payload.seq)) {
        return;
      }
      if (payload.phase !== 'start' && payload.phase !== 'move' && payload.phase !== 'end') {
        return;
      }
      // M-1：start 同样保序——迟到/重复的旧 start 不得复活已结束的拖拽。
      if (payload.seq <= drag.lastSeq) {
        return;
      }
      if (payload.phase === 'start') {
        drag.lastSeq = payload.seq;
        drag.active = true;
        drag.startWidth = widthRef.current;
        drag.totalDx = 0;
        drag.latestWidth = drag.startWidth;
        setResizing(true);
        return;
      }
      // :269 全局保序已保证 seq > lastSeq，且 start 分支是唯一的 lastSeq 写入点
      // 并直接 return，故此处 seq 比较恒为 false（死条件）——仅保留 active 守卫。
      if (!drag.active) {
        return;
      }
      // move/end 消费 dx：必须有限，否则 totalDx 变 NaN 会污染面板宽度。
      if (!Number.isFinite(payload.dx)) {
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
