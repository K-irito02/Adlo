// src/app/components/terminal/TerminalPaneGrid.tsx
import type { ReactNode } from 'react';
import type { TerminalPane } from '@stores/slices/terminalSliceTypes';

interface TerminalPaneGridProps {
  panes: TerminalPane[];
  activePaneId?: string;
  maximizedPaneId: string | null;
  renderPane: (pane: TerminalPane) => ReactNode;
}

/**
 * 终端窗格容器：批次 B 采用纵向单列平铺（`flex-direction: column`），每个窗格均分高度。
 *
 * 最大化时只渲染目标窗格（其余窗格不挂载 xterm，但其 pool 缓冲仍保留）。
 * 每个窗格的「点按即激活」与动作（清空 / 最大化·还原 / 关闭）都由 `TerminalPaneView`
 * 自身消费；本容器只负责布局、最大化过滤与活动态标记。
 */
export function TerminalPaneGrid({
  panes,
  activePaneId,
  maximizedPaneId,
  renderPane,
}: TerminalPaneGridProps) {
  const visiblePanes = maximizedPaneId
    ? panes.filter((pane) => pane.id === maximizedPaneId)
    : panes;

  return (
    <div className="adl-terminal-pane-grid">
      {visiblePanes.map((pane) => (
        <div
          key={pane.id}
          className={`adl-terminal-pane${pane.id === activePaneId ? ' is-active' : ''}`}
        >
          {renderPane(pane)}
        </div>
      ))}
    </div>
  );
}
