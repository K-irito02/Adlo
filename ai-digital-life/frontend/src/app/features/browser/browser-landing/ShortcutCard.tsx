import { useCallback } from 'react';
import type { ShortcutSite } from '../../../stores/slices/browserSlice';

interface ShortcutCardProps {
  site: ShortcutSite;
  _index: number;
  isDragOver: boolean;
  onDragStart: (e: React.DragEvent, id: string) => void;
  onDragOver: (e: React.DragEvent, id: string) => void;
  onDragEnd: () => void;
  onDrop: (e: React.DragEvent, id: string) => void;
  onContextMenu: (e: React.MouseEvent, site: ShortcutSite) => void;
  onClick: (site: ShortcutSite) => void;
}

export function ShortcutCard({
  site,
  _index,
  isDragOver,
  onDragStart,
  onDragOver,
  onDragEnd,
  onDrop,
  onContextMenu,
  onClick,
}: ShortcutCardProps) {
  const handleDragStart = useCallback(
    (e: React.DragEvent) => {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', site.id);
      onDragStart(e, site.id);
    },
    [site.id, onDragStart]
  );

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      onDragOver(e, site.id);
    },
    [site.id, onDragOver]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      onDrop(e, site.id);
    },
    [site.id, onDrop]
  );

  const handleClick = useCallback(() => onClick(site), [site, onClick]);

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      onContextMenu(e, site);
    },
    [site, onContextMenu]
  );

  return (
    <div className="adl-shortcut-card-wrap">
      <div
        className={`adl-shortcut-card${isDragOver ? ' adl-shortcut-card--drag-over' : ''}`}
        draggable
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={onDragEnd}
        onDrop={handleDrop}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter') handleClick();
        }}
      >
        <div className="adl-shortcut-card__icon">
          {site.icon ? (
            <img src={site.icon} alt="" className="adl-shortcut-card__icon-img" />
          ) : (
            <span className="adl-shortcut-card__icon-placeholder">
              {site.name.charAt(0).toUpperCase()}
            </span>
          )}
        </div>
      </div>
      <span className="adl-shortcut-card__name" title={site.name}>
        {site.name}
      </span>
    </div>
  );
}
