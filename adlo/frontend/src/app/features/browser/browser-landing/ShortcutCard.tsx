import { useCallback, useEffect, memo } from 'react';
import type { ShortcutSite } from '@stores/slices/browserSlice';
import { BrowserFavicon } from '@components/BrowserFavicon';
import { ensureSiteFavicon } from '../faviconSelfHeal';

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

export const ShortcutCard = memo(function ShortcutCard({
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
    [site.id, onDragStart],
  );

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      onDragOver(e, site.id);
    },
    [site.id, onDragOver],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      onDrop(e, site.id);
    },
    [site.id, onDrop],
  );

  const handleClick = useCallback(() => onClick(site), [site, onClick]);

  // 快捷站点不存图标快照：挂载即补抓网站图标（会话节流 + 并发上限），
  // 抓到前/抓不到时才由 BrowserFavicon 显示名称首字母兜底。
  useEffect(() => {
    ensureSiteFavicon(site.url);
  }, [site.url]);

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      onContextMenu(e, site);
    },
    [site, onContextMenu],
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
          if (e.key === 'Enter') {
            handleClick();
          }
        }}
      >
        <div className="adl-shortcut-card__icon">
          <BrowserFavicon
            url={site.url}
            size={24}
            pending="initial"
            snapshot={site.icon || undefined}
            fallbackText={site.name}
          />
        </div>
      </div>
      <span className="adl-shortcut-card__name" title={site.name}>
        {site.name}
      </span>
    </div>
  );
});
