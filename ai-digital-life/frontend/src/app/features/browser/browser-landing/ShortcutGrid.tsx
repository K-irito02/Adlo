import { useCallback, useState, useMemo } from 'react';
import { useAppStore } from '../../../stores/slicedStore';
import { useShallow } from 'zustand/react/shallow';
import type { ShortcutSite } from '../../../stores/slices/browserSlice';
import { ShortcutCard } from './ShortcutCard';
import './ShortcutGrid.css';

interface ShortcutGridProps {
  t: Record<string, string>;
  onOpenUrl: (url: string) => void;
  onAddClick: () => void;
  onContextMenu: (e: React.MouseEvent, site: ShortcutSite) => void;
}

export function ShortcutGrid({ t, onOpenUrl, onAddClick, onContextMenu }: ShortcutGridProps) {
  const { browserShortcuts, browserReorderShortcuts } = useAppStore(
    useShallow((state) => ({
      browserShortcuts: state.browserShortcuts,
      browserReorderShortcuts: state.browserReorderShortcuts,
    }))
  );

  const [dragOverId, setDragOverId] = useState<string | null>(null);

  const sortedShortcuts = useMemo(
    () => [...browserShortcuts].sort((a, b) => a.sortOrder - b.sortOrder),
    [browserShortcuts]
  );

  const handleDragStart = useCallback((e: React.DragEvent, id: string) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', id);
  }, []);

  const handleDragOver = useCallback((_e: React.DragEvent, id: string) => {
    setDragOverId(id);
  }, []);

  const handleDragEnd = useCallback(() => {
    setDragOverId(null);
  }, []);

  const handleDrop = useCallback(
    (_e: React.DragEvent, targetId: string) => {
      setDragOverId(null);
      const draggedId = _e.dataTransfer.getData('text/plain');
      if (!draggedId || draggedId === targetId) {
        return;
      }

      const ids = sortedShortcuts.map((s) => s.id);
      const fromIdx = ids.indexOf(draggedId);
      const toIdx = ids.indexOf(targetId);
      if (fromIdx === -1 || toIdx === -1) {
        return;
      }

      ids.splice(fromIdx, 1);
      ids.splice(toIdx, 0, draggedId);
      browserReorderShortcuts(ids);
    },
    [sortedShortcuts, browserReorderShortcuts]
  );

  const handleCardClick = useCallback(
    (site: ShortcutSite) => {
      onOpenUrl(site.url);
    },
    [onOpenUrl]
  );

  return (
    <div className="adl-shortcut-grid">
      <div className="adl-shortcut-grid__header">
        <span className="adl-shortcut-grid__title">{t.browserShortcuts}</span>
      </div>
      <div className="adl-shortcut-grid__items">
        {sortedShortcuts.map((site) => (
          <ShortcutCard
            key={site.id}
            site={site}
            _index={site.sortOrder}
            isDragOver={dragOverId === site.id}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
            onDrop={handleDrop}
            onContextMenu={onContextMenu}
            onClick={handleCardClick}
          />
        ))}
        <div className="adl-shortcut-card-wrap">
          <div
            className="adl-shortcut-card__add-placeholder"
            onClick={onAddClick}
            role="button"
            tabIndex={0}
            title={t.browserAddShortcutTitle}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                onAddClick();
              }
            }}
          >
            <span className="adl-shortcut-card__add-icon">+</span>
          </div>
          <span className="adl-shortcut-card__name" title={t.browserAddShortcut}>
            {t.browserAddShortcut}
          </span>
        </div>
      </div>
    </div>
  );
}
