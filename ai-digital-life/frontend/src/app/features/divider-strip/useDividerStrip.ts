import { useCallback, useEffect, useRef, useState } from 'react';
import { isTauriShell } from '@shared/env';
import { useAppStore } from '@stores/slicedStore';
import { useShallow } from 'zustand/react/shallow';
import { useTCopy } from '@i18n/useTCopy';
import { getOverlayManager } from '@shared/overlayManager';
import { subscribeChannel } from '../../../tauri-bridge/tauri-shared';
import { useBrowserPool } from '@features/browser/useBrowserPool';
import type { RightPanelMode } from '../../regions/right-panel/rightPanelLayout';
import type { ToolId } from '../../stores/types';
import {
  isLiveBrowserWebView,
  resolveCenterWebView,
  shouldShowStrip,
  stripBoundsFromPanelRect,
  stripGenerationKey,
  applyStripDelta,
} from './dividerStripLogic';

interface DividerStripLayout {
  applyPanelGeometry: (
    width: number,
    options?: { commitRestorable?: boolean; maximized?: boolean; updateState?: boolean },
  ) => { nextWidth: number; nextMode: RightPanelMode; effectiveAnchorWidth: number | undefined };
  clampPanelWidthToShell: (width: number) => number;
  setRightPanelWidth: (width: number) => void;
  /** 拖拽起始：清除"扩大"不变式（拖拽即自由宽度，退出 overlay_full）。 */
  clearMaximized: () => void;
  /** 拖拽收尾：到占满即等同点击"扩大"，否则按自由宽度提交。 */
  finalizeDragWidth: (latestWidth: number, startWidth: number) => void;
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
 * 透明桥接条编排：面板边界命中带被原生 WebView 盖住时，在接缝上架起透明子
 * WebView（`adl-divider-strip`）并拥有拖拽。
 *
 * - 显隐：面板浏览器 WebView 压住边界的命中带（导航器收起 + 活动 tab 承载可见
 *   原生 WebView）才展示；与中心区/面板处于 docked 还是 overlay 无关（详见
 *   `shouldShowStrip`）。
 * - 排序：兄弟子窗口的新建会盖住桥接条，generation（中心 tab / 面板活动 tab /
 *   tab 数 / 兄弟创建计数）变化即销毁重建（重建即回到最上层）。
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

  const {
    isTauri,
    centerTabs,
    centerActiveTabId,
    browserTabsById,
    activeTabId,
    tabCount,
    startupHidden,
    navigatorCollapsedByTool,
    siblingNonce,
  } = useAppStore(
    useShallow((s) => ({
      isTauri: s.isTauri,
      centerTabs: s.centerTabs,
      centerActiveTabId: s.centerActiveTabId,
      browserTabsById: s.browserTabsById,
      activeTabId: s.browserActiveTabId,
      tabCount: s.browserTabs.length,
      startupHidden: s.startupOverlayHidden,
      navigatorCollapsedByTool: s.navigatorCollapsedByTool,
      siblingNonce: s.siblingWebviewNonce,
    })),
  );

  // 面板导航器收起 → 面板内容整体左移，面板自己的 WebView 左缘与面板左缘重合，
  // 正好把 DOM 手柄那条 3px（面板内侧）命中带盖住 → 必须由桥接条接管。
  const navigatorCollapsed = navigatorCollapsedByTool.browser ?? false;

  // 池成员是"该 tab 有活着的原生 WebView"的唯一权威来源（useBrowserPool 内部
  // useSyncExternalStore 订阅，池变化会重渲染本 hook）。此处只服务排序指纹。
  const { isTabInPool } = useBrowserPool();
  const centerView = resolveCenterWebView({
    centerTabs,
    centerActiveTabId,
    browserTabsById,
    isTabInPool,
  });

  const browserToolVisible = activeRightTool === 'browser' && !collapsed;
  // 透明桥接条是 straddle 在边界上的**原生子窗口**，永远盖在 HTML 之上：任何
  // DOM 浮层（对话框/菜单）与它重叠时都会被它抢走指针事件（"穿透"）。因此当
  // OverlayManager 检测到可见浮层时，必须先把桥接条藏起来（与中心/面板
  // 浏览器 WebView2 的浮层隐藏策略一致）。
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

  const visible = shouldShowStrip({
    isTauri,
    // ① 导航器收起（面板内容左移，WebView 贴边）且 ② 面板活动 tab 确实承载
    // 可见原生 WebView。②收紧了纯几何代理：生命周期页（about:blank/空 URL/
    // 未入池）时 WebView 已移出画面，命中带可被 DOM 手柄命中，无需条带。
    panelWebViewAtBoundary:
      navigatorCollapsed && isLiveBrowserWebView(activeTabId ?? '', browserTabsById, isTabInPool),
    startupHidden,
    browserToolVisible,
    hasBrowserTabs: tabCount > 0,
    domOverlayActive,
  });
  const generation = stripGenerationKey({
    centerTabId: centerView.tabId,
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
      if (!shownRef.current || recreate) {
        try {
          await bridge.dividerStripShow(
            bounds,
            themeRef.current,
            labelRef.current,
            langRef.current,
          );
        } catch (err) {
          // 桥接条是"看不见的基础设施"：静默失败会表现为"边界线拖不动"且无从排查，
          // 故显式 warn（与 useWebViewBounds 等 IPC 失败的处理口径一致）。
          console.warn('[divider-strip] show failed:', err);
          shownRef.current = false;
          return;
        }
        shownRef.current = true;
        // 反向竞态：show 在途期间显隐条件可能已翻转（面板收起/切工具/导航器展开）。
        // 此时原生条已建出但当前不再需要 —— 必须立即回收，否则 shownRef 与原生状态
        // 不一致（后续只走 setBounds，条带会一直留在画面上）。
        if (!visibleRef.current) {
          shownRef.current = false;
          await bridge.dividerStripHide().catch(() => {
            /* already gone */
          });
          return;
        }
        // N-1：show 即加载全新条页，其 seq 从 0 重计——旧 lastSeq 作废，
        // 否则重建后首轮拖拽被 M-1 守卫误杀。N-3：若重建恰发生在拖拽按住
        // 期间（极窄窗口），同步脱可能残留的拖拽态（与 M-3 卸载清理等价）。
        dragRef.current.lastSeq = 0;
        if (dragRef.current.active) {
          dragRef.current.active = false;
          document.body.classList.remove('adl-is-resizing');
          panelRef.current?.closest('.adl-shell__body')?.classList.remove('is-resizing');
        }
        return;
      }
      // setBounds 失败是瞬态的（常见于与 hide 竞态），**不得**把 shownRef 置假：
      // 否则下一次 reconcile 会退化为 show（销毁重建），把一次瞬态失败放大成条带闪烁。
      try {
        await bridge.dividerStripSetBounds(bounds);
      } catch (err) {
        console.warn('[divider-strip] setBounds failed:', err);
      }
    },
    [computeBounds, panelRef],
  );
  const reconcileRef = useRef(reconcile);
  reconcileRef.current = reconcile;

  // 挂载清理必须**先于**两个 reconcile effect 声明：effect 按声明顺序执行，若清理
  // 排在后面，则「挂载时 visible 已为真」的情形（右面板懒挂载/Suspense/ErrorBoundary
  // 重挂）会在同一 commit 内先 show 后 hide（异步 IPC 同序落地）→ 原生条被销毁，而
  // show 的 await 完成后又把 shownRef 置真 → 状态与原生不一致，条带持续缺失直到下次
  // generation/几何变化。前置声明后即为「先清陈旧条，再按当前条件 show」。
  //
  // 假设：panelRef 对象身份恒定（生产侧为 RightPanel 的 useRef；只有 props 变化、
  // 无 ref 重绑）。若该假设被破坏（deps 变化触发 cleanup+重跑而 reconcile effects
  // 不重跑），条带会缺失到下次 visible/generation/几何变化才恢复。
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
        // 拖拽即放弃"扩大"不变式（面板从 overlay_full 退为自由宽度）。
        layoutRef.current.clearMaximized();
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
      // 到占满即等同"扩大"，否则自由宽度提交（事项 1-B）。
      layoutRef.current.finalizeDragWidth(drag.latestWidth, drag.startWidth);
      setResizing(false);
    });
  }, [computeBounds, panelRef]);
}
