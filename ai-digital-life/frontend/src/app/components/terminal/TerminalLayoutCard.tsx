// src/app/components/terminal/TerminalLayoutCard.tsx
import { useEffect, useRef, useState } from 'react';
import { IconClose } from '@icons';
import { paneColor } from '@features/terminal/paneColors';
import { useTCopy } from '@i18n/useTCopy';
import { clampPaneLabel, type TerminalPane } from '@stores/slices/terminalSliceTypes';

export interface TerminalLayoutCardProps {
  panes: TerminalPane[];
  onMove: (fromIndex: number, toIndex: number) => void;
  onSwap: (paneIdA: string, paneIdB: string) => void;
  onLabelChange: (paneId: string, label: string) => void;
  onClose: () => void;
}

/**
 * 自定义布局卡片：按 `panes` 顺序渲染彩色方块，提供拖拽排序、交换模式与双击标注。
 * 所有可见文案走 `useTCopy()`；卡片头部渲染关闭按钮并调用 `onClose`（宿主负责开合与外部点击/Esc）。
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
  const [editingPaneId, setEditingPaneId] = useState<string | null>(null);
  const [draftLabel, setDraftLabel] = useState('');
  const dragFromIndexRef = useRef<number | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);

  // 打开时把焦点移入卡片，使 role="dialog" 的内容在键盘/读屏下可达。
  useEffect(() => {
    cardRef.current?.focus();
  }, []);

  const enterSwap = () => {
    setSwapMode(true);
    setSelectedIds([]);
  };

  const exitSwap = () => {
    setSwapMode(false);
    setSelectedIds([]);
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
    onSwap(selectedIds[0], selectedIds[1]);
    exitSwap();
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
        <button
          type="button"
          className="adl-layout-card__close"
          onClick={onClose}
          aria-label={t.close}
        >
          <IconClose size={12} decorative />
        </button>
      </div>
      <div className="adl-layout-card__grid">
        {panes.map((pane, index) => {
          const selected = selectedIds.includes(pane.id);
          const editing = editingPaneId === pane.id;
          return (
            <div
              key={pane.id}
              className={`adl-layout-card__square${selected ? ' is-selected' : ''}${editing ? ' is-editing' : ''}`}
              style={{ background: paneColor(pane.colorIndex) }}
              role="button"
              tabIndex={0}
              aria-pressed={selected}
              draggable={!swapMode}
              onDragStart={(event) => {
                dragFromIndexRef.current = index;
                event.dataTransfer.setData('text/plain', String(index));
                event.dataTransfer.effectAllowed = 'move';
              }}
              onDragOver={(event) => {
                event.preventDefault();
              }}
              onDrop={(event) => {
                event.preventDefault();
                const fromIndex = dragFromIndexRef.current;
                dragFromIndexRef.current = null;
                if (fromIndex !== null && fromIndex !== index) {
                  onMove(fromIndex, index);
                }
              }}
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
      </div>
      <p className="adl-layout-card__hint">{t.terminalLayoutCardAnnotateHint}</p>
      <div className="adl-layout-card__actions">
        {swapMode ? (
          <>
            <button
              type="button"
              className="adl-layout-card__swap-confirm"
              disabled={selectedIds.length !== 2}
              onClick={confirmSwap}
            >
              {t.terminalLayoutCardSwapConfirm}
            </button>
            <button type="button" className="adl-layout-card__swap-cancel" onClick={exitSwap}>
              {t.terminalLayoutCardSwapCancel}
            </button>
          </>
        ) : (
          <button type="button" className="adl-layout-card__swap-toggle" onClick={enterSwap}>
            {t.terminalLayoutCardSwap}
          </button>
        )}
      </div>
    </div>
  );
}
