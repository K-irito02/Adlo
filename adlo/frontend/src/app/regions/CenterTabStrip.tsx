import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from '@stores/slicedStore';
import { useTCopy } from '@i18n/useTCopy';
import { useTabTitleRename } from '../hooks/useTabTitleRename';
import { BrowserFavicon } from '@components/BrowserFavicon';
import { TooltipSimple } from '@components/Tooltip';
import { IconArrowDownRight, IconClose, IconNewTabPage, IconPlus, IconTerminal } from '@icons';
import { TerminalProfileIcon } from '@features/terminal/TerminalProfileIcon';
import { terminalPtyRuntime } from '@features/terminal/terminalPtyRuntime';
import { removeSiteMetaIfUnreferenced } from '@features/browser/siteMetaCleanup';
import { browserPool } from '@features/browser/browserPoolSingleton';
import type { CenterTabState } from '@stores/slices/centerTabsSlice';
import {
  CENTER_TAB_DRAG_THRESHOLD_PX,
  CENTER_TAB_EDGE_SCROLL_STEP_PX,
  CENTER_TAB_EDGE_SCROLL_ZONE_PX,
  calcDropIndex,
} from './centerTabDrag';

interface TabDragState {
  id: string;
  pointerId: number;
  startClientX: number;
  lastClientX: number;
  active: boolean;
  width: number;
  gap: number;
  baseLeft: number;
  grabDX: number;
  target: number;
  edgeDir: -1 | 0 | 1;
  raf: number;
  /** 激活时刻的标签 id 序列快照：拖拽中途外部增删导致失配时中止提交。 */
  snapshotIds: string[];
}

/**
 * 标题栏中心标签条：单行、溢出时内部横向滚动（滚动条隐藏，`onWheel` 把纵向滚轮映射到横向
 * `scrollLeft`，活动标签自动滚入视口），左右两侧控件组锁定宽度永不压缩。
 * 标签支持鼠标拖拽排序（B·滑动让位，mouse-only：触屏横滑保留原生滚动查看，
 * 触屏拖拽尝试以 pointercancel 安全中止）：整标签按住拖超 4px 进入拖拽，被拖项提起跟随指针，
 * 其余标签 transform 平滑让位，松手提交一次 centerReorderTabs；阈值内仍为单击选择。
 * 可拖拽区由容器的 `data-tauri-drag-region` 提供（标签/按钮不设该属性，
 * 点击标签不会拖动窗口）。右端 `+` 位于滚动区内、跟在最后一个标签之后；
 * 标签溢出后由 `position: sticky` 固定在右端（不随标签滚走）。
 */
export const CenterTabStrip = React.memo(function CenterTabStrip() {
  const { t } = useTCopy();
  const {
    centerTabs,
    centerActiveTabId,
    browserTabsById,
    terminalTabsById,
    centerRemoveTab,
    centerAddTab,
    centerReturnToPanel,
    browserCloseTab,
    terminalUpdateTab,
  } = useAppStore(
    useShallow((state) => ({
      centerTabs: state.centerTabs,
      centerActiveTabId: state.centerActiveTabId,
      browserTabsById: state.browserTabsById,
      terminalTabsById: state.terminalTabsById,
      centerRemoveTab: state.centerRemoveTab,
      centerAddTab: state.centerAddTab,
      centerReturnToPanel: state.centerReturnToPanel,
      browserCloseTab: state.browserCloseTab,
      terminalUpdateTab: state.terminalUpdateTab,
    })),
  );

  const scrollRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<TabDragState | null>(null);
  const suppressClickRef = useRef(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  // 滚动溢出的两侧渐隐：由滚动位置与内容宽度推导，供 CSS 显示/隐藏渐隐层。
  const [fadeEdges, setFadeEdges] = useState({ left: false, right: false });

  const updateFadeEdges = useCallback(() => {
    const el = scrollRef.current;
    if (!el) {
      return;
    }
    const maxScrollLeft = el.scrollWidth - el.clientWidth;
    const left = el.scrollLeft > 1;
    const right = maxScrollLeft > 1 && el.scrollLeft < maxScrollLeft - 1;
    setFadeEdges((prev) => (prev.left === left && prev.right === right ? prev : { left, right }));
  }, []);

  useEffect(() => {
    updateFadeEdges();
    const el = scrollRef.current;
    if (!el || typeof ResizeObserver === 'undefined') {
      return;
    }
    const observer = new ResizeObserver(updateFadeEdges);
    observer.observe(el);
    return () => observer.disconnect();
  }, [updateFadeEdges, centerTabs.length]);

  // 活动标签始终滚入视口：标签溢出后新增/切换的标签可能落在滚动区外，
  // 此时右侧控件组不再被挤压，改为内部滚动消化，此处保证活动标签可见。
  useEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller || !centerActiveTabId) {
      return;
    }
    const active = scroller.querySelector('[role="tab"][aria-selected="true"]');
    if (active instanceof HTMLElement) {
      // jsdom 无 scrollIntoView 实现：可选调用，生产浏览器才执行。
      active.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    }
  }, [centerActiveTabId, centerTabs.length]);

  // 终端类型中心标签的双击重命名（共享 useTabTitleRename；editingTabId 存底层终端
  // 标签 id = tab.refId，非中心标签 id）。
  const rename = useTabTitleRename(
    useCallback(
      (tabId: string, title: string) => terminalUpdateTab(tabId, { title }),
      [terminalUpdateTab],
    ),
  );

  const handleWheel = useCallback((event: React.WheelEvent<HTMLDivElement>) => {
    // 拖拽排序中滚轮不得抢夺滚动控制权（边缘自动滚动接管）。
    if (dragRef.current?.active) {
      return;
    }
    const el = scrollRef.current;
    if (!el) {
      return;
    }
    el.scrollLeft += event.deltaY;
  }, []);

  /** 取滚动区内的标签元素（DOM 顺序），`+` 按钮在独立容器，不在其中。 */
  const getTabElements = useCallback((): HTMLElement[] => {
    const scroller = scrollRef.current;
    if (!scroller) {
      return [];
    }
    // 标签包在 display:contents 的 tablist 容器里，不能再按直接子元素取。
    return Array.from(scroller.querySelectorAll<HTMLElement>('.adl-center-tab[role="tab"]'));
  }, []);

  /** 清除所有拖拽残留样式并停止边缘滚动，不提交。 */
  const cleanupDragStyles = useCallback(() => {
    const scroller = scrollRef.current;
    const drag = dragRef.current;
    if (drag && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(drag.raf);
    }
    if (scroller) {
      for (const el of getTabElements()) {
        el.style.transform = '';
        el.style.width = '';
        el.style.flex = '';
      }
      scroller.removeAttribute('data-dragging');
    }
    dragRef.current = null;
    setDraggingId(null);
  }, [getTabElements]);

  /** 按指针内容坐标重算被拖项位移与兄弟让位（transform 直写 DOM，不经过 render）。 */
  const moveDrag = useCallback(
    (drag: TabDragState, clientX: number) => {
      const scroller = scrollRef.current;
      if (!scroller) {
        return;
      }
      drag.lastClientX = clientX;
      const stripRect = scroller.getBoundingClientRect();
      const pointerContentX = clientX - stripRect.left + scroller.scrollLeft;
      let draggedLeft = pointerContentX - drag.grabDX;
      // 仅在可测量内容宽度时钳制（jsdom 下 scrollWidth 为 0，跳过）。
      if (scroller.scrollWidth > drag.width) {
        draggedLeft = Math.max(0, Math.min(scroller.scrollWidth - drag.width, draggedLeft));
      }
      const tabs = getTabElements();
      const draggedEl = tabs.find((el) => el.dataset.tabId === drag.id);
      if (!draggedEl) {
        return;
      }
      draggedEl.style.transform = `translateX(${draggedLeft - drag.baseLeft}px)`;
      const center = draggedLeft + drag.width / 2;
      const without = tabs.filter((el) => el.dataset.tabId !== drag.id);
      const midpoints = without.map((el) => el.offsetLeft + el.offsetWidth / 2);
      const target = calcDropIndex(midpoints, center);
      drag.target = target;
      const from = tabs.indexOf(draggedEl);
      // target 是去掉被拖项后的插入下标；换算为兄弟位移：
      // 右移时 (from, target] 左让，左移时 [target, from) 右让。
      without.forEach((el, i) => {
        if (target > from && i >= from && i < target) {
          el.style.transform = `translateX(${-(drag.width + drag.gap)}px)`;
        } else if (target <= from && i >= target && i < from) {
          el.style.transform = `translateX(${drag.width + drag.gap}px)`;
        } else {
          el.style.transform = '';
        }
      });
      // 边缘自动滚动：仅在真实溢出时启用（jsdom 无溢出，天然关闭）。
      const canOverflow = scroller.scrollWidth > scroller.clientWidth + 1;
      const visibleX = clientX - stripRect.left;
      drag.edgeDir =
        !canOverflow || stripRect.width === 0
          ? 0
          : visibleX < CENTER_TAB_EDGE_SCROLL_ZONE_PX
            ? -1
            : visibleX > stripRect.width - CENTER_TAB_EDGE_SCROLL_ZONE_PX
              ? 1
              : 0;
    },
    [getTabElements],
  );

  /** 边缘自动滚动循环：滚动一帧后用上次指针位置重算让位；无边缘压力时停转。 */
  const startEdgeLoop = useCallback(
    (drag: TabDragState) => {
      if (typeof requestAnimationFrame !== 'function') {
        return;
      }
      // reduced-motion 用户不自动滚动：拖后分段挪动即可，避免失控位移。
      if (
        typeof window.matchMedia === 'function' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches
      ) {
        return;
      }
      const step = () => {
        const scroller = scrollRef.current;
        if (!dragRef.current || dragRef.current !== drag || !drag.active || !scroller) {
          return;
        }
        if (drag.edgeDir === 0) {
          drag.raf = 0;
          return;
        }
        scroller.scrollLeft += drag.edgeDir * CENTER_TAB_EDGE_SCROLL_STEP_PX;
        moveDrag(drag, drag.lastClientX);
        drag.raf = requestAnimationFrame(step);
      };
      if (!drag.raf) {
        drag.raf = requestAnimationFrame(step);
      }
    },
    [moveDrag],
  );

  /** 激活拖拽：固定被拖项宽度、提起、启动边缘循环。 */
  const activateDrag = useCallback(
    (drag: TabDragState, tabEl: HTMLElement) => {
      const scroller = scrollRef.current;
      if (!scroller) {
        return;
      }
      drag.active = true;
      drag.width = tabEl.offsetWidth || tabEl.getBoundingClientRect().width || 120;
      const gapValue = Number.parseFloat(getComputedStyle(scroller).gap);
      drag.gap = Number.isFinite(gapValue) ? gapValue : 4;
      drag.baseLeft = tabEl.offsetLeft;
      const stripRect = scroller.getBoundingClientRect();
      drag.grabDX = drag.startClientX - stripRect.left + scroller.scrollLeft - drag.baseLeft;
      // target 初始化为全数组下标：删 from 再插 from 即复原，与 without 插入语义等价；
      // 每次 move 都会重算覆盖，此处仅为激活后未移动即松手的保底。
      drag.target = getTabElements().indexOf(tabEl);
      drag.snapshotIds = getTabElements().map((el) => el.dataset.tabId ?? '');
      tabEl.style.width = `${drag.width}px`;
      tabEl.style.flex = 'none';
      scroller.setAttribute('data-dragging', 'true');
      setDraggingId(drag.id);
      startEdgeLoop(drag);
    },
    [getTabElements, startEdgeLoop],
  );

  /**
   * 松手提交：仅当位置变化且激活快照与当前一致时写一次 store；选中态保持不变。
   * 返回落位标签 id（供清理后滚入视口），中止/无变化时返回 null。
   */
  const commitDrag = useCallback((drag: TabDragState): string | null => {
    // 防守：target 为初始 -1（激活后未经过 move）时不得写入首位。
    if (drag.target < 0) {
      return null;
    }
    const { centerTabs, centerReorderTabs } = useAppStore.getState();
    const from = centerTabs.findIndex((tab) => tab.id === drag.id);
    if (from < 0) {
      return null;
    }
    // 拖拽中途外部增删/重排（快照失配）则中止提交，避免错位写入；
    // 有序比较：纯重排（同集合不同顺序）同样中止。
    const currentIds = centerTabs.map((tab) => tab.id);
    if (
      currentIds.length !== drag.snapshotIds.length ||
      currentIds.some((id, index) => id !== drag.snapshotIds[index])
    ) {
      return null;
    }
    if (drag.target !== from) {
      const without = centerTabs.filter((tab) => tab.id !== drag.id);
      const clamped = Math.max(0, Math.min(without.length, drag.target));
      const next = [...without.slice(0, clamped), centerTabs[from], ...without.slice(clamped)];
      centerReorderTabs(next);
      return drag.id;
    }
    // 原地松手：零副作用，不滚不动。
    return null;
  }, []);

  /** 落位标签滚入视口（必须在清理 transform 之后调用，否则滚动量被污染）。 */
  const scrollTabIntoView = useCallback(
    (tabId: string) => {
      const movedEl = getTabElements().find((el) => el.dataset.tabId === tabId);
      movedEl?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    },
    [getTabElements],
  );

  const finishDrag = useCallback(
    (shouldCommit: boolean) => {
      const drag = dragRef.current;
      if (!drag) {
        return;
      }
      const wasActive = drag.active;
      if (typeof cancelAnimationFrame === 'function') {
        cancelAnimationFrame(drag.raf);
      }
      // 先算提交（只读布局+写 store），再清样式，最后滚动：滚动时 transform 已卸。
      const movedId = shouldCommit && wasActive ? commitDrag(drag) : null;
      cleanupDragStyles();
      if (movedId) {
        scrollTabIntoView(movedId);
      }
      // 拖拽后的 pointerup 连带 click 必须吞掉；cancel/blur/Escape 后无 click 跟随，不设。
      if (wasActive && shouldCommit) {
        suppressClickRef.current = true;
      }
    },
    [cleanupDragStyles, commitDrag, scrollTabIntoView],
  );

  /**
   * 指针抬起/取消的统一出口：校验一路指针与释放按键，只处理属于本次拖拽的事件。
   * 元素级 handler（pointer capture 正常时）与 window 兜底都会走到这里，幂等。
   * @param shouldCommit true = pointerup 路径（激活态才写 store）；false = cancel/blur/Escape，直接丢弃。
   */
  const handlePointerSettle = useCallback(
    (tabId: string, pointerId: number, button: number | undefined, shouldCommit: boolean) => {
      const drag = dragRef.current;
      if (!drag || drag.id !== tabId || drag.pointerId !== pointerId) {
        return;
      }
      // 非左键释放（如拖拽中误触右键抬起，同鼠标共享 pointerId）不得提交/取消本次拖拽。
      if (button !== undefined && button !== 0) {
        return;
      }
      finishDrag(shouldCommit);
    },
    [finishDrag],
  );

  // 常驻 window 兜底：捕获缺失/失败时元素外松手、失焦、Escape（激活态提交取消、
  // 阈值前 pending 直接丢弃）都能结束拖拽，不泄漏 dragRef 与残留样式。
  useEffect(() => {
    const onPointerUp = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (drag && event.pointerId === drag.pointerId) {
        if (event.button !== undefined && event.button !== 0) {
          return;
        }
        finishDrag(true);
      }
    };
    const onPointerCancel = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (drag && event.pointerId === drag.pointerId) {
        finishDrag(false);
      }
    };
    const onBlur = () => {
      if (dragRef.current) {
        finishDrag(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && dragRef.current) {
        finishDrag(false);
      }
    };
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerCancel);
    window.addEventListener('blur', onBlur);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      // 卸载即中止进行中拖拽，避免迟到事件在卸载后写 store。
      finishDrag(false);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerCancel);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [finishDrag]);

  const handleTabPointerDown = useCallback(
    (tab: CenterTabState, event: React.PointerEvent<HTMLDivElement>) => {
      // 陈旧 suppress 在任何指针按下时清除（含触屏点按，故必须在 pointerType 门控之前）；
      // 拖拽自带的连带 click 之前无新 pointerdown，不受影响。
      suppressClickRef.current = false;
      // mouse-only：触屏/触控笔不进入拖拽（触屏横滑保留原生滚动查看）。
      if (event.pointerType !== 'mouse') {
        return;
      }
      // 单次只处理一路拖拽（防多触第二指抢占）；非主键、操作按钮/输入框、
      // 重命名编辑态均不进入拖拽。
      if (dragRef.current) {
        return;
      }
      if (event.button != null && event.button !== 0) {
        return;
      }
      if ((event.target as HTMLElement).closest('button,input')) {
        return;
      }
      if (tab.kind === 'terminal' && tab.refId !== null && rename.editingTabId === tab.refId) {
        return;
      }
      dragRef.current = {
        id: tab.id,
        pointerId: event.pointerId,
        startClientX: event.clientX,
        lastClientX: event.clientX,
        active: false,
        width: 0,
        gap: 4,
        baseLeft: 0,
        grabDX: 0,
        target: -1,
        edgeDir: 0,
        raf: 0,
        snapshotIds: [],
      };
      try {
        event.currentTarget.setPointerCapture?.(event.pointerId);
      } catch {
        // jsdom 或无指针捕获环境可忽略。
      }
    },
    [rename.editingTabId],
  );

  const handleTabPointerMove = useCallback(
    (tab: CenterTabState, event: React.PointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current;
      // 非本次拖拽的一路指针（多触第二指等）一律忽略。
      if (!drag || drag.id !== tab.id || drag.pointerId !== event.pointerId) {
        return;
      }
      // 左键位丢失（捕获丢失后无键划过）即安全中止，不让拖拽无键跟随。
      if (event.buttons !== undefined && (event.buttons & 1) === 0) {
        finishDrag(false);
        return;
      }
      if (!drag.active) {
        if (Math.abs(event.clientX - drag.startClientX) <= CENTER_TAB_DRAG_THRESHOLD_PX) {
          return;
        }
        activateDrag(drag, event.currentTarget);
      }
      moveDrag(drag, event.clientX);
      // 边缘滚动循环在无压力时已停转，此处按需唤起。
      if (drag.edgeDir !== 0) {
        startEdgeLoop(drag);
      }
    },
    [activateDrag, finishDrag, moveDrag, startEdgeLoop],
  );

  /** 鼠标 click 路径：拖拽后的连带 click 在此被吞掉一次。 */
  const handleTabClick = useCallback((tab: CenterTabState) => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    useAppStore.getState().centerSelectTab(tab.id);
  }, []);

  /** 键盘 Enter/Space 路径：拖拽抑制只针对鼠标连带 click，键盘激活永不吞。 */
  const handleTabKeyActivate = useCallback((tab: CenterTabState) => {
    useAppStore.getState().centerSelectTab(tab.id);
  }, []);

  const handleClose = useCallback(
    (tab: CenterTabState) => {
      if (tab.kind === 'browser' && tab.refId) {
        const browserTab = browserTabsById[tab.refId];
        browserCloseTab(tab.refId);
        // browserCloseTab 只删 store 状态：中心路径不走面板关闭 wrapper，必须显式回收
        // 共享池条目与原生 WebView2，否则该 tabId 的 WebView 永久存活且无法再被回收。
        void browserPool.destroyTab(tab.refId).catch((e) => {
          console.warn('[center] browserPool.destroyTab failed:', e);
        });
        if (browserTab?.url) {
          removeSiteMetaIfUnreferenced(browserTab.url);
        }
      } else if (tab.kind === 'terminal' && tab.refId) {
        terminalPtyRuntime.handleCloseTab(tab.refId);
      }
      centerRemoveTab(tab.id);
    },
    [browserTabsById, browserCloseTab, centerRemoveTab],
  );

  const handleAdd = useCallback(() => {
    centerAddTab('launcher', null);
  }, [centerAddTab]);

  return (
    <div
      className="adl-center-tab-strip"
      data-fade-left={fadeEdges.left ? 'true' : 'false'}
      data-fade-right={fadeEdges.right ? 'true' : 'false'}
    >
      <div
        ref={scrollRef}
        className="adl-center-tab-strip__scroll"
        data-tauri-drag-region
        onWheel={handleWheel}
        onScroll={updateFadeEdges}
      >
        {/* tablist 只包住标签；「+」是动作按钮，不能作为 tablist 的 owned element。
            display: contents 让这层不参与布局，标签仍是滚动区的直接 flex 子项。 */}
        <div
          className="adl-center-tab-strip__tabs"
          role="tablist"
          aria-label={t.centerTabStripLabel}
        >
          {centerTabs.map((tab) => {
            const isActive = tab.id === centerActiveTabId;
            const browserTab =
              tab.kind === 'browser' && tab.refId ? browserTabsById[tab.refId] : null;
            const terminalTab =
              tab.kind === 'terminal' && tab.refId ? terminalTabsById[tab.refId] : null;

            let label: string;
            let icon: React.ReactNode;
            if (tab.kind === 'browser') {
              label = browserTab?.titleResolved ? browserTab.title : t.newTabPage;
              icon = <BrowserFavicon url={browserTab?.url ?? ''} />;
            } else if (tab.kind === 'terminal') {
              label = terminalTab?.title || t.terminalNewTerminal;
              icon = terminalTab ? (
                <TerminalProfileIcon profile={terminalTab.profile} />
              ) : (
                <IconTerminal size={14} decorative />
              );
            } else {
              label = t.centerNewTab;
              icon = <IconNewTabPage size={14} decorative />;
            }

            const showInPanelLabel =
              tab.kind === 'browser'
                ? t.centerTabShowInBrowserPanel
                : t.centerTabShowInTerminalPanel;
            // 是否展示「回到面板」按钮：单一判定，供 data-actions 与实际渲染共用
            const showReturn = tab.kind !== 'launcher' && tab.refId !== null;
            const isEditing =
              tab.kind === 'terminal' && tab.refId !== null && rename.editingTabId === tab.refId;
            const actionCount = showReturn ? 2 : 1;

            return (
              <div
                key={tab.id}
                role="tab"
                aria-selected={isActive}
                tabIndex={0}
                data-actions={actionCount}
                data-tab-id={tab.id}
                className={`adl-center-tab adl-clip-tab${isActive ? ' is-active' : ''}${draggingId === tab.id ? ' is-dragging' : ''}`}
                onClick={() => handleTabClick(tab)}
                onPointerDown={(event) => handleTabPointerDown(tab, event)}
                onPointerMove={(event) => handleTabPointerMove(tab, event)}
                onPointerUp={(event) =>
                  handlePointerSettle(tab.id, event.pointerId, event.button, true)
                }
                onPointerCancel={(event) =>
                  handlePointerSettle(tab.id, event.pointerId, event.button, false)
                }
                onDragStart={(event) => event.preventDefault()}
                onDoubleClick={() => {
                  // 编辑态内双击（如选中词）不得重置已输入文本
                  if (isEditing) {
                    return;
                  }
                  if (tab.kind === 'terminal' && tab.refId) {
                    rename.handleDoubleClick(tab.refId, terminalTab?.title || '');
                  }
                }}
                onKeyDown={(event) => {
                  // 仅处理标签本体聚焦的按键：不吞掉内部输入框/操作按钮冒泡上来的
                  // Enter/Space（否则重命名无法输入空格、按钮无法键盘激活）。
                  if (event.target !== event.currentTarget) {
                    return;
                  }
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    handleTabKeyActivate(tab);
                  }
                }}
              >
                {isEditing ? (
                  <input
                    ref={rename.editInputRef}
                    type="text"
                    value={rename.editValue}
                    onChange={(event) => rename.setEditValue(event.target.value)}
                    onBlur={rename.handleEditSubmit}
                    onKeyDown={rename.handleEditKeyDown}
                    className="adl-center-tab__edit"
                    aria-label={t.rename}
                  />
                ) : (
                  <>
                    <span className="adl-center-tab__icon" aria-hidden="true">
                      {icon}
                    </span>
                    <span className="adl-center-tab__label adl-clip-tab__label">{label}</span>
                    <span className="adl-center-tab__actions adl-clip-tab__actions">
                      {showReturn && (
                        <TooltipSimple content={showInPanelLabel} placement="bottom">
                          <button
                            type="button"
                            className="adl-icon-btn adl-icon-btn--xs"
                            onClick={(event) => {
                              event.stopPropagation();
                              centerReturnToPanel(tab.id);
                            }}
                            aria-label={showInPanelLabel}
                          >
                            <IconArrowDownRight size={12} decorative />
                          </button>
                        </TooltipSimple>
                      )}
                      <TooltipSimple content={t.close} placement="bottom">
                        <button
                          type="button"
                          className="adl-icon-btn adl-icon-btn--xs adl-icon-btn--danger-hover"
                          onClick={(event) => {
                            event.stopPropagation();
                            handleClose(tab);
                          }}
                          aria-label={t.close}
                        >
                          <IconClose size={12} decorative />
                        </button>
                      </TooltipSimple>
                    </span>
                  </>
                )}
              </div>
            );
          })}
        </div>
        {/* 「新建入口页」跟随最后一个标签；标签溢出滚动时由 sticky 固定在右端 */}
        <div className="adl-center-tab-strip__add">
          <TooltipSimple content={t.centerNewTab} placement="bottom">
            <button
              type="button"
              className="adl-icon-btn adl-icon-btn--xs"
              onClick={handleAdd}
              aria-label={t.centerNewTab}
            >
              <IconPlus size={14} decorative />
            </button>
          </TooltipSimple>
        </div>
      </div>
      <div className="adl-center-tab-strip__fade-left" aria-hidden="true" />
      <div className="adl-center-tab-strip__fade-right" aria-hidden="true" />
    </div>
  );
});
