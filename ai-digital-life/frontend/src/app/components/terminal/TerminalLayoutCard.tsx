// src/app/components/terminal/TerminalLayoutCard.tsx
import { paneColor } from '@features/terminal/paneColors';
import type { TerminalPane } from '@stores/slices/terminalSliceTypes';

export interface TerminalLayoutCardProps {
  panes: TerminalPane[];
  onMove: (fromIndex: number, toIndex: number) => void;
  onSwap: (paneIdA: string, paneIdB: string) => void;
  onLabelChange: (paneId: string, label: string) => void;
  onClose: () => void;
}

/**
 * 自定义布局卡片骨架：按 `panes` 顺序渲染彩色方块，并露出「交换位置」入口。
 *
 * 本步只负责骨架与顺序（方块数量 = 窗格数、顺序 = `panes` 顺序、颜色 = `paneColor(colorIndex)`）。
 * 拖拽排序 / 交换模式 / 双击标注等交互由 D2 接入，`onMove` / `onSwap` / `onLabelChange` / `onClose`
 * 目前仅作为对外契约保留。
 */
export function TerminalLayoutCard({ panes }: TerminalLayoutCardProps) {
  return (
    <div className="adl-layout-card">
      <div className="adl-layout-card__grid">
        {panes.map((pane) => (
          <div
            key={pane.id}
            className="adl-layout-card__square"
            style={{ background: paneColor(pane.colorIndex) }}
          >
            {pane.label}
          </div>
        ))}
      </div>
      <div className="adl-layout-card__actions">
        <button type="button" className="adl-layout-card__swap-toggle">
          交换位置
        </button>
      </div>
    </div>
  );
}
