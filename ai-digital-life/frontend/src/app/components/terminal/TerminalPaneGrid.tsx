// src/app/components/terminal/TerminalPaneGrid.tsx
import type { ReactNode } from 'react';
import type { TerminalPane } from '@stores/slices/terminalSliceTypes';

interface TerminalPaneGridProps {
  panes: TerminalPane[];
  activePaneId?: string;
  maximizedPaneId: string | null;
  onActivate: (paneId: string) => void;
  onClose: (paneId: string) => void;
  onToggleMaximize: (paneId: string) => void;
  renderPane: (pane: TerminalPane) => ReactNode;
}

/**
 * 终端窗格容器：批次 B 采用纵向单列平铺（`flex-direction: column`），每个窗格均分高度。
 *
 * 最大化时只渲染目标窗格（其余窗格不挂载 xterm，但其 pool 缓冲仍保留）。
 * 每个窗格的动作（清空 / 最大化·还原 / 关闭）由 `TerminalPaneView` 自身的叠加层消费，
 * 故本容器只负责布局、最大化过滤与「点按即激活」；`onClose` / `onToggleMaximize` 保留在
 * 接口中供渲染方使用，容器本身不重复挂载入口（避免与终端双击选词冲突）。
 */
export function TerminalPaneGrid({
  panes,
  activePaneId,
  maximizedPaneId,
  onActivate,
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
          onPointerDown={() => onActivate(pane.id)}
        >
          {renderPane(pane)}
        </div>
      ))}
    </div>
  );
}
