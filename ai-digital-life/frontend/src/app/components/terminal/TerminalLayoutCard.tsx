// src/app/components/terminal/TerminalLayoutCard.tsx
import { useRef, useState } from 'react';
import { paneColor } from '@features/terminal/paneColors';
import { useTCopy } from '@i18n/useTCopy';
import type { TerminalPane } from '@stores/slices/terminalSliceTypes';

export interface TerminalLayoutCardProps {
  panes: TerminalPane[];
  onMove: (fromIndex: number, toIndex: number) => void;
  onSwap: (paneIdA: string, paneIdB: string) => void;
  onLabelChange: (paneId: string, label: string) => void;
  onClose: () => void;
}

/**
 * 标注限 1 个码点：按 Unicode 码点取首个，避免把代理对 / emoji 截半。
 * 与 `<input maxLength={1}>` 构成双保险。
 */
function clampLabel(value: string): string {
  return Array.from(value).slice(0, 1).join('');
}

/**
 * 自定义布局卡片：按 `panes` 顺序渲染彩色方块，提供拖拽排序、交换模式与双击标注。
 * 所有可见文案走 `useTCopy()`；`onClose` 由外层宿主接线（本卡片不渲染关闭入口）。
 */
export function TerminalLayoutCard({
  panes,
  onMove,
  onSwap,
  onLabelChange,
}: TerminalLayoutCardProps) {
  const { t } = useTCopy();
  const [swapMode, setSwapMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [editingPaneId, setEditingPaneId] = useState<string | null>(null);
  const [draftLabel, setDraftLabel] = useState('');
  const dragFromIndexRef = useRef<number | null>(null);

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
    setEditingPaneId(pane.id);
    setDraftLabel(pane.label ?? '');
  };

  const commitLabel = () => {
    if (editingPaneId === null) {
      return;
    }
    onLabelChange(editingPaneId, clampLabel(draftLabel));
    setEditingPaneId(null);
  };

  const cancelLabel = () => {
    setEditingPaneId(null);
  };

  return (
    <div className="adl-layout-card">
      <div className="adl-layout-card__grid">
        {panes.map((pane, index) => {
          const selected = selectedIds.includes(pane.id);
          const editing = editingPaneId === pane.id;
          return (
            <div
              key={pane.id}
              className={`adl-layout-card__square${selected ? ' is-selected' : ''}`}
              style={{ background: paneColor(pane.colorIndex) }}
              draggable={!swapMode}
              onDragStart={() => {
                dragFromIndexRef.current = index;
              }}
              onDragOver={(event) => {
                event.preventDefault();
              }}
              onDrop={() => {
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
            >
              {editing ? (
                <input
                  className="adl-layout-card__label-input"
                  value={draftLabel}
                  maxLength={1}
                  autoFocus
                  onChange={(event) => setDraftLabel(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      commitLabel();
                    } else if (event.key === 'Escape') {
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
