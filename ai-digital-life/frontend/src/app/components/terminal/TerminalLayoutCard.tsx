// src/app/components/terminal/TerminalLayoutCard.tsx
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { IconClose, IconSwapPositions } from '@icons';
import { paneColor } from '@features/terminal/paneColors';
import { computeGrid } from '@features/terminal/terminalPaneLayout';
import { useTCopy } from '@i18n/useTCopy';
import { clampPaneLabel, type TerminalPane } from '@stores/slices/terminalSliceTypes';

export interface TerminalLayoutCardProps {
  panes: TerminalPane[];
  onMove: (fromIndex: number, toIndex: number) => void;
  onSwap: (paneIdA: string, paneIdB: string) => void;
  onLabelChange: (paneId: string, label: string) => void;
  onClose: () => void;
}

/** 卡片方块固定边长（px）：与窗格数量无关；CSS 侧 `.adl-layout-card__square` 同值（改一边必须改另一边）。 */
export const LAYOUT_CARD_TILE_PX = 40;

/** 方块间距（px）：与 CSS 侧 `gap: var(--space-2, 8px)` 同值（改一边必须改另一边）。 */
const TILE_GAP_PX = 8;

/** 槽位步长 = 边长 + 间距：FLIP 位移动画与落点换算共用。 */
const SLOT_STEP_PX = LAYOUT_CARD_TILE_PX + TILE_GAP_PX;

/** 指针拖拽判定为拖拽的最小位移（px），小于此视为点击。 */
const DRAG_THRESHOLD_PX = 6;

interface CardDragState {
  paneId: string;
  startX: number;
  startY: number;
  active: boolean;
}

/**
 * 自定义布局卡片：方块排版与终端实时显示区一一对应（`computeGrid` 行主序），
 * 提供拖拽排序、交换模式与双击标注。
 * 所有可见文案走 `useTCopy()`；卡片头部渲染交换图标 + 关闭按钮并调用 `onClose`
 *（宿主负责开合与外部点击/Esc）。
 *
 * 排序动画（用户选型 B 缝隙滑动）：拖拽中只改卡片本地顺序（FLIP 补间滑动，
 * 被拖方块提起），松手才一次 `onMove` 提交；取消则本地状态直接丢弃，
 * store 零抖动。指针事件在所有宿主行为一致（WebView2 原生 DnD 不可靠）。
 */
export function TerminalLayoutCard({
  panes,
  onMove,
  onSwap,
  onLabelChange,
  onClose,
}: TerminalLayoutCardProps) {
  const { t } = useTCopy();
  const [swapMode, setSwapMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  // 已执行的交换历史（按 pane id 记录）：撤回 = 把最后一对再交换一次
  //（交换是自逆操作）。退出模式时清空。
  const [swapHistory, setSwapHistory] = useState<[string, string][]>([]);
  const [editingPaneId, setEditingPaneId] = useState<string | null>(null);
  const [draftLabel, setDraftLabel] = useState('');
  // 拖拽中的本地顺序（null = 跟随 panes prop）；提交/取消后清空。
  const [localOrder, setLocalOrder] = useState<string[] | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const dragRef = useRef<CardDragState | null>(null);
  const gridRef = useRef<HTMLDivElement | null>(null);
  const tileEls = useRef(new Map<string, HTMLDivElement>());
  const prevSlots = useRef(new Map<string, number>());
  const onMoveRef = useRef(onMove);
  onMoveRef.current = onMove;
  const cardRef = useRef<HTMLDivElement | null>(null);

  // 方块排版与终端实时显示区一致：行主序 cols×rows，不足末行留空占位。
  const { cols, rows } = computeGrid(panes.length);
  const placeholderCount = Math.max(0, cols * rows - panes.length);

  const paneIds = panes.map((pane) => pane.id);
  const idsKey = paneIds.join(' ');
  // 本地顺序仅在 id 集合一致时有效；外部增删窗格即回退到 prop（拖拽一并中止）。
  const localValid =
    localOrder !== null &&
    localOrder.length === paneIds.length &&
    localOrder.every((id) => paneIds.includes(id));
  const displayIds = localValid && localOrder !== null ? localOrder : paneIds;
  const displayKey = displayIds.join(' ');

  // 打开时把焦点移入卡片，使 role="dialog" 的内容在键盘/读屏下可达。
  useEffect(() => {
    cardRef.current?.focus();
  }, []);

  // 外部 panes 集合变化（提交落盘回流/增删窗格/交换）：丢弃本地顺序，
  // 中止拖拽视觉；纯顺序变化（交换/提交）由 FLIP 补间。
  useEffect(() => {
    setLocalOrder(null);
    if (dragRef.current) {
      dragRef.current = null;
      setDraggingId(null);
    }
  }, [idsKey]);

  // FLIP：displayIds 变化时，把新旧槽位差补间成位移动画。
  useLayoutEffect(() => {
    const prev = prevSlots.current;
    const reduceMotion =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const sameSet = prev.size === displayIds.length && displayIds.every((id) => prev.has(id));
    if (sameSet && !reduceMotion) {
      const slotCol = (slot: number) => slot % Math.max(1, cols);
      const slotRow = (slot: number) => Math.floor(slot / Math.max(1, cols));
      for (let slot = 0; slot < displayIds.length; slot += 1) {
        const id = displayIds[slot];
        const prevSlot = prev.get(id);
        if (prevSlot === undefined || prevSlot === slot) {
          continue;
        }
        const el = tileEls.current.get(id);
        if (!el) {
          continue;
        }
        const dx = (slotCol(prevSlot) - slotCol(slot)) * SLOT_STEP_PX;
        const dy = (slotRow(prevSlot) - slotRow(slot)) * SLOT_STEP_PX;
        // 起点先摆回去（无过渡），强制回流后再松手让 CSS 过渡接管滑动。
        el.style.transition = 'none';
        el.style.transform = `translate(${dx}px, ${dy}px)`;
        void el.offsetWidth;
        el.style.transition = '';
        el.style.transform = '';
      }
    }
    prevSlots.current = new Map(displayIds.map((id, index) => [id, index] as const));
    // displayKey 即 displayIds 的字符串身份（同值同键），故仅依赖它，避免数组身份抖动。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayKey, cols]);

  // 文档监听闭包用的最新值镜像（监听只注册一次，cols/rows 变化除外）。
  const paneIdsRef = useRef(paneIds);
  paneIdsRef.current = paneIds;
  const localOrderRef = useRef(localOrder);
  localOrderRef.current = localOrder;

  // 文档级 move/up：一次注册，读 ref 里的拖拽态（避免闭包过期）。
  useEffect(() => {
    const slotFromPoint = (clientX: number, clientY: number): number => {
      const grid = gridRef.current;
      const lane = Math.max(1, cols);
      if (!grid) {
        return 0;
      }
      const rect = grid.getBoundingClientRect();
      const col = Math.floor((clientX - rect.left) / SLOT_STEP_PX);
      const row = Math.floor((clientY - rect.top) / SLOT_STEP_PX);
      const slot = row * lane + col;
      // 钳到网格内；占位槽映射到末尾。
      const clamped = Math.max(0, Math.min(slot, lane * rows - 1));
      return Math.min(clamped, Math.max(0, paneIdsRef.current.length - 1));
    };
    const handleDocMove = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) {
        return;
      }
      if (!drag.active) {
        if (
          Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) <= DRAG_THRESHOLD_PX
        ) {
          return;
        }
        drag.active = true;
        setDraggingId(drag.paneId);
      }
      const current = localOrderRef.current ?? paneIdsRef.current;
      const from = current.indexOf(drag.paneId);
      const target = slotFromPoint(event.clientX, event.clientY);
      if (from !== -1 && target !== from) {
        const next = [...current];
        const [moved] = next.splice(from, 1);
        next.splice(target, 0, moved);
        setLocalOrder(next);
      }
    };
    const finishDocDrag = (kind: string) => {
      const drag = dragRef.current;
      if (!drag) {
        return;
      }
      dragRef.current = null;
      setDraggingId(null);
      const finalOrder = localOrderRef.current;
      setLocalOrder(null);
      if (!drag.active) {
        return;
      }
      if (kind === 'cancel' || !finalOrder) {
        return;
      }
      // 本地多步移动等价于一次 remove+insert（其余方块相对顺序不变），
      // 故单次 onMove 即可复现最终排布。
      const fromOrig = paneIdsRef.current.indexOf(drag.paneId);
      const toFinal = finalOrder.indexOf(drag.paneId);
      if (fromOrig !== -1 && toFinal !== -1 && fromOrig !== toFinal) {
        onMoveRef.current(fromOrig, toFinal);
      }
    };
    const handleDocUp = () => finishDocDrag('drop');
    const handleDocCancel = () => finishDocDrag('cancel');
    document.addEventListener('pointermove', handleDocMove);
    document.addEventListener('pointerup', handleDocUp);
    document.addEventListener('pointercancel', handleDocCancel);
    return () => {
      document.removeEventListener('pointermove', handleDocMove);
      document.removeEventListener('pointerup', handleDocUp);
      document.removeEventListener('pointercancel', handleDocCancel);
    };
  }, [cols, rows]);

  const enterSwap = () => {
    setSwapMode(true);
    setSelectedIds([]);
  };

  const exitSwap = () => {
    setSwapMode(false);
    setSelectedIds([]);
    setSwapHistory([]);
  };

  /** 撤回上次交换：把历史最后一对再交换一次（自逆），保留模式。 */
  const revertLastSwap = () => {
    const last = swapHistory[swapHistory.length - 1];
    if (!last) {
      return;
    }
    onSwap(last[0], last[1]);
    setSwapHistory(swapHistory.slice(0, -1));
  };

  const toggleSelection = (paneId: string) => {
    setSelectedIds((prev) => {
      if (prev.includes(paneId)) {
        return prev.filter((id) => id !== paneId);
      }
      if (prev.length >= 2) {
        return prev;
      }
      return [...prev, paneId];
    });
  };

  const confirmSwap = () => {
    if (selectedIds.length !== 2) {
      return;
    }
    // 交换后保留模式（不清历史）：用户可连续交换，撤回逐次撤销。
    onSwap(selectedIds[0], selectedIds[1]);
    setSwapHistory((prev) => [...prev, [selectedIds[0], selectedIds[1]]]);
    setSelectedIds([]);
  };

  const beginLabelEdit = (pane: TerminalPane) => {
    // 双保险：编辑输入框上的双击会冒泡回方块，此处直接短路，避免把草稿重置为已存值。
    if (editingPaneId === pane.id) {
      return;
    }
    setEditingPaneId(pane.id);
    setDraftLabel(pane.label ?? '');
  };

  const commitLabel = () => {
    if (editingPaneId === null) {
      return;
    }
    onLabelChange(editingPaneId, clampPaneLabel(draftLabel));
    setEditingPaneId(null);
  };

  const cancelLabel = () => {
    setEditingPaneId(null);
  };

  const beginPotentialDrag = (paneId: string, event: React.PointerEvent) => {
    if (swapMode || editingPaneId !== null) {
      return;
    }
    if (event.pointerType === 'mouse' && event.button !== 0) {
      return;
    }
    dragRef.current = {
      paneId,
      startX: event.clientX,
      startY: event.clientY,
      active: false,
    };
  };

  const paneById = new Map(panes.map((pane) => [pane.id, pane] as const));

  return (
    <div
      className="adl-layout-card"
      role="dialog"
      aria-modal="true"
      aria-label={t.terminalCustomLayout}
      tabIndex={-1}
      ref={cardRef}
    >
      <div className="adl-layout-card__header">
        <span className="adl-layout-card__title">{t.terminalCustomLayout}</span>
        <div className="adl-layout-card__header-actions">
          {!swapMode ? (
            <button
              type="button"
              className="adl-layout-card__swap-iconbtn"
              onClick={enterSwap}
              aria-label={t.terminalLayoutCardSwapMode}
              title={t.terminalLayoutCardSwapMode}
            >
              <IconSwapPositions size={12} decorative />
            </button>
          ) : null}
          <button
            type="button"
            className="adl-layout-card__close"
            onClick={onClose}
            aria-label={t.close}
          >
            <IconClose size={12} decorative />
          </button>
        </div>
      </div>
      <div
        className="adl-layout-card__grid"
        ref={gridRef}
        style={{
          gridTemplateColumns: `repeat(${Math.max(1, cols)}, ${LAYOUT_CARD_TILE_PX}px)`,
        }}
      >
        {displayIds.map((paneId) => {
          const pane = paneById.get(paneId);
          if (!pane) {
            return null;
          }
          const selected = selectedIds.includes(pane.id);
          const editing = editingPaneId === pane.id;
          const isDragging = draggingId === pane.id;
          return (
            <div
              key={pane.id}
              ref={(el) => {
                if (el) {
                  tileEls.current.set(pane.id, el);
                } else {
                  tileEls.current.delete(pane.id);
                }
              }}
              className={`adl-layout-card__square${selected ? ' is-selected' : ''}${isDragging ? ' is-dragging' : ''}`}
              style={{ background: paneColor(pane.colorIndex) }}
              role="button"
              tabIndex={0}
              aria-pressed={selected}
              onPointerDown={(event) => beginPotentialDrag(pane.id, event)}
              // 禁用原生 HTML5 拖拽：排序走指针事件，避免双通道冲突。
              onDragStart={(event) => event.preventDefault()}
              onClick={() => {
                if (swapMode) {
                  toggleSelection(pane.id);
                }
              }}
              onDoubleClick={() => {
                if (!swapMode) {
                  beginLabelEdit(pane);
                }
              }}
              onKeyDown={(event) => {
                // 编辑中：键盘事件由输入框处理（Enter 提交 / Esc 取消），方块不再介入。
                if (editingPaneId === pane.id) {
                  return;
                }
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  if (swapMode) {
                    toggleSelection(pane.id);
                  } else {
                    beginLabelEdit(pane);
                  }
                }
              }}
            >
              {editing ? (
                <input
                  className="adl-layout-card__label-input"
                  value={draftLabel}
                  autoFocus
                  onChange={(event) => setDraftLabel(event.target.value)}
                  onDoubleClick={(event) => event.stopPropagation()}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      commitLabel();
                    } else if (event.key === 'Escape') {
                      // 先只取消编辑：阻止冒泡，避免文档级 Esc 监听同时关闭卡片。
                      event.stopPropagation();
                      cancelLabel();
                    }
                  }}
                  onBlur={commitLabel}
                />
              ) : (
                pane.label
              )}
            </div>
          );
        })}
        {Array.from({ length: placeholderCount }, (_, i) => (
          <div
            key={`placeholder-${i}`}
            className="adl-layout-card__square adl-layout-card__square--placeholder"
            aria-hidden="true"
          />
        ))}
      </div>
      <p className="adl-layout-card__hint">
        {swapMode ? t.terminalLayoutCardSwapHint : t.terminalLayoutCardAnnotateHint}
      </p>
      {swapMode ? (
        <div className="adl-layout-card__actions adl-layout-card__actions--swap">
          <button
            type="button"
            className="adl-btn adl-btn--ghost adl-btn--square"
            disabled={selectedIds.length !== 2}
            onClick={confirmSwap}
          >
            {t.terminalLayoutCardSwapConfirm}
          </button>
          <button
            type="button"
            className="adl-btn adl-btn--ghost adl-btn--square"
            disabled={swapHistory.length === 0}
            onClick={revertLastSwap}
          >
            {t.terminalLayoutCardSwapRevert}
          </button>
          <button
            type="button"
            className="adl-btn adl-btn--ghost adl-btn--square"
            onClick={exitSwap}
          >
            {t.terminalLayoutCardSwapCancel}
          </button>
        </div>
      ) : null}
    </div>
  );
}
